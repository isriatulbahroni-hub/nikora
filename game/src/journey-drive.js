// Mobil otomatis (autopilot) untuk perjalanan: kecepatan mengikuti bagian rute, melambat di tikungan, dan berhenti di area penurunan tamu.
// Murni data + matematika supaya bisa diuji (journey-main.js hanya memakainya).
import { clamp, frameAt, segmentAt } from './journey.js';

export const LAT_ACCEL = 3.5; // percepatan menyamping yang nyaman (m/s^2)
export const ACCEL = 2.2;
export const BRAKE = 3;
export const STOP_BEFORE_END = 4; // berhenti sekian meter sebelum ujung rute
export const ARRIVE_WITHIN = 8;

export function targetSpeed(j, s) {
  let v = segmentAt(j, s).cruise;
  let k = 0;
  for (let d = 0; d <= 60; d += 15) k = Math.max(k, Math.abs(frameAt(j, Math.min(j.length, s + d)).curvature));
  if (k > 1e-4) v = Math.min(v, Math.sqrt(LAT_ACCEL / k));
  return Math.max(0, Math.min(v, Math.sqrt(2 * BRAKE * Math.max(0, j.length - s - STOP_BEFORE_END))));
}

export const startState = (s = 0) => ({ s, v: 0, t: 0, arrived: false });

/** Majukan mobil sejauh dt detik. Mengubah dan mengembalikan state. */
export function stepDrive(j, st, dt) {
  const tv = targetSpeed(j, st.s);
  st.v += clamp(tv - st.v, -BRAKE * dt, ACCEL * dt);
  st.s = Math.min(j.length, st.s + st.v * dt);
  st.t += dt;
  st.arrived = j.length - st.s < ARRIVE_WITHIN && st.v < 0.5;
  return st;
}
