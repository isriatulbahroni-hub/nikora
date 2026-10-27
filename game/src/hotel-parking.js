// Parkir NIKORA Grand Hotel: tiga zona terpisah, tidak pernah tercampur.
//   1) TAMU     : 500 slot mobil mewah (blok A-D) di barat tapak, blok D khusus pengisian mobil listrik.
//   2) KARYAWAN : parkir mobil di timur laut (lahan HOTEL_PARKING yang sudah ada) + parkir motor berkanopi di sebelahnya.
//   3) PEMILIK  : "Royal Garage" di timur, gerbang dan lajur sendiri, panggung putar untuk Bugatti + 5 bay cadangan.
// Murni data + matematika (tanpa THREE) supaya bisa diuji di Node; gambar 3D ada di hotel-parking-world.js.
// Satuan meter, bingkai koordinat hotel (x ke timur, z ke selatan, utara = -z). Sengaja TIDAK mengimpor hotel-layout.js
// (hotel-layout.test.js dan hotel-parking.test.js yang mencocokkan angka-angka ini dengan tapak, menara, dan halaman).

export const PARKING_STALL = Object.freeze({ guest: Object.freeze({ w: 2.8, d: 5.6 }), bike: Object.freeze({ w: 0.9, d: 2.0 }) });
const AISLE = 6.4; // lorong mobil
const PLANTER = 1.4; // jalur tanaman di antara dua modul
/** Satu modul tamu = baris kiri (5,6) + lorong (6,4) + baris kanan (5,6) + jalur tanaman (1,4). */
export const GUEST_MODULE_PITCH = PARKING_STALL.guest.d * 2 + AISLE + PLANTER; // 19 m
const BIKE_MODULE_PITCH = 8; // 2 + 3 lorong + 2 + 1 jalur

// ---- zona (persegi [minX, minZ, maxX, maxZ])
export const GUEST_NW = Object.freeze([-146, 358, -44, 447]); // blok barat laut: 5 modul x 2 baris x 31 slot
export const GUEST_LINK = Object.freeze([-146, 447, -44, 453]); // lajur penghubung barat-timur (6 m, tepat di utara sudut barat laut menara)
export const GUEST_LINK_W = Object.freeze([-146, 453, -84, 458]); // pelebaran ke barat (di luar tapak menara), menuju sayap barat
export const GUEST_FLANK = Object.freeze([-146, 458, -84, 556]); // sayap barat menara: 3 modul
export const GUEST_ENTRY_LANE = Object.freeze([-44, 380, -30, 449]); // dari halaman drop-off (tepi barat) ke lajur penghubung
export const STAFF_CARS = Object.freeze([44, 384, 104, 453]); // sama dengan HOTEL_PARKING (mobil karyawan yang sudah ada)
export const STAFF_BIKES = Object.freeze([108, 386, 146, 450]); // parkir motor karyawan + lahan cadangan di timurnya
export const STAFF_BIKES_CANOPY = Object.freeze([109, 388, 126, 420]); // bagian yang sudah dibangun (120 motor)
export const OWNER_LANE = Object.freeze([84, 453, 150, 462]); // lajur pribadi pemilik dari tepi timur tapak
export const OWNER_GARAGE = Object.freeze([96, 462, 140, 500]); // Royal Garage
export const OWNER_TURNTABLE = Object.freeze({ x: 118, z: 478, r: 4.6 });

/** Zona beserta persegi aspalnya, warna aksen, dan nama. */
export const PARKING_ZONES = Object.freeze([
  Object.freeze({ id: 'guest', name: 'Parkir Tamu', color: 0xc9a24b, rects: Object.freeze([GUEST_NW, GUEST_LINK, GUEST_LINK_W, GUEST_FLANK, GUEST_ENTRY_LANE]) }),
  Object.freeze({ id: 'staff_cars', name: 'Parkir Karyawan', color: 0x3b82f6, rects: Object.freeze([STAFF_CARS]) }),
  Object.freeze({ id: 'staff_bikes', name: 'Parkir Motor Karyawan', color: 0x3b82f6, rects: Object.freeze([STAFF_BIKES]) }),
  Object.freeze({ id: 'owner', name: 'Royal Garage', color: 0xe7c76a, rects: Object.freeze([OWNER_LANE, OWNER_GARAGE]) }),
]);

