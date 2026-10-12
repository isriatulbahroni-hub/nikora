import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const { createEngine } = await import('../src/engine/scene-engine.js');
const { buildView } = await import('../src/engine/config.js');
const { worldUrl } = await import('../src/engine/world-link.js');

test('kartu akhir: tombol masuk dunia membawa slug dan nama tamu; tanpa worldUrl tombol tidak muncul', async () => {
  const root = document.getElementById('app');
  const base = buildView({ invitation: { slug: 'dimas-rani', groom: 'Dimas', bride: 'Rani', event_type: 'pernikahan' }, query: { to: 'Budi' } });
  createEngine({ root, view: { ...base, worldUrl: worldUrl(base) }, env: { reduced: true } }).start();
  await new Promise((r) => setTimeout(r, 20));
  const link = root.querySelector('a.cta');
  assert.ok(link, 'tautan masuk dunia ada');
  assert.equal(link.textContent, 'Masuk ke dunia pernikahan');
  const u = new URL(link.getAttribute('href'));
  assert.equal(u.pathname, '/villa.html');
  assert.equal(u.searchParams.get('e'), 'dimas-rani');
  assert.equal(u.searchParams.get('to'), 'Budi');

  root.replaceChildren();
  createEngine({ root, view: base, env: { reduced: true } }).start();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(root.querySelector('a.cta'), null);
});
