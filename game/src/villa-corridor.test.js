import test from 'node:test';
import assert from 'node:assert/strict';
import { getVillaWorld, PLAYER_RADIUS } from './villa-layout.js';

const world = getVillaWorld();
const corridors = world.levels.flatMap((L) => L.rooms.filter((r) => r.kind === 'corridor').map((r) => ({ L, r })));

test('setiap lorong selebar minimal 4 m (dua orang bisa berpapasan dengan lega)', () => {
  assert.ok(corridors.length >= 2);
  for (const { r } of corridors) assert.ok(Math.min(r.rect[2] - r.rect[0], r.rect[3] - r.rect[1]) >= 4, `${r.id}: ${JSON.stringify(r.rect)}`);
});

test('pintu kamar tamu dan pintu lorong menyambung ke tepi lorong yang baru', () => {
  for (const { L, r } of corridors) {
    const [x1, z1, x2, z2] = r.rect;
    const guestDoors = L.doors.filter((d) => d.orient === 'h' && (Math.abs(d.z - z1) < 1e-6 || Math.abs(d.z - z2) < 1e-6) && d.x > x1 && d.x < x2);
    assert.equal(guestDoors.length, 8, `${r.id}: 4 pintu di tiap sisi`);
    const ends = L.doors.filter((d) => d.orient === 'v' && d.z > z1 && d.z < z2 && (Math.abs(d.x - x1) < 1e-6 || Math.abs(d.x - x2) < 1e-6));
    assert.ok(ends.length >= 1, `${r.id}: ada pintu ujung lorong`);
    for (const d of ends) assert.ok(d.width >= 2.4, `${r.id}: pintu ujung lebar, ${d.width}`);
  }
});

test('berjalan sepanjang lorong lantai dasar tanpa terhalang; kamar tamu tetap bisa dimasuki', () => {
  let p = { x: 17, z: 13, level: 0, stair: null };
  for (let i = 0; i < 200; i++) p = world.move(p, 0.1, 0);
  assert.ok(p.x > 36.5, `ujung timur lorong, x=${p.x}`);
  assert.ok(Math.abs(p.z - 13) < 1e-6);
  // dari tengah lorong ke kamar utara lewat pintunya
  let q = { x: 18.75, z: 13, level: 0, stair: null };
  for (let i = 0; i < 60; i++) q = world.move(q, 0, -0.1);
  assert.ok(q.z < 8, `masuk Guest Room 1, z=${q.z}`);
  assert.equal(PLAYER_RADIUS < 0.5, true);
});
