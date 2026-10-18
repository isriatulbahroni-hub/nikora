import test from 'node:test';
import assert from 'node:assert/strict';
import { createDuel, createDuelMirror, parseSnapshot, canHitState } from './badminton-duel.js';

const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('ruang tunggu: pemain pertama = sisi a, kedua = sisi b, ketiga ditolak; join berulang aman', () => {
  const d = createDuel();
  assert.deepEqual(d.join('A'), { ok: true, side: 'a' });
  assert.equal(d.phase, 'lobby');
  assert.deepEqual(d.join('A'), { ok: true, side: 'a' });
  assert.deepEqual(d.join('B'), { ok: true, side: 'b' });
  assert.equal(d.phase, 'serve');
  assert.equal(d.join('C').reason, 'penuh');
  assert.equal(d.join('').reason, 'pemain-tidak-valid');
});

test('hanya penerima servis giliran yang boleh servis; sisi lain tidak bisa memukul sebelum kok datang', () => {
  const d = createDuel({ random: seeded(1) });
  d.join('A');
  assert.equal(d.canServe('A'), false, 'belum ada lawan');
  d.join('B');
  assert.equal(d.canServe('A'), true);
  assert.equal(d.canServe('B'), false);
  assert.equal(d.serve('B').reason, 'bukan-giliranmu');
  assert.equal(d.serve('A', { power: 0.62 }).ok, true);
  assert.equal(d.phase, 'rally');
  assert.equal(d.canHit('A', { x: 0, z: -2 }), false, 'A baru memukul (servis)');
  assert.equal(d.hit('A', { x: 0, z: -2 }).reason, 'tidak-bisa-memukul');
  assert.equal(d.hit('B', { x: 0, z: 9 }).reason, 'tidak-bisa-memukul', 'terlalu jauh');
});

test('canHitState: sisi, jangkauan, tinggi, dan pemukul terakhir', () => {
  const base = { phase: 'rally', lastHitSide: 'b', side: 'a', player: { x: 0, z: -3 }, shuttle: { pos: { x: 0.3, y: 1.2, z: -3.2 }, vel: { x: 0, y: -3, z: 0 } } };
  assert.equal(canHitState(base), true);
  assert.equal(canHitState({ ...base, lastHitSide: 'a' }), false);
  assert.equal(canHitState({ ...base, side: 'b', player: { x: 0, z: 3 } }), false, 'kok di sisi a');
  assert.equal(canHitState({ ...base, shuttle: { pos: { x: 0.3, y: 3.4, z: -3.2 }, vel: base.shuttle.vel } }), false, 'terlalu tinggi');
  assert.equal(canHitState({ ...base, player: { x: 2.5, z: -3 } }), false, 'terlalu jauh');
  assert.equal(canHitState({ ...base, phase: 'point' }), false);
});

/** Dua pemain skrip: mengejar titik jatuh kok pada kecepatan manusia dan memukul bila sempat. */
function playMatch(seed, speedA = 4.6, speedB = 4.6, maxSeconds = 20000) {
  const rnd = seeded(seed);
  const d = createDuel({ random: rnd });
  d.join('A');
  d.join('B');
  const pos = { A: { x: 0, z: -4.5 }, B: { x: 0, z: 4.5 } };
  const speed = { A: speedA, B: speedB };
  const home = { A: { x: 0, z: -4.5 }, B: { x: 0, z: 4.5 } };
  const hits = { A: 0, B: 0 };
  let events = 0;
  const dt = 1 / 60;
  for (let t = 0; t < maxSeconds && d.phase !== 'over'; t += dt) {
    if (d.canServe('A')) d.serve('A', { power: 0.62 });
    if (d.canServe('B')) d.serve('B', { power: 0.62 });
    const sh = d.shuttle;
    for (const id of ['A', 'B']) {
      const side = d.sideOf(id);
      let target = home[id];
      if (sh && d.phase === 'rally') {
        const onMine = side === 'a' ? sh.pos.z < 0 : sh.pos.z > 0;
        if (onMine && d.lastHitSide !== side) target = { x: sh.pos.x, z: sh.pos.z };
      }
      const dx = target.x - pos[id].x;
      const dz = target.z - pos[id].z;
      const dist = Math.hypot(dx, dz);
      const step = Math.min(dist, speed[id] * dt);
      if (dist > 1e-6) { pos[id].x += (dx / dist) * step; pos[id].z += (dz / dist) * step; }
      if (d.canHit(id, pos[id]) && d.hit(id, pos[id], { aim: rnd() * 2 - 1 }).ok) hits[id] += 1;
    }
    events += d.tick(dt).length;
  }
  return { d, hits, events };
}

