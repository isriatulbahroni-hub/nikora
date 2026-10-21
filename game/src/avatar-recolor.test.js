import test from 'node:test';
import assert from 'node:assert/strict';
import { HAIR_COLORS, OUTFITS, SKINS } from './avatar-config.js';
import { ORIGINAL, lighten, recolorSpec } from './avatar-recolor.js';

test('pilihan bawaan = tampilan asli model (tidak ada bagian yang diwarnai)', () => {
  const spec = recolorSpec({ o: ORIGINAL.outfit, s: ORIGINAL.skin, h: 1, k: ORIGINAL.hairColor, a: 0, m: 2 });
  assert.deepEqual(spec, { cloth: null, accent: null, hair: null, skin: null });
});

test('tanpa konfigurasi tidak mewarnai apa pun', () => {
  assert.deepEqual(recolorSpec(null), { cloth: null, accent: null, hair: null, skin: null });
});

test('Pakaian mengubah jaket dan aksen; rambut dan kulit tetap asli', () => {
  const spec = recolorSpec({ o: 3, s: ORIGINAL.skin, h: 1, k: ORIGINAL.hairColor, a: 0, m: 2 });
  assert.equal(spec.cloth, OUTFITS[3].hex);
  assert.equal(spec.accent, lighten(OUTFITS[3].hex, 0.3));
  assert.equal(spec.hair, null);
  assert.equal(spec.skin, null);
});

test('warna rambut dan kulit berdiri sendiri', () => {
  const spec = recolorSpec({ o: ORIGINAL.outfit, s: 4, h: 1, k: 3, a: 0, m: 2 });
  assert.equal(spec.hair, HAIR_COLORS[3].hex);
  assert.equal(spec.skin, SKINS[4].hex);
  assert.equal(spec.cloth, null);
  assert.equal(spec.accent, null);
});

test('lighten: 0 tidak mengubah, 1 jadi putih, hasil tetap 24 bit', () => {
  assert.equal(lighten(0x2e9e6b, 0), 0x2e9e6b);
  assert.equal(lighten(0x2e9e6b, 1), 0xffffff);
  const mid = lighten(0x000000, 0.5);
  assert.equal(mid, 0x808080);
});