/** Semua persegi parkir: pohon taman dan benda lain tidak boleh ditaruh di sini. */
export const PARKING_KEEP_OUT = Object.freeze(PARKING_ZONES.flatMap((z) => z.rects));

export const inRect = (r, x, z) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
/** Zona parkir di titik (x, z), atau null. */
export const parkingZoneAt = (x, z) => PARKING_ZONES.find((zn) => zn.rects.some((r) => inRect(r, x, z))) ?? null;

/** Persegi alas satu slot (panjang slot searah sumbu `axis`). */
export const slotRect = (s) => (s.axis === 'z' ? [s.x - s.w / 2, s.z - s.d / 2, s.x + s.w / 2, s.z + s.d / 2] : [s.x - s.d / 2, s.z - s.w / 2, s.x + s.d / 2, s.z + s.w / 2]);

// ---- pembuat slot
// Satu baris: punggung slot di x = xBack, hidung mobil menghadap lorong (dir = +1 ke timur, -1 ke barat), n slot berurutan sepanjang z.
function row(out, { block, tag, xBack, dir, z0, n, w, d, ev = false, zone, counter }) {
  for (let i = 0; i < n; i++) {
    const k = (counter[tag] = (counter[tag] ?? 0) + 1);
    out.push(Object.freeze({ id: `${tag}-${String(k).padStart(3, '0')}`, zone, block, x: xBack + dir * d / 2, z: z0 + (i + 0.5) * w, w, d, axis: 'x', heading: dir > 0 ? 0 : Math.PI, ev }));
  }
}

// [blok, xKiri modul, z awal, slot per baris, listrik?]. Tiap modul = 2 baris.
const GUEST_MODULES = Object.freeze([
  ['A', -144, 359.1, 31, false], ['A', -125, 359.1, 31, false], // barat laut
  ['B', -106, 359.1, 31, false], ['B', -87, 359.1, 31, false], ['B', -68, 359.1, 31, false],
  ['C', -144, 462.2, 32, false], ['C', -125, 462.2, 32, false], // sayap barat menara
  ['D', -106, 463.6, 31, true],
]);

let guestCache = null;
/** 500 slot tamu: blok A 124, B 186, C 128, D 62 (listrik). Id `G-A-001`, dst. */
export function guestSlots() {
  if (guestCache) return guestCache;
  const { w, d } = PARKING_STALL.guest;
  const out = [];
  const counter = {};
  for (const [block, xL, z0, n, ev] of GUEST_MODULES) {
    const base = { block, tag: `G-${block}`, z0, n, w, d, ev, zone: 'guest', counter };
    row(out, { ...base, xBack: xL, dir: 1 });
    row(out, { ...base, xBack: xL + 2 * d + AISLE, dir: -1 });
  }
  guestCache = Object.freeze(out);
  return guestCache;
}

let bikeCache = null;
/** 120 slot motor karyawan di bawah kanopi (4 baris x 30). Id `M-001`, dst. */
export function bikeSlots() {
  if (bikeCache) return bikeCache;
  const { w, d } = PARKING_STALL.bike;
  const out = [];
  const counter = {};
  for (let m = 0; m < 2; m++) {
    const xL = 110 + m * BIKE_MODULE_PITCH;
    const base = { block: 'M', tag: 'M', z0: 390, n: 30, w, d, zone: 'staff_bikes', counter };
    row(out, { ...base, xBack: xL, dir: 1 });
    row(out, { ...base, xBack: xL + 2 * d + 3, dir: -1 });
  }
  bikeCache = Object.freeze(out);
  return bikeCache;
}

let ownerCache = null;
/** Royal Garage: OWNER-00 di panggung putar (Bugatti pemilik) + OWNER-01..05 di sepanjang dinding selatan. */
export function ownerSlots() {
  if (ownerCache) return ownerCache;
  const out = [Object.freeze({ id: 'OWNER-00', zone: 'owner', block: 'R', x: OWNER_TURNTABLE.x, z: OWNER_TURNTABLE.z, w: 3.2, d: 5.6, axis: 'x', heading: 0, ev: false, turntable: true })];
  for (let i = 0; i < 5; i++) out.push(Object.freeze({ id: `OWNER-0${i + 1}`, zone: 'owner', block: 'R', x: 101.5 + i * 7.2, z: 495, w: 3.4, d: 5.6, axis: 'z', heading: -Math.PI / 2, ev: false }));
  ownerCache = Object.freeze(out);
  return ownerCache;
}

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

