import test from 'node:test';
import assert from 'node:assert/strict';
import { CAM_TRACK_NAME, VIDEO_CALL, VideoCall, camPublication, pickVideoPeers } from './video-call.js';

const peer = (id, x, z = 0, y = 0) => ({ id, x, z, y });

test('pickVideoPeers: hanya yang dalam jangkauan, paling banyak max, yang terdekat didahulukan', () => {
  const peers = [peer('a', 2), peer('b', 3), peer('c', 4), peer('d', 5), peer('jauh', VIDEO_CALL.range + 1)];
  const all = pickVideoPeers({ peers, self: { x: 0, z: 0 }, max: 10 });
  assert.deepEqual([...all].sort(), ['a', 'b', 'c', 'd'], 'yang di luar jangkauan tidak ikut');
  const two = pickVideoPeers({ peers, self: { x: 0, z: 0 }, max: 2 });
  assert.deepEqual([...two].sort(), ['a', 'b']);
});

test('pickVideoPeers: yang baru bicara didahulukan walau lebih jauh', () => {
  const peers = [peer('a', 2), peer('b', 3), peer('c', 4), peer('d', 9)];
  const lastSpoke = new Map([['d', 9_500]]);
  const picked = pickVideoPeers({ peers, self: { x: 0, z: 0 }, max: 2, lastSpoke, now: 10_000 });
  assert.ok(picked.has('d'), 'pembicara terbaru ikut');
  assert.ok(picked.has('a'), 'sisanya yang terdekat');
  assert.equal(picked.size, 2);
});

test('pickVideoPeers: beda lantai dihitung jauh; posisi ngawur tidak ikut', () => {
  const peers = [peer('lantai-lain', 0, 0, 6), peer('nan', Number.NaN, 0), peer('ok', 1, 1)];
  const picked = pickVideoPeers({ peers, self: { x: 0, z: 0, y: 0 }, max: 5 });
  assert.deepEqual([...picked], ['ok']);
});

test('pickVideoPeers: yang sudah tampil punya keunggulan (tidak gonta-ganti)', () => {
  const peers = [peer('lama', 5), peer('baru', 4.5)];
  const picked = pickVideoPeers({ peers, self: { x: 0, z: 0 }, max: 1, previous: new Set(['lama']), now: 1 });
  assert.deepEqual([...picked], ['lama']);
});

function fakePub(name = CAM_TRACK_NAME, kind = 'video') {
  return { trackName: name, kind, isSubscribed: false, track: null, calls: [], setSubscribed(v) { this.isSubscribed = v; this.calls.push(v); } };
}
function fakeParticipant(id, pubs) {
  return { identity: id, name: id, trackPublications: new Map(pubs.map((p, i) => [`t${i}`, p])) };
}
function makeCall(remotes, { maxTiles = 2 } = {}) {
  const room = { on() {}, activeSpeakers: [], remoteParticipants: new Map(remotes.map((p) => [p.identity, p])) };
  const vc = new VideoCall({ LiveKit: { RoomEvent: {} }, doc: null, nav: null, maxTiles });
  vc.room = room;
  return { vc, room };
}

test('camPublication: hanya video ber-nama kamera panggilan; siaran layar dan audio diabaikan', () => {
  const cam = fakePub();
  assert.equal(camPublication(fakeParticipant('a', [fakePub('screen'), fakePub(CAM_TRACK_NAME, 'audio'), cam])), cam);
  assert.equal(camPublication(fakeParticipant('b', [fakePub('screen')])), null);
  assert.equal(camPublication(null), null);
});

test('VideoCall.update: berlangganan hanya ke yang terpilih; yang jauh/berlebih dilepas supaya hemat data', () => {
  const pubs = { a: fakePub(), b: fakePub(), c: fakePub(), jauh: fakePub() };
  const screen = fakePub('layar-tancap');
  const remotes = [
    fakeParticipant('a', [pubs.a]),
    fakeParticipant('b', [pubs.b]),
    fakeParticipant('c', [pubs.c]),
    fakeParticipant('jauh', [pubs.jauh, screen]),
  ];
  const { vc } = makeCall(remotes, { maxTiles: 2 });
  const players = [peer('a', 2), peer('b', 3), peer('c', 4), peer('jauh', 50)];
  vc.update({ x: 0, z: 0 }, players, 1000);
  assert.equal(pubs.a.isSubscribed, true);
  assert.equal(pubs.b.isSubscribed, true);
  assert.equal(pubs.c.isSubscribed, false, 'melebihi batas kotak video');
  assert.equal(pubs.jauh.isSubscribed, false, 'di luar jangkauan');
  assert.deepEqual(screen.calls, [], 'siaran Layar Tancap tidak disentuh');
  // si c mendekat sampai lebih dekat dari b; a tetap karena sudah tampil
  vc.update({ x: 0, z: 0 }, [peer('a', 2), peer('b', 8), peer('c', 1), peer('jauh', 50)], 1300);
  assert.equal(pubs.c.isSubscribed, true);
  assert.equal(pubs.b.isSubscribed, false);
});

test('VideoCall.update: mode hemat (viewing=false) melepas semua video orang lain; bisa dinyalakan lagi', () => {
  const pub = fakePub();
  const { vc } = makeCall([fakeParticipant('a', [pub])]);
  const players = [peer('a', 2)];
  vc.update({ x: 0, z: 0 }, players, 1000);
  assert.equal(pub.isSubscribed, true);
  vc.setViewing(false);
  vc.update({ x: 0, z: 0 }, players, 1400);
  assert.equal(pub.isSubscribed, false);
  vc.setViewing(true);
  vc.update({ x: 0, z: 0 }, players, 1800);
  assert.equal(pub.isSubscribed, true);
});

test('VideoCall.update: peserta tanpa posisi diketahui atau tanpa kamera diabaikan', () => {
  const pub = fakePub();
  const { vc } = makeCall([fakeParticipant('a', [pub]), fakeParticipant('tanpa-kamera', [])]);
  vc.update({ x: 0, z: 0 }, [peer('tanpa-kamera', 1)], 1000); // 'a' belum mengirim posisi
  assert.deepEqual(pub.calls, []);
  assert.equal(vc.selected.size, 0);
});

test('VideoCall.tick: dibatasi sekitar 4x per detik', () => {
  const pub = fakePub();
  const { vc } = makeCall([fakeParticipant('a', [pub])]);
  const players = [peer('a', 2)];
  let updates = 0;
  const orig = vc.update.bind(vc);
  vc.update = (...args) => { updates += 1; return orig(...args); };
  for (let t = 1000; t < 2000; t += 16) vc.tick({ x: 0, z: 0 }, players, t);
  assert.ok(updates >= 3 && updates <= 5, `update dipanggil ${updates}x dalam 1 detik`);
});

test('VideoCall.setCamera: tanpa Room mengembalikan false tanpa error', async () => {
  const vc = new VideoCall({ LiveKit: {}, doc: null, nav: null });
  assert.equal(await vc.setCamera(true), false);
});
