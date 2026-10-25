// Akses mobil dari luar (murni data + matematika, tanpa THREE dan tanpa DOM).
// Mendekati mobil TIDAK langsung menaikkan avatar: pemain harus membuka pintu (atau bagasi) di bagian yang didekati.
//   zona   : pintu kanan, pintu kiri (di samping kursi), bagasi (di belakang). Zona dihitung dari posisi pemain dalam bingkai mobil.
//   urutan : "Buka pintu kanan" -> pintu terbuka -> "Naik" (ke kursi kosong di sisi itu, pengemudi lebih dulu) -> pintu menutup sendiri setelah duduk.
//            Bagasi: "Buka bagasi" <-> "Tutup bagasi". Turun dari mobil membuka pintu di sisi kursinya.
//   aturan : membuka hanya saat mobil berhenti; semua menutup sendiri begitu mobil melaju (car-parts.js) atau pemain menjauh (AUTO_CLOSE_M).
// Keadaan bukaan per mobil = bukaan car-parts.js (doorL, doorR, roof) ditambah trunk. Dipakai car-ride.js, dibaca vehicle-view.js lewat getParts.
import { SAFE_STOP } from './car-state.js';
import { createOpenings, tickOpenings, toggleOpening } from './car-parts.js';
import { SEAT_OFFSETS, forward, rightOf } from './vehicle.js';

export const DOOR_REACH = 1.8; // m dari sisi badan mobil: pintu masih terjangkau
export const DOOR_MARGIN = 0.9; // m di depan kursi terdepan dan di belakang kursi terbelakang pada sisi itu
export const DOOR_MAX_DIST = 3; // m dari pusat mobil; harus lebih kecil dari BOARD_RANGE (vehicle.js) supaya fleet.board menerima
export const TRUNK_REACH = 1.6; // m di belakang bumper
export const FIND_RANGE = 6; // m dari pusat mobil: lebih jauh dari ini mobil tidak diperiksa
export const AUTO_CLOSE_M = 7; // m: pintu dan bagasi yang terbuka menutup sendiri bila pemain menjauh sejauh ini

const NAME = Object.freeze({ doorL: 'pintu kiri', doorR: 'pintu kanan', trunk: 'bagasi' });
const SIDE_WORD = Object.freeze({ doorL: 'kiri', doorR: 'kanan' });
const offsetsOf = (car) => car.spec?.seatOffsets ?? SEAT_OFFSETS;
const sizeOf = (car) => ({ length: car.spec?.length ?? 4.3, width: car.spec?.width ?? 1.82 });

/** Keadaan awal: semua tertutup (bukaan car-parts.js + bagasi). */
export const createAccess = () => ({ ...createOpenings(), trunk: false });
export const anyOpen = (o) => Boolean(o.doorL || o.doorR || o.roof || o.trunk);
/** Tutup pintu dan bagasi (atap tidak disentuh). */
export function closeDoorsAndTrunk(o) {
  o.doorL = false;
  o.doorR = false;
  o.trunk = false;
}

/** Pintu di sisi kursi `seat`: kursi di kanan mobil -> doorR, di kiri -> doorL. */
export const doorOfSeat = (car, seat) => ((offsetsOf(car)[seat]?.side ?? 0) > 0 ? 'doorR' : 'doorL');

/** Indeks kursi di sisi pintu itu (urut dari kursi 0, jadi pengemudi lebih dulu). */
export function sideSeats(car, zone) {
  const sign = zone === 'doorR' ? 1 : -1;
  const out = [];
  offsetsOf(car).forEach((o, i) => {
    if (Math.sign(o.side) === sign) out.push(i);
  });
  return out;
}

/** Kursi kosong pertama di sisi pintu itu, atau -1. */
export const seatForDoor = (car, zone) => sideSeats(car, zone).find((i) => car.seats[i] === null) ?? -1;

/** Posisi `pos` dalam bingkai mobil: fwd (+ ke depan) dan side (+ ke kanan mobil). */
export function toCarFrame(car, pos) {
  const dx = pos.x - car.x;
  const dz = pos.z - car.z;
  const f = forward(car.heading);
  const r = rightOf(car.heading);
  return { fwd: dx * f.x + dz * f.z, side: dx * r.x + dz * r.z };
}

