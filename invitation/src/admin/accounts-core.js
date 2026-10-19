// Pengelolaan akun oleh admin (sisi server). Logika murni dengan fetch yang bisa disuntikkan, supaya dites tanpa jaringan.
// Dipakai oleh fungsi serverless invitation/api/admin/accounts.js. Kunci service role TIDAK PERNAH dikirim ke browser.
//
// Aturan:
//  * Pemanggil harus membawa token sesi Supabase yang sah DAN punya baris aktif di tabel `staff` (admin atau owner).
//  * Admin boleh membuat dan mengelola akun klien. Hanya owner yang boleh membuat admin atau mengubah akun admin.
//  * Akun owner tidak bisa diubah orang lain. Tidak ada yang bisa menonaktifkan dirinya sendiri.
//  * Setiap perubahan dicatat di audit_logs.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72; // batas bcrypt
const BAN_FOREVER = '876000h';

export class AdminError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Pesan galat Supabase -> galat yang aman ditampilkan ke admin. */
function upstreamError(status, data) {
  const code = String((data && (data.error_code || data.code)) || '');
  const msg = String((data && (data.msg || data.message || data.error_description)) || '').toLowerCase();
  if (code === 'email_exists' || msg.includes('already been registered') || msg.includes('already registered')) {
    return new AdminError(409, 'email_exists', 'Email ini sudah terdaftar.');
  }
  if (code === 'weak_password' || msg.includes('password')) return new AdminError(400, 'weak_password', 'Kata sandi ditolak: terlalu lemah atau pendek.');
  if (status === 404) return new AdminError(404, 'not_found', 'Akun tidak ditemukan.');
  return new AdminError(502, 'upstream', `Permintaan ke database gagal (${status}).`);
}

