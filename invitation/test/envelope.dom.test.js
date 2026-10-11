import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
dom.window.HTMLCanvasElement.prototype.getContext = () => null; // jsdom tanpa kanvas: partikel harus jatuh ke no-op
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const { mountEnvelope } = await import('../src/scenes/envelope.js');
const { buildView } = await import('../src/engine/config.js');
const { demoInvitation } = await import('../src/engine/demo.js');
const { THEMES } = await import('../src/themes/index.js');

const mount = (themeId, query = {}, env = {}) => {
  const root = document.createElement('div');
  document.body.append(root);
  const view = buildView({ invitation: demoInvitation(themeId), query });
  return { root, scene: mountEnvelope(root, { view, env }), view };
};

for (const theme of THEMES) {
  test(`${theme.id}: segel dibuka -> surat naik -> tombol lanjut menyelesaikan adegan`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { root, scene, view } = mount(theme.id, { to: 'Bapak Ahmad' });
    const stage = root.querySelector('.env-stage');
    assert.equal(stage.dataset.state, 'closed');
    assert.equal(stage.dataset.variant, theme.envelope.variant);
    assert.equal(root.querySelector('.l-title').textContent, view.title);
    assert.equal(root.querySelector('.env-for strong').textContent, 'Bapak Ahmad');

    root.querySelector('.seal').click();
    assert.equal(stage.dataset.state, 'breaking');
    t.mock.timers.tick(400 * 3);
    assert.notEqual(stage.dataset.state, 'closed');
    t.mock.timers.tick(5000);
    assert.equal(stage.dataset.state, 'done');

    let finished = false;
    scene.done.then(() => { finished = true; });
    root.querySelector('.cta').click();
    await Promise.resolve();
    assert.equal(finished, true);
    scene.destroy();
    assert.equal(root.children.length, 0);
  });
}

test('tombol lewati langsung menampilkan surat tanpa menunggu animasi', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { root, scene } = mount('pernikahan-taman');
  const stage = root.querySelector('.env-stage');
  root.querySelector('.env-skip').click();
  assert.equal(stage.dataset.state, 'reading');
  t.mock.timers.tick(100);
  assert.equal(stage.dataset.state, 'done');
  scene.destroy();
});

test('reduced motion: tanpa urutan animasi, langsung terbuka', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { root, scene } = mount('pernikahan-islami', {}, { reduced: true });
  root.querySelector('.seal').click();
  t.mock.timers.tick(100);
  assert.equal(root.querySelector('.env-stage').dataset.state, 'done');
  scene.destroy();
});

test('tombol lanjut tidak berfungsi sebelum animasi selesai', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { root, scene } = mount('pernikahan-taman');
  let finished = false;
  scene.done.then(() => { finished = true; });
  root.querySelector('.cta').click();
  await Promise.resolve();
  assert.equal(finished, false);
  scene.destroy();
});

test('keamanan: nama tamu berisi HTML ditampilkan sebagai teks, bukan elemen', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const evil = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const { root, scene } = mount('pernikahan-taman', { to: evil });
  assert.equal(root.querySelectorAll('img, script').length, 0);
  assert.ok(root.querySelector('.env-for strong').textContent.includes('<img'));
  scene.destroy();
});

test('tombol suara bisa dimatikan/dinyalakan', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { root, scene } = mount('pernikahan-taman');
  const m = root.querySelector('.env-mute');
  m.click();
  assert.equal(m.getAttribute('aria-pressed'), 'true');
  m.click();
  assert.equal(m.getAttribute('aria-pressed'), 'false');
  scene.destroy();
});
