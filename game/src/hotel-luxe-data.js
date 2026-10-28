// Interior hotel gaya premium termewah (data murni, tanpa THREE): palet beludru/emas/marmer, perabot yang dipermak, lampu gantung kristal,
// panel dinding, bingkai pintu emas, lukisan dinding, dan gaya lantai (marmer, parket, karpet). Dipakai hotel-luxe.js (gambar) dan diuji
// di hotel-luxe-data.test.js. Tidak mengubah ukuran tabrakan atau penataan: semuanya hanya penampilan di atas katalog hotel-props.js.
import { LAMP_COLOR, PROP_DEFS, propParts, propRect } from './hotel-props.js';

/** Bahan: matte, wood (pernis), gold (logam), marble (licin), velvet (beludru), glass, light (menyala). */
export const LUX_MATS = Object.freeze(['matte', 'wood', 'gold', 'marble', 'velvet', 'glass', 'light']);
export const C = Object.freeze({
  gold: 0xd4af37, brass: 0xb8923a, ivory: 0xf6efe0, champagne: 0xcdb98c, emerald: 0x0f4a3c, burgundy: 0x6e1f2e, onyx: 0x14151a,
  walnut: 0x3b2415, mahogany: 0x4a2418, blush: 0xe9a3b5, sapphire: 0x16305f,
});

// Warna katalog lama -> [warna mewah, bahan]. Warna yang tidak terdaftar tetap, bahan matte.
const REMAP = new Map([
  [0x6b4a2f, [C.walnut, 'wood']], [0x8a6b45, [0x5a3a22, 'wood']], [0x5a4630, [C.walnut, 'wood']], [0x5a3a2a, [C.mahogany, 'wood']], [0x3a2a1f, [0x2a1a10, 'wood']],
  [0x7a5a3c, [0x6a4a2c, 'wood']], [0xc9a24b, [C.gold, 'gold']], [0xb98a54, [0x9a6a3a, 'wood']], [0x9a6f3f, [0x7a4f2a, 'wood']],
  [0x23395b, [C.emerald, 'velvet']], [0x1e3150, [0x0a3a30, 'velvet']], [0x7a4a2f, [C.burgundy, 'velvet']], [0x6a3f27, [0x561823, 'velvet']],
  [0x9b2f3a, [0x7a1f2e, 'velvet']], [0x8a7a68, [0xb8a27a, 'velvet']], [0x7a1f2b, [C.burgundy, 'velvet']], [0xf6f2ea, [C.ivory, 'velvet']],
  [0xbfe0ee, [0xcfe6ef, 'glass']], [0xcfe6f0, [0xd8eef6, 'glass']], [0xcfe9f5, [0xcfe9f5, 'glass']],
  [0xf4f4f0, [0xf7f3ea, 'marble']], [0xe8e2d6, [0xf1ece0, 'marble']], [0x2b2f36, [C.onyx, 'marble']], [0x1b1d22, [0x1a1b20, 'velvet']],
  [0xe8dcc0, [0xf8f2e4, 'matte']], [0xd8c8a8, [0xe8d9b4, 'matte']], [0xd9c9a0, [0xe6d6a8, 'marble']], [0xc97d54, [0xeee6d6, 'marble']],
  [0x3f8a3a, [0x1f6b3f, 'matte']], [0x4e9a44, [0x2c8450, 'matte']], [0x9aa0a6, [C.gold, 'gold']], [0xb9bdc3, [0xd9dde2, 'gold']], [0xbcc2c5, [0xcdd2d6, 'gold']],
  [0xe8d2b0, [0xe8d2b0, 'matte']], [0xdfe5e8, [0xf1f4f5, 'marble']], [0xdfe3e6, [0xe6e9ec, 'gold']], [0xd9dde0, [0xe3e7ea, 'gold']],
]);

/** Warna + bahan mewah untuk satu warna katalog. */
export function reskin(color) {
  if (color === LAMP_COLOR) return { color, mat: 'light' };
  const r = REMAP.get(color);
  return r ? { color: r[0], mat: r[1] } : { color, mat: 'matte' };
}

