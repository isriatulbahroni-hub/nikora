// Denah NIKORA Wedding Villa (satuan meter). x ke timur, z ke selatan (utara = -z).
// Modul ini murni data + matematika (tanpa THREE) supaya dipakai bersama oleh
// klien (render, tabrakan) dan server (validasi gerak otoritatif).
//
// Vila bertingkat 3 lantai (level 0, 1, 2). Lantai atas dicapai lewat empat menara tangga
// (dua lengan tangga lurus per menara). Status pemain: { x, z, level, stair, y }.

export const WALL_THICKNESS = 0.3;
export const WALL_HEIGHT = 3.0;
export const LEVEL_HEIGHT = 3.4; // jarak antar lantai (tinggi permukaan lantai)
export const LEVEL_COUNT = 3;
export const levelY = (level) => (level ?? 0) * LEVEL_HEIGHT;
export const PLAYER_RADIUS = 0.4;
// BOUNDS = kompleks vila (pagar keliling, peta mini). Pemain TIDAK terkurung di sini: boleh keluar lewat gerbang
// dan menjelajah di luar. WORLD_LIMIT hanya pengaman jarak (angka tak terbatas/ulah klien), bukan tembok.
export const BOUNDS = Object.freeze({ minX: -42, maxX: 42, minZ: -26, maxZ: 42 });
export const WORLD_LIMIT = Object.freeze({ minX: -600, maxX: 600, minZ: -600, maxZ: 600 });
export const GATE_HALF_WIDTH = 3.2; // bukaan gerbang di pagar selatan
export const SPAWN = Object.freeze({ x: 0, z: 37 });
// Layar tancap di belakang pelaminan villa (di balik dinding utara aula, z = -20). Tiang berdiri di balik dedaunan pelaminan.
export const VILLA_SCREEN = Object.freeze({ x: 0, y: 4.3, z: -19.7, ry: 0, width: 6, height: 3.375, posts: true });
export const SIT_RANGE = 1.9; // jarak maksimum ke kursi/sofa/tempat tidur agar boleh duduk atau tidur
export const SEATED_DROP = -0.3; // avatar duduk sedikit lebih rendah

const GUEST_COLS = [16, 21.5, 27, 32.5, 38];

function guestRooms(level = 0) {
  const rooms = [];
  let n = level === 0 ? 1 : 9;
  for (const [z1, z2] of [[4, 12], [14, 22]]) {
    for (let i = 0; i < 4; i++) {
      rooms.push({ id: `guest_${n}`, name: `Guest Room ${n}`, kind: 'guest', level, rect: [GUEST_COLS[i], z1, GUEST_COLS[i + 1], z2] });
      n++;
    }
  }
  return rooms;
}

export const ROOMS = Object.freeze([
  { id: 'spa', name: 'Spa & Wellness', kind: 'spa', rect: [-38, -20, -26, -3] },
  { id: 'main_suite', name: 'Main Suite', kind: 'suite', rect: [-26, -20, -14, -3] },
  { id: 'wedding_hall', name: 'Wedding Hall (Indoor)', kind: 'hall', rect: [-14, -20, 14, -3] },
  { id: 'lobby', name: 'Lobby / Reception', kind: 'lobby', rect: [14, -20, 26, -3] },
  { id: 'bridal_room', name: 'Bridal Room', kind: 'bridal', rect: [26, -20, 38, -3] },
  { id: 'restaurant', name: 'Restaurant & Cafe', kind: 'restaurant', rect: [-36, 4, -16, 20] },
  { id: 'kitchen', name: 'Kitchen', kind: 'kitchen', rect: [-36, 20, -26, 30] },
  { id: 'corridor', name: 'Guest Corridor', kind: 'corridor', rect: [16, 12, 38, 14] },
  ...guestRooms(0),
]);

// Area terbuka (dipakai untuk label lokasi dan lantai paving).
export const ZONES = Object.freeze([
  { id: 'bridge_pool', name: 'Pool & Garden', kind: 'pool', rect: [-7, 2, 7, 16] },
  { id: 'fountain_garden', name: 'Pool & Garden', kind: 'garden', rect: [-12, 16, 12, 42] },
  { id: 'parking', name: 'Parking Area', kind: 'parking', rect: [18, 24, 42, 42] },
  { id: 'courtyard', name: 'Main Courtyard', kind: 'courtyard', rect: [-42, -3, 42, 4] },
]);

