import assert from 'node:assert/strict';
import test from 'node:test';
import { POSES, POSE_KEYS, STAND, createPostureController, easeParams, isStanding, prayerSteps } from './masjid-posture-data.js';

test('urutan shalat dua rakaat: takbir, dua rukuk, empat sujud, tahiyat akhir, dua salam', () => {
  const steps = prayerSteps(2);
  assert.equal(steps[0].pose, 'takbir');
  assert.equal(steps.filter((s) => s.pose === 'ruku').length, 2);
  assert.equal(steps.filter((s) => s.pose === 'sujud').length, 4);
  assert.deepEqual(steps.slice(-3).map((s) => s.label), ['Tahiyat akhir', 'Salam ke kanan', 'Salam ke kiri']);
  assert.equal(steps.at(-1).pose, 'salam_kiri');
});

test('tiga dan empat rakaat punya tahiyat awal; jumlah rakaat dibatasi 2 sampai 4', () => {
  assert.equal(prayerSteps(2).filter((s) => s.label === 'Tahiyat awal').length, 0);
  assert.equal(prayerSteps(3).filter((s) => s.label === 'Tahiyat awal').length, 1);
  assert.equal(prayerSteps(4).filter((s) => s.pose === 'ruku').length, 4);
  assert.equal(prayerSteps(9).filter((s) => s.pose === 'ruku').length, 4);
  assert.equal(prayerSteps(0).filter((s) => s.pose === 'ruku').length, 2);
});

test('setiap gerakan lengkap, berhingga, dan panggul tidak turun melewati lantai', () => {
  for (const [name, p] of Object.entries(POSES)) {
    for (const key of POSE_KEYS) assert.ok(Number.isFinite(p[key]), `${name}.${key} bukan angka`);
    assert.ok(p.sink >= 0 && p.sink < 1, `${name}.sink di luar 0..1`);
    assert.ok(p.knee >= 0 && p.knee < Math.PI, `${name}.knee tidak wajar`);
  }
});

test('semua gerakan dalam urutan shalat terdefinisi', () => {
  for (const s of prayerSteps(4)) assert.ok(POSES[s.pose], `${s.pose} tidak ada di POSES`);
});

test('pengendali: duduk, shalat, berikutnya, dan berhenti', () => {
  const c = createPostureController();
  assert.equal(c.pose(), null);
  assert.equal(c.active(), false);
  c.toggleSit();
  assert.equal(c.pose(), 'bersila');
  c.toggleSit();
  assert.equal(c.pose(), null);
  c.toggleSit();
  c.startPrayer(2); // shalat membatalkan duduk bersila
  assert.equal(c.state().sitting, false);
  assert.equal(c.pose(), 'takbir');
  assert.equal(c.state().step, 1);
  assert.ok(c.next());
  assert.equal(c.pose(), 'qiyam');
  assert.match(c.state().label, /rakaat 1\/2/);
  c.stop();
  assert.equal(c.pose(), null);
  assert.equal(c.active(), false);
});

test('pengendali: setelah salam terakhir avatar kembali berdiri', () => {
  const c = createPostureController();
  c.startPrayer(2);
  const total = c.state().total;
  for (let i = 1; i < total; i++) assert.ok(c.next());
  assert.equal(c.state().last, true);
  assert.equal(c.pose(), 'salam_kiri');
  assert.equal(c.next(), false);
  assert.equal(c.pose(), null);
  assert.equal(c.state().praying, false);
});

test('easeParams mendekati target dan isStanding mengenali berdiri', () => {
  const cur = { ...STAND };
  assert.ok(isStanding(cur));
  for (let i = 0; i < 60; i++) easeParams(cur, POSES.sujud, 0.2);
  assert.ok(Math.abs(cur.sink - POSES.sujud.sink) < 0.01);
  assert.ok(!isStanding(cur));
  for (let i = 0; i < 60; i++) easeParams(cur, STAND, 0.2);
  assert.ok(isStanding(cur));
});
