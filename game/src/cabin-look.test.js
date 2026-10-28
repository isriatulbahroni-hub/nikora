import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOK, createCabinLook, passengerYaw, peekYaw } from './cabin-look.js';

test('geser layar: menoleh dibatasi, dan kembali ke depan setelah dilepas beberapa detik', () => {
  const l = createCabinLook();
  l.drag(1, 0.2);
  assert.equal(l.state.yaw, 1);
  l.step(1);
  assert.equal(l.state.yaw, 1, 'belum waktunya kembali');
  l.step(1.5);
  assert.ok(Math.abs(l.state.yaw) < 0.01 && Math.abs(l.state.pitch) < 0.01, 'kembali menatap jalan');
  l.drag(10, 10);
  assert.equal(l.state.yaw, LOOK.maxYaw);
  assert.equal(l.state.pitch, LOOK.maxPitch);
  l.drag(-100, -100);
  assert.equal(l.state.yaw, -LOOK.maxYaw);
  assert.equal(l.state.pitch, LOOK.minPitch);
});

test('menggeser lagi saat kembali otomatis: gerak otomatis berhenti dan pemain yang memegang kendali', () => {
  const l = createCabinLook();
  l.drag(1, 0);
  l.step(3);
  l.step(0.05); // mulai kembali
  assert.ok(l.state.goalYaw === null || l.state.goalYaw === 0);
  l.drag(0.5, 0);
  assert.equal(l.state.goalYaw, null);
  l.step(0.1);
  assert.ok(l.state.yaw > 0.4, 'tidak ditarik kembali selagi baru digeser');
});

test('menoleh ke teman lewat tombol: halus, ditahan, tidak kembali sendiri; tombol depan melepas', () => {
  const l = createCabinLook();
  l.glance(LOOK.side);
  assert.equal(l.state.hold, true);
  l.step(10);
  assert.ok(Math.abs(l.state.yaw - LOOK.side) < 1e-9);
  l.step(30);
  assert.ok(Math.abs(l.state.yaw - LOOK.side) < 1e-9, 'ditahan: tidak kembali sendiri');
  l.front();
  assert.equal(l.state.hold, false);
  l.step(10);
  assert.equal(l.state.yaw, 0);
});

test('tombol pin: menahan pandangan hasil geser, dan melepasnya = kembali ke depan setelah jeda', () => {
  const l = createCabinLook();
  l.drag(0.9, 0.1);
  assert.equal(l.toggleHold(), true);
  l.step(20);
  assert.equal(l.state.yaw, 0.9, 'ditahan');
  assert.equal(l.toggleHold(), false);
  l.step(1);
  assert.equal(l.state.yaw, 0.9, 'jeda dulu');
  l.step(2);
  l.step(1);
  assert.equal(l.state.yaw, 0);
});

test('glance dibatasi, snap mengembalikan semuanya ke awal', () => {
  const l = createCabinLook();
  l.glance(9);
  assert.equal(l.state.goalYaw, LOOK.maxYaw);
  l.snap();
  assert.deepEqual({ ...l.state }, { yaw: 0, pitch: 0, goalYaw: null, goalPitch: 0, hold: false, idle: 0 });
});

test('kursi penumpang di seberang setir; intip belokan hanya saat menatap lurus', () => {
  assert.equal(passengerYaw(0.4), -LOOK.side, 'setir kiri: penumpang di kanan (yaw negatif)');
  assert.equal(passengerYaw(-0.4), LOOK.side, 'setir kanan: penumpang di kiri');
  assert.ok(Math.abs(peekYaw(1, 0) - 0.35) < 1e-9, 'lurus: sama seperti semula (setir x 0,35)');
  assert.equal(peekYaw(1, 1.2), 0, 'menoleh jauh: tanpa intip');
  assert.ok(peekYaw(1, 0.175) < 0.35 && peekYaw(1, 0.175) > 0);
});