// ---------------------------------------------------------------- menara tangga
// Tiap menara punya dua lengan tangga lurus (lantai 0->1 dan 1->2) menuju utara (z mengecil),
// dengan bordes di lantai 1 dan lantai 2. Pintu menuju bangunan ada di dinding yang berbatasan.
const RUN = 5.4; // panjang satu lengan tangga (naik 3.4 m)
const LANDING = 3.6; // panjang bordes lantai 1
const MOUTH = 0.7; // pintu masuk tangga: jarak awal sebelum pemain mulai menanjak

function makeTower({ id, name, x1, x2, stairX, dz1, zMin, zMax, groundDoorX, adj, l1DoorZ, l2DoorZ, l1DoorW, l2DoorW }) {
  const f1Top = dz1 - LANDING / 2 + LANDING; // sisi selatan bordes 1
  const f1Bottom = f1Top + RUN;
  const f2Bottom = dz1 - LANDING / 2; // sisi utara bordes 1
  const f2Top = f2Bottom - RUN;
  const mk = (suffix, from, zBottom, zTop) => ({
    id: `${id}_${suffix}`, tower: id, from, to: from + 1, x1: stairX[0], x2: stairX[1], zBottom, zTop,
    mouthBottom: [stairX[0], zBottom - MOUTH, stairX[1], zBottom],
    mouthTop: [stairX[0], zTop, stairX[1], zTop + MOUTH],
  });
  const stairs = [mk('a', 0, f1Bottom, f1Top), mk('b', 1, f2Bottom, f2Top)];
  const rect = [x1, zMin, x2, zMax];
  return {
    id, name, rect, stairs, adj,
    landings: { 1: [x1, f2Bottom, x2, f1Top], 2: [x1, zMin, x2, f2Top] },
    // ruang di bawah tangga lantai dasar tidak boleh dimasuki
    underBlock: [x1, zMin, x2, f1Bottom - MOUTH],
    groundDoor: { x: groundDoorX, z: zMax, orient: 'h', width: 1.8 },
    doors: {
      1: { x: adj, z: l1DoorZ, orient: 'v', width: l1DoorW },
      2: { x: adj, z: l2DoorZ, orient: 'v', width: l2DoorW },
    },
  };
}

export const TOWERS = Object.freeze([
  makeTower({ id: 'tower_w', name: 'Stair Tower West', x1: -41.6, x2: -38, stairX: [-41.2, -39.2], dz1: -10.4, zMin: -20, zMax: -3, groundDoorX: -39.8, adj: -38, l1DoorZ: -10.4, l2DoorZ: -18.8, l1DoorW: 1.6, l2DoorW: 1.4 }),
  makeTower({ id: 'tower_e', name: 'Stair Tower East', x1: 38, x2: 41.6, stairX: [39.2, 41.2], dz1: -10.4, zMin: -20, zMax: -3, groundDoorX: 39.8, adj: 38, l1DoorZ: -10.4, l2DoorZ: -18.8, l1DoorW: 1.6, l2DoorW: 1.4 }),
  makeTower({ id: 'tower_g', name: 'Stair Tower Guest Wing', x1: 38, x2: 41.6, stairX: [39.2, 41.2], dz1: 13, zMin: 4, zMax: 22, groundDoorX: 39.8, adj: 38, l1DoorZ: 13, l2DoorZ: 4.9, l1DoorW: 1.4, l2DoorW: 1.4 }),
  makeTower({ id: 'tower_r', name: 'Stair Tower Restaurant', x1: -41.6, x2: -36, stairX: [-41.2, -39.2], dz1: 14, zMin: 4, zMax: 22, groundDoorX: -39.8, adj: -36, l1DoorZ: 14, l2DoorZ: 5.4, l1DoorW: 1.6, l2DoorW: 1.4 }),
]);
export const STAIRS = Object.freeze(TOWERS.flatMap((t) => t.stairs));
const STAIR_BY_ID = new Map(STAIRS.map((s) => [s.id, s]));

const towerRooms = (level) => TOWERS.map((t) => ({ id: t.id, name: t.name, kind: 'stair', level, rect: t.rect, landing: t.landings[level] ?? null }));