const g = (dx, dy, dz, sx, sy, sz, color = C.gold, mat = 'gold') => ({ dx, dy, dz, sx, sy, sz, color, mat });
const feet = (x, z, y = 0.04, s = 0.08) => [-1, 1].flatMap((a) => [-1, 1].map((b) => g(a * x, y, b * z, s, s * 1.1, s)));
const FLOWERS = [0xe9a3b5, 0xf6efe0, 0xe9c46a];

/** Bagian tambahan (kerangka lokal perabot) yang membuat perabot terlihat mewah. */
const EXTRA = {
  sofa: () => [...feet(1.0, 0.4), g(0, 0.97, -0.38, 2.2, 0.04, 0.22), g(-0.6, 0.72, -0.12, 0.42, 0.36, 0.14, C.gold, 'velvet'), g(0.6, 0.72, -0.12, 0.42, 0.36, 0.14, C.ivory, 'velvet'), g(0, 0.5, 0.42, 2.2, 0.03, 0.04)],
  armchair: () => [...feet(0.38, 0.38), g(0, 0.62, -0.18, 0.36, 0.3, 0.12, C.gold, 'velvet'), g(0, 0.97, -0.35, 0.9, 0.04, 0.2)],
  chair: () => [g(0, 0.5, 0, 0.4, 0.06, 0.4, C.burgundy, 'velvet')], // kursi sangat banyak: satu bantalan beludru saja (ringan untuk HP)
  coffee_table: () => [g(0, 0.435, 0, 1.0, 0.035, 0.7, C.ivory, 'marble'), g(0, 0.46, 0.34, 1.02, 0.04, 0.03), g(0, 0.46, -0.34, 1.02, 0.04, 0.03), g(0.18, 0.56, 0, 0.1, 0.2, 0.1), g(0.18, 0.72, 0, 0.22, 0.16, 0.22, FLOWERS[0], 'matte'), g(0.18, 0.78, 0.05, 0.14, 0.12, 0.14, FLOWERS[1], 'matte')],
  dining_table: () => [g(0, 0.775, 0, 1.8, 0.035, 1.0, C.ivory, 'marble'), g(0, 0.8, 0.5, 1.82, 0.03, 0.03), g(0, 0.8, -0.5, 1.82, 0.03, 0.03), g(0, 0.93, 0, 0.1, 0.24, 0.1), g(0, 1.1, 0, 0.26, 0.18, 0.26, FLOWERS[1], 'matte')],
  table: () => [g(0, 0.8, 0, 0.35, 0.012, 1.72), g(0, 0.97, 0, 0.18, 0.28, 0.18), g(0, 1.2, 0, 0.42, 0.26, 0.42, FLOWERS[0], 'matte'), g(0, 1.32, 0.04, 0.26, 0.14, 0.26, FLOWERS[1], 'matte')],
  desk: () => [g(0, 1.16, 0, 3.5, 0.012, 0.1), g(0, 0.06, 0.52, 3.4, 0.05, 0.04, LAMP_COLOR, 'light'), g(-1.2, 1.28, 0, 0.14, 0.3, 0.14), g(-1.2, 1.5, 0, 0.26, 0.16, 0.26, LAMP_COLOR, 'light'), g(0, 0.55, 0.51, 3.4, 0.9, 0.03, C.onyx, 'marble'), g(0, 0.98, 0.52, 3.5, 0.04, 0.05)],
  counter: () => [g(0, 0.98, 0, 2.5, 0.012, 0.06), g(0, 0.06, 0.52, 2.3, 0.05, 0.04, LAMP_COLOR, 'light')],
  work_desk: () => [g(0.5, 0.9, -0.1, 0.05, 0.28, 0.05), g(0.5, 1.1, -0.1, 0.2, 0.14, 0.2, LAMP_COLOR, 'light'), g(0, 0.78, 0.2, 0.5, 0.012, 0.3, C.burgundy, 'velvet')],
  wardrobe: () => [g(0, 2.22, 0, 1.28, 0.06, 0.66), g(0, 0.06, 0.31, 1.2, 0.1, 0.02), g(-0.3, 1.1, 0.31, 0.5, 2.0, 0.015, 0x4a2f1c, 'wood'), g(0.3, 1.1, 0.31, 0.5, 2.0, 0.015, 0x4a2f1c, 'wood')],
  tv_unit: () => [g(0, 0.51, 0, 1.42, 0.03, 0.52), g(0, 1.0, 0.045, 1.3, 0.8, 0.02, C.gold, 'gold'), g(0, 0.2, 0.26, 1.2, 0.02, 0.02, LAMP_COLOR, 'light')],
  dresser: () => [g(0, 0.82, 0, 1.22, 0.04, 0.52, C.ivory, 'marble'), g(0, 1.3, -0.235, 1.06, 0.96, 0.02), g(0.3, 0.9, 0.0, 0.12, 0.3, 0.12), g(0.3, 1.1, 0.0, 0.2, 0.14, 0.2, LAMP_COLOR, 'light')],
  lamp: () => [g(0, 0.03, 0, 0.3, 0.06, 0.3), g(0, 1.4, 0, 0.1, 0.12, 0.1)],
  plant: () => [g(0, 0.52, 0, 0.6, 0.05, 0.6), g(0, 0.04, 0, 0.56, 0.08, 0.56)],
  bathtub: () => [...feet(0.7, 0.32, 0.05, 0.1), g(0.7, 0.75, -0.25, 0.05, 0.4, 0.05), g(0.7, 0.95, -0.12, 0.05, 0.05, 0.25), g(0, 0.58, 0, 1.64, 0.04, 0.84, C.gold, 'gold')],
  vanity: () => [g(0, 0.85, 0.02, 0.56, 0.02, 0.4, C.ivory, 'marble'), g(0, 0.95, -0.05, 0.05, 0.14, 0.05), g(0, 1.45, -0.235, 0.82, 0.92, 0.015), g(0, 0.5, 0.26, 0.8, 0.03, 0.02, LAMP_COLOR, 'light')],
  shower: () => [g(-0.3, 1.3, -0.35, 0.05, 0.5, 0.05), g(0.38, 1.0, 0.39, 0.04, 2.0, 0.04), g(-0.3, 2.0, -0.3, 0.26, 0.05, 0.26)],
  massage_bed: () => [g(0.3, 0.6, 0.8, 0.06, 0.08, 0.06, LAMP_COLOR, 'light'), g(-0.3, 0.6, 0.8, 0.06, 0.08, 0.06, LAMP_COLOR, 'light'), g(0, 0.58, 0.1, 0.92, 0.02, 0.6, C.ivory, 'velvet')],
  lounger: () => [g(0, 0.36, 0.1, 0.6, 0.06, 1.1, C.champagne, 'velvet'), ...feet(0.3, 0.9, 0.04, 0.06)],
  podium: () => [g(0, 0.55, 0.31, 0.8, 0.9, 0.02), g(0, 1.2, 0, 0.5, 0.2, 0.3, C.burgundy, 'velvet')],
  stage: (p) => [g(0, 0.93, (p.d ?? 4) / 2 - 0.05, (p.w ?? 14), 0.06, 0.05), g(0, 0.5, (p.d ?? 4) / 2 + 0.01, (p.w ?? 14) - 0.1, 0.8, 0.02, C.burgundy, 'velvet')],
  pew: () => [g(0, 0.7, 0.12, 1.96, 0.08, 0.12, C.burgundy, 'velvet'), g(0, 0.86, -0.24, 2.0, 0.04, 0.1)],
  stool: () => [g(0, 0.66, 0, 0.36, 0.06, 0.36, C.burgundy, 'velvet'), g(0, 0.33, 0, 0.1, 0.62, 0.1), g(0, 0.2, 0, 0.3, 0.03, 0.3)],
  bar_counter: (p) => {
    const w = p.w ?? 8;
    const d = p.d ?? 1.2;
    const out = [g(0, 1.14, 0, w + 0.14, 0.03, d + 0.14, C.onyx, 'marble'), g(0, 0.06, d / 2 + 0.06, w - 0.2, 0.05, 0.04, LAMP_COLOR, 'light'), g(0, 0.55, d / 2 + 0.02, w - 0.1, 1.0, 0.03, C.mahogany, 'wood')];
    const bottles = [0x2a6b4f, 0xa23b3b, 0xd4af37, 0x2b5aa0, 0x6a2c70];
    for (const y of [1.5, 1.95, 2.4]) {
      out.push(g(0, y, -d / 2 + 0.28, w - 0.5, 0.04, 0.26), g(0, y - 0.06, -d / 2 + 0.28, w - 0.6, 0.03, 0.03, LAMP_COLOR, 'light'));
      for (let i = 0, n = Math.max(2, Math.floor((w - 1) / 0.45)); i < n; i++) out.push(g(-(w - 1) / 2 + (i + 0.5) * ((w - 1) / n), y + 0.17, -d / 2 + 0.28, 0.09, 0.3, 0.09, bottles[(i + Math.round(y * 2)) % bottles.length], 'glass'));
    }
    return out;
  },
  buffet: (p) => [g(0, 0.93, 0, (p.w ?? 4) - 0.1, 0.02, (p.d ?? 1) - 0.1, C.ivory, 'marble'), g(0, 1.35, 0, 0.5, 0.05, 0.06, LAMP_COLOR, 'light'), g(0, 0.06, (p.d ?? 1) / 2 + 0.02, (p.w ?? 4) - 0.2, 0.04, 0.03, LAMP_COLOR, 'light')],
  bed_s: () => [g(0, 1.45, -1.17, 1.7, 0.04, 0.04), g(0, 0.7, 0.6, 1.7, 0.02, 0.5, C.burgundy, 'velvet')],
  // tempat tidur utama digambar bedGeometries (villa-props.js); ini hanya kepala ranjang beludru berbingkai emas, selimut lari, dan bantal
  bed: () => [g(0, 1.0, -1.14, 2.1, 1.3, 0.1, 0xb8a27a, 'velvet'), g(0, 1.68, -1.14, 2.2, 0.06, 0.12), g(0, 0.36, -1.14, 2.2, 0.06, 0.12), g(-1.05, 1.0, -1.14, 0.06, 1.3, 0.12), g(1.05, 1.0, -1.14, 0.06, 1.3, 0.12),
    g(0, 0.72, 0.5, 1.8, 0.03, 0.5, C.burgundy, 'velvet'), g(-0.5, 0.78, -0.8, 0.6, 0.14, 0.3, C.ivory, 'velvet'), g(0.5, 0.78, -0.8, 0.6, 0.14, 0.3, C.ivory, 'velvet'), g(0, 0.86, -0.92, 0.5, 0.22, 0.14, C.gold, 'velvet'),
    g(-1.2, 0.3, -1.0, 0.45, 0.6, 0.4, C.walnut, 'wood'), g(1.2, 0.3, -1.0, 0.45, 0.6, 0.4, C.walnut, 'wood'), g(-1.2, 0.64, -1.0, 0.5, 0.03, 0.45, C.ivory, 'marble'), g(1.2, 0.64, -1.0, 0.5, 0.03, 0.45, C.ivory, 'marble'),
    g(-1.2, 0.95, -1.0, 0.14, 0.4, 0.14), g(1.2, 0.95, -1.0, 0.14, 0.4, 0.14), g(-1.2, 1.3, -1.0, 0.3, 0.22, 0.3, LAMP_COLOR, 'light'), g(1.2, 1.3, -1.0, 0.3, 0.22, 0.3, LAMP_COLOR, 'light')],
};

