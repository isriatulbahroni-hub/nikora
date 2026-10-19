import test from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_LEVEL_COUNT, getHotelWorld, hotelLevelY } from './hotel-layout.js';
import { FLOOR_COLORS, GROUP_ORDER, PROP_HEIGHT, cssColor, describePlace, findStandable, hotelPlaces } from './hotel-places.js';
import { buildHotelOccluders, doorTop } from './hotel-camera.js';
import { resolveCameraDistance } from './villa-camera.js';

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

test('hotel jelajah: ada tujuan di ke-15 lantai, 9 lantai kamar tamu, dan fasilitas utama', () => {
  assert.equal(new Set(places.map((p) => p.level)).size, HOTEL_LEVEL_COUNT);
  assert.equal(places.filter((p) => p.group === 'Kamar tamu').length, 9);
  const ids = new Set(places.map((p) => p.id));
  for (const id of ['drop_off', 'parkir_tamu', 'lobby', 'grand_dining', 'ballroom', 'meeting_center', 'spa', 'indoor_pool', 'gym', 'arcade_shops', 'musholla', 'kids_club', 'cinema', 'game_zone', 'royal_suite', 'presidential_suite', 'sky_lounge', 'infinity_pool']) {
    assert.ok(ids.has(id), id);
  }
  assert.ok(!places.some((p) => p.id.startsWith('core_') || p.id === 'kitchen'), 'inti dan dapur bukan tujuan');
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
  const terrace = describePlace(world, -31, 430, 14);
  assert.equal(terrace.kind, 'terrace');
  assert.equal(terrace.indoor, false);
  assert.equal(terrace.inside, true);
});

test('hotel: warna lantai ada untuk semua jenis ruang dan tinggi perabot terdefinisi', () => {
  const kinds = new Set();
  for (let l = 0; l < HOTEL_LEVEL_COUNT; l++) for (const r of world.levels[l].rooms) kinds.add(r.kind);
  for (const k of kinds) assert.ok(FLOOR_COLORS[k] !== undefined, `warna ${k}`);
  const types = new Set();
  for (let l = 0; l < HOTEL_LEVEL_COUNT; l++) for (const p of world.levels[l].props) types.add(p.type);
  for (const t of types) assert.ok(PROP_HEIGHT[t] > 0, `tinggi ${t}`);
  assert.equal(cssColor(0xd4af37), '#d4af37');
  assert.equal(cssColor(0x0000ff), '#0000ff');
});

test('hotel kamera: dinding kamar menghalangi, ruang terbuka tidak, dan lantai atas punya pelat', () => {
  const y0 = hotelLevelY(4);
  const boxes = buildHotelOccluders(world, 4);
  assert.ok(boxes.length > 50, `jumlah penghalang ${boxes.length}`);
  for (const b of boxes) assert.ok(b.minX <= b.maxX && b.minY <= b.maxY && b.minZ <= b.maxZ);
  assert.ok(boxes.some((b) => Math.abs(b.maxY - y0) < 1e-9), 'pelat lantai 5');
  const inRoom = resolveCameraDistance({ x: -33, y: y0 + 1.45, z: 425 }, { x: -1, y: 0, z: 0 }, 10, boxes);
  assert.equal(inRoom.blocked, true);
  assert.ok(inRoom.dist < 3, `dinding barat kamar, dist=${inRoom.dist}`);
  // dari halaman menghadap fasad (selatan = +z): dinding lobi masih 15 m di depan, kamera sejauh 6 m tidak terhalang
  const open = resolveCameraDistance({ x: 10, y: 1.45, z: 404 }, { x: 0, y: 0, z: 1 }, 6, buildHotelOccluders(world, 0));
  assert.equal(open.blocked, false);
  assert.ok(doorTop({ tall: true }) > doorTop({}));
});
