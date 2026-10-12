// GET /api/video-meta?url=<link TikTok pendek> -> { type:'tiktok', id } (hanya mengikuti pengalihan di domain TikTok)
import { resolveTikTokShort } from '../src/screen/media-resolve.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const url = typeof req.query?.url === 'string' ? req.query.url : '';
  try {
    const found = await resolveTikTokShort(url);
    return found ? res.status(200).json(found) : res.status(404).json({ error: 'tidak ditemukan' });
  } catch {
    return res.status(502).json({ error: 'gagal menghubungi TikTok' });
  }
}