/** Semua bagian satu perabot (kerangka lokal): katalog dipermak warna/bahannya, ditambah EXTRA. Tempat tidur utama hanya EXTRA (badan digambar bedGeometries). */
export function propLuxParts(p) {
  const base = p.type === 'bed' ? [] : propParts(p).filter((q) => q.color !== LAMP_COLOR).map((q) => ({ ...q, ...reskin(q.color) })); // lampu dasar digambar hotel-world.js
  return [...base, ...(EXTRA[p.type]?.(p) ?? [])];
}

/** Gaya lantai per jenis ruang: tex = marble | parquet | carpet, tint = warna pengali. null = biarkan lantai bawaan. */
export function floorStyle(kind, guestLevel = false) {
  switch (kind) {
    case 'lobby': return { tex: 'marble', tint: 0xffffff };
    case 'hall': return { tex: 'marble', tint: 0xf3e7cd };
    case 'shop': return { tex: 'marble', tint: 0xf1e9db };
    case 'spa': return { tex: 'marble', tint: 0xe9dfcf };
    case 'lounge': return { tex: 'marble', tint: 0xcdb98c };
    case 'restaurant': return { tex: 'parquet', tint: 0xffffff };
    case 'library': return { tex: 'parquet', tint: 0xc9a77a };
    case 'suite': return { tex: 'parquet', tint: 0xf1d9b0 };
    case 'guest': return { tex: 'carpet', tint: 0x7a1f2e };
    case 'bridal': return { tex: 'carpet', tint: 0xe3b9c0 };
    case 'meeting': return { tex: 'carpet', tint: 0x2c3a52 };
    case 'prayer': return { tex: 'carpet', tint: 0x1f5a41 };
    case 'cinema': return { tex: 'carpet', tint: 0x4a1530 };
    case 'games': return { tex: 'carpet', tint: 0x1e2748 };
    case 'base': return guestLevel ? { tex: 'carpet', tint: 0x6b2330 } : { tex: 'marble', tint: 0xf4eee0 };
    default: return null;
  }
}