/**
 * Bagian mobil yang sedang didekati pemain di `pos`: { zone: 'doorR' | 'doorL' | 'trunk', dist } atau null.
 * Bila dua zona tumpang tindih, yang pusatnya paling dekat dipilih.
 */
export function accessZone(car, pos) {
  const { length, width } = sizeOf(car);
  const halfW = width / 2;
  const halfL = length / 2;
  const p = toCarFrame(car, pos);
  let best = null;
  const consider = (zone, cf, cs, inside) => {
    if (!inside) return;
    const dist = Math.hypot(p.fwd - cf, p.side - cs);
    if (!best || dist < best.dist) best = { zone, dist };
  };
  for (const zone of ['doorR', 'doorL']) {
    const seats = sideSeats(car, zone);
    if (!seats.length) continue;
    const fw = seats.map((i) => offsetsOf(car)[i].fwd);
    const lo = Math.min(...fw) - DOOR_MARGIN;
    const hi = Math.max(...fw) + DOOR_MARGIN;
    const sign = zone === 'doorR' ? 1 : -1;
    const out = p.side * sign; // + = di sisi pintu itu
    consider(zone, (lo + hi) / 2, sign * (halfW + 0.4), p.fwd >= lo && p.fwd <= hi && out >= 0 && out <= halfW + DOOR_REACH && Math.hypot(p.fwd, p.side) <= DOOR_MAX_DIST);
  }
  consider('trunk', -halfL - 0.5, 0, p.fwd <= -halfL + 0.9 && p.fwd >= -halfL - TRUNK_REACH && Math.abs(p.side) <= halfW);
  return best;
}

/** Buka/tutup satu bukaan. Bagasi mengikuti aturan yang sama dengan pintu: membuka hanya saat berhenti. */
export function toggleAccess(o, key, speed = 0) {
  if (key !== 'trunk') return toggleOpening(o, key, speed);
  if (!o.trunk && Math.abs(speed) >= SAFE_STOP) return { ok: false, msg: `Hentikan mobil dulu sebelum membuka ${NAME.trunk}.` };
  o.trunk = !o.trunk;
  return { ok: true, msg: o.trunk ? 'Bagasi dibuka.' : 'Bagasi ditutup.' };
}

/** Tiap frame: semua yang terbuka menutup begitu mobil melaju. True pada frame ketika ada yang ditutup. */
export function tickAccess(o, speed = 0) {
  let closed = tickOpenings(o, speed);
  if (o.trunk && Math.abs(speed) >= SAFE_STOP) {
    o.trunk = false;
    closed = true;
  }
  return closed;
}

/**
 * Aksi yang tersedia bagi pemain di `pos` terhadap satu mobil, atau null (jauh, mobil melaju, atau kursi di sisi itu penuh).
 * { zone, kind: 'open' | 'close' | 'board', key, seat?, label, dist }
 */
export function planAccess(car, pos, o) {
  if (Math.abs(car.speed ?? 0) >= SAFE_STOP) return null;
  const z = accessZone(car, pos);
  if (!z) return null;
  const { zone, dist } = z;
  if (zone === 'trunk') return { zone, kind: o.trunk ? 'close' : 'open', key: 'trunk', label: o.trunk ? 'Tutup bagasi' : 'Buka bagasi', dist };
  const seat = seatForDoor(car, zone);
  if (!o[zone]) {
    if (seat < 0) return null; // pintu tertutup dan tidak ada kursi kosong di sisi itu: tidak ada yang perlu dibuka
    return { zone, kind: 'open', key: zone, label: `Buka ${NAME[zone]}`, dist };
  }
  if (seat >= 0) return { zone, kind: 'board', key: zone, seat, label: 'Naik', dist };
  return { zone, kind: 'close', key: zone, label: `Tutup pintu ${SIDE_WORD[zone]}`, dist };
}

/** Mobil dan aksi terdekat dari `pos` di antara `cars`. accessOf(car) = keadaan bukaan mobil itu. Mengembalikan { car, plan } atau null. */
export function findAccess(cars, pos, accessOf, range = FIND_RANGE) {
  let best = null;
  for (const car of cars) {
    if (Math.hypot(car.x - pos.x, car.z - pos.z) > range) continue;
    const plan = planAccess(car, pos, accessOf(car));
    if (plan && (!best || plan.dist < best.plan.dist)) best = { car, plan };
  }
  return best;
}
