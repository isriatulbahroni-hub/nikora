import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WINDOW_W, blockedSpans, wallIsExterior, windowCenters } from './villa-tv.js';
import { getVillaWorld } from './villa-layout.js';

const world = getVillaWorld();

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

test('blockedSpans: dinding luar suite memuat jendela dan pintu; dinding dalam kamar tamu hanya pintu', () => {
  const ground = world.levels[0];
  const suite = blockedSpans(ground, 'h', -3);
  assert.ok(suite.length >= 3, 'dua jendela dan satu pintu');
  const guest = blockedSpans(ground, 'h', 11);
  assert.ok(guest.length >= 4, 'pintu tiap kamar tamu');
  const room = ground.rooms.find((r) => r.id === 'guest_1');
  assert.equal(wallIsExterior({ orient: 'h', coord: 11, a: 16, b: 21.5 }, ground.rooms), false);
  assert.equal(wallIsExterior({ orient: 'v', coord: room.rect[0], a: room.rect[1], b: room.rect[3] }, ground.rooms), true, 'dinding barat kamar tamu 1 adalah dinding luar dengan jendela');
});
