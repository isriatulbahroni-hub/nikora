import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playLiftChime } from './villa-lift-sound.js';

test('tanpa WebAudio: tidak error dan mengembalikan false', () => {
  assert.equal(playLiftChime(), false);
});

test('dengan WebAudio tiruan: dua nada dibuat dan dimulai', () => {
  const made = [];
  class FakeContext {
    constructor() {
      this.currentTime = 0;
      this.state = 'running';
      this.destination = {};
    }
    createOscillator() {
      const o = { frequency: {}, connect() {}, start(t) { o.started = t; }, stop() {} };
      made.push(o);
      return o;
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
  }
  globalThis.AudioContext = FakeContext;
  try {
    assert.equal(playLiftChime(), true);
    assert.equal(made.length, 2);
    assert.ok(made[1].started > made[0].started, 'nada kedua menyusul');
  } finally {
    delete globalThis.AudioContext;
  }
});
