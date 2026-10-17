import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CYCLE_MS, approach, nightAt } from './royal-time.js';

const utc = (h) => Date.UTC(2026, 9, 16, h);

test('mode tetap: senja selalu 0, malam selalu 1, siang selalu -1', () => {
  assert.equal(nightAt('sunset', 123456), 0);
  assert.equal(nightAt('night', 123456), 1);
  assert.equal(nightAt('day', 123456), -1);
});

test('mode otomatis tanpa epoch mengikuti jam asli: siang negatif, malam 1', () => {
  assert.equal(nightAt('auto', utc(5), undefined, undefined, 'WIB'), -1); // 12.00 WIB
  assert.equal(nightAt('auto', utc(15), undefined, undefined, 'WIB'), 1); // 22.00 WIB
  assert.equal(nightAt('auto', utc(11), undefined, undefined, 'WIB'), 0); // 18.00 WIB: senja keemasan
});

test('siklus otomatis: senja, peralihan naik, malam, peralihan turun, dan berulang', () => {
  const at = (u) => nightAt('auto', u * CYCLE_MS, 0);
  assert.equal(at(0.1), 0);
  assert.ok(at(0.5) > 0.4 && at(0.5) < 0.6);
  assert.equal(at(0.7), 1);
  assert.ok(at(0.96) > 0 && at(0.96) < 1);
  assert.equal(at(1.1), at(0.1));
  assert.equal(nightAt('auto', -CYCLE_MS * 0.9, 0), nightAt('auto', CYCLE_MS * 0.1, 0));
});

test('semua klien dengan epoch sama melihat langit sama', () => {
  assert.equal(nightAt('auto', 5_000_000, 1000), nightAt('auto', 5_000_000, 1000));
});

test('approach bergerak paling banyak rate per detik dan tidak melewati target', () => {
  assert.equal(approach(0, 1, 1, 0.25), 0.25);
  assert.equal(approach(0.9, 1, 1, 0.25), 1);
  assert.equal(approach(1, 0, 2, 0.25), 0.5);
});
