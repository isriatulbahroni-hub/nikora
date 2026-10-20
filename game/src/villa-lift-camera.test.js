import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVEL_HEIGHT } from './villa-layout.js';
import { LIFT } from './villa-lift.js';
import { CAB_CAM, cabBlendStep, cabCameraPose, cabLatchNext, mix, smoothstep } from './villa-lift-camera.js';

test('kamera kabin: di dalam kabin, di bawah langit-langit, tidak menempel dinding', () => {
  const { pos } = cabCameraPose(0);
  const inner = LIFT.half - 0.05; // sisi dalam dinding kabin
  assert.ok(Math.abs(pos.x - LIFT.x) <= inner - 0.2, 'jarak ke dinding samping cukup untuk bidang dekat kamera');
  assert.ok(Math.abs(pos.z - LIFT.z) <= inner - 0.2, 'jarak ke dinding belakang cukup');
  assert.ok(pos.y > 1.8 && pos.y < LIFT.height - 0.3, 'di atas kepala, di bawah langit-langit');
});

test('kamera kabin: mengikuti ketinggian kabin dan memandang dada avatar', () => {
  const low = cabCameraPose(0);
  const high = cabCameraPose(LEVEL_HEIGHT * 2);
  assert.ok(Math.abs(high.pos.y - low.pos.y - LEVEL_HEIGHT * 2) < 1e-9);
  assert.ok(Math.abs(high.target.y - low.target.y - LEVEL_HEIGHT * 2) < 1e-9);
  assert.equal(low.target.x, LIFT.x);
  assert.ok(low.target.y > 0.8 && low.target.y < 1.4);
  assert.ok(CAB_CAM.fov > 62, 'sudut pandang kabin lebih lebar daripada kamera biasa');
});

test('mode kabin: histeresis di ambang kabin (tidak bolak-balik)', () => {
  const edge = { x: LIFT.x + 0.9, z: LIFT.z }; // antara batas masuk (0,8 m) dan batas keluar (1,1 m)
  assert.equal(cabLatchNext(false, edge), false, 'belum cukup dalam untuk masuk');
  assert.equal(cabLatchNext(true, edge), true, 'sudah di mode kabin: bertahan');
  assert.equal(cabLatchNext(false, { x: LIFT.x, z: LIFT.z }), true);
  assert.equal(cabLatchNext(true, { x: LIFT.x + 1.3, z: LIFT.z }), false, 'keluar kabin');
  assert.equal(cabLatchNext(true, { x: LIFT.x, z: LIFT.z, stair: 'tower_e_a' }), false, 'di tangga bukan di kabin');
});

test('peralihan kamera: halus, tidak melompat, dan menetap tepat di 0 atau 1', () => {
  let b = 0;
  let prev = 0;
  for (let i = 0; i < 400; i++) {
    b = cabBlendStep(b, true, 1 / 60);
    assert.ok(b >= prev && b - prev < 0.1, 'naik bertahap, tanpa lonjakan');
    prev = b;
  }
  assert.equal(b, 1);
  for (let i = 0; i < 400; i++) b = cabBlendStep(b, false, 1 / 60);
  assert.equal(b, 0);
  assert.equal(cabBlendStep(0.5, true, 0), 0.5, 'delta nol tidak mengubah apa pun');
});

test('smoothstep dan mix: batas 0 dan 1', () => {
  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(1), 1);
  assert.equal(mix(2, 6, 0.5), 4);
});
