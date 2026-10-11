import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, EVENT_TYPES, DEFAULT_THEME, resolveTheme, themesFor, getTheme } from '../src/themes/index.js';
import { contrast, isHex } from '../src/engine/color.js';
import { ctaInk } from '../src/scenes/envelope.js';

const TOKEN_KEYS = ['bg1', 'bg2', 'paper', 'letter', 'ink', 'accent', 'accent2', 'glow', 'stageInk', 'sealFill', 'sealInk'];

test('id tema unik, berawalan jenis acara, dan muat di kolom theme (<= 40)', () => {
  const ids = new Set();
  for (const t of THEMES) {
    assert.ok(!ids.has(t.id), `duplikat ${t.id}`);
    ids.add(t.id);
    assert.ok(EVENT_TYPES.includes(t.eventType), t.id);
    assert.ok(t.id.startsWith(`${t.eventType}-`), t.id);
    assert.ok(t.id.length <= 40, t.id);
  }
});

test('pernikahan punya 7 variasi yang tampil berbeda (pola, segel, partikel unik)', () => {
  const w = themesFor('pernikahan');
  assert.equal(w.length, 7);
  for (const key of ['pattern', 'seal', 'particles']) {
    assert.equal(new Set(w.map((t) => t.envelope[key])).size, 7, `${key} harus unik per variasi`);
  }
  assert.equal(new Set(w.map((t) => t.tokens.bg1 + t.tokens.bg2)).size, 7);
});

test('ulang tahun memakai varian kado, bukan amplop', () => {
  assert.equal(getTheme('ulang_tahun-pesta').envelope.variant, 'kado');
  assert.ok(themesFor('pernikahan').every((t) => t.envelope.variant === 'amplop'));
});

test('semua token lengkap dan berupa hex', () => {
  for (const t of THEMES) for (const k of TOKEN_KEYS) assert.ok(isHex(t.tokens[k]), `${t.id}.${k}`);
});

test('teks terbaca: kontras WCAG AA di setiap pasangan warna', () => {
  for (const t of THEMES) {
    const k = t.tokens;
    assert.ok(contrast(k.ink, k.letter) >= 4.5, `${t.id} ink/letter ${contrast(k.ink, k.letter).toFixed(2)}`);
    assert.ok(contrast(k.stageInk, k.bg1) >= 4.5, `${t.id} stageInk/bg1`);
    assert.ok(contrast(k.stageInk, k.bg2) >= 4.5, `${t.id} stageInk/bg2`);
    assert.ok(contrast(k.sealInk, k.sealFill) >= 3, `${t.id} sealInk/sealFill`);
    assert.ok(contrast(ctaInk(k), k.accent2) >= 4.5, `${t.id} tombol ${contrast(ctaInk(k), k.accent2).toFixed(2)}`);
  }
});

test('resolveTheme: id persis, tema dasar, lalu cadangan', () => {
  assert.equal(resolveTheme('pernikahan-islami', 'pernikahan').id, 'pernikahan-islami');
  assert.equal(resolveTheme('pernikahan', 'pernikahan').id, DEFAULT_THEME.pernikahan);
  assert.equal(resolveTheme('ulang_tahun', 'ulang_tahun').id, 'ulang_tahun-pesta');
  assert.equal(resolveTheme('klasik', 'pernikahan').id, DEFAULT_THEME.pernikahan);
  assert.equal(resolveTheme(undefined, 'khitanan').id, 'pernikahan-minimalis');
});
