// Fungsi serverless Vercel: POST /api/moderation-admin { event, key, op, ... } (hanya pemilik acara)
import { handleAdmin } from '../src/moderation-admin.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  try {
    const { status, json } = await handleAdmin({ body });
    return res.status(status).json(json);
  } catch (error) {
    console.error('[moderation-admin]', error);
    return res.status(500).json({ ok: false, error: 'gagal' });
  }
}
