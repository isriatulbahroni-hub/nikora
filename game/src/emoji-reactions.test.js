import test from 'node:test';
import assert from 'node:assert/strict';
import { EMOJIS, decodeReaction, encodeReaction } from './emoji-reactions.js';

test('encode lalu decode mengembalikan indeks yang sama untuk semua emoji', () => {
  for (let i = 0; i < EMOJIS.length; i += 1) assert.equal(decodeReaction(encodeReaction(i)), i);
});

test('encodeReaction menolak indeks di luar jangkauan atau bukan bilangan bulat', () => {
  for (const bad of [-1, EMOJIS.length, 1.5, NaN, '3', null, undefined]) assert.equal(encodeReaction(bad), null);
});

test('decodeReaction menolak teks biasa dan data ngawur dari jaringan', () => {
  for (const bad of ['halo', '', '::emo:', '::emo:-1', '::emo:abc', '::emo:3x', '::emo:99', '::emo:003', ` ::emo:1`, null, undefined, 42, {}]) {
    assert.equal(decodeReaction(bad), null, String(bad));
  }
});

test('daftar emoji tidak kosong dan tanpa duplikat', () => {
  assert.ok(EMOJIS.length >= 8);
  assert.equal(new Set(EMOJIS).size, EMOJIS.length);
});
