import test from 'node:test';
import assert from 'node:assert/strict';
import { createHoldMeter } from '../src/engine/hold-meter.js';
import { createVoiceGate, rmsOf } from '../src/engine/voice-gate.js';
import { tiltFromOrientation, createGyro } from '../src/engine/gyro.js';
import { buzz, HAPTIC } from '../src/engine/haptics.js';
import { holdHint, NUDGE_TEXT } from '../src/world3d/hold-text.js';
import { createAudio } from '../src/engine/audio.js';

const run = (meter, seconds, pressed, dt = 1 / 60) => { let v = 0; for (let t = 0; t < seconds; t += dt) v = meter.update(dt, pressed); return v; };

test('hold meter: penuh setelah holdSeconds ditekan terus, lalu terkunci', () => {
  const m = createHoldMeter({ holdSeconds: 1.8 });
  assert.ok(run(m, 0.9, true) > .45 && run(m, 0, true) < 1);
  assert.equal(m.done, false);
  run(m, 1.2, true);
  assert.equal(m.done, true); assert.equal(m.value, 1);
  assert.equal(m.update(1, false), 1);                         // sudah terkunci: tidak turun lagi
});

test('hold meter: dilepas sebelum penuh -> turun kembali dan tidak pernah selesai', () => {
  const m = createHoldMeter({ holdSeconds: 2, release: 2 });
  const mid = run(m, 1.0, true);
  assert.ok(mid > .45 && mid < .55);
  const after = run(m, 1.0, false);
  assert.ok(after < mid && after >= 0); assert.equal(m.done, false);
  assert.equal(run(m, 5, false), 0);
});

test('hold meter: sentuhan singkat (ketuk) hampir tidak menggeser meter; reset memulihkan', () => {
  const m = createHoldMeter({ holdSeconds: 1.8 });
  assert.ok(run(m, 0.15, true) < .1);
  run(m, 3, true); assert.equal(m.done, true);
  m.reset(); assert.equal(m.value, 0); assert.equal(m.done, false);
});

const feedSeq = (gate, segs, dt = 1 / 60) => { let r; for (const [sec, rms] of segs) for (let t = 0; t < sec; t += dt) r = gate.feed(rms, dt); return r; };

test('suara: bicara cukup lama sesudah kalibrasi -> ok', () => {
  const g = createVoiceGate();
  const r = feedSeq(g, [[0.6, 0.004], [1.0, 0.12]]);
  assert.equal(r.state, 'ok');
});

test('suara: hening atau hanya kebisingan latar tetap -> tidak pernah ok', () => {
  assert.notEqual(feedSeq(createVoiceGate(), [[6, 0.003]]).state, 'ok');
  assert.notEqual(feedSeq(createVoiceGate(), [[8, 0.05]]).state, 'ok');           // bising konstan: ambang menyesuaikan
});

test('suara: letupan sesaat (klik/ketukan) tidak dihitung sebagai bicara', () => {
  const segs = [[0.6, 0.004]]; for (let i = 0; i < 12; i++) segs.push([0.08, 0.3], [0.4, 0.004]);
  assert.notEqual(feedSeq(createVoiceGate(), segs).state, 'ok');
});

test('suara: level visual 0..1 dan status kalibrasi lalu mendengarkan', () => {
  const g = createVoiceGate();
  assert.equal(g.feed(0.01, 0.1).state, 'calibrating');
  const r = feedSeq(g, [[0.6, 0.01]]);
  assert.equal(r.state, 'listening'); assert.ok(r.level >= 0 && r.level <= 1);
  assert.equal(g.feed(5, 0.01).level, 1);
});

test('rmsOf: akar rata-rata kuadrat; kosong = 0', () => {
  assert.equal(rmsOf([]), 0); assert.equal(rmsOf([0, 0, 0]), 0);
  assert.ok(Math.abs(rmsOf([1, -1, 1, -1]) - 1) < 1e-9);
  assert.ok(Math.abs(rmsOf(new Float32Array([0.5, 0.5])) - 0.5) < 1e-6);
});

test('giroskop: kemiringan dibatasi, relatif terhadap posisi netral, nilai ngawur -> 0', () => {
  const base = { beta: 40, gamma: 5 };
  assert.deepEqual(tiltFromOrientation({ beta: 40, gamma: 5 }, base), { yaw: 0, pitch: 0 });
  const t = tiltFromOrientation({ beta: 400, gamma: -400 }, base);
  assert.ok(Math.abs(t.yaw) <= 0.4 + 1e-9 && Math.abs(t.pitch) <= 0.22 + 1e-9);
  assert.ok(tiltFromOrientation({ beta: 40, gamma: 20 }, base).yaw > 0);
  assert.deepEqual(tiltFromOrientation({ beta: null, gamma: NaN }), { yaw: 0, pitch: 0 });
  assert.deepEqual(tiltFromOrientation(undefined), { yaw: 0, pitch: 0 });
});

