// Denah "The Royal Wedding · Istana Cinta" (satuan meter). x ke timur, z ke selatan (utara = -z).
// Modul ini murni data + matematika (tanpa THREE) supaya dipakai bersama oleh render, tabrakan, kamera, dan tes.
//
// Dunia terdiri dari satu dataran utama (zona 'main': istana, danau kristal, taman) dan tiga pulau melayang
// berbentuk cakram (zona 'isle_*') yang dicapai lewat portal cahaya. Status pemain: { x, z, zone, y }.
import { PLAYER_RADIUS, WALL_THICKNESS, buildWallSegments, resolveMove, wallToRect } from './villa-layout.js';

export { PLAYER_RADIUS, WALL_THICKNESS, wallToRect };
export const BOUNDS = Object.freeze({ minX: -64, maxX: 64, minZ: -56, maxZ: 60 });
export const SPAWN = Object.freeze({ x: 0, z: 48 });
export const SIT_RANGE = 1.9;
export const SEATED_DROP = -0.3;
export const LAKE_LEVEL = -0.35;
export const DOOR_H = 3.2;
export const TALL_DOOR_H = 6.4;

export const INLAY = Object.freeze({ x: 0, z: -40.2, r: 3.2 }); // lambang inisial N&A di lantai pelaminan
export const BLESS_ZONE = Object.freeze({ x: 0, z: -39.5, r: 6.5 }); // tombol "Beri Selamat" aktif di sini
export const ALTAR = Object.freeze({ x1: -6, x2: 6, z1: -50, z2: -43.5, y: 0.54, ramp: 1.2 });
export const STAGE = Object.freeze({ x1: 34, x2: 50, z1: -46, z2: -39, y: 0.7, ramp: 1.1 });
export const BRIDGE = Object.freeze({ halfW: 3, z1: -4, z2: 30, hump: 0.9 });
export const LAKE = Object.freeze({ x1: -30, z1: -4, x2: 30, z2: 30 });
export const PHOTO_SPOT = Object.freeze({ x: -54, z: 24, r: 3.4 });
export const PIANO = Object.freeze({ x: 42, z: -43 });
export const FOUNTAIN = Object.freeze({ x: 0, z: 38 });

// ------------------------------------------------------------------ bangunan
export const ROOMS = Object.freeze([
  { id: 'cathedral', name: 'Pelaminan Utama', kind: 'cathedral', rect: [-12, -50, 12, -20], h: 14 },
  { id: 'dining', name: 'Ruang Makan VIP', kind: 'dining', rect: [-26, -50, -12, -20], h: 9 },
  { id: 'lounge', name: 'Ruang Chat & Interaksi', kind: 'lounge', rect: [12, -50, 26, -20], h: 9 },
  { id: 'music', name: 'Live Musik & Hiburan', kind: 'music', rect: [32, -46, 52, -26], h: 8 },
]);

// Pintu (bisa dilewati). orient 'h' = dinding membentang sepanjang x di koordinat z; 'v' = sepanjang z di koordinat x.
export const DOORS = Object.freeze([
  { x: 0, z: -20, orient: 'h', width: 6, tall: true }, // pintu utama katedral
  { x: -19, z: -20, orient: 'h', width: 3.6 },
  { x: 19, z: -20, orient: 'h', width: 3.6 },
  { x: -12, z: -35, orient: 'v', width: 4 }, // katedral <-> ruang makan
  { x: 12, z: -35, orient: 'v', width: 4 }, // katedral <-> lounge
  { x: 42, z: -26, orient: 'h', width: 4 },
  { x: 32, z: -36, orient: 'v', width: 4 },
]);

