// Denah NIKORA Grand Hotel (satuan meter). x ke timur, z ke selatan (utara = -z), sama dengan villa-layout.js.
// Denah dasar seluruh lantai diturunkan dari TOWER_CENTER dan TOWER_HALF (tidak ada koordinat mutlak di denah lantai),
// supaya menara bisa digeser atau dilebarkan hanya dengan mengubah dua konstanta itu.
// Hotel berdiri di tengah Lingkar NIKORA (highway.js), di selatan gerbang villa (jarak ~300 m); denah dasar 156 x 108 m,
// sehingga tamu harus berkendara. Modul ini murni data + matematika (tanpa THREE).
//
// Menara 1000 lantai (level 0..999, tinggi total 4,2 km). Lantai dibuat malas (lazy) per lantai, tidak sekaligus.
//   level 0..3   podium: Lobi, restoran | Ballroom, rapat | Spa, kolam renang dalam, gym | Belanja, musala, klub anak, bioskop
//   level 4..997 kamar tamu (76 kamar per lantai), kecuali Sky Lobby
//   Sky Lobby    tiap 50 lantai (level 50, 100, ... 950): fasilitas publik bergilir
//   level 998    suite eksekutif | level 999 Sky Lounge, kolam infinity, teras
//   Sky Walk     dek kaca di luar tapak level 999, menjorok ke barat dari teras Infinity Pool (hotel-skywalk.js), langit terbuka
// Perabot tiap ruang ditata oleh hotel-furnish.js (katalog di hotel-props.js); sekat kamar mandi ikut menjadi dinding.
import { HIGHWAY_LIMIT, highwayName, onHighway } from './highway.js';
import { PLAYER_RADIUS, WALL_THICKNESS, BOUNDS as VILLA_BOUNDS, GATE_HALF_WIDTH, buildWallSegments, wallToRect, resolveMove, isWalkable } from './villa-layout.js';
import { furnishLevel } from './hotel-furnish.js';
import { PROP_DEFS, propRect } from './hotel-props.js';
import { inSkyWalk, skyWalkSpec } from './hotel-skywalk.js';

export const HOTEL_LEVEL_COUNT = 1000;
export const HOTEL_LEVEL_HEIGHT = 4.2;
export const HOTEL_WALL_HEIGHT = 3.9;
export const SKY_LOBBY_EVERY = 50;
export const PODIUM_LEVELS = 4; // level 0..3 = podium publik
export const HOTEL_TOP_LEVEL = HOTEL_LEVEL_COUNT - 1;
export const hotelLevelY = (level) => (level ?? 0) * HOTEL_LEVEL_HEIGHT;
export const HOTEL_TOP_Y = HOTEL_LEVEL_COUNT * HOTEL_LEVEL_HEIGHT; // 4200 m: puncak menara (helipad di atapnya)

