// Pembantu tes (bukan tes): pengemudi otomatis yang mengikuti garis tengah jalan lengkung (pure pursuit) pada laju yang diinginkan.
import { stepVehicle } from './vehicle.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Titik di jarak s pada garis tengah (interpolasi linear). */
export function pointOn(road, s) {
  const p = road.points;
  let lo = 0;
  let hi = p.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].s <= s) lo = m; else hi = m; }
  const a = p[lo];
  const b = p[hi];
  const t = b.s > a.s ? clamp((s - a.s) / (b.s - a.s), 0, 1) : 0;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** Input pengemudi menuju titik `look` m di depan posisi terdekat pada garis tengah. dir = +1 searah titik, -1 berlawanan. */
export function pursuitInput(v, road, { speed = 20, look = 24, dir = 1 } = {}) {
  const n = road.nearest(v.x, v.z);
  const s = n ? n.s : dir > 0 ? 0 : road.length;
  const target = pointOn(road, clamp(s + dir * look, 0, road.length));
  const err = wrap(Math.atan2(target.x - v.x, target.z - v.z) - v.heading);
  return { throttle: clamp((speed - v.speed) * 0.6, -1, 1), steer: clamp(err * 2.4, -1, 1) };
}

/** Jalankan mobil sepanjang jalan sampai `done(v)` atau waktu habis. Mengembalikan statistik. */
export function driveRoad(v, road, env, { speed = 20, dir = 1, maxTime = 400, dt = 1 / 60, done = () => false, onStep = null } = {}) {
  const stat = { t: 0, offRoad: 0, maxLateral: 0, maxSlip: 0, hits: 0, finished: false };
  while (stat.t < maxTime) {
    stepVehicle(v, pursuitInput(v, road, { speed, dir }), dt, env);
    stat.t += dt;
    const n = road.nearest(v.x, v.z);
    if (n) stat.maxLateral = Math.max(stat.maxLateral, Math.abs(n.lateral));
    if (env.surfaceAt && env.surfaceAt(v.x, v.z) !== 'road') stat.offRoad++;
    stat.maxSlip = Math.max(stat.maxSlip, v.slip ?? 0);
    if (v.hit > 0) stat.hits++;
    onStep?.(v, stat);
    if (done(v)) { stat.finished = true; break; }
  }
  return stat;
}