const win = (orient, x, z, width, y0, y1) => ({ x, z, orient, width, y0, y1, glass: true });
// Jendela: bukaan di dinding yang TIDAK bisa dilewati (diberi penghalang tipis), dengan ambang bawah dan atas.
export const WINDOWS = Object.freeze([
  // katedral: jendela tinggi (clerestory) di atas atap sayap, jendela lancet di utara dan di sisi pintu utama
  ...[-46.5, -41.5, -28.5, -23.5].flatMap((z) => [win('v', -12, z, 1.8, 9.6, 12.8), win('v', 12, z, 1.8, 9.6, 12.8)]),
  win('h', -8.5, -50, 2.4, 2.5, 9.5), win('h', 8.5, -50, 2.4, 2.5, 9.5),
  win('h', -8.3, -20, 2.4, 2.5, 9.5), win('h', 8.3, -20, 2.4, 2.5, 9.5),
  // ruang makan
  win('h', -24, -20, 2, 1.2, 6.2), win('h', -15, -20, 2, 1.2, 6.2),
  ...[-23, -19, -15].map((x) => win('h', x, -50, 2, 1.2, 6.2)),
  ...[-45, -39, -33, -27].map((z) => win('v', -26, z, 2, 1.2, 6.2)),
  // lounge: kaca panorama menghadap danau
  win('h', 14.6, -20, 2.4, 0.6, 6.4), win('h', 23.4, -20, 2.4, 0.6, 6.4),
  ...[15, 19, 23].map((x) => win('h', x, -50, 2.4, 0.6, 6.4)),
  ...[-46, -41, -30, -25].map((z) => win('v', 26, z, 2.4, 0.6, 6.4)),
  // aula musik
  ...[-43, -29].map((z) => win('v', 32, z, 2, 1, 5.4)),
  ...[-43, -39, -33, -29].map((z) => win('v', 52, z, 2, 1, 5.4)),
  ...[36, 48].flatMap((x) => [win('h', x, -46, 2, 1, 5.4), win('h', x, -26, 2, 1, 5.4)]),
]);

// Semua bukaan di dinding (pintu dan jendela), dengan rentang tinggi masing-masing.
export const OPENINGS = Object.freeze([
  ...DOORS.map((d) => ({ ...d, y0: 0, y1: d.tall ? TALL_DOOR_H : DOOR_H, glass: false })),
  ...WINDOWS,
]);

export const ROOFS = Object.freeze([
  { id: 'cathedral', kind: 'gable_z', rect: [-12, -50, 12, -20], base: 14, rise: 5.2, overhang: 0.8 },
  { id: 'dining', kind: 'flat', rect: [-26, -50, -12, -20], base: 9, rise: 0.6, overhang: 0.3 },
  { id: 'lounge', kind: 'flat', rect: [12, -50, 26, -20], base: 9, rise: 0.6, overhang: 0.3 },
  { id: 'music', kind: 'gable_x', rect: [32, -46, 52, -26], base: 8, rise: 3.6, overhang: 0.8 },
]);

export const TOWERS = Object.freeze([[-26, -20], [26, -20], [-26, -50], [26, -50]].map(([x, z], i) => ({ id: `tower_${i}`, x, z, r: 2.6, h: 22, cone: 8 })));

// ------------------------------------------------------------------ zona terbuka
export const ZONES = Object.freeze([
  { id: 'bridge', name: 'Jembatan Cinta', kind: 'bridge', rect: [-3, -4, 3, 30] },
  { id: 'lake', name: 'Danau Kristal', kind: 'lake', rect: [-30, -4, 30, 30] },
  { id: 'plaza', name: 'Plaza Istana', kind: 'plaza', rect: [-30, -20, 30, -4] },
  { id: 'shore', name: 'Dermaga Cahaya', kind: 'shore', rect: [-30, 30, 30, 60] },
  { id: 'back', name: 'Taman Belakang Istana', kind: 'garden', rect: [-30, -56, 30, -50] },
  { id: 'garden_w', name: 'Taman & Area Santai', kind: 'garden', rect: [-64, -56, -30, 60] },
  { id: 'garden_e', name: 'Taman & Area Santai', kind: 'garden', rect: [30, -56, 64, 60] },
]);

