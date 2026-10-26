import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { COCKPIT_GLASS_OPACITY, applyClearView, findClearView } from './cockpit-clear.js';

const mesh = (name, mat) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat ?? new THREE.MeshBasicMaterial());
  m.name = name;
  return m;
};

function car() {
  const root = new THREE.Group();
  const roof = new THREE.Group();
  roof.name = 'ROOF';
  const paint = mesh('Cube.012');
  const sun = mesh('INT_sunvisor_L');
  roof.add(paint, sun);
  const glassMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28 });
  glassMat.name = 'Glass';
  const wind = mesh('Cube.021', glassMat);
  const dash = mesh('INT_dash');
  const mirror = mesh('INT_mirror_body');
  const labelRoof = mesh('IPAD_tile_roof'); // nama mengandung "roof" tetapi bukan node atap
  root.add(roof, wind, dash, mirror, labelRoof);
  return { root, paint, sun, wind, dash, mirror, labelRoof, glassMat };
}

test('pandangan bersih: atap dan visor disembunyikan, bagian lain tetap terlihat, lalu dikembalikan', () => {
  const c = car();
  const st = findClearView(c.root);
  assert.equal(st.roof.length, 2);
  assert.equal(st.ownMirror, true);
  applyClearView(st, true);
  assert.equal(c.paint.visible, false);
  assert.equal(c.sun.visible, false);
  assert.equal(c.dash.visible, true);
  assert.equal(c.labelRoof.visible, true, 'tile bernama roof di panel iPad bukan atap');
  applyClearView(st, false);
  assert.equal(c.paint.visible, true);
  assert.equal(c.sun.visible, true);
});

test('pandangan bersih: kaca dibuat bening lalu kembali ke opacity aslinya; idempoten', () => {
  const c = car();
  const st = findClearView(c.root);
  applyClearView(st, true);
  assert.equal(c.glassMat.opacity, COCKPIT_GLASS_OPACITY);
  applyClearView(st, true);
  assert.equal(c.glassMat.opacity, COCKPIT_GLASS_OPACITY);
  applyClearView(st, false);
  assert.equal(c.glassMat.opacity, 0.28);
});

test('pandangan bersih: mesh yang sudah tersembunyi dari awal tidak ikut muncul saat dikembalikan; kaca yang lebih bening tidak dinaikkan', () => {
  const c = car();
  c.sun.visible = false;
  c.glassMat.opacity = 0.05;
  const st = findClearView(c.root);
  applyClearView(st, true);
  assert.equal(c.glassMat.opacity, 0.05);
  applyClearView(st, false);
  assert.equal(c.sun.visible, false);
  assert.equal(c.paint.visible, true);
});

test('pandangan bersih: model tanpa atap/spion tengah dan pohon kosong tidak membuat galat', () => {
  const root = new THREE.Group();
  root.add(mesh('Body'));
  const st = findClearView(root);
  assert.deepEqual([st.roof.length, st.glass.size, st.ownMirror], [0, 0, false]);
  applyClearView(st, true);
  applyClearView(findClearView(null), true);
  applyClearView(null, true);
});
