// Katalog perabot hotel (data murni, tanpa THREE): ukuran tabrakan dan bagian-bagian kotak untuk digambar.
// Satu sumber untuk hotel-layout.js (tabrakan), hotel-furnish.js (penataan), dan hotel-world.js (gambar).
// Kerangka lokal sebuah perabot: depan = +z, kanan-kiri = x, atas = y (dy = tinggi pusat kotak dari lantai).
// Perabot yang bisa dibesarkan (stage, rug, shelf, ...) menerima p.w (lebar x) dan p.d (dalam z).
const b = (dx, dy, dz, sx, sy, sz, color) => ({ dx, dy, dz, sx, sy, sz, color });

export const LAMP_COLOR = 0xfff0c8; // bagian berwarna ini digambar menyala (emisif)
const WOOD = 0x6b4a2f;
const OAK = 0x8a6b45;
const CREAM = 0xf1e9d6;
const STEEL = 0xbcc2c5;
const DARK = 0x2b2f36;
const WHITE = 0xf4f4f0;
const NAVY = 0x23395b;
const GLASS = 0xbfe0ee;
const legs = (w, d, h, t, color) => [-1, 1].flatMap((sx) => [-1, 1].map((sz) => b(sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2), t, h, t, color)));
const W = (p, def) => p.w ?? def;
const D = (p, def) => p.d ?? def;

