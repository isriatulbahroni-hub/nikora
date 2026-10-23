// Sistem kamera hotel: tujuh mode kamera dalam satu dunia 3D (tanpa mengganti dunia). Murni data + matematika (tanpa THREE),
// dipakai hotel-main.js. Konvensi sudut sama dengan kamera orbit lama: yaw 0 = kamera di selatan pemain menghadap utara (-z);
// pitch positif = kamera di atas (arah pandang menunduk).
import { HOTEL_SITE, HOTEL_TOP_Y, TOWER_CENTER } from './hotel-layout.js';

export const CAMERA_MODES = Object.freeze([
  { id: 'follow', label: 'Orang ketiga', icon: '🧍' },
  { id: 'first', label: 'Orang pertama', icon: '👁' },
  { id: 'free', label: 'Kamera bebas', icon: '🕊' },
  { id: 'orbit', label: 'Orbit gedung', icon: '🔄' },
  { id: 'bird', label: 'Pandangan burung', icon: '🦅' },
  { id: 'cinematic', label: 'Sinematik', icon: '🎬' },
  { id: 'observer', label: 'Pengamat', icon: '📹' },
]);
export const modeIndex = (id) => CAMERA_MODES.findIndex((m) => m.id === id);
export const isCameraMode = (id) => modeIndex(id) >= 0;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const smoothstep = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

/** Batas pitch dan jarak per mode (dipakai seret, cubit, dan roda mouse). */
export const MODE_LIMITS = Object.freeze({
  follow: { minPitch: 0.06, maxPitch: 1.5, minDist: 1.5, maxDist: 140 },
  first: { minPitch: -1.35, maxPitch: 1.35, minDist: 0, maxDist: 0 },
  free: { minPitch: -1.5, maxPitch: 1.5, minDist: 0, maxDist: 0 },
  orbit: { minPitch: -0.25, maxPitch: 1.5, minDist: 20, maxDist: 3500 },
  bird: { minPitch: 0.9, maxPitch: 1.55, minDist: 120, maxDist: 1600 },
  cinematic: { minPitch: 0, maxPitch: 0, minDist: 0, maxDist: 0 },
  observer: { minPitch: 0, maxPitch: 0, minDist: 0, maxDist: 0 },
});

/** Arah pandang (satuan) untuk yaw dan pitch: pitch positif menunduk. */
export function lookDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: -Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

// ---------------------------------------------------------------- kamera bebas
export const FREE_MIN_Y = 1.2;
export const FREE_MAX_Y = HOTEL_TOP_Y + 800;
export const FREE_BOUNDS = Object.freeze({ minX: -4000, maxX: 4000, minZ: -2500, maxZ: 4500 });
/** Kecepatan terbang (m/s): pelan di dekat tanah, makin cepat makin tinggi supaya menara 4,2 km tetap terjangkau. */
export const freeSpeed = (y, boost = 1) => clamp(12 + y * 0.45, 12, 700) * boost;

/** Satu langkah terbang. input = { right, forward, up } (-1..1); maju mengikuti arah pandang termasuk pitch. */
export function stepFree(cam, input, delta, boost = 1) {
  const f = lookDir(cam.yaw, cam.pitch);
  const r = { x: Math.cos(cam.yaw), z: -Math.sin(cam.yaw) };
  const v = freeSpeed(cam.y, boost) * delta;
  const fw = -(input.forward ?? 0); // joystick ke atas = z negatif = maju
  return {
    ...cam,
    x: clamp(cam.x + (f.x * fw + r.x * (input.right ?? 0)) * v, FREE_BOUNDS.minX, FREE_BOUNDS.maxX),
    y: clamp(cam.y + (f.y * fw + (input.up ?? 0)) * v, FREE_MIN_Y, FREE_MAX_Y),
    z: clamp(cam.z + (f.z * fw + r.z * (input.right ?? 0)) * v, FREE_BOUNDS.minZ, FREE_BOUNDS.maxZ),
  };
}

/** Posisi awal kamera bebas: di atas dan di belakang pemain, menghadap ke arah pemain menghadap. */
export function freeStart(me, yaw) {
  return { x: me.x + Math.sin(yaw) * 6, y: (me.y ?? 0) + 5, z: me.z + Math.cos(yaw) * 6, yaw, pitch: 0.3 };
}

