// Fungsi serverless Vercel: POST /api/admin/accounts { email, password, kind } -> { ok, id, email, kind }
// kind: 'pemilik' (owner/admin boleh), 'admin' (hanya developer/owner), 'developer' (hanya rahasia induk).
// Perlu SUPABASE_SERVICE_ROLE_KEY di server. Kata sandi tidak dikembalikan dan tidak dicatat.
import { authStatus, authorizeAdmin, createAccount } from '../../src/staff-auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const auth = await authorizeAdmin(req.headers?.authorization);
    if (!auth.ok) {
      if (auth.reason !== 'not_configured') await new Promise((r) => setTimeout(r, 400));
      return res.status(authStatus(auth.reason)).json({ error: auth.reason });
    }
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    const result = await createAccount({ email: body?.email, password: body?.password, kind: body?.kind }, auth);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.status(201).json({ ok: true, id: result.id, email: result.email, kind: result.kind });
  } catch (error) {
    console.error('[admin-accounts]', error?.message);
    return res.status(500).json({ error: 'internal' });
  }
}
