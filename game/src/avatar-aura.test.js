import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_PARTS, auraFor, dayPartIndex } from './avatar-aura.js';

test('dayPartIndex: batas jam fajar/siang/senja/malam dan nilai ngawur', () => {
  const expected = { 3: 3, 4: 0, 6: 0, 7: 1, 15: 1, 16: 2, 18: 2, 19: 3, 23: 3, 0: 3, 12: 1 };
  for (const [h, idx] of Object.entries(expected)) assert.equal(dayPartIndex(+h), idx, `jam ${h}`);
  assert.equal(dayPartIndex(NaN), 1);
  assert.equal(dayPartIndex(25), 3 === dayPartIndex(1) ? 3 : 3); // 25 -> 1 (malam)
  assert.equal(dayPartIndex(-1), 3); // -1 -> 23
  assert.equal(dayPartIndex(undefined), 1);
});

test('auraFor: deterministik, berbeda antar nama dan antar bagian hari, dan nilainya valid', () => {
  assert.deepEqual(auraFor({ name: 'Budi', part: 2 }), auraFor({ name: 'Budi', part: 2 }));
  assert.notDeepEqual(auraFor({ name: 'Budi', part: 2 }), auraFor({ name: 'Sari', part: 2 }));
  assert.notEqual(auraFor({ name: 'Budi', part: 0 }).label, auraFor({ name: 'Budi', part: 3 }).label);
  for (const name of ['', 'a', 'Nama Panjang Sekali 123', '😀', undefined, null]) {
    for (let part = 0; part < DAY_PARTS.length; part += 1) {
      const a = auraFor({ name, part });
      assert.ok(a.hue >= 0 && a.hue < 360, `hue ${a.hue}`);
      assert.ok(a.speed > 0.3 && a.speed < 1.2);
      assert.ok(Number.isInteger(a.sparks) && a.sparks > 0);
    }
  }
  assert.equal(auraFor({ name: 'x', part: 99 }).part, 'siang'); // indeks ngawur dari jaringan
  assert.equal(auraFor().part, 'siang');
});
