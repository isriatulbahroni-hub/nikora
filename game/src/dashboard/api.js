import { adminHeaderWeb } from './auth.js';

const MESSAGES = Object.freeze({
  network: 'Tidak bisa menghubungi server. Cek koneksi internet.',
  unauthorized: 'Rahasia tidak cocok dengan EVENT_ROLE_SECRET di server.',
  expired: 'Jam perangkat tidak sinkron dengan server (selisih lebih dari 5 menit). Perbaiki waktu otomatis di HP.',
  not_configured: 'EVENT_ROLE_SECRET belum terpasang di server (atau kurang dari 16 karakter). Pasang di Vercel lalu Redeploy.',
  not_found: 'Endpoint /api/admin/stats belum ada di deploy ini. Redeploy dari versi terbaru.',
  server: 'Server mengalami masalah. Coba lagi sebentar lagi.',
});

/** Mengambil statistik. Mengembalikan { ok:true, data, ms } atau { ok:false, code, message }. */
export async function fetchStats({ secret, now = Date.now(), fetchImpl = (...a) => globalThis.fetch(...a), subtle, url = '/api/admin/stats', clock = () => performance.now() }) {
  const fail = (code) => ({ ok: false, code, message: MESSAGES[code] ?? MESSAGES.server });
  let header;
  try {
    header = await adminHeaderWeb(secret, now, subtle);
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
    return fail(body?.error === 'expired' ? 'expired' : 'unauthorized');
  }
  if (res.status === 503) return fail('not_configured');
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