// ---------------------------------------------------------------- lantai atas
// kind 'terrace' = teras terbuka tanpa dinding (pagar di tepi, tidak bisa melangkah keluar).
export const UPPER_ROOMS = Object.freeze([
  // lantai 1
  { id: 'yoga', name: 'Yoga & Lounge', kind: 'lounge', level: 1, rect: [-38, -20, -26, -3] },
  { id: 'exec_suite', name: 'Executive Suite', kind: 'suite', level: 1, rect: [-26, -20, -14, -3] },
  { id: 'library', name: 'Library Lounge', kind: 'library', level: 1, rect: [14, -20, 26, -3] },
  { id: 'honeymoon', name: 'Honeymoon Suite', kind: 'bridal', level: 1, rect: [26, -20, 38, -3] },
  { id: 'sky_cafe', name: 'Sky Cafe', kind: 'restaurant', level: 1, rect: [-36, 4, -16, 20] },
  { id: 'corridor_1', name: 'Guest Corridor', kind: 'corridor', level: 1, rect: [16, 12, 38, 14] },
  ...guestRooms(1),
  // lantai 2
  { id: 'terrace_w', name: 'Sky Terrace West', kind: 'terrace', level: 2, rect: [-38, -20, -14, -3] },
  { id: 'terrace_e', name: 'Sky Terrace East', kind: 'terrace', level: 2, rect: [14, -20, 26, -3] },
  { id: 'presidential', name: 'Presidential Suite', kind: 'suite', level: 2, rect: [26, -20, 38, -3] },
  { id: 'sky_garden', name: 'Sky Garden', kind: 'terrace', level: 2, rect: [16, 4, 38, 22] },
  { id: 'rooftop', name: 'Rooftop Lounge', kind: 'terrace', level: 2, rect: [-36, 4, -16, 20] },
]);

export const roomsAtLevel = (level) => (level === 0 ? [...ROOMS, ...towerRooms(0)] : [...UPPER_ROOMS.filter((r) => r.level === level), ...towerRooms(level)]);

// orient 'h': pintu pada dinding yang membentang sepanjang x (di koordinat z).
// orient 'v': pintu pada dinding yang membentang sepanjang z (di koordinat x).
const guestDoorXs = [0, 1, 2, 3].map((i) => (GUEST_COLS[i] + GUEST_COLS[i + 1]) / 2);
const GROUND_DOORS = [
  { x: 0, z: -3, orient: 'h', width: 5 }, // pintu utama aula
  { x: 14, z: -11, orient: 'v', width: 3 }, // aula <-> lobby
  { x: -14, z: -11, orient: 'v', width: 3 }, // aula <-> main suite
  { x: 26, z: -11, orient: 'v', width: 3 }, // lobby <-> bridal
  { x: -26, z: -11, orient: 'v', width: 3 }, // main suite <-> spa
  { x: 20, z: -3, orient: 'h', width: 3 }, // lobby ke luar
  { x: 32, z: -3, orient: 'h', width: 3 }, // bridal ke luar
  { x: -20, z: -3, orient: 'h', width: 3 }, // main suite ke luar
  { x: -32, z: -3, orient: 'h', width: 3 }, // spa ke luar
  { x: -16, z: 12, orient: 'v', width: 4 }, // restoran ke taman kolam
  { x: -26, z: 4, orient: 'h', width: 3 }, // restoran ke teras
  { x: -20, z: 20, orient: 'h', width: 3 }, // restoran ke taman selatan
  { x: -31, z: 20, orient: 'h', width: 2.5 }, // restoran <-> dapur
  { x: 16, z: 13, orient: 'v', width: 2 }, // koridor kamar tamu ke luar
  ...guestDoorXs.map((x) => ({ x, z: 12, orient: 'h', width: 1.6 })),
  ...guestDoorXs.map((x) => ({ x, z: 14, orient: 'h', width: 1.6 })),
  ...TOWERS.map((t) => t.groundDoor), // pintu masuk menara tangga
];
export const DOORS = Object.freeze(GROUND_DOORS);

export const UPPER_DOORS = Object.freeze([
  // lantai 1
  { level: 1, x: -26, z: -11, orient: 'v', width: 3 }, // yoga <-> suite
  { level: 1, x: 26, z: -11, orient: 'v', width: 3 }, // library <-> honeymoon
  ...guestDoorXs.map((x) => ({ level: 1, x, z: 12, orient: 'h', width: 1.6 })),
  ...guestDoorXs.map((x) => ({ level: 1, x, z: 14, orient: 'h', width: 1.6 })),
  ...TOWERS.map((t) => ({ level: 1, ...t.doors[1] })),
  // lantai 2
  { level: 2, x: 26, z: -11, orient: 'v', width: 3 }, // presidential <-> teras timur
  ...TOWERS.map((t) => ({ level: 2, ...t.doors[2] })),
]);

