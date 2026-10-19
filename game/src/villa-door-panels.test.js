import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_WALL_HEIGHT, GAME_DOORS } from './villa-gamewing.js';
import { DOOR_HEIGHT, HALL_WALL_HEIGHT, WALL_HEIGHT, getVillaWorld } from './villa-layout.js';
import {
  FRAME_IN, SLIDE_HEIGHT, SWING_HEIGHT, doorLintelTop, isMainRoomDoor, slideDir, slideLeaves, slideSide, slideSpanAt, swingLeaves,
  swingSpan, wallRun,
} from './villa-door-panels.js';

const world = getVillaWorld();

// Bukaan bersih = di antara tepi dalam rangka kiri dan kanan.
const clearOf = (d) => [-(d.width / 2 - FRAME_IN), d.width / 2 - FRAME_IN];

function covers(spans, [lo, hi]) {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let reach = lo;
  for (const [a, b] of sorted) {
    if (a > reach + 1e-9) return false;
    reach = Math.max(reach, b);
  }
  return reach >= hi - 1e-9;
}

const everyDoor = () => world.levels.flatMap((L) => L.doors.map((d) => ({ d, L })));

test('hanya pintu aula (ruang utama) yang diayun; semua pintu lain digeser', () => {
  const ground = world.levels[0];
  const swing = ground.doors.filter((d) => isMainRoomDoor(d, ground.rooms)).map((d) => `${d.x},${d.z}`).sort();
  assert.deepEqual(swing, ['-14,-11', '0,-3', '14,-11']);
  for (const L of world.levels.slice(1)) for (const d of L.doors) assert.equal(isMainRoomDoor(d, L.rooms), false);
});

test('pintu ayun menutup bukaan penuh tanpa celah', () => {
  for (const { d, L } of everyDoor()) {
    if (!isMainRoomDoor(d, L.rooms)) continue;
    const spans = swingLeaves(d.width).map(swingSpan);
    assert.ok(covers(spans, clearOf(d)), `pintu ayun (${d.x},${d.z}) ada celah`);
    if (spans.length === 2) assert.ok(spans[0][1] > spans[1][0], `daun ganda (${d.x},${d.z}) tidak bertumpuk di tengah`);
  }
});

test('pintu geser menutup bukaan penuh saat tertutup dan membebaskannya saat terbuka', () => {
  let n = 0;
  for (const { d, L } of everyDoor()) {
    if (isMainRoomDoor(d, L.rooms)) continue;
    n++;
    const clear = clearOf(d);
    for (const dir of [1, -1]) {
      const leaves = slideLeaves(d.width, dir);
      const closed = leaves.map((l) => slideSpanAt(l, 0));
      assert.ok(covers(closed, clear), `pintu geser (${d.x},${d.z}) lantai ${L.level} ada celah`);
      if (closed.length === 2) assert.ok(closed[0][1] > closed[1][0], `daun ganda (${d.x},${d.z}) tidak bertumpuk di tengah`);
      for (const l of leaves) {
        const [a, b] = slideSpanAt(l, 1);
        assert.ok(b <= clear[0] + 1e-9 || a >= clear[1] - 1e-9, `pintu geser (${d.x},${d.z}) masih menutupi bukaan saat terbuka`);
      }
    }
  }
  assert.ok(n > 20, 'harus ada banyak pintu geser');
});

test('daun pintu setinggi bukaan', () => {
  assert.ok(SWING_HEIGHT >= DOOR_HEIGHT);
  assert.ok(SLIDE_HEIGHT >= DOOR_HEIGHT);
});

test('ambang pintu setinggi dinding di sebelahnya (tidak ada lubang di atas pintu)', () => {
  const ground = world.levels[0];
  for (const d of ground.doors) {
    const top = doorLintelTop(d, ground.walls);
    if (d.tall) assert.equal(top, HALL_WALL_HEIGHT);
    else if (GAME_DOORS.includes(d)) assert.equal(top, ARENA_WALL_HEIGHT);
    else assert.equal(top, WALL_HEIGHT);
  }
});

test('pintu geser digantung di sisi luar dan bergeser ke sisi yang punya dinding', () => {
  assert.equal(slideSide({ x: 20, z: -3, orient: 'h', width: 2.2 }, [{ kind: 'lobby', rect: [14, -20, 26, -3] }]), 1);
  assert.equal(slideSide({ x: 20, z: 15, orient: 'h', width: 1.6 }, [
    { kind: 'corridor', rect: [16, 11, 38, 15] },
    { kind: 'guest', rect: [16, 15, 21.5, 22] },
  ]), -1);
  const walls = [{ orient: 'h', coord: -3, a: -40, b: 38.9 }, { orient: 'h', coord: -3, a: 40.7, b: 41.75 }];
  const door = { x: 39.8, z: -3, orient: 'h', width: 1.8 };
  assert.equal(slideDir(door, walls), -1);
  assert.ok(wallRun(door, walls, -1) >= 2.9);
  assert.ok(wallRun(door, walls, 1) < 1.2);
});
