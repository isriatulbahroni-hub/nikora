// Pembaca link video. Hanya mengenali YouTube dan TikTok; video diputar lewat pemutar resmi (embed) mereka,
// tidak pernah diunduh atau disalin ulang.
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const TT_ID = /^\d{8,25}$/;
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
export const TIKTOK_SHORT_HOSTS = new Set(['vm.tiktok.com', 'vt.tiktok.com']);

const toUrl = (input) => {
  const text = String(input ?? '').trim();
  if (!text || text.length > 300) return null;
  try {
    return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
};

/** Detik awal dari ?t=90, ?t=1m30s, ?start=90. */
function startSeconds(u) {
  const raw = u.searchParams.get('t') ?? u.searchParams.get('start') ?? '';
  if (/^\d+$/.test(raw)) return Math.min(Number(raw), 86400);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!raw || !m) return 0;
  return Math.min((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0), 86400);
}

/**
 * -> { type:'youtube', id, start } | { type:'tiktok', id } | { type:'tiktok-short', url } | null
 * Link TikTok pendek (vm./vt.) harus di-resolve dulu ke ID lewat server (lihat resolveTikTokShort).
 */
export function parseMediaLink(input) {
  const u = toUrl(input);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    return YT_ID.test(parts[0] ?? '') ? { type: 'youtube', id: parts[0], start: startSeconds(u) } : null;
  }
  if (YT_HOSTS.has(host)) {
    let id = null;
    if (parts[0] === 'watch') id = u.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1];
    return id && YT_ID.test(id) ? { type: 'youtube', id, start: startSeconds(u) } : null;
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    if (TIKTOK_SHORT_HOSTS.has(host)) return parts[0] ? { type: 'tiktok-short', url: `https://${host}/${parts[0]}/` } : null;
    const at = parts.indexOf('video');
    if (at !== -1 && TT_ID.test(parts[at + 1] ?? '')) return { type: 'tiktok', id: parts[at + 1] };
    if (parts[0] === 't' && parts[1]) return { type: 'tiktok-short', url: `https://www.tiktok.com/t/${parts[1]}/` };
    return null;
  }
  return null;
}

/** Alamat pemutar embed resmi. */
export function embedUrl(src) {
  if (src?.type === 'youtube' && YT_ID.test(src.id)) {
    const q = new URLSearchParams({ autoplay: '1', controls: '0', playsinline: '1', rel: '0', modestbranding: '1', enablejsapi: '1', start: String(src.start || 0) });
    return `https://www.youtube-nocookie.com/embed/${src.id}?${q}`;
  }
  if (src?.type === 'tiktok' && TT_ID.test(src.id)) {
    const q = new URLSearchParams({ autoplay: '1', loop: '1', music_info: '0', description: '0', rel: '0', controls: '0' });
    return `https://www.tiktok.com/player/v1/${src.id}?${q}`;
  }
  return null;
}

/**
 * Ikuti pengalihan link pendek TikTok ke ID video. Hanya host TikTok yang diizinkan (cegah SSRF).
 * Dipakai oleh api/video-meta.js di server.
 */
export async function resolveTikTokShort(url, fetchImpl = (...a) => globalThis.fetch(...a)) {
  let current = toUrl(url);
  for (let hop = 0; hop < 4 && current; hop++) {
    const host = current.hostname.toLowerCase();
    if (host !== 'tiktok.com' && !host.endsWith('.tiktok.com')) return null;
    const direct = parseMediaLink(current.toString());
    if (direct?.type === 'tiktok') return direct;
    const res = await fetchImpl(current.toString(), { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; OrbitBot/1.0)' } });
    const next = res.headers?.get?.('location');
    if (!next) return null;
    current = toUrl(new URL(next, current).toString());
  }
  return null;
}
