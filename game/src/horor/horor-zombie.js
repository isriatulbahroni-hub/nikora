// Zombie untuk Mansion Horor: mesin status murni (tanpa THREE/DOM) supaya bisa diuji penuh.
//
// Pola status (diam -> kejar -> aba-aba -> serang -> pulih, terkena/oleng, sekarat) mengikuti aktor di
// KantLex/yoru-no-gakko (MIT, Copyright (c) 2026 KantLex), src/06b-actors.js. Isinya ditulis ulang: tanpa variabel global,
// gerak memakai vendor/collision.js dan pencarian jalan memakai vendor/navmesh.js (rishipr/der-koloss-ce, MIT).
// Teks lisensi: docs/horor/THIRD_PARTY_NOTICES.md. Konvensi arah: rot = 0 menghadap +z, maju = (sin rot, cos rot).
import { moveCircleWithColliders, segmentHitsBox } from './vendor/collision.js';
import { angDiff, clamp } from './horor-core.js';

export const DYING_TIME = 1.2;

export const ZOMBIE_TYPES = Object.freeze({
  walker: { hp: 4, r: 0.32, speed: 0.85, turn: 2.4, aggro: 9, hearing: 16, fov: 2.4, dmg: 12, reach: 1.15, windup: 0.55, recover: 1.0, stagger: 0.6, giveUp: 6 },
  brute: { hp: 10, r: 0.4, speed: 0.6, turn: 1.6, aggro: 8, hearing: 14, fov: 2.0, dmg: 28, reach: 1.35, windup: 0.8, recover: 1.5, stagger: 0.3, giveUp: 8 },
});

/** spawn: { id?, type?, x, z, rot?, dormant?, wakeDist? }. dormant = tergeletak, bangun saat pemain mendekat. */
export function createZombie(spawn) {
  const type = spawn.type ?? 'walker';
  const T = ZOMBIE_TYPES[type];
  if (!T) throw new Error(`jenis zombie tidak dikenal: ${type}`);
  return {
    id: spawn.id ?? null, type, T,
    x: spawn.x, z: spawn.z, rot: spawn.rot ?? 0, hp: T.hp,
    state: spawn.dormant ? 'dormant' : 'idle', t: 0, cd: 0, kx: 0, kz: 0,
    homeX: spawn.x, homeZ: spawn.z, wakeDist: spawn.wakeDist ?? 2.2,
    target: null, lost: 0, unseen: 0, path: null, pathI: 0, pathT: 0, pathGoal: null, wander: 0, wanderRot: spawn.rot ?? 0,
  };
}

export const isAlive = (z) => z.state !== 'dying' && z.state !== 'dead';

function move(z, dx, dz, boxes) {
  const [x, zz] = moveCircleWithColliders(z.x, z.z, dx, dz, z.T.r, boxes);
  z.x = x;
  z.z = zz;
}

function turnTo(z, target, dt) {
  z.rot += clamp(angDiff(z.rot, target), -z.T.turn * dt, z.T.turn * dt);
}

/** Garis pandang bebas dinding antara zombie dan titik (px, pz)? */
export function lineClear(ax, az, bx, bz, boxes) {
  for (const b of boxes) if (segmentHitsBox(ax, az, bx, bz, b) >= 0) return false;
  return true;
}

function steer(z, target, speed, dt, ctx) {
  z.pathT -= dt;
  const moved = z.pathGoal ? Math.hypot(z.pathGoal.x - target.x, z.pathGoal.z - target.z) : Infinity;
  if (ctx.grid && (z.pathT <= 0 || moved > 1.2)) {
    z.path = ctx.grid.findPath(z.x, 0, z.z, target.x, 0, target.z);
    z.pathI = 0;
    z.pathGoal = { x: target.x, z: target.z };
    z.pathT = 0.5;
  }
  let gx = target.x;
  let gz = target.z;
  const direct = lineClear(z.x, z.z, target.x, target.z, ctx.boxes);
  if (!direct && z.path && z.path.length) {
    while (z.pathI < z.path.length - 1 && Math.hypot(z.path[z.pathI].x - z.x, z.path[z.pathI].z - z.z) < 0.4) z.pathI++;
    gx = z.path[z.pathI].x;
    gz = z.path[z.pathI].z;
  }
  const want = Math.atan2(gx - z.x, gz - z.z);
  turnTo(z, want, dt);
  const facing = Math.max(0, Math.cos(angDiff(z.rot, want))); // berbelok dulu, baru melangkah
  move(z, Math.sin(z.rot) * speed * facing * dt, Math.cos(z.rot) * speed * facing * dt, ctx.boxes);
}

