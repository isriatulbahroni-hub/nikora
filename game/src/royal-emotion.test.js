import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOODS, classifyMood } from './royal-emotion.js';
import { FX_MARK, decodeFx, encodeFx } from './royal-protocol.js';

test('ucapan romantis, kocak, doa, dan meriah dikenali', () => {
  assert.equal(classifyMood('Cinta sejati, sayang selamanya ❤').mood, 'romantic');
  assert.equal(classifyMood('wkwk lucu banget acaranya 😂').mood, 'funny');
  assert.equal(classifyMood('Semoga sakinah mawaddah warahmah, aamiin').mood, 'pray');
  assert.equal(classifyMood('Selamat ya, cantik banget!').mood, 'joy');
});

test('tanpa kata kunci: meriah; teks bukan string aman; bentuk sesuai suasana', () => {
  assert.equal(classifyMood('asdf').mood, 'joy');
  assert.equal(classifyMood(undefined).mood, 'joy');
  assert.equal(classifyMood('cinta').shape, MOODS.romantic.shape);
  assert.equal(classifyMood('haha').shape, 'crackle');
});

test('pesan efek: encode lalu decode, dan penolakan yang tidak sah', () => {
  assert.deepEqual(decodeFx(encodeFx('toast', 'meja_3')), { kind: 'toast', arg: 'meja_3' });
  assert.deepEqual(decodeFx(encodeFx('sky', 'night')), { kind: 'sky', arg: 'night' });
  assert.equal(decodeFx(encodeFx('sky', 'meledak')), null);
  assert.equal(decodeFx(`${FX_MARK}hack|x`), null);
  assert.equal(decodeFx('Semoga bahagia'), null);
  assert.equal(decodeFx(null), null);
});
