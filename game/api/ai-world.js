// Fungsi serverless Vercel: POST /api/ai-world { prompt } + Authorization: Bearer <token sesi Supabase> -> { project, warnings, dropped, stats, meta }
// Variabel lingkungan: ANTHROPIC_API_KEY (wajib), SUPABASE_URL/SUPABASE_ANON_KEY (atau VITE_*), opsional AI_WORLD_MODEL,
// AI_WORLD_PER_HOUR (bawaan 5), AI_WORLD_DAILY_CAP (bawaan 100), AI_WORLD_DISABLED=1 (saklar mati).
import { createAiWorldHandler } from '../src/ai-world-server.js';

export const config = { maxDuration: 60 };

const handle = createAiWorldHandler();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  try {
    const r = await handle({ method: req.method, authorization: req.headers?.authorization, body });
    for (const [k, v] of Object.entries(r.headers ?? {})) res.setHeader(k, v);
    return res.status(r.status).json(r.json);
  } catch (error) {
    console.error('[ai-world]', error?.message);
    return res.status(500).json({ error: 'server' });
  }
}
