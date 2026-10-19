import assert from 'node:assert/strict';
import test from 'node:test';
import { CAM, cameraOffset, clampCam, createCamState, easeToDefault, orbitBy, panBy, panUnitsPerPixel, relaxPan, resetView, zoomBy } from './hall-camera.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('tampilan awal sama dengan kamera lama (9,5 m mendatar, 8,5 m tinggi)', () => {
  const o = cameraOffset(createCamState(), 1);
  near(o.x, 0);
  near(o.y, 8.5);
  near(o.z, 9.5);
});

test('zoom dibatasi dan tetap berlaku di kedua arah', () => {
  const s = createCamState();
  zoomBy(s, 100);
  assert.equal(s.zoom, CAM.maxZoom);
  zoomBy(s, 0.0001);
  assert.equal(s.zoom, CAM.minZoom);
  const far = cameraOffset({ ...s, zoom: CAM.maxZoom }, 1);
  const close = cameraOffset({ ...s, zoom: CAM.minZoom }, 1);
  assert.ok(Math.hypot(far.x, far.y, far.z) > Math.hypot(close.x, close.y, close.z) * 5);
});

test('miring dibatasi: tidak bisa terbalik atau menembus tanah', () => {
  const s = createCamState();
  orbitBy(s, 0, 100000);
  assert.equal(s.pitch, CAM.maxPitch);
  orbitBy(s, 0, -100000);
  assert.equal(s.pitch, CAM.minPitch);
  assert.ok(cameraOffset(s, 1).y >= CAM.minY);
});

test('geser ke kanan memutar kamera ke kanan (yaw bertambah negatif)', () => {
  const s = createCamState();
  orbitBy(s, 100, 0);
  assert.ok(s.yaw < 0);
});

test('pan: jari ke kanan menggeser kamera ke kiri, jari ke bawah memajukan kamera (yaw 0)', () => {
  const s = createCamState();
  panBy(s, 10, 0, 0.1);
  near(s.panX, -1);
  near(s.panZ, 0);
  const t = createCamState();
  panBy(t, 0, 10, 0.1);
  near(t.panX, 0);
  near(t.panZ, -1); // maju = menjauhi kamera (kamera di +z, melihat ke -z)
});

test('pan mengikuti arah putar kamera', () => {
  const s = createCamState();
  s.yaw = Math.PI / 2; // kamera di +x melihat ke -x
  panBy(s, 0, 10, 0.1);
  near(s.panX, -1);
  near(s.panZ, 0, 1e-9);
});

test('pan dibatasi jaraknya dari pemain', () => {
  const s = createCamState();
  panBy(s, 0, -100000, 1);
  near(Math.hypot(s.panX, s.panZ), CAM.maxPan);
});

test('pan kembali ke pemain lalu berhenti tepat di nol', () => {
  const s = createCamState();
  s.panX = 8;
  s.panZ = -6;
  relaxPan(s, 0.1);
  assert.ok(Math.hypot(s.panX, s.panZ) < 10 && Math.hypot(s.panX, s.panZ) > 0);
  for (let i = 0; i < 200; i++) relaxPan(s, 0.05);
  assert.equal(s.panX, 0);
  assert.equal(s.panZ, 0);
});

test('reset mengembalikan zoom, miring, dan pan tanpa mengubah yaw', () => {
  const s = createCamState();
  s.yaw = 1.2;
  s.zoom = 2.4;
  s.pitch = 1.3;
  s.panX = 5;
  s.panZ = 5;
  resetView(s);
  assert.equal(s.yaw, 1.2);
  assert.deepEqual({ zoom: s.zoom, panX: s.panX, panZ: s.panZ }, { zoom: 1, panX: 0, panZ: 0 });
  near(cameraOffset({ ...s, yaw: 0 }, 1).y, 8.5);
});

test('satuan pan per piksel tumbuh dengan jarak dan menyusut dengan tinggi layar', () => {
  assert.ok(panUnitsPerPixel(20, 700) > panUnitsPerPixel(10, 700));
  assert.ok(panUnitsPerPixel(10, 1400) < panUnitsPerPixel(10, 700));
});

test('clampCam menormalkan nilai liar', () => {
  const s = clampCam({ yaw: 0, pitch: 9, zoom: -1, panX: 100, panZ: 0 });
  assert.equal(s.pitch, CAM.maxPitch);
  assert.equal(s.zoom, CAM.minZoom);
  assert.equal(s.panX, CAM.maxPan);
});

test('easeToDefault meluncur pelan lalu pas di tampilan awal', () => {
  const s = createCamState();
  s.pitch = 1.3;
  s.zoom = 2.5;
  s.panX = 9;
  s.panZ = -4;
  assert.equal(easeToDefault(s, 0.016), false);
  assert.ok(s.zoom < 2.5 && s.zoom > 1);
  let done = false;
  for (let i = 0; i < 600 && !done; i++) done = easeToDefault(s, 0.016);
  assert.equal(done, true);
  assert.deepEqual({ zoom: s.zoom, panX: s.panX, panZ: s.panZ }, { zoom: 1, panX: 0, panZ: 0 });
});
