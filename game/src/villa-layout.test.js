import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOUNDS, PLAYER_RADIUS, ROOMS, DOORS, SPAWN, getVillaWorld, isWalkable, moveWithCollisions, resolveMove, roomAt,
} from './villa-layout.js';

const world = getVillaWorld();
const ok = (x, z) => isWalkable(x, z, PLAYER_RADIUS, world.colliders, BOUNDS);

test('titik spawn dan setiap pintu bisa dilewati', () => {
  assert.ok(ok(SPAWN.x, SPAWN.z));
  for (const d of DOORS) assert.ok(ok(d.x, d.z), `pintu ${d.orient} (${d.x},${d.z}) terhalang`);
});

test('pusat setiap ruangan bebas dari properti', () => {
  for (const r of ROOMS) {
    const cx = (r.rect[0] + r.rect[2]) / 2;
    const cz = (r.rect[1] + r.rect[3]) / 2;
    assert.ok(ok(cx, cz), `pusat ${r.name} terhalang`);
  }
});

test('semua ruangan terjangkau dari pintu gerbang (flood fill)', () => {
  const step = 0.4;
  const key = (i, j) => `${i},${j}`;
  const toX = (i) => BOUNDS.minX + i * step;
  const toZ = (j) => BOUNDS.minZ + j * step;
  const seen = new Set();
  const queue = [[Math.round((SPAWN.x - BOUNDS.minX) / step), Math.round((SPAWN.z - BOUNDS.minZ) / step)]];
  seen.add(key(...queue[0]));
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (seen.has(key(ni, nj)) || !ok(toX(ni), toZ(nj))) continue;
      seen.add(key(ni, nj));
      queue.push([ni, nj]);
    }
  }
  const reach = (x, z) => seen.has(key(Math.round((x - BOUNDS.minX) / step), Math.round((z - BOUNDS.minZ) / step)));
  for (const r of ROOMS) {
    const cx = (r.rect[0] + r.rect[2]) / 2;
    const cz = (r.rect[1] + r.rect[3]) / 2;
    assert.ok(reach(cx, cz), `${r.name} tidak terjangkau`);
  }
  assert.ok(reach(0, 9), 'jembatan kolam harus terjangkau');
});

test('kolam tidak bisa dimasuki, jembatan bisa', () => {
  assert.equal(ok(-4, 9), false);
  assert.equal(ok(4, 9), false);
  assert.equal(ok(0, 9), true);
});

test('dinding menahan pemain, tembus dinding dicegah meski langkah besar', () => {
  // dari pintu utama aula berjalan ke barat: tertahan dinding selatan aula
  let p = { x: -10, z: -1 };
  p = moveWithCollisions(p, 0, -3, PLAYER_RADIUS, world.colliders);
  assert.ok(p.z >= -3 + 0.15 + PLAYER_RADIUS - 1e-6, `menembus dinding, z=${p.z}`);
  // lewat pintu utama (x=0) bisa masuk
  let q = { x: 0, z: -1 };
  q = moveWithCollisions(q, 0, -4, PLAYER_RADIUS, world.colliders);
  assert.ok(q.z < -3, 'harus bisa masuk lewat pintu utama');
  // langkah sangat besar tidak menembus
  let r = { x: -10, z: 1 };
  r = moveWithCollisions(r, 0, -6, PLAYER_RADIUS, world.colliders);
  assert.ok(r.z > -3, `menembus dinding dengan langkah besar, z=${r.z}`);
});

test('resolveMove: pusat di dalam kotak didorong keluar, batas dunia dipatuhi', () => {
  const out = resolveMove({ x: 0, z: 9 + 3 }, PLAYER_RADIUS, world.colliders);
  assert.ok(isWalkable(out.x, out.z, PLAYER_RADIUS, world.colliders));
  const edge = resolveMove({ x: 999, z: -999 }, PLAYER_RADIUS, world.colliders);
  assert.equal(edge.x, BOUNDS.maxX - PLAYER_RADIUS);
  assert.equal(edge.z, BOUNDS.minZ + PLAYER_RADIUS);
});

test('roomAt memberi nama lokasi yang benar', () => {
  assert.equal(roomAt(0, -10).id, 'wedding_hall');
  assert.equal(roomAt(0, 9).kind, 'pool');
  assert.equal(roomAt(30, 36).id, 'parking');
  assert.equal(roomAt(19, 8).kind, 'guest');
  assert.equal(roomAt(-26, 12).id, 'restaurant');
  assert.equal(roomAt(0, 0).id, 'courtyard');
});

test('jumlah ruangan dan kamar tamu sesuai rancangan', () => {
  assert.equal(ROOMS.filter((r) => r.kind === 'guest').length, 8);
  assert.ok(world.colliders.length > 50);
});
