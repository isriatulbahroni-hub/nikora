import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAMES, GAME_DOORS, GAME_ROOMS, GAME_WING, gameRoomAllowed, gameRoomFor, insideGameWing,
} from './villa-gamewing.js';
import { BOUNDS, DOORS, PLAYER_RADIUS, ROOMS, getVillaWorld, isWalkable, roomAt, sameVoiceSpace } from './villa-layout.js';

const world = getVillaWorld();
const walk = (p, dx, dz, n) => {
  let cur = p;
  for (let i = 0; i < n; i++) cur = world.move(cur, dx, dz);
  return cur;
};
const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

test('ruang game ada di semua tempat acara kecuali masjid', () => {
  assert.equal(gameRoomAllowed('villa'), true);
  assert.equal(gameRoomAllowed('royal'), true);
  assert.equal(gameRoomAllowed('hall'), true);
  assert.equal(gameRoomAllowed('masjid'), false);
});

test('tiap permainan punya ruangan sendiri, dan ruangannya terdaftar di denah villa', () => {
  for (const [id, g] of Object.entries(GAMES)) {
    const room = gameRoomFor(id);
    assert.ok(room, `permainan ${id} tidak punya ruangan`);
    assert.equal(room.id, g.room);
    assert.ok(ROOMS.some((r) => r.id === room.id), `${room.id} tidak ada di ROOMS`);
  }
  const ids = GAME_ROOMS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(GAME_ROOMS.every((r) => r.kind === 'game'));
});

test('sayap ruang game di dalam pagar, tidak menimpa ruangan lain', () => {
  const [x1, z1, x2, z2] = GAME_WING.rect;
  assert.ok(x1 > BOUNDS.minX + 2 && x2 < BOUNDS.maxX && z1 > BOUNDS.minZ && z2 < BOUNDS.maxZ - 1.5, 'terlalu dekat pagar');
  for (const g of GAME_ROOMS) {
    assert.ok(g.rect[0] >= x1 && g.rect[2] <= x2 && g.rect[1] >= z1 && g.rect[3] <= z2, `${g.id} keluar dari sayap`);
    for (const r of ROOMS.filter((q) => q.kind !== 'game')) assert.ok(!overlap(g.rect, r.rect), `${g.id} menimpa ${r.id}`);
  }
  for (let i = 0; i < GAME_ROOMS.length; i++) for (let j = i + 1; j < GAME_ROOMS.length; j++) assert.ok(!overlap(GAME_ROOMS[i].rect, GAME_ROOMS[j].rect));
});

test('pintu ruang game terdaftar di DOORS dan bisa dilewati', () => {
  for (const d of GAME_DOORS) {
    assert.ok(DOORS.some((q) => q.x === d.x && q.z === d.z && q.orient === d.orient), `pintu (${d.x},${d.z}) tidak terdaftar`);
    assert.ok(isWalkable(d.x, d.z, PLAYER_RADIUS, world.colliders, BOUNDS), `pintu (${d.x},${d.z}) terhalang`);
  }
});

test('pohon palem tidak tumbuh di dalam sayap ruang game', () => {
  for (const p of world.props.filter((q) => q.type === 'palm')) assert.ok(!insideGameWing(p.x, p.z, 0.9), `palem di (${p.x},${p.z}) di dalam sayap`);
});

test('masuk dari taman lewat lobi, lalu ke ruang bulu tangkis dan ruang horor', () => {
  let p = { x: -24, z: 29, level: 0, stair: null, y: 0 };
  p = walk(p, 0, 0.1, 50); // masuk lewat pintu utara lobi
  assert.ok(p.z > 33, `tidak bisa masuk lewat pintu lobi, z=${p.z}`);
  assert.equal(roomAt(p.x, p.z).id, 'game_lobby');

  const toWest = walk({ x: -26, z: 35.25, level: 0, stair: null, y: 0 }, -0.1, 0, 70);
  assert.ok(toWest.x < -32, `tidak bisa ke ruang bulu tangkis, x=${toWest.x}`);
  assert.equal(roomAt(toWest.x, toWest.z).id, 'game_badminton');

  const toEast = walk({ x: -26, z: 35.25, level: 0, stair: null, y: 0 }, 0.1, 0, 70);
  assert.ok(toEast.x > -20, `tidak bisa ke ruang horor, x=${toEast.x}`);
  assert.equal(roomAt(toEast.x, toEast.z).id, 'game_horror');
});

test('dinding sayap menahan pemain dari luar (satu-satunya jalan masuk lewat lobi)', () => {
  const west = walk({ x: -39.5, z: 35, level: 0, stair: null, y: 0 }, 0.1, 0, 40);
  assert.ok(west.x < -38, `menembus dinding barat, x=${west.x}`);
  const east = walk({ x: -12, z: 35, level: 0, stair: null, y: 0 }, -0.1, 0, 40);
  assert.ok(east.x > -14, `menembus dinding timur, x=${east.x}`);
  const south = walk({ x: -18, z: 40.8, level: 0, stair: null, y: 0 }, 0, -0.1, 40);
  assert.ok(south.z > 39.5, `menembus dinding selatan, z=${south.z}`);
});

test('roomAt dan suara: tiap ruang game terpisah', () => {
  assert.equal(roomAt(-34, 35).name, 'Ruang Bulu Tangkis');
  assert.equal(roomAt(-26, 35).name, 'Lobi Ruang Game');
  assert.equal(roomAt(-18, 35).name, 'Ruang Mansion Horor');
  assert.equal(roomAt(-18, 35).indoor, true);
  assert.equal(sameVoiceSpace({ x: -34, z: 35 }, { x: -18, z: 35 }), false, 'dua ruang game berbeda tidak saling dengar');
  assert.equal(sameVoiceSpace({ x: -26, z: 34 }, { x: -25, z: 36 }), true, 'satu lobi');
});
