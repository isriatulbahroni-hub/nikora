// Tes terhadap denah hotel sungguhan: kamar tamu di lantai atas, bioskop, restoran, Sky Level.
// Berkas ini hanya jalan di dalam repo (memakai hotel-layout.js dan hotel-props.js asli).
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOTEL_LEVEL_HEIGHT, getHotelWorld } from './hotel-layout.js';
import { PROP_DEFS } from './hotel-props.js';
import { wallToRect } from './villa-layout.js';
import { LEVEL_HEIGHT, SEAT_SPECS, SPOTS_PER_LEVEL, spotById, spotsInRoom, spotsOfLevel } from './hotel-seating.js';

const world = getHotelWorld();
const SAMPLE = [0, 1, 2, 3, 4, 49, 50, 51, 300, 301, 997, 998, 999];
const GUEST_SAMPLE = [4, 5, 49, 51, 301, 601, 997]; // kelipatan 50 = Sky Lobby (bukan kamar tamu)

test('tinggi lantai sama dengan hotel-layout', () => {
  assert.equal(LEVEL_HEIGHT, HOTEL_LEVEL_HEIGHT);
});

test('semua jenis di katalog dudukan ada di katalog perabot', () => {
  for (const type of Object.keys(SEAT_SPECS)) assert.ok(PROP_DEFS[type], `perabot ${type} tidak ada di hotel-props.js`);
});

test('setiap kamar tamu punya tempat tidur; hampir semuanya juga punya tempat duduk', () => {
  for (const level of GUEST_SAMPLE) {
    const data = world.levels[level];
    const rooms = data.rooms.filter((r) => r.kind === 'guest');
    assert.ok(rooms.length > 0, `lantai ${level + 1} tanpa kamar tamu`);
    let withSeat = 0;
    for (const room of rooms) {
      const spots = spotsInRoom(data, room.id);
      assert.ok(spots.some((s) => s.kind === 'sleep'), `${room.id}: tidak ada tempat tidur`);
      if (spots.some((s) => s.kind === 'sit')) withSeat += 1;
    }
    assert.ok(withSeat / rooms.length >= 0.8, `lantai ${level + 1}: hanya ${withSeat}/${rooms.length} kamar punya tempat duduk`);
  }
});

test('lantai publik punya tempat duduk dan tidak ada yang terpotong batas id', () => {
  for (const level of SAMPLE) {
    const { list } = spotsOfLevel(world.levels[level]);
    assert.ok(list.length < SPOTS_PER_LEVEL, `lantai ${level + 1}: ${list.length} titik (batas ${SPOTS_PER_LEVEL})`);
    assert.equal(new Set(list.map((s) => s.id)).size, list.length);
    if (level < 4) assert.ok(list.some((s) => s.kind === 'sit'), `lantai ${level + 1} tanpa tempat duduk`);
  }
});

test('id titik bisa dibaca kembali dari denah', () => {
  for (const level of SAMPLE) {
    const { list } = spotsOfLevel(world.levels[level]);
    for (const s of list.filter((_, i) => i % 37 === 0)) assert.equal(spotById(s.id, (l) => world.levels[l]), s);
  }
});

test('panggul/badan tidak berada di dalam dinding; tiap titik tidur punya tempat berdiri bebas', () => {
  for (const level of SAMPLE) {
    const data = world.levels[level];
    const walls = data.walls.map(wallToRect);
    let blockedSit = 0;
    let sits = 0;
    for (const s of spotsOfLevel(data).list) {
      const inWall = walls.some((w) => s.pose.x > w.minX && s.pose.x < w.maxX && s.pose.z > w.minZ && s.pose.z < w.maxZ);
      assert.ok(!inWall, `lantai ${level + 1}: ${s.type} di ${s.room} berada di dalam dinding`);
      const free = s.exits.some((e) => world.canStand(level, e.x, e.z) && world.roomAt(e.x, e.z, level).id === s.room); // sama dengan hotel-main.js
      if (s.kind === 'sleep') assert.ok(free, `lantai ${level + 1}: tidak ada tempat berdiri di sisi ${s.type} ${s.room}`);
      else {
        sits += 1;
        if (!free) blockedSit += 1;
      }
    }
    if (sits) assert.ok(blockedSit / sits < 0.05, `lantai ${level + 1}: ${blockedSit}/${sits} tempat duduk tanpa tempat berdiri`);
  }
});