// ---------------------------------------------------------------- taper menara
// Menara meruncing per zona 50 lantai (tiap Sky Lobby). Denah satu zona sama untuk semua lantainya dan sama dengan skala
// di ATAS zona itu, sehingga kulit kaca yang miring di dalam zona selalu berada di luar lantai. Podium dan zona 0 = 1,00.
// Inti lift (16 x 16 m) tidak ikut mengecil; hanya bagian luarnya (kamar, petak publik) yang dipadatkan.
export const TOWER_ZONE_LEVELS = 50;
export const TOWER_TAPER = 0.3; // penyusutan total di puncak: skala akhir 1 - 0,3 = 0,70
export const TOWER_CENTER = Object.freeze({ x: 0, z: 507 }); // tepi utara denah = 453, tepat di belakang halaman drop-off
export const TOWER_HALF = Object.freeze({ x: 78, z: 54 }); // setengah lebar/dalam denah dasar (HOTEL_BUILDING): 156 x 108 m (dulu 72 x 56)
// Turunan denah dasar (meter). Dipakai untuk inti, petak publik, deretan kamar tamu, pintu, dan perabot.
const CX = TOWER_CENTER.x;
const CZ = TOWER_CENTER.z;
const HX = TOWER_HALF.x;
const HZ = TOWER_HALF.z;
const CORE_HALF = 8; // setengah sisi inti lift/tangga (16 x 16 m); tidak ikut mengecil
const WING = 10; // lebar sayap barat/timur = kedalaman deret kamar sisi utara/selatan
// Jumlah kamar per sisi dibulatkan dari ukuran kamar idaman, lalu lebar/dalam kamar dihitung ulang supaya deret kamar
// menutup sisi bangunan persis (tanpa celah atau kamar yang menonjol keluar), berapa pun TOWER_HALF.
const ROOM_W_WANT = 6; // lebar kamar idaman di sisi utara/selatan
const ROOM_D_WANT = 7.2; // dalam kamar idaman di sisi barat/timur
const NS_ROOMS = Math.round((2 * HX) / ROOM_W_WANT); // kamar per sisi utara/selatan (156 m -> 26)
const WE_ROOMS = Math.round((2 * (HZ - WING)) / ROOM_D_WANT); // kamar per sisi barat/timur (88 m -> 12)
const ROOM_W = (2 * HX) / NS_ROOMS; // 6 m
const ROOM_D = (2 * (HZ - WING)) / WE_ROOMS; // sekitar 7,33 m
/** Skala denah pada batas ke-k antar zona (k = 0..20): 1 di bawah, 1 - TOWER_TAPER di puncak (kurva t^1,5 = cekung). */
export const towerScaleAt = (k) => (k <= 0 ? 1 : 1 - TOWER_TAPER * Math.pow(Math.min(1, (k * TOWER_ZONE_LEVELS) / (HOTEL_LEVEL_COUNT - 1)), 1.5));
export const towerZone = (level) => Math.floor(Math.max(0, level) / TOWER_ZONE_LEVELS);
/** Skala denah satu lantai: podium dan zona 0 = 1; zona lain = skala di batas atas zonanya. */
export const towerScale = (level) => (level < PODIUM_LEVELS || towerZone(level) === 0 ? 1 : towerScaleAt(towerZone(level) + 1));
const footprints = new Map();
/** Persegi tapak satu lantai [minX, minZ, maxX, maxZ]; lantai 0..49 = HOTEL_BUILDING. */
export function hotelFootprint(level = 0) {
  const s = towerScale(level);
  let f = footprints.get(s);
  if (!f) {
    f = Object.freeze([-TOWER_HALF.x * s, TOWER_CENTER.z - TOWER_HALF.z * s, TOWER_HALF.x * s, TOWER_CENTER.z + TOWER_HALF.z * s]);
    footprints.set(s, f);
  }
  return f;
}
const squash = (v, c, half, s) => {
  const core = CORE_HALF;
  const d = v - c;
  const a = Math.abs(d);
  return a <= core ? v : c + Math.sign(d) * (core + ((a - core) * (half * s - core)) / (half - core));
};
/** Pemetaan titik denah dasar ke denah berskala (null bila skala 1). Inti tetap, bagian luar dipadatkan secara linear. */
function planMap(level) {
  const s = towerScale(level);
  if (s === 1) return null;
  return { x: (v) => squash(v, TOWER_CENTER.x, TOWER_HALF.x, s), z: (v) => squash(v, TOWER_CENTER.z, TOWER_HALF.z, s) };
}
const mapRect = (m, r) => (m ? [m.x(r[0]), m.z(r[1]), m.x(r[2]), m.z(r[3])] : r);

// Sky Walk: dek kaca di luar tapak Sky Level (level 999), menjorok ke barat dari tepi teras Infinity Pool (hotel-skywalk.js). Tanpa atap.
// Pusatnya 15 m di selatan pusat menara: di dalam rentang z teras Infinity Pool (sisi barat inti) pada denah yang menyusut.
export const SKY_WALK = skyWalkSpec(hotelFootprint(HOTEL_TOP_LEVEL), TOWER_CENTER.z + 15);

