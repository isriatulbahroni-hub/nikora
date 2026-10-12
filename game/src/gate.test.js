import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { contrast, formatEventDate, mountGate, readableOn, shouldShowGate } from './gate.js';
import { EVENT_THEMES, getGateTheme } from './event-themes.js';
import { THEMES } from '../../invitation/src/themes/index.js';

test('shouldShowGate: hanya untuk tamu dari undangan; ?nogate=1 melewati', () => {
  assert.equal(shouldShowGate('?e=dimas-rani'), true);
  assert.equal(shouldShowGate(''), false);
  assert.equal(shouldShowGate('?e=../x'), false);
  assert.equal(shouldShowGate('?e=dimas-rani&nogate=1'), false);
});

test('palet gerbang selalu sama dengan tema undangan (jalankan node game/scripts/sync-event-themes.mjs bila gagal)', () => {
  assert.equal(EVENT_THEMES.length, THEMES.length);
  for (const t of THEMES) {
    const g = getGateTheme(t.id);
    assert.equal(g.id, t.id);
    assert.equal(g.bg1, t.tokens.bg1, `${t.id} bg1`);
    assert.equal(g.accent2, t.tokens.accent2, `${t.id} accent2`);
    assert.equal(g.ink, t.tokens.stageInk, `${t.id} ink`);
    assert.equal(g.display, t.fonts.display, `${t.id} font`);
  }
  assert.equal(getGateTheme('tidak-ada', 'ulang_tahun').eventType, 'ulang_tahun');
  assert.equal(getGateTheme('tidak-ada', 'tidak-ada').id, 'orbit');
});

test('tombol Masuk terbaca di semua tema (kontras >= 3)', () => {
  for (const t of EVENT_THEMES) {
    const on = readableOn(t.accent2, t.bg1, t.ink);
    assert.ok(contrast(t.accent2, on) >= 3, `${t.id}: ${contrast(t.accent2, on).toFixed(2)}`);
  }
});

test('formatEventDate: tanggal Indonesia, zona waktu acara, input rusak aman', () => {
  assert.match(formatEventDate('2026-12-12T10:00:00+08:00', 'Asia/Makassar'), /12 Desember 2026/);
  assert.equal(formatEventDate(''), '');
  assert.equal(formatEventDate('bukan-tanggal'), '');
});

test('mountGate: tampil dengan sapaan tamu, memuat judul acara, pintu terbuka saat Masuk', async () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  const info = { slug: 'dimas-rani', groom: 'Dimas', bride: 'Rani', event_type: 'pernikahan', theme: 'pernikahan-adat-sasak', event_date: '2026-12-12T10:00:00+08:00', extra: { tz: 'Asia/Makassar' } };
  globalThis.document = dom.window.document;
  const fetchStub = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => [info] });
  try {
    const g = mountGate({ world: 'villa', search: '?e=dimas-rani&to=Budi', supabase: { url: 'https://x.supabase.co', key: 'k' }, doc: dom.window.document, reduced: true });
    assert.match(g.root.textContent, /Selamat datang, Budi/);
    await g.info;
    assert.match(g.root.querySelector('.gate-title').textContent, /Dimas & Rani/);
    assert.match(g.root.querySelector('.gate-meta').textContent, /NIKORA Wedding Villa/);
    assert.equal(g.root.style.getPropertyValue('--bg1'), getGateTheme('pernikahan-adat-sasak').bg1);
    let passed = false;
    g.passed.then(() => { passed = true; });
    g.root.querySelector('.gate-enter').click();
    await g.passed;
    assert.equal(passed, true);
    assert.equal(dom.window.document.querySelector('.gate'), null, 'gerbang dilepas setelah terbuka');
  } finally {
    globalThis.fetch = fetchStub;
  }
});
