import test from 'node:test';
import assert from 'node:assert/strict';
import { BIRD_TARGET, CAMERA_MODES, FREE_MAX_Y, FREE_MIN_Y, MODE_LIMITS, OBSERVER_POINTS, ORBIT_TARGETS, blendPose, cinematicPose, freeSpeed, freeStart, isCameraMode, lookDir, observerFov, observerPoint, orbitPose, stepFree } from './hotel-camera.js';
import { HOTEL_BUILDING, TOWER_CENTER } from './hotel-layout.js';

test('tujuh mode kamera dan batas tiap mode lengkap', () => {
  assert.deepEqual(CAMERA_MODES.map((m) => m.id), ['follow', 'first', 'free', 'orbit', 'bird', 'cinematic', 'observer']);
  for (const m of CAMERA_MODES) assert.ok(MODE_LIMITS[m.id], m.id);
  assert.ok(isCameraMode('free') && !isCameraMode('xyz'));
});

test('lookDir: satuan, yaw 0 menghadap utara, pitch positif menunduk', () => {
  const d = lookDir(0, 0);
  assert.ok(Math.abs(d.z + 1) < 1e-9 && Math.abs(d.x) < 1e-9);
  const down = lookDir(0.7, 0.5);
  assert.ok(down.y < 0);
  assert.ok(Math.abs(Math.hypot(down.x, down.y, down.z) - 1) < 1e-9);
});

test('stepFree: maju mengikuti arah pandang, bisa naik, tidak tembus tanah, dan terbatas', () => {
  const cam = { x: 0, y: 50, z: 0, yaw: 0, pitch: 0 };
  const fwd = stepFree(cam, { forward: -1 }, 1);
  assert.ok(fwd.z < 0 && Math.abs(fwd.x) < 1e-9);
  const up = stepFree(cam, { up: 1 }, 1);
  assert.ok(up.y > cam.y);
  const low = stepFree({ ...cam, y: 2 }, { up: -1 }, 5);
  assert.equal(low.y, FREE_MIN_Y);
  const high = stepFree({ ...cam, y: FREE_MAX_Y - 1 }, { up: 1 }, 50);
  assert.equal(high.y, FREE_MAX_Y);
  const strafe = stepFree(cam, { right: 1 }, 1);
  assert.ok(strafe.x > 0);
  const far = stepFree({ ...cam, x: 3999 }, { right: 1 }, 100);
  assert.ok(far.x <= 4000);
});

test('stepFree: pitch menunduk saat maju membuat kamera turun', () => {
  const r = stepFree({ x: 0, y: 100, z: 0, yaw: 0, pitch: 0.8 }, { forward: -1 }, 1);
  assert.ok(r.y < 100);
});

test('freeSpeed naik dengan ketinggian dan dibatasi', () => {
  assert.ok(freeSpeed(2) < freeSpeed(500));
  assert.equal(freeSpeed(1e6), 700);
  assert.equal(freeSpeed(10, 4), freeSpeed(10) * 4);
});

test('freeStart di dekat pemain dan sedikit di atasnya', () => {
  const s = freeStart({ x: 5, y: 0, z: 9 }, Math.PI);
  assert.ok(s.y > 0 && Math.hypot(s.x - 5, s.z - 9) < 10);
});

test('orbitPose: jarak ke sasaran sama dengan dist dan tidak di bawah tanah', () => {
  for (const t of ORBIT_TARGETS) {
    const p = orbitPose({ ...t, yaw: 1.2 });
    const d = Math.hypot(p.pos[0] - t.x, p.pos[1] - t.y, p.pos[2] - t.z);
    assert.ok(Math.abs(d - t.dist) < 1e-6, t.name);
    assert.ok(p.pos[1] >= FREE_MIN_Y);
  }
  const low = orbitPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: -0.25, dist: 100 });
  assert.equal(low.pos[1], FREE_MIN_Y);
});

test('pandangan burung menatap tapak hotel dari atas', () => {
  const p = orbitPose({ ...BIRD_TARGET, yaw: 0 });
  assert.ok(p.pos[1] > 300);
  assert.ok(MODE_LIMITS.bird.minPitch > 0.8);
});

test('sinematik: selalu di luar denah menara, di atas tanah, dan berubah tiap saat', () => {
  const b = HOTEL_BUILDING;
  let moved = false;
  let prev = null;
  for (let t = 0; t < 400; t += 1.7) {
    const p = cinematicPose(t);
    const inside = p.pos[0] > b[0] && p.pos[0] < b[2] && p.pos[2] > b[1] && p.pos[2] < b[3];
    assert.ok(!inside, `t=${t}`);
    assert.ok(p.pos[1] >= 20);
    assert.equal(p.look[0], TOWER_CENTER.x);
    if (prev && (prev[0] !== p.pos[0] || prev[2] !== p.pos[2])) moved = true;
    prev = p.pos;
  }
  assert.ok(moved);
});

test('pengamat: titik di luar bangunan, terdekat dipilih, fov menyempit saat jauh', () => {
  for (const p of OBSERVER_POINTS) {
    const inside = p.x > HOTEL_BUILDING[0] && p.x < HOTEL_BUILDING[2] && p.z > HOTEL_BUILDING[1] && p.z < HOTEL_BUILDING[3];
    assert.ok(!inside, p.name);
  }
  assert.equal(observerPoint({ x: -90, z: 380 }).name, 'Barat laut');
  assert.equal(observerPoint({ x: 0, z: 0 }, 5).name, OBSERVER_POINTS[1].name);
  assert.ok(observerFov(20) > observerFov(200));
  assert.ok(observerFov(1e5) >= 14 && observerFov(1) <= 50);
});

test('blendPose: ujung-ujungnya tepat dan di tengah halus', () => {
  const a = { pos: [0, 0, 0], look: [0, 0, 0] };
  const b = { pos: [10, 20, 30], look: [1, 2, 3] };
  assert.deepEqual(blendPose(a, b, 0).pos, [0, 0, 0]);
  assert.deepEqual(blendPose(a, b, 1).pos, [10, 20, 30]);
  assert.deepEqual(blendPose(a, b, 0.5).pos, [5, 10, 15]);
  assert.deepEqual(blendPose(a, b, 5).look, [1, 2, 3]);
});
