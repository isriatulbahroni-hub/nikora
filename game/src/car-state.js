// Keadaan kendaraan di sisi pengemudi (murni data + aturan, tanpa DOM dan tanpa THREE).
// Fisika tetap di vehicle.js. Modul ini memutuskan: urutan mesin (mati -> menyala), gigi P/R/N/D, rem tangan, lampu, hazard, sein, AC, sabuk,
// kontrol mana yang boleh dipakai, dan kontrol mana yang tampil pada tahap berkendara tertentu (kabin, berhenti, melaju).
// Prinsip: semua fungsi tersedia, tetapi layar hanya menampilkan kontrol yang relevan dengan keadaan kendaraan.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ok = (msg = '') => ({ ok: true, msg });
const no = (msg) => ({ ok: false, msg });

export const SAFE_STOP = 0.5; // m/s: di bawah ini mobil dianggap berhenti (aman untuk keluar, masuk R atau D)
export const PARK_SPEED = 0.3; // m/s: batas untuk masuk gigi P dan menyalakan mesin
export const CRANK_S = 0.7; // detik mesin "menyala" sebelum siap dipakai
export const GEARS = Object.freeze(['P', 'R', 'N', 'D']);
const TOGGLES = Object.freeze(['lights', 'hazard', 'ac', 'belt']);
const TOGGLE_TEXT = Object.freeze({
  lights: ['Lampu mati.', 'Lampu menyala.'],
  hazard: ['Hazard mati.', 'Hazard menyala.'],
  ac: ['AC mati.', 'AC menyala.'],
  belt: ['Sabuk pengaman dilepas.', 'Sabuk pengaman terpasang.'],
});

/** Keadaan awal: mesin mati, gigi P. Dibuat tiap kali pemain duduk di kursi pengemudi. */
export const createCarState = () => ({ eng: 'off', crank: 0, gear: 'P', handbrake: false, lights: false, hazard: false, indicator: 0, ac: false, belt: false });

/** Boleh keluar bila mobil sudah berhenti. */
export const canLeave = (speed) => Math.abs(speed) < SAFE_STOP;

/** Menyalakan mesin: mobil diam dan gigi P atau N. Mesin melewati tahap 'starting' (CRANK_S detik) sebelum 'on'. */
export function startEngine(s, speed = 0) {
  if (s.eng !== 'off') return no('Mesin sudah menyala.');
  if (Math.abs(speed) >= PARK_SPEED) return no('Mobil masih bergerak.');
  if (s.gear !== 'P' && s.gear !== 'N') return no('Pindah gigi ke P atau N dulu.');
  s.eng = 'starting';
  s.crank = CRANK_S;
  return ok('Menyalakan mesin…');
}

/** Mematikan mesin: hanya saat mobil berhenti. Gigi kembali ke P, AC dan sein ikut mati. */
export function stopEngine(s, speed = 0) {
  if (s.eng === 'off') return no('Mesin sudah mati.');
  if (!canLeave(speed)) return no('Hentikan mobil dulu sebelum mematikan mesin.');
  s.eng = 'off';
  s.crank = 0;
  s.gear = 'P';
  s.ac = false;
  s.indicator = 0;
  return ok('Mesin mati.');
}

/** Dipanggil tiap frame; mengembalikan true pada frame ketika mesin selesai menyala. */
export function tickEngine(s, dt) {
  if (s.eng !== 'starting') return false;
  s.crank -= dt;
  if (s.crank > 0) return false;
  s.crank = 0;
  s.eng = 'on';
  return true;
}

/** Pindah gigi. P hanya saat berhenti total; R dan D hanya saat hampir berhenti (D boleh saat masih melaju maju); N kapan saja. */
export function shift(s, gear, speed = 0) {
  if (!GEARS.includes(gear)) return no('Gigi tidak dikenal.');
  if (s.eng === 'starting') return no('Tunggu mesin menyala.');
  if (s.eng !== 'on') return no('Nyalakan mesin dulu.');
  if (gear === s.gear) return ok();
  const v = Math.abs(speed);
  if (gear === 'P' && v >= PARK_SPEED) return no('Berhenti total dulu sebelum masuk P.');
  if (gear === 'R' && v >= SAFE_STOP) return no('Berhenti dulu sebelum mundur.');
  if (gear === 'D' && speed <= -SAFE_STOP) return no('Berhenti dulu sebelum maju.');
  s.gear = gear;
  return ok();
}

