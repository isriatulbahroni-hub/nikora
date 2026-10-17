import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getVillaWorld } from './villa-layout.js';
import { TV, WINDOW_W, bedroomTvs, wallIsExterior, windowCenters } from './villa-tv.js';

const world = getVillaWorld();
const tvs = bedroomTvs(world);
const beds = world.allProps.filter((p) => p.type === 'bed');

test('setiap tempat tidur (21 kamar tidur di tiga lantai) punya tepat satu TV di kamarnya', () => {
  assert.equal(beds.length, 21);
  assert.equal(tvs.length, beds.length);
  assert.equal(new Set(tvs.map((t) => t.id)).size, tvs.length);
  for (const bed of beds) {
    const tv = tvs.find((t) => t.bedX === bed.x && t.bedZ === bed.z && t.level === bed.level);
    assert.ok(tv, `tempat tidur (${bed.x},${bed.z}) lantai ${bed.level} tanpa TV`);
    const room = world.levels[bed.level].rooms.find((r) => r.id === tv.roomId);
    assert.ok(bed.x > room.rect[0] && bed.x < room.rect[2] && bed.z > room.rect[1] && bed.z < room.rect[3]);
  }
  for (const id of ['main_suite', 'bridal_room', 'exec_suite', 'honeymoon', 'presidential', 'guest_1', 'guest_8', 'guest_9', 'guest_16']) {
    assert.ok(tvs.some((t) => t.roomId === id), `kamar ${id} tanpa TV`);
  }
});

test('TV menempel di dinding dalam kamar, menghadap tempat tidur, dan di ketinggian layar', () => {
  for (const tv of tvs) {
    const room = world.levels[tv.level].rooms.find((r) => r.id === tv.roomId);
    const [x1, z1, x2, z2] = room.rect;
    const half = TV.width / 2 + TV.bezel;
    assert.ok(tv.x - half >= x1 + 0.15 && tv.x + half <= x2 - 0.15, `${tv.id} keluar dari dinding samping`);
    assert.ok(tv.z > z1 && tv.z < z2, `${tv.id} di luar ruangan`);
    const faceX = Math.sin(tv.ry);
    const faceZ = Math.cos(tv.ry);
    assert.ok(faceX * (tv.bedX - tv.x) + faceZ * (tv.bedZ - tv.z) > 2, `${tv.id} tidak menghadap tempat tidur`);
    const wallZ = faceZ < 0 ? z2 : z1; // dinding di belakang TV
    assert.ok(Math.abs(Math.abs(tv.z - wallZ) - 0.22) < 1e-6, `${tv.id} tidak menempel di dinding`);
    const floorY = tv.level * world.levelHeight;
    assert.ok(tv.y - floorY > 1.2 && tv.y - floorY < 1.9);
  }
});

test('TV tidak menutup pintu maupun jendela pada dindingnya', () => {
  for (const tv of tvs) {
    const level = world.levels[tv.level];
    const wallZ = Math.cos(tv.ry) < 0 ? level.rooms.find((r) => r.id === tv.roomId).rect[3] : level.rooms.find((r) => r.id === tv.roomId).rect[1];
    const half = TV.width / 2 + TV.bezel;
    for (const d of level.doors) {
      if (d.orient !== 'h' || Math.abs(d.z - wallZ) > 1e-6) continue;
      assert.ok(tv.x + half <= d.x - d.width / 2 || tv.x - half >= d.x + d.width / 2, `${tv.id} menutup pintu`);
    }
    for (const w of level.walls) {
      if (w.dup || w.orient !== 'h' || Math.abs(w.coord - wallZ) > 1e-6) continue;
      for (const c of windowCenters(w, wallIsExterior(w, level.rooms))) {
        assert.ok(tv.x + half <= c - WINDOW_W / 2 || tv.x - half >= c + WINDOW_W / 2, `${tv.id} menutup jendela`);
      }
    }
  }
});

test('penempatan konsisten (deterministik)', () => {
  assert.deepEqual(bedroomTvs(world), tvs);
});

test('aturan jendela di penempatan TV sama dengan yang dipakai renderer dinding (villa-world.js)', () => {
  const src = readFileSync(new URL('./villa-world.js', import.meta.url), 'utf8');
  assert.match(src, /const WINDOW_W = 1\.5;/);
  assert.match(src, /exterior && len >= 3\.4 \? Math\.floor\(\(len - 1\.4\) \/ 3\.2\) : 0/);
  assert.match(src, /w\.a \+ \(len \* \(i \+ 0\.5\)\) \/ n/);
  assert.equal(WINDOW_W, 1.5);
  const wall = { orient: 'h', coord: -3, a: 25.85, b: 38.15 };
  assert.deepEqual(windowCenters(wall, true).map((c) => Math.round(c * 100) / 100), [27.9, 32, 36.1]);
  assert.deepEqual(windowCenters(wall, false), []);
  assert.deepEqual(windowCenters({ ...wall, a: 0, b: 3 }, true), []);
});
