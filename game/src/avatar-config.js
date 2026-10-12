// Konfigurasi avatar buatan pemain (murni, tanpa THREE/DOM supaya mudah diuji).
// Dikirim ke pemain lain sebagai array kecil [pakaian, kulit, gaya rambut, warna rambut, aksesori, karakter].
export const OUTFITS = [
  { name: 'Hijau Zamrud', hex: 0x2e9e6b }, { name: 'Maroon', hex: 0x8c2f39 }, { name: 'Emas', hex: 0xd4a84b },
  { name: 'Biru Navy', hex: 0x2f4a7a }, { name: 'Putih Gading', hex: 0xf2e4cf }, { name: 'Hitam', hex: 0x2a2a30 },
  { name: 'Ungu', hex: 0x6b4fa0 }, { name: 'Merah Muda', hex: 0xe58fa8 }, { name: 'Teal', hex: 0x2b8f94 },
  { name: 'Oranye', hex: 0xe08a3c }, { name: 'Cokelat', hex: 0x7a5a3c }, { name: 'Abu-abu', hex: 0x8a8f98 },
];
export const SKINS = [
  { name: 'Terang', hex: 0xf6dcc6 }, { name: 'Sawo Muda', hex: 0xe8bf99 }, { name: 'Sawo', hex: 0xc99468 },
  { name: 'Sawo Matang', hex: 0x9a6a46 }, { name: 'Cokelat', hex: 0x6b4630 }, { name: 'Gelap', hex: 0x4a2f20 },
];
export const HAIR_STYLES = ['Gundul', 'Pendek', 'Poni', 'Panjang', 'Kuncir', 'Sanggul'];
export const HAIR_COLORS = [
  { name: 'Hitam', hex: 0x1b1620 }, { name: 'Cokelat Tua', hex: 0x4a2f20 }, { name: 'Cokelat', hex: 0x8a5a36 },
  { name: 'Pirang', hex: 0xd9b36a }, { name: 'Merah', hex: 0xa03a2a }, { name: 'Abu-abu', hex: 0x9aa0a6 },
  { name: 'Putih', hex: 0xf4efe6 }, { name: 'Biru', hex: 0x3f6fd1 }, { name: 'Merah Muda', hex: 0xe58fa8 },
  { name: 'Maroon', hex: 0x8c2f39 }, { name: 'Hijau', hex: 0x2e9e6b }, { name: 'Emas', hex: 0xd4a84b },
];
export const ACCESSORIES = ['Tanpa', 'Kacamata', 'Peci', 'Kerudung', 'Blangkon', 'Mahkota', 'Topi'];
// Karakter: 0 = avatar sederhana yang bisa dikustomisasi; 1.. = model manusia (urutan sama dengan HUMAN_MODELS).
export const CHARACTERS = [{ id: null, name: 'Sederhana' }, { id: 'michelle', name: 'Michelle' }];

const SIZES = [OUTFITS.length, SKINS.length, HAIR_STYLES.length, HAIR_COLORS.length, ACCESSORIES.length, CHARACTERS.length];
export const FIELDS = ['o', 's', 'h', 'k', 'a', 'm'];

export const defaultConfig = () => ({ o: 0, s: 1, h: 1, k: 0, a: 0, m: 0 });

const clampIndex = (v, size, fallback) => (Number.isInteger(v) && v >= 0 && v < size ? v : fallback);

/** Terima array wire atau objek; nilai di luar jangkauan diganti default. Aman untuk data dari jaringan. */
export function sanitizeConfig(raw) {
  const base = defaultConfig();
  const values = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? FIELDS.map((f) => raw[f]) : [];
  const out = {};
  FIELDS.forEach((f, i) => { out[f] = clampIndex(values[i], SIZES[i], base[f]); });
  return out;
}

export const toWire = (cfg) => FIELDS.map((f) => cfg[f]);
export const sameConfig = (a, b) => FIELDS.every((f) => a?.[f] === b?.[f]);

/** Tampilan awal deterministik dari id (dipakai sampai pemain lain mengirim avatarnya). */
export function configFromId(id) {
  let h = 2166136261;
  for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const pick = (size) => { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; return h % size; };
  return { o: pick(SIZES[0]), s: pick(SIZES[1]), h: pick(SIZES[2]), k: pick(SIZES[3]), a: pick(SIZES[4]), m: 0 };
}

export function randomConfig(rng = Math.random) {
  const cfg = {};
  FIELDS.forEach((f, i) => { cfg[f] = Math.min(SIZES[i] - 1, Math.floor(rng() * SIZES[i])); });
  cfg.m = 0; // acak hanya mengacak avatar sederhana; karakter manusia dipilih sengaja
  return cfg;
}

export function loadConfig(storage) {
  try {
    return sanitizeConfig(JSON.parse(storage?.getItem('orbit-avatar') ?? 'null'));
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(storage, cfg) {
  try {
    storage?.setItem('orbit-avatar', JSON.stringify(toWire(cfg)));
  } catch {
    /* penyimpanan tidak tersedia */
  }
}
