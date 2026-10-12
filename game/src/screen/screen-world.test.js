import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';

const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { url: 'https://nikora.test/' });
globalThis.document = dom.window.document;
globalThis.window = dom.window;

const { createScreenMesh } = await import('./screen-mesh.js');
const { createScreenCss3d } = await import('./screen-css3d.js');
const { createScreenController } = await import('./screen-controller.js');

test('mesh layar: lubang menulis alpha 0 tanpa blending; kembali ke kartu/video saat dimatikan', () => {
  const mesh = createScreenMesh({ width: 8, height: 4.5 });
  const plane = mesh.group.children.find((c) => c.geometry?.type === 'PlaneGeometry');
  const normal = plane.material;
  mesh.showHole(true);
  assert.equal(plane.material.opacity, 0);
  assert.equal(plane.material.blending, THREE.NoBlending);
  assert.notEqual(plane.material, normal);
  mesh.showHole(false);
  assert.equal(plane.material, normal);
  mesh.showHole(true);
  mesh.showVideo({ videoWidth: 1, videoHeight: 1, readyState: 0, addEventListener() {}, removeEventListener() {} });
  assert.equal(plane.material, normal, 'menampilkan video otomatis menutup lubang');
});

test('CSS3D: lapisan di belakang kanvas, objek ukuran proporsional dan hanya tampil saat aktif', () => {
  const host = document.getElementById('host');
  const canvas = document.createElement('canvas');
  host.append(canvas);
  const group = new THREE.Group();
  const css = createScreenCss3d({ host, group, width: 8, height: 4.5, px: 960 });
  assert.equal(host.firstChild, css.layer, 'lapisan CSS3D diletakkan sebelum kanvas');
  const obj = group.children[0];
  assert.equal(obj.visible, false);
  assert.ok(Math.abs(obj.scale.x - 8 / 960) < 1e-9);
  assert.equal(css.container.style.height, '540px');
  css.setActive(true);
  assert.equal(obj.visible, true);
  assert.equal(css.container.style.display, 'block');
  css.setActive(false);
  assert.equal(obj.visible, false);
  css.dispose();
  assert.equal(group.children.length, 0);
});

test('pengendali dengan embedHost: iframe masuk ke layar 3D, lubang menyala saat video embed, padam saat berhenti, tanpa panel mengambang', async () => {
  const handlers = { screen: [], left: [], 'screen-track': [] };
  const net = { id: 'aaaa', players: [{ id: 'aaaa', name: 'A' }], screenTracks: new Map(), sent: [], on(e, f) { handlers[e].push(f); }, sendScreen(m) { this.sent.push(m); } };
  const holes = [];
  const mesh = { showHole: (on) => holes.push(on), showIdle() {}, showVideo() {}, clearVideo() {} };
  const container = document.createElement('div');
  let active = false;
  const ctl = createScreenController({ net, mesh, doc: document, embedHost: { container, setActive: (on) => { active = on; } } });
  ctl.claim();
  await ctl.loadLink('https://youtu.be/dQw4w9WgXcQ');
  assert.ok(container.querySelector('iframe').src.includes('dQw4w9WgXcQ'));
  assert.equal(active, true);
  assert.equal(holes.at(-1), true);
  assert.equal(document.querySelector('.screen-embed'), null, 'tidak ada panel mengambang');
  assert.equal(ctl.embedHidden, false);
  await ctl.stop();
  assert.equal(active, false);
  assert.equal(holes.at(-1), false);
});
