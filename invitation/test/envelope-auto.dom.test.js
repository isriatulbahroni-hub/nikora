import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
dom.window.HTMLCanvasElement.prototype.getContext = () => null;      // jsdom tanpa WebGL
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const { pick3D, mountEnvelopeAuto, webglAvailable } = await import('../src/scenes/envelope-auto.js');
const { buildView } = await import('../src/engine/config.js');
const { demoInvitation } = await import('../src/engine/demo.js');

const viewOf = (themeId, scenes) => buildView({ invitation: demoInvitation(themeId), scenes: scenes || [] });
const ctxOf = (themeId, env = {}) => ({ view: viewOf(themeId), env });
const yes = () => true;

test('webglAvailable: false di lingkungan tanpa WebGL2', () => assert.equal(webglAvailable(), false));

test('pick3D: lima tema bergaya 3D memilih desainnya; tema lain tetap 2D', () => {
  const want = { 'pernikahan-adat-sasak': 'gapura', 'pernikahan-islami': 'navyemas', 'pernikahan-taman': 'sage', 'pernikahan-kerajaan': 'bordeaux', 'pernikahan-fantasi': 'biru' };
  for (const [theme, id] of Object.entries(want)) assert.equal(pick3D(ctxOf(theme), { probe: yes, search: '' }).id, id, theme);
  for (const theme of ['pernikahan-minimalis', 'pernikahan-futuristik', 'ulang_tahun-pesta']) assert.equal(pick3D(ctxOf(theme), { probe: yes, search: '' }), null, theme);
});

test('pick3D: perangkat lemah, gerak minimal, ?env3d=0, atau tanpa WebGL -> 2D', () => {
  const o = { probe: yes, search: '' };
  assert.equal(pick3D(ctxOf('pernikahan-taman', { light: true }), o), null);
  assert.equal(pick3D(ctxOf('pernikahan-taman', { reduced: true }), o), null);
  assert.equal(pick3D(ctxOf('pernikahan-taman'), { probe: yes, search: '?env3d=0' }), null);
  assert.equal(pick3D(ctxOf('pernikahan-taman'), { probe: () => false, search: '' }), null);
});

test('pick3D: ?env3d=<desain> memaksa desain tertentu, pilihan editor dipakai bila tidak ada query', () => {
  assert.equal(pick3D(ctxOf('pernikahan-minimalis'), { probe: yes, search: '?env3d=mauve' }).id, 'mauve');
  assert.equal(pick3D(ctxOf('pernikahan-taman'), { probe: yes, search: '?env3d=ngawur' }).id, 'sage');
  const view = viewOf('pernikahan-minimalis', [{ kind: 'amplop', position: 0, active: true, config: { design3d: 'zamrud' } }]);
  assert.equal(pick3D({ view, env: {} }, { probe: yes, search: '' }).id, 'zamrud');
});

test('tanpa WebGL: adegan langsung berupa amplop 2D (sinkron) dan tetap bisa dibuka', () => {
  const root = document.createElement('div'); document.body.append(root);
  const scene = mountEnvelopeAuto(root, ctxOf('pernikahan-taman'), { search: '' });
  assert.ok(root.querySelector('.env-stage'), 'amplop 2D tampil');
  assert.equal(root.querySelector('.env3d'), null);
  scene.destroy();
  assert.equal(root.children.length, 0);
});

test('kegagalan memuat modul 3D: jatuh ke amplop 2D, tidak macet di layar "Menyiapkan"', async () => {
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  const root = document.createElement('div'); document.body.append(root);
  const scene = mountEnvelopeAuto(root, ctxOf('pernikahan-taman'), { probe: yes, search: '' });
  assert.ok(root.querySelector('.env3d-loading'), 'status memuat tampil dulu');
  for (let i = 0; i < 40 && !root.querySelector('.env-stage'); i++) await new Promise((r) => setTimeout(r, 25));
  console.warn = warn;
  assert.ok(root.querySelector('.env-stage'), 'amplop 2D menggantikan');
  assert.equal(root.querySelector('.env3d-loading'), null);
  assert.ok(warned >= 1);
  scene.destroy();
});

test('destroy sebelum modul 3D selesai dimuat tidak memunculkan apa pun setelahnya', async () => {
  const warn = console.warn; console.warn = () => {};
  const root = document.createElement('div'); document.body.append(root);
  const scene = mountEnvelopeAuto(root, ctxOf('pernikahan-taman'), { probe: yes, search: '' });
  scene.destroy();
  await new Promise((r) => setTimeout(r, 300));
  console.warn = warn;
  assert.equal(root.children.length, 0);
});
