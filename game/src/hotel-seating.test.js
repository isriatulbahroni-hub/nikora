import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVATAR, LEVEL_HEIGHT, SEAT_SPECS, SPOTS_PER_LEVEL, SPOT_BASE, TUNING,
  findNearestSpot, isSpotId, poseOfSpot, sitLegs, spotById, spotsInRoom, spotsOfLevel, spotsOfProp, standPoint, toWorld,
} from './hotel-seating.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const front = (ry) => ({ x: Math.sin(ry), z: Math.cos(ry) }); // depan perabot di dunia
const forwardOfAvatar = (rotY) => ({ x: -Math.sin(rotY), z: -Math.cos(rotY) }); // depan avatar: -z, berputar rotation.y
const headOfLying = (rotY) => ({ x: Math.sin(rotY), z: Math.cos(rotY) }); // tilt +90: kepala ke +z avatar yang sudah diputar

test('toWorld: putaran ry sama dengan hotel-furnish (depan lokal +z menghadap sesuai FACE)', () => {
  const p = { x: 10, z: 20, ry: Math.PI / 2 }; // timur
  const f = toWorld(p, 0, 1);
  near(f.x, 11);
  near(f.z, 20);
  const r = toWorld(p, 1, 0); // kanan lokal -> selatan? (x*cos, -x*sin) = (0, -1)
  near(r.x, 10);
  near(r.z, 19);
});

test('duduk: avatar menghadap ke depan perabot di semua arah', () => {
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7, -2.1]) {
    const [s] = spotsOfProp({ type: 'armchair', x: 5, z: 5, ry, level: 3, room: 'r' });
    const a = forwardOfAvatar(s.pose.rotY);
    const f = front(ry);
    near(a.x, f.x);
    near(a.z, f.z);
    assert.equal(s.pose.tilt, 0);
  }
});

test('duduk: panggul di depan sandaran, tinggi mengikuti permukaan dan lantai', () => {
  const [s] = spotsOfProp({ type: 'chair', x: 10, z: 20, ry: 0, level: 5, room: 'r' });
  near(s.pose.x, 10);
  near(s.pose.z, 20 - 0.185 + TUNING.pelvisDepth);
  near(s.pose.y, 5 * LEVEL_HEIGHT + 0.48 - TUNING.humanSitDrop);
  // kalibrasi villa: permukaan 0,545 -> y asal -0,3
  near(0.545 - TUNING.humanSitDrop, -0.3, 0.006);
});

test('sofa dua tempat berdampingan, kursi malas satu, bangku bioskop tiga di bangku gereja', () => {
  assert.equal(spotsOfProp({ type: 'sofa', x: 0, z: 0, ry: 0, level: 0 }).length, 2);
  assert.equal(spotsOfProp({ type: 'armchair', x: 0, z: 0, ry: 0, level: 0 }).length, 1);
  assert.equal(spotsOfProp({ type: 'pew', x: 0, z: 0, ry: 0, level: 0 }).length, 3);
  const [a, b] = spotsOfProp({ type: 'sofa', x: 0, z: 0, ry: 0, level: 0 });
  assert.ok(Math.abs(a.x - b.x) >= 0.9);
});

test('bangku sauna: jumlah tempat mengikuti lebar', () => {
  assert.equal(spotsOfProp({ type: 'sauna_bench', x: 0, z: 0, ry: 0, w: 6, d: 0.7, level: 0 }).length, 8);
  assert.equal(spotsOfProp({ type: 'sauna_bench', x: 0, z: 0, ry: 0, w: 2, d: 0.7, level: 0 }).length, 2);
});

test('sitLegs: telapak tepat menapak lantai untuk tinggi dudukan wajar', () => {
  for (const top of [0.45, 0.48, 0.53, 0.6, 0.65, 0.68]) {
    const { hip, knee } = sitLegs(top);
    assert.equal(knee, -hip);
    const sole = top + TUNING.hipRadius - (AVATAR.thigh * Math.cos(hip) + AVATAR.shank + AVATAR.sole);
    near(sole, 0, 1e-9);
  }
  assert.equal(sitLegs(0.2).hip, TUNING.legMax); // terlalu rendah: dijepit, tidak ekstrem
  assert.equal(sitLegs(0.9).hip, TUNING.legMin); // terlalu tinggi: dijepit
});

