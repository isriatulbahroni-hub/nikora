import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, EVENT_TYPES, DEFAULT_THEME, resolveTheme, themesFor, getTheme } from '../src/themes/index.js';
import { contrast, isHex } from '../src/engine/color.js';
import { ctaInk } from '../src/scenes/envelope.js';
import { SCENERY_KINDS } from '../src/engine/scenery.js';

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
  assert.equal(resolveTheme(undefined, 'khitanan').id, DEFAULT_THEME.khitanan);
  assert.equal(resolveTheme(undefined, 'jenis-tak-dikenal').id, 'pernikahan-minimalis');
});

test('setiap jenis acara punya paket tema dan tema dasarnya valid', () => {
  for (const type of EVENT_TYPES) {
    assert.ok(themesFor(type).length >= 1, `${type} belum punya tema`);
    assert.equal(getTheme(DEFAULT_THEME[type]).eventType, type, `tema dasar ${type}`);
  }
  assert.equal(themesFor('khitanan').length, 2);
  assert.equal(themesFor('tazkirah').length, 2);
  assert.equal(themesFor('ulang_tahun').length, 3);
});

test('pemandangan latar tiap tema dikenal oleh generator', () => {
  for (const t of THEMES) assert.ok(SCENERY_KINDS.includes(t.scenery), `${t.id} scenery ${t.scenery}`);
});

test('tema berjenis kado (ulang tahun) memakai segel yang punya gaya', () => {
  const seals = new Set(['tenun', 'bintang8', 'lilin', 'mahkota', 'orb', 'titik', 'cincin', 'pita', 'perisai']);
  for (const t of THEMES) assert.ok(seals.has(t.envelope.seal), `${t.id} segel ${t.envelope.seal}`);
});
