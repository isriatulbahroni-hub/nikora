import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SKINS } from './avatar-config.js';
import { buildBody } from './avatar-body.js';
import { applyFacePhoto, applyStyle, nearestSkinIndex, sampleSkin } from './avatar-face.js';

const solid = (w, h, [r, g, b, a = 255]) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; }
  return d;
};
const avatarLike = () => { const rig = buildBody({ color: 0x8c2f39, skin: 0xe8bf99 }); const group = new THREE.Group(); group.add(rig.root); group.userData.face = rig.face; return { rig, group }; };

test('sampleSkin membaca warna kulit dan mengabaikan piksel transparan', () => {
  const c = sampleSkin(solid(64, 64, [0xc9, 0x94, 0x68]), 64, 64);
  assert.deepEqual(c, { r: 0xc9, g: 0x94, b: 0x68 });
  assert.deepEqual(sampleSkin(solid(64, 64, [10, 20, 30, 0]), 64, 64), { r: 0, g: 0, b: 0 });
});

test('nearestSkinIndex memetakan tiap warna kulit ke dirinya sendiri', () => {
  SKINS.forEach((s, i) => assert.equal(nearestSkinIndex({ r: (s.hex >> 16) & 255, g: (s.hex >> 8) & 255, b: s.hex & 255 }), i));
  assert.equal(nearestSkinIndex({ r: 250, g: 225, b: 210 }), 0);
});

test('applyStyle: asli tidak berubah, kartun diposterisasi, royal lebih hangat', () => {
  const a = solid(2, 2, [200, 150, 120]);
  assert.deepEqual([...applyStyle(solid(2, 2, [200, 150, 120]), 'asli')], [...a]);
  const k = applyStyle(solid(2, 2, [203, 151, 119]), 'kartun');
  for (let i = 0; i < k.length; i += 4) for (let j = 0; j < 3; j += 1) assert.equal(k[i + j] % 51, 0);
  const r = applyStyle(solid(2, 2, [200, 150, 120]), 'royal');
  assert.ok(r[0] - r[2] > 200 - 120);
});

test('applyFacePhoto menyembunyikan mata/mulut, menempel di depan kepala, dan bisa dilepas', () => {
  const { rig, group } = avatarLike();
  const decal = applyFacePhoto(group, { width: 8, height: 8 });
  assert.ok(decal);
  assert.equal(rig.face.visible, false);
  decal.geometry.computeBoundingBox();
  const box = decal.geometry.boundingBox;
  assert.ok(box.max.z < -0.1 && box.min.z < -0.29, 'tambalan ada di sisi depan (-z)');
  assert.ok(Math.abs(box.min.x + box.max.x) < 1e-6, 'terpusat di tengah wajah');
  assert.equal(applyFacePhoto(group, null), null);
  assert.equal(rig.face.visible, true);
  assert.equal(group.userData.faceDecal, null);
  assert.equal(rig.root.children.includes(decal), false);
});

test('applyFacePhoto aman untuk avatar tanpa fitur wajah (model Michelle)', () => {
  assert.equal(applyFacePhoto(new THREE.Group(), { width: 8, height: 8 }), null);
});