test('tidur: kepala tepat di bantal, kepala ke sisi -z perabot, telentang', () => {
  const p = { type: 'bed', x: 30, z: 40, ry: Math.PI / 2, level: 12, room: 'h13_01' };
  const spots = spotsOfProp(p);
  assert.equal(spots.length, 2); // dua bantal
  for (const [i, lx] of [-0.46, 0.46].entries()) {
    const s = spots[i];
    assert.equal(s.kind, 'sleep');
    near(s.pose.tilt, Math.PI / 2);
    near(s.pose.y, 12 * LEVEL_HEIGHT + 0.74 + TUNING.lieHalfThick);
    const head = headOfLying(s.pose.rotY);
    const wantHead = front(p.ry); // kepala = -depan
    near(head.x, -wantHead.x);
    near(head.z, -wantHead.z);
    // pusat kepala = asal + arah kepala * 1,55 harus jatuh di pusat bantal
    const pillow = toWorld(p, lx, -0.78);
    near(s.pose.x + head.x * AVATAR.headY, pillow.x, 1e-9);
    near(s.pose.z + head.z * AVATAR.headY, pillow.z, 1e-9);
  }
});

test('tempat tidur kecil dengan lebar 1,6 m dua orang; sempit satu orang; tempat pijat dan kursi malas satu', () => {
  assert.equal(spotsOfProp({ type: 'bed_s', x: 0, z: 0, ry: 0, w: 1.6, level: 4 }).length, 2);
  assert.equal(spotsOfProp({ type: 'bed_s', x: 0, z: 0, ry: 0, w: 1.0, level: 4 }).length, 1);
  assert.equal(spotsOfProp({ type: 'massage_bed', x: 0, z: 0, ry: 0, level: 2 }).length, 1);
  assert.equal(spotsOfProp({ type: 'lounger', x: 0, z: 0, ry: 0, level: 999 }).length, 1);
});

test('tubuh berbaring tetap di dalam kasur: kaki tidak melewati ujung kasur', () => {
  for (const type of ['bed', 'bed_s', 'massage_bed', 'lounger']) {
    const p = { type, x: 0, z: 0, ry: 0, w: 1.6, level: 4 };
    for (const s of spotsOfProp(p)) {
      const half = SEAT_SPECS[type](p).half;
      assert.ok(s.pose.z <= half.hz + 0.1, `${type}: kaki di z=${s.pose.z}`);
    }
  }
});

test('id: bulat, unik, lantai-sadar, bulak-balik; id mobil bukan titik', () => {
  const levels = new Map();
  const levelOf = (n) => {
    if (!levels.has(n)) levels.set(n, { level: n, props: [{ type: 'sofa', x: 0, z: 0, ry: 0, room: 'a' }, { type: 'bed', x: 5, z: 5, ry: 0, room: 'b' }, { type: 'chair', x: 9, z: 9, ry: 0, room: 'a' }] });
    return levels.get(n);
  };
  const seen = new Set();
  for (const n of [0, 3, 500, 999]) {
    for (const s of spotsOfLevel(levelOf(n)).list) {
      assert.ok(Number.isInteger(s.id) && s.id >= SPOT_BASE);
      assert.ok(!seen.has(s.id));
      seen.add(s.id);
      assert.equal(spotById(s.id, levelOf), s);
      assert.equal(s.level, n);
    }
  }
  assert.equal(spotById(1003, levelOf), null);
  assert.equal(isSpotId(1003), false);
  assert.equal(spotById(SPOT_BASE + 1000 * SPOTS_PER_LEVEL, levelOf), null);
  assert.equal(spotById(SPOT_BASE + 4 * SPOTS_PER_LEVEL + 5000, levelOf), null); // indeks di luar daftar
  assert.ok(SPOT_BASE + 999 * SPOTS_PER_LEVEL + SPOTS_PER_LEVEL < 2 ** 31);
});

