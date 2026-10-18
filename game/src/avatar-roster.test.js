import test from 'node:test';
import assert from 'node:assert/strict';
import { HUMAN_ROSTER } from './avatar-roster.js';
import { CHARACTERS, sanitizeConfig } from './avatar-config.js';

test('roster: id unik, berkas .glb, dan CHARACTERS mengikuti urutannya', () => {
  const ids = HUMAN_ROSTER.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const h of HUMAN_ROSTER) assert.match(h.file, /^models\/[\w.-]+\.glb$/);
  assert.deepEqual(CHARACTERS.map((c) => c.id), [null, ...ids]);
  assert.equal(sanitizeConfig({ m: ids.length }).m, ids.length);
  assert.equal(sanitizeConfig({ m: ids.length + 1 }).m, 0);
});