export const isPerimeter = (w, F) => (w.orient === 'h' ? (w.coord === F[1] || w.coord === F[3]) : (w.coord === F[0] || w.coord === F[2]));

/** Panel dinding: lis lantai, panel bawah, rel kursi emas, dan lis atas, untuk dinding dalam (bukan kulit luar). */
export function wallTrim(walls, F, y0, wallH = 3.9) {
  const out = { wood: [], gold: [], matte: [] };
  for (const w of walls) {
    if (isPerimeter(w, F)) continue;
    const len = w.b - w.a;
    const mid = (w.a + w.b) / 2;
    const at = (y, h, t, color) => (w.orient === 'h' ? { x: mid, y: y0 + y, z: w.coord, sx: len, sy: h, sz: t, color } : { x: w.coord, y: y0 + y, z: mid, sx: t, sy: h, sz: len, color });
    out.wood.push(at(0.08, 0.16, 0.36, C.walnut));
    out.matte.push(at(0.7, 1.08, 0.33, 0xe2d2ac));
    out.gold.push(at(1.26, 0.06, 0.37, C.gold), at(wallH - 0.1, 0.2, 0.37, C.gold));
  }
  return out;
}

/** Bingkai pintu emas: dua tiang dan ambang. */
export function doorTrim(doors, y0, doorH = 2.1) {
  const out = [];
  for (const d of doors) {
    const hw = d.width / 2;
    if (d.orient === 'h') {
      out.push({ x: d.x - hw, y: y0 + doorH / 2, z: d.z, sx: 0.12, sy: doorH, sz: 0.4, color: C.gold }, { x: d.x + hw, y: y0 + doorH / 2, z: d.z, sx: 0.12, sy: doorH, sz: 0.4, color: C.gold }, { x: d.x, y: y0 + doorH + 0.04, z: d.z, sx: d.width + 0.24, sy: 0.1, sz: 0.4, color: C.gold });
    } else {
      out.push({ x: d.x, y: y0 + doorH / 2, z: d.z - hw, sx: 0.4, sy: doorH, sz: 0.12, color: C.gold }, { x: d.x, y: y0 + doorH / 2, z: d.z + hw, sx: 0.4, sy: doorH, sz: 0.12, color: C.gold }, { x: d.x, y: y0 + doorH + 0.04, z: d.z, sx: 0.4, sy: 0.1, sz: d.width + 0.24, color: C.gold });
    }
  }
  return out;
}

