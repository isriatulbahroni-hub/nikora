import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DARK, PRELUDE_DARK, PRELUDE_MS, createStorm, darkTarget, flashAlpha, flashAt, flashPattern, preludeDark, rainAudio, rainDark,
  scheduledPrelude, screenDark, strikeGap, streakAmount, thunderDelay, thunderVolume,
} from './storm-drama.js';
import { hotelFallback, publishShelter, readShelter } from './weather-shelter.js';

const seeded = (seed = 7) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

test('hujan tidak digambar di dalam ruangan atau kabin: guratan hilang sepenuhnya saat teduh', () => {
  assert.equal(streakAmount(0.9, 1), 0);
  assert.equal(streakAmount(0.9, 0.8), 0);
  assert.equal(streakAmount(1, 0.85), 0);
  assert.ok(streakAmount(0.9, 0) > 0.85);
  assert.ok(streakAmount(0.5, 0.3) < streakAmount(0.5, 0));
});

test('di dalam ruangan layar hampir tidak ikut menggelap dan kilat lebih redup', () => {
  assert.ok(screenDark(0.88, 1) < 0.1);
  assert.equal(screenDark(0.88, 0), 0.88);
  assert.ok(flashAlpha(1, 1) < 0.35 && flashAlpha(1, 1) > 0);
  assert.equal(flashAlpha(1, 0), 1);
});

test('langit: prelude menggelap, hujan makin deras makin gelap gulita, tanpa lompatan di sambungan', () => {
  assert.equal(preludeDark(0), 0);
  assert.ok(Math.abs(preludeDark(1) - PRELUDE_DARK) < 1e-9);
  assert.equal(rainDark(0), 0);
  assert.ok(Math.abs(rainDark(0.004) - PRELUDE_DARK) < 0.01, 'gerimis pertama melanjutkan gelap prelude');
  let prev = rainDark(0.004);
  for (let l = 0.01; l <= 1; l += 0.01) {
    const d = rainDark(l);
    assert.ok(d >= prev - 1e-9, 'makin deras tidak pernah makin terang');
    prev = d;
  }
  assert.ok(rainDark(0.85) >= MAX_DARK - 1e-9);
  assert.ok(MAX_DARK < 1, 'gelap gulita tapi tidak hitam penuh');
  assert.equal(darkTarget({ prelude: 1, level: 0 }), PRELUDE_DARK);
  assert.ok(darkTarget({ prelude: 0, level: 0.9 }) >= MAX_DARK - 1e-9);
});

test('kilat baru mulai setelah langit gelap, makin sering saat makin deras', () => {
  assert.equal(strikeGap({ prelude: 0.1, level: 0 }), Infinity);
  assert.equal(strikeGap({ prelude: 0, level: 0 }), Infinity);
  assert.ok(strikeGap({ prelude: 0.5, level: 0 }) < 14);
  assert.ok(strikeGap({ level: 0.14 }) > strikeGap({ level: 0.5 }));
  assert.ok(strikeGap({ level: 0.9 }) <= 6.01);
});

test('urutan: prelude gelap + kilat + guntur, SEBELUM hujan pertama (simulasi 40 dtk)', () => {
  const storm = createStorm({ rand: seeded(3) });
  let firstFlash = null;
  let firstThunder = null;
  const dt = 1 / 30;
  for (let i = 0; i < (PRELUDE_MS / 1000) * 30; i++) {
    const t = i * dt;
    const p = t / (PRELUDE_MS / 1000);
    const fx = storm.step(dt, { prelude: p, level: 0 });
    if (fx.flash > 0.2 && firstFlash === null) firstFlash = t;
    if (fx.thunder.length && firstThunder === null) firstThunder = t;
  }
  assert.ok(firstFlash !== null, 'ada kilat selama prelude');
  assert.ok(firstThunder !== null, 'ada guntur selama prelude');
  assert.ok(firstFlash >= 0.3 * (PRELUDE_MS / 1000) - 0.1, 'tidak ada kilat sebelum langit gelap');
  assert.ok(firstThunder > firstFlash, 'guntur menyusul kilat');
  assert.ok(firstThunder < PRELUDE_MS / 1000, 'guntur pertama sebelum gerimis');
});

