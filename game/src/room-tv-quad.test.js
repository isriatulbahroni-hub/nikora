import test from 'node:test';
import assert from 'node:assert/strict';
import { fitContain, quadToMatrix3d, applyMatrix3d } from './room-tv-quad.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ~ ${b}`);

test('fitContain: video potret/persegi/lebar semuanya muat di layar TV', () => {
  const wide = fitContain(16 / 9);
  near(wide.width, 1.4);
  near(wide.height, 0.7875);
  const portrait = fitContain(9 / 16);
  near(portrait.height, 0.8);
  near(portrait.width, 0.45);
  const ultra = fitContain(3);
  near(ultra.width, 1.4);
  assert.ok(ultra.height < 0.8);
  assert.deepEqual(fitContain(0), { width: 1.4, height: 0.8 });
  assert.deepEqual(fitContain(NaN), { width: 1.4, height: 0.8 });
});

test('quadToMatrix3d: keempat sudut elemen jatuh tepat di sudut layar TV (perspektif)', () => {
  const quad = [[120, 80], [380, 110], [360, 260], [140, 230]];
  const css = quadToMatrix3d(quad, 640, 360);
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
  corners.forEach(([u, v], i) => {
    const [x, y] = applyMatrix3d(css, 640, 360, u, v);
    near(x, quad[i][0], 1e-4);
    near(y, quad[i][1], 1e-4);
  });
});

test('quadToMatrix3d: segi empat lurus (tanpa perspektif) = skala + geser', () => {
  const css = quadToMatrix3d([[10, 20], [110, 20], [110, 76], [10, 76]], 640, 360);
  const [x, y] = applyMatrix3d(css, 640, 360, 0.5, 0.5);
  near(x, 60);
  near(y, 48);
});