const GRAND = new Set(['lobby', 'restaurant', 'hall', 'bridal', 'spa', 'shop', 'lounge', 'suite', 'library', 'meeting']);
export const isGrandKind = (kind) => GRAND.has(kind);

/** Titik lampu gantung di sebuah ruang: grid ~16 m, hanya ruang publik yang cukup besar. */
export function chandelierSpots(rect) {
  const [x1, z1, x2, z2] = rect;
  const w = x2 - x1;
  const d = z2 - z1;
  if (Math.min(w, d) < 7) return [];
  const nx = Math.max(1, Math.round(w / 16));
  const nz = Math.max(1, Math.round(d / 16));
  const out = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) out.push({ x: x1 + (w * (i + 0.5)) / nx, z: z1 + (d * (j + 0.5)) / nz, s: Math.min(1.6, Math.max(0.8, Math.min(w / nx, d / nz) / 8)) });
  return out;
}

/** Satu lampu gantung kristal (kotak dunia dengan mat). y0 = lantai, ceilingY = tinggi langit-langit di atas lantai. */
export function chandelier(x, z, s, y0, ceilingY = 3.9) {
  const out = [];
  const add = (dx, y, dz, sx, sy, sz, color, mat) => out.push({ x: x + dx, y: y0 + y, z: z + dz, sx, sy, sz, color, mat });
  add(0, ceilingY - 0.04, 0, 0.5 * s, 0.07, 0.5 * s, C.gold, 'gold');
  add(0, ceilingY - 0.4, 0, 0.04, 0.7, 0.04, C.gold, 'gold');
  add(0, ceilingY - 0.85, 0, 0.2 * s, 0.4, 0.2 * s, C.gold, 'gold');
  for (const [side, y, n] of [[1.5, 3.05, 6], [0.9, 2.7, 4]]) {
    const h = (side * s) / 2;
    add(-h, y, 0, 0.06, 0.06, side * s, C.gold, 'gold');
    add(h, y, 0, 0.06, 0.06, side * s, C.gold, 'gold');
    add(0, y, -h, side * s, 0.06, 0.06, C.gold, 'gold');
    add(0, y, h, side * s, 0.06, 0.06, C.gold, 'gold');
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      add(Math.cos(a) * h, y - 0.17, Math.sin(a) * h, 0.14 * s, 0.3, 0.14 * s, LAMP_COLOR, 'light');
    }
  }
  add(0, 2.35, 0, 0.12 * s, 0.22, 0.12 * s, C.gold, 'gold');
  return out;
}