// ------------------------------------------------------------------ pulau melayang
export const ISLANDS = Object.freeze([
  { id: 'isle_garden', name: 'Taman Langit', kind: 'garden', cx: -62, cz: -34, y: 24, r: 15, pad: { x: -52, z: -30 }, landing: { x: -55, z: -31.5 } },
  { id: 'isle_game', name: 'Area Game & Mini Event', kind: 'game', cx: 64, cz: -36, y: 30, r: 16, pad: { x: 54, z: -32 }, landing: { x: 57, z: -33.5 } },
  { id: 'isle_star', name: 'Dek Bintang', kind: 'star', cx: 0, cz: -96, y: 40, r: 14, pad: { x: 0, z: -87 }, landing: { x: 0, z: -90 } },
]);
export const ISLAND_BY_ID = Object.freeze(Object.fromEntries(ISLANDS.map((i) => [i.id, i])));

// Pulau hias (tidak bisa diinjak) dengan air terjun, mengisi langit di sekitar istana.
export const DECOR_ISLANDS = Object.freeze([
  { x: -30, y: 46, z: -80, r: 8 }, { x: 34, y: 52, z: -70, r: 9 }, { x: -88, y: 36, z: -62, r: 7 }, { x: 92, y: 44, z: -10, r: 7 },
  { x: -20, y: 30, z: -124, r: 10 }, { x: 44, y: 62, z: -112, r: 11 }, { x: -78, y: 55, z: 20, r: 6 }, { x: 82, y: 58, z: 40, r: 8 },
]);

const MAIN_PADS = [
  { id: 'isle_garden', x: -12, z: 47, back: { x: -12, z: 44.4 } },
  { id: 'isle_game', x: 12, z: 47, back: { x: 12, z: 44.4 } },
  { id: 'isle_star', x: 0, z: 57, back: { x: 0, z: 54.4 } },
];
export const PORTALS = Object.freeze([
  ...MAIN_PADS.map((p) => {
    const isl = ISLAND_BY_ID[p.id];
    return { id: `to_${p.id}`, zone: 'main', x: p.x, z: p.z, r: 1.7, label: isl.name, color: 0xffe08a, to: { zone: p.id, x: isl.landing.x, z: isl.landing.z } };
  }),
  ...ISLANDS.map((isl) => {
    const m = MAIN_PADS.find((p) => p.id === isl.id);
    return { id: `from_${isl.id}`, zone: isl.id, x: isl.pad.x, z: isl.pad.z, r: 1.7, label: 'Kembali ke Istana', color: 0xa9d8ff, to: { zone: 'main', x: m.back.x, z: m.back.z } };
  }),
]);

// ------------------------------------------------------------------ properti
export const PROP_SPECS = Object.freeze({
  tower: { hx: 2.6, hz: 2.6 }, column: { hx: 0.4, hz: 0.4 }, table: { hx: 0.95, hz: 0.95 }, coffee: { hx: 0.7, hz: 0.7 },
  sofa: { hx: 1.1, hz: 0.5 }, piano: { hx: 1.15, hz: 0.85 }, tree: { hx: 0.35, hz: 0.35 }, sakura: { hx: 0.4, hz: 0.4 },
  fountain: { hx: 3.4, hz: 3.4 }, fountain_s: { hx: 1.7, hz: 1.7 }, lamp: { hx: 0.2, hz: 0.2 }, bench: { hx: 0.9, hz: 0.35 },
  urn: { hx: 0.4, hz: 0.4 }, post: { hx: 0.25, hz: 0.25 }, pillar: { hx: 0.6, hz: 0.6 }, telescope: { hx: 0.5, hz: 0.5 },
});

export const DINING_TABLES = Object.freeze(
  [-22.5, -15.5].flatMap((x, i) => [-44, -38, -32, -26].map((z, j) => ({ id: `meja_${i * 4 + j + 1}`, x, z }))),
);
const CHAIRS_PER_TABLE = 6;
const CHAIR_RING = 1.3;

