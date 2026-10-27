import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR_MODELS, MODEL_IDS } from './car-models.js';
import { DASH, WHEEL_LOCK, clusterState, cockpitFov, cockpitSpec, dialAngle, eyeWorld, handPositions, localToWorld, mergeControls, wheelAngle } from './cockpit.js';
import { createVehicle, seatWorld } from './vehicle.js';

test('kokpit: tiap model punya dasbor dan mata pengemudi di dalam badan, di kursi kanan', () => {
  for (const id of MODEL_IDS) {
    const m = CAR_MODELS[id];
    assert.ok(DASH[id], `${id} punya data dasbor`);
    const c = cockpitSpec(m);
    assert.ok(c.eye.x < 0, `${id}: mata di sisi kanan (x negatif)`);
    assert.ok(Math.abs(c.eye.x) < m.width / 2 && Math.abs(c.eye.z) < m.length / 2 && c.eye.y > 0.9 && c.eye.y < m.height + 0.1, `${id}: mata di dalam badan`);
    assert.ok(c.wheel.z > c.eye.z && c.wheel.y < c.eye.y, `${id}: setir di depan dan di bawah mata`);
    assert.ok(c.cluster.z > c.eye.z && c.cluster.y > c.wheel.y, `${id}: spidometer di depan setir`);
    assert.ok(c.sides.every((s) => Math.abs(s.x) < m.width / 2), `${id}: spion samping di dalam badan`);
  }
});

test('kokpit: mata sejajar dengan kursi pengemudi di dunia (heading berapa pun)', () => {
  for (const heading of [0, 1, Math.PI, -2.2]) {
    const v = createVehicle({ id: 'a', x: 12, z: -7, heading, model: 'noir' });
    const e = eyeWorld(v, cockpitSpec(v.spec));
    const s = seatWorld(v, 0);
    assert.ok(Math.hypot(e.x - s.x, e.z - s.z) < 0.35, `heading ${heading}: ${Math.hypot(e.x - s.x, e.z - s.z).toFixed(2)} m dari kursi`);
    assert.equal(e.yaw, heading);
  }
  const p = localToWorld({ x: 0, z: 0, heading: 0 }, { x: 0.5, y: 1, z: 2 }); // heading 0 = selatan (+z), kiri mobil = +x
  assert.deepEqual([p.x, p.z], [0.5, 2]);
});

test('setir: belok kiri memutar berlawanan jarum jam, kanan searah, simetris dan dibatasi', () => {
  assert.ok(wheelAngle(0.3, 0.5) < 0 && wheelAngle(-0.3, 0.5) > 0);
  assert.equal(wheelAngle(0, 0.5), 0);
  assert.ok(Math.abs(wheelAngle(0.2, 0.5) + wheelAngle(-0.2, 0.5)) < 1e-12);
  assert.equal(wheelAngle(9, 0.5), -WHEEL_LOCK);
});

test('tangan: berpegangan di tepi setir dan ikut berputar; kiri dan kanan berseberangan', () => {
  const r = 0.17;
  for (const a of [0, 0.7, -1.9]) {
    const h = handPositions(r, a);
    assert.ok(Math.abs(Math.hypot(h.left.x, h.left.y) - r) < 1e-9 && Math.abs(Math.hypot(h.right.x, h.right.y) - r) < 1e-9);
  }
  const straight = handPositions(r, 0);
  assert.ok(straight.left.x > 0 && straight.right.x < 0 && straight.left.y > 0 && straight.right.y > 0); // jam 10 dan jam 2
  const turned = handPositions(r, -1.2); // setir diputar ke kiri: tangan kiri turun, tangan kanan naik
  assert.ok(turned.left.y < straight.left.y && turned.right.y > straight.right.y);
});

test('jarum: dari -210 ke +30 derajat dan dibatasi 0..1', () => {
  assert.ok(Math.abs(dialAngle(0) * 180 / Math.PI + 210) < 1e-9);
  assert.ok(Math.abs(dialAngle(1) * 180 / Math.PI - 30) < 1e-9);
  assert.equal(dialAngle(5), dialAngle(1));
  assert.equal(dialAngle(-1), dialAngle(0));
});

test('FOV kokpit melebar dengan kecepatan dan di layar potret', () => {
  assert.ok(cockpitFov(30, 30) > cockpitFov(0, 30));
  assert.ok(cockpitFov(0, 30, 0.5) > cockpitFov(0, 30, 1.8));
  assert.ok(cockpitFov(1000, 30, 0.2) <= 104);
});

test('pedal layar: gas menang atas joystick, rem menahan gas, tanpa pedal tidak berubah', () => {
  const base = { throttle: -0.5, steer: 0.2 };
  assert.equal(mergeControls(base, null), base);
  assert.equal(mergeControls(base, { gas: 0, brake: 0 }), base);
  assert.deepEqual(mergeControls(base, { gas: 0.8, brake: 0 }), { throttle: 0.8, steer: 0.2, brake: false });
  assert.deepEqual(mergeControls(base, { gas: 1, brake: 1 }), { throttle: 0, steer: 0.2, brake: true });
});

test('jam spidometer: km/j, putaran, gigi dari mobil', () => {
  const v = createVehicle({ id: 'a', model: 'argent' });
  v.speed = 20;
  const c = clusterState(v, { rpm: 4200, rpmMax: 8400, gear: 3 });
  assert.equal(c.kmh, 72);
  assert.equal(c.rpmFrac, 0.5);
  assert.equal(c.gear, 3);
  assert.equal(c.maxKmh, Math.round(v.spec.maxSpeed * 3.6));
  assert.equal(clusterState(v, null).gear, 'N');
});
