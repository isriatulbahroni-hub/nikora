import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOON, MOONLIGHT, SYNODIC_DAYS, earthshine, libration, lightDirection, moonAge, moonDirection, moonFraction, moonGlowK, moonHemiGain, moonIllumination, moonLevel,
  moonModeFromSearch, moonPhaseState, moonSunGain, moonTint,
} from './hotel-moon-data.js';
import { SKY_FRAMES } from './hotel-sky-data.js';

const EPOCH = Date.UTC(2000, 0, 6, 18, 14, 0);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} bukan ${b}`);

test('moonDirection: vektor satuan, tinggi di langit, searah cahaya malam', () => {
  const m = moonDirection();
  near(Math.hypot(...m), 1);
  assert.ok(m[1] > 0.5, 'bulan tinggi di langit supaya terlihat dari tanah dan lantai atas');
  const n = SKY_FRAMES.night.dir;
  const len = Math.hypot(...n);
  m.forEach((v, i) => near(v, n[i] / len));
});

test('ukuran bulan: lebih besar dari bulan asli tapi tetap wajar, cincin es tepat 22 derajat', () => {
  assert.ok(MOON.angularRadius > 0.0045 && MOON.angularRadius < 0.1);
  near((MOON.ringAngle * 180) / Math.PI, 22);
  assert.ok(MOON.starClearAngle > MOON.angularRadius * 3, 'kerucut bebas bintang lebih lebar dari cakram dan pendar rapatnya');
});

test('moonLevel: tidak tampak di siang, penuh di malam, naik monoton, sudah mulai terbit saat senja', () => {
  assert.equal(moonLevel(-1), 0);
  assert.equal(moonLevel(1), 1);
  let prev = -1;
  for (let p = -1; p <= 1.0001; p += 0.05) {
    const v = moonLevel(p);
    assert.ok(v >= prev - 1e-12 && v >= 0 && v <= 1);
    prev = v;
  }
  assert.ok(moonLevel(0) > 0 && moonLevel(0) < 0.5, 'saat senja bulan baru terbit');
});

test('moonTint: tiga komponen wajar, keemasan saat senja dan lebih perak saat malam', () => {
  for (const p of [-1, 0, 0.3, 1]) {
    const c = moonTint(p);
    assert.equal(c.length, 3);
    assert.ok(c.every((v) => v > 0 && v <= 1.0001));
  }
  const dusk = moonTint(0.05);
  const night = moonTint(1);
  assert.ok(dusk[0] - dusk[2] > night[0] - night[2], 'senja lebih hangat (merah dikurangi biru lebih besar)');
});

test('terang bulan: menambah cahaya hanya di malam dan hanya bila bulan terang', () => {
  assert.equal(moonSunGain(-1, 1), 1);
  assert.equal(moonHemiGain(-1, 1), 1);
  near(moonSunGain(1, 1), 1 + MOONLIGHT.sun);
  near(moonHemiGain(1, 1), 1 + MOONLIGHT.hemi);
  assert.equal(moonSunGain(1, 0), 1, 'bulan baru tidak menambah cahaya');
  assert.ok(MOONLIGHT.hemi < MOONLIGHT.sun);
  let prev = 0;
  for (let p = -1; p <= 1.0001; p += 0.1) {
    const v = moonSunGain(p, 1);
    assert.ok(v >= prev - 1e-12);
    prev = v;
  }
});

test('moonGlowK dan earthshine: sabit lebih lembut, sisi gelap sabit lebih terlihat dari purnama', () => {
  near(moonGlowK(1), 1);
  near(moonGlowK(0), 0.4);
  assert.ok(moonGlowK(0.2) < moonGlowK(0.8));
  assert.equal(earthshine(1), 0);
  assert.ok(earthshine(0) > earthshine(0.5) && earthshine(0) <= 0.25);
});

test('moonAge: nol di bulan baru acuan, selalu dalam satu siklus, juga sebelum tanggal acuan', () => {
  near(moonAge(new Date(EPOCH)), 0);
  near(moonAge(new Date(EPOCH + (SYNODIC_DAYS / 2) * 86400000)), SYNODIC_DAYS / 2, 1e-6);
  for (const d of [new Date(Date.UTC(1999, 5, 1)), new Date(Date.UTC(2026, 9, 28)), new Date(Date.UTC(2100, 0, 1))]) {
    const a = moonAge(d);
    assert.ok(a >= 0 && a < SYNODIC_DAYS);
    const f = moonFraction(d);
    assert.ok(f >= 0 && f < 1);
  }
});

test('moonIllumination: 0 di bulan baru, 1 di purnama, simetris', () => {
  near(moonIllumination(0), 0);
  near(moonIllumination(0.5), 1);
  near(moonIllumination(0.25), 0.5);
  near(moonIllumination(0.2), moonIllumination(0.8));
});

test('lightDirection: purnama dari depan, sabit awal terang di kanan, sabit akhir terang di kiri, selalu satuan', () => {
  const full = lightDirection(0.5);
  near(full[0], 0);
  near(full[2], 1);
  const first = lightDirection(0.25);
  near(first[0], 1);
  near(first[2], 0);
  const last = lightDirection(0.75);
  near(last[0], -1);
  near(last[2], 0);
  const nm = lightDirection(0);
  near(nm[2], -1, 1e-9);
  for (let f = 0; f < 1; f += 0.07) near(Math.hypot(...lightDirection(f)), 1);
});

test('moonPhaseState: mode full selalu purnama, mode real mengikuti tanggal', () => {
  const full = moonPhaseState({ mode: 'full', date: new Date(EPOCH) });
  assert.equal(full.illumination, 1);
  assert.equal(full.waxing, false);
  const nm = moonPhaseState({ mode: 'real', date: new Date(EPOCH) });
  near(nm.illumination, 0);
  const q1 = moonPhaseState({ mode: 'real', date: new Date(EPOCH + (SYNODIC_DAYS / 4) * 86400000) });
  assert.equal(q1.waxing, true);
  near(q1.lightDir[0], 1, 1e-6);
  const q3 = moonPhaseState({ mode: 'real', date: new Date(EPOCH + ((3 * SYNODIC_DAYS) / 4) * 86400000) });
  assert.equal(q3.waxing, false);
  near(q3.lightDir[0], -1, 1e-6);
  const pm = moonPhaseState({ mode: 'real', date: new Date(EPOCH + (SYNODIC_DAYS / 2) * 86400000) });
  near(pm.illumination, 1, 1e-6);
});

test('moonModeFromSearch: bawaan purnama, ?moon=real atau nyata mengikuti tanggal, nilai asing diabaikan', () => {
  assert.equal(moonModeFromSearch(''), 'full');
  assert.equal(moonModeFromSearch(), 'full');
  assert.equal(moonModeFromSearch('?moon=real'), 'real');
  assert.equal(moonModeFromSearch('?sky=night&moon=nyata'), 'real');
  assert.equal(moonModeFromSearch('?moon=xyz'), 'full');
});

test('libration: terbatas pada goyangan maksimum dan nol bila gerak dimatikan', () => {
  for (let t = 0; t < 600; t += 7.3) {
    const [x, y] = libration(t, 1);
    assert.ok(Math.abs(x) <= MOON.maxLibration + 1e-12);
    assert.ok(Math.abs(y) <= MOON.maxLibration + 1e-12);
    assert.deepEqual(libration(t, 0), [0, 0]);
  }
});
