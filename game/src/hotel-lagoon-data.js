// Data murni "Taman Air Terjun & Kolam Lagoon" NIKORA Grand Hotel (tanpa THREE, supaya dipakai denah/tabrakan, renderer, dan suara sekaligus,
// dan mudah diuji di Node). Letaknya di sudut tenggara tapak: lahan kosong di timur menara, tepat di selatan Royal Garage, dan menghadap jalan
// Lingkar sehingga tebing air terjunnya terlihat dari kejauhan. Satuan meter, bingkai koordinat hotel (x ke timur, z ke selatan, utara = -z).
// Sengaja TIDAK mengimpor hotel-layout.js (hotel-layout.js yang mengimpor modul ini untuk tabrakan dan zona; hotel-lagoon-data.test.js yang
// mencocokkan angka-angka ini dengan tapak, menara, parkir, dan Royal Garage).
//
// Susunan (dari barat ke timur): dek travertin dengan kabana dan kursi berjemur -> dermaga kayu menjorok ke kolam -> kolam lagoon 38 x 46 m
// -> tebing berundak setinggi 15,5 m dengan satu air terjun besar di tengah dan dua air terjun kecil di sisinya.

export const LAGOON_RECT = Object.freeze([82, 504, 148, 564]); // seluruh taman: dek, kolam, tebing
export const DECK_Y = 0.06; // tinggi permukaan dek (pemain berjalan di y = 0, sama seperti halaman drop-off)

export const LAGOON_POOL = Object.freeze({
  rect: Object.freeze([100, 512, 138, 558]),
  x: 119, z: 535, width: 38, depth: 46,
  waterY: -0.12, // 18 cm di bawah dek, seperti pool-demo-main.js
  floorY: -1.6,
  shelfY: -0.55, // "tanning ledge": bagian dangkal di sisi barat
  design: 'lagoon', // pool-water-logic.js
});

// Dermaga dari dek barat ke tengah kolam, berujung di peron pandang beberapa meter dari kaki air terjun.
export const PIER = Object.freeze({
  x0: 98, x1: 133, z0: 533, z1: 537, top: 0.12,
  platform: Object.freeze([129, 531.5, 133, 538.5]),
});
export const PIER_WALK = Object.freeze([Object.freeze([100, 533, 129, 537]), PIER.platform]); // bagian kolam yang boleh diinjak

// Tebing: muka barat di x = faceX, punggung di x = backX; profil tinggi per jalur z: [z0, z1, tinggi].
export const CLIFF = Object.freeze({
  faceX: 138, backX: 148,
  profile: Object.freeze([
    [510, 518, 3.2], [518, 524, 6.5], [524, 530, 10.5], [530, 540, 15.5], [540, 546, 10.5], [546, 552, 6.5], [552, 558, 3.2],
  ].map((p) => Object.freeze(p))),
});
export const CLIFF_TOP = 15.5;

/** Air terjun: bidang air jatuh dari bibir tebing (top) ke permukaan kolam; bulge = seberapa jauh air melengkung ke barat sebelum mendarat. */
export const FALLS = Object.freeze([
  { id: 'main', x: CLIFF.faceX, z: 535, width: 10, top: CLIFF_TOP, bulge: 1.8, weight: 1 },
  { id: 'north', x: CLIFF.faceX, z: 521, width: 2.6, top: 6.5, bulge: 1.0, weight: 0.45 },
  { id: 'south', x: CLIFF.faceX, z: 549, width: 2.6, top: 6.5, bulge: 1.0, weight: 0.45 },
].map((f) => Object.freeze({ ...f, bottom: LAGOON_POOL.waterY, landX: f.x - f.bulge })));

// ---------------------------------------------------------------- tabrakan
const rectToCollider = (r) => Object.freeze({ minX: r[0], maxX: r[2], minZ: r[1], maxZ: r[3] });
const box = (x, z, hx, hz) => rectToCollider([x - hx, z - hz, x + hx, z + hz]);

