import test from 'node:test';
import assert from 'node:assert/strict';
import { GATES, HIGHWAY_SEGMENTS } from './highway.js';
import { HOTEL_SITE, TOWER_CENTER } from './hotel-layout.js';
import { ARENA, CITY_HEIGHTS, CITY_TINTS, FIELD, RING_OUTER, SATELLITES, SURROUND_BOUNDS, TILE_HEIGHT, cityBuildings, forestTrees, isClear } from './hotel-surroundings-data.js';

const rectOf = (x, z, hw, hd) => [x - hw, z - hd, x + hw, z + hd];
const overlaps = (a, b, m = 0) => a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m;
const roadRects = [...HIGHWAY_SEGMENTS.map((s) => s.rect), ...GATES.map((g) => g.rect), RING_OUTER];
const fieldRect = rectOf(FIELD.x, FIELD.z, FIELD.width / 2, FIELD.depth / 2);

test('tapak hotel ada di dalam persegi luar Lingkar (jadi ikut terlarang)', () => {
  assert.ok(HOTEL_SITE.minX >= RING_OUTER[0] && HOTEL_SITE.maxX <= RING_OUTER[2]);
  assert.ok(HOTEL_SITE.minZ >= RING_OUTER[1] && HOTEL_SITE.maxZ <= RING_OUTER[3]);
});

test('menara satelit: jauh dari jalan, Lingkar, dan gerbang, tidak saling tumpang, dan lebih rendah dari menara utama', () => {
  assert.equal(SATELLITES.length, 5);
  for (const s of SATELLITES) {
    const foot = rectOf(s.x, s.z, s.radius, s.radius);
    for (const r of roadRects) assert.ok(!overlaps(foot, r, 8), `${s.id} terlalu dekat jalan/Lingkar`);
    assert.ok(s.height > 300 && s.height < 4200, `${s.id} tinggi masuk akal`);
    assert.equal(s.sides, 12);
    assert.ok(s.taper > 0.5 && s.taper < 1);
  }
  for (let i = 0; i < SATELLITES.length; i++) for (let j = i + 1; j < SATELLITES.length; j++) {
    const a = SATELLITES[i];
    const b = SATELLITES[j];
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > a.radius + b.radius + 40, `${a.id} dan ${b.id} berdekatan`);
  }
});

test('arena dan lapangan: tidak menimpa jalan atau Lingkar, dan tidak saling tumpang', () => {
  const arenaRect = rectOf(ARENA.x, ARENA.z, ARENA.plaza, ARENA.plaza);
  for (const r of roadRects) {
    assert.ok(!overlaps(arenaRect, r, 6), 'paving arena menimpa jalan');
    assert.ok(!overlaps(fieldRect, r, 6), 'lapangan menimpa jalan');
  }
  const nx = Math.max(fieldRect[0], Math.min(ARENA.x, fieldRect[2]));
  const nz = Math.max(fieldRect[1], Math.min(ARENA.z, fieldRect[3]));
  assert.ok(Math.hypot(ARENA.x - nx, ARENA.z - nz) > ARENA.plaza, 'paving arena menimpa lapangan');
  assert.ok(ARENA.domeHeight > 0 && ARENA.wallHeight > 0);
});

test('kota: deterministik, cukup banyak, di dalam batas, tinggi kelipatan dua lantai', () => {
  const a = cityBuildings();
  assert.equal(cityBuildings(), a, 'hasil di-cache dan sama');
  assert.ok(a.length > 130, `ada ${a.length} gedung`);
  for (const h of CITY_HEIGHTS) assert.ok(Math.abs(h / TILE_HEIGHT - Math.round(h / TILE_HEIGHT)) < 1e-9, `${h} kelipatan ${TILE_HEIGHT}`);
  for (const b of a) {
    assert.ok(b.x > SURROUND_BOUNDS.minX - 20 && b.x < SURROUND_BOUNDS.maxX + 20 && b.z > SURROUND_BOUNDS.minZ - 20 && b.z < SURROUND_BOUNDS.maxZ + 20);
    assert.equal(b.height, CITY_HEIGHTS[b.bucket]);
    assert.ok(b.tint >= 0 && b.tint < CITY_TINTS.length);
    assert.ok(b.w >= 16 && b.w <= 28 && b.d >= 16 && b.d <= 28);
  }
});

test('kota: tidak ada gedung di jalan, Lingkar, gerbang, satelit, arena, lapangan, atau gedung lain', () => {
  const a = cityBuildings();
  const rects = a.map((b) => rectOf(b.x, b.z, b.w / 2, b.d / 2));
  rects.forEach((r, i) => {
    for (const rr of roadRects) assert.ok(!overlaps(r, rr, 10), `gedung ${i} terlalu dekat jalan`);
    assert.ok(isClear(r), `gedung ${i} menimpa satelit/arena/lapangan`);
    assert.ok(!overlaps(r, fieldRect, 10));
    for (let j = i + 1; j < rects.length; j++) assert.ok(!overlaps(r, rects[j], 2), `gedung ${i} dan ${j} bertumpuk`);
  });
});

test('kota: gedung dekat menara hotel lebih tinggi daripada yang jauh', () => {
  const dist = (b) => Math.hypot(b.x - TOWER_CENTER.x, b.z - TOWER_CENTER.z);
  const avg = (xs) => xs.reduce((s, b) => s + b.height, 0) / xs.length;
  const near = cityBuildings().filter((b) => dist(b) < 300);
  const far = cityBuildings().filter((b) => dist(b) > 430);
  assert.ok(near.length > 5 && far.length > 5);
  assert.ok(avg(near) > avg(far) * 1.4, `dekat ${avg(near).toFixed(0)} m, jauh ${avg(far).toFixed(0)} m`);
});

test('hutan kota: deterministik, banyak, dan tidak menimpa jalan atau gedung', () => {
  const t = forestTrees();
  assert.equal(forestTrees(), t);
  assert.ok(t.length > 300, `ada ${t.length} pohon`);
  const buildings = cityBuildings().map((b) => rectOf(b.x, b.z, b.w / 2, b.d / 2));
  for (const p of t) {
    const foot = rectOf(p.x, p.z, p.crown, p.crown);
    for (const r of roadRects) assert.ok(!overlaps(foot, r, 0), 'pohon di jalan');
    assert.ok(isClear(foot), 'pohon menimpa satelit/arena/lapangan');
    assert.ok(!buildings.some((b) => overlaps(b, foot)), 'pohon di dalam gedung');
    assert.ok(p.trunk > 2 && p.crown >= 3 && p.tone >= 0 && p.tone < 5);
  }
});
