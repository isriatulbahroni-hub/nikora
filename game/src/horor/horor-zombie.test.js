import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './horor-room.js';
import { colliderBoxes, createNavWorld } from './horor-nav.js';
import {
  DYING_TIME, ZOMBIE_TYPES, createZombie, hearNoise, hitZombie, isAlive, lineClear, raycastZombies, updateZombie,
} from './horor-zombie.js';

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

// Ruangan 20 x 12 berdinding keliling, dibelah dinding z = 6 dengan celah x 8..12 (satu-satunya jalan ke seberang).
function splitRoom({ gate = false } = {}) {
  const r = new Room('uji');
  r.wall('x', 0, 0, 20, 1);
  r.wall('x', 12, 0, 20, -1);
  r.wall('z', 0, 0, 12, 1);
  r.wall('z', 20, 0, 12, -1);
  r.wall('x', 6, 0, 8, 1);
  r.wall('x', 6, 12, 20, 1);
  if (gate) r.door({ id: 'g', wall: 'x', at: 6, pos: 10, w: 4, inner: 1, shutter: true });
  return r;
}
const RECT = [0, 0, 20, 12];
const insideAnyBox = (z, boxes) => boxes.some((b) => z.x > b.minX + 0.05 && z.x < b.maxX - 0.05 && z.z > b.minZ + 0.05 && z.z < b.maxZ - 0.05);

function simulate(z, player, ctx, seconds, onEvent) {
  const dt = 1 / 30;
  const events = [];
  for (let t = 0; t < seconds; t += dt) {
    for (const e of updateZombie(z, dt, { ...ctx, player })) {
      events.push(e);
      if (onEvent?.(e)) return events;
    }
  }
  return events;
}

test('createZombie: jenis dikenal, jenis ngawur melempar galat', () => {
  const z = createZombie({ id: 'a', x: 1, z: 2 });
  assert.equal(z.hp, ZOMBIE_TYPES.walker.hp);
  assert.equal(z.state, 'idle');
  assert.equal(createZombie({ x: 0, z: 0, type: 'brute' }).hp, ZOMBIE_TYPES.brute.hp);
  assert.equal(createZombie({ x: 0, z: 0, dormant: true }).state, 'dormant');
  assert.throws(() => createZombie({ x: 0, z: 0, type: 'naga' }), /tidak dikenal/);
});

test('colliderBoxes: gerbang terbuka (digeser ke 9999) tidak ikut', () => {
  const r = splitRoom({ gate: true });
  const tutup = colliderBoxes(r.colliders).length;
  r.setShutter('g', false);
  assert.equal(colliderBoxes(r.colliders).length, tutup - 1);
  assert.ok(colliderBoxes(r.colliders).every((b) => b.minX < 9000));
});

test('navigasi: zombie yang mendengar tembakan memutari dinding lewat celah dan menyerang, tanpa menembus dinding', () => {
  const room = splitRoom();
  const nav = createNavWorld(room, RECT);
  const player = { x: 3, z: 10, dead: false };
  const ctx = { boxes: nav.boxes, grid: nav.grid, rand: seeded() };
  const z = createZombie({ x: 3, z: 2, rot: 0 });
  hearNoise(z, player.x, player.z, 18); // dinding menghalangi pandangan, jadi harus dibangunkan oleh suara
  assert.equal(z.state, 'chase');
  let tembus = false;
  let lewatCelah = false;
  let serang = null;
  for (let t = 0; t < 60 && !serang; t += 1 / 30) {
    for (const e of updateZombie(z, 1 / 30, { ...ctx, player })) if (e.type === 'attack') serang = e;
    if (insideAnyBox(z, nav.boxes)) tembus = true;
    if (z.z > 5.5 && z.z < 6.5 && z.x > 7.5 && z.x < 12.5) lewatCelah = true;
  }
  assert.ok(serang, 'zombie akhirnya menyerang pemain di seberang dinding');
  assert.equal(serang.dmg, ZOMBIE_TYPES.walker.dmg);
  assert.equal(tembus, false, 'zombie tidak boleh berada di dalam dinding');
  assert.equal(lewatCelah, true, 'zombie harus lewat celah');
});

test('tanpa grid: zombie tersangkut di dinding (itulah gunanya navmesh)', () => {
  const room = splitRoom();
  const boxes = colliderBoxes(room.colliders);
  const z = createZombie({ x: 3, z: 2, rot: 0 });
  const player = { x: 3, z: 10, dead: false };
  const ctx = { boxes, grid: null, rand: seeded() };
  hearNoise(z, player.x, player.z, 18);
  let diserang = false;
  simulate(z, player, ctx, 40, (e) => (diserang = diserang || e.type === 'attack'));
  assert.equal(diserang, false);
  assert.ok(z.z < 6, `z=${z.z}`);
});

