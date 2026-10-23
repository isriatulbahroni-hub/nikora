// Jalan Raya NIKORA: jaringan jalan yang menyambungkan hotel ke empat tempat acara (villa, aula, royal, masjid).
// Murni data + matematika (tanpa THREE); gambar 3D ada di highway-world.js. Satuan meter, bingkai koordinat hotel
// (x ke timur, z ke selatan, utara = -z; sama dengan villa-layout.js dan hotel-layout.js).
//
// Bentuk jaringan (hotel di tengah):
//   - Lingkar NIKORA: jalan keliling tapak hotel (persegi panjang, garis tengah di RING).
//   - Empat lengan keluar dari lingkar, masing-masing berakhir di sebuah gerbang:
//       utara -> villa   (gerbang di depan pagar selatan villa; lengan ini juga masuk ke halaman drop-off hotel)
//       barat -> aula    timur -> royal    selatan -> masjid
//   - Tiap jalan: 3 lajur per arah + median bertanaman + bahu jalan = 34,5 m (dulu 12 m, dua lajur).
// Keempat lengan sepanjang ARM_LENGTH (3 km) kini BERKELOK: garis tengahnya melenggok kiri-kanan (road-curve.js), lurus di pangkal (menyambung ke
// Lingkar) dan di ujung (gerbang + portal rambu). Pagar pengaman di kedua sisi (roadBarrier) menahan mobil tetap di jalan.
// Tiap tempat acara adalah halaman/dunia sendiri; mengemudi melewati gerbang = pindah ke halaman tempat acara itu
// (gateUrl). Antar-tempat acara tidak saling tersambung: semua lewat hotel.
import { BOUNDS as VILLA_BOUNDS } from './villa-layout.js';
import { VENUES } from './venues.js';
import { buildCurvedRoad } from './road-curve.js';

export const LANE_WIDTH = 3.75;
export const LANES_PER_DIRECTION = 3;
export const MEDIAN_WIDTH = 5;
export const SHOULDER_WIDTH = 3.5;
export const CARRIAGE_HALF = MEDIAN_WIDTH / 2 + LANES_PER_DIRECTION * LANE_WIDTH; // 13,75 dari garis tengah
export const HIGHWAY_HALF = CARRIAGE_HALF + SHOULDER_WIDTH; // 17,25: setengah lebar aspal termasuk bahu
export const HIGHWAY_WIDTH = HIGHWAY_HALF * 2; // 34,5 m

export const HUB = Object.freeze({ x: 0, z: 448 }); // pusat menara hotel
export const FORECOURT_Z = 380; // tepi utara halaman drop-off (= HOTEL_FORECOURT[1])
export const RING = Object.freeze({ minX: -170, maxX: 170, minZ: 330, maxZ: 585 }); // garis tengah Lingkar NIKORA
/** Pengaman jarak khusus halaman hotel: jaringan jalan jauh lebih luas daripada dunia villa (±600). */
export const HIGHWAY_LIMIT = Object.freeze({ minX: -3500, maxX: 3500, minZ: -3500, maxZ: 3900 });
export const ARM_LENGTH = 3000; // panjang sumbu tiap lengan dari tepi Lingkar sampai gerbang (jalan sebenarnya lebih panjang karena berkelok)
export const BARRIER_HALF = HIGHWAY_HALF + 1.2; // pagar pengaman di luar bahu

const H = HIGHWAY_HALF;

function segment(id, name, axis, c, a, b, marks) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const rect = axis === 'z' ? [c - H, lo, c + H, hi] : [lo, c - H, hi, c + H];
  return Object.freeze({ id, name, axis, c, from: lo, to: hi, rect: Object.freeze(rect), marks: Object.freeze(marks.map((m) => Object.freeze(m))) });
}

// Aspal tiap ruas (persegi). `marks` = bagian yang diberi median, marka, lampu; persimpangan dibiarkan polos.
export const HIGHWAY_SEGMENTS = Object.freeze([
  segment('villa', 'Jalan Raya NIKORA · Arah Villa', 'z', 0, RING.minZ - H, FORECOURT_Z, [[RING.minZ + H, FORECOURT_Z]]), // dari halaman drop-off sampai tepi Lingkar; selebihnya lengan berkelok
  segment('ring_n', 'Lingkar NIKORA', 'x', RING.minZ, RING.minX - H, RING.maxX + H, [[RING.minX + H, RING.maxX - H]]),
  segment('ring_s', 'Lingkar NIKORA', 'x', RING.maxZ, RING.minX - H, RING.maxX + H, [[RING.minX + H, RING.maxX - H]]),
  segment('ring_w', 'Lingkar NIKORA', 'z', RING.minX, RING.minZ - H, RING.maxZ + H, [[RING.minZ + H, RING.maxZ - H]]),
  segment('ring_e', 'Lingkar NIKORA', 'z', RING.maxX, RING.minZ - H, RING.maxZ + H, [[RING.minZ + H, RING.maxZ - H]]),
]);

