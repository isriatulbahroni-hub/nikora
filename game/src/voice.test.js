import test from 'node:test';
import assert from 'node:assert/strict';
import { VOICE, voiceGain } from './voice.js';

test('voiceGain: penuh dekat, menurun monoton, hening di luar jangkauan, aman untuk input aneh', () => {
  assert.equal(voiceGain(0), 1);
  assert.equal(voiceGain(VOICE.fullRange), 1);
  let prev = 1;
  for (let d = VOICE.fullRange + 0.5; d < VOICE.maxRange; d += 0.5) {
    const g = voiceGain(d);
    assert.ok(g <= prev && g > 0, `d=${d}`);
    prev = g;
  }
  assert.equal(voiceGain(VOICE.maxRange), 0);
  assert.equal(voiceGain(100), 0);
  assert.equal(voiceGain(NaN), 0);
});