test('gerbang tertutup menghalangi jalan; setelah dibuka dan refresh() zombie bisa lewat', () => {
  const room = splitRoom({ gate: true });
  const nav = createNavWorld(room, RECT);
  const player = { x: 10, z: 10, dead: false };
  const tutup = createZombie({ x: 10, z: 2, rot: 0 });
  hearNoise(tutup, player.x, player.z, 18);
  let serang = false;
  simulate(tutup, player, { boxes: nav.boxes, grid: nav.grid, rand: seeded() }, 40, (e) => (serang = serang || e.type === 'attack'));
  assert.equal(serang, false, 'gerbang tertutup');
  assert.ok(tutup.z < 6);

  room.setShutter('g', false);
  nav.refresh();
  const buka = createZombie({ x: 10, z: 2, rot: 0 });
  hearNoise(buka, player.x, player.z, 18);
  serang = false;
  simulate(buka, player, { boxes: nav.boxes, grid: nav.grid, rand: seeded() }, 40, (e) => (serang = serang || e.type === 'attack'));
  assert.equal(serang, true, 'gerbang terbuka');
});

test('serangan: aba-aba dulu, kena bila pemain masih dekat, luput bila menjauh, lalu jeda', () => {
  const boxes = [];
  const z = createZombie({ x: 0, z: 0, rot: 0 });
  const player = { x: 0, z: 0.9, dead: false };
  const ctx = { boxes, grid: null, rand: seeded() };
  let first = null;
  for (let t = 0; t < 3 && !first; t += 1 / 30) {
    updateZombie(z, 1 / 30, { ...ctx, player });
    if (z.state === 'windup' && first === null) first = t;
  }
  assert.ok(first !== null, 'masuk aba-aba');
  let serang = null;
  const t0 = z.t;
  for (let t = 0; t < 2 && !serang; t += 1 / 30) {
    for (const e of updateZombie(z, 1 / 30, { ...ctx, player })) if (e.type === 'attack' || e.type === 'miss') serang = e;
  }
  assert.equal(serang.type, 'attack');
  assert.ok(t0 < ZOMBIE_TYPES.walker.windup);
  assert.equal(z.state, 'recover');
  assert.ok(z.cd > 0);

  // pemain lari saat aba-aba: serangan luput
  const z2 = createZombie({ x: 0, z: 0, rot: 0 });
  const p2 = { x: 0, z: 0.9, dead: false };
  let miss = null;
  for (let t = 0; t < 3 && !miss; t += 1 / 30) {
    if (z2.state === 'windup') p2.z = 5;
    for (const e of updateZombie(z2, 1 / 30, { ...ctx, player: p2 })) if (e.type === 'attack' || e.type === 'miss') miss = e;
  }
  assert.equal(miss.type, 'miss');
});

test('hitZombie: mengurangi nyawa, mendorong mundur, membuat oleng, dan membunuh', () => {
  const z = createZombie({ id: 'z1', x: 5, z: 5 });
  const e1 = hitZombie(z, 1, { fromX: 5, fromZ: 3 });
  assert.equal(e1[0].type, 'hit');
  assert.equal(z.hp, ZOMBIE_TYPES.walker.hp - 1);
  assert.ok(z.kz > 0 && Math.abs(z.kx) < 1e-9, 'terdorong menjauhi penembak');
  assert.equal(z.state, 'stagger');
  const e2 = hitZombie(z, 99, { fromX: 5, fromZ: 3 });
  assert.equal(e2[0].type, 'killed');
  assert.equal(z.state, 'dying');
  assert.equal(isAlive(z), false);
  assert.deepEqual(hitZombie(z, 5), []); // yang sudah sekarat tidak bisa dipukul lagi
});

test('zombie sekarat berubah jadi dead setelah DYING_TIME dan melapor sekali', () => {
  const z = createZombie({ id: 'z', x: 0, z: 0 });
  hitZombie(z, 99);
  const ctx = { boxes: [], grid: null };
  const player = { x: 50, z: 50, dead: false };
  const dead = [];
  for (let t = 0; t < DYING_TIME + 1; t += 0.05) for (const e of updateZombie(z, 0.05, { ...ctx, player })) if (e.type === 'dead') dead.push(e);
  assert.equal(z.state, 'dead');
  assert.equal(dead.length, 1);
});

