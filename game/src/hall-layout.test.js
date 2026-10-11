import assert from 'node:assert/strict';
import test from 'node:test';
import { HALL, SEATS, TABLES, facingAngle, findNearestSeat, resolveCollisions } from './hall-layout.js';
import { cameraRelativeMovement, clampArenaPosition, normalizeMovement } from './game-rules.js';

test('gerak diagonal dinormalisasi dan posisi dibatasi aula', () => {
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
  const table = TABLES[0];
  const out = resolveCollisions({ x: table.x + 0.2, z: table.z });
  assert.ok(Math.hypot(out.x - table.x, out.z - table.z) >= HALL.tableRadius + HALL.playerRadius - 1e-9);
  const exact = resolveCollisions({ x: table.x, z: table.z });
  assert.ok(Math.hypot(exact.x - table.x, exact.z - table.z) >= HALL.tableRadius);
});

test('pelaminan menahan dari depan dan dari samping tanpa melompat', () => {
  const front = resolveCollisions({ x: 0, z: HALL.stage.frontZ - 1 });
  assert.ok(front.z >= HALL.stage.frontZ);
  const side = resolveCollisions({ x: HALL.stage.halfWidth, z: -9.5 });
  assert.ok(side.z === -9.5 && side.x > HALL.stage.halfWidth);
});

test('posisi ekstrem tetap berada di dalam aula', () => {
  const out = resolveCollisions({ x: 1e9, z: 1e9 });
  assert.deepEqual(out, { x: 10.5, z: 10.5 });
});

test('findNearestSeat memilih kursi kosong terdekat dan menghormati jangkauan', () => {
  const seat = SEATS[0];
  assert.equal(findNearestSeat({ x: seat.x + 0.3, z: seat.z })?.id, seat.id);
  assert.notEqual(findNearestSeat({ x: seat.x, z: seat.z }, new Set([seat.id]))?.id, seat.id);
  assert.equal(findNearestSeat({ x: 0, z: 9 }), null);
});

test('gerak relatif kamera: maju selalu menuju arah pandang kamera', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  let m = cameraRelativeMovement({ x: 0, z: -1 }, 0);
  assert.ok(near(m.x, 0) && near(m.z, -1));
  m = cameraRelativeMovement({ x: 0, z: -1 }, Math.PI / 2); // kamera di +x melihat ke -x
  assert.ok(near(m.x, -1) && near(m.z, 0));
  m = cameraRelativeMovement({ x: 1, z: 0 }, Math.PI); // kamera di +z... berbalik: kanan layar = -x dunia
  assert.ok(near(m.x, -1) && near(m.z, 0));
  const diag = cameraRelativeMovement({ x: 0.6, z: 0.8 }, 1.1);
  assert.ok(near(Math.hypot(diag.x, diag.z), 1)); // panjang vektor tidak berubah
});