test('saat deras kilat dan guntur lebih sering daripada saat gerimis', () => {
  const count = (level) => {
    const storm = createStorm({ rand: seeded(11) });
    let n = 0;
    for (let i = 0; i < 30 * 600; i++) n += storm.step(1 / 30, { prelude: 0, level }).thunder.length;
    return n;
  };
  assert.ok(count(0.9) > count(0.14) * 1.8);
});

test('bentuk kilat: terang sesaat lalu padam; guntur terlambat dan makin pelan bila jauh', () => {
  const pat = flashPattern(seeded(5));
  assert.ok(flashAt(pat, 0) > 0.6);
  assert.equal(flashAt(pat, 2), 0);
  for (let i = 0; i < 50; i++) {
    const d = thunderDelay(seeded(i + 1));
    assert.ok(d >= 0.35 && d <= 5.15);
  }
  assert.ok(thunderVolume(0.5, 1) > thunderVolume(5, 1));
  assert.ok(thunderVolume(1, 1) > thunderVolume(1, 0.1));
  assert.ok(thunderVolume(9, 0) >= 0.12);
});

test('suara hujan: desis di luar, ketukan atap saat teduh (lebih keras di kabin), nyaris senyap di ruangan', () => {
  const open = rainAudio({ level: 0.8, shelter: 0 });
  const room = rainAudio({ level: 0.8, shelter: 1 });
  const cabin = rainAudio({ level: 0.8, shelter: 1, cabin: true });
  assert.ok(open.hiss > 0.6 && open.roof === 0);
  assert.ok(room.hiss < open.hiss * 0.1);
  assert.ok(cabin.roof > room.roof);
  assert.equal(rainAudio({ level: 0, shelter: 0 }).hiss, 0);
});

test('prelude terjadwal: hanya dalam PRELUDE_MS sebelum hujan, tidak bila reda dipaksa atau ?cuaca=0', () => {
  assert.equal(scheduledPrelude({ next: null }), 0);
  assert.equal(scheduledPrelude({ next: { startsInMs: PRELUDE_MS + 1 } }), 0);
  assert.ok(Math.abs(scheduledPrelude({ next: { startsInMs: PRELUDE_MS / 2 } }) - 0.5) < 1e-9);
  assert.ok(scheduledPrelude({ next: { startsInMs: 1000 } }) > 0.95);
  assert.equal(scheduledPrelude({ next: { startsInMs: 1000 }, calmed: true }), 0);
  assert.equal(scheduledPrelude({ next: { startsInMs: 1000 }, random: false }), 0);
  assert.equal(scheduledPrelude({ next: { startsInMs: 0 }, level: 0 }), 1, 'hujan sudah mulai tapi gerimis belum tampak: gelap ditahan');
  assert.equal(scheduledPrelude({ next: { startsInMs: 0 }, level: 0.2 }), 0);
});

test('teduh: data segar dipakai, data basi diganti cadangan, kabin dihitung teduh penuh', () => {
  publishShelter({ indoor: 0.4, cabin: false }, 1000);
  let s = readShelter({ now: 1500 });
  assert.equal(s.fresh, true);
  assert.equal(s.k, 0.4);
  publishShelter({ indoor: 0, cabin: true }, 1000);
  assert.equal(readShelter({ now: 1200 }).k, 1);
  s = readShelter({ now: 5000, fallback: () => ({ indoor: 1, cabin: false }) });
  assert.equal(s.fresh, false);
  assert.equal(s.k, 1);
  assert.equal(readShelter({ now: 5000, fallback: () => { throw new Error('x'); } }).k, 0);
});

test('cadangan teduh dari window.__hotel: lantai atas atau ruangan beratap = teduh; kabin hanya saat mengemudi', () => {
  const hotel = (st, cockpit = false, driving = null) => ({ state: () => st, cockpit: () => cockpit, driving: () => driving });
  assert.deepEqual(hotelFallback(hotel({ level: 0, place: { indoor: false, inside: false } })), { indoor: 0, cabin: false });
  assert.equal(hotelFallback(hotel({ level: 0, place: { indoor: true, inside: true } })).indoor, 1);
  assert.equal(hotelFallback(hotel({ level: 12, place: {} })).indoor, 1);
  assert.equal(hotelFallback(hotel({ level: 0, place: {} }, true, { speed: 1 })).cabin, true);
  assert.equal(hotelFallback(hotel({ level: 0, place: {} }, true, null)).cabin, false);
  assert.deepEqual(hotelFallback(undefined), { indoor: 0, cabin: false });
});
