import test from 'node:test';
import assert from 'node:assert/strict';
import { pointMessage, scoreText } from './badminton-hud.js';

const names = { A: 'Kamu', B: 'Budi' };
const nameOf = (id) => names[id] ?? 'Tamu';
const snap = (over = {}) => ({ ph: 'rally', a: 'A', b: 'B', sc: [3, 2], sv: 'a', lh: 'a', lp: null, w: null, sh: null, q: 1, ...over });

test('papan skor menurut fase', () => {
  assert.equal(scoreText(null, nameOf), '');
  assert.equal(scoreText(snap({ ph: 'lobby', b: null, sc: [0, 0] }), nameOf), 'Kamu 0 – 0 … · menunggu lawan');
  assert.equal(scoreText(snap({ ph: 'serve' }), nameOf), 'Kamu 3 – 2 Budi · servis: Kamu');
  assert.equal(scoreText(snap({ ph: 'rally' }), nameOf), 'Kamu 3 – 2 Budi');
  assert.equal(scoreText(snap({ ph: 'over', sc: [21, 18], w: 'b' }), nameOf), 'Kamu 21 – 18 Budi · Budi menang');
});

test('pesan poin memuat alasan dan pemenang', () => {
  assert.equal(pointMessage(snap(), nameOf), null);
  assert.equal(pointMessage(snap({ lp: [5, 'b', 'net'] }), nameOf), 'Kok tersangkut di net · poin untuk Budi (3–2)');
  assert.equal(pointMessage(snap({ lp: [5, 'a', 'out'] }), nameOf), 'Kok keluar garis · poin untuk Kamu (3–2)');
  assert.equal(pointMessage(snap({ lp: [5, 'a', 'aneh'], b: null }), nameOf), 'Poin · poin untuk Kamu (3–2)');
  assert.equal(pointMessage(snap({ lp: [5, 'b'], a: 'A', b: null }), nameOf), null);
});
