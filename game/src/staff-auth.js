// Akun staf untuk dasbor admin: masuk dengan email + kata sandi Supabase, peran dibaca dari tabel `staff`.
// Semua pemeriksaan terjadi di server. Rahasia induk (EVENT_ROLE_SECRET) tetap diterima sebagai jalur developer/cadangan,
// termasuk untuk membuat akun developer pertama (tabel `staff` masih kosong).
import { verifyAdminHeader } from './admin-stats.js';
import { readEnv, roleSecret } from './token-issuer.js';

export const STAFF_ROLES = Object.freeze(['owner', 'admin']);
/** pemilik = pengguna biasa (masuk Studio); admin = staf; developer = staf dengan peran owner. */
export const ACCOUNT_KINDS = Object.freeze(['pemilik', 'admin', 'developer']);
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72; // batas bcrypt di Supabase Auth

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const normalizeEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
export const validEmail = (v) => v.length > 0 && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function supabaseConfig(env = process.env) {
  return {
    url: (readEnv(env, 'SUPABASE_URL') || readEnv(env, 'VITE_SUPABASE_URL')).replace(/\/+$/, ''),
    anon: readEnv(env, 'SUPABASE_ANON_KEY') || readEnv(env, 'VITE_SUPABASE_ANON_KEY'),
    service: readEnv(env, 'SUPABASE_SERVICE_ROLE_KEY'),
  };
}

/** Status HTTP untuk alasan penolakan. */
export const authStatus = (reason) => ({ not_configured: 503, service_key_missing: 503, not_staff: 403, forbidden: 403, rate_limited: 429, network: 502, upstream: 502 }[reason] ?? 401);

