import test from 'node:test';
import assert from 'node:assert/strict';
import { GATES, HIGHWAY_SEGMENTS } from './highway.js';
import { ARENA, SATELLITES, visibleCityBuildings, RING_OUTER } from './hotel-surroundings-data.js';
import { surroundColliders } from './hotel-surroundings-colliders.js';

const overlaps = (a, b) => a.minX < b[2] && a.maxX > b[0] && a.minZ < b[3] && a.maxZ > b[1];
const roads = [...HIGHWAY_SEGMENTS.map((s) => s.rect), ...GATES.map((g) => g.rect), RING_OUTER];

test('penghalang: satu per gedung kota yang tampil, satu per satelit, satu untuk arena, dan di-cache', () => {
  const c = surroundColliders();
  assert.equal(c.length, visibleCityBuildings().length + SATELLITES.length + 1);
  assert.equal(surroundColliders(), c);
  for (const b of c) assert.ok(b.minX < b.maxX && b.minZ < b.maxZ);
});

test('penghalang: tidak pernah menutup jalan raya, Lingkar, atau gerbang (mobil dan pemain tetap bisa lewat)', () => {
  for (const b of surroundColliders()) for (const r of roads) assert.ok(!overlaps(b, r), `penghalang ${JSON.stringify(b)} menutup jalan`);
});

test('penghalang: satelit dan arena berada di dalam lingkaran bangunannya', () => {
  const c = surroundColliders();
  const s = SATELLITES[0];
  const cs = c.find((b) => Math.abs((b.minX + b.maxX) / 2 - s.x) < 1e-9 && Math.abs((b.minZ + b.maxZ) / 2 - s.z) < 1e-9);
  assert.ok(Math.hypot(cs.maxX - s.x, cs.maxZ - s.z) <= s.radius + 1e-9, 'sudut persegi satelit di dalam lingkaran');
  const ca = c.at(-1);
  assert.ok(Math.hypot(ca.maxX - ARENA.x, ca.maxZ - ARENA.z) <= ARENA.radius + 1e-9, 'sudut persegi arena di dalam lingkaran');
});