function notice(z, ev, tx, tz) {
  z.target = { x: tx, z: tz };
  z.lost = 0;
  z.unseen = 0;
  z.path = null;
  z.pathT = 0;
  if (z.state === 'idle' || z.state === 'dormant') {
    z.state = 'chase';
    z.t = 0;
    ev.push({ type: 'notice', id: z.id, x: z.x, z: z.z });
  }
}

/**
 * Perbarui satu zombie. ctx = { player: {x, z, dead}, boxes, grid?, rand? }. Mengembalikan daftar kejadian:
 *   notice (melihat/mendengar), attack {dmg} (serangan kena), miss, dead.
 */
export function updateZombie(z, dt, ctx) {
  const ev = [];
  z.t += dt;
  z.cd -= dt;
  if (z.state === 'dead') return ev;
  if (z.state === 'dying') {
    if (z.t >= DYING_TIME) {
      z.state = 'dead';
      ev.push({ type: 'dead', id: z.id, x: z.x, z: z.z });
    }
    return ev;
  }
  const T = z.T;
  const p = ctx.player;
  const rand = ctx.rand ?? Math.random;
  const dx = p.x - z.x;
  const dz = p.z - z.z;
  const d = Math.hypot(dx, dz) || 1e-6;
  const toP = Math.atan2(dx, dz);

  if (Math.abs(z.kx) + Math.abs(z.kz) > 0.01) {
    move(z, z.kx * dt, z.kz * dt, ctx.boxes);
    const k = Math.exp(-dt * 7);
    z.kx *= k;
    z.kz *= k;
  }

  if (z.state === 'dormant') {
    if (!p.dead && d < z.wakeDist) notice(z, ev, p.x, p.z);
    return ev;
  }

  const inView = d < 2.5 || Math.abs(angDiff(z.rot, toP)) < T.fov / 2;
  const sees = !p.dead && d < T.aggro && inView && lineClear(z.x, z.z, p.x, p.z, ctx.boxes);

  switch (z.state) {
    case 'idle': {
      z.wander -= dt;
      if (z.wander <= 0) {
        z.wander = 2 + rand() * 3;
        z.wanderRot = z.rot + (rand() - 0.5) * 3;
      }
      const away = Math.hypot(z.homeX - z.x, z.homeZ - z.z) > 3;
      turnTo(z, away ? Math.atan2(z.homeX - z.x, z.homeZ - z.z) : z.wanderRot, dt);
      move(z, Math.sin(z.rot) * T.speed * 0.25 * dt, Math.cos(z.rot) * T.speed * 0.25 * dt, ctx.boxes);
      if (sees) notice(z, ev, p.x, p.z);
      break;
    }
    case 'chase': {
      // Menyerah hanya setelah sampai di titik terakhir yang diketahui lalu mencari sebentar (lost), atau bila sudah terlalu lama
      // tidak melihat pemain (unseen; jalan yang terputus). Selama masih dalam perjalanan ke sana, jarak jauh tidak membuatnya menyerah.
      if (sees) {
        z.target = { x: p.x, z: p.z };
        z.lost = 0;
        z.unseen = 0;
      } else {
        z.unseen += dt;
        if (z.target && Math.hypot(z.target.x - z.x, z.target.z - z.z) < 0.8) z.lost += dt;
      }
      if (!z.target || z.lost > T.giveUp || z.unseen > T.giveUp * 6) {
        z.state = 'idle';
        z.target = null;
        z.path = null;
        break;
      }
      steer(z, z.target, T.speed, dt, ctx);
      if (sees && d < T.reach && z.cd <= 0 && Math.abs(angDiff(z.rot, toP)) < 0.5) {
        z.state = 'windup';
        z.t = 0;
      }
      break;
    }
    case 'windup':
      turnTo(z, toP, dt * 0.5);
      if (z.t >= T.windup) {
        if (!p.dead && d < T.reach * 1.2) ev.push({ type: 'attack', id: z.id, dmg: T.dmg, x: z.x, z: z.z });
        else ev.push({ type: 'miss', id: z.id });
        z.state = 'recover';
        z.t = 0;
        z.cd = T.recover;
      }
      break;
    case 'recover':
      if (z.t >= T.recover * 0.6) {
        z.state = 'chase';
        z.t = 0;
      }
      break;
    case 'stagger':
      if (z.t >= T.stagger) {
        z.state = 'chase';
        z.t = 0;
      }
      break;
    default:
      z.state = 'idle';
  }
  return ev;
}

