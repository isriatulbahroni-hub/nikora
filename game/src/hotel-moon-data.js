// Data dan hitungan murni (tanpa THREE) untuk Bulan Purnama Agung NIKORA Grand Hotel. Dipakai hotel-moon.js dan bisa diuji.
// Fase langit (day-night.js): -1 = siang penuh, 0 = senja keemasan, +1 = malam penuh.
import { SKY_FRAMES } from './hotel-sky-data.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- ukuran dan bentuk
export const MOON = Object.freeze({
  /** Jari-jari sudut bulan (radian), sekitar 3 derajat: bulan super besar supaya megah dilihat dari lantai atas (bulan asli 0,0045). */
  angularRadius: 0.052,
  /** Cincin es 22 derajat di sekeliling bulan, seperti halo bulan yang asli. */
  ringAngle: (22 * Math.PI) / 180,
  /** Bintang dalam kerucut ini (radian dari pusat bulan) tidak digambar: terang bulan menelan bintang di dekatnya. */
  starClearAngle: 0.3,
  /** Goyangan halus tepi bulan (libration), radian. */
  maxLibration: 0.05,
  libPeriod: 120, // detik
});

/** Terang bulan menambah cahaya malam: kenaikan maksimum pada cahaya matahari/bulan dan cahaya langit (bulan purnama, malam penuh). */
export const MOONLIGHT = Object.freeze({ sun: 0.55, hemi: 0.3 });

/** Arah bulan di langit (vektor satuan): sama dengan arah cahaya malam di SKY_FRAMES.night, jadi bayangan dan bulan selalu searah. */
export function moonDirection() {
  const [x, y, z] = SKY_FRAMES.night.dir;
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}

// ---------------------------------------------------------------- tingkat dan warna menurut fase langit
/** Bulan terbit pelan-pelan sejak sore (fase -0,15) dan penuh menjelang malam (fase 0,45). */
export const moonLevel = (phase) => smooth(-0.15, 0.45, phase);

const WARM = [1.0, 0.84, 0.62]; // bulan keemasan saat terbit
const SILVER = [0.9, 0.95, 1.0]; // perak kebiruan di tengah malam
/** Warna bulan (sRGB 0..1): keemasan saat senja, makin perak saat malam. */
export function moonTint(phase) {
  const t = smooth(0.05, 0.8, phase);
  return WARM.map((w, i) => w + (SILVER[i] - w) * t);
}

/** Pengali cahaya matahari/bulan malam hari menurut fase langit dan terang bulan (illumination 0..1). */
export const moonSunGain = (phase, illumination) => 1 + MOONLIGHT.sun * clamp(illumination, 0, 1) * smooth(0.1, 0.7, phase);
/** Pengali cahaya langit (hemisfer), lebih kecil dari pengali cahaya bulan. */
export const moonHemiGain = (phase, illumination) => 1 + MOONLIGHT.hemi * clamp(illumination, 0, 1) * smooth(0.1, 0.7, phase);
/** Kekuatan pendar di sekeliling bulan: sabit tipis tidak menyilaukan seperti purnama. */
export const moonGlowK = (illumination) => 0.4 + 0.6 * clamp(illumination, 0, 1);
/** Cahaya bumi (earthshine) di sisi gelap bulan: kuat saat sabit, hilang saat purnama. */
export const earthshine = (illumination) => 0.22 * (1 - clamp(illumination, 0, 1)) ** 1.5;

// ---------------------------------------------------------------- fase bulan
export const SYNODIC_DAYS = 29.530588853;
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14, 0); // bulan baru acuan

/** Umur bulan (hari sejak bulan baru), 0 sampai di bawah SYNODIC_DAYS. */
export function moonAge(date) {
  const d = (date.getTime() - NEW_MOON_EPOCH_MS) / 86400000;
  return ((d % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
}
/** Bagian siklus 0..1: 0 bulan baru, 0,5 purnama. */
export const moonFraction = (date) => moonAge(date) / SYNODIC_DAYS;
/** Bagian cakram yang terang 0..1 untuk bagian siklus f. */
export const moonIllumination = (f) => (1 - Math.cos(TAU * f)) / 2;

/**
 * Arah cahaya matahari pada bulan dalam bingkai penonton (x kanan, y atas, z ke arah penonton), satuan.
 * Bulan sabit awal (waxing) terang di kanan, sabit akhir (waning) terang di kiri, purnama tepat dari depan.
 */
export function lightDirection(f) {
  const theta = Math.PI * (2 * f - 1);
  return [-Math.sin(theta) + 0, 0, Math.cos(theta)];
}

/** 'full' (bawaan): bulan purnama tiap malam. 'real': mengikuti fase bulan sesungguhnya menurut tanggal. */
export function moonModeFromSearch(search = '') {
  const v = new URLSearchParams(search).get('moon');
  return v === 'real' || v === 'nyata' ? 'real' : 'full';
}

/** Keadaan fase bulan: { fraction, illumination, waxing, lightDir }. */
export function moonPhaseState({ mode = 'full', date = new Date() } = {}) {
  const fraction = mode === 'real' ? moonFraction(date) : 0.5;
  return { fraction, illumination: moonIllumination(fraction), waxing: fraction < 0.5, lightDir: lightDirection(fraction) };
}

/** Goyangan tepi bulan (libration) pada waktu t detik: [x, y] radian. Nol bila gerak dimatikan. */
export function libration(t, motion = 1) {
  if (!motion) return [0, 0];
  const a = MOON.maxLibration;
  return [a * Math.sin((TAU * t) / MOON.libPeriod), 0.6 * a * Math.sin((TAU * t) / (MOON.libPeriod * 1.37) + 1)];
}
