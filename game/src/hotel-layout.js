// Denah NIKORA Grand Hotel (satuan meter). x ke timur, z ke selatan (utara = -z), sama dengan villa-layout.js.
// Hotel berdiri di dunia villa yang sama, di ujung selatan jalan raya dari gerbang villa (jarak ~300 m),
// sehingga tamu harus berkendara. Modul ini murni data + matematika (tanpa THREE).
//
// Menara 15 lantai (level 0..14). Antar lantai memakai 4 lift di inti bangunan.
//   level 0  Lobi, restoran | 1 Ballroom, rapat | 2 Spa, kolam renang dalam, gym | 3 Belanja, musala, klub anak, bioskop
//   level 4..12 kamar tamu (34 kamar per lantai) | 13 suite eksekutif | 14 Sky Lounge, kolam infinity, teras
import { PLAYER_RADIUS, WORLD_LIMIT, WALL_THICKNESS, BOUNDS as VILLA_BOUNDS, GATE_HALF_WIDTH, buildWallSegments, wallToRect, propToRect, resolveMove, isWalkable } from './villa-layout.js';

export const HOTEL_LEVEL_COUNT = 15;
export const HOTEL_LEVEL_HEIGHT = 4.2;
export const HOTEL_WALL_HEIGHT = 3.9;
export const hotelLevelY = (level) => (level ?? 0) * HOTEL_LEVEL_HEIGHT;
export const HOTEL_TOP_Y = HOTEL_LEVEL_COUNT * HOTEL_LEVEL_HEIGHT; // 63 m: puncak menara (helipad di atapnya)

// Tapak bangunan dan halaman.
export const HOTEL_BUILDING = Object.freeze([-36, 420, 36, 476]);
export const HOTEL_SITE = Object.freeze({ minX: -110, maxX: 110, minZ: 372, maxZ: 560 });
export const HOTEL_FORECOURT = Object.freeze([-30, 380, 30, 420]); // drop-off, valet, putaran mobil
export const HOTEL_PARKING = Object.freeze([44, 384, 104, 470]);
export const HOTEL_SPAWN = Object.freeze({ x: 0, z: 404 });

// Jalan raya dari gerbang villa ke hotel. Dua lajur (kiri) selebar 12 m.
export const ROAD = Object.freeze({ x: 0, half: 6, fromZ: VILLA_BOUNDS.maxZ, toZ: HOTEL_FORECOURT[1] });

const inRect = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];

/** Jenis permukaan untuk fisika mobil: 'road' (aspal), 'compound' (di dalam pagar villa), 'ground' (tanah/rumput). */
export function surfaceAt(x, z) {
  if (Math.abs(x - ROAD.x) <= ROAD.half && z >= ROAD.fromZ - 2 && z <= ROAD.toZ + 1) return 'road';
  if (inRect(HOTEL_FORECOURT, x, z) || inRect(HOTEL_PARKING, x, z)) return 'road';
  if (x >= VILLA_BOUNDS.minX && x <= VILLA_BOUNDS.maxX && z >= VILLA_BOUNDS.minZ && z <= VILLA_BOUNDS.maxZ) return 'compound';
  return 'ground';
}

// ---------------------------------------------------------------- inti, lift
export const HOTEL_CORE = Object.freeze([-8, 440, 8, 456]);
const CAB_X = [-5.25, -1.75, 1.75, 5.25];
export const LIFTS = Object.freeze(CAB_X.map((cx, i) => Object.freeze({ id: `lift_${i + 1}`, name: `Lift ${i + 1}`, rect: [cx - 1.4, 441, cx + 1.4, 444.6] })));
const LIFT_SECONDS_PER_LEVEL = 0.45;
const LIFT_BASE_SECONDS = 1.2;

export function liftAt(x, z) {
  return LIFTS.find((l) => x >= l.rect[0] && x <= l.rect[2] && z >= l.rect[1] && z <= l.rect[3]) ?? null;
}

