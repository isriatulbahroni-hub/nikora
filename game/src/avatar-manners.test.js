import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BODY_DISTANCE, FALL_TOTAL, HEAD_YAW_MAX, LIE_ROLL, createImpactDetector, createMannersRegistry, fallPose, greetingCurve, idleGlance,
  lyingPose, packFacing, separateFromOthers, sleepSideFromRot, unpackFacing, wrapAngle,
} from './avatar-manners.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('lyingPose: telentang = tilt +90° dan menghadap berlawanan agar kepala tetap di papan kepala', () => {
  const base = { x: 1, z: 2, y: 0.9, rotY: 0, tilt: -Math.PI / 2 };
  const p = lyingPose(base, 'up');
  assert.ok(near(p.tilt, Math.PI / 2));
  assert.ok(near(Math.abs(p.rotY), Math.PI));
  assert.equal(p.x, 1);
  assert.equal(p.z, 2);
  assert.equal(p.y, 0.9);
  assert.equal(p.side, 'up');
  assert.ok(lyingPose(base, 'left').y > base.y, 'miring sedikit diangkat (bahu lebih lebar)');
  assert.equal(lyingPose(base, 'ngawur').side, 'up');
  assert.ok(LIE_ROLL.left > 0 && LIE_ROLL.right < 0 && LIE_ROLL.up === 0);
});

test('packFacing/unpackFacing: bendera jatuh tidak mengubah arah hadap', () => {
  for (const rot of [0, 1.234, -2.5, 3.14]) {
    const packed = packFacing(rot, { fall: true });
    const { rot: back, fall } = unpackFacing(+packed.toFixed(2)); // jaringan membulatkan 2 desimal
    assert.equal(fall, true);
    assert.ok(near(wrapAngle(back - rot), 0, 0.011));
    assert.ok(near(wrapAngle(packed - rot), 0, 1e-6), 'pemain lama membaca arah yang sama');
  }
  assert.deepEqual(unpackFacing(1.5), { rot: 1.5, fall: false });
});

test('sleepSideFromRot: sisi tidur lolos dari pembulatan jaringan', () => {
  for (const spotRot of [0, Math.PI]) {
    for (const side of ['up', 'left', 'right']) {
      const sent = +packFacing(spotRot, { side }).toFixed(2);
      assert.equal(sleepSideFromRot(sent, spotRot), side);
    }
  }
});

test('fallPose: jatuh, terbaring, lalu bangun', () => {
  assert.equal(fallPose(0).w, 0);
  assert.ok(fallPose(0.2).w > 0 && fallPose(0.2).w < 1);
  assert.equal(fallPose(1).w, 1);
  assert.ok(near(fallPose(1).tilt, Math.PI / 2));
  assert.ok(fallPose(1).lift > 0.1);
  const rising = fallPose(2.2).w;
  assert.ok(rising > 0 && rising < 1);
  assert.equal(fallPose(FALL_TOTAL).w, 0);
  assert.equal(fallPose(FALL_TOTAL + 5).w, 0);
});

test('createImpactDetector: berhenti mendadak dari laju tinggi = tabrakan; pelan atau menyusur dinding tidak', () => {
  const d = createImpactDetector();
  for (let i = 0; i < 30; i += 1) assert.equal(d.update({ want: 5.2, actual: 5.2, delta: 1 / 60 }), false);
  assert.equal(d.update({ want: 5.2, actual: 0, delta: 1 / 60 }), true, 'menabrak');
  assert.equal(d.update({ want: 5.2, actual: 0, delta: 1 / 60 }), false, 'jeda setelah jatuh');

  const slow = createImpactDetector();
  for (let i = 0; i < 30; i += 1) slow.update({ want: 1.5, actual: 1.5, delta: 1 / 60 });
  assert.equal(slow.update({ want: 1.5, actual: 0, delta: 1 / 60 }), false, 'jalan pelan lalu berhenti');

  const slide = createImpactDetector();
  for (let i = 0; i < 30; i += 1) slide.update({ want: 5.2, actual: 5.2, delta: 1 / 60 });
  assert.equal(slide.update({ want: 5.2, actual: 3.5, delta: 1 / 60 }), false, 'menyusur dinding');

  const stop = createImpactDetector();
  for (let i = 0; i < 30; i += 1) stop.update({ want: 5.2, actual: 5.2, delta: 1 / 60 });
  assert.equal(stop.update({ want: 0, actual: 0, delta: 1 / 60 }), false, 'melepas joystick bukan tabrakan');
});

test('separateFromOthers: tidak menembus avatar lain, lantai lain diabaikan', () => {
  const r = separateFromOthers({ x: 0.3, z: 0, y: 0 }, [{ x: 0, z: 0, y: 0 }]);
  assert.equal(r.pushed, true);
  assert.ok(near(Math.hypot(r.x, r.z), BODY_DISTANCE, 1e-9));
  assert.ok(r.x > 0.3, 'didorong menjauh, bukan menembus');
  assert.equal(separateFromOthers({ x: 0.3, z: 0, y: 0 }, [{ x: 0, z: 0, y: 3.4 }]).pushed, false);
  assert.equal(separateFromOthers({ x: 2, z: 0, y: 0 }, [{ x: 0, z: 0, y: 0 }]).pushed, false);
  const same = separateFromOthers({ x: 0, z: 0, y: 0, fx: 0, fz: 1 }, [{ x: 0, z: 0, y: 0 }]);
  assert.ok(Number.isFinite(same.x) && Number.isFinite(same.z) && Math.hypot(same.x, same.z) > 0.7);
});

