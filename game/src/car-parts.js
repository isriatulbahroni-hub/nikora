// Bagian mobil yang bisa dibuka (pintu kiri/kanan, atap) dan keadaan yang terlihat dari luar (lampu, hazard, sein, rem tangan, gigi mundur).
// Tanpa THREE dan tanpa DOM: car-ride.js mengisi, vehicle-view.js membaca (lewat getParts), car-parts-rig.js menggerakkan model GLB.
// Aturan: pintu dan atap hanya bisa dibuka saat mobil berhenti, dan menutup sendiri begitu mobil mulai melaju.
// Keadaan disimpan di WeakMap (bukan di objek mobil) supaya tidak ikut terkirim lewat snapshot jaringan armada.
import { SAFE_STOP } from './car-state.js';

export const OPENINGS = Object.freeze(['doorL', 'doorR', 'roof']);
const TEXT = Object.freeze({
  doorL: ['Pintu kiri ditutup.', 'Pintu kiri dibuka.'],
  doorR: ['Pintu kanan ditutup.', 'Pintu kanan dibuka.'],
  roof: ['Atap ditutup.', 'Atap dibuka.'],
});
const NAME = Object.freeze({ doorL: 'pintu kiri', doorR: 'pintu kanan', roof: 'atap' });

/** Keadaan awal: semua tertutup. */
export const createOpenings = () => ({ doorL: false, doorR: false, roof: false });

/** Buka/tutup satu bagian. Membuka hanya saat mobil berhenti; menutup kapan saja. */
export function toggleOpening(o, key, speed = 0) {
  if (!OPENINGS.includes(key)) return { ok: false, msg: 'Bagian tidak dikenal.' };
  if (!o[key] && Math.abs(speed) >= SAFE_STOP) return { ok: false, msg: `Hentikan mobil dulu sebelum membuka ${NAME[key]}.` };
  o[key] = !o[key];
  return { ok: true, msg: TEXT[key][o[key] ? 1 : 0] };
}

/** Dipanggil tiap frame: menutup semua yang terbuka begitu mobil melaju. Mengembalikan true pada frame ketika ada yang ditutup. */
export function tickOpenings(o, speed = 0) {
  if (Math.abs(speed) < SAFE_STOP) return false;
  let closed = false;
  for (const k of OPENINGS) {
    if (o[k]) {
      o[k] = false;
      closed = true;
    }
  }
  return closed;
}

/** Keadaan yang dibaca tampilan mobil: dari keadaan pengemudi (car-state.js) dan bagian yang dibuka. */
export function partsFrom(s, o) {
  return {
    lights: s.lights,
    hazard: s.hazard,
    indicator: s.indicator,
    handbrake: s.handbrake,
    engine: s.eng === 'on',
    reverse: s.eng === 'on' && s.gear === 'R',
    doorL: o.doorL,
    doorR: o.doorR,
    roof: o.roof,
  };
}

const registry = new WeakMap();
/** Pasang keadaan tampilan sebuah mobil (null = hapus: pintu menutup, lampu padam). */
export function setParts(car, parts) {
  if (parts) registry.set(car, parts);
  else registry.delete(car);
}
/** Keadaan tampilan sebuah mobil, atau null bila tidak ada pengemudi bertahap (tampilan memakai perilaku lama). */
export const getParts = (car) => registry.get(car) ?? null;
