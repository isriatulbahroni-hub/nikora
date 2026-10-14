// Aura avatar: warna dan irama cahaya di sekitar avatar mengikuti bagian hari di perangkat pemain (waktu lokal)
// ditambah variasi kecil yang diturunkan dari nama. Tanpa sensor, tanpa lokasi, tanpa data pribadi.
export const DAY_PARTS = [
  { id: 'fajar', label: 'Fajar', hue: 18, sat: 0.9, light: 0.62, sparks: 14, speed: 0.5 },
  { id: 'siang', label: 'Siang', hue: 46, sat: 0.95, light: 0.6, sparks: 18, speed: 0.8 },
  { id: 'senja', label: 'Senja', hue: 345, sat: 0.85, light: 0.6, sparks: 16, speed: 0.6 },
  { id: 'malam', label: 'Malam', hue: 248, sat: 0.8, light: 0.68, sparks: 22, speed: 0.4 },
];

/** Jam (0-23) -> indeks bagian hari: fajar 04-06, siang 07-15, senja 16-18, malam 19-03. */
export function dayPartIndex(hour) {
  const h = Number.isFinite(hour) ? ((Math.floor(hour) % 24) + 24) % 24 : 12;
  if (h >= 4 && h <= 6) return 0;
  if (h >= 7 && h <= 15) return 1;
  if (h >= 16 && h <= 18) return 2;
  return 3;
}

function hashName(name) {
  let h = 2166136261;
  for (const c of String(name ?? '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Aura deterministik dari (nama, bagian hari). `part` boleh indeks 0-3; di luar itu jatuh ke siang. */
export function auraFor({ name = '', part = 1 } = {}) {
  const base = DAY_PARTS[Number.isInteger(part) && part >= 0 && part < DAY_PARTS.length ? part : 1];
  const h = hashName(name);
  const hueShift = ((h % 41) - 20); // -20..+20 derajat: tiap nama sedikit berbeda
  return {
    part: base.id,
    label: base.label,
    hue: (((base.hue + hueShift) % 360) + 360) % 360,
    sat: base.sat,
    light: base.light,
    sparks: base.sparks,
    speed: base.speed * (0.85 + ((h >>> 8) % 31) / 100), // 0.85..1.15
    phase: ((h >>> 16) % 628) / 100, // fase awal percikan
  };
}
