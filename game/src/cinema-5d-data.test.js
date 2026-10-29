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

test('bioskop 5D: semua adegan sah, lebih pendek dari slot tayang, dan kembali nol di akhir', async () => {
  const { BADAI, GEMPA, HANTU, SHOW_ORDER, SHOW_SLOT_SECONDS } = await import('./cinema-5d-data.js');
  assert.deepEqual(Object.keys(SCENES).sort(), [...SHOW_ORDER].sort());
  for (const scene of [TSUNAMI, HANTU, GEMPA, BADAI]) {
    assert.deepEqual(validateScene(scene), [], scene.id);
    assert.ok(scene.duration + 20 <= SHOW_SLOT_SECONDS, `${scene.id}: jeda antar tayangan minimal 20 detik`);
    for (const dist of [0, MAX_SEAT_DISTANCE]) for (const ch of CHANNEL_IDS) assert.equal(channelValue(scene, ch, scene.duration, dist), 0, `${scene.id}/${ch}`);
  }
});

test('bioskop 5D: kilatan dibatasi 3 kali per detik (keselamatan cahaya berkedip) dan divalidasi', async () => {
  const { BADAI, HANTU } = await import('./cinema-5d-data.js');
  for (const scene of [HANTU, BADAI]) {
    const rises = scene.cues.filter((c) => c.ch === 'flash' && c.to >= 0.5).map((c) => c.t).sort((a, b) => a - b);
    for (let i = 3; i < rises.length; i++) assert.ok(rises[i] - rises[i - 3] >= 1, scene.id);
  }
  const burst = { id: 'x', duration: 10, cues: [0, 0.2, 0.4, 0.6].flatMap((t) => [{ ch: 'flash', t, to: 1, dur: 0.05 }, { ch: 'flash', t: t + 0.05, to: 0, dur: 0.05 }]) };
  assert.ok(validateScene(burst).some((e) => e.includes('kilatan')));
  for (const scene of [TSUNAMI]) assert.equal(sceneAt(scene, 5, { comfort: 'calm' }).flash, 0);
});

test('bioskop 5D: kilatan petir lebih dulu daripada guntur (cahaya lebih cepat dari suara)', async () => {
  const { BADAI } = await import('./cinema-5d-data.js');
  assert.ok(channelValue(BADAI, 'flash', 8.05) > 0.9, 'kilat pada detik 8');
  assert.ok(channelValue(BADAI, 'rumble', 8.05) < 0.3, 'belum ada guntur');
  assert.ok(channelValue(BADAI, 'rumble', 9.6) > 0.7, 'guntur menyusul sekitar 1,2 detik kemudian');
  assert.equal(sceneAt(BADAI, 8.05, { comfort: 'calm' }).flash, 0, 'mode tenang tanpa kilatan');
  assert.ok(sceneAt(BADAI, 8.05, { comfort: 'gentle' }).flash < channelValue(BADAI, 'flash', 8.05));
});

test('bioskop 5D: gempa: horizon bergoyang kiri-kanan dan mereda', async () => {
  const { GEMPA } = await import('./cinema-5d-data.js');
  const tilts = [7.5, 9, 10.5, 12, 13.5].map((t) => channelValue(GEMPA, 'tilt', t + 1.5));
  assert.ok(tilts.some((v) => v > 3) && tilts.some((v) => v < -3), 'berayun ke dua sisi');
  assert.ok(channelValue(GEMPA, 'shake', 17) > 0.9);
  assert.equal(channelValue(GEMPA, 'shake', 39), 0);
});

test('bioskop 5D: jadwal tayang serentak dari jam epoch: slot bergilir, jeda, dan hitung mundur', async () => {
  const { SHOW_ORDER, SHOW_SLOT_SECONDS, showAt } = await import('./cinema-5d-data.js');
  const a = showAt(0);
  assert.equal(a.id, SHOW_ORDER[0]);
  assert.equal(a.playing, true);
  assert.equal(a.nextId, SHOW_ORDER[1]);
  assert.equal(a.nextIn, SHOW_SLOT_SECONDS);
  assert.equal(showAt(SHOW_SLOT_SECONDS * 1000 + 5000).id, SHOW_ORDER[1]);
  assert.equal(showAt(SHOW_SLOT_SECONDS * 4 * 1000).id, SHOW_ORDER[0], 'berputar ke awal');
  const gap = showAt(70000);
  assert.equal(gap.playing, false);
  assert.ok(Math.abs(gap.nextIn - 20) < 1e-9);
  assert.deepEqual(showAt(123456).id, showAt(123456).id);
  assert.equal(showAt(NaN).id, SHOW_ORDER[0]);
  assert.equal(showAt(-1000).id, SHOW_ORDER[SHOW_ORDER.length - 1], 'jam sebelum epoch tetap sah');
});

test('bioskop 5D: denah kursi: layar lebar, kursi dalam blok dengan lorong, kursi hantu kosong, semua di dalam ruang', async () => {
  const { SEAT, cinemaSeatPlan } = await import('./cinema-5d-data.js');
  const rect = [-78, 499, -8, 561];
  const p = cinemaSeatPlan(rect);
  assert.equal(p.screen.w, 24);
  assert.ok(Math.abs(p.screen.x - (rect[0] + 0.12)) < 1e-9);
  assert.equal(p.blocks, 4);
  assert.equal(p.rows, 20);
  assert.equal(p.seats.length, p.rows * p.blocks * SEAT.perBlock - 1, 'satu kursi dikosongkan untuk adegan hantu');
  assert.ok(p.ghost && !p.seats.some((s) => s.x === p.ghost.x && s.z === p.ghost.z));
  for (const s of p.seats) assert.ok(s.x > rect[0] + 6 && s.x < rect[2] - 6 && s.z > rect[1] + 3 && s.z < rect[3] - 3, 'di dalam ruang dengan ruang jalan');
  const row0 = p.seats.filter((s) => s.row === 0).map((s) => s.z).sort((a, b) => a - b);
  const gaps = row0.slice(1).map((z, i) => z - row0[i]).filter((g) => g > SEAT.step + 0.5);
  assert.equal(gaps.length, p.blocks - 1, 'satu lorong di antara blok');
  assert.ok(p.foyerX > p.seats.at(-1).x, 'foyer di belakang baris terakhir');
  assert.ok(new Set(p.seats.map((s) => `${s.x.toFixed(3)},${s.z.toFixed(3)}`)).size === p.seats.length, 'tidak ada kursi bertumpuk');
  const small = cinemaSeatPlan([0, 0, 20, 14]);
  assert.ok(small.blocks >= 1 && small.seats.length > 0 && small.rows <= SEAT.maxRows);
  assert.equal(cinemaSeatPlan([0, 0, 10, 10]).ghost, null, 'ruang terlalu dangkal: tanpa baris, tanpa kursi hantu');
});
