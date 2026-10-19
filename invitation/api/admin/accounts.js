// Fungsi serverless Vercel: /api/admin/accounts (GET daftar, POST buat akun, PATCH nonaktifkan/aktifkan atau atur ulang sandi).
// Header: Authorization: Bearer <token sesi Supabase milik admin>. Aturan lengkap ada di src/admin/accounts-core.js.
// Butuh variabel lingkungan SUPABASE_SERVICE_ROLE_KEY (khusus server; jangan diawali VITE_). Tanpa itu endpoint tertutup (503).
import { createAdminService, handleAccounts } from '../../src/admin/accounts-core.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let service;
  try {
    service = createAdminService({
      url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
  } catch (e) {
    return res.status(e.status || 503).json({ error: e.code || 'not_configured', message: e.message });
  }
  const out = await handleAccounts(service, { method: req.method, authorization: req.headers && req.headers.authorization, body: req.body });
  return res.status(out.status).json(out.body);
}