test('zombie dormant: bangun hanya saat pemain mendekat, dan terpukul pun membangunkannya', () => {
  const ctx = { boxes: [], grid: null, rand: seeded() };
  const z = createZombie({ x: 0, z: 0, dormant: true, wakeDist: 2 });
  assert.deepEqual(updateZombie(z, 0.1, { ...ctx, player: { x: 6, z: 0, dead: false } }), []);
  assert.equal(z.state, 'dormant');
  const ev = updateZombie(z, 0.1, { ...ctx, player: { x: 1.5, z: 0, dead: false } });
  assert.equal(ev[0].type, 'notice');
  assert.equal(z.state, 'chase');
  const z2 = createZombie({ x: 0, z: 0, dormant: true });
  hitZombie(z2, 1, { fromX: 3, fromZ: 0 });
  assert.notEqual(z2.state, 'dormant');
});

test('penglihatan: tidak melihat menembus dinding; mendengar tembakan membuatnya mendatangi sumber suara', () => {
  const room = splitRoom();
  const boxes = colliderBoxes(room.colliders);
  assert.equal(lineClear(3, 2, 3, 10, boxes), false);
  assert.equal(lineClear(10, 2, 10, 10, boxes), true);

  const z = createZombie({ x: 3, z: 2, rot: 0 });
  const ctx = { boxes, grid: null, rand: seeded() };
  const player = { x: 3, z: 10, dead: false };
  for (let i = 0; i < 30; i++) updateZombie(z, 1 / 30, { ...ctx, player });
  assert.equal(z.state, 'idle', 'terhalang dinding: tidak melihat');
  const ev = hearNoise(z, 3, 10, 18);
  assert.equal(ev[0].type, 'notice');
  assert.equal(z.state, 'chase');
  assert.deepEqual(z.target, { x: 3, z: 10 });
  // terlalu jauh untuk didengar
  const far = createZombie({ x: 0, z: 0 });
  assert.deepEqual(hearNoise(far, 40, 0, 18), []);
  assert.equal(far.state, 'idle');
});

test('menyerah: kehilangan jejak cukup lama membuat zombie kembali diam', () => {
  const ctx = { boxes: [], grid: null, rand: seeded() };
  const z = createZombie({ x: 0, z: 0, rot: 0 });
  hearNoise(z, 4, 0, 18);
  assert.equal(z.state, 'chase');
  const player = { x: 100, z: 100, dead: false };
  for (let t = 0; t < 4; t += 1 / 30) updateZombie(z, 1 / 30, { ...ctx, player });
  assert.equal(z.state, 'chase', 'masih dalam perjalanan ke sumber suara: belum menyerah');
  for (let t = 0; t < ZOMBIE_TYPES.walker.giveUp + 8; t += 1 / 30) updateZombie(z, 1 / 30, { ...ctx, player });
  assert.equal(z.state, 'idle', 'sudah sampai dan mencari cukup lama');
  assert.equal(z.target, null);

  // jalan buntu (tidak pernah sampai ke target): menyerah setelah terlalu lama tidak melihat pemain
  const wall = [{ minX: -50, maxX: 50, minZ: 1, maxZ: 2 }];
  const buntu = createZombie({ x: 0, z: 0, rot: 0 });
  hearNoise(buntu, 0, 10, 18);
  for (let t = 0; t < ZOMBIE_TYPES.walker.giveUp * 6 + 2; t += 1 / 30) updateZombie(buntu, 1 / 30, { boxes: wall, grid: null, rand: seeded(), player });
  assert.equal(buntu.state, 'idle');
});

test('raycastZombies: kena yang terdekat, terhalang dinding, dan meleset bila arah salah', () => {
  const room = splitRoom();
  const boxes = colliderBoxes(room.colliders);
  const dekat = createZombie({ id: 'dekat', x: 10, z: 3 });
  const jauh = createZombie({ id: 'jauh', x: 10, z: 5 });
  const hit = raycastZombies(10, 0.5, 0, 12, [jauh, dekat], boxes); // lewat celah (x 8..12), arah +z
  assert.equal(hit.zombie.id, 'dekat');
  assert.ok(Math.abs(hit.dist - 2.5) < 1e-9);
  const dinding = createZombie({ id: 'balik', x: 3, z: 9 });
  assert.equal(raycastZombies(3, 1, 0, 12, [dinding], boxes), null, 'dinding menahan peluru');
  assert.equal(raycastZombies(10, 0.5, Math.PI / 2, 12, [dekat], boxes), null, 'arah salah');
  hitZombie(dekat, 99);
  assert.equal(raycastZombies(10, 0.5, 0, 12, [dekat], boxes), null, 'yang sekarat tidak bisa dibidik');
});
