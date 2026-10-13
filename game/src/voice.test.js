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

import { selectAudible, stepVolume } from './voice.js';

const cand = (id, distance) => ({ id, distance, gain: 1 });

test('selectAudible: batas empat dijaga, tetapi yang sedang bicara didahulukan walau lebih jauh', () => {
  const cands = [cand('a', 1), cand('b', 1.2), cand('c', 1.4), cand('d', 1.6), cand('e', 1.8), cand('f', 5)];
  assert.deepEqual([...selectAudible({ candidates: cands, max: 4 })].sort(), ['a', 'b', 'c', 'd']);
  const lastSpoke = new Map([['f', 9000]]);
  const withSpeaker = selectAudible({ candidates: cands, max: 4, lastSpoke, now: 10000 });
  assert.equal(withSpeaker.size, 4);
  assert.ok(withSpeaker.has('f'), 'penutur yang jauh tetap terdengar');
  assert.ok(!withSpeaker.has('d'), 'yang diam dan paling jauh tergeser');
  const stale = selectAudible({ candidates: cands, max: 4, lastSpoke: new Map([['f', 1000]]), now: 10000 });
  assert.ok(!stale.has('f'), 'sudah lama diam: tidak lagi diprioritaskan');
});

test('selectAudible: urutan jarak yang bergeser tipis tidak memutus suara yang sudah terdengar (stickiness)', () => {
  const previous = new Set(['a', 'b', 'c', 'd']);
  const shifted = [cand('a', 1), cand('b', 1.1), cand('c', 1.2), cand('d', 1.3), cand('e', 1.25)]; // e sedikit lebih dekat dari d
  assert.ok(selectAudible({ candidates: shifted, max: 4, previous }).has('d'), 'd tetap terdengar');
  assert.ok(!selectAudible({ candidates: shifted, max: 4 }).has('d'), 'tanpa stickiness d akan tergeser');
  const muchCloser = [cand('a', 1), cand('b', 1.1), cand('c', 1.2), cand('d', 1.3), cand('e', 0.3)];
  assert.ok(selectAudible({ candidates: muchCloser, max: 4, previous }).has('e'), 'yang jauh lebih dekat tetap bisa menggeser');
});

test('stepVolume: naik/turun halus menuju target tanpa melampaui', () => {
  let v = 0;
  const seen = [];
  for (let i = 0; i < 12; i++) { v = stepVolume(v, 1); seen.push(v); }
  assert.ok(seen[0] > 0 && seen[0] < 1, 'tidak melompat');
  assert.equal(v, 1);
  assert.ok(seen.every((x, i) => i === 0 || x >= seen[i - 1]));
  assert.equal(stepVolume(1, 0.995), 0.995);
});

test('update: yang tergeser dari empat slot memudar halus, bukan terpotong mendadak; penutur baru masuk', () => {
  const v = new VoiceChat({ LiveKit: {} });
  const ids = ['a', 'b', 'c', 'd', 'e'];
  for (const id of ids) { v.audio.set(id, { volume: 0 }); v.vol.set(id, 0); }
  const spots = { a: 0.5, b: 0.6, c: 0.7, d: 0.8, e: 4 };
  const players = () => ids.map((id) => ({ id, x: spots[id], z: 0 }));
  for (let i = 0; i < 12; i++) v.update({ x: 0, z: 0 }, players(), new Set(), VOICE_CROWD, 1000 + i * 100);
  assert.ok(v.audio.get('d').volume > 0.9 && v.audio.get('e').volume === 0);
  // e mulai bicara: e masuk slot, d tergeser tetapi memudar bertahap
  v.speaking = () => new Set(['e']);
  v.update({ x: 0, z: 0 }, players(), new Set(), VOICE_CROWD, 3000);
  const d1 = v.audio.get('d').volume;
  assert.ok(d1 > 0 && d1 < 1, `d memudar (bukan langsung 0): ${d1}`);
  for (let i = 1; i < 12; i++) v.update({ x: 0, z: 0 }, players(), new Set(), VOICE_CROWD, 3000 + i * 100);
  assert.equal(v.audio.get('d').volume, 0);
  assert.ok(v.audio.get('e').volume > 0, 'penutur terdengar');
});

import { JSDOM } from 'jsdom';

function makeAudioEnv(playBehavior) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://nikora.test/' });
  const doc = dom.window.document;
  const handlers = {};
  const RoomEvent = { TrackSubscribed: 'ts', TrackUnsubscribed: 'tu', ParticipantDisconnected: 'pd', AudioPlaybackStatusChanged: 'aps', Reconnected: 'rc', Connected: 'cn', MediaDevicesError: 'mde', LocalTrackUnpublished: 'ltu' };
  const Track = { Kind: { Audio: 'audio' }, Source: { ScreenShareAudio: 'screen_share_audio', Microphone: 'microphone' } };
  let micCalls = [];
  let micFail = 0;
  const room = {
    canPlaybackAudio: false,
    remoteParticipants: new Map(),
    disconnect() {},
    on(e, f) { (handlers[e] ??= []).push(f); },
    emit(e, ...a) { for (const f of handlers[e] ?? []) f(...a); },
    startAudio: async () => { if (playBehavior.blocked) throw new Error('NotAllowed'); room.canPlaybackAudio = true; },
    localParticipant: {
      setMicrophoneEnabled: async (on) => { micCalls.push(on); if (on && micFail > 0) { micFail--; throw new Error('mic busy'); } },
      getTrackPublication: () => null,
    },
  };
  const makeEl = () => {
    const el = doc.createElement('audio');
    el.play = () => (playBehavior.blocked ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve());
    return el;
  };
  const track = (kind = 'audio') => ({ kind, source: 'microphone', attach: () => makeEl(), detach: () => [] });
  return { dom, doc, room, RoomEvent, Track, track, micCalls, setMicFail: (n) => { micFail = n; } };
}