// Tapak bangunan dan halaman.
export const HOTEL_BUILDING = Object.freeze([CX - HX, CZ - HZ, CX + HX, CZ + HZ]);
export const HOTEL_SITE = Object.freeze({ minX: -150, maxX: 150, minZ: 352, maxZ: 566 }); // di dalam Lingkar NIKORA (tepi dalam aspal x = ±152,75; z = 347,25 .. 567,75)
export const HOTEL_FORECOURT = Object.freeze([-30, 380, 30, 449]); // drop-off, valet, putaran mobil
export const HOTEL_PARKING = Object.freeze([44, 384, 104, 453]);
export const HOTEL_SPAWN = Object.freeze({ x: 0, z: 436 });

// Jalan raya dari gerbang villa ke hotel. Dua lajur (kiri) selebar 12 m.
// (Sudah digantikan Jalan Raya NIKORA 34,5 m di highway.js; ROAD tinggal penanda ruas villa-hotel lama dan dipakai tes.)
export const ROAD = Object.freeze({ x: 0, half: 6, fromZ: VILLA_BOUNDS.maxZ, toZ: HOTEL_FORECOURT[1] });

const inRect = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];

/** Jenis permukaan untuk fisika mobil: 'road' (aspal), 'compound' (di dalam pagar villa), 'ground' (tanah/rumput). */
export function surfaceAt(x, z) {
  if (onHighway(x, z)) return 'road'; // Jalan Raya NIKORA: lengan ke villa, aula, royal, masjid + Lingkar hotel
  if (inRect(HOTEL_FORECOURT, x, z) || inRect(HOTEL_PARKING, x, z)) return 'road';
  if (x >= VILLA_BOUNDS.minX && x <= VILLA_BOUNDS.maxX && z >= VILLA_BOUNDS.minZ && z <= VILLA_BOUNDS.maxZ) return 'compound';
  return 'ground';
}

// ---------------------------------------------------------------- jenis lantai
/** Sky Lobby: lantai publik bergilir tiap SKY_LOBBY_EVERY lantai (bukan lantai atas). */
export const isSkyLobbyLevel = (level) => Number.isInteger(level) && level > 0 && level % SKY_LOBBY_EVERY === 0 && level < HOTEL_TOP_LEVEL - 1;
export const isGuestLevel = (level) => Number.isInteger(level) && level >= PODIUM_LEVELS && level <= HOTEL_TOP_LEVEL - 2 && !isSkyLobbyLevel(level);
export const GUESTS_PER_LEVEL = 2 * NS_ROOMS + 2 * WE_ROOMS; // 76 (26 per sisi utara/selatan, 12 per sisi barat/timur)
export const GUEST_LEVEL_COUNT = Array.from({ length: HOTEL_LEVEL_COUNT }, (_, l) => l).filter(isGuestLevel).length;
export const GUEST_ROOM_TOTAL = GUEST_LEVEL_COUNT * GUESTS_PER_LEVEL;

const PODIUM_NAMES = Object.freeze(['Lobi & Restoran', 'Ballroom & Pertemuan', 'Spa & Kebugaran', 'Gaya Hidup & Keluarga']);

/** Nama lantai (level 0 = "Lantai 1"). */
export function floorName(level) {
  if (!Number.isInteger(level) || level < 0 || level >= HOTEL_LEVEL_COUNT) return '';
  if (level < PODIUM_LEVELS) return PODIUM_NAMES[level];
  if (level === HOTEL_TOP_LEVEL) return 'Sky Level';
  if (level === HOTEL_TOP_LEVEL - 1) return 'Suite Eksekutif';
  if (isSkyLobbyLevel(level)) return `Sky Lobby ${level / SKY_LOBBY_EVERY}`;
  if (level < 300) return 'Deluxe';
  if (level < 600) return 'Premier';
  if (level < 900) return 'Grand Premier';
  return 'Royal Residence';
}

const indexOf = (k) => (typeof k === 'string' && /^\d+$/.test(k) ? Number(k) : -1);

