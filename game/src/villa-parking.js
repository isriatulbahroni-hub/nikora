// Parkir NIKORA Wedding Villa: lahan luas di luar gerbang selatan, di kedua sisi jalan tanah (jalan yang sama dengan perjalanan hotel <-> villa).
//   1) TAMU     : 300 slot mobil (blok A-E, blok E khusus pengisian mobil listrik) di barat jalan, valet digital + papan "sisa slot".
//   2) KARYAWAN : 80 slot mobil di timur jalan, di bawah kanopi panel surya.
//   3) BUS      : terminal 10 bay bus antar-jemput di ujung selatan lajur layanan.
// Murni data + matematika (tanpa THREE) supaya bisa diuji di Node; gambar 3D ada di villa-parking-world.js.
// Satuan meter, bingkai koordinat villa (x ke timur, z ke selatan, utara = -z). Sengaja TIDAK mengimpor villa-layout.js:
// villa-layout.js yang mengimpor berkas ini (pohon di luar vila tidak boleh tumbuh di atas parkir).

export const VILLA_STALL = Object.freeze({ car: Object.freeze({ w: 2.8, d: 5.6 }), bus: Object.freeze({ w: 4.0, d: 13 }) });
const AISLE = 6.4; // lorong mobil
const PLANTER = 1.4; // jalur tanaman di antara dua modul
/** Satu modul = baris kiri (5,6) + lorong (6,4) + baris kanan (5,6) + jalur tanaman (1,4). */
export const MODULE_PITCH = VILLA_STALL.car.d * 2 + AISLE + PLANTER; // 19 m
const ROAD_HALF = 3.2; // setengah lebar jalan tanah dari gerbang (sama dengan COUNTRYSIDE.roadHalf di villa-layout.js)

// ---- zona (persegi [minX, minZ, maxX, maxZ])
export const PARKING_ROAD = Object.freeze([-ROAD_HALF, 104, ROAD_HALF, 196]); // ruas jalan yang diaspal di depan parkir
export const GUEST_ENTRY = Object.freeze([-105, 104, -ROAD_HALF, 111]); // lajur masuk tamu dari jalan ke barat (7 m)
export const GUEST_LOT = Object.freeze([-105, 111, -10, 196]); // 5 modul x 2 baris x 30 slot = 300
export const GUEST_PROMENADE = Object.freeze([-10, 111, -ROAD_HALF, 196]); // jalur pejalan di tepi jalan menuju gerbang villa
export const STAFF_ENTRY = Object.freeze([ROAD_HALF, 104, 50, 111]); // lajur masuk karyawan ke timur
export const STAFF_LOT = Object.freeze([12, 111, 50, 168]); // 2 modul x 2 baris x 20 slot = 80
export const SERVICE_LANE = Object.freeze([ROAD_HALF, 111, 12, 193]); // lajur layanan di tepi timur jalan, ke terminal bus
export const BUS_LOT = Object.freeze([12, 169, 76, 193]); // 10 bay bus + lorong manuver

/** Zona beserta persegi, warna aksen, dan nama. Persegi di dalam satu zona boleh bersentuhan; antarzona tidak saling menimpa. */
export const PARKING_ZONES = Object.freeze([
  Object.freeze({ id: 'guest', name: 'Parkir Tamu', color: 0xc9a24b, rects: Object.freeze([GUEST_ENTRY, GUEST_LOT, GUEST_PROMENADE]) }),
  Object.freeze({ id: 'staff', name: 'Parkir Karyawan', color: 0x3b82f6, rects: Object.freeze([STAFF_ENTRY, STAFF_LOT, SERVICE_LANE]) }),
  Object.freeze({ id: 'bus', name: 'Terminal Bus Antar-Jemput', color: 0xf59e0b, rects: Object.freeze([BUS_LOT]) }),
]);

/** Semua persegi parkir ditambah jalan beraspal: pohon dan benda lain tidak boleh ditaruh di sini. */
export const PARKING_KEEP_OUT = Object.freeze([...PARKING_ZONES.flatMap((z) => z.rects), PARKING_ROAD]);

export const inRect = (r, x, z) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
/** Zona parkir di titik (x, z), atau null. */
export const parkingZoneAt = (x, z) => PARKING_ZONES.find((zn) => zn.rects.some((r) => inRect(r, x, z))) ?? null;
/** Apakah (x, z) berada di dalam kawasan parkir (termasuk ruas jalan beraspal), dengan jarak aman `margin`. */
export const inParkingKeepOut = (x, z, margin = 0) => PARKING_KEEP_OUT.some((r) => x > r[0] - margin && x < r[2] + margin && z > r[1] - margin && z < r[3] + margin);

