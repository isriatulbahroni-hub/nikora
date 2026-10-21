import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DESIGN, POOL_CAPTURE_RANGE, POOL_DESIGNS, designOf, footprintDistance, isOverPool, selectCapturePool, underwaterMix } from './pool-water-logic.js';

const pool = { id: 'a', x: 0, y: 0, z: 0, width: 12, depth: 8 };

test('footprintDistance: 0 di dalam dan di sudut, jarak ke tepi di luar', () => {
  assert.equal(footprintDistance(pool, 0, 0), 0);
  assert.equal(footprintDistance(pool, 6, 4), 0);
  assert.equal(footprintDistance(pool, 9, 8), 5); // 3 m dari tepi timur, 4 m dari tepi selatan
  assert.equal(isOverPool(pool, 5.9, -3.9), true);
  assert.equal(isOverPool(pool, 6.1, 0), false);
});

test('underwaterMix: 0 di atas air atau di luar denah, naik halus ke 1 di bawah permukaan', () => {
  assert.equal(underwaterMix(pool, { x: 0, y: 1.6, z: 0 }), 0);
  assert.equal(underwaterMix(pool, { x: 0, y: -0.5, z: 0 }), 1);
  assert.equal(underwaterMix(pool, { x: 20, y: -0.5, z: 0 }), 0); // di bawah tinggi air tapi di luar kolam
  assert.ok(Math.abs(underwaterMix(pool, { x: 0, y: -0.06, z: 0 }) - 0.5) < 1e-9);
});

test('selectCapturePool: memilih kolam terdekat, menolak yang jauh atau bila kamera di bawah air', () => {
  const a = { id: 'a', x: 0, y: 0, z: 0, width: 12, depth: 8 };
  const b = { id: 'b', x: 40, y: 0, z: 0, width: 12, depth: 8 };
  assert.equal(selectCapturePool([a, b], { x: 30, y: 2, z: 0 }).id, 'b');
  assert.equal(selectCapturePool([a, b], { x: -3, y: 2, z: 0 }).id, 'a');
  assert.equal(selectCapturePool([a, b], { x: 200, y: 2, z: 0 }), null);
  assert.equal(selectCapturePool([a, b], { x: 0, y: -1, z: 0 }), null); // di bawah air: tidak ada pantulan
  assert.equal(selectCapturePool([a, b], { x: 0, y: 0.01, z: 0 }), null); // tepat di permukaan
  assert.equal(selectCapturePool([], { x: 0, y: 2, z: 0 }), null);
  assert.ok(POOL_CAPTURE_RANGE > 0);
});

test('selectCapturePool: seri jarak dimenangkan kolam yang lebih dulu di daftar', () => {
  const a = { id: 'a', x: -20, y: 0, z: 0, width: 12, depth: 8 };
  const b = { id: 'b', x: 20, y: 0, z: 0, width: 12, depth: 8 };
  assert.equal(selectCapturePool([a, b], { x: 0, y: 1, z: 0 }).id, 'a');
  assert.equal(selectCapturePool([b, a], { x: 0, y: 1, z: 0 }).id, 'b');
});

test('selectCapturePool: kolam di lantai berbeda dihitung dari tinggi permukaannya', () => {
  const low = { id: 'low', x: 0, y: 0, z: 0, width: 10, depth: 10 };
  const high = { id: 'high', x: 0, y: 8.4, z: 0, width: 10, depth: 10 };
  assert.equal(selectCapturePool([low, high], { x: 0, y: 10, z: 0 }).id, 'high');
  assert.equal(selectCapturePool([low, high], { x: 0, y: 3, z: 0 }).id, 'low');
});

test('POOL_DESIGNS: minimal empat desain, semuanya lengkap dan warnanya berbeda', () => {
  const names = Object.keys(POOL_DESIGNS);
  assert.ok(names.length >= 4);
  for (const name of names) {
    const d = POOL_DESIGNS[name];
    for (const key of ['shallow', 'deep', 'tile']) assert.ok(Number.isInteger(d[key]) && d[key] >= 0 && d[key] <= 0xffffff, `${name}.${key}`);
    assert.ok(d.opacity > 0 && d.opacity <= 1, `${name}.opacity`);
    assert.ok(d.ripple > 0, `${name}.ripple`);
  }
  assert.equal(new Set(names.map((n) => POOL_DESIGNS[n].shallow)).size, names.length);
  assert.equal(designOf('tidak-ada'), POOL_DESIGNS[DEFAULT_DESIGN]);
});
