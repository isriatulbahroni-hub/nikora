// Kamera aula: putar (yaw), miring (pitch), zoom, dan geser (pan). Murni matematika (tanpa THREE) supaya mudah diuji.
// Nilai bawaan sama dengan kamera lama: jarak mendatar 9,5 m, tinggi 8,5 m pada zoom 1.

export const CAM = Object.freeze({
  minPitch: 0.15, // hampir sejajar tanah
  maxPitch: 1.45, // hampir tegak lurus dari atas
  minZoom: 0.35,
  maxZoom: 3,
  maxPan: 26, // jarak geser terjauh dari pemain (dunia aula seluas ±28 m)
  minY: 0.5, // kamera tidak boleh turun ke bawah lantai
});

const BASE_H = 9.5;
const BASE_V = 8.5;
export const BASE_ARM = Math.hypot(BASE_H, BASE_V);
export const DEFAULT_PITCH = Math.atan2(BASE_V, BASE_H);

export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

export function createCamState() {
  return { yaw: 0, pitch: DEFAULT_PITCH, zoom: 1, panX: 0, panZ: 0 };
}

/** Jaga semua nilai tetap dalam batas. Mengubah dan mengembalikan state yang sama. */
export function clampCam(state) {
  state.pitch = clamp(state.pitch, CAM.minPitch, CAM.maxPitch);
  state.zoom = clamp(state.zoom, CAM.minZoom, CAM.maxZoom);
  const len = Math.hypot(state.panX, state.panZ);
  if (len > CAM.maxPan) {
    state.panX = (state.panX / len) * CAM.maxPan;
    state.panZ = (state.panZ / len) * CAM.maxPan;
  }
  return state;
}

/** Putar dan miringkan: dx/dy dalam piksel layar (geser ke kanan = kamera berputar ke kanan, geser ke bawah = makin dari atas). */
export function orbitBy(state, dx, dy) {
  state.yaw -= dx * 0.006;
  state.pitch += dy * 0.005;
  return clampCam(state);
}

/** Kalikan zoom (faktor > 1 menjauh, < 1 mendekat). */
export function zoomBy(state, factor) {
  state.zoom *= factor;
  return clampCam(state);
}

/** Satuan dunia per piksel layar pada titik bidik, untuk kamera perspektif dengan sudut pandang fovDeg. */
export function panUnitsPerPixel(arm, viewHeight, fovDeg = 46) {
  return (2 * Math.tan((fovDeg * Math.PI) / 360) * arm) / Math.max(1, viewHeight);
}

/**
 * Geser ala "seret peta": isi layar mengikuti jari. Jari ke kanan = kamera bergeser ke kiri, jari ke bawah = kamera maju.
 * Arah mengikuti sudut putar kamera (yaw), jadi selalu terasa benar di layar.
 */
export function panBy(state, dx, dy, unitsPerPx) {
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);
  const forwardX = -Math.sin(state.yaw);
  const forwardZ = -Math.cos(state.yaw);
  state.panX += (-dx * rightX + dy * forwardX) * unitsPerPx;
  state.panZ += (-dx * rightZ + dy * forwardZ) * unitsPerPx;
  return clampCam(state);
}

/** Tarik pan pelan-pelan kembali ke pemain (dipakai saat pemain berjalan). rate ≈ 3 = sekitar sepertiga detik. */
export function relaxPan(state, delta, rate = 3) {
  const k = Math.exp(-rate * delta);
  state.panX *= k;
  state.panZ *= k;
  if (Math.hypot(state.panX, state.panZ) < 0.01) {
    state.panX = 0;
    state.panZ = 0;
  }
  return state;
}

/** Kembalikan kamera ke tampilan awal (tanpa mengubah arah putar, supaya arah joystick tidak berubah mendadak). */
export function resetView(state) {
  state.pitch = DEFAULT_PITCH;
  state.zoom = 1;
  state.panX = 0;
  state.panZ = 0;
  return state;
}

/** Panjang lengan kamera (jarak ke titik bidik); `fit` menyesuaikan layar potret yang sempit. */
export function armLength(state, fit) {
  return BASE_ARM * fit * state.zoom;
}

/** Posisi kamera relatif terhadap titik bidik (x, z) dan tinggi mutlak dari lantai (y). */
export function cameraOffset(state, fit) {
  const arm = armLength(state, fit);
  const flat = Math.cos(state.pitch) * arm;
  return {
    x: Math.sin(state.yaw) * flat,
    y: Math.max(CAM.minY, Math.sin(state.pitch) * arm),
    z: Math.cos(state.yaw) * flat,
  };
}

/**
 * Geser pelan-pelan miring, zoom, dan pan menuju tampilan awal (dipakai tombol "pusatkan kamera").
 * Mengembalikan true bila sudah sampai (nilai dipaskan persis).
 */
export function easeToDefault(state, delta, rate = 6) {
  const k = 1 - Math.exp(-rate * delta);
  state.pitch += (DEFAULT_PITCH - state.pitch) * k;
  state.zoom += (1 - state.zoom) * k;
  state.panX -= state.panX * k;
  state.panZ -= state.panZ * k;
  const done = Math.abs(state.pitch - DEFAULT_PITCH) < 0.005 && Math.abs(state.zoom - 1) < 0.01 && Math.hypot(state.panX, state.panZ) < 0.05;
  if (done) resetView(state);
  return done;
}
