import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../villa.html', import.meta.url), 'utf8');
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://nikora.test/' });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
const { mountVillaMenu } = await import('./villa-hud.js');
const { isScreenEnabled } = await import('./screen/screen-config.js');

const page = () => new JSDOM(html, { url: 'https://nikora.test/villa.html' }).window.document;

test('villa.html: semua id yang dipakai villa-main.js ada, tombol aksi di dock, ubin jarang-dipakai di menu', () => {
  const doc = page();
  for (const id of ['villa-root', 'place', 'online', 'minimap', 'cam-button', 'map-button', 'mic-button', 'menu-button', 'menu-sheet', 'menu-grid', 'menu-close', 'party-button', 'party-panel', 'party-body', 'party-close', 'act-button', 'toast', 'joy-zone', 'joy-base', 'joy-knob', 'villa-error', 'villa-error-text', 'villa-error-detail']) {
    assert.ok(doc.getElementById(id), `#${id} hilang`);
  }
  const dock = doc.getElementById('dock');
  for (const id of ['cam-button', 'map-button', 'mic-button', 'menu-button']) assert.ok(dock.contains(doc.getElementById(id)), `#${id} harus di dock`);
  assert.ok(doc.getElementById('menu-grid').contains(doc.getElementById('party-button')), 'Panggung MC ada di menu');
  assert.ok(dock.classList.contains('rbs'), 'tombol 😊 dipasang di dock lewat .rbs');
  assert.equal(doc.getElementById('mic-button').hidden, true);
  assert.equal(doc.getElementById('party-button').hidden, true);
  assert.equal(doc.getElementById('menu-sheet').hidden, true);
});

test('villa.html menyalakan layar/TV secara bawaan; ?layar=0 mematikan', () => {
  const doc = page();
  assert.equal(isScreenEnabled('', doc), true);
  assert.equal(isScreenEnabled('?acara=abc', doc), true);
  assert.equal(isScreenEnabled('?layar=0', doc), false);
});

test('menu ≡: buka-tutup, aria-expanded, tutup lewat ✕, Escape, ketukan di luar, dan saat ubin diketuk', () => {
  const doc = page();
  const menu = mountVillaMenu(doc);
  const button = doc.getElementById('menu-button');
  const sheet = doc.getElementById('menu-sheet');
  const win = doc.defaultView;
  assert.equal(menu.isOpen(), false);

  button.click();
  assert.equal(sheet.hidden, false);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  button.click();
  assert.equal(sheet.hidden, true);
  assert.equal(button.getAttribute('aria-expanded'), 'false');

  button.click();
  doc.getElementById('menu-close').click();
  assert.equal(menu.isOpen(), false);

  button.click();
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(menu.isOpen(), false);

  button.click();
  doc.getElementById('villa-root').dispatchEvent(new win.Event('pointerdown', { bubbles: true }));
  assert.equal(menu.isOpen(), false);

  // pointerdown di dalam lembar tidak menutupnya (ketukan baru dianggap lewat click ubin)
  button.click();
  doc.getElementById('menu-grid').dispatchEvent(new win.Event('pointerdown', { bubbles: true }));
  assert.equal(menu.isOpen(), true);
  // ubin yang dipasang belakangan oleh modul lain (📷 Kamera, 🎬 Layar) juga menutup lembar saat diketuk
  const tile = doc.createElement('button');
  tile.className = 'sheet-tile';
  doc.getElementById('menu-grid').append(tile);
  tile.click();
  assert.equal(menu.isOpen(), false);
});

test('mountVillaMenu: tanpa kerangka menu mengembalikan null dan tidak error', () => {
  const bare = new JSDOM('<!doctype html><body></body>').window.document;
  assert.equal(mountVillaMenu(bare), null);
});
