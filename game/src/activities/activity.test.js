import test from 'node:test';
import assert from 'node:assert/strict';
import { defineActivity, createSession, rankScores, SESSION_STATES } from './activity.js';

const def = (over = {}) => defineActivity({ id: 'bulu-tangkis', label: 'Bulu Tangkis', category: 'olahraga', tone: 'ramai', minPlayers: 2, maxPlayers: 3, ...over });

test('defineActivity: validasi dan nilai bawaan', () => {
  const a = def();
  assert.equal(a.status, 'rencana');
  assert.equal(a.voluntary, false);
  assert.ok(Object.isFrozen(a));
  assert.throws(() => def({ id: 'Bulu Tangkis' }));
  assert.throws(() => def({ category: 'tidak-ada' }));
  assert.throws(() => def({ tone: 'bising' }));
  assert.throws(() => def({ minPlayers: 0 }));
  assert.throws(() => def({ minPlayers: 3, maxPlayers: 2 }));
  assert.throws(() => defineActivity(null));
});

test('sesi: masuk, penuh, mulai butuh pemain minimal', () => {
  const s = createSession(def());
  assert.deepEqual(s.start(), { ok: false, reason: 'kurang-pemain' });
  assert.equal(s.join('a').ok, true);
  assert.equal(s.join('a').reason, 'sudah-ikut');
  assert.equal(s.join('').reason, 'pemain-tidak-valid');
  s.join('b'); s.join('c');
  assert.deepEqual(s.join('d'), { ok: false, reason: 'penuh' });
  assert.equal(s.start().ok, true);
  assert.equal(s.start().reason, 'sudah-dimulai');
});

test('sesi: skor hanya saat berjalan, tak boleh negatif/NaN, jeda dan lanjut', () => {
  const s = createSession(def());
  s.join('a'); s.join('b');
  assert.equal(s.addScore('a', 1).reason, 'tidak-berjalan');
  s.start();
  assert.equal(s.addScore('x', 1).reason, 'bukan-peserta');
  assert.equal(s.addScore('a', -1).reason, 'skor-tidak-valid');
  assert.equal(s.addScore('a', NaN).reason, 'skor-tidak-valid');
  assert.equal(s.addScore('a', 3).ok, true);
  assert.equal(s.pause().ok, true);
  assert.equal(s.addScore('a', 1).reason, 'tidak-berjalan');
  assert.equal(s.resume().ok, true);
  assert.equal(s.score('a'), 3);
});

test('sesi: peringkat berseri berbagi peringkat, akhir bersifat tetap', () => {
  const s = createSession(def({ maxPlayers: 4 }));
  ['a', 'b', 'c'].forEach((p) => s.join(p));
  s.start();
  s.addScore('a', 5); s.addScore('b', 5); s.addScore('c', 2);
  const r = s.end();
  assert.deepEqual(r.map((e) => e.rank), [1, 1, 3]);
  assert.equal(s.state, SESSION_STATES.ended);
  assert.equal(s.end(), r, 'end kedua mengembalikan hasil yang sama');
  assert.equal(s.join('z').reason, 'selesai');
});

test('sesi: keluar hingga kurang pemain mengakhiri sesi yang berjalan', () => {
  const s = createSession(def());
  s.join('a'); s.join('b'); s.start();
  s.addScore('a', 4);
  assert.equal(s.leave('b').ok, true);
  assert.equal(s.state, SESSION_STATES.ended);
  assert.equal(s.ranking[0].playerId, 'a');
  assert.equal(s.leave('b').reason, 'bukan-peserta');
});

test('sesi menunggu tidak berakhir saat peserta keluar', () => {
  const s = createSession(def());
  s.join('a'); s.leave('a');
  assert.equal(s.state, SESSION_STATES.waiting);
});

test('rankScores: kosong tidak error', () => {
  assert.deepEqual(rankScores([]), []);
});
