import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT } from './badminton.js';
import { chooseMode, createPractice, planShot, simulateLanding } from './badminton-practice.js';

const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('planShot: clear, drop, dan smash mendarat dekat sasaran dan melewati net', () => {
  for (const [mode, target, from] of [
    ['clear', { x: 0.5, z: 5.3 }, { x: 0, y: 1.6, z: -3 }],
    ['drop', { x: -1, z: 1.7 }, { x: 0.5, y: 1.2, z: -3.5 }],
    ['smash', { x: 1, z: 3.4 }, { x: 0, y: 2.4, z: -2.5 }],
  ]) {
    const shot = planShot({ pos: from, side: 'a', target, mode });
    assert.ok(shot, `${mode}: ada lintasan`);
    assert.ok(shot.miss < 1.0, `${mode}: meleset ${shot.miss.toFixed(2)} m`);
    const n = Math.hypot(shot.dir.x, shot.dir.y, shot.dir.z);
    const landing = simulateLanding({ pos: from, vel: { x: shot.dir.x / n * (8 + 37 * shot.power), y: shot.dir.y / n * (8 + 37 * shot.power), z: shot.dir.z / n * (8 + 37 * shot.power) } });
    assert.equal(landing.clear, true);
    assert.ok(Math.abs(landing.x) <= COURT.width / 2 + 0.01 && landing.z > 0 && landing.z <= COURT.length / 2 + 0.01, `${mode}: mendarat di lapangan lawan`);
  }
});

test('chooseMode: tinggi = smash, dekat net = drop, lainnya clear', () => {
  assert.equal(chooseMode({ x: 0, y: 2.3, z: -3 }), 'smash');
  assert.equal(chooseMode({ x: 0, y: 1.0, z: -1 }), 'drop');
  assert.equal(chooseMode({ x: 0, y: 1.2, z: -4.5 }), 'clear');
});

test('latihan: servis pemain, aturan giliran, dan tidak bisa memukul sebelum waktunya', () => {
  const p = createPractice({ random: seeded(1) });
  assert.equal(p.phase, 'off');
  assert.equal(p.canHit({ x: 0, z: -3 }), false);
  p.start();
  assert.equal(p.phase, 'serve');
  assert.equal(p.canServe(), true);
  assert.equal(p.hit({ x: 0, z: -2 }).reason, 'tidak-bisa-memukul');
  assert.equal(p.serve({ power: 0.6 }).ok, true);
  assert.equal(p.phase, 'rally');
  assert.equal(p.canHit({ x: 0, z: -2 }), false, 'baru memukul sendiri (servis)');
  assert.equal(p.serve().reason, 'bukan-giliranmu');
});

/** Pemain otomatis: berdiri di bawah kok dan memukul bila bisa. */
function playMatch(seed, { botSkill, playerAims = 0, maxSeconds = 20000 }) {
  const p = createPractice({ botSkill, random: seeded(seed) });
  p.start();
  const hits = { a: 0, b: 0 };
  let points = 0;
  for (let t = 0; t < maxSeconds && p.phase !== 'over'; t += 1 / 60) {
    if (p.canServe()) p.serve({ power: 0.6 });
    const s = p.shuttle;
    const me = s ? { x: s.pos.x, z: Math.min(s.pos.z, -0.2) } : { x: 0, z: -4 };
    if (p.canHit(me) && p.hit(me, { aim: playerAims }).ok) hits.a += 1;
    for (const ev of p.tick(1 / 60, me)) {
      if (ev.type === 'hit') hits.b += 1;
      if (ev.type === 'point' || ev.type === 'over') points += 1;
    }
  }
  return { p, hits, points };
}

test('satu pertandingan penuh berjalan sampai selesai dengan skor yang sah', () => {
  const { p, hits, points } = playMatch(7, { botSkill: 0.8 });
  assert.equal(p.phase, 'over');
  const { a, b } = p.score;
  assert.ok(Math.max(a, b) >= 21 && Math.abs(a - b) >= 2 || Math.max(a, b) === 30, `skor akhir ${a}-${b}`);
  assert.equal(points, a + b);
  assert.ok(hits.a > 0 && hits.b > 0, 'ada reli dua arah');
  assert.equal(p.matchWinner, a > b ? 'a' : 'b');
});

test('bot lemah kalah dari pemain yang selalu sempat memukul; bot kuat lebih sering membalas', () => {
  const weak = playMatch(11, { botSkill: 0.15 });
  const strong = playMatch(11, { botSkill: 0.95 });
  assert.ok(weak.p.score.a > weak.p.score.b, `bot lemah: ${weak.p.score.a}-${weak.p.score.b}`);
  assert.ok(strong.hits.b > weak.hits.b, 'bot kuat lebih banyak membalas');
});

test('stop mengembalikan ke keadaan mati; mulai ulang skor kembali 0', () => {
  const p = createPractice({ random: seeded(3) });
  p.start();
  p.stop();
  assert.equal(p.active, false);
  assert.deepEqual(p.score, { a: 0, b: 0 });
  p.start();
  assert.deepEqual(p.score, { a: 0, b: 0 });
  assert.equal(p.phase, 'serve');
});
