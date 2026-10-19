// Fungsi serverless Vercel: POST /api/admin/login { email, password } -> { token, expiresAt, email, role }
// Masuk dengan akun Supabase milik staf (tabel `staff`). Kata sandi hanya diteruskan ke Supabase Auth: tidak disimpan dan tidak dicatat.
import { authStatus, signInWithPassword, staffFromToken } from '../../src/staff-auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  try {
    const session = await signInWithPassword(body?.email, body?.password);
    if (!session.ok) {
      if (session.error === 'invalid_credentials') await new Promise((r) => setTimeout(r, 400)); // memperlambat tebak-tebakan
      return res.status(authStatus(session.error)).json({ error: session.error });
    }
    const staff = await staffFromToken(session.accessToken);
    if (!staff.ok) return res.status(authStatus(staff.error)).json({ error: staff.error });
    return res.status(200).json({ token: session.accessToken, expiresAt: session.expiresAt, email: staff.email, role: staff.role });
  } catch (error) {
    console.error('[admin-login]', error?.message);
    return res.status(500).json({ error: 'internal' });
  }
}
