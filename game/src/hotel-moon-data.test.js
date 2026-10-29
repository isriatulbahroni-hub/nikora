import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOON, MOONLIGHT, earthshine, libration, moonApparentRadius, moonDirection, moonDiscVisibility, moonExtinction, moonGlowFade, moonGlowK, moonHemiGain,
  moonHorizonMask, moonLevel, moonModeFromSearch, moonSunGain, moonTint, moonUpFactor,
} from './hotel-moon-data.js';
import { SKY_FRAMES } from './hotel-sky-data.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} bukan ${b}`);

test('moonDirection: vektor satuan, searah cahaya malam', () => {
  const m = moonDirection();
  near(Math.hypot(...m), 1);
  const n = SKY_FRAMES.night.dir;
  const len = Math.hypot(...n);
  m.forEach((v, i) => near(v, n[i] / len));
});

test('ukuran bulan: lebih besar dari bulan asli tapi wajar, cincin es tepat 22 derajat, kecepatan ikut positif', () => {
  assert.ok(MOON.angularRadius > 0.0045 && MOON.angularRadius < 0.1);
  near((MOON.ringAngle * 180) / Math.PI, 22);
  assert.ok(MOON.starClearAngle > MOON.angularRadius * 3);
  assert.ok(MOON.followRate > 0);
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
  assert.ok(moonLevel(0) > 0 && moonLevel(0) < 0.5);
});

test('moonDiscVisibility: penuh di malam, pucat tapi tampak di siang, sabit lebih pucat dari purnama', () => {
  assert.equal(moonDiscVisibility(1, 0), 1);
  assert.equal(moonDiscVisibility(1, 1), 1);
  const dayFull = moonDiscVisibility(-1, 1);
  const dayCrescent = moonDiscVisibility(-1, 0.1);
  near(dayFull, 0.55);
  assert.ok(dayCrescent > 0.2 && dayCrescent < dayFull);
  let prev = 0;
  for (let p = -1; p <= 1.0001; p += 0.1) {
    const v = moonDiscVisibility(p, 0.5);
    assert.ok(v >= prev - 1e-12 && v <= 1);
    prev = v;
  }
});

test('faktor tinggi bulan: nol di bawah horizon, naik monoton, penuh di atas 17 derajat', () => {
  assert.equal(moonUpFactor(-0.5), 0);
  assert.equal(moonUpFactor(0), 0);
  assert.equal(moonUpFactor(0.3), 1);
  assert.equal(moonGlowFade(-0.5), 0);
  assert.equal(moonGlowFade(0.05), 1);
  assert.equal(moonHorizonMask(-0.1), 0);
  assert.equal(moonHorizonMask(0.06), 1);
  for (const fn of [moonUpFactor, moonGlowFade, moonHorizonMask]) {
    let prev = -1;
    for (let s = -1; s <= 1.0001; s += 0.02) {
      const v = fn(s);
      assert.ok(v >= prev - 1e-12 && v >= 0 && v <= 1);
      prev = v;
    }
  }
  assert.ok(moonGlowFade(0) > 0.5, 'bulan tepat di horizon masih berpendar');
});

test('moonExtinction: di horizon merah dan redup, di zenit putih dan terang', () => {
  const low = moonExtinction(0);
  const high = moonExtinction(1);
  near(low.warm, 1);
  near(low.dim, 0.55);
  near(high.warm, 0);
  near(high.dim, 1);
  assert.deepEqual(moonExtinction(-0.4), low);
});

test('moonApparentRadius: ilusi bulan, 22% lebih besar di horizon dan ukuran dasar di langit tinggi', () => {
  near(moonApparentRadius(1), MOON.angularRadius);
  near(moonApparentRadius(0), MOON.angularRadius * 1.22);
  assert.ok(moonApparentRadius(0.1) < moonApparentRadius(0) && moonApparentRadius(0.1) > moonApparentRadius(0.5));
});

test('moonTint: tiga komponen wajar, keemasan saat senja, makin jingga dan redup dekat horizon', () => {
  for (const p of [-1, 0, 0.3, 1]) {
    const c = moonTint(p);
    assert.equal(c.length, 3);
    assert.ok(c.every((v) => v > 0 && v <= 1.0001));
  }
  const dusk = moonTint(0.05);
  const night = moonTint(1);
  assert.ok(dusk[0] - dusk[2] > night[0] - night[2]);
  const low = moonTint(1, 1, 1);
  assert.ok(low[0] - low[2] > night[0] - night[2], 'warm menggeser ke jingga');
  const dim = moonTint(1, 0, 0.5);
  dim.forEach((v, i) => near(v, night[i] * 0.5));
});

test('terang bulan: menambah cahaya hanya di malam, saat bulan terang, dan saat bulan di atas horizon', () => {
  assert.equal(moonSunGain(-1, 1), 1);
  assert.equal(moonHemiGain(-1, 1), 1);
  near(moonSunGain(1, 1), 1 + MOONLIGHT.sun);
  near(moonHemiGain(1, 1), 1 + MOONLIGHT.hemi);
  assert.equal(moonSunGain(1, 0), 1, 'bulan baru tidak menambah cahaya');
  assert.equal(moonSunGain(1, 1, 0), 1, 'bulan di bawah horizon tidak menambah cahaya');
  near(moonSunGain(1, 1, 0.5), 1 + MOONLIGHT.sun * 0.5);
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
