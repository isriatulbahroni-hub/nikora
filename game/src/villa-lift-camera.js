// Kamera kabin lift: saat pemain berdiri di kabin atau sedang naik, kamera pindah halus ke sudut atas kabin
// (seperti kamera pojok di lift sungguhan). Kamera orbit biasa tidak dipakai di sini karena kabin hanya 2,2 m:
// lengan kamera terjepit dinding dan perabot, avatar jadi sangat besar dan sering tertutup.
// Murni matematika (tanpa THREE) supaya mudah diuji.
import { LIFT, inCab } from './villa-lift.js';

export const CAB_CAM = Object.freeze({
  offset: 0.82, // jarak kamera dari pusat kabin pada sumbu x dan z (sisi dalam dinding di 1,075 m)
  height: 2.15, // tinggi kamera dari lantai kabin (langit-langit di 2,6 m)
  lookHeight: 1.05, // tinggi titik yang dipandang (dada avatar)
  lookAhead: 0.1, // titik pandang sedikit ke arah pintu
  fov: 66, // sudut pandang lebih lebar agar avatar utuh terlihat dari jarak dekat
  enterMargin: 0.3, // masuk mode kabin bila pemain sudah agak ke dalam; keluar bila melewati sisi dalam kabin
});

export const smoothstep = (t) => t * t * (3 - 2 * t);
export const mix = (a, b, t) => a + (b - a) * t;

/** Posisi kamera dan titik pandang untuk kabin yang lantainya setinggi y. */
export function cabCameraPose(y = 0) {
  const o = CAB_CAM.offset;
  return {
    pos: { x: LIFT.x - o, y: y + CAB_CAM.height, z: LIFT.z - o }, // sudut belakang-kiri, di atas kepala
    target: { x: LIFT.x, y: y + CAB_CAM.lookHeight, z: LIFT.z + CAB_CAM.lookAhead },
  };
}

/**
 * Mode kabin dengan histeresis: masuk saat pemain sudah di dalam (jarak lebih ketat), keluar saat benar-benar
 * meninggalkan kabin. Tanpa ini, berdiri di ambang pintu membuat kamera bolak-balik.
 */
export function cabLatchNext(prev, pos) {
  return prev ? inCab(pos, 0) : inCab(pos, CAB_CAM.enterMargin);
}

/** Peralihan halus 0..1 menuju mode kabin (1) atau kamera orbit (0); tepat 0/1 saat sudah dekat. */
export function cabBlendStep(current, wanted, delta, rate = 5) {
  const target = wanted ? 1 : 0;
  const next = current + (target - current) * (1 - Math.exp(-rate * Math.max(0, delta)));
  return Math.abs(next - target) < 0.002 ? target : next;
}
