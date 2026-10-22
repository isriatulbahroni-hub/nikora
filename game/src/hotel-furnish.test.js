import test from 'node:test';
import assert from 'node:assert/strict';
import { LAMP_COLOR, PROP_DEFS, PROP_TYPES, propHalf, propParts, propRect } from './hotel-props.js';
import { FACE, doorKeepouts, furnishGuest, furnishLevel, guestFrame } from './hotel-furnish.js';
import { GUESTS_PER_LEVEL, getHotelWorld, hotelRoomsAtLevel, isGuestLevel } from './hotel-layout.js';
import { wallToRect } from './villa-layout.js';

const world = getHotelWorld();
const overlap = (a, b, m = 0) => a.minX < b.maxX - m && a.maxX > b.minX + m && a.minZ < b.maxZ - m && a.maxZ > b.minZ + m;
const SAMPLE = [0, 1, 2, 3, 4, 5, 49, 50, 100, 150, 200, 300, 500, 700, 950, 997, 998, 999];
const GUEST_SAMPLE = SAMPLE.filter(isGuestLevel);

test('katalog perabot: ukuran, bagian, dan tabrakan masuk akal', () => {
  assert.ok(PROP_TYPES.length >= 55);
  for (const [type, def] of Object.entries(PROP_DEFS)) {
    assert.ok(def.hx > 0 && def.hz > 0, `${type}: ukuran`);
    assert.equal(typeof def.solid, 'boolean', `${type}: solid`);
    const parts = propParts({ type, x: 0, z: 0, ry: 0 });
    if (type !== 'bed') assert.ok(parts.length > 0, `${type}: punya bagian`);
    for (const q of parts) {
      for (const k of ['dx', 'dy', 'dz', 'sx', 'sy', 'sz', 'color']) assert.ok(Number.isFinite(q[k]), `${type}.${k}`);
      assert.ok(q.sx > 0 && q.sy > 0 && q.sz > 0, `${type}: ukuran bagian`);
    }
  }
  const sofa = propRect({ type: 'sofa', x: 0, z: 0, ry: 0 });
  assert.ok(Math.abs(sofa.maxX - 1.1) < 1e-9 && Math.abs(sofa.maxZ - 0.5) < 1e-9);
  const turned = propRect({ type: 'sofa', x: 0, z: 0, ry: Math.PI / 2 });
  assert.ok(Math.abs(turned.maxX - 0.5) < 1e-9 && Math.abs(turned.maxZ - 1.1) < 1e-9, 'diputar 90 derajat menukar sumbu');
  assert.deepEqual(propHalf({ type: 'stage', w: 10, d: 3 }), { hx: 5, hz: 1.5 });
  assert.ok(propParts({ type: 'ceiling_lamp' }).every((q) => q.color === LAMP_COLOR));
});

test('doorKeepouts: jalur pintu dan lorong antar dua pintu lebar', () => {
  const rect = [0, 0, 20, 20];
  const keep = doorKeepouts(rect, [{ orient: 'h', x: 10, z: 0, width: 4 }, { orient: 'h', x: 11, z: 20, width: 4 }, { orient: 'h', x: 3, z: 0, width: 3 }]);
  assert.ok(keep.some((k) => k.minX <= 10 && k.maxX >= 11 && k.minZ <= 0 && k.maxZ >= 20), 'lorong penuh dari pintu ke pintu');
  assert.ok(keep.length >= 4);
  assert.deepEqual(doorKeepouts(rect, [{ orient: 'h', x: 5, z: 7, width: 2 }]), [], 'pintu di luar tepi ruang diabaikan');
});

test('kamar tamu: lengkap di semua jenis lantai, termasuk kamar sempit di lantai atas', () => {
  const need = ['toilet', 'vanity', 'shower', 'wardrobe', 'tv_unit', 'ac_unit', 'ceiling_lamp'];
  for (const l of GUEST_SAMPLE) {
    const rooms = hotelRoomsAtLevel(l);
    const guests = rooms.filter((r) => r.kind === 'guest');
    assert.equal(guests.length, GUESTS_PER_LEVEL, `lantai ${l}`);
    const fl = furnishLevel({ rooms, doors: [] });
    assert.equal(fl.rooms.length, GUESTS_PER_LEVEL, `lantai ${l}: sekat kamar mandi tiap kamar`);
    assert.equal(fl.doors.length, GUESTS_PER_LEVEL, `lantai ${l}: pintu kamar mandi tiap kamar`);
    for (const g of guests) {
      const types = new Set(fl.props.filter((p) => p.room === g.id).map((p) => p.type));
      for (const t of need) assert.ok(types.has(t), `${g.id} (lantai ${l}) punya ${t}`);
      assert.ok(types.has('bed') || types.has('bed_s'), `${g.id} punya tempat tidur`);
    }
  }
});

test('kamar tamu: tempat tidur dan unit TV/AC/lampu bertanda untuk kontrol, kepala tempat tidur di dinding belakang', () => {
  const cell = hotelRoomsAtLevel(5).find((r) => r.kind === 'guest');
  const { props } = furnishGuest(cell);
  for (const tag of ['bed', 'tv', 'ac', 'light']) assert.ok(props.some((p) => p.tag === tag), tag);
  const f = guestFrame(cell);
  const bed = props.find((p) => p.tag === 'bed');
  const head = { x: bed.x - Math.sin(bed.ry), z: bed.z - Math.cos(bed.ry) }; // -z lokal = kepala
  const toDoor = Math.hypot(head.x - cell.door.x, head.z - cell.door.z);
  const footDoor = Math.hypot(bed.x + Math.sin(bed.ry) - cell.door.x, bed.z + Math.cos(bed.ry) - cell.door.z);
  assert.ok(toDoor > footDoor, 'kepala lebih jauh dari pintu daripada kaki');
  assert.ok(f.D > 5 && f.W > 3);
  assert.equal(Math.abs(Math.cos(f.ry('in') - bed.ry)) > 0.99, true, 'kaki tempat tidur ke arah pintu (sejajar sumbu masuk)');
});