export const PROP_DEFS = {
  // ---- tidur, duduk, kerja
  bed: { hx: 0.95, hz: 1.1, solid: true, parts: [] }, // digambar dengan bedGeometries (villa-props.js); kepala di sisi -z
  bed_s: {
    hx: 0.8, hz: 1.1, solid: true,
    make: (p) => { const w = W(p, 1.6); return [b(0, 0.25, 0, w, 0.3, 2.15, WOOD), b(0, 0.48, 0, w - 0.1, 0.2, 2.05, 0xf6f2ea), b(0, 0.62, 0.35, w - 0.05, 0.1, 1.4, 0x9b2f3a), b(0, 0.85, -1.1, w + 0.1, 1.0, 0.12, 0x8a7a68), b(-w / 4, 0.66, -0.75, w * 0.4, 0.14, 0.4, 0xffffff), b(w / 4, 0.66, -0.75, w * 0.4, 0.14, 0.4, 0xffffff)]; },
  },
  sofa: { hx: 1.1, hz: 0.5, solid: true, parts: [b(0, 0.25, 0.05, 2.2, 0.5, 0.9, NAVY), b(0, 0.68, -0.38, 2.2, 0.5, 0.2, 0x1e3150), b(-1.05, 0.45, 0.05, 0.18, 0.7, 0.9, 0x1e3150), b(1.05, 0.45, 0.05, 0.18, 0.7, 0.9, 0x1e3150), b(0, 0.55, 0.12, 1.9, 0.1, 0.7, 0x2d4a78)] },
  armchair: { hx: 0.45, hz: 0.45, solid: true, parts: [b(0, 0.25, 0.03, 0.9, 0.5, 0.85, 0x7a4a2f), b(0, 0.7, -0.35, 0.9, 0.5, 0.18, 0x6a3f27), b(-0.4, 0.45, 0.03, 0.14, 0.6, 0.85, 0x6a3f27), b(0.4, 0.45, 0.03, 0.14, 0.6, 0.85, 0x6a3f27), b(0, 0.55, 0.08, 0.66, 0.1, 0.65, 0x9a6a47)] },
  chair: { hx: 0.25, hz: 0.25, solid: false, parts: [b(0, 0.45, 0, 0.46, 0.06, 0.46, OAK), b(0, 0.8, -0.21, 0.46, 0.7, 0.05, OAK), ...legs(0.46, 0.46, 0.42, 0.05, OAK)] },
  stool: { hx: 0.2, hz: 0.2, solid: false, parts: [b(0, 0.62, 0, 0.4, 0.06, 0.4, 0x3a2a1f), b(0, 0.3, 0, 0.07, 0.6, 0.07, 0xb9bdc3), b(0, 0.02, 0, 0.34, 0.04, 0.34, 0xb9bdc3)] },
  pew: { hx: 1.0, hz: 0.3, solid: true, parts: [b(0, 0.45, 0, 2.0, 0.08, 0.5, WOOD), b(0, 0.8, -0.24, 2.0, 0.6, 0.08, WOOD), b(-0.95, 0.22, 0, 0.1, 0.44, 0.45, WOOD), b(0.95, 0.22, 0, 0.1, 0.44, 0.45, WOOD)] },
  cinema_seat: { hx: 0.3, hz: 0.3, solid: false, parts: [b(0, 0.28, 0, 0.55, 0.5, 0.55, 0x7a1f2b), b(0, 0.72, -0.24, 0.55, 0.6, 0.12, 0x7a1f2b)] },
  // ---- meja
  table: { hx: 0.85, hz: 0.85, solid: true, parts: [b(0, 0.38, 0, 1.55, 0.76, 1.55, 0xe8dcc0), b(0, 0.78, 0, 1.7, 0.06, 1.7, 0xd8c8a8)] }, // meja jamuan berkain
  coffee_table: { hx: 0.5, hz: 0.35, solid: true, parts: [b(0, 0.4, 0, 1.0, 0.05, 0.7, WOOD), ...legs(1.0, 0.7, 0.38, 0.06, WOOD)] },
  dining_table: { hx: 0.9, hz: 0.5, solid: true, parts: [b(0, 0.74, 0, 1.8, 0.06, 1.0, WOOD), ...legs(1.8, 1.0, 0.72, 0.08, WOOD)] },
  work_desk: { hx: 0.7, hz: 0.35, solid: true, parts: [b(0, 0.74, 0, 1.4, 0.05, 0.7, WOOD), b(-0.64, 0.37, 0, 0.06, 0.72, 0.65, WOOD), b(0.64, 0.37, 0, 0.06, 0.72, 0.65, WOOD), b(0, 0.8, 0.02, 0.35, 0.02, 0.25, 0x222), b(0, 0.9, -0.12, 0.35, 0.2, 0.02, 0x111)] },
  desk: { hx: 1.8, hz: 0.5, solid: true, parts: [b(0, 0.55, 0, 3.6, 1.1, 1.0, WOOD), b(0, 1.12, 0, 3.7, 0.06, 1.1, 0xd9c9a0)] }, // meja resepsionis
  counter: { hx: 1.2, hz: 0.5, solid: true, parts: [b(0, 0.47, 0, 2.4, 0.95, 1.0, 0xe8e2d6), b(0, 0.97, 0, 2.5, 0.05, 1.1, 0x555b61)] },
  conf_table: { hx: 3, hz: 0.8, solid: true, make: (p) => { const w = W(p, 6); const d = D(p, 1.6); return [b(0, 0.74, 0, w, 0.07, d, 0x5a3a2a), b(-(w / 2 - 0.3), 0.37, 0, 0.12, 0.72, d - 0.3, 0x3a2a1f), b(w / 2 - 0.3, 0.37, 0, 0.12, 0.72, d - 0.3, 0x3a2a1f)]; } },
  buffet: { hx: 2, hz: 0.5, solid: true, make: (p) => { const w = W(p, 4); const d = D(p, 1.0); return [b(0, 0.45, 0, w, 0.9, d, CREAM), b(0, 0.92, 0, w + 0.05, 0.05, d + 0.05, 0x7a5a3c), b(-w / 4, 1.05, 0, 0.5, 0.2, 0.4, 0xc9a24b), b(w / 4, 1.05, 0, 0.5, 0.2, 0.4, 0xc9a24b)]; } },
  bar_counter: { hx: 4, hz: 0.6, solid: true, make: (p) => { const w = W(p, 8); const d = D(p, 1.2); return [b(0, 0.55, 0, w, 1.1, d, 0x3a2a1f), b(0, 1.12, 0, w + 0.1, 0.06, d + 0.1, 0xc9a24b), b(0, 1.8, -d / 2 + 0.1, w, 1.2, 0.1, 0x5a3a2a)]; } },
  // ---- kamar mandi
  toilet: { hx: 0.2, hz: 0.35, solid: true, parts: [b(0, 0.22, 0.05, 0.4, 0.4, 0.55, WHITE), b(0, 0.5, -0.25, 0.4, 0.5, 0.18, WHITE)] },
  vanity: { hx: 0.4, hz: 0.25, solid: true, parts: [b(0, 0.4, 0, 0.8, 0.8, 0.5, 0xe8e2d6), b(0, 0.82, 0.02, 0.5, 0.06, 0.35, WHITE), b(0, 1.45, -0.22, 0.7, 0.8, 0.03, 0xcfe6f0)] },
  shower: { hx: 0.4, hz: 0.4, solid: true, parts: [b(0, 0.04, 0, 0.8, 0.08, 0.8, 0xdfe5e8), b(0.39, 1.0, 0, 0.02, 2.0, 0.8, GLASS), b(0, 1.0, 0.39, 0.8, 2.0, 0.02, GLASS), b(-0.3, 2.05, -0.3, 0.15, 0.05, 0.15, 0x9aa0a6)] },
  bathtub: { hx: 0.8, hz: 0.4, solid: true, parts: [b(0, 0.28, 0, 1.6, 0.56, 0.8, WHITE), b(0, 0.5, 0, 1.4, 0.04, 0.6, 0xcfe9f5)] },
  tub: { hx: 1.5, hz: 1.0, solid: true, parts: [b(0, 0.3, 0, 3, 0.6, 2, WHITE), b(0, 0.58, 0, 2.6, 0.04, 1.6, 0x35a7d9)] }, // bak rendam spa
  // ---- penyimpanan, dekorasi
  wardrobe: { hx: 0.6, hz: 0.3, solid: true, parts: [b(0, 1.1, 0, 1.2, 2.2, 0.6, OAK), b(0, 1.1, 0.31, 0.02, 2.0, 0.02, 0x5a4630), b(-0.1, 1.1, 0.32, 0.03, 0.2, 0.03, 0xc9a24b), b(0.1, 1.1, 0.32, 0.03, 0.2, 0.03, 0xc9a24b)] },
  dresser: { hx: 0.6, hz: 0.25, solid: true, parts: [b(0, 0.4, 0, 1.2, 0.8, 0.5, OAK), b(0, 1.3, -0.22, 1.0, 0.9, 0.03, 0xcfe6f0)] },
  tv_unit: { hx: 0.7, hz: 0.25, solid: true, parts: [b(0, 0.25, 0, 1.4, 0.5, 0.5, 0x5a4630), b(0, 0.6, 0, 0.2, 0.2, 0.1, DARK), b(0, 1.0, 0.02, 1.2, 0.7, 0.06, 0x0b0b0e), b(0, 1.0, 0.0, 1.26, 0.76, 0.04, DARK)] }, // layar menghadap +z
  lamp: { hx: 0.15, hz: 0.15, solid: true, parts: [b(0, 0.8, 0, 0.04, 1.6, 0.04, 0x2b2b2e), b(0, 1.55, 0, 0.35, 0.3, 0.35, 0xffe2a8)] },
  plant: { hx: 0.3, hz: 0.3, solid: true, parts: [b(0, 0.25, 0, 0.5, 0.5, 0.5, 0xc97d54), b(0, 0.8, 0, 0.7, 0.7, 0.7, 0x3f8a3a), b(0.12, 1.15, 0.05, 0.45, 0.45, 0.45, 0x4e9a44)] },
  rug: { hx: 1, hz: 1, solid: false, flat: true, make: (p) => [b(0, 0.075, 0, W(p, 2), 0.02, D(p, 2), p.color ?? 0xb89a72)] },
  ac_unit: { hx: 0.45, hz: 0.12, solid: false, wall: true, parts: [b(0, 2.55, 0, 0.9, 0.28, 0.2, 0xf3f3f3), b(0, 2.46, 0.1, 0.8, 0.03, 0.02, 0x9aa0a6)] }, // pendingin dinding; menghadap +z
  ceiling_lamp: { hx: 0.3, hz: 0.3, solid: false, flat: true, parts: [b(0, 3.86, 0, 0.6, 0.06, 0.6, LAMP_COLOR)] },
  whiteboard: { hx: 1.5, hz: 0.04, solid: false, wall: true, make: (p) => [b(0, 1.6, 0, W(p, 3), 1.0, 0.04, WHITE), b(0, 1.6, -0.01, W(p, 3) + 0.1, 1.1, 0.03, 0x555b61)] },
  luggage_cart: { hx: 0.45, hz: 0.3, solid: true, parts: [b(0, 0.35, 0, 0.9, 0.05, 0.6, 0xc9a24b), b(-0.42, 0.9, 0, 0.04, 1.2, 0.04, 0xc9a24b), b(0.42, 0.9, 0, 0.04, 1.2, 0.04, 0xc9a24b), b(0, 1.5, 0, 0.9, 0.04, 0.04, 0xc9a24b), b(0, 0.55, 0, 0.7, 0.4, 0.45, 0x5a3a2a)] },
  // ---- ballroom, pertemuan, ibadah
  stage: { hx: 7, hz: 2, solid: true, make: (p) => [b(0, 0.45, 0, W(p, 14), 0.9, D(p, 4), 0x5a3a2a), b(0, 0.92, 0, W(p, 14) - 0.2, 0.04, D(p, 4) - 0.2, 0x7a1f2b)] },
  podium: { hx: 0.4, hz: 0.3, solid: true, parts: [b(0, 0.55, 0, 0.8, 1.1, 0.6, 0x5a3a2a), b(0, 1.12, 0, 0.9, 0.04, 0.7, 0xc9a24b)] },
  arch: { hx: 2, hz: 0.2, solid: false, wall: true, make: (p) => { const w = W(p, 4); return [b(-w / 2, 1.3, 0, 0.2, 2.6, 0.2, CREAM), b(w / 2, 1.3, 0, 0.2, 2.6, 0.2, CREAM), b(0, 2.65, 0, w + 0.3, 0.3, 0.25, 0xe8b4c0), b(-w / 2, 2.2, 0.05, 0.4, 0.5, 0.3, 0xd96a8a), b(w / 2, 2.2, 0.05, 0.4, 0.5, 0.3, 0xd96a8a)]; } },
  mihrab: { hx: 1.2, hz: 0.1, solid: false, wall: true, make: (p) => { const w = W(p, 2.4); return [b(0, 1.5, 0, w, 3.0, 0.12, 0x2e6b4f), b(0, 1.4, 0.05, w * 0.6, 2.2, 0.05, CREAM), b(0, 2.75, 0.07, w * 0.7, 0.4, 0.06, 0xc9a24b)]; } },
  mimbar: { hx: 0.5, hz: 0.8, solid: true, parts: [b(0, 0.4, 0.3, 1.0, 0.8, 1.0, OAK), b(0, 1.2, -0.4, 1.0, 2.4, 0.5, OAK), b(0, 2.5, -0.4, 1.2, 0.2, 0.7, 0xc9a24b)] },
  shoe_rack: { hx: 0.6, hz: 0.2, solid: true, parts: [b(0, 0.5, 0, 1.2, 1.0, 0.4, WOOD), b(0, 0.35, 0.21, 1.1, 0.04, 0.02, 0x3a2a1f), b(0, 0.7, 0.21, 1.1, 0.04, 0.02, 0x3a2a1f)] },
  screen: { hx: 6, hz: 0.1, solid: false, wall: true, make: (p) => [b(0, 2.2, -0.03, W(p, 12) + 0.3, 3.5, 0.06, 0x111111), b(0, 2.2, 0.02, W(p, 12), 3.2, 0.04, 0xf0f0f0)] },
  // ---- dapur, restoran
  kitchen_counter: { hx: 1.2, hz: 0.4, solid: true, parts: [b(0, 0.45, 0, 2.4, 0.9, 0.8, STEEL), b(0, 0.92, 0, 2.45, 0.04, 0.85, 0xd9dde0)] },
  stove: { hx: 0.45, hz: 0.4, solid: true, parts: [b(0, 0.45, 0, 0.9, 0.9, 0.8, 0x3a3d44), b(-0.2, 0.92, 0.05, 0.28, 0.03, 0.28, 0x111111), b(0.2, 0.92, 0.05, 0.28, 0.03, 0.28, 0x111111), b(0, 1.5, -0.3, 0.8, 0.3, 0.2, STEEL)] },
  fridge: { hx: 0.45, hz: 0.4, solid: true, parts: [b(0, 1.0, 0, 0.9, 2.0, 0.8, 0xdfe3e6), b(0.35, 1.2, 0.41, 0.04, 0.6, 0.03, 0x555b61)] },
  // ---- spa, kebugaran
  massage_bed: { hx: 0.45, hz: 1.0, solid: true, parts: [b(0, 0.45, 0, 0.9, 0.1, 2.0, 0xf3ece0), b(0, 0.22, 0, 0.8, 0.44, 1.9, WOOD), b(0, 0.55, -0.85, 0.3, 0.06, 0.3, 0xe8dcc0)] },
  salon_chair: { hx: 0.35, hz: 0.35, solid: true, parts: [b(0, 0.45, 0, 0.6, 0.12, 0.6, 0x1b1d22), b(0, 0.9, -0.25, 0.6, 0.8, 0.1, 0x1b1d22), b(0, 0.2, 0, 0.15, 0.4, 0.15, 0xb9bdc3)] },
  mirror_station: { hx: 0.7, hz: 0.2, solid: true, parts: [b(0, 0.45, 0, 1.4, 0.9, 0.4, 0xe8e2d6), b(0, 1.5, -0.17, 1.2, 1.0, 0.03, 0xcfe6f0)] },
  sauna_bench: { hx: 3, hz: 0.35, solid: true, make: (p) => { const w = W(p, 6); const d = D(p, 0.7); return [b(0, 0.45, 0, w, 0.06, d, 0xb98a54), b(0, 0.22, 0, w, 0.44, d - 0.1, 0x9a6f3f)]; } },
  sauna_stove: { hx: 0.4, hz: 0.4, solid: true, parts: [b(0, 0.4, 0, 0.8, 0.8, 0.8, 0x555b61), b(0, 0.85, 0, 0.6, 0.1, 0.6, 0x777777)] },
  lounger: { hx: 0.35, hz: 0.95, solid: true, parts: [b(0, 0.3, 0, 0.66, 0.12, 1.9, 0xf2f0ea), b(0, 0.5, -0.7, 0.62, 0.4, 0.1, 0xf2f0ea), b(0, 0.14, 0, 0.5, 0.28, 1.6, 0xd8d4ca)] },
  treadmill: { hx: 0.4, hz: 0.9, solid: true, parts: [b(0, 0.15, 0, 0.7, 0.3, 1.8, DARK), b(0, 0.32, 0, 0.55, 0.04, 1.4, 0x111111), b(0, 1.0, 0.75, 0.6, 0.5, 0.15, 0x1b1d22), b(-0.3, 0.8, 0.7, 0.05, 1.0, 0.1, 0xb9bdc3), b(0.3, 0.8, 0.7, 0.05, 1.0, 0.1, 0xb9bdc3)] },
  exercise_bike: { hx: 0.35, hz: 0.55, solid: true, parts: [b(0, 0.35, 0, 0.5, 0.7, 0.9, DARK), b(0, 1.1, -0.35, 0.3, 0.2, 0.3, 0x1b1d22), b(0, 1.0, 0.35, 0.4, 0.1, 0.1, 0xb9bdc3)] },
  bench_press: { hx: 0.5, hz: 0.9, solid: true, parts: [b(0, 0.4, 0, 0.4, 0.1, 1.6, DARK), b(-0.35, 0.9, -0.4, 0.08, 1.0, 0.08, 0xb9bdc3), b(0.35, 0.9, -0.4, 0.08, 1.0, 0.08, 0xb9bdc3), b(0, 1.3, -0.4, 1.8, 0.06, 0.06, 0xb9bdc3), b(-0.8, 1.3, -0.4, 0.1, 0.5, 0.5, 0x111111), b(0.8, 1.3, -0.4, 0.1, 0.5, 0.5, 0x111111)] },
  weight_rack: { hx: 0.9, hz: 0.3, solid: true, parts: [b(0, 0.6, 0, 1.8, 1.2, 0.6, DARK), b(-0.5, 1.25, 0.05, 0.3, 0.2, 0.2, 0xd02420), b(0, 1.25, 0.05, 0.3, 0.2, 0.2, 0x2b6cd0), b(0.5, 1.25, 0.05, 0.3, 0.2, 0.2, 0xd0a020)] },
  // ---- belanja, anak, hiburan, perpustakaan
  shelf: { hx: 2, hz: 0.25, solid: true, make: (p) => { const w = W(p, 4); const d = D(p, 0.5); return [b(0, 1.0, 0, w, 2.0, d, WOOD), b(0, 1.5, d / 2 + 0.01, w * 0.94, 0.3, 0.02, 0xa23b3b), b(0, 1.1, d / 2 + 0.01, w * 0.94, 0.3, 0.02, 0x2d5aa0), b(0, 0.7, d / 2 + 0.01, w * 0.94, 0.3, 0.02, 0xc9a24b), b(0, 0.3, d / 2 + 0.01, w * 0.94, 0.3, 0.02, 0x3f7d36)]; } },
  gondola: { hx: 1.5, hz: 0.3, solid: true, make: (p) => { const w = W(p, 3); const d = D(p, 0.6); return [b(0, 0.8, 0, w, 1.6, d, 0xe9e4da), b(0, 1.3, d / 2 + 0.01, w * 0.9, 0.25, 0.02, 0xd96a8a), b(0, 0.95, d / 2 + 0.01, w * 0.9, 0.25, 0.02, 0x4aa7c9), b(0, 0.6, d / 2 + 0.01, w * 0.9, 0.25, 0.02, 0xf0c75e), b(0, 0.25, d / 2 + 0.01, w * 0.9, 0.25, 0.02, 0x7aa05a)]; } },
  mannequin: { hx: 0.25, hz: 0.25, solid: true, parts: [b(0, 0.03, 0, 0.5, 0.06, 0.5, 0x222222), b(0, 1.0, 0, 0.3, 1.2, 0.2, 0xe8d2b0), b(0, 1.0, 0, 0.36, 0.5, 0.24, 0x9b2f3a), b(0, 1.75, 0, 0.2, 0.22, 0.2, 0xe8d2b0)] },
  arcade: { hx: 0.4, hz: 0.4, solid: true, parts: [b(0, 0.9, 0, 0.8, 1.8, 0.8, 0x1b2a6b), b(0, 1.2, 0.4, 0.6, 0.5, 0.03, 0x3ad1ff), b(0, 0.9, 0.42, 0.7, 0.12, 0.1, 0xd02420)] },
  pool_table: { hx: 1.2, hz: 0.65, solid: true, parts: [b(0, 0.8, 0, 2.4, 0.2, 1.3, 0x5a3a2a), b(0, 0.92, 0, 2.2, 0.04, 1.1, 0x1f6b3a), ...legs(2.3, 1.2, 0.7, 0.14, 0x3a2a1f)] },
  toy_block: { hx: 0.4, hz: 0.4, solid: true, parts: [b(0, 0.2, 0, 0.4, 0.4, 0.4, 0xe85d4a), b(0.3, 0.15, 0.1, 0.3, 0.3, 0.3, 0x4aa7c9), b(-0.2, 0.15, -0.25, 0.3, 0.3, 0.3, 0xf0c75e)] },
  play_house: { hx: 0.7, hz: 0.7, solid: true, parts: [b(0, 0.6, 0, 1.4, 1.2, 1.4, 0xf0c75e), b(0, 1.3, 0, 1.6, 0.2, 1.6, 0xe85d4a), b(0, 0.5, 0.71, 0.5, 0.9, 0.02, 0x7a4a2f)] },
};

for (const [type, def] of Object.entries(PROP_DEFS)) def.type = type;

export const PROP_TYPES = Object.freeze(Object.keys(PROP_DEFS));

/** Bagian kotak sebuah perabot (kerangka lokal). */
export function propParts(p) {
  const def = PROP_DEFS[p.type];
  return def.make ? def.make(p) : def.parts;
}

/** Setengah ukuran (hx, hz) sebelum diputar. */
export function propHalf(p) {
  const def = PROP_DEFS[p.type];
  return { hx: p.w != null ? p.w / 2 : def.hx, hz: p.d != null ? p.d / 2 : def.hz };
}

/** Persegi tabrakan sumbu-sejajar di dunia (memperhitungkan putaran ry). */
export function propRect(p) {
  const { hx, hz } = propHalf(p);
  const c = Math.abs(Math.cos(p.ry ?? 0));
  const s = Math.abs(Math.sin(p.ry ?? 0));
  const ex = c * hx + s * hz;
  const ez = s * hx + c * hz;
  return { minX: p.x - ex, maxX: p.x + ex, minZ: p.z - ez, maxZ: p.z + ez };
}
