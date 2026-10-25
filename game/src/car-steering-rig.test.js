import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitCar } from './car-glb.js';

// Setir asli model GLB harus berputar tepat pada porosnya (tidak goyang/"patah") dan hub/lambang ikut berputar; kaca dibuat bening sederhana.

const boundsOf = (o) => new THREE.Box3().setFromObject(o);

function sceneWithTiltedWheel() {
  const scene = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 4.5), new THREE.MeshStandardMaterial());
  body.name = 'Body';
  body.position.y = 0.6;
  scene.add(body);
  const at = new THREE.Vector3(0.4, 0.85, 0.6);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 8, 24), new THREE.MeshStandardMaterial());
  rim.name = 'Steering_Wheel';
  rim.position.copy(at);
  rim.rotation.set(-0.3, 0.2, 0); // miring dan sedikit menyerong: sumbu bukan hanya di sumbu x
  scene.add(rim);
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), new THREE.MeshStandardMaterial());
  badge.name = 'Logo_Badge'; // tidak bernama setir, tetapi menempel di pusat setir
  badge.position.copy(at);
  scene.add(badge);
  const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.02), new THREE.MeshStandardMaterial());
  gauge.name = 'Gauge_Face'; // jam di balik setir: tidak ikut berputar
  gauge.position.set(0.4, 0.85, 0.95);
  scene.add(gauge);
  return scene;
}

// Meniru susunan model Chiron: pivot kosong bernama setir, lingkar di dalamnya, dan dua tangan pengemudi yang sangat padat sebagai anak lingkar.
function sceneWithDenseHands() {
  const scene = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 4.5), new THREE.MeshStandardMaterial());
  body.name = 'Body';
  body.position.y = 0.6;
  scene.add(body);
  const pivot = new THREE.Group();
  pivot.name = 'STEERWHEEL_PIVOT';
  pivot.position.set(0.4, 0.85, 0.6);
  pivot.rotation.x = 0.5; // sumbu menghadap ke depan-bawah: bagian atas setir condong ke depan (tilt positif)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 8, 24), new THREE.MeshStandardMaterial());
  rim.name = 'INT_wheel';
  pivot.add(rim);
  for (const [name, x] of [['DRIVER_HAND_L', -0.15], ['DRIVER_HAND_R', 0.15]]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 160, 120), new THREE.MeshStandardMaterial()); // ~19 ribu simpul per tangan
    hand.name = name;
    hand.position.set(x, 0.05, 0);
    rim.add(hand);
  }
  const wrist = new THREE.Object3D();
  wrist.name = 'IK_WRIST_L';
  rim.add(wrist);
  scene.add(pivot);
  return scene;
}

test('fitCar: setir miring dan menyerong berputar pada sumbunya sendiri (bidang lingkar tidak berubah)', () => {
  const { steering, root } = fitCar(sceneWithTiltedWheel(), { length: 4.5 });
  assert.ok(steering, 'setir asli ditemukan');
  assert.ok(Math.abs(steering.tilt) <= 0.8, `tilt ${steering.tilt}`);
  const rim = root.getObjectByName('Steering_Wheel');
  root.updateMatrixWorld(true);
  const n0 = new THREE.Vector3(0, 0, 1).transformDirection(rim.matrixWorld);
  const c0 = boundsOf(rim).getCenter(new THREE.Vector3());
  for (const angle of [0.7, -1.4, 1.9]) {
    steering.spin.rotation.z = angle;
    root.updateMatrixWorld(true);
    const n1 = new THREE.Vector3(0, 0, 1).transformDirection(rim.matrixWorld);
    assert.ok(n0.dot(n1) > 0.9999, `normal lingkar berubah saat diputar ${angle}: dot=${n0.dot(n1)}`);
    assert.ok(c0.distanceTo(boundsOf(rim).getCenter(new THREE.Vector3())) < 1e-3, 'pusat lingkar tetap di porosnya');
  }
});

test('fitCar: hub/lambang tak bernama di pusat setir ikut berputar, jam di balik setir tidak', () => {
  const { steering, root } = fitCar(sceneWithTiltedWheel(), { length: 4.5 });
  assert.deepEqual(steering.names, ['Steering_Wheel']);
  assert.equal(root.getObjectByName('Logo_Badge').parent, steering.spin, 'lambang ikut poros setir');
  assert.notEqual(root.getObjectByName('Gauge_Face').parent, steering.spin, 'jam tidak ikut berputar');
});

test('fitCar: tangan bawaan model yang padat dibuang, sumbu setir tetap benar, dan tilt boleh positif', () => {
  const { steering, root } = fitCar(sceneWithDenseHands(), { length: 4.5 });
  assert.ok(steering, 'setir asli ditemukan');
  assert.deepEqual(steering.names, ['STEERWHEEL_PIVOT']);
  assert.equal(root.getObjectByName('DRIVER_HAND_L'), undefined, 'tangan kiri bawaan dibuang');
  assert.equal(root.getObjectByName('DRIVER_HAND_R'), undefined, 'tangan kanan bawaan dibuang');
  assert.equal(root.getObjectByName('IK_WRIST_L'), undefined, 'penanda IK dibuang');
  assert.ok(Math.abs(steering.tilt - 0.5) < 0.03, `tilt harus ~0,5 (bukan 0 atau cadangan terbalik): ${steering.tilt}`);
  const rim = root.getObjectByName('INT_wheel');
  root.updateMatrixWorld(true);
  const n0 = new THREE.Vector3(0, 0, 1).transformDirection(rim.matrixWorld);
  const c0 = boundsOf(rim).getCenter(new THREE.Vector3());
  for (const angle of [0.9, -1.9, 1.3]) {
    steering.spin.rotation.z = angle;
    root.updateMatrixWorld(true);
    const n1 = new THREE.Vector3(0, 0, 1).transformDirection(rim.matrixWorld);
    assert.ok(n0.dot(n1) > 0.9999, `lingkar goyang saat diputar ${angle}: dot=${n0.dot(n1)}`);
    assert.ok(c0.distanceTo(boundsOf(rim).getCenter(new THREE.Vector3())) < 1e-3, 'pusat lingkar tetap di porosnya');
  }
});

test('fitCar: bahan kaca dibuat bening sederhana (tanpa transmission), bahan lain tidak berubah', () => {
  const scene = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 4.5), new THREE.MeshStandardMaterial({ color: 0x223344 }));
  body.name = 'Body';
  body.position.y = 0.6;
  const glassMat = new THREE.MeshPhysicalMaterial({ transmission: 1, thickness: 0.5 });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.05), glassMat);
  glass.name = 'Windshield';
  glass.position.set(0, 1.0, 1.0);
  scene.add(body, glass);
  fitCar(scene, { length: 4.5 });
  assert.equal(glassMat.transmission, 0);
  assert.equal(glassMat.transparent, true);
  assert.ok(glassMat.opacity <= 0.3);
  assert.equal(glassMat.depthWrite, false);
  assert.equal(glass.castShadow, false);
  assert.equal(body.material.transparent, false, 'bodi tidak disentuh');
  assert.equal(body.castShadow, true);
});