/** Naik/turun dengan lift: harus berdiri di dalam kabin. Mengembalikan posisi baru + lama perjalanan, atau null. */
export function rideLift(pos, toLevel) {
  const from = pos.level ?? 0;
  if (!Number.isInteger(toLevel) || toLevel < 0 || toLevel >= HOTEL_LEVEL_COUNT || toLevel === from) return null;
  if (!liftAt(pos.x, pos.z)) return null;
  const travelMs = Math.round((LIFT_BASE_SECONDS + Math.abs(toLevel - from) * LIFT_SECONDS_PER_LEVEL) * 1000);
  return { x: pos.x, z: pos.z, level: toLevel, stair: null, y: hotelLevelY(toLevel), travelMs };
}

// ---------------------------------------------------------------- program lantai
// Satu kerangka untuk semua lantai: inti di tengah, enam petak mengelilinginya (n, nw, ne, w, e, s).
const SLOT = Object.freeze({
  n: [-26, 420, 26, 440], nw: [-36, 420, -26, 440], ne: [26, 420, 36, 440],
  w: [-36, 440, -8, 476], e: [8, 440, 36, 476], s: [-8, 456, 8, 476],
});

export const FLOOR_NAMES = Object.freeze([
  'Lobi & Restoran', 'Ballroom & Pertemuan', 'Spa & Kebugaran', 'Gaya Hidup & Keluarga',
  'Deluxe', 'Deluxe', 'Deluxe', 'Deluxe', 'Deluxe', 'Premier', 'Premier', 'Premier', 'Premier',
  'Suite Eksekutif', 'Sky Level',
]);

const PUBLIC_PROGRAM = Object.freeze({
  0: { n: ['lobby', 'Grand Lobby & Reception', 'lobby'], nw: ['concierge', 'Concierge & Bell Desk', 'lobby'], ne: ['lobby_cafe', 'Lobby Lounge & Cafe', 'restaurant'], w: ['grand_dining', 'Grand Dining', 'restaurant'], e: ['specialty_dining', 'Specialty Restaurant', 'restaurant'], s: ['kitchen', 'Kitchen & Service', 'kitchen'] },
  1: { n: ['ballroom', 'Grand Ballroom', 'hall'], nw: ['bridal_suite', 'Bridal Suite', 'bridal'], ne: ['foyer', 'Pre-function Foyer', 'lobby'], w: ['meeting_center', 'Meeting Center', 'meeting'], e: ['business_center', 'Business Center', 'meeting'], s: ['catering', 'Catering & Service', 'kitchen'] },
  2: { n: ['spa', 'Spa & Wellness', 'spa'], nw: ['sauna', 'Sauna & Steam Room', 'spa'], ne: ['salon', 'Beauty Salon', 'spa'], w: ['indoor_pool', 'Indoor Swimming Pool', 'pool'], e: ['gym', 'Fitness Center', 'gym'], s: ['yoga', 'Yoga Studio', 'gym'] },
  3: { n: ['arcade_shops', 'Shopping Arcade', 'shop'], nw: ['musholla', 'Musholla', 'prayer'], ne: ['kids_club', 'Kids Club', 'kids'], w: ['cinema', 'Mini Cinema', 'cinema'], e: ['game_zone', 'Game Zone', 'games'], s: ['library', 'Library Lounge', 'library'] },
  13: { n: ['exec_lounge', 'Executive Lounge', 'lounge'], nw: ['royal_suite', 'Royal Suite', 'suite'], ne: ['presidential_suite', 'Presidential Suite', 'suite'], w: ['sultan_suite', 'Sultan Penthouse', 'suite'], e: ['garden_suite', 'Sky Garden Suite', 'suite'], s: ['butler', 'Butler Service', 'kitchen'] },
  14: { n: ['sky_lounge', 'Sky Lounge & Bar', 'lounge'], nw: ['sky_terrace_w', 'Sky Terrace Barat', 'terrace'], ne: ['sky_terrace_e', 'Sky Terrace Timur', 'terrace'], w: ['infinity_pool', 'Infinity Pool', 'terrace'], e: ['sky_dining', 'Sky Dining', 'restaurant'], s: ['sky_spa', 'Sky Chapel & Wedding Deck', 'hall'] },
});

export const isGuestLevel = (level) => level >= 4 && level <= 12;
export const GUESTS_PER_LEVEL = 34;
export const GUEST_ROOM_TOTAL = (13 - 4) * GUESTS_PER_LEVEL;

const CORE_ROOM = (level) => ({ id: `core_${level}`, name: 'Lift & Tangga', kind: 'core', level, rect: HOTEL_CORE });

