import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_VOICES, VOICE, createTrafficAudio, doppler, hear, panOf, pickSources, radialSpeed, voiceParams } from './hotel-traffic-audio.js';

test('hear: penuh di dekat, habis di jangkauan, jatuh teratur', () => {
  assert.equal(hear(0, 90), 1);
  assert.equal(hear(90, 90), 0);
  assert.equal(hear(500, 90), 0);
  assert.ok(hear(20, 90) > hear(40, 90));
});

test('semua jenis kendaraan punya suara, dan motor lebih tinggi nadanya daripada mobil, bus, truk', () => {
  for (const k of ['car', 'motor', 'bus', 'truck']) assert.ok(VOICE[k], k);
  const at = (kind) => voiceParams(kind, { speed: 20, distance: 10 }).hz;
  assert.ok(at('motor') > at('car') && at('car') > at('bus') && at('bus') >= at('truck') * 0.99);
});

test('voiceParams: makin cepat makin tinggi dan keras; idle tetap berbunyi pelan', () => {
  const idle = voiceParams('car', { speed: 0, distance: 8 });
  const fast = voiceParams('car', { speed: 22, distance: 8 });
  assert.ok(idle.gain > 0, 'mesin idle tetap bersuara');
  assert.ok(fast.hz > idle.hz && fast.gain > idle.gain && fast.cutoff >= idle.cutoff);
  const cap = voiceParams('car', { speed: 500, distance: 8 });
  assert.ok(cap.hz <= VOICE.car.maxHz * 1.22 + 1e-9);
});

test('voiceParams: jauh meredup sampai hening di luar jangkauan, kabin dan ruangan meredam', () => {
  const near = voiceParams('car', { speed: 15, distance: 5 });
  const far = voiceParams('car', { speed: 15, distance: 70 });
  assert.ok(near.gain > far.gain && near.cutoff > far.cutoff);
  assert.equal(voiceParams('car', { speed: 15, distance: VOICE.car.range + 1 }).gain, 0);
  const inCabin = voiceParams('car', { speed: 15, distance: 5, cabin: true });
  const indoors = voiceParams('car', { speed: 15, distance: 5, indoor: 1 });
  assert.ok(inCabin.gain < near.gain && indoors.gain < near.gain * 0.2);
});

test('doppler: mendekat lebih tinggi, menjauh lebih rendah, dibatasi', () => {
  assert.equal(doppler(0), 1);
  assert.ok(doppler(25) > 1 && doppler(-25) < 1);
  assert.ok(doppler(1e6) <= 1.22 && doppler(-1e6) >= 0.82);
  const L = { x: 0, z: 0, yaw: 0 };
  assert.ok(radialSpeed(L, { x: 50, z: 0, vx: -20, vz: 0 }) > 19, 'kendaraan menuju pendengar');
  assert.ok(radialSpeed(L, { x: 50, z: 0, vx: 20, vz: 0 }) < -19, 'kendaraan menjauh');
});

test('panOf: sumber di kanan layar bernilai positif, di kiri negatif, searah kamera di tengah', () => {
  // konvensi kamera hotel-main.js: kanan layar = (cos yaw, -sin yaw); yaw = PI berarti menghadap selatan, jadi kanannya barat
  const south = { x: 0, z: 0, yaw: Math.PI };
  assert.ok(panOf(south, { x: -30, z: 0 }) > 0.8, 'barat = kanan saat menghadap selatan');
  assert.ok(panOf(south, { x: 30, z: 0 }) < -0.8);
  assert.ok(Math.abs(panOf(south, { x: 0, z: 40 })) < 1e-9, 'tepat di depan');
  const north = { x: 0, z: 0, yaw: 0 };
  assert.ok(panOf(north, { x: 30, z: 0 }) > 0.8, 'timur = kanan saat menghadap utara');
  assert.equal(panOf(north, { x: 0.2, z: 0.2 }), 0);
});

test('pickSources: hanya yang dalam jangkauan, terdekat dulu, dibatasi', () => {
  const L = { x: 0, z: 0, yaw: 0 };
  const src = [{ id: 'a', kind: 'car', x: 60, z: 0 }, { id: 'b', kind: 'motor', x: 10, z: 0 }, { id: 'c', kind: 'car', x: 500, z: 0 }, { id: 'd', kind: 'bus', x: 30, z: 0 }];
  const got = pickSources(L, src);
  assert.deepEqual(got.map((s) => s.id), ['b', 'd', 'a']);
  assert.deepEqual(pickSources(L, src, 2).map((s) => s.id), ['b', 'd']);
  const many = Array.from({ length: 40 }, (_, i) => ({ id: i, kind: 'car', x: i + 1, z: 0 }));
  assert.equal(pickSources(L, many).length, MAX_VOICES);
});

test('tanpa WebAudio (Node) atau ?suara=0: tidak berbunyi dan tidak galat', () => {
  const a = createTrafficAudio({});
  a.update({ listener: { x: 0, z: 0, yaw: 0 }, sources: [{ id: 1, kind: 'car', x: 5, z: 0 }] });
  a.bump(10, 2);
  a.horn('bus', 3);
  assert.deepEqual(a.info(), { on: false, voices: 0 });
  a.dispose();
});
