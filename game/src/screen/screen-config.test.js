import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://nikora.test/' });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
// jsdom tanpa paket canvas: getContext('2d') kosong. Beri konteks palsu agar kartu diam bisa digambar.
dom.window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
  get: (_, key) => (key === 'measureText' ? () => ({ width: 10 }) : String(key).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});

const { disabledScreen, isScreenEnabled } = await import('./screen-config.js');
const { createScreen } = await import('./screen-setup.js');

test('layar mati secara bawaan dan hanya menyala dengan ?layar=1 (atau true/ya/on)', () => {
  for (const search of ['', '?', '?acara=abc&tamu=x', '?layar=0', '?layar=', '?layar=tidak', '?Layar=1']) {
    assert.equal(isScreenEnabled(search), false, search);
  }
  for (const search of ['?layar=1', '?acara=abc&layar=1', '?layar=true', '?layar=YA', '?layar=on', '?layar=%201']) {
    assert.equal(isScreenEnabled(search), true, search);
  }
});

test('halaman bertanda data-layar-bawaan="on" (vila) menyalakan layar tanpa parameter; ?layar=0 tetap mematikan', () => {
  const villa = new JSDOM('<!doctype html><html data-layar-bawaan="on"><body></body></html>').window.document;
  assert.equal(isScreenEnabled('', villa), true);
  assert.equal(isScreenEnabled('?acara=abc', villa), true);
  assert.equal(isScreenEnabled('?layar=1', villa), true);
  assert.equal(isScreenEnabled('?layar=0', villa), false);
  assert.equal(isScreenEnabled('?layar=tidak', villa), false);
  const plain = new JSDOM('<!doctype html><html data-layar-bawaan="off"><body></body></html>').window.document;
  assert.equal(isScreenEnabled('', plain), false);
});

test('disabledScreen: tidak melakukan apa pun dan tidak melempar error', () => {
  const s = disabledScreen();
  assert.equal(s.enabled, false);
  assert.equal(s.mesh, null);
  assert.equal(s.controller, null);
  assert.doesNotThrow(() => { s.attach({}); s.attach(null); s.render({}, {}); s.resize(1, 1); s.tick(1000); });
});

test('createScreen mati: papan layar tancap tetap ada di dinding, tanpa video, tombol, pengendali, atau CSS3D', () => {
  const added = [];
  const scene = { add: (o) => added.push(o) };
  const renderer = { get domElement() { throw new Error('renderer tidak boleh disentuh'); } };
  const screen = createScreen({ scene, renderer, host: document.body, spec: { x: 0, y: 4.3, z: -11.45, width: 8, height: 4.5 }, enabled: false });
  assert.equal(screen.enabled, false);
  assert.equal(added.length, 1, 'papan layar ditambahkan ke scene');
  assert.equal(added[0], screen.mesh.group);
  assert.equal(screen.controller, null);
  assert.doesNotThrow(() => { screen.attach({ net: { sendScreen() {} } }); screen.tick(5000); screen.render({}, {}); });
  assert.equal(screen.controller, null, 'attach tidak membuat pengendali saat mati');
  assert.equal(document.querySelector('.sheet-tile, .sc-toggle, .sc-panel'), null, 'tidak ada tombol/panel layar');
});
