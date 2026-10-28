import test from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_TOP_LEVEL, SKY_WALK, getHotelWorld, hotelFootprint, hotelLevelY, hotelRoomsAtLevel, roomAt } from './hotel-layout.js';
import { SKY_WALK_LEVEL, SKY_WALK_REACH, SKY_WALK_WIDTH, inSkyWalk, skyWalkSpec } from './hotel-skywalk.js';
import { hotelPlaces } from './hotel-places.js';
import { PLAYER_RADIUS } from './villa-layout.js';

const TOP = HOTEL_TOP_LEVEL;
const world = getHotelWorld();
const walk = (pos, dx, dz, steps) => {
  let p = pos;
  for (let i = 0; i < steps; i++) p = world.move(p, dx, dz);
  return p;
};

test('sky walk: di Sky Level, menjorok ke barat dari tepi tapak puncak, dan menempel di teras Infinity Pool', () => {
  const fp = hotelFootprint(TOP);
  assert.equal(SKY_WALK_LEVEL, TOP);
  assert.equal(SKY_WALK.level, TOP);
  assert.ok(Math.abs(SKY_WALK.outer[2] - fp[0]) < 1e-9, 'dek mulai tepat di tepi barat tapak');
  assert.ok(Math.abs(fp[0] - SKY_WALK.outer[0] - SKY_WALK_REACH) < 1e-9, 'menjorok sejauh SKY_WALK_REACH');
  assert.ok(Math.abs(SKY_WALK.z[1] - SKY_WALK.z[0] - SKY_WALK_WIDTH) < 1e-9, 'selebar SKY_WALK_WIDTH');
  const pool = hotelRoomsAtLevel(TOP).find((r) => r.id === 'infinity_pool');
  assert.ok(pool, 'Infinity Pool ada di Sky Level');
  assert.ok(Math.abs(pool.rect[0] - fp[0]) < 1e-6, 'teras Infinity Pool berbatasan dengan tepi barat tapak');
  assert.ok(SKY_WALK.z[0] > pool.rect[1] && SKY_WALK.z[1] < pool.rect[3], 'pintu keluar dek ada di sisi barat Infinity Pool');
});

test('sky walk: skyWalkSpec dan inSkyWalk murni dan hanya berlaku di lantai puncak', () => {
  const spec = skyWalkSpec([-50, 100, 50, 200], 150);
  assert.deepEqual([...spec.outer], [-50 - SKY_WALK_REACH, 150 - SKY_WALK_WIDTH / 2, -50, 150 + SKY_WALK_WIDTH / 2]);
  assert.ok(spec.rect[2] > spec.outer[2], 'area injak masuk sedikit ke tapak supaya jalan dari teras tidak putus');
  assert.ok(inSkyWalk(spec, SKY_WALK_LEVEL, spec.center.x, spec.center.z));
  assert.ok(!inSkyWalk(spec, SKY_WALK_LEVEL - 1, spec.center.x, spec.center.z), 'bukan di lantai lain');
  assert.ok(!inSkyWalk(spec, SKY_WALK_LEVEL, spec.rect[0] - 0.1, spec.center.z), 'di luar ujung dek');
  assert.ok(!inSkyWalk(spec, SKY_WALK_LEVEL, spec.rect[0] + 0.1, spec.center.z, 0.4), 'jari-jari pemain dihitung');
  assert.ok(inSkyWalk(spec, SKY_WALK_LEVEL, spec.rect[0] + 0.5, spec.center.z, 0.4));
});

test('sky walk: dari tengah dek tidak bisa melewati ujung barat dan sisi utara/selatan', () => {
  const c = { x: SKY_WALK.center.x, z: SKY_WALK.center.z, level: TOP };
  assert.ok(world.canStand(TOP, c.x, c.z), 'tengah dek bisa diinjak');
  const west = walk(c, -0.1, 0, 400);
  assert.ok(west.x >= SKY_WALK.outer[0] && west.x < SKY_WALK.outer[0] + PLAYER_RADIUS + 0.2, `ujung barat x=${west.x.toFixed(2)}`);
  assert.equal(west.y, hotelLevelY(TOP));
  const north = walk(c, 0, -0.1, 300);
  assert.ok(north.z >= SKY_WALK.z[0] && north.z < SKY_WALK.z[0] + PLAYER_RADIUS + 0.2, `sisi utara z=${north.z.toFixed(2)}`);
  const south = walk(c, 0, 0.1, 300);
  assert.ok(south.z <= SKY_WALK.z[1] && south.z > SKY_WALK.z[1] - PLAYER_RADIUS - 0.2, `sisi selatan z=${south.z.toFixed(2)}`);
});

test('sky walk: dari dek bisa berjalan kembali ke teras Infinity Pool (tanpa celah di sambungan)', () => {
  const fp = hotelFootprint(TOP);
  let reached = null;
  for (let z = SKY_WALK.z[0] + 1; z <= SKY_WALK.z[1] - 1; z += 0.5) {
    const start = { x: SKY_WALK.center.x, z, level: TOP };
    if (!world.canStand(TOP, start.x, start.z)) continue;
    const end = walk(start, 0.1, 0, 300);
    if (end.x > fp[0] + 1) {
      reached = end;
      break;
    }
  }
  assert.ok(reached, 'ada jalur dari dek masuk ke teras');
  assert.equal(roomAt(reached.x, reached.z, TOP).id, 'infinity_pool');
});

test('sky walk: roomAt menamai dek (di luar ruangan) dan hanya di lantai puncak', () => {
  const { x, z } = SKY_WALK.center;
  const here = roomAt(x, z, TOP);
  assert.equal(here.id, 'sky_walk');
  assert.equal(here.kind, 'terrace');
  assert.equal(here.indoor, false);
  assert.equal(here.name, 'Sky Walk · Dek Kaca');
  assert.equal(roomAt(x, z, TOP - 1).id, 'grounds');
  assert.ok(!world.canStand(TOP - 1, x, z), 'di lantai 999 tidak ada dek');
});

test('sky walk: masuk menu Jelajah dan titiknya bisa diinjak di dek', () => {
  const p = hotelPlaces(world).find((q) => q.id === 'sky_walk');
  assert.ok(p, 'ada di menu Jelajah');
  assert.equal(p.level, TOP);
  assert.ok(world.canStand(p.level, p.x, p.z));
  assert.equal(roomAt(p.x, p.z, p.level).id, 'sky_walk');
});
