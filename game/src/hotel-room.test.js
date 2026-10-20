import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS, roomFor } from './token-issuer.js';

test('hotel punya ruang LiveKit sendiri, terpisah dari vila dan aula', () => {
  assert.equal(ROOMS.hotel, 'nikora-hotel');
  assert.equal(roomFor('hotel'), 'nikora-hotel');
  assert.equal(roomFor('hotel', 'budi-sari'), 'evt-budi-sari-hotel');
  assert.notEqual(roomFor('hotel'), roomFor('villa'));
});
