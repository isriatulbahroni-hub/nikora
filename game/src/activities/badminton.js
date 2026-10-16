// Bulu tangkis: simulasi fisika kok + aturan reli (murni, tanpa three.js; dipakai klien dan server).
// Koordinat dunia: x melintang lapangan, y ke atas, z memanjang; net di z = 0; sisi 'a' z < 0, sisi 'b' z > 0.
// Kok tidak dibuat sekadar animasi: gerakannya dihitung dari gravitasi + hambatan udara kuadratik
// (kok cepat sekali melambat dan jatuh nyaris tegak), sehingga smash, clear, dan netting terasa nyata.

export const ACTIVITY_ID = 'bulu-tangkis';
export const COURT = Object.freeze({
  width: 6.1, // ganda; garis dihitung masuk
  length: 13.4,
  netHeight: 1.524,
  singlesWidth: 5.18,
});
export const PHYSICS = Object.freeze({
  gravity: 9.81,
  terminalSpeed: 6.8, // m/s, kecepatan jatuh bebas kok bulu
  reach: 1.2, // jangkauan raket (m) dari titik ayun
  maxHitSpeed: 45, // smash penuh
  minHitSpeed: 8,
  step: 1 / 240,
});
const DRAG = PHYSICS.gravity / (PHYSICS.terminalSpeed * PHYSICS.terminalSpeed);

export const otherSide = (side) => (side === 'a' ? 'b' : 'a');
const sideOfZ = (z) => (z < 0 ? 'a' : 'b');
const len = (v) => Math.hypot(v.x, v.y, v.z);

/** Satu langkah fisika (Euler semi-implisit). Murni: mengembalikan keadaan baru. */
export function stepShuttle(shuttle, dt) {
  const { pos, vel } = shuttle;
  const speed = len(vel);
  const ax = -DRAG * speed * vel.x;
  const ay = -PHYSICS.gravity - DRAG * speed * vel.y;
  const az = -DRAG * speed * vel.z;
  const nv = { x: vel.x + ax * dt, y: vel.y + ay * dt, z: vel.z + az * dt };
  return {
    pos: { x: pos.x + nv.x * dt, y: pos.y + nv.y * dt, z: pos.z + nv.z * dt },
    vel: nv,
  };
}

export function inBounds(pos, { singles = false } = {}) {
  const halfW = (singles ? COURT.singlesWidth : COURT.width) / 2;
  return Math.abs(pos.x) <= halfW && Math.abs(pos.z) <= COURT.length / 2;
}

const SERVE_SPOT = 1.9; // jarak titik servis dari net (m)

/**
 * Satu reli, dari servis sampai kok jatuh. `step(dt)` mengembalikan `null` selama kok di udara, lalu
 * { type: 'landed', side, inBounds, netHit, winner } saat jatuh (`netHit`: sempat menabrak net).
 */