// Ukuran setengah (hx, hz) properti yang menghalangi jalan.
export const PROP_SPECS = Object.freeze({
  bed: { hx: 0.95, hz: 1.1 },
  table: { hx: 0.85, hz: 0.85 },
  desk: { hx: 1.8, hz: 0.5 },
  counter: { hx: 1.2, hz: 0.5 },
  tub: { hx: 1.5, hz: 1.0 },
  car: { hx: 0.95, hz: 2.1 },
  palm: { hx: 0.25, hz: 0.25 },
  sofa: { hx: 1.1, hz: 0.5 },
  lounger: { hx: 0.35, hz: 0.95 },
  tree: { hx: 0.3, hz: 0.3 },
});

function buildProps() {
  const props = [];
  for (const r of ROOMS) {
    if (r.kind !== 'guest') continue;
    const [x1, z1, x2, z2] = r.rect;
    const north = z1 < 10;
    props.push({ type: 'bed', x: (x1 + x2) / 2, z: north ? z1 + 1.5 : z2 - 1.5 });
  }
  props.push({ type: 'bed', x: -20, z: -17.8 }); // main suite
  props.push({ type: 'bed', x: 32, z: -17.8 }); // bridal room
  props.push({ type: 'tub', x: -34, z: -17 }); // spa
  props.push({ type: 'desk', x: 20, z: -17.5 }); // reception
  props.push({ type: 'sofa', x: 17.5, z: -7 }, { type: 'sofa', x: 22.5, z: -7 }); // lobby, menghadap utara
  for (const x of [-32, -20]) for (const z of [8, 16]) props.push({ type: 'table', x, z }); // restoran
  for (const z of [22.5, 26.5]) props.push({ type: 'counter', x: -31, z: z + 0 }, { type: 'counter', x: -28, z: z + 0 }); // dapur
  for (const x of [22, 26, 30, 34]) for (const z of [30, 37]) props.push({ type: 'car', x, z }); // parkir
  const palms = [
    [-10, 6], [-10, 12], [10, 6], [10, 12], [-6, 22], [6, 22], [-6, 34], [6, 34], [-6, 28], [6, 28],
    [-14, 24], [-22, 26], [-30, 34], [-36, 36], [-26, 38], [-18, 33], [-12, 38], [14, 24], [13, 36], [12, 30],
    [-40, -23.5], [-40, 28], [40, -23.5], [40, 26], [-40, 33], [-2.8, 40], [2.8, 40],
  ];
  for (const [x, z] of palms) props.push({ type: 'palm', x, z });

  // lantai 1
  for (const r of guestRooms(1)) {
    const [x1, z1, x2, z2] = r.rect;
    props.push({ type: 'bed', x: (x1 + x2) / 2, z: z1 < 10 ? z1 + 1.5 : z2 - 1.5, level: 1 });
  }
  props.push({ type: 'bed', x: -20, z: -17.8, level: 1 }, { type: 'bed', x: 32, z: -17.8, level: 1 });
  props.push({ type: 'sofa', x: 17.5, z: -7, level: 1 }, { type: 'sofa', x: 22.5, z: -7, level: 1 });
  for (const x of [-32, -20]) for (const z of [8, 16]) props.push({ type: 'table', x, z, level: 1 });
  // lantai 2
  props.push({ type: 'bed', x: 32, z: -17.8, level: 2 }, { type: 'sofa', x: 29, z: -7, level: 2 }, { type: 'sofa', x: 35, z: -7, level: 2 });
  for (const x of [20, 24, 28, 32]) props.push({ type: 'lounger', x, z: 8, level: 2 });
  for (const x of [-32, -20]) for (const z of [8, 16]) props.push({ type: 'table', x, z, level: 2 });
  return props.map((p) => ({ level: 0, ...p }));
}

