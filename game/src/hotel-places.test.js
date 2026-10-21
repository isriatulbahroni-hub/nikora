import test from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_TOP_LEVEL, getHotelWorld, isGuestLevel } from './hotel-layout.js';
import { FLOOR_COLORS, GROUP_ORDER, cssColor, describePlace, featuredLevels, findStandable, hotelPlaces } from './hotel-places.js';

const world = getHotelWorld();
const places = hotelPlaces(world);

test('hotel jelajah: id unik, semua titik bisa diinjak, dan berada di ruang yang dituju', () => {
  assert.equal(new Set(places.map((p) => p.id)).size, places.length);
  for (const p of places) {
    assert.ok(world.canStand(p.level, p.x, p.z), `${p.id} bisa diinjak`);
    assert.ok(GROUP_ORDER.includes(p.group), `${p.id}: kelompok ${p.group}`);
    if (p.id !== 'drop_off' && p.id !== 'parkir_tamu') assert.equal(world.roomAt(p.x, p.z, p.level).id, p.id, `${p.id} di ruangnya`);
  }
});

test('hotel jelajah: lantai pilihan mencakup podium, tiap Sky Lobby, puncak, dan contoh kamar tamu', () => {
  const featured = featuredLevels();
  assert.deepEqual(featured, [...featured].sort((a, b) => a - b), 'urut naik');
  assert.equal(new Set(featured).size, featured.length, 'tanpa duplikat');
  for (const l of [0, 1, 2, 3, 4, 50, 500, 950, HOTEL_TOP_LEVEL - 1, HOTEL_TOP_LEVEL]) assert.ok(featured.includes(l), `lantai ${l}`);
  assert.ok(featured.length < 80, 'menu tidak meledak');
  assert.equal(new Set(places.map((p) => p.level)).size, featured.length, 'setiap lantai pilihan punya tujuan');
  assert.equal(places.filter((p) => p.group === 'Kamar tamu').length, featured.filter(isGuestLevel).length);
});

test('hotel jelajah: fasilitas utama tersedia dan inti/dapur bukan tujuan', () => {
  const ids = new Set(places.map((p) => p.id));
  for (const id of ['drop_off', 'parkir_tamu', 'lobby', 'grand_dining', 'ballroom', 'meeting_center', 'spa', 'indoor_pool', 'gym', 'arcade_shops', 'musholla', 'kids_club', 'cinema', 'game_zone', 'royal_suite', 'presidential_suite', 'sky_lounge', 'infinity_pool']) {
    assert.ok(ids.has(id), id);
  }
  assert.ok(places.some((p) => p.id === 'lobby_l51' && p.level === 50), 'Sky Lobby 1 punya lobi');
  assert.ok(!places.some((p) => p.id.startsWith('core_') || p.id === 'kitchen' || p.id.startsWith('kitchen_')), 'inti dan dapur bukan tujuan');
});

test('hotel jelajah: findStandable menggeser titik yang tertutup perabot dan menolak titik di luar ruang', () => {
  const table = world.levels[1].props.find((p) => p.type === 'table');
  const moved = findStandable(world, 1, table.x, table.z);
  assert.ok(moved && world.canStand(1, moved.x, moved.z));
  assert.notDeepEqual(moved, { x: table.x, z: table.z });
  assert.equal(findStandable(world, 1, 0, 430, 'tidak_ada'), null);
});

test('hotel: describePlace menamai lorong lantai tamu, lobi, halaman, dan teras', () => {
  assert.equal(describePlace(world, 0, 430, 0).id, 'lobby');
  const corridor = describePlace(world, -17, 448, 4);
  assert.equal(corridor.name, 'Lorong');
  assert.equal(corridor.inside, true);
  const yard = describePlace(world, 0, 404, 0);
  assert.equal(yard.inside, false);
  // lantai puncak berdenah menyusut (skala 0,70): teras barat ada di x -25,2..-19,1 dan z 428,4..440
  const terrace = describePlace(world, -22, 432, HOTEL_TOP_LEVEL);
  assert.equal(terrace.kind, 'terrace');
  assert.equal(terrace.indoor, false);
  assert.equal(terrace.inside, true);
});

test('hotel: warna peta ada untuk semua jenis ruang di lantai pilihan', () => {
  const kinds = new Set();
  for (const l of featuredLevels()) for (const r of world.levels[l].rooms) kinds.add(r.kind);
  for (const k of kinds) assert.ok(FLOOR_COLORS[k] !== undefined, `warna ${k}`);
  assert.equal(cssColor(0xd4af37), '#d4af37');
  assert.equal(cssColor(0x0000ff), '#0000ff');
});