/** Kursi tamu di katedral (dua blok, kiri dan kanan lorong), menghadap altar (utara). */
export function cathedralChairs() {
  const out = [];
  for (let z = -36.2; z <= -22.1; z += 1.4) for (let x = 3.6; x <= 10.4; x += 0.9) out.push({ x, z }, { x: -x, z });
  return out;
}
/** Kursi penonton di aula musik. */
export function musicChairs() {
  const out = [];
  for (let z = -35; z <= -28.4; z += 1.3) for (let x = 35.2; x <= 48.8; x += 1) out.push({ x, z });
  return out;
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

const inRect = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];
const BENCHES = [
  ...[2, 12, 22, 36, 46].map((z) => ({ x: -33.2, z, ry: -Math.PI / 2 })),
  ...[2, 12, 22, 36, 46].map((z) => ({ x: 33.2, z, ry: Math.PI / 2 })),
  { x: -20, z: 56, ry: Math.PI }, { x: 20, z: 56, ry: Math.PI }, { x: -24, z: -13, ry: 0 }, { x: 24, z: -13, ry: 0 },
];
const GAZEBOS = Object.freeze([{ x: -46, z: 38 }, { x: 46, z: 38 }]);
export { GAZEBOS };

function islandProps(isl) {
  const props = [];
  const ring = (n, rad, make, phase = 0) => {
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2;
      props.push(make(isl.cx + Math.cos(a) * rad, isl.cz + Math.sin(a) * rad, a));
    }
  };
  if (isl.kind === 'garden') {
    ring(7, isl.r - 3.2, (x, z) => ({ type: 'sakura', x, z }), 0.3);
    ring(4, 5.2, (x, z, a) => ({ type: 'bench', x, z, ry: -a - Math.PI / 2 }), 0.9);
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) props.push({ type: 'post', x: isl.cx + dx, z: isl.cz + dz });
  } else if (isl.kind === 'game') {
    ring(6, isl.r - 2.5, (x, z) => ({ type: 'lamp', x, z }), 0);
    props.push({ type: 'pillar', x: isl.cx - 3, z: isl.cz - 3 }, { type: 'pillar', x: isl.cx + 3, z: isl.cz - 3 });
  } else {
    props.push({ type: 'telescope', x: isl.cx, z: isl.cz - 5 });
    ring(5, isl.r - 2.2, (x, z) => ({ type: 'lamp', x, z }), 0.5);
  }
  return props.map((p) => ({ zone: isl.id, y: isl.y, ...p }));
}

/** Titik sentuh interaktif di pulau permainan: peluncur kembang api dan bantalan pegas. */
export const GAME_PADS = Object.freeze([
  { id: 'fw_red', kind: 'firework', x: 58, z: -40, r: 1.3, color: 0xff3a5e, mood: 'romantic', label: 'Kembang Api Cinta' },
  { id: 'fw_gold', kind: 'firework', x: 64, z: -42, r: 1.3, color: 0xffd24a, mood: 'funny', label: 'Kembang Api Emas' },
  { id: 'fw_blue', kind: 'firework', x: 70, z: -40, r: 1.3, color: 0x59d8ff, mood: 'joy', label: 'Kembang Api Pesta' },
  { id: 'spring_1', kind: 'spring', x: 60, z: -28, r: 1.6, label: 'Lompat Awan' },
  { id: 'spring_2', kind: 'spring', x: 68, z: -28, r: 1.6, label: 'Lompat Awan' },
].map((p) => ({ zone: 'isle_game', ...p })));

