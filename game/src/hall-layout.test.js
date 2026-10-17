import assert from 'node:assert/strict';
import test from 'node:test';
import { HALL, SEATS, TABLES, POOLS, BRIDGES, facingAngle, findNearestSeat, isWalkable, resolveCollisions } from './hall-layout.js';
import { cameraRelativeMovement, clampArenaPosition, normalizeMovement } from './game-rules.js';

test('gerak diagonal dinormalisasi dan posisi dibatasi', () => {
  const movement = normalizeMovement(1, 1);
  assert.ok(Math.abs(Math.hypot(movement.x, movement.z) - 1) < 1e-10);
  assert.deepEqual(clampArenaPosition({ x: 99, z: -99 }, 10), { x: 10, z: -10 });
});

test('setiap meja punya 6 kursi yang menghadap meja', () => {
  assert.equal(SEATS.length, TABLES.length * HALL.seatsPerTable);
  for (const seat of SEATS) {
    const table = TABLES[seat.table];
    assert.ok(Math.abs(Math.hypot(seat.x - table.x, seat.z - table.z) - HALL.seatRadius) < 1e-9);
    assert.ok(Math.abs(seat.rot - facingAngle(table.x - seat.x, table.z - seat.z)) < 1e-9);
  }
  assert.equal(new Set(SEATS.map((s) => s.id)).size, SEATS.length);
});

test('pemain tidak bisa masuk ke meja', () => {
  for (const table of TABLES) {
    const out = resolveCollisions({ x: table.x + 0.2, z: table.z });
    assert.ok(Math.hypot(out.x - table.x, out.z - table.z) >= HALL.tableRadius + HALL.playerRadius - 1e-9);
  }
  const exact = resolveCollisions({ x: TABLES[5].x, z: TABLES[5].z });
  assert.ok(Math.hypot(exact.x - TABLES[5].x, exact.z - TABLES[5].z) >= HALL.tableRadius);
});

test('pelaminan menahan dari depan dan dari samping tanpa melompat', () => {
  const front = resolveCollisions({ x: 0, z: HALL.stage.frontZ - 1 });
  assert.ok(front.z >= HALL.stage.frontZ);
  const side = resolveCollisions({ x: HALL.stage.halfWidth, z: -19 });
  assert.ok(side.z === -19 && side.x > HALL.stage.halfWidth);
});

test('posisi ekstrem tetap berada di dalam dunia', () => {
  assert.deepEqual(resolveCollisions({ x: 1e9, z: 1e9 }), { x: HALL.bounds.maxX, z: HALL.bounds.maxZ });
  assert.deepEqual(resolveCollisions({ x: NaN, z: Infinity }).x, 0);
});

test('findNearestSeat memilih kursi kosong terdekat dan menghormati jangkauan', () => {
  const seat = SEATS[0];
  assert.equal(findNearestSeat({ x: seat.x + 0.3, z: seat.z })?.id, seat.id);
  assert.notEqual(findNearestSeat({ x: seat.x, z: seat.z }, new Set([seat.id]))?.id, seat.id);
  assert.equal(findNearestSeat({ x: 0, z: 9 }), null);
});

test('kolam menahan pemain; jembatan boleh dilewati', () => {
  for (const pool of POOLS) {
    const mid = { x: (pool.x0 + pool.x1) / 2, z: pool.z1 - 1.0 };
    assert.equal(isWalkable(mid.x, mid.z), false, `tengah kolam ${pool.id} tidak boleh diinjak`);
  }
  for (const b of BRIDGES) assert.ok(isWalkable((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2), `jembatan ${b.id} bisa diinjak`);
});

test('titik masuk (spawn server) bisa diinjak dan semua kursi terjangkau dari sana', () => {
  for (let n = 0; n < 50; n += 1) {
    assert.ok(isWalkable(((n % 7) - 3) * 1.1, 9.4 - Math.floor((n / 7) % 8) * 0.6), `spawn ${n}`);
  }
  const step = 0.25;
  const { minX, maxX, minZ, maxZ } = HALL.bounds;
  const nx = Math.round((maxX - minX) / step) + 1;
  const nz = Math.round((maxZ - minZ) / step) + 1;
  const walk = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i += 1) for (let j = 0; j < nz; j += 1) walk[i + j * nx] = isWalkable(minX + i * step, minZ + j * step) ? 1 : 0;
  const seen = new Uint8Array(nx * nz);
  const start = [Math.round((0 - minX) / step), Math.round((9.4 - minZ) / step)];
  const stack = [start];
  seen[start[0] + start[1] * nx] = 1;
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const k = a + b * nx;
      if (seen[k] || !walk[k]) continue;
      seen[k] = 1;
      stack.push([a, b]);
    }
  }
  for (const seat of SEATS) {
    assert.ok(isWalkable(seat.x, seat.z), `kursi ${seat.id} berdiri di penghalang`);
    const i = Math.round((seat.x - minX) / step);
    const j = Math.round((seat.z - minZ) / step);
    assert.ok(seen[i + j * nx], `kursi ${seat.id} tidak terjangkau dari pintu masuk`);
  }
});

test('gerak relatif kamera: maju selalu menuju arah pandang kamera', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  let m = cameraRelativeMovement({ x: 0, z: -1 }, 0);
  assert.ok(near(m.x, 0) && near(m.z, -1));
  m = cameraRelativeMovement({ x: 0, z: -1 }, Math.PI / 2); // kamera di +x melihat ke -x
  assert.ok(near(m.x, -1) && near(m.z, 0));
  m = cameraRelativeMovement({ x: 1, z: 0 }, Math.PI); // kamera berbalik: kanan layar = -x dunia
  assert.ok(near(m.x, -1) && near(m.z, 0));
  const diag = cameraRelativeMovement({ x: 0.6, z: 0.8 }, 1.1);
  assert.ok(near(Math.hypot(diag.x, diag.z), 1)); // panjang vektor tidak berubah
});
