// Katalog stiker bersama untuk semua dunia (aula ORBIT dan vila NIKORA). Murni: tanpa THREE/DOM.
// Urutan = indeks yang dikirim lewat jaringan, jadi jangan menyisipkan di tengah (tambahkan di akhir).
export const STICKERS = Object.freeze([
  { id: 'love', glyph: '😍', color: 0xff5c8a, motion: 'pulse', particles: 'hearts', sound: 'pop', face: 'love' },
  { id: 'clap', glyph: '👏', color: 0xf3d58a, motion: 'shake', particles: 'sparks', sound: 'pop', face: null },
  { id: 'touched', glyph: '🥹', color: 0xa8d8ff, motion: 'sway', particles: 'sparks', sound: 'pop', face: 'touched' },
  { id: 'laugh', glyph: '😂', color: 0xffd23f, motion: 'bounce', particles: 'sparks', sound: 'laugh', face: 'laugh' },
  { id: 'party', glyph: '🎉', color: 0xc77dff, motion: 'bounce', particles: 'confetti', sound: 'horn', face: null },
  { id: 'flower', glyph: '💐', color: 0xff9ecb, motion: 'sway', particles: 'petals', sound: 'pop', face: null },
  { id: 'angry', glyph: '😡', color: 0xff3b30, motion: 'shake', particles: 'smoke', sound: 'growl', face: 'angry' },
  { id: 'cry', glyph: '😭', color: 0x4aa8ff, motion: 'droop', particles: 'tears', sound: 'sob', face: 'cry' },
  { id: 'pray', glyph: '🙏', color: 0xfff1b8, motion: 'sway', particles: 'sparks', sound: 'pop', face: null },
  { id: 'heart', glyph: '❤️', color: 0xff2d55, motion: 'pulse', particles: 'hearts', sound: 'pop', face: 'love' },
  { id: 'fire', glyph: '🔥', color: 0xff7a1a, motion: 'shake', particles: 'sparks', sound: 'growl', face: null },
  { id: 'wave', glyph: '👋', color: 0x9be7a5, motion: 'sway', particles: 'sparks', sound: 'pop', face: null },
]);

export const PARTICLE_GLYPHS = Object.freeze({ hearts: '❤️', tears: '💧', confetti: '🎊', petals: '🌸', smoke: '💨', sparks: '✨' });

export const COMBO_WINDOW_MS = 3000; // dua reaksi dalam jeda ini bisa menjadi kombo
export const COMBO_MAX_DISTANCE = 10; // dan avatarnya harus berdekatan (satuan dunia)

const HEARTS = new Set(['love', 'heart']);
const FIRE = new Set(['angry', 'fire']);

/** 'fusion' (hati + hati), 'clash' (api/marah + tangis), atau null. */
export function comboFor(a, b) {
  const x = STICKERS[a]?.id;
  const y = STICKERS[b]?.id;
  if (!x || !y) return null;
  if (HEARTS.has(x) && HEARTS.has(y)) return 'fusion';
  if ((FIRE.has(x) && y === 'cry') || (x === 'cry' && FIRE.has(y))) return 'clash';
  return null;
}

/**
 * Gerak badan avatar selama stiker (k = 0..1). Selalu kembali ke diam di k=0 dan k=1.
 * Hasil: offset tinggi (y), miring depan (rx), miring samping (rz), skala (s).
 */
export function motionAt(motion, k) {
  const t = Math.min(1, Math.max(0, k));
  const env = t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1;
  const out = { y: 0, rx: 0, rz: 0, s: 1 };
  if (motion === 'bounce') out.y = Math.abs(Math.sin(t * Math.PI * 6)) * 0.18 * env;
  else if (motion === 'shake') out.rz = Math.sin(t * 60) * 0.12 * env;
  else if (motion === 'sway') out.rz = Math.sin(t * Math.PI * 4) * 0.1 * env;
  else if (motion === 'pulse') out.s = 1 + 0.08 * Math.sin(t * Math.PI * 8) * env;
  else if (motion === 'droop') out.rx = 0.25 * env;
  return { y: out.y + 0, rx: out.rx + 0, rz: out.rz + 0, s: out.s + 0 }; // + 0 menghilangkan -0
}