const ART = [0x1d4e5f, 0x7a2336, 0xb89a62, 0x2f4a3a, 0x3b2f5c];

/**
 * Lukisan berbingkai emas dengan lampu sorot: di dinding utara ruang publik besar, dan di atas kepala ranjang kamar tamu.
 * props = perabot lantai itu (untuk menghindari lemari/bar yang bersandar di dinding), doors = pintu lantai itu.
 */
export function wallArt(rooms, doors, props, y0) {
  const frames = [];
  const canvas = [];
  const lights = [];
  const solid = props.filter((p) => PROP_DEFS[p.type]?.solid).map((p) => propRect(p));
  const frame = (x, y, z, ry, w, h, k) => {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const put = (dx, dy, dz, sx, sy, sz) => ({ x: x + dx * c + dz * s, y: y0 + y + dy, z: z - dx * s + dz * c, sx, sy, sz, ry });
    frames.push({ ...put(0, 0, 0, w, h, 0.08), color: C.gold });
    canvas.push({ ...put(0, 0, 0.02, w - 0.2, h - 0.2, 0.08), color: ART[k % ART.length] });
    lights.push({ ...put(0, h / 2 + 0.16, 0.12, w * 0.5, 0.05, 0.1), color: LAMP_COLOR });
  };
  let k = 0;
  for (const r of rooms) {
    if (r.kind === 'guest') continue;
    if (!isGrandKind(r.kind)) continue;
    const [x1, z1, x2, z2] = r.rect;
    if (x2 - x1 < 8 || z2 - z1 < 6) continue;
    for (let x = x1 + 4; x <= x2 - 3.99; x += 7) {
      const nearDoor = doors.some((d) => d.orient === 'h' && Math.abs(d.z - z1) < 0.2 && Math.abs(d.x - x) < d.width / 2 + 1.4);
      const blocked = solid.some((q) => q.minZ < z1 + 1.6 && q.maxZ > z1 && q.minX < x + 1.6 && q.maxX > x - 1.6);
      if (nearDoor || blocked) continue;
      frame(x, 2.0, z1 + 0.2, 0, 2.0, 1.4, k++);
    }
  }
  for (const p of props) {
    if (p.tag !== 'bed') continue;
    const ry = p.ry ?? 0;
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    // kepala ranjang di sisi -z lokal (1,5 m di belakang pusat), bingkai menghadap +z lokal
    frame(p.x - s * 1.26, 2.15, p.z - c * 1.26, ry, 1.5, 0.9, k++);
  }
  return { frames, canvas, lights };
}
