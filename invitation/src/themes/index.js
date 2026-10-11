/**
 * Paket tema. Satu mesin adegan, banyak identitas.
 * Kunci tema = "<jenis_acara>-<variasi>" dan disimpan di kolom invitations.theme.
 * Menambah tema baru cukup menambah satu objek di THEMES (tidak perlu migrasi database).
 */
export const EVENT_TYPES = ['pernikahan', 'khitanan', 'ulang_tahun', 'tazkirah', 'tarannum', 'karaoke', 'komunitas'];

export const EVENT_LABELS = {
  pernikahan: 'Undangan Pernikahan',
  khitanan: 'Undangan Khitanan',
  ulang_tahun: 'Undangan Ulang Tahun',
  tazkirah: 'Undangan Tazkirah',
  tarannum: 'Undangan Tarannum',
  karaoke: 'Undangan Karaoke',
  komunitas: 'Undangan Acara',
};

const LEAD_UMUM =
  'Dengan penuh rasa syukur, kami mengundang Anda untuk menjadi bagian dari sebuah cerita yang akan kami kenang sepanjang hidup.';

export const THEMES = [
  {
    id: 'pernikahan-adat-sasak',
    eventType: 'pernikahan',
    label: 'Adat Sasak',
    mood: 'Hangat, sakral, berakar pada tradisi Lombok',
    fonts: {
      display: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
      body: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
    },
    tokens: {
      bg1: '#2b140d', bg2: '#6b2e14', paper: '#e9d3a6', letter: '#fff8e8', ink: '#3a1a0c',
      accent: '#b3541e', accent2: '#c9a227', glow: '#ffd27a', stageInk: '#fbeed4',
      sealFill: '#8a3a12', sealInk: '#fbeed4',
    },
    envelope: { variant: 'amplop', pattern: 'songket', seal: 'tenun', particles: 'debu' },
    copy: {
      hint: 'Sentuh segel untuk membuka',
      tagline: 'Dengan restu dan doa, sebuah cerita istimewa menantimu.',
      toPrefix: 'Kepada Yth.',
      lead: 'Dengan restu orang tua dan doa keluarga, kami mengundang Anda untuk menyaksikan awal perjalanan kami.',
      openLabel: 'Mulai Perjalanan',
      skipLabel: 'Lewati animasi',
    },
    motion: { speed: 1.1 },
    sfx: { wave: 'triangle', notes: [293.66, 392, 440, 587.33] },
  },
  {
    id: 'pernikahan-islami',
    eventType: 'pernikahan',
    label: 'Islami',
    mood: 'Teduh, khusyuk, geometris',
    fonts: {
      display: "'Amiri','Palatino Linotype',Georgia,serif",
      body: "'Palatino Linotype',Georgia,serif",
    },
    tokens: {
      bg1: '#072b2a', bg2: '#0e4a45', paper: '#dccfa8', letter: '#fffdf6', ink: '#12332f',
      accent: '#0f766e', accent2: '#c8a24a', glow: '#f2d98d', stageInk: '#eaf6f3',
      sealFill: '#0f5f58', sealInk: '#f6f1e4',
    },
    envelope: { variant: 'amplop', pattern: 'geometri', seal: 'bintang8', particles: 'bintang' },
    copy: {
      hint: 'Bismillah, sentuh segel untuk membuka',
      tagline: 'Dengan memohon rahmat dan ridha Allah, kami mengundang Anda.',
      toPrefix: 'Kepada Yth.',
      lead: 'Dengan memohon rahmat dan ridha Allah SWT, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dan mendoakan kami.',
      openLabel: 'Buka Undangan',
      skipLabel: 'Lewati animasi',
    },
    motion: { speed: 1.15 },
    sfx: { wave: 'sine', notes: [261.63, 329.63, 392, 523.25] },
  },
  {
    id: 'pernikahan-taman',
    eventType: 'pernikahan',
    label: 'Taman Bunga',
    mood: 'Romantis, lembut, senja di taman',
    fonts: {
      display: "'Playfair Display','Didot','Bodoni 72',Georgia,serif",
      body: "'Georgia','Times New Roman',serif",
    },
    tokens: {
      bg1: '#2e1a47', bg2: '#9c3f5e', paper: '#f4d4d2', letter: '#ffffff', ink: '#4a1f33',
      accent: '#d46a8a', accent2: '#7aa874', glow: '#ffc2d1', stageInk: '#fff1f4',
      sealFill: '#b23a62', sealInk: '#fff4f1',
    },
    envelope: { variant: 'amplop', pattern: 'bunga', seal: 'lilin', particles: 'kelopak' },
    copy: {
      hint: 'Sentuh segel untuk membuka',
      tagline: 'Sebuah cerita istimewa telah menantimu.',
      toPrefix: 'Untuk',
      lead: LEAD_UMUM,
      openLabel: 'Mulai Perjalanan',
      skipLabel: 'Lewati animasi',
    },
    motion: { speed: 1 },
    sfx: { wave: 'sine', notes: [392, 493.88, 587.33, 783.99] },
  },
  {
    id: 'pernikahan-kerajaan',
    eventType: 'pernikahan',
    label: 'Kerajaan',
    mood: 'Megah, emas, beludru',
    fonts: {
      display: "'Cinzel','Trajan Pro','Times New Roman',serif",
      body: "'Palatino Linotype',Georgia,serif",
    },
    tokens: {
      bg1: '#12051f', bg2: '#4a0e2e', paper: '#d9c28f', letter: '#fbf3df', ink: '#2a1020',
      accent: '#8b1a2b', accent2: '#d4af37', glow: '#ffe08a', stageInk: '#f8ecd0',
      sealFill: '#7d1224', sealInk: '#f8ecd0',
    },
    envelope: { variant: 'amplop', pattern: 'beludru', seal: 'mahkota', particles: 'kilau' },
    copy: {
      hint: 'Sentuh segel kerajaan untuk membuka',
      tagline: 'Dengan hormat, Anda diundang ke sebuah perayaan agung.',
      toPrefix: 'Kepada Yang Terhormat',
      lead: 'Dengan segala hormat, kami mengundang Anda untuk hadir dalam perayaan hari bahagia kami.',
      openLabel: 'Masuki Istana',
      skipLabel: 'Lewati animasi',
    },
    motion: { speed: 1.2 },
    sfx: { wave: 'triangle', notes: [196, 261.63, 329.63, 392] },
  },
  {
    id: 'pernikahan-fantasi',
    eventType: 'pernikahan',
    label: 'Dunia Ajaib',
    mood: 'Langit berbintang, pulau melayang, kunang-kunang',
    fonts: {
      display: "'Cormorant Garamond','Garamond',Georgia,serif",
      body: "'Cormorant Garamond','Garamond',Georgia,serif",
    },
    tokens: {
      bg1: '#0a0f2e', bg2: '#3b2a7a', paper: '#b9bff0', letter: '#f3f4ff', ink: '#1c1f4d',
      accent: '#8f7cf5', accent2: '#7de3f0', glow: '#b9a8ff', stageInk: '#eef0ff',
      sealFill: '#5b46d6', sealInk: '#ffffff',
    },
    envelope: { variant: 'amplop', pattern: 'bintang', seal: 'orb', particles: 'kunang' },
    copy: {
      hint: 'Sentuh cahaya untuk membuka',
      tagline: 'Di antara bintang-bintang, sebuah kisah menantimu.',
      toPrefix: 'Untuk',
      lead: 'Di sebuah dunia yang kami bangun dari doa dan cinta, ada tempat duduk yang disiapkan untuk Anda.',
      openLabel: 'Masuk ke Dunia Kami',
      skipLabel: 'Lewati animasi',
    },
    motion: { speed: 1.2 },
    sfx: { wave: 'sine', notes: [329.63, 440, 659.25, 880] },
  },
  {
    id: 'pernikahan-minimalis',
    eventType: 'pernikahan',
    label: 'Minimalis Modern',
    mood: 'Bersih, tenang, tipografi kuat',
    fonts: {
      display: "'Helvetica Neue','Inter','Segoe UI',Arial,sans-serif",
      body: "'Helvetica Neue','Inter','Segoe UI',Arial,sans-serif",
    },
    tokens: {
      bg1: '#f4f1ec', bg2: '#e1dcd2', paper: '#ffffff', letter: '#fbfaf8', ink: '#1f1f1f',
      accent: '#1f1f1f', accent2: '#9a8f7a', glow: '#ffffff', stageInk: '#2b2b2b',
      sealFill: '#1f1f1f', sealInk: '#ffffff',
    },
    envelope: { variant: 'amplop', pattern: 'polos', seal: 'titik', particles: 'none' },
    copy: {
      hint: 'Ketuk untuk membuka',
      tagline: 'Anda diundang.',
      toPrefix: 'Untuk',
      lead: 'Kami akan sangat senang jika Anda bisa hadir dan berbagi hari ini bersama kami.',
      openLabel: 'Lanjut',
      skipLabel: 'Lewati',
    },
    motion: { speed: 0.85 },
    sfx: { wave: 'sine', notes: [523.25, 783.99] },
  },
  {
    id: 'pernikahan-futuristik',
    eventType: 'pernikahan',
    label: 'Futuristik',
    mood: 'Neon, kaca gelap, amplop holografik',
    fonts: {
      display: "'Orbitron','Eurostile','Segoe UI',Arial,sans-serif",
      body: "'Segoe UI','Helvetica Neue',Arial,sans-serif",
    },
    tokens: {
      bg1: '#04060d', bg2: '#0b1d3a', paper: '#16253f', letter: '#101c30', ink: '#e8f4ff',
      accent: '#22d3ee', accent2: '#a78bfa', glow: '#22d3ee', stageInk: '#d6ecff',
      sealFill: '#0e7490', sealInk: '#ffffff',
    },
    envelope: { variant: 'amplop', pattern: 'grid', seal: 'cincin', particles: 'neon' },
    copy: {
      hint: 'Sentuh untuk memindai dan membuka',
      tagline: 'Transmisi undangan diterima.',
      toPrefix: 'Penerima:',
      lead: 'Anda terpilih untuk hadir pada momen terpenting kami. Sinkronkan kalender Anda.',
      openLabel: 'Mulai Transmisi',
      skipLabel: 'Lewati',
    },
    motion: { speed: 0.9 },
    sfx: { wave: 'square', notes: [440, 660, 880, 1320] },
  },
  {
    id: 'ulang_tahun-pesta',
    eventType: 'ulang_tahun',
    label: 'Pesta Kado',
    mood: 'Ceria, penuh kejutan, konfeti',
    fonts: {
      display: "'Trebuchet MS','Segoe UI',Arial,sans-serif",
      body: "'Trebuchet MS','Segoe UI',Arial,sans-serif",
    },
    tokens: {
      bg1: '#4a1fa8', bg2: '#c2185b', paper: '#ffd36b', letter: '#fffdf5', ink: '#3b1346',
      accent: '#ff5c8a', accent2: '#ffc233', glow: '#ffe27a', stageInk: '#ffffff',
      sealFill: '#c2185b', sealInk: '#ffffff',
    },
    envelope: { variant: 'kado', pattern: 'pesta', seal: 'pita', particles: 'konfeti' },
    copy: {
      hint: 'Ketuk pita untuk membuka kado!',
      tagline: 'Ada kejutan seru untukmu!',
      toPrefix: 'Spesial untuk',
      lead: 'Yuk rayakan bersama kami! Akan ada permainan, tawa, dan banyak kejutan.',
      openLabel: 'Mulai Pesta',
      skipLabel: 'Lewati',
    },
    motion: { speed: 0.85 },
    sfx: { wave: 'triangle', notes: [523.25, 659.25, 783.99, 1046.5] },
  },
];

/** Tema dasar per jenis acara (dipakai bila kolom theme berisi nilai bawaan seperti "pernikahan"). */
export const DEFAULT_THEME = {
  pernikahan: 'pernikahan-taman',
  ulang_tahun: 'ulang_tahun-pesta',
};
export const FALLBACK_THEME = 'pernikahan-minimalis';

export const getTheme = (id) => THEMES.find((t) => t.id === id) || null;
export const themesFor = (eventType) => THEMES.filter((t) => t.eventType === eventType);
export const hasThemes = (eventType) => themesFor(eventType).length > 0;

/**
 * Urutan: id persis -> tema dasar jenis acara -> tema pertama jenis acara -> cadangan umum.
 * Jenis acara yang belum punya paket tema (mis. khitanan) sementara memakai cadangan umum.
 */
export function resolveTheme(id, eventType) {
  return (
    getTheme(id) ||
    getTheme(DEFAULT_THEME[eventType]) ||
    themesFor(eventType)[0] ||
    getTheme(FALLBACK_THEME)
  );
}