test('giroskop: izin iOS ditolak/error -> start() false tanpa melempar; diterima -> mendengar & stop membersihkan', async () => {
  const mkWin = (req) => { const l = new Map(); return { DeviceOrientationEvent: req === undefined ? function () {} : Object.assign(function () {}, { requestPermission: req }), addEventListener: (n, f) => l.set(n, f), removeEventListener: (n) => l.delete(n), l }; };
  assert.equal(await createGyro({ onTilt() {}, win: { } }).start(), false);                       // tanpa DeviceOrientationEvent
  assert.equal(await createGyro({ onTilt() {}, win: mkWin(async () => 'denied') }).start(), false);
  assert.equal(await createGyro({ onTilt() {}, win: mkWin(async () => { throw new Error('x'); }) }).start(), false);
  const seen = [], w = mkWin(undefined), g = createGyro({ onTilt: (t) => seen.push(t), win: w });
  assert.equal(await g.start(), true); assert.equal(g.active, true);
  w.l.get('deviceorientation')({ beta: 50, gamma: 3 });                                          // bacaan pertama = netral
  w.l.get('deviceorientation')({ beta: 50, gamma: 20 });
  assert.deepEqual(seen[0], { yaw: 0, pitch: 0 }); assert.ok(seen[1].yaw > 0);
  g.stop(); assert.equal(g.active, false); assert.equal(w.l.size, 0);
});

test('getar: aman tanpa dukungan, melempar, atau menolak', () => {
  assert.equal(buzz(HAPTIC.tick, null), false);
  assert.equal(buzz(HAPTIC.tick, {}), false);
  assert.equal(buzz(HAPTIC.tick, { vibrate: () => { throw new Error('x'); } }), false);
  let got; assert.equal(buzz(HAPTIC.complete, { vibrate: (p) => { got = p; return true; } }), true); assert.deepEqual(got, [30, 40, 70]);
});

test('petunjuk tahan: kata sentuh/ketuk/tekan diganti, nuansa tema dipertahankan', () => {
  assert.equal(holdHint('Sentuh segel untuk membuka'), 'Tahan segel untuk membuka');
  assert.equal(holdHint('Bismillah, sentuh segel untuk membuka'), 'Bismillah, tahan segel untuk membuka');
  assert.equal(holdHint('Sentuh segel kerajaan untuk membuka'), 'Tahan segel kerajaan untuk membuka');
  assert.equal(holdHint('Ketuk untuk membuka'), 'Tahan untuk membuka');
  assert.equal(holdHint('Buka sekarang'), 'Buka sekarang (tahan)');
  assert.equal(holdHint(''), 'Tahan segel hingga meleleh'); assert.equal(holdHint(null), 'Tahan segel hingga meleleh');
  assert.ok(NUDGE_TEXT.length > 10);
});

test('audio: tear/paper/chime aman dipanggil sebelum dibuka kuncinya dan saat dibisukan', () => {
  const a = createAudio({ wave: 'sine', notes: [440] });
  assert.doesNotThrow(() => { a.tear(); a.paper(); a.chime(); a.setMuted(true); a.tear(); a.close(); });
});

import { fitLead } from '../src/world3d/textures.js';
const mAt = (t, sz) => t.length * sz * 0.5;            // lebar tiruan: 0,5 x ukuran per huruf

test('fitLead: kalimat pendek tetap 14px dan utuh; yang panjang mengecil tetapi TIDAK terpotong', () => {
  const a = fitLead(mAt, 'Dengan penuh rasa syukur, kami mengundang Anda untuk hadir', 220);
  assert.equal(a.size, 14); assert.equal(a.cut, false); assert.ok(a.lines.length <= 3);
  const long = 'Dengan memohon rahmat dan ridha Allah SWT, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dan memberikan doa restu pada pernikahan putra-putri kami';
  const b = fitLead(mAt, long, 220);
  assert.equal(b.cut, false); assert.ok(b.size < 14);
  assert.equal(b.lines.join(' '), long); assert.ok(!b.lines.join('').includes('…'));
  assert.ok(b.lines.every((l) => mAt(l, b.size) <= 220 + 1e-9));
});

test('fitLead: teks sangat panjang -> jalan terakhir memotong dengan elipsis, tetap muat di kotak', () => {
  const r = fitLead(mAt, 'kata '.repeat(120), 220);
  assert.equal(r.cut, true); assert.ok(r.lines.length <= 5); assert.ok(r.lines.at(-1).endsWith('…'));
  assert.ok(r.lines.every((l) => mAt(l, r.size) <= 220 + 1e-9));
  assert.deepEqual(fitLead(mAt, '', 220).lines, []);
});
