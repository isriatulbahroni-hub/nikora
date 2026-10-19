// Fungsi serverless Vercel: GET /api/admin/stats
// Akses: akun staf (Authorization: Bearer <token Supabase>) atau rahasia induk (Authorization: Admin <detik>.<tanda tangan>,
// turunan HMAC dari EVENT_ROLE_SECRET). Tanpa keduanya terpasang endpoint ini tertutup (503).
import { collectStats } from '../../src/admin-stats.js';
import { authStatus, authorizeAdmin } from '../../src/staff-auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const auth = await authorizeAdmin(req.headers?.authorization);
  if (!auth.ok) {
    if (auth.reason !== 'not_configured') await new Promise((r) => setTimeout(r, 400)); // memperlambat tebak-tebakan
    return res.status(authStatus(auth.reason)).json({ error: auth.reason });
  }
  try {
    return res.status(200).json(await collectStats());
  } catch (error) {
    console.error('[admin-stats]', error?.message);
    return res.status(500).json({ error: 'internal' });
  }
}
