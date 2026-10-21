import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOTEL_BUILDING, HOTEL_CORE, LIFTS, TOWER_CENTER, TOWER_HALF, GUESTS_PER_LEVEL, getHotelWorld, hotelRoomsAtLevel, hotelFootprint, isGuestLevel,
} from './hotel-layout.js';

const EPS = 1e-6;
const inside = (r, x, z, eps = EPS) => x >= r[0] - eps && x <= r[2] + eps && z >= r[1] - eps && z <= r[3] + eps;

test('denah dasar: tapak, inti, dan lift diturunkan dari pusat dan setengah-ukuran menara', () => {
  const { x: cx, z: cz } = TOWER_CENTER;
  const { x: hx, z: hz } = TOWER_HALF;
  assert.deepEqual([...HOTEL_BUILDING], [cx - hx, cz - hz, cx + hx, cz + hz]);
  assert.deepEqual([...hotelFootprint(0)], [...HOTEL_BUILDING]);
  assert.equal((HOTEL_CORE[0] + HOTEL_CORE[2]) / 2, cx, 'inti sepusat dengan menara (x)');
  assert.equal((HOTEL_CORE[1] + HOTEL_CORE[3]) / 2, cz, 'inti sepusat dengan menara (z)');
  assert.equal(HOTEL_CORE[2] - HOTEL_CORE[0], 16);
  assert.equal(HOTEL_CORE[3] - HOTEL_CORE[1], 16);
  for (const l of LIFTS) assert.ok(inside(HOTEL_CORE, l.rect[0], l.rect[1]) && inside(HOTEL_CORE, l.rect[2], l.rect[3]), `${l.id} di dalam inti`);
});

test('denah dasar: jumlah kamar per lantai mengikuti ukuran denah (12+12+5+5)', () => {
  assert.equal(GUESTS_PER_LEVEL, 34);
  for (const l of [4, 5, 49, 51, 333, 501, 997]) {
    assert.ok(isGuestLevel(l), `lantai ${l} lantai tamu`);
    assert.equal(hotelRoomsAtLevel(l).filter((r) => r.kind === 'guest').length, GUESTS_PER_LEVEL, `lantai ${l}`);
  }
});

test('lantai tamu: pintu kamar di tepi kamarnya, tempat tidur di dalam kamarnya, dan pintu ada di daftar pintu lantai itu', () => {
  const w = getHotelWorld();
  for (const l of [4, 5, 49, 51, 333, 501, 997]) {
    const L = w.levels[l];
    const guests = L.rooms.filter((r) => r.kind === 'guest');
    assert.equal(guests.length, GUESTS_PER_LEVEL, `lantai ${l}`);
    for (const g of guests) {
      assert.ok(inside(g.rect, g.door.x, g.door.z), `pintu ${g.id} di tepi kamar (lantai ${l})`);
      assert.ok(inside(g.rect, g.bed.x, g.bed.z), `tempat tidur ${g.id} di dalam kamar (lantai ${l})`);
      assert.ok(L.doors.some((d) => Math.abs(d.x - g.door.x) < EPS && Math.abs(d.z - g.door.z) < EPS && d.orient === g.door.orient), `pintu ${g.id} terdaftar (lantai ${l})`);
      assert.ok(L.props.some((p) => p.type === 'bed' && Math.abs(p.x - g.bed.x) < EPS && Math.abs(p.z - g.bed.z) < EPS), `tempat tidur ${g.id} terdaftar (lantai ${l})`);
    }
  }
});

test('lantai publik: semua pintu dan perabot berada di dalam tapak lantainya', () => {
  const w = getHotelWorld();
  for (const l of [0, 1, 2, 3, 50, 100, 500, 950, 998, 999]) {
    const fp = hotelFootprint(l);
    for (const d of w.levels[l].doors) assert.ok(inside(fp, d.x, d.z), `pintu (${d.x}, ${d.z}) di lantai ${l}`);
    for (const p of w.levels[l].props) assert.ok(inside(fp, p.x, p.z), `${p.type} (${p.x}, ${p.z}) di lantai ${l}`);
  }
});