/** Daftar nama lantai (mirip array: panjang 1000, FLOOR_NAMES[i] = floorName(i)); dihitung saat diminta. */
export const FLOOR_NAMES = new Proxy([], {
  get(target, key) {
    if (key === 'length') return HOTEL_LEVEL_COUNT;
    const i = indexOf(key);
    return i >= 0 ? (i < HOTEL_LEVEL_COUNT ? floorName(i) : undefined) : Reflect.get(target, key);
  },
});

// ---------------------------------------------------------------- inti, lift
export const HOTEL_CORE = Object.freeze([CX - CORE_HALF, CZ - CORE_HALF, CX + CORE_HALF, CZ + CORE_HALF]);
const CAB_X = [-5.25, -1.75, 1.75, 5.25]; // selisih x kabin dari pusat menara
const CAB_Z = [CZ - CORE_HALF + 1, CZ - CORE_HALF + 4.6]; // kabin berderet di sisi utara inti
export const LIFTS = Object.freeze(CAB_X.map((ox, i) => Object.freeze({ id: `lift_${i + 1}`, name: `Lift ${i + 1}`, rect: [CX + ox - 1.4, CAB_Z[0], CX + ox + 1.4, CAB_Z[1]] })));
const LIFT_SECONDS_PER_LEVEL = 0.45; // lift biasa: sampai 20 lantai pertama
const LIFT_EXPRESS_SECONDS_PER_LEVEL = 0.012; // lantai selanjutnya ditempuh dengan kecepatan ekspres
const LIFT_BASE_SECONDS = 1.2;

export function liftAt(x, z) {
  return LIFTS.find((l) => x >= l.rect[0] && x <= l.rect[2] && z >= l.rect[1] && z <= l.rect[3]) ?? null;
}

/** Lama perjalanan lift untuk `distance` lantai (ms); makin jauh makin lama, tetapi 999 lantai tetap di bawah 30 detik. */
export function liftTravelMs(distance) {
  const d = Math.abs(distance);
  return Math.round((LIFT_BASE_SECONDS + Math.min(d, 20) * LIFT_SECONDS_PER_LEVEL + Math.max(0, d - 20) * LIFT_EXPRESS_SECONDS_PER_LEVEL) * 1000);
}

/** Naik/turun dengan lift: harus berdiri di dalam kabin. Mengembalikan posisi baru + lama perjalanan, atau null. */
export function rideLift(pos, toLevel) {
  const from = pos.level ?? 0;
  if (!Number.isInteger(toLevel) || toLevel < 0 || toLevel >= HOTEL_LEVEL_COUNT || toLevel === from) return null;
  if (!liftAt(pos.x, pos.z)) return null;
  return { x: pos.x, z: pos.z, level: toLevel, stair: null, y: hotelLevelY(toLevel), travelMs: liftTravelMs(toLevel - from) };
}

// ---------------------------------------------------------------- program lantai
// Satu kerangka untuk semua lantai: inti di tengah, enam petak mengelilinginya (n, nw, ne, w, e, s).
const SLOT = Object.freeze({
  n: [CX - (HX - WING), CZ - HZ, CX + (HX - WING), CZ - CORE_HALF], nw: [CX - HX, CZ - HZ, CX - (HX - WING), CZ - CORE_HALF], ne: [CX + (HX - WING), CZ - HZ, CX + HX, CZ - CORE_HALF],
  w: [CX - HX, CZ - CORE_HALF, CX - CORE_HALF, CZ + HZ], e: [CX + CORE_HALF, CZ - CORE_HALF, CX + HX, CZ + HZ], s: [CX - CORE_HALF, CZ + CORE_HALF, CX + CORE_HALF, CZ + HZ],
});