export function createRally({ singles = false } = {}) {
  let shuttle = null;
  let phase = 'ready'; // ready | live | dead
  let lastHitSide = null;
  let winner = null;
  let crossings = 0;
  let netHit = false;

  const kill = (w) => { phase = 'dead'; winner = w; };

  return {
    get phase() { return phase; },
    get shuttle() { return shuttle; },
    get lastHitSide() { return lastHitSide; },
    get winner() { return winner; },
    get crossings() { return crossings; },

    /** power 0..1, aimX -1..1 (arah menyamping). */
    serve(side, { power = 0.5, aimX = 0 } = {}) {
      if (phase !== 'ready') return { ok: false, reason: 'sudah-berjalan' };
      if (side !== 'a' && side !== 'b') return { ok: false, reason: 'sisi-tidak-valid' };
      const p = Math.max(0, Math.min(1, Number.isFinite(power) ? power : 0.5));
      const aim = Math.max(-1, Math.min(1, Number.isFinite(aimX) ? aimX : 0));
      const dir = side === 'a' ? 1 : -1; // menuju sisi lawan
      shuttle = {
        pos: { x: 0, y: 1.0, z: -dir * SERVE_SPOT },
        vel: { x: aim * 2, y: 4 + p * 6, z: dir * (3 + p * 6) },
      };
      lastHitSide = side;
      phase = 'live';
      return { ok: true };
    },

    /** Pukulan: raket di `racket`, mengarah `dir`, tenaga `power` 0..1. */
    swing(side, { racket, dir, power = 0.5 } = {}) {
      if (phase !== 'live') return { ok: false, reason: 'tidak-berjalan' };
      if (side !== 'a' && side !== 'b') return { ok: false, reason: 'sisi-tidak-valid' };
      if (!racket || !dir || len(dir) === 0) return { ok: false, reason: 'ayunan-tidak-valid' };
      if (sideOfZ(shuttle.pos.z) !== side) return { ok: false, reason: 'kok-di-sisi-lawan' };
      const dx = shuttle.pos.x - racket.x;
      const dy = shuttle.pos.y - racket.y;
      const dz = shuttle.pos.z - racket.z;
      if (Math.hypot(dx, dy, dz) > PHYSICS.reach) return { ok: false, reason: 'terlalu-jauh' };
      if (side === lastHitSide) { // memukul dua kali berturut-turut
        kill(otherSide(side));
        return { ok: false, reason: 'dua-kali', fault: true, winner };
      }
      const p = Math.max(0, Math.min(1, Number.isFinite(power) ? power : 0.5));
      const speed = PHYSICS.minHitSpeed + (PHYSICS.maxHitSpeed - PHYSICS.minHitSpeed) * p;
      const n = len(dir);
      shuttle = { pos: shuttle.pos, vel: { x: (dir.x / n) * speed, y: (dir.y / n) * speed, z: (dir.z / n) * speed } };
      lastHitSide = side;
      return { ok: true, speed };
    },

    step(dt) {
      if (phase !== 'live') return null;
      let remaining = dt;
      while (remaining > 1e-9) {
        const h = Math.min(PHYSICS.step, remaining);
        remaining -= h;
        const prev = shuttle;
        const next = stepShuttle(prev, h);
        // Melintasi bidang net?
        if ((prev.pos.z < 0) !== (next.pos.z < 0) && prev.pos.z !== next.pos.z) {
          const t = prev.pos.z / (prev.pos.z - next.pos.z);
          const yAtNet = prev.pos.y + (next.pos.y - prev.pos.y) * t;
          if (yAtNet < COURT.netHeight) {
            // Menabrak net: kok jatuh di sisi pemukul.
            netHit = true;
            shuttle = { pos: { x: prev.pos.x, y: Math.max(yAtNet, 0), z: prev.pos.z < 0 ? -0.02 : 0.02 }, vel: { x: 0, y: Math.min(next.vel.y, 0), z: 0 } };
            continue;
          }
          crossings += 1;
        }
        if (next.pos.y <= 0) {
          const pos = { x: next.pos.x, y: 0, z: next.pos.z };
          shuttle = { pos, vel: { x: 0, y: 0, z: 0 } };
          const side = sideOfZ(pos.z);
          const inside = inBounds(pos, { singles });
          // Masuk: poin untuk lawan sisi tempat kok jatuh. Keluar: salah pemukul terakhir.
          kill(inside ? otherSide(side) : otherSide(lastHitSide));
          return { type: 'landed', side, inBounds: inside, netHit, winner };
        }
        shuttle = next;
      }
      return null;
    },
  };
}

/** Skor pertandingan: reli poin, 21 dengan selisih 2, batas 30. Server = pemenang reli terakhir. */
export function createMatch({ target = 21, cap = 30, firstServer = 'a' } = {}) {
  const score = { a: 0, b: 0 };
  let server = firstServer;
  let winner = null;
  return {
    get score() { return { ...score }; },
    get server() { return server; },
    get winner() { return winner; },
    award(side) {
      if (winner) return { ok: false, reason: 'selesai' };
      if (side !== 'a' && side !== 'b') return { ok: false, reason: 'sisi-tidak-valid' };
      score[side] += 1;
      server = side;
      const lead = score[side] - score[otherSide(side)];
      if ((score[side] >= target && lead >= 2) || score[side] >= cap) winner = side;
      return { ok: true, winner };
    },
  };
}
