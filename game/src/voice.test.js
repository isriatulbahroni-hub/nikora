import test from 'node:test';
import assert from 'node:assert/strict';
import { VOICE, VoiceChat, voiceGain } from './voice.js';

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

test('VoiceChat.update: pembicara panggung terdengar penuh walau jauh, yang lain mengikuti jarak', () => {
  const chat = new VoiceChat({});
  chat.audio.set('mc', { volume: 0 });
  chat.audio.set('tamu', { volume: 0 });
  const players = [{ id: 'mc', x: 20, z: 20 }, { id: 'tamu', x: 20, z: 20 }];
  chat.update({ x: 0, z: 0 }, players, new Set(['mc']));
  assert.equal(chat.audio.get('mc').volume, 1);
  assert.equal(chat.audio.get('tamu').volume, 0);
});

import { VOICE_CROWD } from './voice.js';

function fakeVoice(ids) {
  const v = new VoiceChat({ LiveKit: {} });
  for (const id of ids) v.audio.set(id, { volume: -1 });
  return v;
}

test('VOICE_CROWD: hanya yang dekat terdengar, jauh hening, MC/pembicara tetap penuh', () => {
  const v = fakeVoice(['near', 'mid', 'far', 'mc']);
  const players = [
    { id: 'near', x: 1, z: 0 },
    { id: 'mid', x: 4, z: 0 },
    { id: 'far', x: 7, z: 0 },
    { id: 'mc', x: 60, z: 60 },
  ];
  v.update({ x: 0, z: 0 }, players, new Set(['mc']), VOICE_CROWD);
  assert.equal(v.audio.get('near').volume, 1);
  assert.ok(v.audio.get('mid').volume > 0 && v.audio.get('mid').volume < 1);
  assert.equal(v.audio.get('far').volume, 0, 'di luar 6 m tidak terdengar');
  assert.equal(v.audio.get('mc').volume, 1, 'MC terdengar dari jauh');
});

test('VOICE_CROWD: paling banyak 4 pembicara terdekat; MC tidak dihitung dalam batas itu', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'mc'];
  const v = fakeVoice(ids);
  const players = ids.slice(0, 6).map((id, i) => ({ id, x: 0.5 + i * 0.6, z: 0 }));
  players.push({ id: 'mc', x: 5, z: 0 });
  v.update({ x: 0, z: 0 }, players, new Set(['mc']), VOICE_CROWD);
  const audible = ids.slice(0, 6).filter((id) => v.audio.get(id).volume > 0);
  assert.deepEqual(audible, ['a', 'b', 'c', 'd'], 'hanya 4 terdekat');
  assert.equal(v.audio.get('mc').volume, 1);
});

test('canHear menolak lawan bicara di ruang lain walau dekat', () => {
  const v = fakeVoice(['wall']);
  v.update({ x: 0, z: 0 }, [{ id: 'wall', x: 1, z: 0 }], new Set(), { ...VOICE_CROWD, canHear: () => false });
  assert.equal(v.audio.get('wall').volume, 0);
});

test('update tanpa opsi tetap berperilaku seperti semula (aula lama)', () => {
  const v = fakeVoice(['x']);
  v.update({ x: 0, z: 0 }, [{ id: 'x', x: 9, z: 0 }]);
  assert.ok(v.audio.get('x').volume > 0, 'jarak 9 m masih terdengar dengan aturan bawaan (maks 12 m)');
});
