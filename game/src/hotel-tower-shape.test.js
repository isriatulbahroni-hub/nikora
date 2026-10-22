import test from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_LEVEL_COUNT, HOTEL_LEVEL_HEIGHT, HOTEL_SITE, HOTEL_TOP_LEVEL, HOTEL_TOP_Y, PODIUM_LEVELS, TOWER_CENTER, hotelFootprint, hotelLevelY } from './hotel-layout.js';
import {
  PANEL_ZONES, TOWER_ZONES, WING_MIN_CLEARANCE, crownSpec, diagridSegments, edgeSegments, podiumWingTriangles, skinRings, skinShape, skinShapeAt, wingReach,
} from './hotel-tower-shape.js';

test('kulit menara: 21 cincin segi delapan dari atas podium sampai atap, makin sempit ke atas', () => {
  const rings = skinRings();
  assert.equal(rings.length, TOWER_ZONES + 1);
  assert.equal(rings[0].y, hotelLevelY(PODIUM_LEVELS));
  assert.equal(rings.at(-1).y, HOTEL_TOP_Y);
  for (const r of rings) assert.equal(r.pts.length, 8);
  for (let i = 1; i < rings.length; i++) {
    assert.ok(rings[i].y > rings[i - 1].y, `cincin ${i} lebih tinggi`);
    assert.ok(rings[i].shape.x1 - rings[i].shape.x0 <= rings[i - 1].shape.x1 - rings[i - 1].shape.x0 + 1e-9, `cincin ${i} tidak lebih lebar`);
  }
  const lebarDasar = rings[0].shape.x1 - rings[0].shape.x0;
  const lebarAtas = rings.at(-1).shape.x1 - rings.at(-1).shape.x0;
  assert.ok(lebarAtas < lebarDasar * 0.8, 'puncak jelas lebih ramping dari dasar');
});

test('kulit menara selalu di luar tapak setiap lantai (tidak memotong ruang), termasuk bidang potong sudut', () => {
  const rings = skinRings();
  for (let l = PODIUM_LEVELS; l < HOTEL_LEVEL_COUNT; l++) {
    const fp = hotelFootprint(l);
    for (const y of [hotelLevelY(l), hotelLevelY(l) + HOTEL_LEVEL_HEIGHT - 1e-6]) {
      const s = skinShapeAt(Math.min(y, HOTEL_TOP_Y), rings);
      assert.ok(s, `ada kulit di y=${y}`);
      assert.ok(s.x0 < fp[0] && s.x1 > fp[2] && s.z0 < fp[1] && s.z1 > fp[3], `lantai ${l}: kulit di luar tapak`);
      // bidang potong tiap sudut (normal diagonal keluar) harus lebih jauh dari sudut tapak
      assert.ok((s.x1 - s.c) - s.z0 > fp[2] - fp[1], `lantai ${l}: sudut timur laut`);
      assert.ok(s.x1 + (s.z1 - s.c) > fp[2] + fp[3], `lantai ${l}: sudut tenggara`);
      assert.ok(-(s.x0 + s.c) + s.z1 > -fp[0] + fp[3], `lantai ${l}: sudut barat daya`);
      assert.ok(-(s.x0 + s.c) - s.z0 > -fp[0] - fp[1], `lantai ${l}: sudut barat laut`);
    }
  }
  for (const fp of [hotelFootprint(0), hotelFootprint(500), hotelFootprint(HOTEL_TOP_LEVEL)]) {
    const s = skinShape(fp);
    assert.ok(2 * s.e - s.c > 0, 'bidang potong sudut berjarak positif dari sudut tapak');
  }
  assert.equal(skinShapeAt(0), null, 'tidak ada kulit di podium');
  assert.equal(skinShapeAt(HOTEL_TOP_Y + 1), null);
});

test('rangka diagonal: dua diagonal per sisi per zona, dan rusuk sudut, semuanya menempel pada kulit', () => {
  const rings = skinRings();
  const dia = diagridSegments(rings);
  assert.equal(dia.length, TOWER_ZONES * 4 * 2);
  const rus = edgeSegments(rings);
  assert.equal(rus.length, TOWER_ZONES * 8);
  for (const s of [...dia, ...rus]) {
    assert.ok(s.b[1] > s.a[1], 'batang naik');
    for (const v of [...s.a, ...s.b]) assert.ok(Number.isFinite(v));
  }
  // dalam satu panel, diagonal pertama naik dari kiri ke kanan dan yang kedua dari kanan ke kiri (bersilang)
  const utara = dia.filter((_, i) => i % 8 < 2).slice(0, PANEL_ZONES * 2);
  assert.equal(utara.length, PANEL_ZONES * 2);
  const naikKanan = utara.filter((_, i) => i % 2 === 0).every((s) => s.b[0] > s.a[0]);
  const naikKiri = utara.filter((_, i) => i % 2 === 1).every((s) => s.b[0] < s.a[0]);
  assert.ok(naikKanan && naikKiri);
});

test('mahkota meruncing ke jarum di atas pusat menara, jarum puncak lebih tinggi dari atap', () => {
  const c = crownSpec();
  assert.equal(c.rings[0].y, HOTEL_TOP_Y);
  for (let i = 1; i < c.rings.length; i++) assert.ok(c.rings[i].y > c.rings[i - 1].y);
  const lebar = (r) => Math.max(...r.pts.map((p) => p[0])) - Math.min(...r.pts.map((p) => p[0]));
  assert.ok(lebar(c.rings.at(-1)) < lebar(c.rings[0]) * 0.4);
  assert.equal(c.spire.x, TOWER_CENTER.x);
  assert.equal(c.spire.z, TOWER_CENTER.z);
  assert.ok(c.tipY > HOTEL_TOP_Y + 400);
});

test('sayap kristal podium: ada, di atas tinggi bebas minimum, dan tidak keluar tapak hotel', () => {
  const tris = podiumWingTriangles();
  assert.ok(tris.length >= 40, `${tris.length} segitiga`);
  const b = hotelFootprint(0);
  const r = wingReach(b);
  assert.ok(r.n > 0 && r.w > 0 && r.e > 0);
  for (const t of tris) {
    assert.equal(t.length, 3);
    for (const [x, y, z] of t) {
      assert.ok(y >= WING_MIN_CLEARANCE - 1e-9, `tinggi bebas ${y}`);
      assert.ok(y <= hotelLevelY(PODIUM_LEVELS), 'tidak lebih tinggi dari atap podium');
      assert.ok(x >= HOTEL_SITE.minX && x <= HOTEL_SITE.maxX && z >= HOTEL_SITE.minZ && z <= HOTEL_SITE.maxZ, `(${x}, ${z}) di dalam tapak`);
    }
  }
});