/** Persegi alas satu slot (panjang slot searah sumbu `axis`). */
export const slotRect = (s) => (s.axis === 'z' ? [s.x - s.w / 2, s.z - s.d / 2, s.x + s.w / 2, s.z + s.d / 2] : [s.x - s.d / 2, s.z - s.w / 2, s.x + s.d / 2, s.z + s.w / 2]);

// ---- pembuat slot
// Satu baris: punggung slot di x = xBack, hidung mobil menghadap lorong (dir = +1 ke timur, -1 ke barat), n slot berurutan sepanjang z.
function row(out, { block, tag, xBack, dir, z0, n, w, d, ev = false, zone, counter }) {
  for (let i = 0; i < n; i++) {
    const k = (counter[tag] = (counter[tag] ?? 0) + 1);
    out.push(Object.freeze({ id: `${tag}-${String(k).padStart(3, '0')}`, zone, block, x: xBack + (dir * d) / 2, z: z0 + (i + 0.5) * w, w, d, axis: 'x', heading: dir > 0 ? 0 : Math.PI, ev, aisleX: xBack + (dir > 0 ? d : -d) + (dir > 0 ? AISLE / 2 : -AISLE / 2) }));
  }
}

// [blok, xKiri modul, listrik?]. Tiap modul = 2 baris x 30 slot.
const GUEST_MODULES = Object.freeze([
  ['A', -105, false], ['B', -86, false], ['C', -67, false], ['D', -48, false], ['E', -29, true],
]);
const GUEST_Z0 = 111.5;
const GUEST_PER_ROW = 30;

let guestCache = null;
/** 300 slot tamu: blok A-D masing-masing 60, blok E 60 (listrik). Id `V-A-001`, dst. */
export function guestSlots() {
  if (guestCache) return guestCache;
  const { w, d } = VILLA_STALL.car;
  const out = [];
  const counter = {};
  for (const [block, xL, ev] of GUEST_MODULES) {
    const base = { block, tag: `V-${block}`, z0: GUEST_Z0, n: GUEST_PER_ROW, w, d, ev, zone: 'guest', counter };
    row(out, { ...base, xBack: xL, dir: 1 });
    row(out, { ...base, xBack: xL + 2 * d + AISLE, dir: -1 });
  }
  guestCache = Object.freeze(out);
  return guestCache;
}

// [blok, xKiri modul]. Tiap modul = 2 baris x 20 slot.
const STAFF_MODULES = Object.freeze([['S1', 12], ['S2', 31]]);
const STAFF_Z0 = 111.5;
const STAFF_PER_ROW = 20;

let staffCache = null;
/** 80 slot mobil karyawan (2 modul x 2 baris x 20). Id `V-S1-001`, dst. */
export function staffSlots() {
  if (staffCache) return staffCache;
  const { w, d } = VILLA_STALL.car;
  const out = [];
  const counter = {};
  for (const [block, xL] of STAFF_MODULES) {
    const base = { block, tag: `V-${block}`, z0: STAFF_Z0, n: STAFF_PER_ROW, w, d, zone: 'staff', counter };
    row(out, { ...base, xBack: xL, dir: 1 });
    row(out, { ...base, xBack: xL + 2 * d + AISLE, dir: -1 });
  }
  staffCache = Object.freeze(out);
  return staffCache;
}

const BUS_COUNT = 10;
const BUS_BACK_Z = 170;
const BUS_X0 = 14;
let busCache = null;
/** 10 bay bus berderet di x, punggung di utara, hidung ke lorong manuver di selatan. Id `V-BUS-01`, dst. */
export function busBays() {
  if (busCache) return busCache;
  const { w, d } = VILLA_STALL.bus;
  const out = [];
  for (let i = 0; i < BUS_COUNT; i++) {
    out.push(Object.freeze({ id: `V-BUS-${String(i + 1).padStart(2, '0')}`, zone: 'bus', block: 'BUS', x: BUS_X0 + (i + 0.5) * w, z: BUS_BACK_Z + d / 2, w, d, axis: 'z', heading: Math.PI / 2, ev: false }));
  }
  busCache = Object.freeze(out);
  return busCache;
}

