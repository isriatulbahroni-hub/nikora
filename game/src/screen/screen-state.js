// Mesin status Layar Tancap: logika murni (tanpa jaringan/DOM) agar bisa diuji.
// Seperti Party Room, transport LiveKit tidak punya server otoritatif: aturan "hanya operator yang boleh mengatur layar"
// ditegakkan di tiap klien (cukup untuk prototipe, belum tahan terhadap klien yang dimodifikasi).
// driftSec: selisih yang dibiarkan; seekCooldownMs: jeda minimum antar loncatan (loncat terlalu sering = video tersendat/buffering).
export const SCREEN = Object.freeze({ syncMs: 3000, driftSec: 2.5, seekCooldownMs: 6000, playCooldownMs: 3000, claimTieMs: 1500, maxPos: 86400 });

export const emptyScreen = () => ({ op: null, opAt: 0, src: null, st: 'idle', pos: 0, at: 0 });

const isId = (v) => typeof v === 'string' && v.length > 0 && v.length < 80;
const cleanPos = (v) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), SCREEN.maxPos) : 0);
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const TT_ID = /^\d{8,25}$/;

/** Hanya sumber yang dikenal; semua yang lain ditolak (null). */
export function sanitizeSource(src) {
  if (!src || typeof src !== 'object') return null;
  if (src.type === 'youtube' && YT_ID.test(src.id)) return { type: 'youtube', id: src.id, start: Math.floor(cleanPos(src.start)) };
  if (src.type === 'tiktok' && TT_ID.test(src.id)) return { type: 'tiktok', id: src.id };
  if (src.type === 'file') return { type: 'file', name: typeof src.name === 'string' ? src.name.replace(/[<>\u0000-\u001f]/g, '').slice(0, 60) : 'Video' };
  if (src.type === 'live') return { type: 'live' };
  return null;
}

/** Posisi putar (detik) saat `now` untuk sumber berbasis waktu (YouTube). */
export function positionAt(state, now) {
  if (state.st !== 'playing') return state.pos;
  return cleanPos(state.pos + (now - state.at) / 1000);
}

export function prune(state, present) {
  return state.op && !present.has(state.op) ? emptyScreen() : state;
}

/** Terapkan pesan dari `from` pada waktu terima `now`. Pesan tidak sah dikembalikan apa adanya. */
export function applyMessage(state, from, msg, present, now) {
  if (!isId(from) || !msg || typeof msg !== 'object' || !present.has(from)) return state;
  const isOp = state.op === from;
  switch (msg.k) {
    case 'claim':
      if (state.op === null) return { ...emptyScreen(), op: from, opAt: now };
      // Dua orang mengklaim hampir bersamaan: id lebih kecil menang (semua klien memutuskan sama).
      if (from < state.op && now - state.opAt < SCREEN.claimTieMs) return { ...emptyScreen(), op: from, opAt: now };
      return state;
    case 'release':
      return isOp ? emptyScreen() : state;
    case 'stop':
      return isOp ? { ...state, src: null, st: 'idle', pos: 0, at: now } : state;
    case 'load': {
      const src = sanitizeSource(msg.src);
      if (!isOp || !src) return state;
      const st = src.type === 'live' ? 'live' : 'playing';
      return { ...state, src, st, pos: src.type === 'youtube' ? src.start : 0, at: now };
    }
    case 'play':
      return isOp && state.src ? { ...state, st: state.src.type === 'live' ? 'live' : 'playing', pos: cleanPos(msg.pos), at: now } : state;
    case 'pause':
      return isOp && state.src && state.st === 'playing' ? { ...state, st: 'paused', pos: cleanPos(msg.pos), at: now } : state;
    case 'seek':
      return isOp && state.src ? { ...state, pos: cleanPos(msg.pos), at: now } : state;
    case 'sync': {
      // Siaran berkala operator, juga untuk tamu yang baru masuk.
      if (state.op !== null && !isOp) return state;
      const src = msg.src === null ? null : sanitizeSource(msg.src);
      if (msg.src !== null && !src) return state;
      const st = ['idle', 'playing', 'paused', 'live'].includes(msg.st) ? msg.st : 'idle';
      return { op: from, opAt: state.op === from ? state.opAt : now, src, st: src ? st : 'idle', pos: cleanPos(msg.pos), at: now };
    }
    default:
      return state;
  }
}
