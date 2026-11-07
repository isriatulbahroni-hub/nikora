// Data dan hitungan murni (tanpa THREE) untuk Bulan Purnama Agung NIKORA Grand Hotel. Dipakai hotel-moon.js dan bisa diuji.
// Posisi dan fase bulan sungguhan ada di hotel-moon-ephemeris.js; berkas ini memuat ukuran, kecerahan, warna, dan pengaruh bulan ke cahaya dunia.
// Fase langit (day-night.js): -1 = siang penuh, 0 = senja keemasan, +1 = malam penuh. sinAlt = sinus tinggi bulan di atas horizon (= komponen y arah bulan).
import { SKY_FRAMES } from './hotel-sky-data.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- ukuran dan bentuk
export const MOON = Object.freeze({
  /** Jari-jari sudut bulan di langit tinggi (radian), sekitar 3 derajat: bulan super besar supaya megah (bulan asli 0,0045). */
  angularRadius: 0.052,
  /** Cincin es 22 derajat di sekeliling bulan, seperti halo bulan yang asli. */
  ringAngle: (22 * Math.PI) / 180,
  /** Bintang dalam kerucut ini (radian dari pusat bulan) memudar sampai hilang: terang bulan menelan bintang di dekatnya. */
  starClearAngle: 0.3,
  /** Goyangan halus tepi bulan (libration), radian. */
  maxLibration: 0.05,
  libPeriod: 120, // detik
  /** Kecepatan paling besar bulan mengikuti posisi barunya (radian per detik): ganti mode langit tidak membuat bulan melompat. */
  followRate: 0.5,
});

/** Terang bulan menambah cahaya malam: kenaikan maksimum pada cahaya matahari/bulan dan cahaya langit (bulan purnama di langit, malam penuh). */
export const MOONLIGHT = Object.freeze({ sun: 0.55, hemi: 0.3 });

/** Arah bulan awal (vektor satuan) sebelum perhitungan pertama: sama dengan arah cahaya malam di SKY_FRAMES.night. */
export function moonDirection() {
  const [x, y, z] = SKY_FRAMES.night.dir;
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}

// ---------------------------------------------------------------- kecerahan menurut fase langit dan tinggi bulan
/** Pendar bulan terbit pelan-pelan sejak sore (fase -0,15) dan penuh menjelang malam (fase 0,45). */
export const moonLevel = (phase) => smooth(-0.15, 0.45, phase);

/**
 * Keterlihatan cakram bulan: malam penuh = 1; siang hari bulan yang sedang di atas horizon tampil pucat seperti di langit asli
 * (sekitar 22% untuk sabit tipis sampai 55% untuk purnama).
 */
export function moonDiscVisibility(phase, illumination) {
  const night = moonLevel(phase);
  return clamp(night + (1 - night) * 0.55 * (0.4 + 0.6 * clamp(illumination, 0, 1)), 0, 1);
}

/** 0 di bawah horizon, 1 mulai tinggi 17 derajat: pengali cahaya bulan (cahaya dan terang bulan butuh bulan yang cukup tinggi). */
export const moonUpFactor = (sinAlt) => smooth(0, 0.3, sinAlt);
/** Pendar bulan memudar saat bulan tenggelam di bawah horizon (sampai sekitar 14 derajat di bawahnya). */
export const moonGlowFade = (sinAlt) => smooth(-0.25, 0.05, sinAlt);
/** Penutup horizon untuk cakram dan efek 4D: nol saat bulan di bawah horizon. */
export const moonHorizonMask = (sinAlt) => smooth(-0.02, 0.06, sinAlt);

/** Bulan rendah lebih merah dan lebih redup (cahaya melewati lebih banyak udara): warm 0..1 dan dim 0,55..1. */
export function moonExtinction(sinAlt) {
  return { warm: 1 - smooth(0, 0.35, sinAlt), dim: 0.55 + 0.45 * smooth(0, 0.3, sinAlt) };
}

/** Jari-jari sudut tampak: bulan dekat horizon tampak sekitar 22% lebih besar (ilusi bulan). */
export const moonApparentRadius = (sinAlt) => MOON.angularRadius * (1 + 0.22 * (1 - smooth(0, 0.45, sinAlt)));

// ---------------------------------------------------------------- warna
const WARM = [1.0, 0.84, 0.62]; // bulan keemasan saat terbit
const SILVER = [0.9, 0.95, 1.0]; // perak kebiruan di tengah malam
const HORIZON = [1.0, 0.6, 0.32]; // bulan sangat rendah: jingga
/**
 * Warna bulan (sRGB 0..1): keemasan saat senja, makin perak saat malam. warm (0..1) menggeser ke jingga dan dim (0..1) meredupkan
 * untuk bulan di dekat horizon (lihat moonExtinction).
 */
export function moonTint(phase, warm = 0, dim = 1) {
  const t = smooth(0.05, 0.8, phase);
  const w = clamp(warm, 0, 1) * 0.85;
  const d = clamp(dim, 0, 1);
  return WARM.map((c, i) => {
    const base = c + (SILVER[i] - c) * t;
    return (base + (HORIZON[i] - base) * w) * d;
  });
}

// ---------------------------------------------------------------- pengaruh ke cahaya dunia
/** Pengali cahaya matahari/bulan malam hari menurut fase langit, terang bulan (illumination 0..1), dan faktor tinggi bulan `up` (0..1, bawaan 1). */
export const moonSunGain = (phase, illumination, up = 1) => 1 + MOONLIGHT.sun * clamp(illumination, 0, 1) * smooth(0.1, 0.7, phase) * clamp(up, 0, 1);
/** Pengali cahaya langit (hemisfer), lebih kecil dari pengali cahaya bulan. */
export const moonHemiGain = (phase, illumination, up = 1) => 1 + MOONLIGHT.hemi * clamp(illumination, 0, 1) * smooth(0.1, 0.7, phase) * clamp(up, 0, 1);
/** Kekuatan pendar di sekeliling bulan: sabit tipis tidak menyilaukan seperti purnama. */
export const moonGlowK = (illumination) => 0.4 + 0.6 * clamp(illumination, 0, 1);
/** Cahaya bumi (earthshine) di sisi gelap bulan: kuat saat sabit, hilang saat purnama. */
export const earthshine = (illumination) => 0.22 * (1 - clamp(illumination, 0, 1)) ** 1.5;

/** 'full' (bawaan): bulan purnama ideal yang terbit saat matahari terbenam. 'real': posisi dan fase bulan sungguhan menurut tanggal. */
export function moonModeFromSearch(search = '') {
  const v = new URLSearchParams(search).get('moon');
  return v === 'real' || v === 'nyata' ? 'real' : 'full';
}

/** Goyangan tepi bulan (libration) pada waktu t detik: [x, y] radian. Nol bila gerak dimatikan. */
export function libration(t, motion = 1) {
  if (!motion) return [0, 0];
  const a = MOON.maxLibration;
  return [a * Math.sin((TAU * t) / MOON.libPeriod), 0.6 * a * Math.sin((TAU * t) / (MOON.libPeriod * 1.37) + 1)];
}
