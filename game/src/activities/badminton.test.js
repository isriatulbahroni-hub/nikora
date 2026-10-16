import test from 'node:test';
import assert from 'node:assert/strict';
import { createRally, createMatch, stepShuttle, inBounds, PHYSICS, COURT } from './badminton.js';

function fly(rally, maxSeconds = 10) {
  for (let t = 0; t < maxSeconds; t += 1 / 60) {
    const ev = rally.step(1 / 60);
    if (ev) return ev;
  }
  return null;
}
/** Terbangkan kok sampai melewati net lalu berhenti di tengah sisi `z` (untuk membalas). */
function flyUntil(rally, pred) {
  for (let t = 0; t < 10; t += 1 / 60) {
    if (pred(rally.shuttle.pos)) return true;
    if (rally.step(1 / 60)) return false;
  }
  return false;
}
const at = (p) => ({ x: p.x, y: p.y, z: p.z });

test('fisika: kecepatan jatuh bebas kok mendekati kecepatan terminal 6,8 m/s', () => {
  let s = { pos: { x: 0, y: 500, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
  for (let i = 0; i < 240 * 20; i++) s = stepShuttle(s, 1 / 240);
  assert.ok(Math.abs(Math.abs(s.vel.y) - PHYSICS.terminalSpeed) < 0.07);
});

test('fisika: hambatan membuat kok melambat tajam (smash 45 m/s turun di bawah 15 m/s dalam 0,5 dtk)', () => {
  let s = { pos: { x: 0, y: 2.5, z: 0 }, vel: { x: 0, y: 0, z: 45 } };
  for (let i = 0; i < 120; i++) s = stepShuttle(s, 1 / 240);
  assert.ok(Math.hypot(s.vel.x, s.vel.y, s.vel.z) < 15);
});

test('fisika deterministik: masukan sama, pendaratan sama', () => {
  const run = () => { const r = createRally(); r.serve('a', { power: 0.6, aimX: 0.3 }); return fly(r); };
  assert.deepEqual(run(), run());
});

test('servis cukup kuat melewati net dan jatuh di sisi lawan: poin untuk server', () => {
  const r = createRally();
  assert.equal(r.serve('a', { power: 0.6 }).ok, true);
  const ev = fly(r);
  assert.equal(ev.side, 'b');
  assert.equal(ev.inBounds, true);
  assert.equal(ev.netHit, false);
  assert.equal(ev.winner, 'a');
  assert.equal(r.phase, 'dead');
});

test('servis terlalu lemah menabrak net: poin untuk lawan', () => {
  const r = createRally();
  r.serve('a', { power: 0.05 });
  const ev = fly(r);
  assert.equal(ev.netHit, true);
  assert.equal(ev.side, 'a');
  assert.equal(ev.winner, 'b');
});

test('sisi b melakukan servis ke arah sebaliknya (simetris)', () => {
  const r = createRally();
  r.serve('b', { power: 0.6 });
  const ev = fly(r);
  assert.equal(ev.side, 'a');
  assert.equal(ev.winner, 'b');
});

test('membalas: pukulan masuk di sisi lawan memberi poin ke pemukul', () => {
  const r = createRally();
  r.serve('a', { power: 0.5 });
  assert.ok(flyUntil(r, (p) => p.z > 1.8 && p.y < 2));
  const res = r.swing('b', { racket: at(r.shuttle.pos), dir: { x: 0, y: 0.8, z: -1 }, power: 0.3 });
  assert.equal(res.ok, true);
  const ev = fly(r);
  assert.equal(ev.side, 'a');
  assert.equal(ev.inBounds, true);
  assert.equal(ev.winner, 'b');
});

test('pukulan terlalu panjang keluar garis: poin untuk lawan pemukul', () => {
  const r = createRally();
  r.serve('a', { power: 0.5 });
  assert.ok(flyUntil(r, (p) => p.z > 1.8 && p.y < 2));
  r.swing('b', { racket: at(r.shuttle.pos), dir: { x: 0, y: 0.3, z: -1 }, power: 1 });
  const ev = fly(r);
  assert.equal(ev.inBounds, false);
  assert.equal(ev.winner, 'a');
});

test('pukulan menyamping keluar lebar lapangan juga keluar', () => {
  const r = createRally();
  r.serve('a', { power: 0.5 });
  assert.ok(flyUntil(r, (p) => p.z > 1.8 && p.y < 2));
  r.swing('b', { racket: at(r.shuttle.pos), dir: { x: 1, y: 0.7, z: -0.4 }, power: 0.8 });
  const ev = fly(r);
  assert.equal(ev.inBounds, false);
  assert.equal(ev.winner, 'a');
});

test('aturan pukulan: terlalu jauh, kok di sisi lawan, dua kali berturut-turut, ayunan tidak valid', () => {
  const r = createRally();
  assert.equal(r.swing('a', { racket: { x: 0, y: 1, z: 0 }, dir: { x: 0, y: 1, z: 1 } }).reason, 'tidak-berjalan');
  r.serve('a', { power: 0.5 });
  assert.equal(r.serve('a').reason, 'sudah-berjalan');
  assert.equal(r.swing('b', { racket: at(r.shuttle.pos), dir: { x: 0, y: 1, z: -1 } }).reason, 'kok-di-sisi-lawan');
  assert.equal(r.swing('a', { racket: { x: 3, y: 1, z: -1.9 }, dir: { x: 0, y: 1, z: 1 } }).reason, 'terlalu-jauh');
  assert.equal(r.swing('a', { racket: at(r.shuttle.pos), dir: { x: 0, y: 0, z: 0 } }).reason, 'ayunan-tidak-valid');
  const dbl = r.swing('a', { racket: at(r.shuttle.pos), dir: { x: 0, y: 1, z: 1 } });
  assert.equal(dbl.reason, 'dua-kali');
  assert.equal(dbl.winner, 'b');
  assert.equal(r.phase, 'dead');
});

test('inBounds: garis dihitung masuk; singles lebih sempit', () => {
  assert.equal(inBounds({ x: COURT.width / 2, z: COURT.length / 2 }), true);
  assert.equal(inBounds({ x: COURT.width / 2 + 0.01, z: 0 }), false);
  assert.equal(inBounds({ x: 2.8, z: 0 }, { singles: true }), false);
});

test('skor: 21 dengan selisih 2, batas 30, server = pemenang reli', () => {
  const m = createMatch();
  for (let i = 0; i < 20; i++) { m.award('a'); m.award('b'); }
  assert.deepEqual(m.score, { a: 20, b: 20 });
  m.award('a');
  assert.equal(m.winner, null, 'belum selisih 2');
  assert.equal(m.server, 'a');
  m.award('b'); m.award('b');
  assert.equal(m.winner, null);
  assert.equal(m.server, 'b');
  m.award('b');
  assert.equal(m.winner, 'b');
  assert.equal(m.award('a').reason, 'selesai');
  const capped = createMatch();
  for (let i = 0; i < 29; i++) { capped.award('a'); capped.award('b'); }
  capped.award('a');
  assert.equal(capped.winner, 'a', 'poin ke-30 menang tanpa selisih');
  assert.equal(createMatch().award('c').reason, 'sisi-tidak-valid');
});
