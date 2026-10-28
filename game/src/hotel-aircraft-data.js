// Helikopter dan pesawat yang mengorbit menara NIKORA (pemandangan hidup, bukan kendaraan yang bisa dikendarai). Murni data + matematika (tanpa THREE);
// digambar hotel-aircraft.js. Posisi dihitung dari waktu absolut, jadi tanpa keadaan yang menumpuk dan sama untuk semua pemain. Satuan meter.
import { TOWER_CENTER } from './hotel-layout.js';
import { CITY_HEIGHTS, SATELLITES } from './hotel-surroundings-data.js';

export const CITY_MAX_HEIGHT = Math.max(...CITY_HEIGHTS);
// kind: 'heli' | 'plane'. period negatif = berputar berlawanan arah jarum jam. scale = pembesaran model (modelnya ~8 m).
export const AIRCRAFT = Object.freeze([
  { id: 'heli_dekat', kind: 'heli', cx: TOWER_CENTER.x, cz: TOWER_CENTER.z, radius: 130, altitude: 520, period: 150, phase: 0, scale: 4, bob: 12 },
  { id: 'heli_kota', kind: 'heli', cx: TOWER_CENTER.x, cz: TOWER_CENTER.z, radius: 430, altitude: 330, period: -210, phase: 2.1, scale: 4, bob: 18 },
  { id: 'heli_jauh', kind: 'heli', cx: TOWER_CENTER.x, cz: TOWER_CENTER.z, radius: 620, altitude: 780, period: 260, phase: 4.2, scale: 5, bob: 25 },
  { id: 'pesawat', kind: 'plane', cx: TOWER_CENTER.x, cz: TOWER_CENTER.z, radius: 1300, altitude: 1600, period: 240, phase: 1, scale: 6, bob: 0 },
]);

/** Pose pesawat di orbit pada waktu `t` detik: posisi, yaw (menghadap arah gerak, model menghadap +z), roll (miring ke dalam tikungan). */
export function orbitPose(o, t) {
  const dir = Math.sign(o.period) || 1;
  const a = o.phase + (t / Math.abs(o.period)) * Math.PI * 2 * dir;
  const x = o.cx + Math.cos(a) * o.radius;
  const z = o.cz + Math.sin(a) * o.radius;
  const dx = -Math.sin(a) * dir;
  const dz = Math.cos(a) * dir;
  const bank = o.kind === 'plane' ? 0.35 : 0.18;
  return { x, y: o.altitude + Math.sin(a * 3 + o.phase) * o.bob, z, yaw: Math.atan2(dx, dz), roll: -dir * bank, speed: (Math.PI * 2 * o.radius) / Math.abs(o.period) };
}

/** Jarak mendatar terdekat orbit `o` ke menara satelit `s` (m), dikurangi jari-jari satelit. */
export function clearanceToSatellite(o, s) {
  const d = Math.hypot(s.x - o.cx, s.z - o.cz);
  return Math.abs(d - o.radius) - s.radius;
}
export { SATELLITES };
