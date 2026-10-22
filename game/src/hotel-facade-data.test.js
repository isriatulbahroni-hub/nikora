import test from 'node:test';
import assert from 'node:assert/strict';
import { FACADE_TEX, facadeLayout, facadeRepeat, facadeSides } from './hotel-facade-data.js';

test('tiang dan pelat tepi tidak pernah lebih tipis dari 8 piksel tekstur (mipmap merata-ratakan, bukan menghilangkan)', () => {
  const l = facadeLayout({ bayWidth: 6, levelHeight: 4, finWidth: 0.001, edgeHeight: 0.001 });
  assert.equal(l.finPx, 8);
  assert.equal(l.edgePx, 8);
  assert.equal(l.size, FACADE_TEX);
});

test('lebar tiang 0,28 m dari bay 6 m dan pelat 0,24 m dari lantai 4 m', () => {
  const l = facadeLayout({ bayWidth: 6, levelHeight: 4, finWidth: 0.28, edgeHeight: 0.24 });
  assert.equal(l.finPx, 24);
  assert.equal(l.edgePx, 31);
  assert.equal(l.paneW + l.finPx, l.size);
  assert.equal(l.paneH + l.edgePx, l.size);
});

test('pengulangan selalu bilangan bulat dan minimal 1', () => {
  assert.deepEqual(facadeRepeat(60, 4000, 6, 4), { u: 10, v: 1000 });
  assert.deepEqual(facadeRepeat(61, 4001, 6, 4), { u: 10, v: 1000 });
  assert.deepEqual(facadeRepeat(1, 1, 6, 4), { u: 1, v: 1 });
});

test('empat sisi menghadap keluar dari pusat bangunan', () => {
  const B = [-30, 430, 30, 470];
  const sides = facadeSides(B);
  assert.equal(sides.length, 4);
  const cx = 0;
  const cz = 450;
  for (const s of sides) {
    // normal bidang (0,0,1) diputar ry mengelilingi sumbu Y: (sin ry, 0, cos ry)
    const nx = Math.sin(s.ry);
    const nz = Math.cos(s.ry);
    const dot = (s.x - cx) * nx + (s.z - cz) * nz;
    assert.ok(dot > 0, `${s.name} harus menghadap keluar`);
  }
  assert.equal(sides[0].length, 60);
  assert.equal(sides[2].length, 40);
});
