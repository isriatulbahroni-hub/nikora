// Perencana pukulan bulu tangkis: mencari tenaga yang membuat kok jatuh di sasaran sambil melewati net,
// memakai simulasi fisika yang sama dengan permainan. Murni (tanpa DOM/three.js).
import { COURT, PHYSICS, stepShuttle } from './badminton.js';

export const HAND = Object.freeze({ minY: 0.3, maxY: 2.7, horizontal: 1.0 }); // jangkauan pukul
const SIM_DT = 1 / 120;

/** Terbangkan kok (tanpa objek rally) sampai jatuh; mengembalikan titik jatuh dan apakah melewati net. */
export function simulateLanding(start, maxSeconds = 8) {
  let s = { pos: { ...start.pos }, vel: { ...start.vel } };
  let clear = true;
  for (let t = 0; t < maxSeconds; t += SIM_DT) {
    const n = stepShuttle(s, SIM_DT);
    if ((s.pos.z < 0) !== (n.pos.z < 0)) {
      const k = s.pos.z / (s.pos.z - n.pos.z);
      const y = s.pos.y + (n.pos.y - s.pos.y) * k;
      if (y < COURT.netHeight + 0.08) clear = false;
    }
    if (n.pos.y <= 0) return { x: n.pos.x, z: n.pos.z, clear };
    s = n;
  }
  return { x: s.pos.x, z: s.pos.z, clear: false };
}

export const MODES = Object.freeze({
  clear: { elevation: 0.9, targetZ: 5.3 },
  drop: { elevation: 0.55, targetZ: 1.7 },
  smash: { elevation: 0.12, targetZ: 3.4 },
});

/**
 * Rencanakan pukulan dari sisi `side` ke `target` (lokal): cari tenaga yang membuat kok jatuh paling dekat
 * dengan target sambil melewati net. Mengembalikan { dir, power, landing } atau null bila tak ada yang melewati net.
 */
export function planShot({ pos, side, target, mode = 'clear' }) {
  const { elevation } = MODES[mode];
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const h = Math.hypot(dx, dz) || 1;
  const dir = { x: dx / h, y: elevation, z: dz / h };
  const n = Math.hypot(dir.x, dir.y, dir.z);
  let best = null;
  for (let power = 0.05; power <= 1.0001; power += 0.025) {
    const speed = PHYSICS.minHitSpeed + (PHYSICS.maxHitSpeed - PHYSICS.minHitSpeed) * power;
    const landing = simulateLanding({ pos, vel: { x: (dir.x / n) * speed, y: (dir.y / n) * speed, z: (dir.z / n) * speed } });
    if (!landing.clear) continue;
    const miss = Math.hypot(landing.x - target.x, landing.z - target.z);
    if (!best || miss < best.miss) best = { dir, power, landing, miss };
  }
  void side;
  return best;
}

/** Pilih jenis pukulan menurut keadaan kok: tinggi = smash, dekat net = drop, selain itu clear. */
export function chooseMode(shuttlePos) {
  if (shuttlePos.y > 1.9 && Math.abs(shuttlePos.z) > 1.8) return 'smash';
  if (Math.abs(shuttlePos.z) < 1.8 && shuttlePos.y < 1.6) return 'drop';
  return 'clear';
}
