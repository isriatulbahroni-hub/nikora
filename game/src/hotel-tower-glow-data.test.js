import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAM, ENV_ALT_STEP, ENV_MIN_INTERVAL, ENV_PHASE_STEP, ZONE_TINT_STOPS, beamAngle, beamLevel, envStale, glowPulse, reflectionIntensity, structureGlow, zoneTint } from './hotel-tower-glow-data.js';

test('zoneTint: ujung bawah dan atas sama dengan titik warna, tengah di antaranya', () => {
  assert.deepEqual(zoneTint(0, 20), [...ZONE_TINT_STOPS[0]]);
  const top = zoneTint(19, 20);
  top.forEach((v, i) => assert.ok(Math.abs(v - ZONE_TINT_STOPS[2][i]) < 1e-9));
  const mid = zoneTint(10, 21);
  mid.forEach((v, i) => assert.ok(Math.abs(v - ZONE_TINT_STOPS[1][i]) < 1e-9));
});

test('zoneTint: makin ke atas makin terang dan selalu 3 komponen positif', () => {
  let prev = -1;
  for (let z = 0; z < 20; z++) {
    const c = zoneTint(z, 20);
    assert.equal(c.length, 3);
    assert.ok(c.every((v) => v > 0));
    const lum = c[0] + c[1] + c[2];
    assert.ok(lum >= prev - 1e-9, `zona ${z} lebih gelap dari zona di bawahnya`);
    prev = lum;
  }
  assert.deepEqual(zoneTint(0, 1), [...ZONE_TINT_STOPS[0]]); // satu zona saja: tidak membagi nol
});

test('tingkat nyala: padam di siang, penuh di malam, naik monoton', () => {
  for (const f of [structureGlow, beamLevel]) {
    assert.equal(f(-1), 0);
    assert.equal(f(1), 1);
    let prev = -1;
    for (let p = -1; p <= 1.0001; p += 0.1) {
      const v = f(p);
      assert.ok(v >= prev && v >= 0 && v <= 1);
      prev = v;
    }
  }
  assert.ok(structureGlow(0) > 0, 'rangka sudah mulai bersinar saat senja');
  assert.equal(beamLevel(0), 0, 'berkas belum menyala saat senja');
});

test('reflectionIntensity: kuat di siang, lebih redup di malam', () => {
  assert.ok(reflectionIntensity(-1) > reflectionIntensity(1));
  assert.ok(reflectionIntensity(1) >= 0.6 - 1e-9);
});

test('glowPulse: antara 0,85 dan 1, dan tetap 1 bila gerak dimatikan', () => {
  for (let t = 0; t < 20; t += 0.37) {
    const v = glowPulse(t, 1);
    assert.ok(v >= 0.85 - 1e-9 && v <= 1 + 1e-9);
    assert.equal(glowPulse(t, 0), 1);
  }
});

test('envStale: selalu dibuat pertama kali, lalu hanya bila fase/ketinggian bergeser dan jeda cukup', () => {
  const last = { phase: 0, altitude: 0.2, time: 10 };
  assert.equal(envStale({ phase: 0, altitude: 0.2, last: null, now: 0 }), true);
  assert.equal(envStale({ phase: 0, altitude: 0.2, last, now: 100 }), false);
  assert.equal(envStale({ phase: ENV_PHASE_STEP, altitude: 0.2, last, now: 100 }), true);
  assert.equal(envStale({ phase: 0, altitude: 0.2 + ENV_ALT_STEP, last, now: 100 }), true);
  assert.equal(envStale({ phase: 1, altitude: 1, last, now: 10 + ENV_MIN_INTERVAL - 0.1 }), false, 'jeda minimum dijaga');
});

test('beamAngle: berputar dan kembali ke 0 setelah satu putaran', () => {
  assert.equal(beamAngle(0), 0);
  const full = (Math.PI * 2) / BEAM.turn;
  assert.ok(beamAngle(full + 1) < beamAngle(full - 1) || Math.abs(beamAngle(full)) < 1e-9);
  for (let t = 0; t < 100; t += 3.3) assert.ok(beamAngle(t) >= 0 && beamAngle(t) < Math.PI * 2);
});
