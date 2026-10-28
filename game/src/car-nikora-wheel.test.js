import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { specOf } from './vehicle.js';
import { cockpitSpec, wheelAngle } from './cockpit.js';
import { buildSteeringWheel } from './cockpit-view.js';

test('setir NIKORA W16 bulat: lingkar torus penuh 360 derajat, jari-jari tidak keluar dari lingkar, dan ikut berputar', () => {
  const spec = cockpitSpec(specOf('nikora'));
  assert.ok(spec.eye.x < 0 && spec.wheel.x < 0, 'setir kanan: setir di depan pengemudi, sisi kanan mobil');
  const sw = buildSteeringWheel(spec);
  const rim = sw.spin.children.find((o) => o.geometry instanceof THREE.TorusGeometry);
  assert.ok(rim, 'ada lingkar setir berbentuk torus');
  assert.equal(rim.geometry.parameters.radius, spec.wheel.r);
  assert.ok(Math.abs(rim.geometry.parameters.arc - Math.PI * 2) < 1e-9, 'lingkar penuh, bukan potongan (bukan setir kotak/datar di bawah)');
  for (const o of sw.spin.children) {
    if (o === rim) continue;
    o.geometry.computeBoundingBox();
    const size = o.geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(Math.max(size.x, size.y) <= 2 * spec.wheel.r + 1e-6, 'jari-jari dan hub tidak melewati lingkar');
  }
  sw.spin.rotation.z = wheelAngle(0.5, 0.5);
  assert.ok(Math.abs(sw.spin.rotation.z) > 1, 'setir berputar penuh saat roda depan dibelokkan maksimal');
  sw.dispose();
});
