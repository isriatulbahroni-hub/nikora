import test from 'node:test';
import assert from 'node:assert/strict';
import { THUNDER_COOLDOWN, createWeatherHaptics, thunderPattern } from './weather-haptics.js';

test('makin keras guntur makin panjang getarannya, yang pelan tidak bergetar', () => {
  assert.deepEqual(thunderPattern(0.05), []);
  assert.equal(thunderPattern(0.2).length, 3);
  assert.equal(thunderPattern(0.5).length, 3);
  assert.equal(thunderPattern(1).length, 5);
  const total = (p) => p.reduce((a, b) => a + b, 0);
  assert.ok(total(thunderPattern(1)) > total(thunderPattern(0.5)) && total(thunderPattern(0.5)) > total(thunderPattern(0.2)));
});

test('di dalam ruangan getaran guntur teredam', () => {
  assert.deepEqual(thunderPattern(0.7, 0), [90, 40, 140, 50, 220]);
  assert.deepEqual(thunderPattern(0.7, 1), [60, 40, 120]);
});

test('jeda antar getaran, saklar mati, dan getaran yang gagal tidak membuat galat', () => {
  let t = 0;
  const used = [];
  let on = true;
  const h = createWeatherHaptics({ vibrate: (p) => used.push(p), enabled: () => on, now: () => t });
  assert.equal(h.thunder(1).length, 5);
  assert.deepEqual(h.thunder(1), [], 'masih dalam jeda');
  t += THUNDER_COOLDOWN + 0.1;
  assert.equal(h.thunder(1).length, 5);
  assert.equal(used.length, 2);
  on = false;
  t += 10;
  assert.deepEqual(h.thunder(1), []);
  const boom = createWeatherHaptics({ vibrate: () => { throw new Error('tidak didukung'); }, now: () => 0 });
  assert.doesNotThrow(() => boom.thunder(1));
});