// ---------------------------------------------------------------- lengan berkelok
const ARM_BASE = { taperIn: 800, taperOut: 500, flatEnd: 200, step: 8, half: HIGHWAY_HALF, reach: BARRIER_HALF + 40 };
const arm = (id, venue, name, start, dir, waves) => {
  const road = buildCurvedRoad({ start, dir, length: ARM_LENGTH, waves, ...ARM_BASE });
  return Object.freeze({ id, venue, name, start, dir, road, end: Object.freeze({ x: start.x + dir.x * ARM_LENGTH, z: start.z + dir.z * ARM_LENGTH }) });
};
/** Empat lengan berkelok. Tiap lengan punya gelombang sendiri supaya tidak kembar; tanda amp menentukan belokan pertama ke kiri atau kanan. */
export const HIGHWAY_ARMS = Object.freeze([
  arm('arm_villa', 'villa', 'Jalan Raya NIKORA · Arah Villa', { x: 0, z: RING.minZ - H }, { x: 0, z: -1 }, [{ amp: 250, wl: 1300, phase: 0.4 }, { amp: 40, wl: 560, phase: 1.1 }]),
  arm('arm_hall', 'hall', 'Jalan Raya NIKORA · Arah Aula', { x: RING.minX - H, z: HUB.z }, { x: -1, z: 0 }, [{ amp: -240, wl: 1180, phase: 0.2 }, { amp: 42, wl: 610, phase: 2.3 }]),
  arm('arm_royal', 'royal', 'Jalan Raya NIKORA · Arah Royal', { x: RING.maxX + H, z: HUB.z }, { x: 1, z: 0 }, [{ amp: 260, wl: 1250, phase: 0.9 }, { amp: -38, wl: 520, phase: 0.3 }]),
  arm('arm_masjid', 'masjid', 'Jalan Raya NIKORA · Arah Masjid', { x: 0, z: RING.maxZ + H }, { x: 0, z: 1 }, [{ amp: -235, wl: 1340, phase: 1.5 }, { amp: 36, wl: 590, phase: 0.8 }]),
]);

/** Lengan yang aspalnya memuat (x, z), atau null. */
export function armAt(x, z, margin = 0) {
  for (const a of HIGHWAY_ARMS) {
    const n = a.road.nearest(x, z);
    if (n && Math.abs(n.lateral) <= HIGHWAY_HALF + margin) return { arm: a, near: n };
  }
  return null;
}

/**
 * Pagar pengaman di kedua sisi tiap lengan berkelok: mengembalikan titik terkoreksi bila (x, z) menembus pagar, selain itu null.
 * Terbuka 30 m di pangkal dan 6 m di ujung (persimpangan Lingkar dan gerbang). { x, z, nx, nz (normal ke arah jalan), tx, tz (arah jalan), depth }.
 */
export function roadBarrier(x, z) {
  for (const a of HIGHWAY_ARMS) {
    const n = a.road.nearest(x, z);
    if (!n || n.s < 30 || n.s > a.road.length - 6) continue;
    if (Math.abs(n.lateral) <= BARRIER_HALF) return null;
    const side = Math.sign(n.lateral);
    const lx = n.tz; // kiri jalan = (tz, -tx)
    const lz = -n.tx;
    return { x: n.x + lx * side * BARRIER_HALF, z: n.z + lz * side * BARRIER_HALF, nx: -lx * side, nz: -lz * side, tx: n.tx, tz: n.tz, depth: Math.abs(n.lateral) - BARRIER_HALF };
  }
  return null;
}

const inRect = (r, x, z, margin = 0) => x >= r[0] - margin && x <= r[2] + margin && z >= r[1] - margin && z <= r[3] + margin;

/** Segmen aspal yang memuat titik (x, z), atau null. */
export const segmentAt = (x, z, margin = 0) => HIGHWAY_SEGMENTS.find((s) => inRect(s.rect, x, z, margin)) ?? null;
export const onHighway = (x, z, margin = 0) => segmentAt(x, z, margin) !== null || armAt(x, z, margin) !== null;
/** Nama jalan di titik itu (untuk keterangan lokasi), atau null bila di luar aspal. Lingkar didahulukan di persimpangan. */
export function highwayName(x, z) {
  const hits = HIGHWAY_SEGMENTS.filter((s) => inRect(s.rect, x, z));
  const rect = (hits.find((s) => s.id.startsWith('ring')) ?? hits[0])?.name;
  return rect ?? armAt(x, z)?.arm.name ?? null;
}