function guestCells(level) {
  const cells = [];
  let n = 1;
  const add = (rect, door, bed) => cells.push({ id: `h${level + 1}_${String(n).padStart(2, '0')}`, name: `Kamar ${(level + 1) * 100 + n}`, kind: 'guest', level, rect, door, bed, no: n++ });
  for (let i = 0; i < 12; i++) { const x = -36 + i * 6; add([x, 420, x + 6, 430], { x: x + 3, z: 430, orient: 'h', width: 1.6 }, { x: x + 3, z: 421.6 }); }
  for (let i = 0; i < 12; i++) { const x = -36 + i * 6; add([x, 466, x + 6, 476], { x: x + 3, z: 466, orient: 'h', width: 1.6 }, { x: x + 3, z: 474.4 }); }
  for (let i = 0; i < 5; i++) { const z = 430 + i * 7.2; add([-36, z, -26, z + 7.2], { x: -26, z: z + 3.6, orient: 'v', width: 1.6 }, { x: -34.4, z: z + 3.6 }); }
  for (let i = 0; i < 5; i++) { const z = 430 + i * 7.2; add([26, z, 36, z + 7.2], { x: 26, z: z + 3.6, orient: 'v', width: 1.6 }, { x: 34.4, z: z + 3.6 }); }
  return cells;
}

function levelRooms(level) {
  if (isGuestLevel(level)) return [CORE_ROOM(level), ...guestCells(level)];
  const prog = PUBLIC_PROGRAM[level];
  return [CORE_ROOM(level), ...Object.entries(prog).map(([slot, [id, name, kind]]) => ({ id: `${id}`, name, kind, level, rect: SLOT[slot] }))];
}

// Pintu: tiap petak publik tersambung ke inti/petak tetangga; lantai tamu: inti terbuka ke lorong, kamar membuka ke lorong.
function levelDoors(level) {
  const d = (x, z, orient, width, extra = {}) => ({ level, x, z, orient, width, ...extra });
  const coreDoors = [d(0, 440, 'h', 4, { tall: true }), d(0, 456, 'h', 4), d(-8, 448, 'v', 4), d(8, 448, 'v', 4)];
  if (isGuestLevel(level)) return [...coreDoors, ...guestCells(level).map((c) => d(c.door.x, c.door.z, c.door.orient, c.door.width))];
  const doors = [...coreDoors, d(-26, 430, 'v', 3, { tall: true }), d(26, 430, 'v', 3, { tall: true }), d(-17, 440, 'h', 4, { tall: true }), d(17, 440, 'h', 4, { tall: true }), d(-8, 466, 'v', 3), d(8, 466, 'v', 3)];
  if (level === 0) doors.push(d(0, 420, 'h', 6, { tall: true }), d(-14, 420, 'h', 3), d(14, 420, 'h', 3), d(0, 476, 'h', 3), d(-20, 476, 'h', 3), d(20, 476, 'h', 3));
  return doors;
}

function levelProps(level) {
  const p = (type, x, z) => ({ type, x, z, level });
  if (isGuestLevel(level)) return guestCells(level).map((c) => p('bed', c.bed.x, c.bed.z));
  const out = [];
  if (level === 0) {
    out.push(p('desk', -14, 424), p('desk', 14, 424), p('sofa', -6, 432), p('sofa', 6, 432));
    for (const x of [-30, -22, -14]) for (const z of [448, 460]) out.push(p('table', x, z));
    for (const x of [14, 22, 30]) for (const z of [448, 460]) out.push(p('table', x, z));
    out.push(p('counter', -3, 470), p('counter', 3, 470));
  } else if (level === 1) {
    for (const x of [-24, -12, 0, 12, 24]) for (const z of [426, 434]) out.push(p('table', x, z));
  } else if (level === 2) {
    out.push(p('tub', -22, 460), p('tub', 22, 470));
  } else if (level === 13) {
    for (const x of [-33, 33]) for (const z of [424]) out.push(p('bed', x, z));
    out.push(p('bed', -31, 470), p('bed', 31, 470), p('sofa', -3, 428), p('sofa', 3, 428));
  } else if (level === 14) {
    out.push(p('table', -6, 426), p('table', 6, 426), p('table', 20, 458), p('table', 28, 458), p('lounger', -22, 450), p('lounger', -16, 450));
  }
  return out;
}

