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

test('fitCar: setir miring dan menyerong berputar pada sumbunya sendiri (bidang lingkar tidak berubah)', () => {
  const { steering, root } = fitCar(sceneWithTiltedWheel(), { length: 4.5 });
  assert.ok(steering, 'setir asli ditemukan');
  assert.ok(steering.tilt <= 0 && steering.tilt >= -0.8, `tilt ${steering.tilt}`);
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