export function createAdminService({ url, serviceKey, anonKey, fetchImpl = globalThis.fetch, now = () => Date.now(), onError = (e) => console.error('[admin-accounts]', e && e.message) }) {
  if (!url || !serviceKey) throw new AdminError(503, 'not_configured', 'Layanan admin belum dikonfigurasi di server.');
  const base = String(url).replace(/\/+$/, '');
  const svc = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const isBanned = (u) => Boolean(u && u.banned_until && Date.parse(u.banned_until) > now());

  async function call(path, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetchImpl(`${base}${path}`, { method, headers: { ...svc, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw upstreamError(res.status, data);
    return data;
  }

  /** Token sesi -> { id, email, role }. Menolak yang bukan staf aktif. */
  async function authenticate(authorization) {
    const m = /^Bearer\s+(\S+)$/i.exec(String(authorization || ''));
    if (!m) throw new AdminError(401, 'unauthenticated', 'Silakan masuk dulu.');
    const res = await fetchImpl(`${base}/auth/v1/user`, { headers: { apikey: anonKey || serviceKey, Authorization: `Bearer ${m[1]}` } });
    const user = res.ok ? await res.json().catch(() => null) : null;
    if (!user || !user.id || isBanned(user)) throw new AdminError(401, 'unauthenticated', 'Sesi tidak valid. Silakan masuk lagi.');
    const role = await staffRoleOf(user.id);
    if (role !== 'admin' && role !== 'owner') throw new AdminError(403, 'forbidden', 'Hanya admin yang boleh melakukan ini.');
    return { id: user.id, email: user.email || '', role };
  }

  async function staffRoleOf(id) {
    if (!UUID.test(String(id))) return null;
    const rows = await call(`/rest/v1/staff?user_id=eq.${id}&active=eq.true&select=role&limit=1`);
    return Array.isArray(rows) && rows[0] ? rows[0].role : null;
  }

  async function audit(actor, action, targetId, detail = {}) {
    try {
      await call('/rest/v1/audit_logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: { actor_id: actor.id, actor_email: actor.email, action, target_type: 'user', target_id: targetId, detail } });
    } catch (e) { onError(e); } // jejak audit gagal tidak membatalkan tindakan yang sudah berhasil, tetapi dilaporkan
  }

  /** Semua akun beserta peran, jumlah undangan, dan status aktif. */
  async function listAccounts() {
    const [users, staff, invitations] = await Promise.all([
      call('/auth/v1/admin/users?page=1&per_page=200'),
      call('/rest/v1/staff?select=user_id,role,active'),
      call('/rest/v1/invitations?select=owner_id&owner_id=not.is.null&limit=5000'),
    ]);
    const roleOf = new Map((staff || []).filter((s) => s.active).map((s) => [s.user_id, s.role]));
    const count = new Map();
    for (const r of invitations || []) count.set(r.owner_id, (count.get(r.owner_id) || 0) + 1);
    return ((users && users.users) || [])
      .map((u) => ({ id: u.id, email: u.email || '', createdAt: u.created_at || null, lastSignInAt: u.last_sign_in_at || null, active: !isBanned(u), role: roleOf.get(u.id) || 'klien', invitations: count.get(u.id) || 0 }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async function createAccount(actor, { email, password, makeAdmin = false } = {}) {
    const mail = String(email || '').trim().toLowerCase();
    if (!EMAIL.test(mail) || mail.length > 254) throw new AdminError(400, 'bad_email', 'Email tidak valid.');
    if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      throw new AdminError(400, 'bad_password', `Kata sandi harus ${MIN_PASSWORD}-${MAX_PASSWORD} karakter.`);
    }
    if (makeAdmin && actor.role !== 'owner') throw new AdminError(403, 'forbidden', 'Hanya pemilik platform yang boleh membuat admin.');
    const user = await call('/auth/v1/admin/users', { method: 'POST', body: { email: mail, password, email_confirm: true } });
    if (makeAdmin) {
      try {
        await call('/rest/v1/staff', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: { user_id: user.id, role: 'admin', created_by: actor.id } });
      } catch (e) {
        // Jangan tinggalkan akun setengah jadi: batalkan akun yang baru dibuat.
        await call(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }).catch(onError);
        throw e;
      }
    }
    await audit(actor, makeAdmin ? 'akun_admin_dibuat' : 'akun_dibuat', user.id, { email: mail });
    return { id: user.id, email: mail, role: makeAdmin ? 'admin' : 'klien' };
  }

  /** Admin hanya boleh mengubah klien; owner boleh mengubah admin; akun owner hanya oleh dirinya sendiri. */
  async function guardTarget(actor, targetId) {
    if (!UUID.test(String(targetId || ''))) throw new AdminError(400, 'bad_id', 'Akun tidak valid.');
    const role = await staffRoleOf(targetId);
    if (role === 'owner' && targetId !== actor.id) throw new AdminError(403, 'forbidden', 'Akun pemilik platform tidak bisa diubah dari sini.');
    if (role === 'admin' && actor.role !== 'owner' && targetId !== actor.id) throw new AdminError(403, 'forbidden', 'Hanya pemilik platform yang boleh mengubah akun admin.');
  }

  async function setActive(actor, targetId, active) {
    if (!active && targetId === actor.id) throw new AdminError(400, 'self', 'Kamu tidak bisa menonaktifkan akunmu sendiri.');
    await guardTarget(actor, targetId);
    await call(`/auth/v1/admin/users/${targetId}`, { method: 'PUT', body: { ban_duration: active ? 'none' : BAN_FOREVER } });
    await audit(actor, active ? 'akun_diaktifkan' : 'akun_dinonaktifkan', targetId);
  }

  async function setPassword(actor, targetId, password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      throw new AdminError(400, 'bad_password', `Kata sandi harus ${MIN_PASSWORD}-${MAX_PASSWORD} karakter.`);
    }
    await guardTarget(actor, targetId);
    await call(`/auth/v1/admin/users/${targetId}`, { method: 'PUT', body: { password } });
    await audit(actor, 'sandi_diatur_ulang', targetId);
  }

  return { authenticate, listAccounts, createAccount, setActive, setPassword };
}

/** Satu pintu untuk fungsi serverless: metode HTTP -> tindakan. Selalu mengembalikan { status, body }. */
export async function handleAccounts(service, { method, authorization, body, onError = (e) => console.error('[admin-accounts]', e && e.message) }) {
  try {
    const actor = await service.authenticate(authorization);
    const b = body && typeof body === 'object' ? body : {};
    if (method === 'GET') return { status: 200, body: { me: actor, accounts: await service.listAccounts() } };
    if (method === 'POST') return { status: 201, body: { account: await service.createAccount(actor, b) } };
    if (method === 'PATCH') {
      if (typeof b.active === 'boolean') await service.setActive(actor, b.id, b.active);
      else if (typeof b.password === 'string') await service.setPassword(actor, b.id, b.password);
      else throw new AdminError(400, 'bad_request', 'Permintaan tidak dikenal.');
      return { status: 200, body: { ok: true } };
    }
    return { status: 405, body: { error: 'method_not_allowed', message: 'Metode tidak didukung.' } };
  } catch (e) {
    if (e instanceof AdminError) return { status: e.status, body: { error: e.code, message: e.message } };
    onError(e);
    return { status: 500, body: { error: 'internal', message: 'Terjadi kesalahan di server.' } };
  }
}