test('perabot: di dalam ruangnya, tidak saling menimpa, tidak menembus dinding, tipe dikenal', () => {
  for (const l of SAMPLE) {
    const L = world.levels[l];
    const walls = L.walls.map(wallToRect);
    const solids = [];
    for (const p of L.props) {
      const def = PROP_DEFS[p.type];
      assert.ok(def, `${l}: tipe ${p.type}`);
      assert.equal(p.level, l);
      const room = L.rooms.find((r) => r.id === p.room);
      assert.ok(room, `${l}: ruang ${p.room}`);
      if (def.wall || def.flat) continue;
      const q = propRect(p);
      assert.ok(q.minX >= room.rect[0] - 0.01 && q.maxX <= room.rect[2] + 0.01 && q.minZ >= room.rect[1] - 0.01 && q.maxZ <= room.rect[3] + 0.01, `${l}: ${p.type} di ${p.room} di dalam ruangnya`);
      if (!def.solid) continue;
      for (const w of walls) assert.ok(!overlap(q, w, 0.03), `${l}: ${p.type} di ${p.room} menembus dinding`);
      solids.push({ p, q });
    }
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) assert.ok(!overlap(solids[i].q, solids[j].q, 0.03), `${l}: ${solids[i].p.type} menimpa ${solids[j].p.type} di ${solids[i].p.room}`);
    }
  }
});

test('kamar tamu: jalur dari pintu ke dalam kamar bebas, dan sekat kamar mandi punya pintu yang bisa dilewati', () => {
  for (const l of GUEST_SAMPLE) {
    const L = world.levels[l];
    for (const g of L.rooms.filter((r) => r.kind === 'guest')) {
      const f = guestFrame(g);
      for (const v of [0.5, 1.2, 2.0]) {
        const p = f.toWorld(0, v);
        assert.ok(world.canStand(l, p.x, p.z), `${g.id}: jalur masuk v=${v}`);
      }
    }
    // tiap pintu sekat kamar mandi lebih kecil dari pintu kamar dan ada di daftar pintu lantai
    const bathDoors = L.doors.filter((d) => d.width < 1);
    assert.equal(bathDoors.length, GUESTS_PER_LEVEL, `lantai ${l}`);
  }
});

test('fasilitas publik: tiap ruang podium dan Sky Lobby punya perabot khasnya', () => {
  const expect = {
    0: { lobby: ['desk', 'sofa'], concierge: ['desk'], lobby_cafe: ['table'], grand_dining: ['table', 'chair', 'buffet'], specialty_dining: ['table'], kitchen: ['kitchen_counter'] },
    1: { ballroom: ['stage', 'table', 'chair'], bridal_suite: ['bed', 'dresser'], foyer: ['sofa'], meeting_center: ['conf_table', 'chair'], business_center: ['work_desk'], catering: ['kitchen_counter'] },
    2: { spa: ['massage_bed', 'tub'], sauna: ['sauna_bench'], salon: ['salon_chair'], indoor_pool: ['lounger'], gym: ['treadmill'], yoga: ['rug'] },
    3: { arcade_shops: ['gondola'], musholla: ['mihrab', 'rug'], kids_club: ['play_house'], cinema: ['cinema_seat', 'screen'], game_zone: ['arcade'], library: ['shelf'] },
  };
  for (const [level, rooms] of Object.entries(expect)) {
    const L = world.levels[Number(level)];
    for (const [id, types] of Object.entries(rooms)) {
      const got = new Set(L.props.filter((p) => p.room === id).map((p) => p.type));
      for (const t of types) assert.ok(got.has(t), `lantai ${Number(level) + 1}: ${id} punya ${t}`);
    }
  }
  // Sky Lobby memakai tata letak podium dengan id ber-akhiran lantai
  const sky = world.levels[50].props.filter((p) => p.room === 'lobby_l51').map((p) => p.type);
  assert.ok(sky.includes('desk'), 'Sky Lobby 1 punya meja resepsionis');
  assert.ok(world.levels[1].props.some((p) => p.type === 'table'), 'ballroom punya meja jamuan (dipakai menu Jelajah)');
});

test('suite dan Sky Level: suite punya tempat tidur, Sky Lounge punya bar', () => {
  const suite = world.levels[998].props.filter((p) => p.room === 'sultan_suite').map((p) => p.type);
  assert.ok(suite.includes('bed'), 'Sultan Penthouse punya tempat tidur');
  const lounge = world.levels[999].props.filter((p) => p.room === 'sky_lounge').map((p) => p.type);
  assert.ok(lounge.includes('bar_counter'), 'Sky Lounge punya bar');
  assert.ok(world.levels[999].props.some((p) => p.room === 'infinity_pool' && p.type === 'lounger'), 'kolam infinity punya lounger');
});

test('jalur lobi ke inti tetap bebas walau lobi penuh perabot', () => {
  let pos = { x: 0, z: 414, level: 0 };
  for (let i = 0; i < 150; i++) pos = world.move(pos, 0, 0.2);
  assert.ok(pos.z > 441, `sampai inti, z=${pos.z}`);
  assert.ok(FACE.S === 0 && FACE.N > 3);
});