// Program publik per jenis lantai: 0..3 podium, 13 = suite eksekutif (lantai 999), 14 = Sky Level (lantai 1000).
const PUBLIC_PROGRAM = Object.freeze({
  0: { n: ['lobby', 'Grand Lobby & Reception', 'lobby'], nw: ['concierge', 'Concierge & Bell Desk', 'lobby'], ne: ['lobby_cafe', 'Lobby Lounge & Cafe', 'restaurant'], w: ['grand_dining', 'Grand Dining', 'restaurant'], e: ['specialty_dining', 'Specialty Restaurant', 'restaurant'], s: ['kitchen', 'Kitchen & Service', 'kitchen'] },
  1: { n: ['ballroom', 'Grand Ballroom', 'hall'], nw: ['bridal_suite', 'Bridal Suite', 'bridal'], ne: ['foyer', 'Pre-function Foyer', 'lobby'], w: ['meeting_center', 'Meeting Center', 'meeting'], e: ['business_center', 'Business Center', 'meeting'], s: ['catering', 'Catering & Service', 'kitchen'] },
  2: { n: ['spa', 'Spa & Wellness', 'spa'], nw: ['sauna', 'Sauna & Steam Room', 'spa'], ne: ['salon', 'Beauty Salon', 'spa'], w: ['indoor_pool', 'Indoor Swimming Pool', 'pool'], e: ['gym', 'Fitness Center', 'gym'], s: ['yoga', 'Yoga Studio', 'gym'] },
  3: { n: ['arcade_shops', 'Shopping Arcade', 'shop'], nw: ['musholla', 'Musholla', 'prayer'], ne: ['kids_club', 'Kids Club', 'kids'], w: ['cinema', 'Mini Cinema', 'cinema'], e: ['game_zone', 'Game Zone', 'games'], s: ['library', 'Library Lounge', 'library'] },
  13: { n: ['exec_lounge', 'Executive Lounge', 'lounge'], nw: ['royal_suite', 'Royal Suite', 'suite'], ne: ['presidential_suite', 'Presidential Suite', 'suite'], w: ['sultan_suite', 'Sultan Penthouse', 'suite'], e: ['garden_suite', 'Sky Garden Suite', 'suite'], s: ['butler', 'Butler Service', 'kitchen'] },
  14: { n: ['sky_lounge', 'Sky Lounge & Bar', 'lounge'], nw: ['sky_terrace_w', 'Sky Terrace Barat', 'terrace'], ne: ['sky_terrace_e', 'Sky Terrace Timur', 'terrace'], w: ['infinity_pool', 'Infinity Pool', 'terrace'], e: ['sky_dining', 'Sky Dining', 'restaurant'], s: ['sky_spa', 'Sky Chapel & Wedding Deck', 'hall'] },
});

// Sky Lobby memakai program podium secara bergilir (lobi, gaya hidup, spa, ballroom).
const SKY_LOBBY_CYCLE = Object.freeze([0, 3, 2, 1]);

function programFor(level) {
  if (level < PODIUM_LEVELS) return PUBLIC_PROGRAM[level];
  if (level === HOTEL_TOP_LEVEL) return PUBLIC_PROGRAM[14];
  if (level === HOTEL_TOP_LEVEL - 1) return PUBLIC_PROGRAM[13];
  const k = level / SKY_LOBBY_EVERY;
  const base = PUBLIC_PROGRAM[SKY_LOBBY_CYCLE[(k - 1) % SKY_LOBBY_CYCLE.length]];
  const out = {};
  for (const [slot, [id, name, kind]] of Object.entries(base)) out[slot] = [`${id}_l${level + 1}`, kind === 'kitchen' ? name : `Sky · ${name}`, kind];
  return out;
}

const CORE_ROOM = (level) => ({ id: `core_${level}`, name: 'Lift & Tangga', kind: 'core', level, rect: HOTEL_CORE });