/** Pagar keliling: padat (tidak bisa ditembus) kecuali bukaan gerbang di sisi selatan. */
function perimeterColliders() {
  const { minX, maxX, minZ, maxZ } = BOUNDS;
  const t = 0.25;
  const g = GATE_HALF_WIDTH;
  return [
    { minX: minX - t, maxX: maxX + t, minZ: minZ - t, maxZ: minZ + t },
    { minX: minX - t, maxX: minX + t, minZ, maxZ },
    { minX: maxX - t, maxX: maxX + t, minZ, maxZ },
    { minX: minX - t, maxX: -g, minZ: maxZ - t, maxZ: maxZ + t },
    { minX: g, maxX: maxX + t, minZ: maxZ - t, maxZ: maxZ + t },
    { minX: -g - 0.4, maxX: -g + 0.4, minZ: maxZ - 0.4, maxZ: maxZ + 0.4 }, // tiang gerbang
    { minX: g - 0.4, maxX: g + 0.4, minZ: maxZ - 0.4, maxZ: maxZ + 0.4 },
  ];
}

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

/** Pepohonan di luar vila (posisi tetap/deterministik). Jalan tanah dari gerbang ke selatan dibiarkan kosong. */
export const COUNTRYSIDE = Object.freeze({ trees: 240, radius: 320, margin: 14, roadHalf: 3.2, roadLength: 320 });
function buildCountryside() {
  const rand = mulberry32(20261012);
  const { minX, maxX, minZ, maxZ } = BOUNDS;
  const out = [];
  let guard = 0;
  while (out.length < COUNTRYSIDE.trees && guard++ < 20000) {
    const x = (rand() * 2 - 1) * COUNTRYSIDE.radius;
    const z = (rand() * 2 - 1) * COUNTRYSIDE.radius;
    if (x > minX - COUNTRYSIDE.margin && x < maxX + COUNTRYSIDE.margin && z > minZ - COUNTRYSIDE.margin && z < maxZ + COUNTRYSIDE.margin) continue;
    if (Math.abs(x) < COUNTRYSIDE.roadHalf + 2 && z > 0 && z < COUNTRYSIDE.roadLength) continue; // jalan
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < 4)) continue;
    out.push({ level: 0, type: 'tree', x, z, s: 0.8 + rand() * 0.7 });
  }
  return out;
}

export const HALL_SEATING = Object.freeze({ z0: -17, z1: -6, rowStep: 1.3, xInner: 2.4, xOuter: 11.2, colStep: 0.9 });

/** Posisi semua kursi tamu di aula pernikahan (dua blok, kiri dan kanan lorong). */
export function hallChairPositions() {
  const { z0, z1, rowStep, xInner, xOuter, colStep } = HALL_SEATING;
  const out = [];
  for (let z = z0; z <= z1 + 1e-6; z += rowStep) {
    for (let x = xInner; x <= xOuter + 1e-6; x += colStep) out.push({ x, z }, { x: -x, z });
  }
  return out;
}

// Titik duduk/tidur. id = indeks di larik ini (sama di klien dan server).
// rot mengikuti avatar: 0 = menghadap utara (-z). Untuk 'sleep', rot = arah kepala.
function buildSpots(props) {
  const spots = [];
  for (const c of hallChairPositions()) spots.push({ kind: 'sit', x: c.x, z: c.z, rot: 0, level: 0 });
  for (const t of props.filter((p) => p.type === 'table')) {
    for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) {
      spots.push({ kind: 'sit', x: t.x + dx, z: t.z + dz, rot: Math.atan2(dx, dz), level: t.level }); // menghadap meja
    }
  }
  for (const s of props.filter((p) => p.type === 'sofa')) {
    spots.push({ kind: 'sit', x: s.x - 0.55, z: s.z, rot: 0, level: s.level }, { kind: 'sit', x: s.x + 0.55, z: s.z, rot: 0, level: s.level });
  }
  for (const b of props.filter((p) => p.type === 'bed')) {
    spots.push({ kind: 'sleep', x: b.x, z: b.z, rot: b.z < 10 ? 0 : Math.PI, level: b.level }); // kepala di sisi papan kepala
  }
  return spots.map((s, id) => ({ id, ...s }));
}

/** Posisi/arah avatar saat memakai titik duduk atau tidur (tidur = berbaring telentang). y sudah termasuk tinggi lantai. */
export function spotPose(spot) {
  const base = levelY(spot.level);
  if (spot.kind === 'sleep') {
    return { x: spot.x + 0.83 * Math.sin(spot.rot), z: spot.z + 0.83 * Math.cos(spot.rot), y: base + 0.9, rotY: spot.rot, tilt: -Math.PI / 2 };
  }
  return { x: spot.x, z: spot.z, y: base + SEATED_DROP, rotY: spot.rot, tilt: 0 };
}

