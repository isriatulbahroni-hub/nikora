import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlass } from './glass-rain.js';

const half = () => 0.5; // semua tetes jatuh di tengah layar, tepat di jalur wiper

test('di kabin saat hujan deras tetes menumpuk di kaca depan', () => {
  const g = createGlass({ random: half });
  g.wiper.setMode('off');
  for (let i = 0; i < 20; i++) g.step(0.1, { level: 1, cabin: true });
  assert.ok(g.info().drops > 20);
  assert.equal(g.active(), true);
});

test('wiper menyapu tetes dan hanya bekerja di kabin', () => {
  const g = createGlass({ random: half });
  g.wiper.setMode('off');
  for (let i = 0; i < 10; i++) g.step(0.1, { level: 1, cabin: true });
  const before = g.info().drops;
  assert.ok(before > 0);
  g.wiper.setMode('on');
  for (let i = 0; i < 80; i++) g.step(0.05, { level: 0, cabin: true });
  assert.equal(g.info().drops, 0, 'semua tetes tersapu');
});

test('mode auto: wiper mulai menyapu saat hujan dan diam saat kering', () => {
  const g = createGlass({ random: half });
  for (let i = 0; i < 4; i++) g.step(0.1, { level: 1, cabin: true });
  assert.ok(g.info().phase >= 0, 'menyapu saat hujan');
  const dry = createGlass({ random: half });
  for (let i = 0; i < 40; i++) dry.step(0.1, { level: 0, cabin: true });
  assert.equal(dry.info().phase, -1);
});

test('wiper berganti auto -> nyala -> mati -> auto', () => {
  const g = createGlass({ random: half });
  assert.equal(g.wiper.mode(), 'auto');
  assert.equal(g.wiper.cycle(), 'on');
  assert.equal(g.wiper.cycle(), 'off');
  assert.equal(g.wiper.cycle(), 'auto');
  g.wiper.setMode('bukan-mode');
  assert.equal(g.wiper.mode(), 'auto');
});

test('di luar kabin tetes lensa muncul sedikit saat hujan deras, dan bisa dimatikan', () => {
  const g = createGlass({ random: half });
  for (let i = 0; i < 60; i++) g.step(0.1, { level: 1, cabin: false, exposed: true });
  const n = g.info().drops;
  assert.ok(n >= 1 && n <= 8, `n = ${n}`);
  const off = createGlass({ random: half });
  for (let i = 0; i < 60; i++) off.step(0.1, { level: 1, cabin: false, exposed: true, lens: false });
  assert.equal(off.info().drops, 0);
  const sheltered = createGlass({ random: half });
  for (let i = 0; i < 60; i++) sheltered.step(0.1, { level: 1, cabin: false, exposed: false });
  assert.equal(sheltered.info().drops, 0, 'berteduh: lensa tidak kena');
});

test('pindah kamera mengosongkan kaca', () => {
  const g = createGlass({ random: half });
  for (let i = 0; i < 10; i++) g.step(0.1, { level: 1, cabin: true });
  assert.ok(g.info().drops > 0);
  g.step(0.1, { level: 0, cabin: false });
  assert.equal(g.info().drops, 0);
});

test('draw menggambar tetes dan bilah tanpa galat', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? (...a) => calls.push(k) : undefined), set: () => true });
  const g = createGlass({ random: half });
  for (let i = 0; i < 6; i++) g.step(0.1, { level: 1, cabin: true });
  g.draw(ctx, 400, 800);
  assert.ok(calls.includes('ellipse'));
  assert.ok(calls.includes('lineTo'), 'bilah wiper digambar');
});
