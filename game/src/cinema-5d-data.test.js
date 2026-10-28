import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNEL_IDS, COMFORT, MAX_SEAT_DISTANCE, RUMBLE_MIN, SCENES, SHAKE_MAX, TILT_MAX, TSUNAMI, WATER_MAX,
  channelValue, comfortFromSearch, getScene, rumbleBeat, sceneAt, seatDistance, shakeOffset, tiltRadians, validateScene,
} from './cinema-5d-data.js';

test('bioskop 5D: adegan tsunami sah dan terdaftar', () => {
  assert.deepEqual(validateScene(TSUNAMI), []);
  assert.equal(getScene('tsunami'), TSUNAMI);
  assert.equal(getScene('tidak-ada'), null);
  assert.ok(Object.keys(SCENES).includes('tsunami'));
});

test('bioskop 5D: validateScene menangkap saluran asing, nilai di luar rentang, cue tumpang tindih, dan adegan yang terlalu pendek', () => {
  assert.ok(validateScene(null).length > 0);
  assert.ok(validateScene({ id: 'x', duration: 10, cues: [{ ch: 'foo', t: 0, to: 1, dur: 1 }] }).some((e) => e.includes('tidak dikenal')));
  assert.ok(validateScene({ id: 'x', duration: 10, cues: [{ ch: 'rumble', t: 0, to: 2, dur: 1 }] }).some((e) => e.includes('di luar rentang')));
  const overlap = validateScene({ id: 'x', duration: 20, cues: [{ ch: 'rumble', t: 0, to: 0.5, dur: 5 }, { ch: 'rumble', t: 3, to: 1, dur: 2 }] });
  assert.ok(overlap.some((e) => e.includes('tumpang tindih')));
  const short = validateScene({ id: 'x', duration: 10, cues: [{ ch: 'water', t: 5, to: 1, dur: 2, wave: 8 }] });
  assert.ok(short.some((e) => e.includes('setelah adegan berakhir')), 'gelombang ke kursi belakang harus selesai sebelum adegan berakhir');
  const mixed = validateScene({ id: 'x', duration: 60, cues: [{ ch: 'mist', t: 0, to: 1, dur: 1, wave: 8 }, { ch: 'mist', t: 5, to: 0, dur: 1 }] });
  assert.ok(mixed.some((e) => e.includes('wave harus sama')));
});

test('bioskop 5D: semua saluran nol di awal dan kembali nol setelah adegan, di kursi depan maupun belakang', () => {
  for (const dist of [0, MAX_SEAT_DISTANCE]) {
    for (const ch of CHANNEL_IDS) {
      assert.equal(channelValue(TSUNAMI, ch, 0, dist), 0, `${ch} awal`);
      assert.equal(channelValue(TSUNAMI, ch, TSUNAMI.duration, dist), 0, `${ch} akhir (jarak ${dist})`);
    }
  }
});

test('bioskop 5D: gemuruh naik halus, memuncak saat air menerjang, lalu surut', () => {
  const at = (t) => channelValue(TSUNAMI, 'rumble', t);
  assert.ok(at(5) > 0 && at(5) < at(10) && at(10) < at(19), 'naik bertahap');
  assert.ok(Math.abs(at(10) - 0.15) < 1e-9, 'setengah jalan = 0,15 (kurva halus)');
  assert.equal(at(28), 1);
  assert.equal(at(30), 1);
  assert.ok(at(38) < 1 && at(38) > 0.2, 'surut bertahap');
});

test('bioskop 5D: kabut dan air merambat dari depan ke belakang (kursi depan lebih dulu)', () => {
  const front = channelValue(TSUNAMI, 'mist', 27, 0);
  const back = channelValue(TSUNAMI, 'mist', 27, 40);
  assert.ok(Math.abs(front - 0.8) < 1e-9);
  assert.equal(back, 0, 'kursi 40 m dari layar baru kena sekitar 5 detik kemudian');
  assert.ok(channelValue(TSUNAMI, 'mist', 31.5, 40) > 0);
  assert.equal(channelValue(TSUNAMI, 'water', 32, 0), 1.4);
  assert.ok(channelValue(TSUNAMI, 'water', 32, 40) < 1.4);
  const w = [28, 29, 30, 31].map((t) => channelValue(TSUNAMI, 'water', t, 0));
  assert.ok(w.every((v, i) => i === 0 || v > w[i - 1]), 'air naik terus');
  for (let t = 0; t <= TSUNAMI.duration; t += 0.5) assert.ok(channelValue(TSUNAMI, 'water', t, 0) <= WATER_MAX);
});