test('idleGlance: terbatas dan sebagian besar waktu menghadap depan', () => {
  let max = 0;
  let forward = 0;
  const N = 2000;
  for (let i = 0; i < N; i += 1) {
    const g = idleGlance(i * 0.1, 1.3);
    max = Math.max(max, Math.abs(g));
    if (Math.abs(g) < 0.05) forward += 1;
  }
  assert.ok(max <= 0.5 + 1e-9 && max < HEAD_YAW_MAX);
  assert.ok(forward / N > 0.3, 'tidak terus-menerus menoleh');
});

test('greetingCurve: 0 di ujung, 1 di tengah', () => {
  assert.equal(greetingCurve(0), 0);
  assert.equal(greetingCurve(1), 0);
  assert.equal(greetingCurve(-1), 0);
  assert.ok(near(greetingCurve(0.45), 1));
  assert.ok(greetingCurve(0.1) > 0 && greetingCurve(0.1) < 1);
  assert.ok(greetingCurve(0.85) > 0 && greetingCurve(0.85) < 1);
});

// a di (0,0) menghadap -z (rot 0); b di (0,-1.5) menghadap +z (rot π) = saling berhadapan
const facing = (id, x, z, rot, extra = {}) => ({ id, data: { x, z, y: 0, rot, busy: false, speed: 0, ...extra } });
function run(reg, list, now) {
  for (const { id, data } of list) reg.touch(id, data, now);
  reg.step(now);
}

test('registry: dua avatar berhadapan dekat saling memberi hormat sekali, lalu jeda', () => {
  const reg = createMannersRegistry();
  const list = [facing('a', 0, 0, 0), facing('b', 0, -1.5, Math.PI)];
  run(reg, list, 10);
  assert.ok(reg.greeting('a', 10.4) > 0.9 && reg.greeting('b', 10.4) > 0.9, 'dua-duanya hormat');
  assert.equal(reg.greeting('a', 12.5), 0, 'selesai');
  run(reg, list, 13);
  assert.equal(reg.greeting('a', 13.4), 0, 'belum boleh lagi (jeda)');
  run(reg, list, 40);
  assert.ok(reg.greeting('a', 40.4) > 0.9, 'boleh lagi setelah jeda');
});

test('registry: tidak memberi hormat bila membelakangi, terlalu jauh, sibuk, atau sedang berjalan cepat', () => {
  const cases = [
    [facing('a', 0, 0, 0), facing('b', 0, -1.5, 0)], // b membelakangi a
    [facing('a', 0, 0, 0), facing('b', 0, -5, Math.PI)], // terlalu jauh
    [facing('a', 0, 0, 0, { busy: true }), facing('b', 0, -1.5, Math.PI)], // a sedang duduk/tidur/jatuh
    [facing('a', 0, 0, 0, { speed: 4 }), facing('b', 0, -1.5, Math.PI)], // a berlari
  ];
  for (const list of cases) {
    const reg = createMannersRegistry();
    run(reg, list, 5);
    assert.equal(reg.greeting('a', 5.4), 0);
    assert.equal(reg.greeting('b', 5.4), 0);
  }
});

test('registry: lantai berbeda tidak saling melihat; yang lama tak muncul dihapus', () => {
  const reg = createMannersRegistry();
  run(reg, [facing('a', 0, 0, 0), { id: 'b', data: { x: 0, z: -1.5, y: 3.4, rot: Math.PI, busy: false, speed: 0 } }], 1);
  assert.equal(reg.greeting('a', 1.4), 0);
  assert.equal(reg.look('a'), null);
  run(reg, [facing('a', 0, 0, 0)], 3);
  assert.equal(reg.size, 1);
});

test('registry: menengok avatar terdekat di depan (kiri positif), mengabaikan yang di belakang', () => {
  const reg = createMannersRegistry();
  // a menghadap -z; b di kiri-depan (x negatif = kiri avatar yang menghadap -z)
  run(reg, [facing('a', 0, 0, 0), facing('b', -3, -3, 0), facing('c', 0, 4, 0)], 1);
  const look = reg.look('a');
  assert.ok(look && look.rel > 0.5 && look.rel < 1.0, `rel=${look?.rel}`);
  assert.ok(near(look.dist, Math.hypot(3, 3), 1e-9));
  // c di belakang a (jarak 4): tidak ditengok oleh a (relatif ±π)
  run(reg, [facing('a', 0, 0, 0), facing('c', 0, 4, 0)], 2);
  assert.equal(reg.look('a'), null);
});
