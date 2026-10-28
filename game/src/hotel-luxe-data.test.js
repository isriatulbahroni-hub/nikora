import test from 'node:test';
import assert from 'node:assert/strict';
import { LAMP_COLOR, PROP_TYPES } from './hotel-props.js';
import { LUX_MATS, chandelier, chandelierSpots, doorTrim, floorStyle, isGrandKind, propLuxParts, reskin, wallArt, wallTrim } from './hotel-luxe-data.js';
import { getHotelWorld, isGuestLevel } from './hotel-layout.js';

const finite = (q, keys) => keys.every((k) => Number.isFinite(q[k]));

test('perabot mewah: semua jenis punya bagian sah dengan bahan dikenal; lampu dasar tidak digambar dua kali', () => {
  for (const type of PROP_TYPES) {
    const parts = propLuxParts({ type, x: 0, z: 0, ry: 0, w: type === 'bar_counter' ? 8 : undefined });
    for (const q of parts) {
      assert.ok(finite(q, ['dx', 'dy', 'dz', 'sx', 'sy', 'sz', 'color']) && q.sx > 0 && q.sy > 0 && q.sz > 0, `${type}: ukuran`);
      assert.ok(LUX_MATS.includes(q.mat), `${type}: bahan ${q.mat}`);
    }
  }
  assert.equal(propLuxParts({ type: 'ceiling_lamp', x: 0, z: 0 }).length, 0, 'lampu langit-langit digambar hotel-world.js');
  assert.ok(propLuxParts({ type: 'bed' }).length >= 10, 'tempat tidur utama: kepala ranjang beludru, bantal, meja samping');
  assert.ok(propLuxParts({ type: 'sofa' }).some((q) => q.mat === 'gold') && propLuxParts({ type: 'sofa' }).some((q) => q.mat === 'velvet'));
});

test('reskin: warna katalog diganti palet mewah, lampu tetap menyala', () => {
  assert.equal(reskin(0xc9a24b).mat, 'gold');
  assert.equal(reskin(0x23395b).mat, 'velvet');
  assert.equal(reskin(LAMP_COLOR).mat, 'light');
  assert.deepEqual(reskin(0x123456), { color: 0x123456, mat: 'matte' });
});

test('gaya lantai: ruang tamu karpet, lobi marmer, lantai dasar menurut jenis lantai', () => {
  assert.equal(floorStyle('guest').tex, 'carpet');
  assert.equal(floorStyle('lobby').tex, 'marble');
  assert.equal(floorStyle('restaurant').tex, 'parquet');
  assert.equal(floorStyle('base', true).tex, 'carpet');
  assert.equal(floorStyle('base', false).tex, 'marble');
  assert.equal(floorStyle('pool'), null);
});

test('lampu gantung: hanya ruang besar, titik di dalam ruang, bagian sah', () => {
  assert.deepEqual(chandelierSpots([0, 0, 5, 20]), []);
  const spots = chandelierSpots([0, 0, 30, 24]);
  assert.ok(spots.length >= 4);
  for (const s of spots) assert.ok(s.x > 0 && s.x < 30 && s.z > 0 && s.z < 24 && s.s >= 0.8 && s.s <= 1.6);
  const parts = chandelier(10, 10, 1, 0, 3.9);
  assert.ok(parts.length >= 20 && parts.every((q) => finite(q, ['x', 'y', 'z', 'sx', 'sy', 'sz']) && q.y + q.sy / 2 <= 3.95 && q.y - q.sy / 2 >= 2.1));
  assert.ok(parts.some((q) => q.mat === 'light') && parts.some((q) => q.mat === 'gold'));
});

test('lantai nyata: panel dinding, bingkai pintu, dan lukisan sah di lantai lobi dan lantai tamu', () => {
  const world = getHotelWorld();
  for (const l of [0, 1, 150, 500].filter((n) => n < world.levels.length)) {
    const L = world.levels[l];
    const F = [-300, -300, 300, 300]; // tapak lebar: tidak ada dinding yang dianggap kulit luar
    const trim = wallTrim(L.walls, F, 0);
    assert.ok(trim.gold.length > 0 && trim.wood.length > 0 && trim.matte.length > 0, `lantai ${l}`);
    for (const q of [...trim.gold, ...trim.wood, ...trim.matte, ...doorTrim(L.doors, 0)]) assert.ok(finite(q, ['x', 'y', 'z', 'sx', 'sy', 'sz']) && q.sx > 0 && q.sy > 0 && q.sz > 0);
    const art = wallArt(L.rooms, L.doors, L.props, 0);
    assert.equal(art.frames.length, art.canvas.length);
    assert.equal(art.frames.length, art.lights.length);
    if (isGuestLevel(l)) assert.ok(art.frames.length >= 1, 'kamar tamu: lukisan di atas ranjang');
  }
  assert.ok(isGrandKind('lobby') && !isGrandKind('guest') && !isGrandKind('kitchen'));
});