function guestCells(level) {
  const cells = [];
  let n = 1;
  const add = (rect, door, bed, side) => cells.push({ id: `h${level + 1}_${String(n).padStart(2, '0')}`, name: `Kamar ${(level + 1) * 100 + n}`, kind: 'guest', level, rect, door, bed, no: n++, side });
  const x0 = CX - HX; // tepi barat
  const x1 = CX + HX; // tepi timur
  const zN = CZ - HZ; // tepi utara
  const zS = CZ + HZ; // tepi selatan
  for (let i = 0; i < NS_ROOMS; i++) { const x = x0 + i * ROOM_W; add([x, zN, x + ROOM_W, zN + WING], { x: x + ROOM_W / 2, z: zN + WING, orient: 'h', width: 1.6 }, { x: x + ROOM_W / 2, z: zN + 1.6 }, 'n'); }
  for (let i = 0; i < NS_ROOMS; i++) { const x = x0 + i * ROOM_W; add([x, zS - WING, x + ROOM_W, zS], { x: x + ROOM_W / 2, z: zS - WING, orient: 'h', width: 1.6 }, { x: x + ROOM_W / 2, z: zS - 1.6 }, 's'); }
  for (let i = 0; i < WE_ROOMS; i++) { const z = zN + WING + i * ROOM_D; add([x0, z, x0 + WING, z + ROOM_D], { x: x0 + WING, z: z + ROOM_D / 2, orient: 'v', width: 1.6 }, { x: x0 + 1.6, z: z + ROOM_D / 2 }, 'w'); }
  for (let i = 0; i < WE_ROOMS; i++) { const z = zN + WING + i * ROOM_D; add([x1 - WING, z, x1, z + ROOM_D], { x: x1 - WING, z: z + ROOM_D / 2, orient: 'v', width: 1.6 }, { x: x1 - 1.6, z: z + ROOM_D / 2 }, 'e'); }
  const m = planMap(level);
  if (!m) return cells.map(({ side, ...c }) => c);
  // lantai meruncing: persegi kamar dipadatkan, pintu dan tempat tidur dihitung ulang dari persegi barunya
  return cells.map(({ side, ...c }) => {
    const r = mapRect(m, c.rect);
    const mx = (r[0] + r[2]) / 2;
    const mz = (r[1] + r[3]) / 2;
    const door = side === 'n' ? { x: mx, z: r[3] } : side === 's' ? { x: mx, z: r[1] } : side === 'w' ? { x: r[2], z: mz } : { x: r[0], z: mz };
    const bed = side === 'n' ? { x: mx, z: r[1] + 1.6 } : side === 's' ? { x: mx, z: r[3] - 1.6 } : side === 'w' ? { x: r[0] + 1.6, z: mz } : { x: r[2] - 1.6, z: mz };
    return { ...c, rect: r, door: { ...c.door, ...door }, bed };
  });
}

function levelRooms(level) {
  if (isGuestLevel(level)) return [CORE_ROOM(level), ...guestCells(level)];
  const prog = programFor(level);
  const m = planMap(level);
  return [CORE_ROOM(level), ...Object.entries(prog).map(([slot, [id, name, kind]]) => ({ id: `${id}`, name, kind, level, rect: mapRect(m, SLOT[slot]) }))];
}

// Pintu: tiap petak publik tersambung ke inti/petak tetangga; lantai tamu: inti terbuka ke lorong, kamar membuka ke lorong.
function levelDoors(level) {
  const m = planMap(level);
  const raw = (x, z, orient, width, extra = {}) => ({ level, x, z, orient, width, ...extra });
  // posisi pintu = selisih (dx, dz) dari pusat menara pada denah dasar; dipadatkan bila lantai meruncing
  const d = (dx, dz, orient, width, extra = {}) => raw(m ? m.x(CX + dx) : CX + dx, m ? m.z(CZ + dz) : CZ + dz, orient, width, extra);
  const wingX = HX - WING; // batas sayap barat/timur dari pusat
  const midN = -(HZ + CORE_HALF) / 2; // tengah petak utara
  const midS = (HZ + CORE_HALF) / 2; // tengah petak selatan
  const midNX = (wingX + CORE_HALF) / 2; // tengah petak utara antara sayap dan inti
  const coreDoors = [d(0, -CORE_HALF, 'h', 4, { tall: true }), d(0, CORE_HALF, 'h', 4), d(-CORE_HALF, 0, 'v', 4), d(CORE_HALF, 0, 'v', 4)];
  if (isGuestLevel(level)) return [...coreDoors, ...guestCells(level).map((c) => raw(c.door.x, c.door.z, c.door.orient, c.door.width))];
  const doors = [...coreDoors, d(-wingX, midN, 'v', 3, { tall: true }), d(wingX, midN, 'v', 3, { tall: true }), d(-midNX, -CORE_HALF, 'h', 4, { tall: true }), d(midNX, -CORE_HALF, 'h', 4, { tall: true }), d(-CORE_HALF, midS, 'v', 3), d(CORE_HALF, midS, 'v', 3)];
  if (level === 0) doors.push(d(0, -HZ, 'h', 6, { tall: true }), d(-14, -HZ, 'h', 3), d(14, -HZ, 'h', 3), d(0, HZ, 'h', 3), d(-20, HZ, 'h', 3), d(20, HZ, 'h', 3));
  return doors;
}

