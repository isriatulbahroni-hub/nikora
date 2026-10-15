// Katalog stiker bersama untuk semua dunia (aula ORBIT dan vila NIKORA). Murni: tanpa THREE/DOM.
// Urutan = indeks yang dikirim lewat jaringan, jadi jangan menyisipkan di tengah (tambahkan di akhir).
export const STICKERS = Object.freeze([
  { id: 'love', label: 'Suka', cat: 'Kasih', act: null, glyph: '😍', color: 0xff5c8a, motion: 'pulse', particles: 'hearts', sound: 'pop', face: 'love' },
  { id: 'clap', label: 'Tepuk', cat: 'Perayaan', act: 'clap', glyph: '👏', color: 0xf3d58a, motion: 'shake', particles: 'sparks', sound: 'pop', face: null },
  { id: 'touched', label: 'Terharu', cat: 'Emosi', act: null, glyph: '🥹', color: 0xa8d8ff, motion: 'sway', particles: 'sparks', sound: 'pop', face: 'touched' },
  { id: 'laugh', label: 'Tertawa', cat: 'Emosi', act: 'bow', glyph: '😂', color: 0xffd23f, motion: 'bounce', particles: 'sparks', sound: 'laugh', face: 'laugh' },
  { id: 'party', label: 'Pesta', cat: 'Perayaan', act: 'dance', glyph: '🎉', color: 0xc77dff, motion: 'bounce', particles: 'confetti', sound: 'horn', face: null },
  { id: 'flower', label: 'Bunga', cat: 'Perayaan', act: null, glyph: '💐', color: 0xff9ecb, motion: 'sway', particles: 'petals', sound: 'pop', face: null },
  { id: 'angry', label: 'Marah', cat: 'Emosi', act: null, glyph: '😡', color: 0xff3b30, motion: 'shake', particles: 'smoke', sound: 'growl', face: 'angry' },
  { id: 'cry', label: 'Menangis', cat: 'Emosi', act: null, glyph: '😭', color: 0x4aa8ff, motion: 'droop', particles: 'tears', sound: 'sob', face: 'cry' },
  { id: 'pray', label: 'Doa', cat: 'Hormat', act: 'bow', glyph: '🙏', color: 0xfff1b8, motion: 'sway', particles: 'sparks', sound: 'pop', face: null },
  { id: 'heart', label: 'Hati', cat: 'Kasih', act: null, glyph: '❤️', color: 0xff2d55, motion: 'pulse', particles: 'hearts', sound: 'pop', face: 'love' },
  { id: 'fire', label: 'Api', cat: 'Perayaan', act: null, glyph: '🔥', color: 0xff7a1a, motion: 'shake', particles: 'sparks', sound: 'growl', face: null },
  { id: 'wave', label: 'Lambai', cat: 'Sapaan', act: 'wave', glyph: '👋', color: 0x9be7a5, motion: 'sway', particles: 'sparks', sound: 'pop', face: null },
]);

// Kategori panel (urutan tampil) dan gestur tubuh yang boleh dipaksakan ke avatar saat stiker diputar.
export const CATEGORIES = Object.freeze(['Sapaan', 'Emosi', 'Perayaan', 'Kasih', 'Hormat']);
export const STICKER_ACTS = Object.freeze(['clap', 'wave', 'bow', 'dance']);

// Intensitas efek: pendar, jumlah partikel (pengali), batas efek serentak di layar, ukuran emoji di atas kepala.
export const INTENSITY = Object.freeze({
  normal: Object.freeze({ label: 'Normal', glow: 0.22, particles: 0.6, maxFx: 8, emoji: 0.55 }),
  light: Object.freeze({ label: 'Ringan', glow: 0.1, particles: 0.3, maxFx: 4, emoji: 0.45 }),
  minimal: Object.freeze({ label: 'Minimal', glow: 0, particles: 0, maxFx: 2, emoji: 0.4 }),
});
const INTENSITY_ORDER = ['normal', 'light', 'minimal'];
/** Nama intensitas berikutnya (berputar); nama tak dikenal kembali ke 'normal'. */
export function nextIntensity(name) {
  const i = INTENSITY_ORDER.indexOf(name);
  return INTENSITY_ORDER[(i + 1) % INTENSITY_ORDER.length] ?? 'normal';
}
export const isIntensity = (name) => INTENSITY_ORDER.includes(name);

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