export const HOTEL_LEVELS_ROOMS = Object.freeze(Array.from({ length: HOTEL_LEVEL_COUNT }, (_, l) => Object.freeze(levelRooms(l))));
export const hotelRoomsAtLevel = (level) => HOTEL_LEVELS_ROOMS[level] ?? [];

// Area terbuka lantai dasar (label lokasi).
export const HOTEL_ZONES = Object.freeze([
  { id: 'hotel_forecourt', name: 'Drop-off & Valet', kind: 'forecourt', rect: HOTEL_FORECOURT },
  { id: 'hotel_parking', name: 'Parkir Tamu Hotel', kind: 'parking', rect: HOTEL_PARKING },
]);

// Slot parkir tamu (2 baris x 6) dan titik drop-off; dipakai untuk menaruh mobil.
export const HOTEL_CAR_SPOTS = Object.freeze([
  ...[0, 1].flatMap((row) => [0, 1, 2, 3, 4, 5].map((i) => ({ id: `hp_${row}_${i}`, x: 52 + row * 24, z: 392 + i * 11, heading: Math.PI / 2 }))),
  ...[-18, -9, 9, 18].map((x, i) => ({ id: `valet_${i}`, x, z: 392, heading: Math.PI })),
]);

export function roomAt(x, z, level = 0) {
  const room = hotelRoomsAtLevel(level).find((r) => inRect(r.rect, x, z));
  if (room) return { id: room.id, name: room.name, kind: room.kind, indoor: room.kind !== 'terrace', level, floorName: FLOOR_NAMES[level] };
  if (level === 0) {
    const zone = HOTEL_ZONES.find((r) => inRect(r.rect, x, z));
    if (zone) return { id: zone.id, name: zone.name, kind: zone.kind, indoor: false, level };
    if (surfaceAt(x, z) === 'road') return { id: 'road', name: 'Jalan Raya NIKORA', kind: 'road', indoor: false, level };
  }
  return { id: 'grounds', name: 'Hotel Grounds', kind: 'grounds', indoor: false, level };
}

let cached = null;
export function getHotelWorld() {
  if (cached) return cached;
  const levels = [];
  for (let level = 0; level < HOTEL_LEVEL_COUNT; level++) {
    const rooms = hotelRoomsAtLevel(level);
    const doors = levelDoors(level);
    const walls = buildWallSegments(rooms.filter((r) => r.kind !== 'terrace'), doors);
    const props = levelProps(level);
    const colliders = [...walls.map(wallToRect), ...props.map(propToRect)];
    levels.push(Object.freeze({ level, rooms, doors, walls, props, colliders }));
  }
  const inBuilding = (x, z, r) => x >= HOTEL_BUILDING[0] + r && x <= HOTEL_BUILDING[2] - r && z >= HOTEL_BUILDING[1] + r && z <= HOTEL_BUILDING[3] - r;

  const move = (pos, dx, dz) => {
    let { x, z } = pos;
    const level = pos.level ?? 0;
    const L = levels[level];
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
    for (let i = 0; i < n; i++) {
      const cand = resolveMove({ x: x + dx / n, z: z + dz / n }, PLAYER_RADIUS, L.colliders, WORLD_LIMIT);
      if (level > 0 && !inBuilding(cand.x, cand.z, PLAYER_RADIUS)) continue; // lantai atas: tepi bangunan berpagar
      x = cand.x;
      z = cand.z;
    }
    return { x, z, level, stair: null, y: hotelLevelY(level) };
  };

  cached = Object.freeze({
    name: 'nikora-hotel', site: HOTEL_SITE, building: HOTEL_BUILDING, spawn: HOTEL_SPAWN, levelCount: HOTEL_LEVEL_COUNT,
    levelHeight: HOTEL_LEVEL_HEIGHT, levels, lifts: LIFTS, zones: HOTEL_ZONES, carSpots: HOTEL_CAR_SPOTS,
    move, rideLift, liftAt, roomAt,
    canStand: (level, x, z) => isWalkable(x, z, PLAYER_RADIUS, levels[level].colliders, WORLD_LIMIT) && (level === 0 || inBuilding(x, z, PLAYER_RADIUS)),
  });
  return cached;
}

export { WALL_THICKNESS, GATE_HALF_WIDTH };