const roomsCache = new Map();
/** Ruang-ruang satu lantai (dibuat sekali, lalu disimpan). Lantai di luar 0..999 mengembalikan daftar kosong. */
export function hotelRoomsAtLevel(level) {
  if (!Number.isInteger(level) || level < 0 || level >= HOTEL_LEVEL_COUNT) return [];
  let rooms = roomsCache.get(level);
  if (!rooms) {
    rooms = Object.freeze(levelRooms(level));
    roomsCache.set(level, rooms);
  }
  return rooms;
}

/** Mirip array ruang per lantai; tiap lantai dibuat saat diakses. */
export const HOTEL_LEVELS_ROOMS = new Proxy([], {
  get(target, key) {
    if (key === 'length') return HOTEL_LEVEL_COUNT;
    const i = indexOf(key);
    return i >= 0 ? (i < HOTEL_LEVEL_COUNT ? hotelRoomsAtLevel(i) : undefined) : Reflect.get(target, key);
  },
});

// Area terbuka lantai dasar (label lokasi).
export const HOTEL_ZONES = Object.freeze([
  { id: 'hotel_forecourt', name: 'Drop-off & Valet', kind: 'forecourt', rect: HOTEL_FORECOURT },
  { id: 'hotel_parking', name: 'Parkir Tamu Hotel', kind: 'parking', rect: HOTEL_PARKING },
]);

// Penghalang tetap di halaman: air mancur dan tiang kanopi drop-off (juga digambar hotel-world.js).
export const HOTEL_FOUNTAIN = Object.freeze({ x: 0, z: 429, r: 3.2 });
export const HOTEL_CANOPY = Object.freeze({ rect: [-18, 439, 18, 453], height: 6.4, pillars: Object.freeze([[-15, 443], [15, 443], [-15, 451], [15, 451]]) });
const FIXED_COLLIDERS = Object.freeze([
  { minX: HOTEL_FOUNTAIN.x - HOTEL_FOUNTAIN.r, maxX: HOTEL_FOUNTAIN.x + HOTEL_FOUNTAIN.r, minZ: HOTEL_FOUNTAIN.z - HOTEL_FOUNTAIN.r, maxZ: HOTEL_FOUNTAIN.z + HOTEL_FOUNTAIN.r },
  ...HOTEL_CANOPY.pillars.map(([x, z]) => ({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 })),
]);

// Slot parkir tamu (2 baris x 6) dan titik drop-off; dipakai untuk menaruh mobil.
export const HOTEL_CAR_SPOTS = Object.freeze([
  ...[0, 1].flatMap((row) => [0, 1, 2, 3, 4, 5].map((i) => ({ id: `hp_${row}_${i}`, x: 52 + row * 24, z: 392 + i * 11, heading: Math.PI / 2 }))),
  ...[-18, -9, 9, 18].map((x, i) => ({ id: `valet_${i}`, x, z: 425, heading: Math.PI })),
]);