test('bioskop 5D: kursi miring tajam saat air menerjang lalu menyeimbang, dalam batas', () => {
  assert.equal(channelValue(TSUNAMI, 'tilt', 26.5), 12);
  assert.equal(channelValue(TSUNAMI, 'tilt', 31), 4);
  assert.equal(channelValue(TSUNAMI, 'tilt', 37), 0);
  for (let t = 0; t <= TSUNAMI.duration; t += 0.25) assert.ok(Math.abs(channelValue(TSUNAMI, 'tilt', t)) <= TILT_MAX);
  assert.ok(Math.abs(tiltRadians(12) - (12 * Math.PI) / 180) < 1e-12);
  assert.ok(Math.abs(tiltRadians(99) - (TILT_MAX * Math.PI) / 180) < 1e-12, 'dibatasi');
});

test('bioskop 5D: mode kenyamanan mematikan kemiringan, guncangan, dan percikan tetapi gemuruh tetap ada', () => {
  const full = sceneAt(TSUNAMI, 27, { dist: 0 });
  assert.ok(full.rumble > 0.8, 'gemuruh hampir memuncak');
  assert.equal(full.tilt, 12);
  assert.ok(full.shake > 0.5 && full.mist > 0.5);
  const calm = sceneAt(TSUNAMI, 27, { dist: 0, comfort: 'calm' });
  assert.equal(calm.tilt, 0);
  assert.equal(calm.shake, 0);
  assert.equal(calm.mist, 0);
  assert.ok(calm.rumble > 0 && calm.rumble < full.rumble);
  assert.equal(calm.water, full.water);
  const gentle = sceneAt(TSUNAMI, 27, { dist: 0, comfort: 'gentle' });
  assert.ok(gentle.tilt > 0 && gentle.tilt < full.tilt);
  assert.deepEqual(sceneAt(TSUNAMI, 27, { comfort: 'tidak-ada' }), sceneAt(TSUNAMI, 27), 'mode asing = full');
  assert.deepEqual(Object.keys(full), [...CHANNEL_IDS]);
  assert.ok(Object.keys(COMFORT).length === 3);
});

test('bioskop 5D: pilihan kenyamanan dari alamat; "kurangi gerakan" perangkat selalu menang', () => {
  assert.equal(comfortFromSearch('', false), 'full');
  assert.equal(comfortFromSearch('?nyaman=calm', false), 'calm');
  assert.equal(comfortFromSearch('?nyaman=gentle', false), 'gentle');
  assert.equal(comfortFromSearch('?nyaman=ngawur', false), 'full');
  assert.equal(comfortFromSearch('', true), 'calm');
  assert.equal(comfortFromSearch('?nyaman=full', true), 'calm');
});

test('bioskop 5D: jarak kursi dari layar tidak negatif', () => {
  assert.equal(seatDistance(-70, -78), 8);
  assert.equal(seatDistance(-80, -78), 0);
});

test('bioskop 5D: guncangan kamera deterministik, nol bila level nol, dan selalu dalam batas', () => {
  assert.deepEqual(shakeOffset(0, 12.3), { x: 0, y: 0 });
  assert.deepEqual(shakeOffset(0.7, 5), shakeOffset(0.7, 5));
  let maxX = 0;
  let maxY = 0;
  for (let t = 0; t < 30; t += 0.013) {
    const o = shakeOffset(1, t);
    maxX = Math.max(maxX, Math.abs(o.x));
    maxY = Math.max(maxY, Math.abs(o.y));
  }
  assert.ok(maxX <= SHAKE_MAX + 1e-9 && maxX > SHAKE_MAX * 0.5);
  assert.ok(maxY <= SHAKE_MAX * 0.7 + 1e-9);
  assert.deepEqual(shakeOffset(NaN, NaN), { x: 0, y: 0 });
  assert.ok(Math.abs(shakeOffset(9, 3).x) <= SHAKE_MAX + 1e-9, 'level dibatasi 1');
});

test('bioskop 5D: denyut getaran HP makin rapat dan kuat, tidak ada di bawah ambang', () => {
  assert.equal(rumbleBeat(0), null);
  assert.equal(rumbleBeat(RUMBLE_MIN - 0.01), null);
  assert.equal(rumbleBeat(NaN), null);
  const a = rumbleBeat(RUMBLE_MIN);
  const b = rumbleBeat(1);
  assert.ok(b.gap < a.gap && b.ms > a.ms);
  assert.equal(b.ms, 40);
  assert.ok(Math.abs(b.gap - 0.15) < 1e-9);
  assert.deepEqual(rumbleBeat(5), b, 'level dibatasi 1');
});
