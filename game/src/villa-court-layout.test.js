import test from 'node:test';
import assert from 'node:assert/strict';
import { BOUNDS, PLAYER_RADIUS, getVillaWorld, isWalkable } from './villa-layout.js';
import { COURT_MARGIN, VILLA_COURT, createCourtFrame } from './activities/court-frame.js';

const world = getVillaWorld();
const frame = createCourtFrame(VILLA_COURT);
const ok = (x, z) => isWalkable(x, z, PLAYER_RADIUS, world.colliders, BOUNDS);

test('area lapangan bulu tangkis bebas dari pohon palem dan properti', () => {
  const inside = world.props.filter((p) => frame.contains(p, COURT_MARGIN));
  assert.deepEqual(inside, []);
  // pohon lain di dekatnya tetap ada
  assert.ok(world.props.some((p) => p.type === 'palm' && p.x === -36 && p.z === 36));
  assert.ok(world.props.some((p) => p.type === 'palm' && p.x === -18 && p.z === 33));
});

test('seluruh lantai lapangan bisa diinjak kecuali garis net', () => {
  const r = frame.padRect();
  for (let x = r.minX + 0.5; x <= r.maxX - 0.5; x += 0.5) {
    for (let z = r.minZ + 0.5; z <= r.maxZ - 0.5; z += 0.5) {
      if (Math.abs(x - VILLA_COURT.x) < 0.6) continue; // dekat net (pemain berjari-jari 0,4 m)
      assert.ok(ok(x, z), `(${x}, ${z}) terhalang`);
    }
  }
});

test('net menghalangi pemain yang berjalan lurus melintasinya', () => {
  let p = { x: VILLA_COURT.x - 3, z: VILLA_COURT.z };
  for (let i = 0; i < 30; i++) p = world.move(p, 0.5, 0);
  assert.ok(p.x < VILLA_COURT.x, `menembus net, x=${p.x}`);
  assert.ok(p.x > VILLA_COURT.x - 1, 'berhenti di dekat net');
});

test('pemain bisa berjalan memutari net lewat sisi lapangan', () => {
  let p = { x: VILLA_COURT.x - 2, z: VILLA_COURT.z, level: 0, stair: null, y: 0 };
  for (let i = 0; i < 20; i++) p = world.move(p, 0, 0.5); // ke selatan melewati ujung net
  for (let i = 0; i < 20; i++) p = world.move(p, 0.5, 0); // ke timur
  assert.ok(p.x > VILLA_COURT.x + 2, `tidak bisa memutari net, x=${p.x}`);
});

test('lapangan tidak memutus jalur ke bagian lain halaman (dapur tetap terjangkau dari taman)', () => {
  assert.ok(ok(-20, 31), 'sisi timur lapangan bebas');
  assert.ok(ok(-33, 31), 'sisi barat lapangan bebas');
});