export function toggleHandbrake(s) {
  s.handbrake = !s.handbrake;
  return ok(s.handbrake ? 'Rem tangan ditarik.' : 'Rem tangan dilepas.');
}

/** Lampu, hazard, AC, sabuk. AC butuh mesin menyala. */
export function toggle(s, key) {
  if (!TOGGLES.includes(key)) return no('Fitur tidak dikenal.');
  if (key === 'ac' && !s.ac && s.eng !== 'on') return no('AC butuh mesin menyala.');
  s[key] = !s[key];
  return ok(TOGGLE_TEXT[key][s[key] ? 1 : 0]);
}

/** Sein: -1 kiri, +1 kanan; menekan arah yang sama lagi mematikannya. */
export function setIndicator(s, dir) {
  const d = dir > 0 ? 1 : dir < 0 ? -1 : 0;
  s.indicator = s.indicator === d ? 0 : d;
  return ok();
}

/** Alasan gas tidak menggerakkan mobil ('' bila boleh jalan). Dipakai untuk memberi tahu pemain, bukan untuk fisika. */
export function blockedReason(s) {
  if (s.eng === 'starting') return 'Tunggu mesin menyala.';
  if (s.eng !== 'on') return 'Nyalakan mesin dulu.';
  if (s.handbrake) return 'Lepas rem tangan dulu.';
  if (s.gear === 'P') return 'Pilih gigi D (maju) atau R (mundur) dulu.';
  if (s.gear === 'N') return 'Gigi masih N: pilih D atau R.';
  return '';
}

/**
 * Gas, rem, setir -> masukan fisika { throttle, steer, brake }. Mesin mati, gigi P, atau rem tangan = mobil tidak bergerak (ditahan rem).
 * N = meluncur bebas; D = gas maju; R = gas mundur. Rem selalu menang atas gas.
 */
export function driveInput(s, { gas = 0, brake = false, steer = 0, speed = 0 } = {}) {
  const g = clamp(gas, 0, 1);
  if (s.eng !== 'on' || s.gear === 'P' || s.handbrake) return { throttle: 0, steer, brake: Math.abs(speed) > 0.02 };
  if (brake) return { throttle: 0, steer, brake: true };
  if (s.gear === 'N') return { throttle: 0, steer, brake: false };
  return { throttle: s.gear === 'R' ? (g > 0 ? -g : 0) : g, steer, brake: false };
}

/** Tahap berkendara: 'cabin' (duduk, mesin belum siap), 'stopped' (mesin siap, mobil diam), 'driving' (melaju). */
export function stageOf(s, speed = 0) {
  if (s.eng !== 'on') return 'cabin';
  return canLeave(speed) ? 'stopped' : 'driving';
}

const BY_STAGE = Object.freeze({
  cabin: Object.freeze({ engine: true, wheel: false, pedals: false, gear: false }), // setir, gas, rem disembunyikan selama belum siap jalan
  stopped: Object.freeze({ engine: true, wheel: true, pedals: true, gear: true }), // matikan mesin, gigi, parkir
  driving: Object.freeze({ engine: false, wheel: true, pedals: true, gear: true }), // tombol mesin disembunyikan saat melaju
});

/** Kontrol yang tampil pada sebuah tahap. Klakson dan panel fitur (lampu, hazard, sein, AC, sabuk, rem tangan) selalu tersedia. */
export const controlsFor = (stage) => ({ ...BY_STAGE[stage], horn: true, panel: true });

export const engineLabel = (s) => (s.eng === 'off' ? 'Nyalakan' : s.eng === 'starting' ? 'Menyalakan…' : 'Matikan');

/** Label gigi untuk HUD: D menampilkan gigi roda gigi model (1..n) bila ada; P, R, N apa adanya. */
export function displayGear(s, modelGear = null) {
  if (s.gear !== 'D') return s.gear;
  return modelGear && modelGear !== 'N' && modelGear !== 'R' ? String(modelGear) : 'D';
}

/** Data lengkap untuk HUD satu frame. */
export function hudModel(s, speed = 0, modelGear = null) {
  const stage = stageOf(s, speed);
  return {
    stage,
    controls: controlsFor(stage),
    gear: s.gear,
    gearLabel: displayGear(s, modelGear),
    eng: s.eng,
    engineLabel: engineLabel(s),
    handbrake: s.handbrake,
    lights: s.lights,
    hazard: s.hazard,
    indicator: s.indicator,
    ac: s.ac,
    belt: s.belt,
  };
}