// Kolam tidak bisa dimasuki: seluruh persegi air tertutup kecuali dermaga dan peron.
export const WATER_BLOCKS = Object.freeze([
  [100, 512, 129, 533], [129, 512, 138, 531.5], // utara dermaga
  [100, 537, 129, 558], [129, 538.5, 138, 558], // selatan dermaga
  [133, 531.5, 138, 538.5], // ujung peron sampai kaki air terjun
].map(Object.freeze));

/** Titik (x, z) di atas dermaga atau peron. */
export const onPier = (x, z) => PIER_WALK.some((r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]);
/** Titik (x, z) di atas air kolam (di dalam persegi kolam, bukan dermaga). */
export const inPoolWater = (x, z) => {
  const r = LAGOON_POOL.rect;
  return x > r[0] && x < r[2] && z > r[1] && z < r[3] && !onPier(x, z);
};

// Jalur tanam di tepi utara dan selatan dek (semak dan palem).
export const PLANTERS = Object.freeze([[84, 504, 148, 505.4], [84, 562.6, 148, 564]].map(Object.freeze));

// Palem di jalur tanam (tanpa tabrakan sendiri) dan dua palem di sudut dek dekat tebing (dengan tabrakan batang).
const PLANTER_PALM_X = [90, 103, 116, 129, 142];
export const PALMS = Object.freeze([
  ...PLANTER_PALM_X.map((x, i) => ({ x, z: 505, h: 7.5 + (i % 3) * 1.1, solid: false })),
  ...PLANTER_PALM_X.map((x, i) => ({ x, z: 563.2, h: 8 + ((i + 1) % 3) * 1.1, solid: false })),
  { x: 143.2, z: 508.2, h: 9.5, solid: true },
  { x: 143.2, z: 559.8, h: 9, solid: true },
].map((p, i) => Object.freeze({ ...p, lean: ((i * 37) % 11 - 5) * 0.012, turn: i * 1.7 })));

// Kursi berjemur. axis 'z' = panjang kursi sejajar sumbu z (kolom di barat kolam, menghadap timur); axis 'x' = baris di utara/selatan kolam.
const LOUNGER_HALF = Object.freeze({ long: 1.0, short: 0.45 });
const mkLounger = (x, z, axis, face) => Object.freeze({ x, z, axis, face });
export const LOUNGERS = Object.freeze([
  ...[514.5, 517.7, 520.9, 524.1, 527.3, 542.7, 545.9, 549.1, 552.3, 555.5].map((z) => mkLounger(96.8, z, 'z', 'timur')),
  ...[104, 108.5, 113, 117.5, 122, 126.5, 131].map((x) => mkLounger(x, 508.6, 'x', 'selatan')),
  ...[104, 108.5, 113, 117.5, 122, 126.5, 131].map((x) => mkLounger(x, 561.4, 'x', 'utara')),
]);
export const loungerRect = (l) => (l.axis === 'z'
  ? [l.x - LOUNGER_HALF.short, l.z - LOUNGER_HALF.long, l.x + LOUNGER_HALF.short, l.z + LOUNGER_HALF.long]
  : [l.x - LOUNGER_HALF.long, l.z - LOUNGER_HALF.short, l.x + LOUNGER_HALF.long, l.z + LOUNGER_HALF.short]);

// Payung di sela-sela kursi berjemur.
export const PARASOLS = Object.freeze([
  ...[516.1, 522.5, 544.3, 550.7].map((z) => ({ x: 96.8, z })),
  ...[106.25, 115.25, 124.25].flatMap((x) => [{ x, z: 508.6 }, { x, z: 561.4 }]),
].map(Object.freeze));

// Kabana mewah: atap krem berpinggir emas, tirai, dan ranjang tidur siang. Pusat (x, z), denah 6 x 6 m.
export const CABANAS = Object.freeze([[88.5, 515.5], [88.5, 524.5], [88.5, 545.5], [88.5, 554.5]].map(([x, z]) => Object.freeze({ x, z, half: 3 })));
const CABANA_POST = 2.7;
export const cabanaColliders = (c) => [
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(c.x + sx * CABANA_POST, c.z + sz * CABANA_POST, 0.2, 0.2))),
  box(c.x - 0.2, c.z, 1.3, 1.0), // ranjang
];

