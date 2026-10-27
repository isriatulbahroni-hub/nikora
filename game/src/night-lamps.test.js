import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LAMP_SPAN, lampLit, lampThreshold, paintLamps, warmScale } from './night-lamps.js';

test('lampThreshold: tetap untuk sel yang sama, 0..0,6, dan tersebar', () => {
  assert.equal(lampThreshold(5), lampThreshold(5));
  const set = new Set();
  for (let c = 0; c < 400; c += 8) {
    const t = lampThreshold(c);
    assert.ok(t >= 0 && t < 0.6);
    set.add(Math.round(t * 10));
  }
  assert.ok(set.size >= 5, 'ambang harus beragam supaya lampu menyala bergantian');
});

test('lampLit: padam di siang, menyala di malam penuh, naik monoton', () => {
  for (const th of [0, 0.3, 0.6]) {
    assert.equal(lampLit(th, 0), 0);
    assert.equal(lampLit(th, 1), 1);
    let prev = 0;
    for (let n = 0; n <= 1.0001; n += 0.05) {
      const v = lampLit(th, n);
      assert.ok(v >= prev - 1e-12);
      prev = v;
    }
  }
  assert.ok(0.6 + LAMP_SPAN <= 1, 'lampu terakhir harus sudah menyala penuh di malam penuh');
  assert.ok(lampLit(0.05, 0.3) > lampLit(0.5, 0.3), 'ambang kecil menyala lebih dulu');
});

test('warmScale: 0,4 di siang sampai 1 di malam', () => {
  assert.equal(warmScale(0), 0.4);
  assert.equal(warmScale(1), 1);
  assert.ok(warmScale(0.4) > 0.4 && warmScale(0.4) < 1);
});

test('paintLamps: lampu menyala satu per satu seiring malam', () => {
  const n = 12;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), n);
  mesh.userData.th = Array.from({ length: n }, (_, i) => lampThreshold(i * 8));
  const counts = [0, 0.2, 0.4, 0.6, 0.8, 1].map((night) => paintLamps(mesh, night));
  assert.equal(counts[0], 0);
  assert.equal(counts.at(-1), n);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1]);
  assert.ok(counts.some((c) => c > 0 && c < n), 'harus ada saat sebagian lampu menyala dan sebagian padam');
  assert.ok(mesh.instanceColor);
  assert.equal(paintLamps({ userData: {} }, 1), 0);
});
