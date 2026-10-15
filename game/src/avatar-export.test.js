import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildBody } from './avatar-body.js';

// GLTFExporter memakai FileReader (ada di browser, tidak di Node)
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((r) => { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(r).toString('base64')}`; this.onloadend?.(); }); }
};
const { exportAvatarGLB, prepareForExport } = await import('./avatar-export.js');

const make = () => {
  const rig = buildBody({ color: 0x2e9e6b, skin: 0xe8bf99 });
  const group = new THREE.Group();
  group.add(rig.root);
  const aura = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.7, 16), new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending }));
  group.add(aura, new THREE.Sprite(new THREE.SpriteMaterial()));
  group.position.set(3, 0, -2);
  return group;
};

test('prepareForExport membuang aura/label dan menolkan posisi', () => {
  const copy = prepareForExport(make());
  let sprites = 0; let rings = 0;
  copy.traverse((o) => { if (o.isSprite) sprites += 1; if (o.geometry?.type === 'RingGeometry') rings += 1; });
  assert.equal(sprites + rings, 0);
  assert.equal(copy.position.length(), 0);
});

test('exportAvatarGLB menghasilkan berkas GLB yang valid', async () => {
  const buf = await exportAvatarGLB(make());
  const view = new DataView(buf);
  assert.equal(view.getUint32(0, true), 0x46546c67); // "glTF"
  assert.equal(view.getUint32(8, true), buf.byteLength);
  assert.ok(buf.byteLength > 5000);
});
