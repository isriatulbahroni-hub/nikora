// Fungsi serverless Vercel: POST /api/token { name, world, event } -> { enabled, url, token, id }
import { issueToken } from '../src/token-issuer.js';

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
    return res.status(200).json(await issueToken({
      name: body?.name, world: body?.world, event: body?.event,
      key: typeof body?.key === 'string' ? body.key : undefined,
      deviceId: typeof body?.deviceId === 'string' ? body.deviceId : undefined,
    }));
  } catch (error) {
    console.error('[token]', error);
    return res.status(500).json({ enabled: false });
  }
}
