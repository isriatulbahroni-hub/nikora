import test from 'node:test';
import assert from 'node:assert/strict';
import { actionFor, findProfanity, MAX_WARNINGS, tokens, warningMessage } from './moderation.js';

const flagged = (t, o) => findProfanity(t, o).flagged;

test('kata kasar umum terdeteksi, kalimat biasa tidak', () => {
  assert.equal(flagged('dasar anjing kamu'), true);
  assert.equal(flagged('Selamat menempuh hidup baru, semoga bahagia!'), false);
  assert.equal(flagged('Asuransi dan pasukan sudah datang'), false); // bukan "asu"
  assert.equal(flagged('Babinsa hadir di acara'), false); // bukan "babi"
  assert.equal(flagged('Taiwan dan tainan'), false);
});

test('kelabuan umum: huruf diulang, angka, simbol, huruf dipisah', () => {
  assert.equal(flagged('anjiiiiing'), true);
  assert.equal(flagged('4njing'), true);
  assert.equal(flagged('anj1ng'), true);
  assert.equal(flagged('b@ngsat'), true);
  assert.equal(flagged('a n j i n g'), true);
  assert.equal(flagged('b.a.n.g.s.a.t'), true);
  assert.equal(flagged('KONTOL'), true);
  assert.equal(flagged('b4b1'), true);
});

test('imbuhan: kata panjang sebagai awalan, kata pendek hanya dengan akhiran lazim', () => {
  assert.equal(flagged('anjingnya'), true);
  assert.equal(flagged('ngentotin'), true);
  assert.equal(flagged('asunya'), true);
  assert.equal(flagged('babimu'), true);
  assert.equal(flagged('asuhan'), false);
});

test('tingkat ketat menambah kata ringan; normal tidak', () => {
  assert.equal(flagged('kamu goblok'), false);
  assert.equal(flagged('kamu goblok', { level: 'ketat' }), true);
});

test('allow mengecualikan kata, extra menambah kata', () => {
  assert.equal(flagged('Pak Babi hadir', { allow: ['babi'] }), false);
  assert.equal(flagged('dasar kuntilanak', { extra: ['kuntilanak'] }), true);
});

test('teks bukan string tidak melempar galat', () => {
  assert.equal(flagged(undefined), false);
  assert.equal(flagged(12345), false);
  assert.deepEqual(tokens(null), []);
});

test('kebijakan: 3 peringatan, pelanggaran ke-4 = ban', () => {
  assert.deepEqual(actionFor(1), { action: 'warn', strikes: 1, remaining: 2 });
  assert.deepEqual(actionFor(3), { action: 'warn', strikes: 3, remaining: 0 });
  assert.equal(actionFor(4).action, 'ban');
  assert.equal(actionFor(MAX_WARNINGS + 1).action, 'ban');
  assert.match(warningMessage(2), /2\/3/);
});
