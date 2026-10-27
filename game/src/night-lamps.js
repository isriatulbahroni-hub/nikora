import * as THREE from 'three';

// Lampu jalan lorong perjalanan (journey-world.js) menyala SATU PER SATU saat senja menuju malam, dan padam lagi saat pagi.
// Sebelumnya lampu memakai bahan MeshBasicMaterial berwarna terang tetap, jadi menyala sepanjang siang.
// night = 0 (siang) .. 1 (malam penuh): dari nightLevel(sky.phase()) di hotel-sky-data.js. Semua fungsi murni dan diuji (night-lamps.test.js).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sm = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Lebar rentang "malam" yang dipakai satu lampu untuk beralih dari padam ke menyala penuh. */
export const LAMP_SPAN = 0.25;

/** Ambang malam sebuah lampu (0..0.6), tetap untuk nomor sel yang sama: lampu berambang kecil menyala lebih dulu. */
export function lampThreshold(cell) {
  const h = Math.imul((cell | 0) ^ 0x9e3779b9, 2654435761) >>> 0;
  return ((h % 1000) / 1000) * 0.6;
}

/** Kecerahan satu lampu 0..1 pada tingkat malam tertentu. */
export const lampLit = (threshold, night) => sm(threshold, threshold + LAMP_SPAN, night);

/** Pengali kecerahan lampu hangat gerbang dan jendela kedatangan: 0,4 di siang sampai 1 di malam. */
export const warmScale = (night) => 0.4 + 0.6 * sm(0.1, 0.7, night);

const OFF = new THREE.Color(0x8d8f92); // kepala lampu padam (abu-abu logam)
const ON = new THREE.Color(0xfff1c2);
const tmp = new THREE.Color();

/**
 * Warnai tiap lampu dalam sebuah InstancedMesh menurut ambangnya (mesh.userData.th = larik ambang per instance).
 * Bahan mesh harus berwarna putih: warna per lampu datang dari warna instance. Mengembalikan jumlah lampu yang menyala.
 */
export function paintLamps(mesh, night) {
  const th = mesh?.userData?.th;
  if (!th) return 0;
  let lit = 0;
  for (let i = 0; i < th.length; i++) {
    const k = lampLit(th[i], night);
    if (k > 0.5) lit++;
    mesh.setColorAt(i, tmp.copy(OFF).lerp(ON, k));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return lit;
}