function buildProps() {
  const props = [];
  for (const t of TOWERS) props.push({ type: 'tower', x: t.x, z: t.z });
  for (const z of [-46.5, -41, -29, -23.5]) for (const x of [-11.2, 11.2]) props.push({ type: 'column', x, z });
  for (const t of DINING_TABLES) props.push({ type: 'table', x: t.x, z: t.z, id: t.id });
  for (const cz of [-41, -29]) {
    props.push({ type: 'coffee', x: 19, z: cz });
    props.push({ type: 'sofa', x: 19, z: cz - 2.6, ry: Math.PI }, { type: 'sofa', x: 19, z: cz + 2.6, ry: 0 });
    props.push({ type: 'sofa', x: 16.1, z: cz, ry: -Math.PI / 2 }, { type: 'sofa', x: 21.9, z: cz, ry: Math.PI / 2 });
  }
  props.push({ type: 'piano', x: PIANO.x, z: PIANO.z });
  props.push({ type: 'fountain', x: FOUNTAIN.x, z: FOUNTAIN.z }, { type: 'fountain_s', x: -14, z: -11 }, { type: 'fountain_s', x: 14, z: -11 });
  for (const z of [0, 8, 16, 24]) props.push({ type: 'lamp', x: -3.15, z }, { type: 'lamp', x: 3.15, z });
  for (const z of [-18, -12, -6]) props.push({ type: 'lamp', x: -5.5, z }, { type: 'lamp', x: 5.5, z });
  for (const z of [34, 41, 48, 55]) props.push({ type: 'lamp', x: -7, z }, { type: 'lamp', x: 7, z });
  for (const x of [-1, 1]) props.push({ type: 'pillar', x: PHOTO_SPOT.x + x * 1.8, z: PHOTO_SPOT.z - 4 });
  for (const g of GAZEBOS) for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) props.push({ type: 'post', x: g.x + dx, z: g.z + dz });
  for (const b of BENCHES) props.push({ type: 'bench', ...b });
  for (const u of [[-5, -19], [5, -19], [-9, -19], [9, -19]]) props.push({ type: 'urn', x: u[0], z: u[1] });

  // pepohonan taman (deterministik): sakura dan pohon rindang, jauh dari jalur, bangunan, danau, portal, dan titik foto
  const rand = mulberry32(20261014);
  const keepClear = (x, z) => {
    if (ROOMS.some((r) => inRect([r.rect[0] - 3, r.rect[1] - 3, r.rect[2] + 3, r.rect[3] + 3], x, z))) return false;
    if (Math.hypot(x - PHOTO_SPOT.x, z - PHOTO_SPOT.z) < 8) return false;
    if (GAZEBOS.some((g) => Math.hypot(x - g.x, z - g.z) < 6)) return false;
    if (BENCHES.some((b) => Math.hypot(x - b.x, z - b.z) < 3.2)) return false;
    if (Math.abs(x) < 33.5 && z > -22) return false; // tepi danau dan plaza
    if (z > 42 && Math.abs(x) < 20) return false; // dermaga
    return true;
  };
  const trees = [];
  let guard = 0;
  while (trees.length < 46 && guard++ < 6000) {
    const west = trees.length % 2 === 0;
    const x = (west ? -1 : 1) * (35 + rand() * 27.5);
    const z = -54 + rand() * 112;
    if (!keepClear(x, z)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 5)) continue;
    trees.push({ type: rand() < 0.62 ? 'sakura' : 'tree', x, z, s: 0.85 + rand() * 0.5 });
  }
  props.push(...trees);
  return props.map((p) => ({ zone: 'main', y: 0, ...p }));
}

/** Rect penghalang (AABB) untuk sebuah properti; sofa/bangku yang diputar 90° menukar sumbu. */
export function propToRect(p) {
  const s = PROP_SPECS[p.type];
  const swap = p.ry !== undefined && Math.abs(Math.sin(p.ry)) > 0.7;
  const hx = swap ? s.hz : s.hx;
  const hz = swap ? s.hx : s.hz;
  return { minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz };
}

// ------------------------------------------------------------------ ketinggian
const smooth = (t) => t * t * (3 - 2 * t);
const rampAt = (z, zHigh, zLow) => smooth(Math.min(1, Math.max(0, (zLow - z) / (zLow - zHigh)))); // 1 di zHigh (utara), 0 di zLow
const inBox = (b, x, z) => x >= b.x1 && x <= b.x2 && z >= b.z1 && z <= b.z2 + (b.ramp ?? 0);

/** Tinggi permukaan di zona utama: lengkung jembatan, tangga pelaminan, dan panggung musik. */
export function mainHeight(x, z) {
  if (Math.abs(x) <= BRIDGE.halfW + 1e-6 && z >= BRIDGE.z1 && z <= BRIDGE.z2) {
    return BRIDGE.hump * Math.sin((Math.PI * (z - BRIDGE.z1)) / (BRIDGE.z2 - BRIDGE.z1));
  }
  if (inBox(ALTAR, x, z)) return ALTAR.y * rampAt(z, ALTAR.z2, ALTAR.z2 + ALTAR.ramp);
  if (inBox(STAGE, x, z)) return STAGE.y * rampAt(z, STAGE.z2, STAGE.z2 + STAGE.ramp);
  return 0;
}

