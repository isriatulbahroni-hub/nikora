import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIFT, RIDE, inCab, installLift, isLiftSpot, liftCameraBoxes, liftColliders, liftProgress, liftRider, liftSpotFor, rideDuration } from './villa-lift.js';
import { LEVEL_HEIGHT, getVillaWorld, resolveMove, PLAYER_RADIUS } from './villa-layout.js';

test('installLift idempoten: kotak tabrakan dan titik lift hanya ditambah sekali', () => {
  const world = getVillaWorld();
  installLift(world);
  const after = world.spots.length;
  installLift(world);
  assert.equal(world.spots.length, after);
  assert.equal(world.spots.filter((s) => s.kind === 'lift').length, 6);
});

test('titik lift: tiap lantai punya dua tujuan, id sama dengan indeksnya', () => {
  const world = installLift(getVillaWorld());
  for (let level = 0; level < 3; level++) {
    for (let to = 0; to < 3; to++) {
      const s = liftSpotFor(world, level, to);
      if (to === level) assert.equal(s, null);
      else {
        assert.equal(world.spots[s.id], s);
        assert.ok(isLiftSpot(world, s.id));
      }
    }
  }
});

test('pemain bisa masuk kabin lewat pintu, tetapi tidak menembus dinding poros', () => {
  const world = installLift(getVillaWorld());
  const front = LIFT.z + LIFT.half + 0.9;
  let p = { x: LIFT.x, z: front, level: 0, stair: null, y: 0 };
  for (let i = 0; i < 40; i++) p = world.move(p, 0, -0.15); // berjalan ke utara melewati bukaan pintu
  assert.ok(inCab(p), `harus berada di kabin, di ${p.x},${p.z}`);
  let q = { x: LIFT.x - 1.0, z: front, level: 0, stair: null, y: 0 };
  for (let i = 0; i < 40; i++) q = world.move(q, 0, -0.15); // di depan dinding samping bukaan pintu: tertahan dinding depan
  assert.ok(!inCab(q));
  assert.ok(q.z > LIFT.z + LIFT.half, 'dinding depan menahan');
});

test('kabin ada di tiap lantai dan bisa diinjak', () => {
  const world = installLift(getVillaWorld());
  for (const level of [0, 1, 2]) assert.ok(world.canStand(level, LIFT.x, LIFT.z), `lantai ${level}`);
});

test('kotak kamera sama dengan kotak tabrakan, setinggi poros', () => {
  const boxes = liftCameraBoxes();
  assert.equal(boxes.length, liftColliders().length);
  for (const b of boxes) assert.ok(b.maxY > 10 && b.minY === 0);
});

test('liftProgress: tutup, naik, tiba, buka', () => {
  const a = liftProgress(0, 2, 0);
  assert.equal(a.door, 1);
  assert.equal(a.y, 0);
  const closed = liftProgress(0, 2, RIDE.closeMs);
  assert.equal(closed.door, 0);
  const mid = liftProgress(0, 2, RIDE.closeMs + RIDE.perLevelMs);
  assert.ok(Math.abs(mid.y - LEVEL_HEIGHT) < 1e-9, 'setengah jalan = lantai 2');
  assert.equal(mid.level, 0);
  const arrived = liftProgress(0, 2, RIDE.closeMs + 2 * RIDE.perLevelMs);
  assert.equal(arrived.level, 2);
  assert.ok(Math.abs(arrived.y - 2 * LEVEL_HEIGHT) < 1e-9);
  assert.equal(arrived.done, false);
  const end = liftProgress(0, 2, rideDuration(0, 2));
  assert.equal(end.done, true);
  assert.equal(end.door, 1);
});

test('liftProgress turun: y menurun mulus dan tidak pernah melewati ujung', () => {
  let last = Infinity;
  for (let t = 0; t <= rideDuration(2, 0); t += 50) {
    const r = liftProgress(2, 0, t);
    assert.ok(r.y <= last + 1e-9);
    assert.ok(r.y >= 0 && r.y <= 2 * LEVEL_HEIGHT);
    last = r.y;
  }
});

test('liftRider mengenali pemain lain di lift, bukan diri sendiri', () => {
  const world = installLift(getVillaWorld());
  const spot = liftSpotFor(world, 0, 1);
  const players = [{ id: 'a', sit: spot.id }, { id: 'b', sit: null }, { id: 'c', sit: 0 }];
  assert.equal(liftRider(world, players, 'b').id, 'a');
  assert.equal(liftRider(world, players, 'a'), null);
});

test('resolveMove dasar: pemain tidak bisa menembus kotak poros', () => {
  const [back] = liftColliders();
  const r = resolveMove({ x: LIFT.x, z: back.maxZ - 0.05 }, PLAYER_RADIUS, [back]);
  assert.ok(r.z >= back.maxZ + PLAYER_RADIUS - 1e-6);
});