// ---------------------------------------------------------------- orbit dan burung
/** Sasaran orbit: menara, podium, halaman drop-off, puncak jarum. dist = jarak awal. */
export const ORBIT_TARGETS = Object.freeze([
  { name: 'Menara', x: TOWER_CENTER.x, y: 700, z: TOWER_CENTER.z, dist: 1500, pitch: 0.25 },
  { name: 'Podium & lobi', x: TOWER_CENTER.x, y: 10, z: TOWER_CENTER.z, dist: 190, pitch: 0.35 },
  { name: 'Drop-off', x: 0, y: 3, z: 425, dist: 60, pitch: 0.5 },
  { name: 'Puncak jarum', x: TOWER_CENTER.x, y: HOTEL_TOP_Y + 300, z: TOWER_CENTER.z, dist: 600, pitch: 0.15 },
]);
export const BIRD_TARGET = Object.freeze({ x: (HOTEL_SITE.minX + HOTEL_SITE.maxX) / 2, y: 0, z: (HOTEL_SITE.minZ + HOTEL_SITE.maxZ) / 2, dist: 420, pitch: 1.45 });

/** Kamera mengorbit titik (x, y, z). Mengembalikan posisi dan titik pandang; pitch positif = kamera di atas titik. */
export function orbitPose(o) {
  const cp = Math.cos(o.pitch);
  return {
    pos: [o.x + Math.sin(o.yaw) * cp * o.dist, Math.max(FREE_MIN_Y, o.y + Math.sin(o.pitch) * o.dist), o.z + Math.cos(o.yaw) * cp * o.dist],
    look: [o.x, o.y, o.z],
  };
}

// ---------------------------------------------------------------- sinematik
export const CINEMATIC_FOV = 38;
/** Jalur otomatis mengelilingi menara dan naik-turun; t dalam detik. Jari-jari selalu di luar denah menara (156 x 108 m). */
export function cinematicPose(t) {
  const a = t * 0.11;
  const r = 240 + 70 * Math.sin(t * 0.05);
  const h = 25 + 330 * (0.5 - 0.5 * Math.cos(t * 0.07));
  const lookY = 40 + 420 * (0.5 - 0.5 * Math.cos(t * 0.07 + 0.7));
  return { pos: [TOWER_CENTER.x + Math.sin(a) * r, h, TOWER_CENTER.z + Math.cos(a) * r], look: [TOWER_CENTER.x, lookY, TOWER_CENTER.z] };
}

// ---------------------------------------------------------------- pengamat
/** Titik pengamat tetap (seperti kamera pengawas) di sekitar tapak hotel; selalu menatap pemain. */
export const OBSERVER_POINTS = Object.freeze([
  { name: 'Barat laut', x: -95, y: 16, z: 372 },
  { name: 'Parkir timur', x: 100, y: 14, z: 372 },
  { name: 'Jalan raya', x: 0, y: 45, z: 330 },
  { name: 'Belakang menara', x: 0, y: 110, z: 610 },
]);
export const observerFov = (dist) => clamp((2 * Math.atan(7 / Math.max(1, dist)) * 180) / Math.PI, 14, 50);
/** Titik pengamat yang dipakai: yang terdekat dari pemain bila idx null, atau pilihan manual. */
export function observerPoint(me, idx = null) {
  if (idx !== null) return OBSERVER_POINTS[((idx % OBSERVER_POINTS.length) + OBSERVER_POINTS.length) % OBSERVER_POINTS.length];
  let best = OBSERVER_POINTS[0];
  let bd = Infinity;
  for (const p of OBSERVER_POINTS) {
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// ---------------------------------------------------------------- peralihan halus antar mode
const mix = (a, b, s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
/** Campur dua pose { pos, look } dengan kurva halus; s dalam 0..1. */
export function blendPose(from, to, s) {
  const k = smoothstep(s);
  return { pos: mix(from.pos, to.pos, k), look: mix(from.look, to.look, k) };
}
export const BLEND_SECONDS = 1.0;