// ---- jalur LED penuntun: panah bergerak sepanjang jalur (dir = arah gerak mobil masuk, sepanjang sumbu `axis`).
function buildGuides() {
  const out = [];
  const lane = (id, rect, axis, dir, color, wide = 1.1) => out.push(Object.freeze({ id, rect: Object.freeze(rect), axis, dir, color, wide }));
  lane('guest-entry', [GUEST_ENTRY[0], 106.2, GUEST_ENTRY[2], 108.8], 'x', -1, 0xf5c451);
  for (const [block, xL, ev] of GUEST_MODULES) {
    const cx = xL + VILLA_STALL.car.d + AISLE / 2;
    lane(`aisle-${block}`, [cx - 0.55, GUEST_LOT[1], cx + 0.55, GUEST_LOT[3] - 2], 'z', 1, ev ? 0x39d0ff : 0xf5c451);
  }
  lane('staff-entry', [STAFF_ENTRY[0], 106.2, STAFF_ENTRY[2], 108.8], 'x', 1, 0x5aa9ff);
  lane('service', [ROAD_HALF + 3.2, SERVICE_LANE[1], ROAD_HALF + 4.4, SERVICE_LANE[3] - 6], 'z', 1, 0x5aa9ff);
  for (const [block, xL] of STAFF_MODULES) {
    const cx = xL + VILLA_STALL.car.d + AISLE / 2;
    lane(`aisle-${block}`, [cx - 0.55, STAFF_LOT[1], cx + 0.55, STAFF_LOT[3] - 2], 'z', 1, 0x5aa9ff);
  }
  lane('bus-aisle', [BUS_LOT[0] + 3, 187.4, BUS_LOT[2] - 3, 188.6], 'x', 1, 0xffb347, 1.2);
  return Object.freeze(out);
}
export const GUIDE_LANES = buildGuides();

/** Kanopi panel surya: blok E (listrik) dan seluruh parkir karyawan. Tiang berdiri di jalur tanaman, bukan di atas slot. */
export const CANOPIES = Object.freeze([
  Object.freeze({ id: 'ev', rect: Object.freeze([-30.4, 111, -10, 196]), height: 4.8, pillarsX: Object.freeze([-29.7, -10.7]) }),
  Object.freeze({ id: 'staff', rect: Object.freeze([11, 111, 50, 168]), height: 4.5, pillarsX: Object.freeze([11.5, 30.3, 49.3]) }),
]);

// ---- keterisian, lampu slot, valet, statistik (semuanya deterministik)
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
export { mulberry32 };

/** Himpunan id slot yang terisi: tiap slot terisi dengan peluang `ratio` (seed tetap, hasil selalu sama). */
export function occupancy(slots, ratio = 0.5, seed = 2026) {
  const rand = mulberry32(seed);
  const out = new Set();
  for (const s of slots) if (rand() < ratio) out.add(s.id);
  return out;
}

export const GUEST_FILL = 0.6; // sekitar 60% slot tamu terisi (sekitar 180 mobil)
export const STAFF_FILL = 0.7;
export const BUS_FILL = 0.6;
let guestOccCache = null;
let staffOccCache = null;
let busOccCache = null;
/** Keterisian awal slot tamu, dipakai bersama gambar 3D, papan "sisa slot", dan valet: satu sumber kebenaran. */
export const guestOccupied = () => (guestOccCache ??= occupancy(guestSlots(), GUEST_FILL, 2026));
export const staffOccupied = () => (staffOccCache ??= occupancy(staffSlots(), STAFF_FILL, 31));
export const busOccupied = () => (busOccCache ??= occupancy(busBays(), BUS_FILL, 77));

/** Warna lampu di kepala slot: tamu hijau/merah (listrik: biru muda saat kosong), karyawan biru, bus oranye. */
export function slotLightColor(slot, occupied) {
  if (slot.zone === 'guest') return occupied ? 0xd64545 : slot.ev ? 0x39d0ff : 0x2ecc71;
  if (slot.zone === 'staff') return occupied ? 0x1f4fa8 : 0x5aa9ff;
  return occupied ? 0xb86e00 : 0xffb347;
}

/** Titik masuk valet: lajur masuk tamu, tepat di sisi barat jalan. */
export const VALET_POINT = Object.freeze({ x: -ROAD_HALF - 0.8, z: 107.5 });
/** Slot tamu kosong terdekat dari titik masuk (jarak Manhattan, seperti jalan di lorong); null bila penuh. Valet digital. `reserved` = slot yang sedang dituju mobil lain. */
export function assignValet(occupied, from = VALET_POINT, reserved = null) {
  let best = null;
  let bestDist = Infinity;
  for (const s of guestSlots()) {
    if (occupied.has(s.id) || reserved?.has(s.id)) continue;
    const dist = Math.abs(s.x - from.x) + Math.abs(s.z - from.z);
    if (dist < bestDist) { best = s; bestDist = dist; }
  }
  return best;
}

