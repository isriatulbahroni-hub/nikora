import test from 'node:test';
import assert from 'node:assert/strict';
import { TOWER_CENTER, hotelFootprint } from './hotel-layout.js';
import { crownSpec } from './hotel-tower-shape.js';
import { GLASS_TOP_Y, crownQuads, diagonalUV, quadNormal, skinQuads } from './hotel-tower-skin-data.js';

const center = (q) => {
  const pts = [q.lo[0], q.lo[1], q.hi[1], q.hi[0]];
  return [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / 4);
};

test('skin: 20 zona x 8 bidang, zona atas dipotong di GLASS_TOP_Y', () => {
  const q = skinQuads();
  assert.equal(q.length, 160);
  assert.equal(q.filter((x) => x.main).length, 80);
  assert.ok(Math.abs(GLASS_TOP_Y - 4195.8) < 1e-9);
  const top = q.filter((x) => x.zone === 19);
  assert.ok(top.every((x) => Math.abs(x.hi[0][1] - GLASS_TOP_Y) < 1e-9 && x.vTop > 0.9 && x.vTop < 1));
  assert.ok(q.filter((x) => x.zone < 19).every((x) => x.vTop === 1));
});

test('skin: semua normal menghadap keluar (menjauhi pusat menara) dan hampir horizontal', () => {
  for (const q of [...skinQuads(), ...crownQuads()]) {
    const n = quadNormal(q);
    const c = center(q);
    const out = [c[0] - TOWER_CENTER.x, c[2] - TOWER_CENTER.z];
    assert.ok(n[0] * out[0] + n[2] * out[1] > 0, `bidang ${q.zone ?? q.ring}/${q.edge} menghadap ke dalam`);
    if (q.zone !== undefined) assert.ok(Math.abs(n[1]) < 0.1, 'bidang kulit hampir tegak');
    else assert.ok(n[1] > 0 && n[1] < 0.7, 'bidang mahkota miring ke atas (menyempit)');
  }
});

test('skin: bidang berurutan menyambung (atas zona = bawah zona berikutnya) dan kulit di luar tapak lantai', () => {
  const q = skinQuads();
  for (const a of q) {
    if (a.zone === 19) continue;
    const b = q.find((x) => x.zone === a.zone + 1 && x.edge === a.edge);
    for (let k = 0; k < 2; k++) for (let c = 0; c < 3; c++) assert.ok(Math.abs(a.hi[k][c] - b.lo[k][c]) < 1e-9);
  }
  // titik kulit pada tinggi lantai L selalu di luar tapak lantai itu
  for (const a of q.filter((x) => x.main)) {
    const mid = (a.lo[0][1] + a.hi[0][1]) / 2;
    const L = Math.floor(mid / 4.2);
    const fp = hotelFootprint(L);
    const px = (a.lo[0][0] + a.lo[1][0]) / 2;
    const pz = (a.lo[0][2] + a.lo[1][2]) / 2;
    assert.ok(px <= fp[0] || px >= fp[2] || pz <= fp[1] || pz >= fp[3], `kulit zona ${a.zone} edge ${a.edge} berada di dalam tapak lantai ${L}`);
  }
});

test('mahkota: 2 x 8 bidang dari atap ke ketinggian puncak, menyempit', () => {
  const c = crownQuads();
  assert.equal(c.length, 16);
  assert.equal(c[0].lo[0][1], 4200);
  assert.equal(c.at(-1).hi[0][1], crownSpec().rings.at(-1).y);
  const w = (q) => Math.abs(q.lo[0][0] - q.lo[1][0]) + Math.abs(q.lo[0][2] - q.lo[1][2]);
  assert.ok(w(c[0]) > w(c[8]));
});

test('diagonal: tiap panel menyambung ke panel berikutnya dalam satu sisi', () => {
  for (let p = 0; p < 3; p++) assert.ok(Math.abs(diagonalUV(p)[0].u1 - diagonalUV(p + 1)[0].u0) < 1e-12);
  assert.equal(diagonalUV(3)[0].u1, 1);
  assert.equal(diagonalUV(0)[1].u0, 1);
});