async function request(fetchImpl, url, { method = 'GET', headers = {}, body } = {}) {
  let res;
  try {
    res = await fetchImpl(url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    return { status: 0, data: null };
  }
  let data = null;
  try {
    data = res.status === 204 ? null : await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

const defaultFetch = (...a) => globalThis.fetch(...a);

/** Masuk dengan email + kata sandi lewat Supabase Auth. Hanya access token yang dikembalikan; kata sandi tidak disimpan. */
export async function signInWithPassword(email, password, { env = process.env, fetchImpl = defaultFetch, now = Date.now() } = {}) {
  const { url, anon } = supabaseConfig(env);
  if (!url || !anon) return { ok: false, error: 'not_configured' };
  const mail = normalizeEmail(email);
  if (!validEmail(mail) || typeof password !== 'string' || !password || password.length > 256) return { ok: false, error: 'invalid_credentials' };
  const r = await request(fetchImpl, `${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon }, body: { email: mail, password } });
  if (r.status === 0) return { ok: false, error: 'network' };
  if (r.status === 429) return { ok: false, error: 'rate_limited' };
  if (r.status >= 500) return { ok: false, error: 'upstream' };
  if (r.status !== 200 || typeof r.data?.access_token !== 'string') return { ok: false, error: 'invalid_credentials' };
  const abs = Number(r.data.expires_at);
  const expiresAt = abs > 0 ? abs * 1000 : now + (Number(r.data.expires_in) || 3600) * 1000;
  return { ok: true, accessToken: r.data.access_token, expiresAt };
}

/**
 * Periksa token Supabase milik staf aktif. Pengguna diverifikasi ke Supabase Auth; perannya dibaca dari tabel `staff`
 * (dengan kunci service bila ada, jika tidak dengan token pengguna sendiri: RLS mengizinkan membaca barisnya sendiri).
 */
export async function staffFromToken(token, { env = process.env, fetchImpl = defaultFetch } = {}) {
  const { url, anon, service } = supabaseConfig(env);
  if (!url || !anon) return { ok: false, error: 'not_configured' };
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) return { ok: false, error: 'unauthorized' };
  const user = await request(fetchImpl, `${url}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${token}` } });
  if (user.status === 0) return { ok: false, error: 'network' };
  if (user.status >= 500) return { ok: false, error: 'upstream' };
  if (user.status !== 200 || typeof user.data?.id !== 'string' || !UUID.test(user.data.id)) return { ok: false, error: 'unauthorized' };
  const staff = await request(fetchImpl, `${url}/rest/v1/staff?select=role,permissions,active&user_id=eq.${user.data.id}&limit=1`, {
    headers: { apikey: service || anon, authorization: `Bearer ${service || token}` },
  });
  if (staff.status === 0) return { ok: false, error: 'network' };
  if (staff.status !== 200 || !Array.isArray(staff.data)) return { ok: false, error: 'upstream' };
  const row = staff.data[0];
  if (!row || row.active !== true || !STAFF_ROLES.includes(row.role)) return { ok: false, error: 'not_staff' };
  return {
    ok: true,
    userId: user.data.id,
    email: typeof user.data.email === 'string' ? user.data.email : '',
    role: row.role,
    permissions: Array.isArray(row.permissions) ? row.permissions.filter((p) => typeof p === 'string') : [],
  };
}

/**
 * Siapa yang memanggil? "Bearer <token Supabase>" = akun staf; "Admin <detik>.<tanda tangan>" = rahasia induk (developer).
 * Hasil: { ok:true, via:'staff'|'secret', userId, email, role:'owner'|'admin', permissions } atau { ok:false, reason }.
 */
export async function authorizeAdmin(header, { env = process.env, now = Date.now(), fetchImpl = defaultFetch } = {}) {
  if (typeof header === 'string' && /^Bearer\s/i.test(header)) {
    const r = await staffFromToken(header.replace(/^Bearer\s+/i, '').trim(), { env, fetchImpl });
    return r.ok ? { ok: true, via: 'staff', userId: r.userId, email: r.email, role: r.role, permissions: r.permissions } : { ok: false, reason: r.error };
  }
  const v = verifyAdminHeader(roleSecret(env), header, now);
  return v.ok ? { ok: true, via: 'secret', userId: null, email: null, role: 'owner', permissions: [] } : { ok: false, reason: v.reason };
}

/** pemilik: owner/admin; admin: hanya owner; developer: hanya rahasia induk. */
const canCreate = (actor, kind) => {
  if (!actor?.ok) return false;
  if (kind === 'pemilik') return actor.role === 'owner' || actor.role === 'admin';
  if (kind === 'admin') return actor.role === 'owner';
  return actor.via === 'secret';
};

const fail = (status, error) => ({ ok: false, status, error });
const AUDIT_ACTION = { pemilik: 'buat_akun', admin: 'buat_admin', developer: 'buat_developer' };

/** Buat akun lewat Supabase Admin API (butuh SUPABASE_SERVICE_ROLE_KEY). Email langsung terkonfirmasi; sandi awal diberikan admin. */
export async function createAccount(input, actor, { env = process.env, fetchImpl = defaultFetch } = {}) {
  const kind = input?.kind ?? 'pemilik';
  if (!ACCOUNT_KINDS.includes(kind)) return fail(400, 'invalid_kind');
  if (!canCreate(actor, kind)) return fail(403, 'forbidden');
  const email = normalizeEmail(input?.email);
  const password = input?.password;
  if (!validEmail(email)) return fail(400, 'invalid_email');
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) return fail(400, 'weak_password');
  const { url, service } = supabaseConfig(env);
  if (!url || !service) return fail(503, 'service_key_missing');
  const auth = { apikey: service, authorization: `Bearer ${service}` };

  const created = await request(fetchImpl, `${url}/auth/v1/admin/users`, { method: 'POST', headers: auth, body: { email, password, email_confirm: true } });
  if (created.status === 0) return fail(502, 'network');
  if (created.status !== 200 && created.status !== 201) {
    const msg = String(created.data?.msg ?? created.data?.message ?? '');
    if (created.data?.error_code === 'weak_password') return fail(400, 'weak_password');
    if (created.data?.error_code === 'email_exists' || /already|exist|registered/i.test(msg)) return fail(409, 'email_exists');
    return created.status >= 500 ? fail(502, 'upstream') : fail(400, 'rejected');
  }
  const id = created.data?.id;
  if (typeof id !== 'string' || !UUID.test(id)) return fail(502, 'upstream');

  if (kind !== 'pemilik') {
    const staff = await request(fetchImpl, `${url}/rest/v1/staff`, {
      method: 'POST',
      headers: { ...auth, prefer: 'return=minimal' },
      body: { user_id: id, role: kind === 'developer' ? 'owner' : 'admin', permissions: [], active: true, created_by: actor.userId ?? null },
    });
    if (staff.status !== 201 && staff.status !== 204) {
      await request(fetchImpl, `${url}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: auth }); // batalkan: jangan tinggalkan akun tanpa peran
      return fail(502, 'staff_insert_failed');
    }
  }

  // Jejak audit: upaya terbaik, tidak menggagalkan pembuatan akun. Kata sandi tidak pernah dicatat.
  await request(fetchImpl, `${url}/rest/v1/audit_logs`, {
    method: 'POST',
    headers: { ...auth, prefer: 'return=minimal' },
    body: { actor_id: actor.userId ?? null, actor_email: actor.email ?? (actor.via === 'secret' ? 'rahasia-induk' : null), action: AUDIT_ACTION[kind], target_type: 'user', target_id: id, detail: { email, kind } },
  });
  return { ok: true, status: 201, id, email, kind };
}