/** Titik terdekat yang kosong, di lantai yang sama dengan pemain (tidak saat sedang di tangga). */
export function findNearestSpot(pos, spots, occupied = new Set(), range = SIT_RANGE) {
  if (pos.stair != null) return null;
  const level = pos.level ?? 0;
  let best = null;
  let bestDistance = range;
  for (const s of spots) {
    if (occupied.has(s.id) || (s.level ?? 0) !== level) continue;
    const d = Math.hypot(s.x - pos.x, s.z - pos.z);
    if (d <= bestDistance) {
      best = s;
      bestDistance = d;
    }
  }
  return best;
}

function splitEdge(orient, coord, lo, hi, doors = DOORS) {
  const half = WALL_THICKNESS / 2;
  const gaps = doors.filter((d) => d.orient === orient && Math.abs((orient === 'h' ? d.z : d.x) - coord) < 1e-6)
    .map((d) => {
      const c = orient === 'h' ? d.x : d.z;
      return [c - d.width / 2, c + d.width / 2];
    })
    .filter((g) => g[1] > lo && g[0] < hi)
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  let cursor = lo;
  for (const g of gaps) {
    if (g[0] > cursor + 1e-6) out.push({ orient, coord, a: cursor - (cursor === lo ? half : 0), b: g[0] });
    cursor = Math.max(cursor, g[1]);
  }
  if (hi > cursor + 1e-6) out.push({ orient, coord, a: cursor - (cursor === lo ? half : 0), b: hi + half });
  return out;
}