export function heightAt(zoneId, x, z) {
  return zoneId && zoneId !== 'main' ? ISLAND_BY_ID[zoneId]?.y ?? 0 : mainHeight(x, z);
}

/** Zona (pulau atau dataran utama) dari koordinat dunia; dipakai untuk pemain lain yang hanya mengirim x, y, z. */
export function zoneOfPoint(x, y, z) {
  for (const isl of ISLANDS) if (Math.abs((y ?? 0) - isl.y) < 4 && Math.hypot(x - isl.cx, z - isl.cz) <= isl.r + 1.5) return isl.id;
  return 'main';
}

// ------------------------------------------------------------------ dinding
/** Tinggi dinding: yang tertinggi dari ruangan di kedua sisinya. */
export function wallHeight(seg) {
  const mid = (seg.a + seg.b) / 2;
  const pts = seg.orient === 'h' ? [[mid, seg.coord - 0.5], [mid, seg.coord + 0.5]] : [[seg.coord - 0.5, mid], [seg.coord + 0.5, mid]];
  let h = 0;
  for (const [x, z] of pts) for (const r of ROOMS) if (inRect(r.rect, x, z)) h = Math.max(h, r.h);
  return h || 6;
}

/** Penghalang tipis di bukaan jendela supaya tidak bisa ditembus. */
function windowBlockers() {
  return WINDOWS.map((w) => (w.orient === 'h'
    ? { minX: w.x - w.width / 2, maxX: w.x + w.width / 2, minZ: w.z - 0.15, maxZ: w.z + 0.15 }
    : { minX: w.x - 0.15, maxX: w.x + 0.15, minZ: w.z - w.width / 2, maxZ: w.z + w.width / 2 }));
}

export function roomAt(zoneId, x, z) {
  if (zoneId && zoneId !== 'main') {
    const isl = ISLAND_BY_ID[zoneId];
    return { id: zoneId, name: isl?.name ?? 'Pulau Melayang', kind: 'island', indoor: false, zone: zoneId };
  }
  const room = ROOMS.find((r) => inRect(r.rect, x, z));
  if (room) return { id: room.id, name: room.name, kind: room.kind, indoor: true, zone: 'main' };
  if (Math.hypot(x - PHOTO_SPOT.x, z - PHOTO_SPOT.z) <= PHOTO_SPOT.r + 1) return { id: 'photo', name: 'Spot Foto 360°', kind: 'photo', indoor: false, zone: 'main' };
  const zone = ZONES.find((r) => inRect(r.rect, x, z));
  if (zone) return { id: zone.id, name: zone.name, kind: zone.kind, indoor: false, zone: 'main' };
  return { id: 'grounds', name: 'Istana Cinta', kind: 'grounds', indoor: false, zone: 'main' };
}

// ------------------------------------------------------------------ titik duduk
function buildSpots(props) {
  const spots = [];
  const sit = (x, z, rot, zone, y, extra = {}) => spots.push({ kind: 'sit', x, z, rot, zone, y, ...extra });
  for (const c of cathedralChairs()) sit(c.x, c.z, 0, 'main', 0, { tag: 'nave' });
  for (const s of [-1.1, 1.1]) sit(s, -47.6, 0, 'main', ALTAR.y, { tag: 'altar' });
  for (const t of props.filter((p) => p.type === 'table')) {
    for (let k = 0; k < CHAIRS_PER_TABLE; k++) {
      const a = (k / CHAIRS_PER_TABLE) * Math.PI * 2;
      const dx = Math.sin(a) * CHAIR_RING;
      const dz = Math.cos(a) * CHAIR_RING;
      sit(t.x + dx, t.z + dz, Math.atan2(dx, dz), 'main', 0, { table: t.id });
    }
  }
  for (const s of props.filter((p) => p.type === 'sofa')) {
    const ry = s.ry ?? 0;
    for (const side of [-1, 1]) sit(s.x + 0.55 * side * Math.cos(ry), s.z - 0.55 * side * Math.sin(ry), ry, s.zone, s.y);
  }
  for (const c of musicChairs()) sit(c.x, c.z, 0, 'main', 0, { tag: 'music' });
  sit(PIANO.x, PIANO.z + 1.4, 0, 'main', STAGE.y, { tag: 'piano' });
  for (const b of props.filter((p) => p.type === 'bench')) {
    const ry = b.ry ?? 0;
    for (const side of [-1, 1]) sit(b.x + 0.45 * side * Math.cos(ry), b.z - 0.45 * side * Math.sin(ry), ry, b.zone, b.y);
  }
  return spots.map((s, id) => ({ id, ...s }));
}

