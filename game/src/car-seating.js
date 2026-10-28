// Duduk di mobil (murni data + matematika, tanpa THREE): seberapa jauh punggung avatar bersandar supaya kepala tidak menembus atap.
//
// Dulu avatar didudukkan tegak (hanya diturunkan 0,3 m seperti di kursi biasa). Avatar setinggi 1,72 m duduk tegak kira-kira 1,6 m di atas lantai,
// padahal atap hypercar hanya 1,16-1,21 m dan coupe 1,5 m: kepala (dan rambut/topinya) muncul di atas atap. Mobil asli memecahkannya dengan
// sandaran kursi yang miring, jadi di sini punggung dimiringkan ke belakang pada pinggul (sedikit untuk mobil tinggi, banyak untuk mobil rendah),
// dan kepala diimbangi di car-seat-pose.js supaya tetap menatap ke depan.
//
// Tinggi kursi (carSeatY) sama dengan yang dipakai Fleet.seatPose sejak semula; modul ini hanya menambah sudut sandaran.
import { SEATED_DROP } from './villa-layout.js';

// Ukuran badan (m, dari telapak ke atas, berdiri tegak): pinggul = sumbu putar punggung, atas = puncak kepala termasuk rambut/topi.
// simple = avatar sederhana (avatar.js: HIP_Y 0,82; topi tertinggi 1,77); human = model manusia (avatar-human.js: tinggi 1,75; pinggul sekitar 0,96).
export const AVATAR_BODY = Object.freeze({
  simple: Object.freeze({ hip: 0.82, top: 1.79 }),
  human: Object.freeze({ hip: 0.96, top: 1.77 }),
});

export const LEGACY_ROOF = 1.45; // tinggi atap sedan lama (spesifikasi tanpa model)
export const ROOF_MARGIN = 0.14; // jarak aman puncak kepala di bawah atap (tebal atap + ruang kepala)
export const GLB_ROOF_MARGIN = 0.18; // mobil dari berkas 3D: bentuk atap sebenarnya tidak diketahui, jadi lebih longgar
export const MIN_RECLINE = 0.12; // rad (sekitar 7 derajat): kursi mobil tidak pernah setegak kursi makan
export const MAX_RECLINE = 0.92; // rad (sekitar 53 derajat): lebih miring dari ini avatar tampak berbaring

/** Tinggi akar avatar (rad pose duduk di mobil): sama dengan Fleet.seatPose. seatLift = tinggi dudukan relatif katalog (negatif = kursi rendah). */
export const carSeatY = (spec) => SEATED_DROP + 0.12 + (spec?.seatLift ?? 0);

/** Batas bawah atap (m) yang boleh dicapai puncak kepala untuk spesifikasi mobil ini. */
export const roofLimit = (spec) => (spec?.height ?? LEGACY_ROOF) - (spec?.glb ? GLB_ROOF_MARGIN : ROOF_MARGIN);

/**
 * Sudut sandaran punggung (rad, 0 = tegak) agar puncak kepala tidak lebih tinggi dari roofLimit.
 * kind = 'simple' | 'human'. Hasil dibatasi MIN_RECLINE..MAX_RECLINE.
 */
export function reclineFor(spec, kind = 'simple') {
  const body = AVATAR_BODY[kind] ?? AVATAR_BODY.simple;
  const room = roofLimit(spec) - (carSeatY(spec) + body.hip); // tinggi yang tersedia di atas pinggul
  const reach = body.top - body.hip; // tinggi pinggul sampai puncak kepala bila tegak
  const angle = Math.acos(Math.min(1, Math.max(-1, room / reach)));
  return Math.min(MAX_RECLINE, Math.max(MIN_RECLINE, angle));
}

/** Tinggi dunia puncak kepala (m) bila avatar duduk dengan sandaran `recline` di kursi mobil ini. */
export function headTopWorld(spec, kind = 'simple', recline = reclineFor(spec, kind)) {
  const body = AVATAR_BODY[kind] ?? AVATAR_BODY.simple;
  return carSeatY(spec) + body.hip + (body.top - body.hip) * Math.cos(recline);
}

const cache = new WeakMap();
/** Sandaran untuk kedua jenis avatar: { simple, human } (rad). Dihitung sekali per spesifikasi mobil. */
export function seatFit(spec) {
  if (!spec || typeof spec !== 'object') return Object.freeze({ simple: reclineFor(null, 'simple'), human: reclineFor(null, 'human') });
  let fit = cache.get(spec);
  if (!fit) {
    fit = Object.freeze({ simple: reclineFor(spec, 'simple'), human: reclineFor(spec, 'human') });
    cache.set(spec, fit);
  }
  return fit;
}