/** Himpunan id slot yang terisi: tiap slot terisi dengan peluang `ratio` (seed tetap, hasil selalu sama). */
export function occupancy(slots, ratio = 0.4, seed = 2026) {
  const rand = mulberry32(seed);
  const out = new Set();
  for (const s of slots) if (rand() < ratio) out.add(s.id);
  return out;
}

export const GUEST_FILL = 0.4; // sekitar 40% slot tamu terisi
let guestOccCache = null;
/** Keterisian slot tamu yang dipakai bersama gambar 3D, papan blok, dan valet: satu sumber kebenaran, jadi slot "hijau" di layar = slot yang dipilih valet. */
export const guestOccupied = () => (guestOccCache ??= occupancy(guestSlots(), GUEST_FILL));

/** Warna lampu di kepala slot: tamu hijau/merah (listrik: biru muda saat kosong), karyawan biru, pemilik emas. */
export function slotLightColor(slot, occupied) {
  if (slot.zone === 'guest') return occupied ? 0xd64545 : slot.ev ? 0x39d0ff : 0x2ecc71;
  if (slot.zone === 'staff_bikes') return occupied ? 0x1f4fa8 : 0x5aa9ff;
  return occupied ? 0xb08a2e : 0xe7c76a;
}

/** Titik masuk valet: ujung barat lajur penghubung, tempat mobil tamu berbelok dari halaman. */
export const VALET_POINT = Object.freeze({ x: -37, z: 448 });
/** Slot tamu kosong terdekat dari titik masuk (jarak Manhattan, seperti jalan di lorong); null bila penuh. Valet digital. */
export function assignValet(occupied, from = VALET_POINT) {
  let best = null;
  let bestDist = Infinity;
  for (const s of guestSlots()) {
    if (occupied.has(s.id)) continue;
    const dist = Math.abs(s.x - from.x) + Math.abs(s.z - from.z);
    if (dist < bestDist) { best = s; bestDist = dist; }
  }
  return best;
}

/** Titik berdiri (di lorong, di depan hidung slot) untuk pejalan kaki yang diantar valet ke `slot`. */
export function valetStandPoint(slot) {
  if (slot.axis === 'z') return { x: slot.x, z: slot.z + Math.sign(Math.sin(slot.heading)) * (slot.d / 2 + 1.2) };
  return { x: slot.x + Math.sign(Math.cos(slot.heading)) * (slot.d / 2 + 1.2), z: slot.z };
}

/** Tujuan menu Jelajah (titik berdiri di lorong, bukan di atas slot). */
export const PARKING_PLACES = Object.freeze([
  { id: 'parkir_tamu_a', name: 'Parkir Tamu · Blok A', x: -135.2, z: 410 },
  { id: 'parkir_tamu_b', name: 'Parkir Tamu · Blok B', x: -97.2, z: 410 },
  { id: 'parkir_tamu_c', name: 'Parkir Tamu · Blok C', x: -135.2, z: 505 },
  { id: 'parkir_tamu_d', name: 'Parkir Tamu · Blok D (listrik)', x: -97.2, z: 507 },
  { id: 'parkir_motor', name: 'Parkir Motor Karyawan', x: 113.5, z: 404 },
  { id: 'royal_garage', name: 'Royal Garage (Pemilik)', x: 118, z: 468 },
].map((p) => Object.freeze(p)));

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

export const CAR_COLORS = Object.freeze([0x0b0b0d, 0xf4f4f2, 0xb9bdc4, 0x14233d, 0x6b0f1a, 0x2b2f33, 0xc9a24b]); // hitam, mutiara, perak, navy, marun, grafit, emas

/** Mobil tamu yang sedang parkir (untuk digambar): {id, x, z, heading, color}. */
export function parkedGuestCars(occupied, seed = 7) {
  const rand = mulberry32(seed);
  const out = [];
  for (const s of guestSlots()) {
    const color = CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]; // selalu diambil supaya warna tetap walau slot kosong
    if (occupied.has(s.id)) out.push({ id: s.id, x: s.x, z: s.z, heading: s.heading, color });
  }
  return out;
}