// ---------------------------------------------------------------- gerbang
export const GATE_TRIGGER_HALF = 4; // setengah panjang zona pemicu gerbang searah jalan
const GATE_CAR_LATERAL = CARRIAGE_HALF + SHOULDER_WIDTH / 2; // mobil datang diparkir di bahu luar
const GATE_CAR_PALETTE = Object.freeze([0x1f2a36, 0xf2f2f0, 0x8e1b1b, 0x274a7c, 0xb9bcc0, 0x1a1a1a, 0x3a3f46, 0xe9e1cf]);
export const GATE_CARS_PER_GATE = 2;

// Vektor kiri pengemudi untuk arah `h` (heading seperti vehicle.js: maju = (sin h, cos h)). Lalu lintas jalan di sisi kiri.
export const leftOf = (h) => ({ x: Math.cos(h), z: -Math.sin(h) });

function gate(venue, x, z, dir) {
  const v = VENUES[venue];
  const rect = dir.x === 0 ? [x - H, z - GATE_TRIGGER_HALF, x + H, z + GATE_TRIGGER_HALF] : [x - GATE_TRIGGER_HALF, z - H, x + GATE_TRIGGER_HALF, z + H];
  const inbound = { x: -dir.x || 0, z: -dir.z || 0 }; // arah menuju hotel (|| 0 membuang -0)
  return Object.freeze({
    id: venue, venue, label: v.label, page: v.page, x, z, dir: Object.freeze(dir), inbound: Object.freeze(inbound),
    heading: Math.atan2(inbound.x, inbound.z), rect: Object.freeze(rect), distance: Math.round(Math.hypot(x - HUB.x, z - HUB.z)),
  });
}

/** Empat gerbang, berurutan villa, aula, royal, masjid. `dir` = arah keluar dari hotel; `heading` = arah mobil yang datang dari tempat acara. */
export const GATES = Object.freeze(HIGHWAY_ARMS.map((a) => gate(a.venue, a.end.x, a.end.z, a.dir)));


export const gateById = (id) => GATES.find((g) => g.id === id) ?? null;
/** Gerbang yang zonanya memuat titik (x, z), atau null. */
export const gateAt = (x, z) => GATES.find((g) => inRect(g.rect, x, z)) ?? null;

// Parameter yang ikut dibawa saat pindah halaman (nama tampilan dan mode ringan); token/peran sengaja tidak dibawa karena per ruang.
const CARRY = Object.freeze(['name', 'q']);
/** Alamat halaman tempat acara untuk gerbang itu; `from=hotel` memberi tahu halaman tujuan asal kedatangan. */
export function gateUrl(g, search = '') {
  const src = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const k of CARRY) if (src.get(k)) out.set(k, src.get(k));
  out.set('from', 'hotel');
  return `${g.page}?${out.toString()}`;
}

/** Gerbang asal tamu yang datang dari tempat acara (?from=villa|hall|royal|masjid), atau null. */
export const arrivalGate = (from) => (typeof from === 'string' ? gateById(from) : null);

const along = (g, d) => ({ x: g.x + g.inbound.x * d, z: g.z + g.inbound.z * d });

/** Mobil tamu yang menunggu di tiap gerbang (menghadap hotel, di bahu luar): GATE_CARS_PER_GATE per gerbang. */
export function gateCarSpecs() {
  const out = [];
  let n = 0;
  for (const g of GATES) {
    const left = leftOf(g.heading);
    for (let i = 0; i < GATE_CARS_PER_GATE; i++) {
      const p = along(g, 14 + 8 * i);
      out.push({ id: `gate_${g.id}_${i}`, x: p.x + left.x * GATE_CAR_LATERAL, z: p.z + left.z * GATE_CAR_LATERAL, heading: g.heading, color: GATE_CAR_PALETTE[n++ % GATE_CAR_PALETTE.length] });
    }
  }
  return out;
}

/** Titik dan arah hadap pejalan kaki yang tiba dari gerbang: di samping mobil pertama, menghadap hotel. */
export function gateArrival(g) {
  const car = gateCarSpecs().find((c) => c.id === `gate_${g.id}_0`);
  const left = leftOf(g.heading);
  return { x: car.x + left.x * 2.4, z: car.z + left.z * 2.4, facing: Math.atan2(-g.inbound.x, -g.inbound.z) };
}