/** Pose avatar saat duduk: y sudah termasuk tinggi permukaan. */
export function spotPose(spot) {
  return { x: spot.x, z: spot.z, y: (spot.y ?? 0) + SEATED_DROP, rotY: spot.rot, tilt: 0 };
}

/** Titik duduk terdekat yang kosong, di zona yang sama dengan pemain. */
export function findNearestSpot(pos, spots, occupied = new Set(), range = SIT_RANGE) {
  const zone = pos.zone ?? 'main';
  let best = null;
  let bestD = range;
  for (const s of spots) {
    if (occupied.has(s.id) || s.zone !== zone) continue;
    if (Math.abs((s.y ?? 0) - (pos.y ?? 0)) > 1.5) continue;
    const d = Math.hypot(s.x - pos.x, s.z - pos.z);
    if (d <= bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

// ------------------------------------------------------------------ suara
/** Kunci ruang suara: pulau sendiri-sendiri, tiap bangunan sendiri, semua area terbuka dataran utama satu ruang. */
export function voiceSpaceOf(p) {
  const zone = p.zone ?? zoneOfPoint(p.x, p.y ?? 0, p.z);
  if (zone !== 'main') return zone;
  const room = roomAt('main', p.x, p.z);
  return room.indoor ? room.id : 'open';
}

/**
 * Aturan siapa mendengar siapa. Gelembung suara meja: yang duduk di meja VIP hanya mendengar teman semeja
 * (dan tidak terdengar oleh orang lain). Selain itu mengikuti ruang suara.
 */
export function createVoiceRule(spots) {
  const tableOf = (p) => (Number.isInteger(p.sit) ? spots[p.sit]?.table ?? null : null);
  return (a, b) => {
    const ta = tableOf(a);
    const tb = tableOf(b);
    if (ta || tb) return ta === tb;
    return voiceSpaceOf(a) === voiceSpaceOf(b);
  };
}

export const tableOfSpot = (spots, id) => (Number.isInteger(id) ? spots[id]?.table ?? null : null);

// ------------------------------------------------------------------ portal dan pad
export function nearestPortal(pos, portals = PORTALS) {
  const zone = pos.zone ?? 'main';
  for (const p of portals) if (p.zone === zone && Math.hypot(p.x - pos.x, p.z - pos.z) <= p.r) return p;
  return null;
}

export function nearestGamePad(pos, pads = GAME_PADS) {
  if ((pos.zone ?? 'main') !== 'isle_game') return null;
  for (const p of pads) if (Math.hypot(p.x - pos.x, p.z - pos.z) <= p.r) return p;
  return null;
}

// ------------------------------------------------------------------ kamera
/** Kotak penghalang kamera (AABB 3D): tanah, dinding, ambang pintu/jendela, atap, menara, dan perabot besar. */
export function buildRoyalOccluders(world) {
  const boxes = [];
  const add = (minX, maxX, minY, maxY, minZ, maxZ) => boxes.push({ minX, maxX, minY, maxY, minZ, maxZ });
  add(-400, 400, -8, 0.05, -400, 400);
  for (const w of world.walls) {
    const r = wallToRect(w);
    add(r.minX, r.maxX, 0, wallHeight(w), r.minZ, r.maxZ);
  }
  for (const o of OPENINGS) {
    const h = Math.max(...ROOMS.map((r) => (o.orient === 'h'
      ? (Math.abs(r.rect[1] - o.z) < 1e-6 || Math.abs(r.rect[3] - o.z) < 1e-6) && o.x > r.rect[0] && o.x < r.rect[2] ? r.h : 0
      : (Math.abs(r.rect[0] - o.x) < 1e-6 || Math.abs(r.rect[2] - o.x) < 1e-6) && o.z > r.rect[1] && o.z < r.rect[3] ? r.h : 0)));
    const hw = o.width / 2;
    const t = 0.15;
    const piece = (y0, y1) => (o.orient === 'h' ? add(o.x - hw, o.x + hw, y0, y1, o.z - t, o.z + t) : add(o.x - t, o.x + t, y0, y1, o.z - hw, o.z + hw));
    if (h > o.y1) piece(o.y1, h);
    if (o.y0 > 0) piece(0, o.y0);
  }
  for (const r of ROOFS) add(r.rect[0] - r.overhang, r.rect[2] + r.overhang, r.base, r.base + r.rise, r.rect[1] - r.overhang, r.rect[3] + r.overhang);
  for (const t of TOWERS) add(t.x - t.r, t.x + t.r, 0, t.h + t.cone, t.z - t.r, t.z + t.r);
  const HEIGHT = { table: 0.85, sofa: 0.95, coffee: 0.5, piano: 1.3, fountain: 1.3, fountain_s: 1, bench: 0.5, column: 14, pillar: 5 };
  for (const p of world.allProps) {
    const h = HEIGHT[p.type];
    if (!h || p.type === 'tower') continue;
    const r = propToRect(p);
    add(r.minX, r.maxX, p.y ?? 0, (p.y ?? 0) + h, r.minZ, r.maxZ);
  }
  return boxes;
}

// ------------------------------------------------------------------ dunia
function clampDisc(x, z, isl, radius) {
  const dx = x - isl.cx;
  const dz = z - isl.cz;
  const len = Math.hypot(dx, dz);
  const m = isl.r - radius;
  return len > m ? { x: isl.cx + (dx / len) * m, z: isl.cz + (dz / len) * m } : { x, z };
}

let cached = null;
export function getRoyalWorld() {
  if (cached) return cached;
  const allProps = [...buildProps(), ...ISLANDS.flatMap(islandProps)];
  const walls = buildWallSegments(ROOMS, OPENINGS);
  const mainColliders = [
    ...walls.map(wallToRect),
    ...windowBlockers(),
    { minX: LAKE.x1, maxX: -BRIDGE.halfW, minZ: LAKE.z1, maxZ: LAKE.z2 },
    { minX: BRIDGE.halfW, maxX: LAKE.x2, minZ: LAKE.z1, maxZ: LAKE.z2 },
    ...allProps.filter((p) => p.zone === 'main').map(propToRect),
  ];
  const zones = { main: { id: 'main', y: 0, colliders: mainColliders, bounds: BOUNDS } };
  for (const isl of ISLANDS) {
    zones[isl.id] = { id: isl.id, y: isl.y, island: isl, colliders: allProps.filter((p) => p.zone === isl.id).map(propToRect), bounds: undefined };
  }
  const spots = buildSpots(allProps);

  const place = (zone, x, z) => {
    const zn = zones[zone] ?? zones.main;
    return { x, z, zone: zn.id, y: heightAt(zn.id, x, z) };
  };
  const move = (pos, dx, dz) => {
    const zn = zones[pos.zone ?? 'main'] ?? zones.main;
    let x = pos.x;
    let z = pos.z;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
    for (let i = 0; i < n; i++) {
      let c = resolveMove({ x: x + dx / n, z: z + dz / n }, PLAYER_RADIUS, zn.colliders, zn.bounds);
      if (zn.island) c = clampDisc(c.x, c.z, zn.island, PLAYER_RADIUS);
      x = c.x;
      z = c.z;
    }
    return { x, z, zone: zn.id, y: heightAt(zn.id, x, z) };
  };

  cached = Object.freeze({
    name: 'nikora-royal',
    bounds: BOUNDS,
    spawn: SPAWN,
    radius: PLAYER_RADIUS,
    rooms: ROOMS,
    walls,
    allProps,
    zones,
    spots,
    colliders: mainColliders,
    sitRange: SIT_RANGE,
    place,
    move,
    canHear: createVoiceRule(spots),
  });
  return cached;
}
