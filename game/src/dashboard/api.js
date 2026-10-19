import { adminHeaderWeb } from './auth.js';

const MESSAGES = Object.freeze({
  network: 'Tidak bisa menghubungi server. Cek koneksi internet.',
  unauthorized: 'Rahasia tidak cocok dengan EVENT_ROLE_SECRET di server.',
  expired: 'Jam perangkat tidak sinkron dengan server (selisih lebih dari 5 menit). Perbaiki waktu otomatis di HP.',
  not_configured: 'EVENT_ROLE_SECRET belum terpasang di server (atau kurang dari 16 karakter). Pasang di Vercel lalu Redeploy.',
  not_found: 'Endpoint admin belum ada di deploy ini. Redeploy dari versi terbaru.',
  server: 'Server mengalami masalah. Coba lagi sebentar lagi.',
  session_expired: 'Sesi berakhir. Masuk lagi.',
  not_staff: 'Akun ini bukan staf aktif. Minta developer menambahkannya.',
  forbidden: 'Peran akunmu tidak boleh membuat jenis akun itu.',
  invalid_credentials: 'Email atau kata sandi salah.',
  rate_limited: 'Terlalu banyak percobaan. Coba lagi sebentar.',
  staff_not_configured: 'Supabase belum terpasang di server (SUPABASE_URL dan SUPABASE_ANON_KEY). Pasang di Vercel lalu Redeploy.',
  upstream: 'Supabase tidak merespons. Coba lagi sebentar.',
  email_exists: 'Email ini sudah terdaftar.',
  weak_password: 'Kata sandi harus 8 sampai 72 karakter.',
  invalid_email: 'Alamat email tidak valid.',
  invalid_kind: 'Jenis akun tidak dikenal.',
  service_key_missing: 'SUPABASE_SERVICE_ROLE_KEY belum terpasang di server. Pasang di Vercel lalu Redeploy.',
  staff_insert_failed: 'Akun gagal dijadikan staf, jadi dibatalkan. Coba lagi.',
  rejected: 'Supabase menolak data akun itu.',
});

const fail = (code) => ({ ok: false, code, message: MESSAGES[code] ?? MESSAGES.server });
const STAFF_ROLES = ['owner', 'admin'];

/** Mengambil statistik dengan { secret } (rahasia induk) atau { token } (akun staf). Mengembalikan { ok:true, data, ms } atau { ok:false, code, message }. */
export async function fetchStats({ secret, token, now = Date.now(), fetchImpl = (...a) => globalThis.fetch(...a), subtle, url = '/api/admin/stats', clock = () => performance.now() }) {
  let header;
  try {
    header = token ? `Bearer ${token}` : await adminHeaderWeb(secret, now, subtle);
  } catch (error) {
    return { ok: false, code: 'server', message: String(error?.message ?? error) };
  }
  const t0 = clock();
  let res;
  try {
    res = await fetchImpl(url, { headers: { authorization: header }, cache: 'no-store' });
  } catch {
    return fail('network');
  }
  const ms = Math.round(clock() - t0);
  if (res.status === 401) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* tanpa isi */
    }
    return fail(body?.error === 'expired' ? 'expired' : token ? 'session_expired' : 'unauthorized');
  }
  if (res.status === 403) return fail('not_staff');
  if (res.status === 503) return fail(token ? 'staff_not_configured' : 'not_configured');
  if (res.status === 404) return fail('not_found');
  if (!res.ok) return fail('server');
  try {
    const data = await res.json();
    if (!data || typeof data !== 'object' || !data.system) return fail('server');
    return { ok: true, data, ms };
  } catch {
    return fail('server');
  }
}

async function postJson(url, { headers = {}, body, fetchImpl }) {
  let res;
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), cache: 'no-store' });
  } catch {
    return { code: 'network' };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* tanpa isi */
  }
  return { status: res.status, ok: res.ok, data };
}

/** Alasan dari server -> kode pesan. Server menyebut 503 "not_configured" untuk Supabase (bukan rahasia induk). */
const codeFrom = (r) => {
  const e = r.data?.error;
  if (e === 'not_configured') return 'staff_not_configured';
  if (typeof e === 'string' && MESSAGES[e]) return e;
  return r.status === 404 ? 'not_found' : 'server';
};

/** Masuk dengan akun staf. Sukses: { ok:true, session:{ token, expiresAt, email, role } }. */
export async function loginStaff({ email, password, fetchImpl = (...a) => globalThis.fetch(...a), url = '/api/admin/login' }) {
  const r = await postJson(url, { body: { email, password }, fetchImpl });
  if (r.code) return fail(r.code);
  if (!r.ok) return fail(codeFrom(r));
  const d = r.data;
  if (!d || typeof d.token !== 'string' || !d.token || !STAFF_ROLES.includes(d.role)) return fail('server');
  return { ok: true, session: { token: d.token, expiresAt: Number(d.expiresAt) || Date.now() + 3_600_000, email: String(d.email || email), role: d.role } };
}

/** Buat akun (pemilik/admin/developer). Dikirim dengan { token } (akun staf) atau { secret } (rahasia induk). */
export async function postAccount({ secret, token, email, password, kind, now = Date.now(), fetchImpl = (...a) => globalThis.fetch(...a), subtle, url = '/api/admin/accounts' }) {
  let header;
  try {
    header = token ? `Bearer ${token}` : await adminHeaderWeb(secret, now, subtle);
  } catch (error) {
    return { ok: false, code: 'server', message: String(error?.message ?? error) };
  }
  const r = await postJson(url, { headers: { authorization: header }, body: { email, password, kind }, fetchImpl });
  if (r.code) return fail(r.code);
  if (r.status === 401) return fail(r.data?.error === 'expired' ? 'expired' : token ? 'session_expired' : 'unauthorized');
  if (r.status === 403 && r.data?.error === 'not_staff') return fail('not_staff');
  if (!r.ok) return fail(codeFrom(r));
  return { ok: true, account: { id: String(r.data?.id ?? ''), email: String(r.data?.email ?? email), kind: String(r.data?.kind ?? kind) } };
}