/** Zombie mendengar suara (tembakan, pintu) di (x, zz) sekeras `loud` meter. */
export function hearNoise(z, x, zz, loud) {
  const ev = [];
  if (!isAlive(z) || z.state === 'windup' || z.state === 'recover') return ev;
  if (Math.hypot(z.x - x, z.z - zz) <= Math.min(z.T.hearing, loud)) notice(z, ev, x, zz);
  if (z.state === 'chase') {
    z.target = { x, z: zz };
    z.lost = 0;
    z.unseen = 0;
    z.path = null;
    z.pathT = 0;
  }
  return ev;
}

/** Zombie terkena `dmg`. opts: { fromX, fromZ, kb = 2.5, stagger = 1 (kerusakan minimum agar oleng) }. */
export function hitZombie(z, dmg, opts = {}) {
  const ev = [];
  if (!isAlive(z)) return ev;
  const { fromX = z.x, fromZ = z.z, kb = 2.5, stagger = 1 } = opts;
  z.hp -= dmg;
  const dx = z.x - fromX;
  const dz = z.z - fromZ;
  const d = Math.hypot(dx, dz) || 1;
  z.kx = (dx / d) * kb;
  z.kz = (dz / d) * kb;
  if (z.hp <= 0) {
    z.hp = 0;
    z.state = 'dying';
    z.t = 0;
    ev.push({ type: 'killed', id: z.id, x: z.x, z: z.z });
    return ev;
  }
  ev.push({ type: 'hit', id: z.id, hp: z.hp });
  if (z.state === 'dormant' || z.state === 'idle') notice(z, ev, fromX, fromZ);
  if (dmg >= stagger) {
    z.state = 'stagger';
    z.t = 0;
  }
  return ev;
}

/**
 * Sinar tembak dari (ox, oz) ke arah rot sejauh `range`: zombie hidup terdekat yang terkena dan tidak terhalang dinding.
 * Mengembalikan { zombie, dist } atau null.
 */
export function raycastZombies(ox, oz, rot, range, zombies, boxes) {
  const dx = Math.sin(rot);
  const dz = Math.cos(rot);
  let wallDist = range;
  for (const b of boxes) {
    const t = segmentHitsBox(ox, oz, ox + dx * range, oz + dz * range, b);
    if (t >= 0) wallDist = Math.min(wallDist, t * range);
  }
  let best = null;
  for (const zb of zombies) {
    if (!isAlive(zb)) continue;
    const rx = zb.x - ox;
    const rz = zb.z - oz;
    const along = rx * dx + rz * dz;
    if (along < 0 || along > wallDist) continue;
    if (Math.abs(rx * dz - rz * dx) > zb.T.r) continue;
    if (!best || along < best.dist) best = { zombie: zb, dist: along };
  }
  return best;
}