test('ponsel menahan audio: muncul ajakan ketuk, sentuhan membukanya, dan hilang setelah berhasil', async () => {
  const behavior = { blocked: true };
  const env = makeAudioEnv(behavior);
  const chat = new VoiceChat({ LiveKit: { RoomEvent: env.RoomEvent, Track: env.Track }, doc: env.doc });
  await chat.attach(env.room);
  env.room.emit('ts', env.track(), { source: 'microphone' }, { identity: 'budi' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(chat.blocked, true);
  assert.match(env.doc.body.textContent, /Ketuk untuk menyalakan suara/);
  behavior.blocked = false;
  env.doc.dispatchEvent(new env.dom.window.Event('pointerdown'));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(chat.blocked, false);
  assert.doesNotMatch(env.doc.body.textContent, /Ketuk untuk menyalakan suara/);
  chat.dispose();
});

test('track pengganti tidak meninggalkan elemen audio yatim; keluar ruangan membersihkan elemen', async () => {
  const env = makeAudioEnv({ blocked: false });
  const chat = new VoiceChat({ LiveKit: { RoomEvent: env.RoomEvent, Track: env.Track }, doc: env.doc });
  await chat.attach(env.room);
  env.room.emit('ts', env.track(), { source: 'microphone' }, { identity: 'budi' });
  env.room.emit('ts', env.track(), { source: 'microphone' }, { identity: 'budi' });
  assert.equal(env.doc.querySelectorAll('audio').length, 1);
  env.room.emit('pd', { identity: 'budi' });
  assert.equal(env.doc.querySelectorAll('audio').length, 0);
  chat.dispose();
});

test('mic pulih sendiri setelah koneksi tersambung ulang atau track berhenti; gagal total memberi tahu pengguna', async () => {
  const env = makeAudioEnv({ blocked: false });
  const notices = [];
  const chat = new VoiceChat({ LiveKit: { RoomEvent: env.RoomEvent, Track: env.Track }, doc: env.doc });
  chat.onNotice = (t) => notices.push(t);
  await chat.attach(env.room);
  await chat.setMic(true);
  assert.equal(chat.micOn, true);
  env.micCalls.length = 0;
  env.room.emit('rc'); // tersambung ulang
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(env.micCalls, [false, true], 'mic dinyalakan ulang');
  assert.equal(chat.micOn, true);

  env.setMicFail(99); // perangkat mic tidak bisa dipakai
  chat.wantMic = true;
  const changes = [];
  chat.onChange = (on) => changes.push(on);
  env.room.emit('ltu', { source: 'microphone' });
  await new Promise((r) => setTimeout(r, 4500));
  assert.equal(chat.micOn, false);
  assert.equal(chat.wantMic, false);
  assert.equal(changes.at(-1), false);
  assert.match(notices.at(-1), /Mikrofon terputus/);
  chat.dispose();
});

test('panggung berbicara: obrolan jamaah mengecil (bukan mati), panggung tetap penuh, pulih setelah panggung diam', () => {
  const v = new VoiceChat({ LiveKit: {} });
  for (const id of ['ustaz', 'teman']) { v.audio.set(id, { volume: 0 }); v.vol.set(id, 0); }
  const players = [{ id: 'ustaz', x: 40, z: 0 }, { id: 'teman', x: 1, z: 0 }];
  const run = (t0, n, speaking) => { v.speaking = () => new Set(speaking); for (let i = 0; i < n; i++) v.update({ id: 'saya', x: 0, z: 0 }, players, new Set(['ustaz']), VOICE_CROWD, t0 + i * 100); };
  run(1000, 12, []); // sebelum ustaz datang: jamaah bebas ngobrol
  assert.equal(v.audio.get('teman').volume, 1, 'obrolan penuh saat panggung diam');
  run(2200, 12, ['ustaz']); // ustaz bicara
  const ducked = v.audio.get('teman').volume;
  assert.ok(ducked > 0.25 && ducked < 0.35, `mengecil ke ~30%, tidak mati: ${ducked}`);
  assert.equal(v.audio.get('ustaz').volume, 1, 'ustaz terdengar penuh dari jauh');
  run(3500, 3, []); // baru saja diam: masih dianggap bicara (jeda kecil antar kalimat)
  assert.ok(v.audio.get('teman').volume < 0.5, 'tidak langsung naik di sela kalimat');
  run(6000, 14, []); // diam cukup lama
  assert.equal(v.audio.get('teman').volume, 1, 'obrolan pulih');
});