export function roomAt(x, z, level = 0) {
  const room = hotelRoomsAtLevel(level).find((r) => inRect(r.rect, x, z));
  if (room) return { id: room.id, name: room.name, kind: room.kind, indoor: room.kind !== 'terrace', level, floorName: floorName(level) };
  if (level === 0) {
    const zone = HOTEL_ZONES.find((r) => inRect(r.rect, x, z));
    if (zone) return { id: zone.id, name: zone.name, kind: zone.kind, indoor: false, level };
    if (surfaceAt(x, z) === 'road') return { id: 'road', name: highwayName(x, z) ?? 'Jalan Raya NIKORA', kind: 'road', indoor: false, level };
  }
  if (inSkyWalk(SKY_WALK, level, x, z)) return { id: 'sky_walk', name: 'Sky Walk · Dek Kaca', kind: 'terrace', indoor: false, level, floorName: floorName(level) };
  return { id: 'grounds', name: 'Hotel Grounds', kind: 'grounds', indoor: false, level };
}

let cached = null;
export function getHotelWorld() {
  if (cached) return cached;
  const levelCache = new Map();
  const buildLevel = (level) => {
    const rooms = hotelRoomsAtLevel(level);
    const baseDoors = levelDoors(level);
    // perabot + sekat kamar mandi; sekat ikut menjadi dinding dan pintunya menjadi pintu lantai
    const furnishing = furnishLevel({ rooms, doors: baseDoors });
    const doors = [...baseDoors, ...furnishing.doors.map((d) => ({ level, ...d }))];
    const walls = buildWallSegments([...rooms.filter((r) => r.kind !== 'terrace'), ...furnishing.rooms], doors);
    const props = furnishing.props.map((p) => ({ ...p, level }));
    const colliders = [...walls.map(wallToRect), ...props.filter((p) => PROP_DEFS[p.type].solid).map(propRect), ...(level === 0 ? FIXED_COLLIDERS : [])];
    return Object.freeze({ level, rooms, doors, walls, props, colliders });
  };
  // Seribu lantai tidak dibangun sekaligus: tiap lantai dihitung saat pertama kali dipakai.
  const levels = new Proxy([], {
    get(target, key) {
      if (key === 'length') return HOTEL_LEVEL_COUNT;
      const i = indexOf(key);
      if (i < 0) return Reflect.get(target, key);
      if (i >= HOTEL_LEVEL_COUNT) return undefined;
      let data = levelCache.get(i);
      if (!data) {
        data = buildLevel(i);
        levelCache.set(i, data);
      }
      return data;
    },
  });
  // Di dalam tapak lantai itu; di Sky Level juga di dek Sky Walk (di luar tapak, hotel-skywalk.js). Di lantai lain tepi bangunan berpagar.
  const inBuilding = (level, x, z, r) => { const b = hotelFootprint(level); return (x >= b[0] + r && x <= b[2] - r && z >= b[1] + r && z <= b[3] - r) || inSkyWalk(SKY_WALK, level, x, z, r); };

  const move = (pos, dx, dz) => {
    let { x, z } = pos;
    const level = pos.level ?? 0;
    const L = levels[level];
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
    for (let i = 0; i < n; i++) {
      const cand = resolveMove({ x: x + dx / n, z: z + dz / n }, PLAYER_RADIUS, L.colliders, HIGHWAY_LIMIT);
      if (level > 0 && !inBuilding(level, cand.x, cand.z, PLAYER_RADIUS)) continue; // lantai atas: tepi bangunan berpagar
      x = cand.x;
      z = cand.z;
    }
    return { x, z, level, stair: null, y: hotelLevelY(level) };
  };

  cached = Object.freeze({
    name: 'nikora-hotel', site: HOTEL_SITE, building: HOTEL_BUILDING, spawn: HOTEL_SPAWN, levelCount: HOTEL_LEVEL_COUNT,
    levelHeight: HOTEL_LEVEL_HEIGHT, levels, lifts: LIFTS, zones: HOTEL_ZONES, carSpots: HOTEL_CAR_SPOTS, skyWalk: SKY_WALK,
    move, rideLift, liftAt, roomAt,
    canStand: (level, x, z) => isWalkable(x, z, PLAYER_RADIUS, levels[level].colliders, HIGHWAY_LIMIT) && (level === 0 || inBuilding(level, x, z, PLAYER_RADIUS)),
  });
  return cached;
}

export { WALL_THICKNESS, GATE_HALF_WIDTH };
