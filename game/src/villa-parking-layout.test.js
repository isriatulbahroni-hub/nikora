import test from 'node:test';
import assert from 'node:assert/strict';
import { BOUNDS, COUNTRYSIDE, WORLD_LIMIT, getVillaWorld } from './villa-layout.js';
import { GUEST_ENTRY, PARKING_KEEP_OUT, PARKING_ROAD, STAFF_ENTRY, guestSlots, inParkingKeepOut, routeFromSlot, routeToSlot, staffSlots } from './villa-parking.js';

// Tes penyambung: data parkir (villa-parking.js) harus cocok dengan denah villa (villa-layout.js).

test('parkir villa: konstanta jalan dan batas kompleks cocok dengan denah villa', () => {
  assert.equal(BOUNDS.maxZ, 84, 'gerbang di pagar selatan z = 84');
  assert.equal(PARKING_ROAD[0], -COUNTRYSIDE.roadHalf);
  assert.equal(PARKING_ROAD[2], COUNTRYSIDE.roadHalf);
  assert.ok(PARKING_ROAD[3] <= COUNTRYSIDE.roadLength, 'ruas beraspal tidak melewati ujung jalan tanah');
});

test('parkir villa: semua kawasan di luar kompleks villa dan di dalam batas dunia', () => {
  for (const r of PARKING_KEEP_OUT) {
    assert.ok(r[1] > BOUNDS.maxZ, `${r} di selatan pagar villa`);
    assert.ok(r[0] > WORLD_LIMIT.minX && r[2] < WORLD_LIMIT.maxX && r[1] > WORLD_LIMIT.minZ && r[3] < WORLD_LIMIT.maxZ, `${r} di dalam batas dunia`);
  }
});

test('parkir villa: pohon di luar vila tidak tumbuh di atas parkir, jumlahnya tetap', () => {
  const trees = getVillaWorld().allProps.filter((p) => p.type === 'tree');
  assert.equal(trees.length, COUNTRYSIDE.trees);
  for (const t of trees) assert.ok(!inParkingKeepOut(t.x, t.z, 3), `pohon di (${t.x.toFixed(1)}, ${t.z.toFixed(1)}) menimpa parkir`);
});

test('parkir villa: pemain bisa berjalan dari jalan ke lajur, semua lorong, dan terminal bus (tidak ada penghalang)', () => {
  const world = getVillaWorld();
  const walk = (pts) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
      for (let k = 0; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n;
        const z = a.z + ((b.z - a.z) * k) / n;
        assert.ok(world.canStand(0, x, z), `tidak bisa berdiri di (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
    }
  };
  const guest = guestSlots();
  for (const s of [guest[0], guest[59], guest[60], guest[150], guest[299]]) walk([{ x: 0, z: 96 }, { x: 0, z: GUEST_ENTRY[1] + 3.5 }, ...routeToSlot(s)]);
  for (const s of [guest[0], guest[299]]) walk(routeFromSlot(s));
  const staff = staffSlots();
  for (const s of [staff[0], staff[40], staff[79]]) walk([{ x: 0, z: 96 }, { x: 0, z: STAFF_ENTRY[1] + 3.5 }, { x: s.aisleX, z: STAFF_ENTRY[1] + 3.5 }, { x: s.aisleX, z: s.z }]);
  walk([{ x: 0, z: 96 }, { x: 8, z: 108 }, { x: 8, z: 180 }, { x: 40, z: 188 }]); // lajur layanan sampai lorong bus
});