/** Titik berdiri (di lorong, di depan hidung slot) untuk pejalan kaki yang diantar valet ke `slot`. */
export function valetStandPoint(slot) {
  return { x: slot.x + Math.sign(Math.cos(slot.heading)) * (slot.d / 2 + 1.2), z: slot.z };
}

/**
 * Rute mobil dari titik masuk ke `slot` tamu: lurus di lajur masuk, belok ke lorong blok, turun sampai sejajar slot, lalu mundur masuk slot
 * (parkir mundur: hidung menghadap lorong, sama dengan mobil yang sudah parkir). Tiap titik: { x, z, reverse? } (reverse = ruas ini ditempuh mundur).
 */
export function routeToSlot(slot, from = VALET_POINT) {
  return [
    { x: from.x, z: from.z },
    { x: slot.aisleX, z: from.z },
    { x: slot.aisleX, z: slot.z },
    { x: slot.x, z: slot.z, reverse: true },
  ];
}
/** Rute pulang: kebalikan rute masuk, tetapi maju (keluar slot dengan hidung lebih dulu), lalu ke titik keluar di jalan. */
export function routeFromSlot(slot, to = VALET_POINT) {
  return [
    { x: slot.x, z: slot.z },
    { x: slot.aisleX, z: slot.z },
    { x: slot.aisleX, z: to.z },
    { x: to.x, z: to.z },
  ];
}
/** Panjang total rute (m). */
export const routeLength = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.abs(p.x - pts[i].x) + Math.abs(p.z - pts[i].z), 0);

/** Ringkasan per blok tamu dan total: papan "sisa slot" di pintu masuk. */
export function guestStats(occupied) {
  const blocks = {};
  for (const s of guestSlots()) {
    const b = (blocks[s.block] ??= { total: 0, occupied: 0, free: 0, ev: s.ev });
    b.total++;
    if (occupied.has(s.id)) b.occupied++;
    else b.free++;
  }
  const all = Object.values(blocks).reduce((a, b) => ({ total: a.total + b.total, occupied: a.occupied + b.occupied, free: a.free + b.free }), { total: 0, occupied: 0, free: 0 });
  return { blocks, ...all };
}

/**
 * Kejadian berikutnya di parkir tamu (mobil datang atau pergi), dipilih dari `rand` (0..1). Mobil datang bila ada slot kosong yang belum dituju,
 * peluangnya makin kecil makin penuh; mobil pergi memilih slot terisi acak yang belum dalam perjalanan keluar. null bila tidak ada yang bisa terjadi.
 */
export function pickParkingEvent(occupied, rand, { busy = new Set(), reserved = new Set() } = {}) {
  const slots = guestSlots();
  const taken = [];
  for (const s of slots) if (occupied.has(s.id) && !busy.has(s.id)) taken.push(s);
  const free = slots.length - occupied.size - reserved.size;
  const arrive = free > 0 && (taken.length === 0 || rand() < free / slots.length + 0.15);
  if (arrive) {
    const slot = assignValet(occupied, VALET_POINT, new Set([...reserved, ...busy]));
    return slot ? { type: 'arrive', slot } : null;
  }
  if (!taken.length) return null;
  return { type: 'leave', slot: taken[Math.floor(rand() * taken.length) % taken.length] };
}

export const CAR_COLORS = Object.freeze([0x0b0b0d, 0xf4f4f2, 0xb9bdc4, 0x14233d, 0x6b0f1a, 0x2b2f33, 0xc9a24b, 0x1f4d36]); // hitam, mutiara, perak, navy, marun, grafit, emas, hijau botol
export const BUS_COLORS = Object.freeze([0xf4f4f2, 0xc9a24b, 0x14233d]);

/** Mobil yang sedang parkir (untuk digambar): {id, x, z, heading, color}. Warna selalu diundi per slot supaya tetap walau slot kosong. */
export function parkedCars(slots, occupied, seed = 7) {
  const rand = mulberry32(seed);
  const out = [];
  for (const s of slots) {
    const color = CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)];
    if (occupied.has(s.id)) out.push({ id: s.id, x: s.x, z: s.z, heading: s.heading, color });
  }
  return out;
}

/** Bus yang sedang parkir di bay terisi: {id, x, z, color}. */
export function parkedBuses(occupied = busOccupied()) {
  const rand = mulberry32(5);
  const out = [];
  for (const s of busBays()) {
    const color = BUS_COLORS[Math.floor(rand() * BUS_COLORS.length)];
    if (occupied.has(s.id)) out.push({ id: s.id, x: s.x, z: s.z, color });
  }
  return out;
}