test('lantai dengan ribuan kursi tidak melebihi batas id', () => {
  const props = Array.from({ length: 9000 }, (_, i) => ({ type: 'cinema_seat', x: i, z: 0, ry: 0, room: 'c' }));
  const { list } = spotsOfLevel({ level: 3, props });
  assert.equal(list.length, SPOTS_PER_LEVEL);
  assert.equal(new Set(list.map((s) => s.id)).size, SPOTS_PER_LEVEL);
});

test('findNearestSpot: ruang, lantai, terisi, jangkauan, dan dari belakang', () => {
  const data = { level: 6, props: [{ type: 'sofa', x: 0, z: 0, ry: 0, room: 'lounge' }, { type: 'chair', x: 20, z: 0, ry: 0, room: 'lounge' }, { type: 'bed', x: 0, z: 30, ry: 0, room: 'kamar' }] };
  const spots = spotsOfLevel(data).list;
  const at = (x, z, room = 'lounge', level = 6) => ({ x, z, level, room });
  // depan sofa (depan = +z): boleh
  const a = findNearestSpot(at(-0.5, 1.0), spots);
  assert.equal(a.type, 'sofa');
  // dari belakang sofa: tidak boleh
  assert.equal(findNearestSpot(at(-0.5, -1.2), spots), null);
  // ruang lain (di balik dinding): tidak boleh
  assert.equal(findNearestSpot(at(0.5, 31, 'lorong'), spots), null);
  // lantai lain
  assert.equal(findNearestSpot(at(-0.5, 1.0, 'lounge', 7), spots), null);
  // jauh
  assert.equal(findNearestSpot(at(10, 10), spots), null);
  // terisi: tempat sebelah yang dipilih
  const first = findNearestSpot(at(-0.5, 1.0), spots);
  const second = findNearestSpot(at(-0.5, 1.0), spots, new Set([first.id]));
  assert.equal(second.type, 'sofa');
  assert.notEqual(second.id, first.id);
  // tempat tidur dari sisi mana pun di kamarnya
  const bed = findNearestSpot(at(2.0, 30.5, 'kamar'), spots);
  assert.equal(bed.kind, 'sleep');
});

test('spotsInRoom hanya mengembalikan titik ruang itu', () => {
  const data = { level: 1, props: [{ type: 'chair', x: 0, z: 0, ry: 0, room: 'a' }, { type: 'chair', x: 1, z: 0, ry: 0, room: 'b' }] };
  assert.equal(spotsInRoom(data, 'a').length, 1);
  assert.equal(spotsInRoom(data, 'zzz').length, 0);
});

test('standPoint: memilih tempat berdiri pertama yang boleh diinjak; kursi terjepit tetap punya jalan keluar', () => {
  const [s] = spotsOfProp({ type: 'chair', x: 0, z: 0, ry: 0, level: 0, room: 'a' });
  assert.equal(standPoint(s, () => true), s.exits[0]); // semua bebas: yang pertama (depan)
  assert.ok(s.exits[0].z > s.z, 'pilihan pertama ada di depan kursi');
  assert.equal(standPoint(s, () => false), s.exits[0]); // tidak ada yang bebas: yang pertama (fisika mendorong keluar)
  // depan dan samping dekat terhalang (meja kopi + lemari): jalan keluar di cincin yang lebih lebar
  const wide = standPoint(s, (x, z) => Math.hypot(x - s.x, z - s.z) > 1.4 && z < s.z + 0.2);
  assert.ok(Math.hypot(wide.x - s.x, wide.z - s.z) > 1.4);
  const [bed] = spotsOfProp({ type: 'bed', x: 0, z: 0, ry: 0, level: 0, room: 'a' });
  const side = standPoint(bed, (x) => x < -1);
  assert.ok(side.x < -1);
});

test('poseOfSpot membeku (tidak bisa diubah pemanggil)', () => {
  const [s] = spotsOfProp({ type: 'sofa', x: 0, z: 0, ry: 0, level: 0 });
  assert.throws(() => { 'use strict'; poseOfSpot(s).y = 1; }, TypeError);
});
