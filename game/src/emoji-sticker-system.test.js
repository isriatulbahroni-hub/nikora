import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBO_MAX_DISTANCE, COMBO_WINDOW_MS, PARTICLE_GLYPHS, STICKERS, comboFor, motionAt } from './emoji-sticker-system.js';

const indexOf = (id) => STICKERS.findIndex((s) => s.id === id);

test('katalog: id dan glyph unik, partikel dan gerak dikenal', () => {
  assert.equal(new Set(STICKERS.map((s) => s.id)).size, STICKERS.length);
  assert.equal(new Set(STICKERS.map((s) => s.glyph)).size, STICKERS.length);
  for (const s of STICKERS) {
    assert.ok(PARTICLE_GLYPHS[s.particles], s.id);
    assert.ok(['bounce', 'shake', 'sway', 'pulse', 'droop'].includes(s.motion), s.id);
  }
});

test('comboFor: hati+hati = fusion, api/marah+tangis = clash, selain itu null', () => {
  assert.equal(comboFor(indexOf('love'), indexOf('heart')), 'fusion');
  assert.equal(comboFor(indexOf('heart'), indexOf('heart')), 'fusion');
  assert.equal(comboFor(indexOf('fire'), indexOf('cry')), 'clash');
  assert.equal(comboFor(indexOf('cry'), indexOf('angry')), 'clash');
  assert.equal(comboFor(indexOf('love'), indexOf('cry')), null);
  assert.equal(comboFor(indexOf('clap'), indexOf('clap')), null);
  assert.equal(comboFor(-1, 99), null);
});

test('motionAt: diam di awal dan akhir, terbatas, tanpa NaN', () => {
  for (const motion of ['bounce', 'shake', 'sway', 'pulse', 'droop']) {
    for (const k of [0, 1, -3, 7]) assert.deepEqual(motionAt(motion, k), { y: 0, rx: 0, rz: 0, s: 1 }, `${motion} @ ${k}`);
    for (let k = 0; k <= 1; k += 0.01) {
      const m = motionAt(motion, k);
      for (const v of Object.values(m)) assert.ok(Number.isFinite(v));
      assert.ok(m.y >= 0 && m.y <= 0.2 && Math.abs(m.rz) <= 0.13 && m.rx >= 0 && m.rx <= 0.26 && m.s > 0.9 && m.s < 1.1);
    }
  }
});

test('motionAt: gerak tak dikenal tidak mengubah apa pun', () => {
  assert.deepEqual(motionAt('???', 0.5), { y: 0, rx: 0, rz: 0, s: 1 });
});

test('konstanta kombo masuk akal', () => {
  assert.ok(COMBO_WINDOW_MS >= 1000 && COMBO_MAX_DISTANCE > 0);
});
