import test from 'node:test';
import assert from 'node:assert/strict';
import { defineActivity, createSession, SESSION_STATES } from './activity.js';
import { createRecall, RECALL_STATES } from './recall.js';

const def = defineActivity({ id: 'voli', label: 'Voli', category: 'olahraga', tone: 'ramai', minPlayers: 1, maxPlayers: 4 });
const running = () => { const s = createSession(def); s.join('a'); s.start(); return s; };

test('panggilan menjeda sesi berjalan, memblokir mulai, lalu melanjutkan saat selesai', () => {
  const a = running();
  const waiting = createSession(def);
  const recall = createRecall({ listSessions: () => [a, waiting] });
  const res = recall.call({ reason: 'pengantin-tampil', gatherZone: 'balairung' });
  assert.equal(res.ok, true);
  assert.equal(res.paused, 1);
  assert.equal(a.state, SESSION_STATES.paused);
  assert.equal(waiting.state, SESSION_STATES.waiting);
  assert.equal(recall.blocksStart, true);
  assert.equal(recall.arrive('a').arrived, 1);
  assert.equal(recall.begin().ok, true);
  assert.equal(recall.state, RECALL_STATES.onstage);
  assert.equal(recall.finish().resumed, 1);
  assert.equal(a.state, SESSION_STATES.running);
  assert.equal(recall.blocksStart, false);
  assert.equal(recall.arrivedCount, 0);
});

test('sesi yang sudah dijeda dengan alasan lain tidak ikut dilanjutkan', () => {
  const manual = running(); manual.pause();
  const other = running();
  const recall = createRecall({ listSessions: () => [manual, other] });
  recall.call({ reason: 'doa', gatherZone: 'aula-utama' });
  recall.finish();
  assert.equal(manual.state, SESSION_STATES.paused);
  assert.equal(other.state, SESSION_STATES.running);
});

test('validasi: alasan, tempat kumpul, panggilan ganda, tanpa panggilan', () => {
  const recall = createRecall({ listSessions: () => [] });
  assert.equal(recall.call({ reason: 'iseng', gatherZone: 'x' }).reason, 'alasan-tidak-valid');
  assert.equal(recall.call({ reason: 'doa' }).reason, 'tempat-kumpul-kosong');
  assert.equal(recall.arrive('a').reason, 'tidak-ada-panggilan');
  assert.equal(recall.begin().reason, 'tidak-ada-panggilan');
  assert.equal(recall.finish().reason, 'tidak-ada-panggilan');
  assert.equal(recall.call({ reason: 'doa', gatherZone: 'x' }).ok, true);
  assert.equal(recall.call({ reason: 'doa', gatherZone: 'x' }).reason, 'sedang-berlangsung');
  assert.equal(recall.arrive('').reason, 'pemain-tidak-valid');
  assert.equal(recall.begin().ok, true);
  assert.equal(recall.begin().reason, 'tidak-ada-panggilan');
});

test('batal saat memanggil juga melanjutkan permainan', () => {
  const a = running();
  const recall = createRecall({ listSessions: () => [a] });
  recall.call({ reason: 'foto-bersama', gatherZone: 'halaman' });
  assert.equal(recall.finish().ok, true);
  assert.equal(a.state, SESSION_STATES.running);
});
