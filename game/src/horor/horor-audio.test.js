import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audio } from './horor-audio.js';

// AudioContext tiruan: setiap properti/pemanggilan mengembalikan objek tiruan yang sama bentuknya, jadi
// seluruh graf WebAudio bisa dibangun tanpa peramban. Yang diuji: tidak ada galat dan tidak ada rujukan yang tertinggal.
function fakeNode() {
  const store = { state: 'running', currentTime: 0, sampleRate: 8000 };
  const p = new Proxy(function () {}, {
    apply: () => fakeNode(),
    get(_, k) {
      if (k === 'then') return undefined;
      if (k === 'close') return () => Promise.resolve();
      if (k === 'resume') return () => Promise.resolve();
      if (k === 'createBuffer') return (ch, len) => ({ getChannelData: () => new Float32Array(len), duration: len / 8000 });
      if (typeof k === 'symbol') return undefined;
      if (k in store) return store[k];
      return fakeNode(); // properti AudioParam (gain, frequency, ...) dan metode (connect, start, ...): bisa dibaca, dipanggil, dan dirantai
    },
    set(_, k, v) { store[k] = v; return true; },
  });
  return p;
}

function withFakeAudio(fn) {
  const AC = function () { return fakeNode(); };
  globalThis.window = { AudioContext: AC };
  try {
    audio.close();
    audio.unlock();
    return fn();
  } finally {
    audio.close();
    delete globalThis.window;
  }
}

const SFX = ['step', 'creak', 'swing', 'hit', 'kick', 'hurt', 'sting', 'pickup', 'knock', 'heart', 'drip', 'whisper', 'thud', 'crash', 'rumble', 'slam', 'shutter', 'hiss'];

test('audio: unlock membangun graf dan siap; close melepasnya', () => {
  withFakeAudio(() => {
    assert.equal(audio.ready, true);
    assert.ok(audio.ctx);
  });
  assert.equal(audio.ready, false);
  assert.equal(audio.ctx, null);
});

test('audio: semua efek suara yang dipertahankan ada dan tidak melempar galat', () => {
  withFakeAudio(() => {
    for (const name of SFX) {
      assert.equal(typeof audio.sfx[name], 'function', name);
      assert.doesNotThrow(() => audio.sfx[name].call(audio, audio.now(), 3, 4), name);
    }
    for (const surface of ['wood', 'tile', 'carpet', 'stone']) assert.doesNotThrow(() => audio.sfx.step.call(audio, audio.now(), 1, 1, surface), surface);
  });
});

test('audio: efek suara khusus game asli dan suara pengisi suara sudah dibuang', () => {
  for (const gone of ['slide', 'ghostHurt', 'purify', 'salt', 'rin', 'chime', 'chimeFar', 'farSteps', 'geta', 'voice', 'scream', 'teke', 'giggle', 'dawn', 'coin', 'bounce']) {
    assert.equal(audio.sfx[gone], undefined, gone);
  }
  for (const gone of ['speak', 'voLoad', 'voPrefetch', 'stopVoice', 'pianoStart', 'sing']) assert.equal(audio[gone], undefined, gone);
});

test('audio.play: tidak melempar saat konteks belum aktif atau nama efek salah', () => {
  audio.close();
  assert.doesNotThrow(() => audio.play('step', 0, 0));
  withFakeAudio(() => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.doesNotThrow(() => audio.play('tidak-ada', 0, 0));
    } finally {
      console.warn = warn;
    }
  });
});

test('audio: akustik per ruangan, ambience, listen, dan volume berjalan', () => {
  withFakeAudio(() => {
    for (const k of ['room', 'corridor', 'hall', 'tile', 'stair', 'outdoor', 'tidak-dikenal']) assert.doesNotThrow(() => audio.setAcoustics(k), k);
    assert.equal(audio.acoustic, 'room', 'jenis tak dikenal jatuh ke room');
    assert.doesNotThrow(() => audio.setAmbience(0.4, 0.05, 0));
    assert.doesNotThrow(() => audio.listen(1, 2, 1, 0));
    audio.setVolume('sound', 2);
    assert.equal(audio.vol.sound, 1, 'volume dijepit ke 0..1');
    audio.setVolume('sound', -1);
    assert.equal(audio.vol.sound, 0);
    audio.setVolume('sound', 1);
  });
});

test('audio.close idempoten dan unlock bisa dipanggil lagi sesudahnya (mulai-keluar-mulai)', () => {
  withFakeAudio(() => {});
  assert.doesNotThrow(() => { audio.close(); audio.close(); });
  withFakeAudio(() => assert.equal(audio.ready, true));
});