export function buildWallSegments(rooms = ROOMS, doors = DOORS) {
  const seen = new Set();
  const segments = [];
  const add = (seg) => {
    const key = `${seg.orient}|${seg.coord.toFixed(3)}|${seg.a.toFixed(3)}|${seg.b.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    segments.push(seg);
  };
  for (const { rect: [x1, z1, x2, z2] } of rooms) {
    splitEdge('h', z1, x1, x2, doors).forEach(add);
    splitEdge('h', z2, x1, x2, doors).forEach(add);
    splitEdge('v', x1, z1, z2, doors).forEach(add);
    splitEdge('v', x2, z1, z2, doors).forEach(add);
  }
  return segments;
}

export function wallToRect(seg) {
  const h = WALL_THICKNESS / 2;
  return seg.orient === 'h'
    ? { minX: seg.a, maxX: seg.b, minZ: seg.coord - h, maxZ: seg.coord + h }
    : { minX: seg.coord - h, maxX: seg.coord + h, minZ: seg.a, maxZ: seg.b };
}

export function propToRect(p) {
  const s = PROP_SPECS[p.type];
  return { minX: p.x - s.hx, maxX: p.x + s.hx, minZ: p.z - s.hz, maxZ: p.z + s.hz };
}

// Kolam (dua sisi jembatan) dan air mancur menghalangi jalan.
const FIXED_COLLIDERS = Object.freeze([
  { minX: -7, maxX: -1.5, minZ: 2, maxZ: 16 },
  { minX: 1.5, maxX: 7, minZ: 2, maxZ: 16 },
  { minX: -2.4, maxX: 2.4, minZ: 25.6, maxZ: 30.4 },
]);

export function resolveMove(pos, radius, colliders, bounds = WORLD_LIMIT) {
  let x = Math.min(bounds.maxX - radius, Math.max(bounds.minX + radius, pos.x));
  let z = Math.min(bounds.maxZ - radius, Math.max(bounds.minZ + radius, pos.z));
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const c of colliders) {
      const cx = Math.min(c.maxX, Math.max(c.minX, x));
      const cz = Math.min(c.maxZ, Math.max(c.minZ, z));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      moved = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x += (dx / d) * (radius - d);
        z += (dz / d) * (radius - d);
      } else {
        // pusat berada di dalam kotak: dorong keluar lewat sisi terdekat
        const left = x - c.minX;
        const right = c.maxX - x;
        const up = z - c.minZ;
        const down = c.maxZ - z;
        const m = Math.min(left, right, up, down);
        if (m === left) x = c.minX - radius;
        else if (m === right) x = c.maxX + radius;
        else if (m === up) z = c.minZ - radius;
        else z = c.maxZ + radius;
      }
    }
    if (!moved) break;
    x = Math.min(bounds.maxX - radius, Math.max(bounds.minX + radius, x));
    z = Math.min(bounds.maxZ - radius, Math.max(bounds.minZ + radius, z));
  }
  return { x, z };
}

export function moveWithCollisions(pos, dx, dz, radius, colliders, bounds = WORLD_LIMIT, maxStep = 0.1) {
  const len = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(len / maxStep));
  let cur = { x: pos.x, z: pos.z };
  for (let i = 0; i < steps; i++) {
    cur = resolveMove({ x: cur.x + dx / steps, z: cur.z + dz / steps }, radius, colliders, bounds);
  }
  return cur;
}

export function isWalkable(x, z, radius, colliders, bounds = WORLD_LIMIT) {
  if (x < bounds.minX + radius || x > bounds.maxX - radius || z < bounds.minZ + radius || z > bounds.maxZ - radius) return false;
  for (const c of colliders) {
    const cx = Math.min(c.maxX, Math.max(c.minX, x));
    const cz = Math.min(c.maxZ, Math.max(c.minZ, z));
    if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius - 1e-9) return false;
  }
  return true;
}

const inRect = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];
const inRectClosed = (r, x, z) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];

export function roomAt(x, z, level = 0) {
  const room = roomsAtLevel(level).find((r) => inRect(r.rect, x, z));
  if (room) return { id: room.id, name: room.name, kind: room.kind, indoor: room.kind !== 'terrace', level };
  if (level === 0) {
    const zone = ZONES.find((r) => inRect(r.rect, x, z));
    if (zone) return { id: zone.id, name: zone.name, kind: zone.kind, indoor: false, level };
    const outside = x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ;
    if (outside) return { id: 'outside', name: 'Di luar vila', kind: 'outside', indoor: false, level };
  }
  return { id: 'grounds', name: 'Villa Grounds', kind: 'grounds', indoor: false, level };
}

// ------------------------------------------------------------------ gerak bertingkat
const EXIT_GAP = 0.06;

// Wilayah yang boleh diinjak di lantai atas: ruangan, teras, bordes, dan pintu masuk tangga.
function buildRegion(level) {
  const rects = [];
  for (const r of roomsAtLevel(level)) rects.push(r.kind === 'stair' ? r.landing : r.rect);
  for (const s of STAIRS) {
    if (s.from === level) rects.push(s.mouthBottom);
    if (s.to === level) rects.push(s.mouthTop);
  }
  return rects.filter(Boolean);
}

function inRegion(region, x, z, r) {
  const inside = (px, pz) => region.some((rect) => inRectClosed(rect, px, pz));
  return inside(x, z) && inside(x - r, z) && inside(x + r, z) && inside(x, z - r) && inside(x, z + r);
}

const stairDir = (s) => Math.sign(s.zBottom - s.zTop); // +1: menanjak ke arah z mengecil

function mouthAt(level, x, z) {
  for (const s of STAIRS) {
    if (s.from === level && x >= s.x1 && x <= s.x2 && z > s.mouthBottom[1] && z < s.mouthBottom[3]) return s;
    if (s.to === level && x >= s.x1 && x <= s.x2 && z > s.mouthTop[1] && z < s.mouthTop[3]) return s;
  }
  return null;
}

/** Ketinggian y di tangga `s` pada posisi z. */
export function stairHeight(s, z) {
  const t = Math.min(1, Math.max(0, (z - s.zBottom) / (s.zTop - s.zBottom)));
  return levelY(s.from) + t * LEVEL_HEIGHT;
}

export function getStair(id) {
  return STAIR_BY_ID.get(id) ?? null;
}

/**
 * Suara hanya menembus ruang yang sama: dua orang di ruangan berbeda (dibatasi dinding) tidak saling dengar,
 * walau jaraknya dekat. Dua orang di area terbuka (halaman, taman, parkir) boleh saling dengar menurut jarak.
 */
export function sameVoiceSpace(a, b) {
  const la = a.level ?? Math.round((a.y ?? 0) / LEVEL_HEIGHT);
  const lb = b.level ?? Math.round((b.y ?? 0) / LEVEL_HEIGHT);
  if (la !== lb) return false; // beda lantai dipisahkan pelat lantai
  const ra = roomAt(a.x, a.z, la);
  const rb = roomAt(b.x, b.z, lb);
  if (ra.indoor || rb.indoor) return ra.id === rb.id;
  return true;
}

let cached = null;
export function getVillaWorld() {
  if (cached) return cached;
  const props = [...buildProps(), ...buildCountryside()];
  const levels = [];
  for (let level = 0; level < LEVEL_COUNT; level++) {
    const rooms = roomsAtLevel(level);
    const walled = rooms.filter((r) => r.kind !== 'terrace');
    const doors = level === 0 ? DOORS : UPPER_DOORS.filter((d) => d.level === level);
    const walls = buildWallSegments(walled, doors);
    const levelProps = props.filter((p) => p.level === level);
    const colliders = [...walls.map(wallToRect), ...levelProps.map(propToRect)];
    if (level === 0) {
      colliders.push(...FIXED_COLLIDERS, ...perimeterColliders());
      for (const t of TOWERS) colliders.push({ minX: t.underBlock[0], minZ: t.underBlock[1], maxX: t.underBlock[2], maxZ: t.underBlock[3] });
    }
    levels.push(Object.freeze({ level, rooms, doors, walls, props: levelProps, colliders, region: level === 0 ? null : buildRegion(level) }));
  }
  const ground = levels[0];

  const move = (pos, dx, dz) => {
    let x = pos.x;
    let z = pos.z;
    let level = pos.level ?? 0;
    let stairId = pos.stair ?? null;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
    const sx = dx / n;
    const sz = dz / n;
    for (let i = 0; i < n; i++) {
      if (stairId !== null) {
        const s = STAIR_BY_ID.get(stairId);
        const nx = Math.min(s.x2 - PLAYER_RADIUS, Math.max(s.x1 + PLAYER_RADIUS, x + sx));
        const nz = z + sz;
        const t = (nz - s.zBottom) / (s.zTop - s.zBottom);
        if (t <= 0) {
          stairId = null;
          level = s.from;
          z = s.zBottom + stairDir(s) * EXIT_GAP;
        } else if (t >= 1) {
          stairId = null;
          level = s.to;
          z = s.zTop - stairDir(s) * EXIT_GAP;
        } else {
          z = nz;
        }
        x = nx;
        continue;
      }
      const L = levels[level];
      let cand = resolveMove({ x: x + sx, z: z + sz }, PLAYER_RADIUS, L.colliders, WORLD_LIMIT);
      if (L.region && !inRegion(L.region, cand.x, cand.z, PLAYER_RADIUS)) {
        const tryX = resolveMove({ x: x + sx, z }, PLAYER_RADIUS, L.colliders, WORLD_LIMIT);
        const tryZ = resolveMove({ x, z: z + sz }, PLAYER_RADIUS, L.colliders, WORLD_LIMIT);
        if (inRegion(L.region, tryX.x, tryX.z, PLAYER_RADIUS)) cand = tryX;
        else if (inRegion(L.region, tryZ.x, tryZ.z, PLAYER_RADIUS)) cand = tryZ;
        else cand = { x, z };
      }
      x = cand.x;
      z = cand.z;
      const mouth = mouthAt(level, x, z);
      if (mouth) stairId = mouth.id;
    }
    const y = stairId !== null ? stairHeight(STAIR_BY_ID.get(stairId), z) : levelY(level);
    return { x, z, level, stair: stairId, y };
  };

  cached = Object.freeze({
    name: 'nikora-villa',
    bounds: BOUNDS,
    limit: WORLD_LIMIT,
    spawn: SPAWN,
    radius: PLAYER_RADIUS,
    rooms: ROOMS,
    zones: ZONES,
    doors: DOORS,
    walls: ground.walls,
    props: props.filter((p) => p.level === 0),
    allProps: props,
    levels,
    towers: TOWERS,
    stairs: STAIRS,
    levelHeight: LEVEL_HEIGHT,
    spots: buildSpots(props),
    sitRange: SIT_RANGE,
    colliders: ground.colliders,
    constrain: (pos) => resolveMove(pos, PLAYER_RADIUS, ground.colliders, WORLD_LIMIT),
    move,
    /** Apakah titik (x,z) bisa diinjak di lantai `level`? */
    canStand: (level, x, z) => {
      const L = levels[level];
      if (!isWalkable(x, z, PLAYER_RADIUS, L.colliders, WORLD_LIMIT)) return false;
      return !L.region || inRegion(L.region, x, z, PLAYER_RADIUS);
    },
  });
  return cached;
}