// Papan nama di pintu masuk barat (menghadap barat, ke arah tamu yang datang dari menara).
export const SIGN = Object.freeze({ x: 83.2, z: 531, width: 3.4, text: 'NIKORA LAGOON', sub: 'Air Terjun & Kolam Renang' });

// ---------------------------------------------------------------- batu dan tebing (deterministik)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const ROCK_COLORS = Object.freeze([0x8a867f, 0x77736d, 0x6a665f, 0x948f86, 0x5e5a54]);

let cliffCache = null;
/** Balok badan tebing: satu per jalur profil, ditambah pita lapisan batu yang menonjol sedikit di muka tebing (tidak di lebar air terjun). */
export function cliffBlocks() {
  if (cliffCache) return cliffCache;
  const rand = mulberry32(4242);
  const out = [];
  CLIFF.profile.forEach(([z0, z1, h], i) => {
    const fall = FALLS.find((f) => f.z > z0 && f.z < z1); // air terjun yang jatuh di jalur ini (bila ada)
    const jitter = fall ? 0 : rand() * 0.5;
    out.push({ minX: CLIFF.faceX - jitter, maxX: CLIFF.backX, minY: -1.6, maxY: h, minZ: z0, maxZ: z1, color: ROCK_COLORS[i % ROCK_COLORS.length] });
    // pita lapisan batu hanya di bagian yang tidak dilewati air
    const parts = fall ? [[z0, fall.z - fall.width / 2 - 0.4], [fall.z + fall.width / 2 + 0.4, z1]] : [[z0, z1]];
    for (let y = 1.7; y < h - 0.4; y += 1.7) {
      for (const [a, b] of parts) if (b - a > 0.6) out.push({ minX: CLIFF.faceX - jitter - 0.18, maxX: CLIFF.backX, minY: y, maxY: y + 0.32, minZ: a, maxZ: b, color: 0x4f4b46 });
    }
  });
  cliffCache = Object.freeze(out.map(Object.freeze));
  return cliffCache;
}

export const CLIFF_COLLIDERS = Object.freeze(CLIFF.profile.map(([z0, z1]) => rectToCollider([CLIFF.faceX, z0, CLIFF.backX, z1])));

let rockCache = null;
/** Batu bulat bersegi: di puncak tebing, di kolam penampung kaki air terjun (setengah terendam), dan di sudut dek. */
export function lagoonRocks() {
  if (rockCache) return rockCache;
  const rand = mulberry32(2026);
  const out = [];
  const add = (x, y, z, s, color) => out.push(Object.freeze({ x, y, z, sx: s * (0.9 + rand() * 0.5), sy: s * (0.6 + rand() * 0.4), sz: s * (0.9 + rand() * 0.5), ry: rand() * Math.PI, color: color ?? ROCK_COLORS[Math.floor(rand() * ROCK_COLORS.length)] }));
  // puncak tebing
  for (const [z0, z1, h] of CLIFF.profile) for (let k = 0; k < 2; k++) add(CLIFF.faceX + 1.5 + rand() * 7, h + 0.1, z0 + 0.8 + rand() * (z1 - z0 - 1.6), 0.9 + rand() * 1.1);
  // kolam penampung (setengah terendam; di luar lebar air terjun)
  for (const z of [527.6, 542.4, 523.2, 546.8, 517.5, 552.5, 513.8, 556.2]) add(135.2 + rand() * 2.4, LAGOON_POOL.waterY - 0.2, z, 0.8 + rand() * 0.8);
  // sudut dek (bertabrakan lewat DECK_ROCK_COLLIDERS)
  for (const [x, z] of DECK_ROCKS) add(x, 0.3, z, 1.0 + rand() * 0.4);
  rockCache = Object.freeze(out);
  return rockCache;
}
export const DECK_ROCKS = Object.freeze([[141, 506.8], [146, 507.4], [141, 561.2], [146, 560.6]].map(Object.freeze));
const DECK_ROCK_COLLIDERS = DECK_ROCKS.map(([x, z]) => box(x, z, 0.9, 0.9));