test('satu pertandingan penuh antara dua pemain selesai dengan skor sah dan poin dari kedua sisi', () => {
  const { d, hits, events } = playMatch(5);
  assert.equal(d.phase, 'over');
  const { a, b } = d.score;
  assert.ok((Math.max(a, b) >= 21 && Math.abs(a - b) >= 2) || Math.max(a, b) === 30, `skor akhir ${a}-${b}`);
  assert.equal(events, a + b);
  assert.ok(hits.A > 0 && hits.B > 0);
  assert.equal(d.winnerSide, a > b ? 'a' : 'b');
});

test('pemain yang jauh lebih lambat kalah', () => {
  const { d } = playMatch(9, 1.2, 5.2);
  assert.equal(d.winnerSide, 'b');
});

test('sisi b menjaga simetri: pukulan b mendarat di lapangan a dan masuk garis', () => {
  const d = createDuel({ random: seeded(2) });
  d.join('A');
  d.join('B');
  d.serve('A', { power: 0.62 });
  let landedOk = false;
  for (let t = 0; t < 6 && !landedOk; t += 1 / 60) {
    const sh = d.shuttle;
    if (sh.pos.z > 1.8 && sh.pos.y < 2 && d.canHit('B', { x: sh.pos.x, z: sh.pos.z })) {
      assert.equal(d.hit('B', { x: sh.pos.x, z: sh.pos.z }, { aim: 0 }).ok, true);
      assert.ok(d.shuttle.vel.z < 0, 'menuju sisi a');
      landedOk = true;
    } else d.tick(1 / 60);
  }
  assert.ok(landedOk);
});

test('keluar di tengah pertandingan = WO; keluar di ruang tunggu menutup meja', () => {
  const d = createDuel();
  d.join('A');
  d.join('B');
  const res = d.leave('A');
  assert.equal(res.forfeit, true);
  assert.equal(d.phase, 'over');
  assert.equal(d.winnerSide, 'b');
  assert.equal(d.join('C').reason, 'selesai');
  const solo = createDuel();
  solo.join('A');
  assert.deepEqual(solo.leave('A'), { ok: true, forfeit: false, empty: true });
  assert.equal(solo.leave('A').reason, 'bukan-peserta');
});

test('snapshot: bentuk ringkas, nomor naik, dan lolos parseSnapshot', () => {
  const d = createDuel({ random: seeded(3) });
  d.join('A');
  d.join('B');
  d.serve('A');
  const s1 = d.snapshot();
  const s2 = d.snapshot();
  assert.equal(s2.q, s1.q + 1);
  assert.equal(s1.ph, 'rally');
  assert.equal(s1.sh.length, 6);
  assert.deepEqual(parseSnapshot(JSON.parse(JSON.stringify(s1))), s1);
});

test('parseSnapshot menolak data rusak/berbahaya', () => {
  assert.equal(parseSnapshot(null), null);
  assert.equal(parseSnapshot({ ph: 'rally' }), null);
  assert.equal(parseSnapshot({ ph: 'aneh', sc: [0, 0], q: 1 }), null);
  assert.equal(parseSnapshot({ ph: 'rally', sc: [0, 1000], q: 1 }), null);
  assert.equal(parseSnapshot({ ph: 'rally', sc: [0, 0], q: 1, sh: [1, 2, NaN, 0, 0, 0] }).sh, null);
  const p = parseSnapshot({ ph: 'lobby', sc: [0, 0], q: 4, a: 'x'.repeat(200), lh: 'zzz' });
  assert.equal(p.a.length, 64);
  assert.equal(p.lh, null);
});

test('cermin: abaikan snapshot basi, perkirakan kok di antara snapshot dengan galat kecil', () => {
  const d = createDuel({ random: seeded(4) });
  d.join('A');
  d.join('B');
  d.serve('A', { power: 0.62 });
  for (let i = 0; i < 20; i++) d.tick(1 / 60);
  const m = createDuelMirror();
  assert.equal(m.apply(d.snapshot(), 1000), true);
  assert.equal(m.apply({ ...d.snapshot(), q: 1 }, 1100), false, 'q lama');
  for (let i = 0; i < 6; i++) d.tick(1 / 60); // 0,1 dtk berlalu di tuan rumah
  const truth = d.shuttle.pos;
  const est = m.shuttleAt(1100).pos;
  assert.ok(Math.hypot(truth.x - est.x, truth.y - est.y, truth.z - est.z) < 0.05, 'galat < 5 cm');
  assert.equal(m.sideOf('A'), 'a');
  assert.equal(m.sideOf('B'), 'b');
  assert.equal(m.sideOf('Z'), null);
  m.reset();
  assert.equal(m.snap, null);
  assert.equal(m.shuttleAt(0), null);
});
