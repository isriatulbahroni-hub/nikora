// Pemformat tampilan (bahasa Indonesia, WIB).
const nf = new Intl.NumberFormat('id-ID');
export const formatNumber = (n) => (Number.isFinite(n) ? nf.format(n) : '—');

export function relativeTime(ts, now = Date.now()) {
  if (!Number.isFinite(ts) || !ts) return '—';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return 'baru saja';
  if (s < 60) return `${s} dtk lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export function formatDate(date, tz = 'Asia/Jakarta') {
  const t = Date.parse(date ?? '');
  if (!Number.isFinite(t)) return '—';
  return new Intl.DateTimeFormat('id-ID', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' }).format(t);
}

export const formatClock = (ts) => (Number.isFinite(ts) ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(ts).replace(/\./g, ':') : '—');
export const formatShortClock = (ts) => (Number.isFinite(ts) ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(ts).replace(/\./g, ':') : '');
export const formatDayMonth = (ms) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' }).format(ms);

export function initials(text) {
  const words = String(text ?? '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}

/** Warna avatar yang stabil per teks (0-359). */
export function hueFrom(text) {
  let h = 0;
  for (const ch of String(text ?? '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}
