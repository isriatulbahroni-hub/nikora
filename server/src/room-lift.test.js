import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVEL_HEIGHT, getVillaWorld } from '../../game/src/villa-layout.js';
import { LIFT, RIDE, installLift, liftSpotFor, rideDuration } from '../../game/src/villa-lift.js';
import { Room } from './room.js';

function setup() {
  const world = installLift(getVillaWorld());
  const room = new Room({ world });
  const p = room.addPlayer('a', 'A');
  Object.assign(p, { x: LIFT.x, z: LIFT.z, level: 0, stair: null, y: 0 });
  return { world, room, p };
}

test('lift: naik ke lantai 3, ketinggian mengikuti jadwal, lalu pemain berdiri di lantai tujuan', () => {
  const { world, room, p } = setup();
  const spot = liftSpotFor(world, 0, 2);
  assert.ok(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 1, sit: spot.id }));
  let t = 1000;
  room.step(0.05, t); // perjalanan dimulai
  assert.equal(p.sit, spot.id);
  assert.equal(p.y, 0);
  t += RIDE.closeMs + RIDE.perLevelMs;
  room.step(0.05, t);
  assert.ok(Math.abs(p.y - LEVEL_HEIGHT) < 1e-6, `setengah jalan di ${p.y}`);
  assert.equal(p.level, 0);
  t += RIDE.perLevelMs + RIDE.openMs + 50;
  room.step(0.05, t);
  assert.equal(p.level, 2);
  assert.equal(p.sit, null);
  assert.ok(Math.abs(p.y - 2 * LEVEL_HEIGHT) < 1e-6);
  assert.equal(room.snapshot()[0].y, +(2 * LEVEL_HEIGHT).toFixed(2));
});

test('lift: pemain tidak bisa digeser oleh input saat naik', () => {
  const { world, room, p } = setup();
  const spot = liftSpotFor(world, 0, 1);
  room.setInput('a', { x: 1, z: 1, rot: 0, seq: 1, sit: spot.id });
  room.step(0.05, 5000);
  room.step(0.05, 5000 + rideDuration(0, 1) / 2);
  assert.equal(p.x, LIFT.x);
  assert.equal(p.z, LIFT.z);
});

test('lift: satu penumpang pada satu waktu', () => {
  const { world, room } = setup();
  const b = room.addPlayer('b', 'B');
  Object.assign(b, { x: LIFT.x, z: LIFT.z, level: 0, stair: null, y: 0 });
  assert.ok(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 1, sit: liftSpotFor(world, 0, 1).id }));
  room.step(0.05, 1000); // perjalanan a dimulai
  assert.equal(room.setInput('b', { x: 0, z: 0, rot: 0, seq: 1, sit: liftSpotFor(world, 0, 2).id }), false);
  assert.equal(b.sit, null);
});

test('lift: titik lift dari lantai lain ditolak', () => {
  const { world, room, p } = setup();
  assert.equal(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 1, sit: liftSpotFor(world, 1, 0).id }), false);
  assert.equal(p.sit, null);
});

test('lift: berdiri di tengah perjalanan membatalkan jadwal', () => {
  const { world, room, p } = setup();
  room.setInput('a', { x: 0, z: 0, rot: 0, seq: 1, sit: liftSpotFor(world, 0, 1).id });
  room.step(0.05, 1000);
  assert.ok(room.setInput('a', { x: 0, z: 0, rot: 0, seq: 2, sit: null }));
  room.step(0.05, 1100);
  assert.equal(p.ride ?? null, null);
  assert.equal(p.sit, null);
  assert.equal(p.level, 0);
});
