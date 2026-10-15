// Fungsi serverless Vercel: GET /api/admin/stats (header Authorization: Admin <detik>.<tanda tangan>).
// Dilindungi oleh turunan HMAC dari EVENT_ROLE_SECRET; tanpa rahasia terpasang endpoint ini tertutup (503).
import { collectStats, verifyAdminHeader } from '../../src/admin-stats.js';
import { roleSecret } from '../../src/token-issuer.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const secret = roleSecret(process.env);
  const auth = verifyAdminHeader(secret, req.headers?.authorization, Date.now());
  if (!auth.ok) {
    if (auth.reason !== 'not_configured') await new Promise((r) => setTimeout(r, 400)); // memperlambat tebak-tebakan
    return res.status(auth.reason === 'not_configured' ? 503 : 401).json({ error: auth.reason });
  }
  try {
    return res.status(200).json(await collectStats());
  } catch (error) {
    console.error('[admin-stats]', error?.message);
    return res.status(500).json({ error: 'internal' });
  }
}
