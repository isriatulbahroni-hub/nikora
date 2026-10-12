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
    scenery: 'lumbung',
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
    scenery: 'masjid',
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
    scenery: 'taman',
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
    scenery: 'istana',
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
    scenery: 'pulau',
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
    scenery: 'bukit',
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
    scenery: 'kota',
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
    scenery: 'balon',
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
  {
    id: 'khitanan-ksatria',
    eventType: 'khitanan',
    label: 'Ksatria Cilik',
    mood: 'Gagah, ceria, perisai dan istana',
    fonts: {
      display: "'Cinzel','Trajan Pro','Palatino Linotype',Georgia,serif",
      body: "'Palatino Linotype',Georgia,serif",
    },
    tokens: {
      bg1: '#0b1f3a', bg2: '#1d4e89', paper: '#e8d9a8', letter: '#fffbea', ink: '#14243d',
      accent: '#1d4e89', accent2: '#f2b134', glow: '#ffd76a', stageInk: '#eef5ff',
      sealFill: '#1d4e89', sealInk: '#ffffff',
    },
    envelope: { variant: 'amplop', pattern: 'perisai', seal: 'perisai', particles: 'kilau' },
    scenery: 'istana',
    copy: {
      hint: 'Sentuh perisai untuk membuka',
      tagline: 'Seorang ksatria kecil mengundangmu ke syukurannya.',
      toPrefix: 'Kepada Yth.',
      lead: 'Dengan memohon rahmat dan ridha Allah SWT, kami mengundang Anda pada syukuran khitanan putra kami tercinta.',
      openLabel: 'Buka Undangan',
      skipLabel: 'Lewati animasi',
    },
    motion: { speed: 1 },
    sfx: { wave: 'triangle', notes: [261.63, 392, 523.25, 659.25] },
  },
  {
    id: 'khitanan-langit',
    eventType: 'khitanan',
    label: 'Langit Cerah',
    mood: 'Biru cerah, awan, masjid kecil di kejauhan',
    fonts: {
      display: "'Fredoka','Trebuchet MS','Segoe UI',Arial,sans-serif",
      body: "'Trebuchet MS','Segoe UI',Arial,sans-serif",
    },
    tokens: {
      bg1: '#0a3d62', bg2: '#1b6ca8', paper: '#fff3d6', letter: '#ffffff', ink: '#0f3550',
      accent: '#1b6ca8', accent2: '#ffd166', glow: '#fff1a8', stageInk: '#ffffff',
      sealFill: '#1b6ca8', sealInk: '#ffffff',
    },
    envelope: { variant: 'amplop', pattern: 'awan', seal: 'orb', particles: 'kilau' },
    scenery: 'masjid',
    copy: {
      hint: 'Sentuh cahaya untuk membuka',
      tagline: 'Hari yang cerah untuk bersyukur bersama.',
      toPrefix: 'Kepada Yth.',
      lead: 'Dengan penuh syukur, kami mengundang Anda untuk hadir dan mendoakan ananda pada hari khitanannya.',
      openLabel: 'Buka Undangan',
      skipLabel: 'Lewati animasi',
    },
    motion: { speed: 0.95 },
    sfx: { wave: 'sine', notes: [392, 523.25, 659.25, 784] },
  },
  {
    id: 'tazkirah-teduh',
    eventType: 'tazkirah',
    label: 'Hijau Teduh',
    mood: 'Tenang, hijau zaitun, arabesk',
    fonts: {
      display: "'Amiri','Palatino Linotype',Georgia,serif",
      body: "'Palatino Linotype',Georgia,serif",
    },
    tokens: {
      bg1: '#0f2a1d', bg2: '#1f5a3d', paper: '#d8e3c4', letter: '#fbfdf7', ink: '#14301f',
      accent: '#2f7d4f', accent2: '#d9b44a', glow: '#f3e3a0', stageInk: '#f2f8f1',
      sealFill: '#1f6b45', sealInk: '#f6f1e4',
    },
    envelope: { variant: 'amplop', pattern: 'arabesk', seal: 'bintang8', particles: 'bintang' },
    scenery: 'masjid',
    copy: {
      hint: 'Bismillah, sentuh segel untuk membuka',
      tagline: 'Majelis yang menyejukkan hati menantimu.',
      toPrefix: 'Kepada Yth.',
      lead: 'Dengan memohon ridha Allah SWT, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dalam majelis tazkirah.',
      openLabel: 'Buka Undangan',
      skipLabel: 'Lewati animasi',
    },
    motion: { speed: 1.1 },
    sfx: { wave: 'sine', notes: [261.63, 329.63, 392, 493.88] },
  },
  {
    id: 'tazkirah-nur',
    eventType: 'tazkirah',
    label: 'Cahaya Malam',
    mood: 'Malam biru, lentera emas, khusyuk',
    fonts: {
      display: "'Amiri','Palatino Linotype',Georgia,serif",
      body: "'Palatino Linotype',Georgia,serif",
    },
    tokens: {
      bg1: '#0a1226', bg2: '#1c2f5c', paper: '#cfd6ee', letter: '#f7f8ff', ink: '#14193a',
      accent: '#4a62c4', accent2: '#f0c35c', glow: '#ffe6a3', stageInk: '#eef2ff',
      sealFill: '#3a4fb0', sealInk: '#ffffff',
    },
    envelope: { variant: 'amplop', pattern: 'lentera', seal: 'orb', particles: 'kunang' },
    scenery: 'bukit',
    copy: {
      hint: 'Sentuh cahaya untuk membuka',
      tagline: 'Sebuah malam untuk menenangkan hati.',
      toPrefix: 'Kepada Yth.',
      lead: 'Mari hadir di malam yang teduh, mendengar nasihat dan berzikir bersama.',
      openLabel: 'Buka Undangan',
      skipLabel: 'Lewati animasi',
    },
    motion: { speed: 1.15 },
    sfx: { wave: 'sine', notes: [293.66, 440, 587.33, 739.99] },
  },
  {
    id: 'ulang_tahun-balon',
    eventType: 'ulang_tahun',
    label: 'Balon Langit',
    mood: 'Balon warna-warni di langit cerah',
    fonts: {
      display: "'Fredoka','Trebuchet MS','Segoe UI',Arial,sans-serif",
      body: "'Trebuchet MS','Segoe UI',Arial,sans-serif",
    },
    tokens: {
      bg1: '#0f4c81', bg2: '#1f7a8c', paper: '#ffe08a', letter: '#fffdf2', ink: '#08323f',
      accent: '#ef476f', accent2: '#ffd166', glow: '#ffe9a8', stageInk: '#ffffff',
      sealFill: '#d6335c', sealInk: '#ffffff',
    },
    envelope: { variant: 'kado', pattern: 'balon', seal: 'pita', particles: 'konfeti' },
    scenery: 'balon',
    copy: {
      hint: 'Ketuk pita untuk membuka kado!',
      tagline: 'Balon-balon sudah menunggumu!',
      toPrefix: 'Spesial untuk',
      lead: 'Ayo rayakan bersama! Ada kue, permainan, dan banyak balon untuk dibawa pulang.',
      openLabel: 'Ke Pesta',
      skipLabel: 'Lewati',
    },
    motion: { speed: 0.85 },
    sfx: { wave: 'triangle', notes: [523.25, 659.25, 880, 1046.5] },
  },
  {
    id: 'ulang_tahun-pahlawan',
    eventType: 'ulang_tahun',
    label: 'Pahlawan Super',
    mood: 'Komik, bintang meledak, kota malam',
    fonts: {
      display: "'Bangers','Impact','Trebuchet MS',Arial,sans-serif",
      body: "'Trebuchet MS','Segoe UI',Arial,sans-serif",
    },
    tokens: {
      bg1: '#1a1033', bg2: '#b3122f', paper: '#ffe14d', letter: '#fffdf0', ink: '#1a1033',
      accent: '#e63946', accent2: '#ffd60a', glow: '#ffe45e', stageInk: '#ffffff',
      sealFill: '#1a1033', sealInk: '#ffd60a',
    },
    envelope: { variant: 'kado', pattern: 'komik', seal: 'bintang8', particles: 'konfeti' },
    scenery: 'kota',
    copy: {
      hint: 'Ketuk bintang untuk beraksi!',
      tagline: 'Misi rahasia: datang ke pesta ulang tahun!',
      toPrefix: 'Rekan pahlawan:',
      lead: 'Kota butuh kamu! Bergabunglah dalam misi seru: pesta, permainan, dan kue kemenangan.',
      openLabel: 'Terima Misi',
      skipLabel: 'Lewati',
    },
    motion: { speed: 0.85 },
    sfx: { wave: 'square', notes: [392, 523.25, 659.25, 1046.5] },
  },
  {
    id: 'tarannum-nada',
    eventType: 'tarannum',
    label: 'Gelombang Nada',
    mood: 'Tenang, biru toska, gelombang suara',
    fonts: {
      display: "'Amiri','Palatino Linotype',Georgia,serif",
      body: "'Palatino Linotype',Georgia,serif",
    },
    tokens: {
      bg1: '#0c1b2e', bg2: '#14506b', paper: '#cfe3e8', letter: '#f6fcfd', ink: '#0f2b36',
      accent: '#14808f', accent2: '#e3b755', glow: '#f6dd9a', stageInk: '#eaf7fb',
      sealFill: '#0f6a78', sealInk: '#ffffff',
    },
    envelope: { variant: 'amplop', pattern: 'nada', seal: 'cincin', particles: 'kunang' },
    scenery: 'bukit',
    copy: {
      hint: 'Sentuh cincin untuk membuka',
      tagline: 'Lantunan ayat yang menyentuh hati menantimu.',
      toPrefix: 'Kepada Yth.',
      lead: 'Dengan memohon ridha Allah SWT, kami mengundang Anda menikmati malam tarannum yang indah.',
      openLabel: 'Buka Undangan',
      skipLabel: 'Lewati animasi',
    },
    motion: { speed: 1.1 },
    sfx: { wave: 'sine', notes: [293.66, 349.23, 440, 587.33] },
  },
  {
    id: 'karaoke-panggung',
    eventType: 'karaoke',
    label: 'Panggung Neon',
    mood: 'Lampu sorot, ungu neon, penonton bersorak',
    fonts: {
      display: "'Orbitron','Eurostile','Segoe UI',Arial,sans-serif",
      body: "'Segoe UI','Helvetica Neue',Arial,sans-serif",
    },
    tokens: {
      bg1: '#12001f', bg2: '#5a0f8f', paper: '#3a1160', letter: '#fff7ff', ink: '#2a0845',
      accent: '#d61f9b', accent2: '#29d3ff', glow: '#ff7bd5', stageInk: '#ffffff',
      sealFill: '#c21a8b', sealInk: '#ffffff',
    },
    envelope: { variant: 'amplop', pattern: 'sorot', seal: 'cincin', particles: 'neon' },
    scenery: 'panggung',
    copy: {
      hint: 'Sentuh mikrofon untuk membuka',
      tagline: 'Panggung sudah menyala. Tinggal kamu.',
      toPrefix: 'Untuk si calon bintang:',
      lead: 'Satu mikrofon, banyak lagu, dan teman-teman yang siap bernyanyi bersamamu.',
      openLabel: 'Naik Panggung',
      skipLabel: 'Lewati',
    },
    motion: { speed: 0.9 },
    sfx: { wave: 'sawtooth', notes: [329.63, 440, 659.25, 880] },
  },
  {
    id: 'komunitas-kota',
    eventType: 'komunitas',
    label: 'Kota Kita',
    mood: 'Hangat, urban, jendela menyala',
    fonts: {
      display: "'Helvetica Neue','Inter','Segoe UI',Arial,sans-serif",
      body: "'Helvetica Neue','Inter','Segoe UI',Arial,sans-serif",
    },
    tokens: {
      bg1: '#10222e', bg2: '#1e4d63', paper: '#cfe0e8', letter: '#fbfeff', ink: '#11303f',
      accent: '#1f8aa8', accent2: '#f4a63a', glow: '#ffd08a', stageInk: '#f2f9fc',
      sealFill: '#176782', sealInk: '#ffffff',
    },
    envelope: { variant: 'amplop', pattern: 'titik', seal: 'titik', particles: 'debu' },
    scenery: 'kota',
    copy: {
      hint: 'Ketuk untuk membuka',
      tagline: 'Ada tempat untukmu di antara kami.',
      toPrefix: 'Untuk',
      lead: 'Kami mengundang Anda berkumpul, berbagi cerita, dan bertumbuh bersama komunitas.',
      openLabel: 'Lanjut',
      skipLabel: 'Lewati',
    },
    motion: { speed: 0.9 },
    sfx: { wave: 'sine', notes: [440, 554.37, 659.25] },
  },
];

/** Tema dasar per jenis acara (dipakai bila kolom theme berisi nilai bawaan seperti "pernikahan"). */
export const DEFAULT_THEME = {
  pernikahan: 'pernikahan-taman',
  khitanan: 'khitanan-ksatria',
  ulang_tahun: 'ulang_tahun-pesta',
  tazkirah: 'tazkirah-teduh',
  tarannum: 'tarannum-nada',
  karaoke: 'karaoke-panggung',
  komunitas: 'komunitas-kota',
};
export const FALLBACK_THEME = 'pernikahan-minimalis';

export const getTheme = (id) => THEMES.find((t) => t.id === id) || null;
export const themesFor = (eventType) => THEMES.filter((t) => t.eventType === eventType);
export const hasThemes = (eventType) => themesFor(eventType).length > 0;

/**
 * Urutan: id persis -> tema dasar jenis acara -> tema pertama jenis acara -> cadangan umum.
 * Jenis acara yang belum punya paket tema memakai cadangan umum.
 */
export function resolveTheme(id, eventType) {
  return (
    getTheme(id) ||
    getTheme(DEFAULT_THEME[eventType]) ||
    themesFor(eventType)[0] ||
    getTheme(FALLBACK_THEME)
  );
}
