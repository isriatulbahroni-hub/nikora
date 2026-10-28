import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAZE, GHOSTS, MOON_HAPTIC_MIN, approach, bathLevel, coldLevel, createMoonBath, createMoonHaptics, ghostPositions, gazeLevel, moonBeat, moonHapticsEnabled,
} from './hotel-moon-4d.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} bukan ${b}`);

test('gazeLevel: nol membelakangi dan di 45 derajat, satu tepat menatap, naik monoton', () => {
  assert.equal(gazeLevel(-1), 0);
  assert.equal(gazeLevel(GAZE.wide), 0);
  assert.equal(gazeLevel(1), 1);
  let prev = -1;
  for (let c = -1; c <= 1.0001; c += 0.02) {
    const v = gazeLevel(c);
    assert.ok(v >= prev - 1e-12 && v >= 0 && v <= 1);
    prev = v;
  }
});

test('bathLevel: butuh tatapan, bulan tampak, dan di luar ruangan; makin tinggi dan makin terang makin kuat', () => {
  const base = { gaze: 1, moon: 1, altitude: 0.5, indoor: 0, illumination: 1 };
  assert.ok(bathLevel(base) > 0 && bathLevel(base) <= 1);
  assert.equal(bathLevel({ ...base, gaze: 0 }), 0);
  assert.equal(bathLevel({ ...base, moon: 0 }), 0, 'siang: tidak ada mandi cahaya bulan');
  assert.equal(bathLevel({ ...base, indoor: 1 }), 0, 'di dalam ruangan tidak ada');
  assert.equal(bathLevel({ ...base, active: false }), 0);
  assert.ok(bathLevel({ ...base, altitude: 1 }) > bathLevel({ ...base, altitude: 0 }));
  assert.ok(bathLevel({ ...base, illumination: 1 }) > bathLevel({ ...base, illumination: 0.1 }), 'sabit tipis lebih lembut dari purnama');
  assert.ok(bathLevel({ ...base, altitude: 0, illumination: 0.1 }) > 0, 'sabit di tanah tetap terasa sedikit');
  near(bathLevel({ ...base, altitude: 1 }), 1);
});

test('coldLevel: nol di bawah, penuh di puncak, nol di siang dan di dalam ruangan', () => {
  assert.equal(coldLevel({ altitude: 0.2, moon: 1 }), 0);
  near(coldLevel({ altitude: 1, moon: 1 }), 1);
  assert.equal(coldLevel({ altitude: 1, moon: 0 }), 0);
  assert.equal(coldLevel({ altitude: 1, moon: 1, indoor: 1 }), 0);
  assert.equal(coldLevel({ altitude: 1, moon: 1, active: false }), 0);
  let prev = 0;
  for (let a = 0; a <= 1.0001; a += 0.05) {
    const v = coldLevel({ altitude: a, moon: 1 });
    assert.ok(v >= prev - 1e-12);
    prev = v;
  }
});

test('approach: bergerak ke target tanpa melewatinya, tidak bergerak bila dt nol', () => {
  assert.equal(approach(0.2, 1, 0, 3), 0.2);
  const a = approach(0, 1, 0.1, 3);
  assert.ok(a > 0 && a < 1);
  assert.ok(approach(a, 1, 0.1, 3) > a);
  assert.ok(approach(1, 0, 0.5, 3) < 1);
  assert.ok(approach(0, 1, 100, 3) <= 1);
  assert.equal(approach(0.5, 1, -1, 3), 0.5, 'dt negatif diperlakukan nol');
});

test('moonBeat: diam di bawah ambang, makin kuat dan rapat bila makin kuat levelnya, tetap pelan', () => {
  assert.equal(moonBeat(0), null);
  assert.equal(moonBeat(MOON_HAPTIC_MIN - 0.01), null);
  assert.equal(moonBeat(NaN), null);
  const lo = moonBeat(MOON_HAPTIC_MIN);
  const hi = moonBeat(1);
  assert.ok(lo && hi);
  assert.ok(hi.gap < lo.gap && hi.ms > lo.ms);
  assert.ok(hi.gap >= 1.4 - 1e-9 && lo.gap <= 2.6, 'jeda antara 1,4 dan 2,6 detik: pelan seperti napas');
  assert.ok(hi.ms <= 16);
});

test('moonHapticsEnabled: bisa dimatikan lewat ?bulan4d=0, ?getar=0, atau kurangi gerakan', () => {
  assert.equal(moonHapticsEnabled('', false), true);
  assert.equal(moonHapticsEnabled('?bulan4d=0', false), false);
  assert.equal(moonHapticsEnabled('?getar=0', false), false);
  assert.equal(moonHapticsEnabled('', true), false);
});

test('createMoonHaptics: bergetar sesuai jeda, diam bila nonaktif atau terlalu lemah, tahan galat', () => {
  const calls = [];
  const buzz = createMoonHaptics({ vibrate: (ms) => calls.push(ms) });
  assert.equal(buzz(0, 0.1), 0);
  const first = buzz(0, 1);
  assert.ok(first > 0 && calls.length === 1);
  assert.equal(buzz(0.5, 1), 0, 'masih dalam jeda');
  assert.ok(buzz(3, 1) > 0 && calls.length === 2);
  const off = createMoonHaptics({ vibrate: (ms) => calls.push(ms), enabled: false });
  assert.equal(off(100, 1), 0);
  assert.equal(calls.length, 2);
  const broken = createMoonHaptics({ vibrate: () => { throw new Error('gagal'); } });
  assert.ok(broken(0, 1) > 0, 'galat getaran diabaikan');
});

test('bayangan lensa: data wajar dan posisi mengikuti garis bulan ke pusat layar', () => {
  assert.ok(GHOSTS.length >= 3);
  for (const g of GHOSTS) {
    assert.ok(g.t > 0 && g.r > 0 && g.r < 0.3 && g.a > 0 && g.a < 0.3);
    assert.equal(g.hue.length, 3);
    assert.ok(g.hue.every((v) => v >= 0 && v <= 255));
  }
  const w = 400;
  const h = 200;
  const pos = ghostPositions(0.2, 0.25, w, h);
  assert.equal(pos.length, GHOSTS.length);
  const mx = 0.2 * w;
  const my = 0.25 * h;
  pos.forEach((p, i) => {
    const g = GHOSTS[i];
    near(p.x, mx + (w / 2 - mx) * g.t);
    near(p.y, my + (h / 2 - my) * g.t);
    near(p.r, g.r * h);
  });
  const centered = ghostPositions(0.5, 0.5, w, h);
  centered.forEach((p) => {
    near(p.x, w / 2);
    near(p.y, h / 2);
  });
});

test('createMoonBath: tanpa DOM atau dimatikan tidak berbuat apa-apa dan tidak melempar galat', () => {
  const bath = createMoonBath({ doc: null, win: null });
  bath.update({ level: 1, cold: 1, sx: 0.5, sy: 0.5 });
  assert.equal(bath.info().on, false);
  bath.dispose();
  const off = createMoonBath({ search: '?bulan4d=0', doc: { createElement() { throw new Error('tidak boleh dipanggil'); } }, win: {} });
  assert.equal(off.info().on, false);
});
