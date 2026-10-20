// Fungsi serverless Vercel: POST /api/moderate { modToken, text } -> { ok } | { ok:false, action:'warn'|'ban'|'block', message }
import { RoomServiceClient } from 'livekit-server-sdk';
import { handleModeration } from '../src/moderation-server.js';
import { LIVEKIT_VARS, readEnv } from '../src/token-issuer.js';

/** Fungsi pengeluar peserta dari ruang LiveKit; null bila LiveKit belum dikonfigurasi. */
function roomRemover(env = process.env) {
  const [url, key, secret] = LIVEKIT_VARS.map((name) => readEnv(env, name));
  if (!url || !key || !secret) return null;
  const httpUrl = url.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
  const client = new RoomServiceClient(httpUrl, key, secret);
  return (room, identity) => client.removeParticipant(room, identity);
}

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
    const { status, json } = await handleModeration({ body, remove: roomRemover() ?? undefined });
    return res.status(status).json(json);
  } catch (error) {
    console.error('[moderate]', error);
    return res.status(500).json({ ok: false, action: 'block', message: 'Pesan ditahan sementara. Coba lagi sebentar.' }); // tahan pesan, tanpa strike
  }
}
