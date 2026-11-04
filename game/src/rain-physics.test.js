import test from 'node:test';
import assert from 'node:assert/strict';
import { RAIN_BOX, createDrops, rainCount, seedDrops, stepDrops, streakTail, windAt } from './rain-physics.js';
import { HOTEL_CANOPY } from './hotel-layout.js';

const mk = (x, y, z, v = 10) => {
  const d = createDrops(1);
  d.x[0] = x; d.y[0] = y; d.z[0] = z; d.v[0] = v;
  return d;
};

test('tetes yang menembus kanopi memercik di atap dan lahir lagi di atas', () => {
  const d = mk(0, 6.5, 445);
  const out = stepDrops(d, 1, 0.1, { c: { x: 0, y: 0, z: 445 }, groundY: 0 });
  assert.equal(out.length, 1);
  assert.ok(Math.abs(out[0].y - HOTEL_CANOPY.height) < 1e-6);
  assert.ok(d.y[0] > 10, 'lahir lagi di bagian atas kotak');
});

test('di area terbuka tetes memercik di tanah', () => {
  const d = mk(0, 0.5, 420);
  const out = stepDrops(d, 1, 0.1, { c: { x: 0, y: 0, z: 420 }, groundY: 0 });
  assert.equal(out.length, 1);
  assert.equal(out[0].y, 0);
});

test('di bawah kanopi tidak ada tetes: dibuang diam-diam tanpa percikan', () => {
  const d = mk(0, 3, 445);
  const out = stepDrops(d, 1, 0.1, { c: { x: 0, y: 0, z: 445 }, groundY: 0 });
  assert.equal(out.length, 0);
  assert.ok(d.y[0] > 10);
});

test('angin menggeser tetes dan kotak hujan membungkus di tepinya', () => {
  const d = mk(0, 10, 420);
  stepDrops(d, 1, 0.1, { c: { x: 0, y: 0, z: 420 }, groundY: 0, wind: { x: 5, z: 0 } });
  assert.ok(Math.abs(d.x[0] - 0.5) < 1e-3);
  assert.ok(Math.abs(d.y[0] - 9) < 1e-3);
  const e = mk(RAIN_BOX.R - 0.1, 10, 420);
  stepDrops(e, 1, 0.1, { c: { x: 0, y: 0, z: 420 }, groundY: 0, wind: { x: 2, z: 0 } });
  assert.ok(Math.abs(e.x[0] - (-RAIN_BOX.R + 0.1)) < 1e-3, `x = ${e.x[0]}`);
});

test('tetes di dalam benda (mobil yang dikendarai) dibuang', () => {
  const d = mk(0, 10, 420);
  stepDrops(d, 1, 0.1, { c: { x: 0, y: 0, z: 420 }, groundY: 0, cull: () => true });
  assert.ok(d.y[0] > 10);
});

test('seedDrops menebar tetes di dalam kotak', () => {
  const d = createDrops(50);
  seedDrops(d, { x: 100, y: 0, z: 200 }, 0);
  for (let i = 0; i < 50; i++) {
    assert.ok(Math.abs(d.x[i] - 100) <= RAIN_BOX.R && Math.abs(d.z[i] - 200) <= RAIN_BOX.R);
    assert.ok(d.y[i] >= 0 && d.y[i] <= RAIN_BOX.H);
  }
});

test('jumlah tetes naik dengan intensitas dan lebih sedikit di mode hemat', () => {
  assert.equal(rainCount(0), 0);
  assert.ok(rainCount(0.3) < rainCount(0.6) && rainCount(0.6) < rainCount(1));
  assert.ok(rainCount(1, { low: true }) < rainCount(1));
  assert.equal(rainCount(5), rainCount(1));
});

test('angin makin kencang saat hujan deras dan diredam saat 4D mati', () => {
  const calm = windAt(10, 0);
  const storm = windAt(10, 1);
  assert.ok(storm.speed > calm.speed);
  assert.ok(Math.abs(windAt(10, 1, 0.35).speed - storm.speed * 0.35) < 1e-9);
  assert.ok(storm.gust >= 0 && storm.gust <= 1);
});

test('guratan tetes memanjang berlawanan arah gerak dan tidak melebihi batas', () => {
  const t = streakTail({ x: 0, y: -10, z: 0 });
  assert.ok(t.y > 0 && Math.abs(t.x) < 1e-9);
  const fast = streakTail({ x: 0, y: -10, z: -80 });
  assert.ok(Math.hypot(fast.x, fast.y, fast.z) <= 3 + 1e-9);
  assert.ok(fast.z > 0, 'mobil maju (z negatif): tetes terlihat menyilang ke belakang');
  assert.deepEqual(streakTail({ x: 0, y: 0, z: 0 }), { x: 0, y: 0.3, z: 0 });
});
