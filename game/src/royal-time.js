// Siklus langit Istana Cinta: nilai malam 0 (senja keemasan) .. 1 (malam bertabur bintang), murni dan bisa diuji.
// Kini ada juga nilai negatif sampai -1 untuk siang hari (lihat day-night.js).
import { skyPhase } from './day-night.js';

export { approach } from './day-night.js';
export const CYCLE_MS = 20 * 60 * 1000;

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Fase langit -1..1: -1 siang, 0 senja keemasan, 1 malam.
 * mode 'day' = selalu siang, 'sunset' = selalu senja, 'night' = selalu malam.
 * mode 'auto' tanpa `epoch` = mengikuti JAM ASLI di zona waktu acara (?tz=, bawaan WIB): siang, senja, dan malam sungguhan.
 * mode 'auto' dengan `epoch` = siklus cepat bersama berbasis jam dinding (semua klien melihat langit yang sama tanpa saling
 * kirim pesan): senja → peralihan → malam → peralihan.
 */
export function nightAt(mode, now, epoch, cycle = CYCLE_MS, zone) {
  if (mode === 'sunset') return 0;
  if (mode === 'night') return 1;
  if (mode === 'day') return -1;
  if (epoch === undefined) return skyPhase('auto', now, { zone });
  const u = ((((now - epoch) % cycle) + cycle) % cycle) / cycle;
  if (u < 0.42) return 0;
  if (u < 0.58) return smooth((u - 0.42) / 0.16);
  if (u < 0.92) return 1;
  return 1 - smooth((u - 0.92) / 0.08);
}
