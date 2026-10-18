// Katalog stiker bersama untuk semua dunia (aula ORBIT dan vila NIKORA). Murni: tanpa THREE/DOM.
// Urutan = indeks yang dikirim lewat jaringan, jadi jangan menyisipkan di tengah (tambahkan di akhir).
// `pose` = nama pose tubuh penuh di avatar-emotes.js (lengan, kepala, badan); `act` = gestur lama untuk model manusia (Michelle).
// `clip` (opsional) = klip Mixamo dari avatar-extra-anims.js untuk model manusia; bila daftar, dipilih acak. Tanpa berkasnya, `act` dipakai.
export const STICKERS = Object.freeze([
  { id: 'love', label: 'Suka', cat: 'Sosial', act: null, pose: 'love', glyph: '😍', color: 0xff5c8a, motion: 'pulse', particles: 'hearts', sound: 'pop', face: 'love' },
  { id: 'clap', label: 'Tepuk', cat: 'Sosial', act: 'clap', clip: 'clap', pose: 'clap', glyph: '👏', color: 0xf3d58a, motion: 'shake', particles: 'sparks', sound: 'pop', face: null },
  { id: 'touched', label: 'Terharu', cat: 'Emosi', act: null, pose: 'touched', glyph: '🥹', color: 0xa8d8ff, motion: 'sway', particles: 'sparks', sound: 'pop', face: 'touched' },
  { id: 'laugh', label: 'Tertawa', cat: 'Emosi', act: 'bow', clip: 'laugh', pose: 'laugh', glyph: '😂', color: 0xffd23f, motion: 'bounce', particles: 'sparks', sound: 'laugh', face: 'laugh' },
  { id: 'party', label: 'Pesta', cat: 'Pesta', act: 'dance', clip: ['macarena', 'hiphop5', 'hiphop9'], pose: 'party', glyph: '🎉', color: 0xc77dff, motion: 'bounce', particles: 'confetti', sound: 'horn', face: null },
  { id: 'flower', label: 'Bunga', cat: 'Majlis', act: null, pose: 'flower', glyph: '💐', color: 0xff9ecb, motion: 'sway', particles: 'petals', sound: 'pop', face: null },
  { id: 'angry', label: 'Marah', cat: 'Emosi', act: null, pose: 'angry', glyph: '😡', color: 0xff3b30, motion: 'shake', particles: 'smoke', sound: 'growl', face: 'angry' },
  { id: 'cry', label: 'Menangis', cat: 'Emosi', act: null, clip: 'cry', pose: 'cry', glyph: '😭', color: 0x4aa8ff, motion: 'droop', particles: 'tears', sound: 'sob', face: 'cry' },
  { id: 'pray', label: 'Doa', cat: 'Hormat', act: 'bow', pose: 'pray', glyph: '🙏', color: 0xfff1b8, motion: 'sway', particles: 'sparks', sound: 'pop', face: null },
  { id: 'heart', label: 'Hati', cat: 'Sosial', act: null, pose: 'heart', glyph: '❤️', color: 0xff2d55, motion: 'pulse', particles: 'hearts', sound: 'pop', face: 'love' },
  { id: 'fire', label: 'Api', cat: 'Pesta', act: null, pose: 'fire', glyph: '🔥', color: 0xff7a1a, motion: 'shake', particles: 'sparks', sound: 'growl', face: null },
  { id: 'wave', label: 'Lambai', cat: 'Sosial', act: 'wave', clip: 'wave', pose: 'wave', glyph: '👋', color: 0x9be7a5, motion: 'sway', particles: 'sparks', sound: 'pop', face: null },
  // ---- ditambahkan: gaya emoji Nikora (30 emote berpose penuh) ----
  { id: 'shock', label: 'Terkejut', cat: 'Emosi', act: null, pose: 'shock', glyph: '😲', color: 0xffd23f, motion: 'shake', particles: 'sparks', sound: 'pop', face: 'shock' },
  { id: 'sad', label: 'Sedih', cat: 'Emosi', act: null, clip: 'sad', pose: 'sad', glyph: '😢', color: 0x7aa7d9, motion: 'sway', particles: 'tears', sound: 'sob', face: 'sad' },
  { id: 'thumbs', label: 'Setuju', cat: 'Sosial', act: null, pose: 'thumbs', glyph: '👍', color: 0xf3d58a, motion: 'bounce', particles: 'sparks', sound: 'pop', face: 'smile' },
  { id: 'handshake', label: 'Bersalaman', cat: 'Sosial', act: null, pose: 'handshake', glyph: '🤝', color: 0x9be7a5, motion: 'sway', particles: 'sparks', sound: 'pop', face: 'smile' },
  { id: 'dance', label: 'Menari', cat: 'Pesta', act: null, clip: ['hiphop1', 'hiphop5', 'hiphop9', 'macarena'], pose: 'dance', glyph: '💃', color: 0xc77dff, motion: 'sway', particles: 'confetti', sound: 'horn', face: 'smile' },
  { id: 'great', label: 'Hebat', cat: 'Pesta', act: null, pose: 'great', glyph: '💯', color: 0xff7a1a, motion: 'bounce', particles: 'sparks', sound: 'pop', face: 'smile' },
  { id: 'awe', label: 'Kagum', cat: 'Pesta', act: null, pose: 'awe', glyph: '🤩', color: 0xffd23f, motion: 'pulse', particles: 'sparks', sound: 'pop', face: 'awe' },
  { id: 'cheer', label: 'Bersorak', cat: 'Pesta', act: null, clip: ['cheer', 'cheer2'], pose: 'cheer', glyph: '🙌', color: 0xc77dff, motion: 'bounce', particles: 'confetti', sound: 'horn', face: 'smile' },
  { id: 'ring', label: 'Cincin', cat: 'Majlis', act: null, pose: 'ring', glyph: '💍', color: 0xa8d8ff, motion: 'pulse', particles: 'sparks', sound: 'coin', face: 'smile' },
  { id: 'gift', label: 'Hadiah', cat: 'Majlis', act: null, pose: 'gift', glyph: '🎁', color: 0xff5c8a, motion: 'sway', particles: 'confetti', sound: 'pop', face: 'smile' },
  { id: 'toast', label: 'Perayaan', cat: 'Majlis', act: null, pose: 'toast', glyph: '🥂', color: 0xf3d58a, motion: 'sway', particles: 'sparks', sound: 'coin', face: 'smile' },
  { id: 'affection', label: 'Kasih sayang', cat: 'Majlis', act: null, pose: 'affection', glyph: '🥰', color: 0xff9ecb, motion: 'pulse', particles: 'hearts', sound: 'pop', face: 'love' },
  { id: 'bow', label: 'Tunduk hormat', cat: 'Hormat', act: null, pose: 'bow', glyph: '🙇', color: 0xfff1b8, motion: 'sway', particles: 'sparks', sound: 'pop', face: null },
  { id: 'calm', label: 'Tenang', cat: 'Hormat', act: null, pose: 'calm', glyph: '😌', color: 0xa8d8ff, motion: 'sway', particles: 'sparks', sound: 'pop', face: 'calm' },
  { id: 'hug', label: 'Pelukan', cat: 'Hormat', act: null, pose: 'hug', glyph: '🤗', color: 0xff9ecb, motion: 'pulse', particles: 'hearts', sound: 'pop', face: 'smile' },
  { id: 'salam', label: 'Salam', cat: 'Animasi', act: null, clip: 'wave2', pose: 'salam', glyph: '🤚', color: 0x9be7a5, motion: 'sway', particles: 'sparks', sound: 'pop', face: 'smile' },
  { id: 'sit', label: 'Duduk', cat: 'Animasi', act: null, pose: 'sit', glyph: '🧘', color: 0xfff1b8, motion: 'sway', particles: 'sparks', sound: 'pop', face: 'calm' },
  { id: 'point', label: 'Tunjuk', cat: 'Animasi', act: null, pose: 'point', glyph: '👉', color: 0xf3d58a, motion: 'bounce', particles: 'sparks', sound: 'pop', face: null },
  { id: 'heartsign', label: 'Salam hati', cat: 'Animasi', act: null, pose: 'heartsign', glyph: '💖', color: 0xff2d55, motion: 'pulse', particles: 'hearts', sound: 'pop', face: 'love' },
  { id: 'selfie', label: 'Selfie', cat: 'Animasi', act: null, pose: 'selfie', glyph: '🤳', color: 0xa8d8ff, motion: 'sway', particles: 'sparks', sound: 'pop', face: 'smile' },
]);

// Kategori panel (urutan tampil, mengikuti gambar sistem avatar & emoji Nikora) dan gestur tubuh yang boleh dipaksakan ke model manusia.
export const CATEGORIES = Object.freeze(['Emosi', 'Sosial', 'Pesta', 'Majlis', 'Hormat', 'Animasi']);
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