// ---------------------------------------------------------------- gabungan tabrakan
/** Semua penghalang taman (persegi sejajar sumbu). Dipakai hotel-layout.js di lantai dasar. */
export const LAGOON_COLLIDERS = Object.freeze([
  ...WATER_BLOCKS.map(rectToCollider),
  ...CLIFF_COLLIDERS,
  ...PLANTERS.map(rectToCollider),
  ...LOUNGERS.map((l) => rectToCollider(loungerRect(l))),
  ...CABANAS.flatMap(cabanaColliders),
  ...PALMS.filter((p) => p.solid).map((p) => box(p.x, p.z, 0.4, 0.4)),
  ...DECK_ROCK_COLLIDERS,
  box(SIGN.x, SIGN.z - 1.6, 0.2, 0.2), box(SIGN.x, SIGN.z + 1.6, 0.2, 0.2),
]);

/** Titik tujuan menu Jelajah: di dermaga, menghadap kolam dan air terjun. */
export const LAGOON_VIEW = Object.freeze({ x: 108, z: 535 });

// ---------------------------------------------------------------- suara air terjun
// Sumber suara = titik pendaratan tiap air terjun; yang utama paling keras. Volume dari jarak: penuh dalam 8 m, hening di atas 120 m.
export const FALL_SOUND_MAX = 0.17;
export const SOUND_SOURCES = Object.freeze(FALLS.map((f) => Object.freeze({ id: f.id, x: f.landX, z: f.z, weight: f.weight })));

/** Volume (0..max) menurut jarak ke sumber. */
export function waterfallGain(distance, max = FALL_SOUND_MAX) {
  if (!Number.isFinite(distance)) return 0;
  const k = Math.min(1, Math.max(0, (120 - distance) / 112));
  return max * k * k;
}

/** Sumber terkuat bagi pendengar di (x, z): { source, distance, gain }. gain sudah dikali bobot sumber. */
export function loudestSource(x, z) {
  let best = { source: SOUND_SOURCES[0], distance: Infinity, gain: 0 };
  for (const s of SOUND_SOURCES) {
    const distance = Math.hypot(x - s.x, z - s.z);
    const gain = waterfallGain(distance) * s.weight;
    if (gain > best.gain || best.distance === Infinity) best = { source: s, distance, gain };
  }
  return best;
}

/**
 * Volume akhir: hening saat tidak aktif (di lantai atas, di dalam perjalanan), diredam 85% di dalam bangunan, dan lebih lirih di dalam kabin mobil.
 * indoor 0..1 (indoorK), cabin = kamera di dalam kabin mobil, rain 0..1 (hujan membuat air terjun lebih deras).
 */
export function lagoonSoundLevel({ x, z, active = true, indoor = 0, cabin = false, rain = 0 }) {
  if (!active) return { gain: 0, distance: Infinity, source: null };
  const near = loudestSource(x, z);
  const i = Math.min(1, Math.max(0, indoor));
  const r = Math.min(1, Math.max(0, rain));
  return { gain: near.gain * (1 - 0.85 * i) * (cabin ? 0.5 : 1) * (1 + 0.3 * r), distance: near.distance, source: near.source }; // hujan: debit air terjun naik 30%
}

/** Panning stereo -1 (kiri) .. 1 (kanan): pendengar di (x, z) menghadap vektor (fx, fz); dekat sumber kembali ke tengah. */
export function soundPan({ x, z, fx, fz }, source) {
  const dx = source.x - x;
  const dz = source.z - z;
  const d = Math.hypot(dx, dz);
  const f = Math.hypot(fx, fz);
  if (d < 1e-6 || f < 1e-6) return 0;
  // kanan pendengar (x ke timur, z ke selatan, melihat ke utara = (0,-1) -> kanan = timur) = (-fz, fx)
  const right = (-fz / f) * (dx / d) + (fx / f) * (dz / d);
  return Math.max(-1, Math.min(1, right * Math.min(1, d / 12)));
}
