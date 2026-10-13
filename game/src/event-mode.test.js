import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, modeFor } from './event-mode.js';

test('modeFor: bawaan menurut jenis acara, dapat ditimpa pemilik, nilai asing diabaikan', () => {
  assert.equal(modeFor('tazkirah').id, 'kajian');
  assert.equal(modeFor('tarannum').id, 'kajian');
  assert.equal(modeFor('karaoke').id, 'pesta');
  assert.equal(modeFor('pernikahan').id, 'umum');
  assert.equal(modeFor().id, 'umum');
  assert.equal(modeFor('pernikahan', 'kajian').id, 'kajian');
  assert.equal(modeFor('pernikahan', 'constructor').id, 'umum', 'nama bawaan objek tidak diterima');
  assert.equal(modeFor('tazkirah', '__proto__').id, 'kajian');
  assert.equal(modeFor('karaoke').duck, 1, 'pesta tidak dikecilkan');
  assert.ok(MODES.kajian.duck < MODES.umum.duck, 'kajian lebih fokus ke ustaz');
});
