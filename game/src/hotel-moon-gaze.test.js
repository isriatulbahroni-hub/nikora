import test from 'node:test';
import assert from 'node:assert/strict';
import { MOON_GAZE_KEY, gazeEase, isGazeCancelKey, isGazeToggleKey, isTypingTarget, mountMoonButton, needsNight } from './hotel-moon-gaze.js';

const makeEl = () => ({
  attrs: {},
  listeners: {},
  children: [],
  removed: false,
  className: '',
  setAttribute(k, v) { this.attrs[k] = v; },
  addEventListener(type, fn) { this.listeners[type] = fn; },
  removeEventListener(type) { delete this.listeners[type]; },
  appendChild(child) { this.children.push(child); },
  remove() { this.removed = true; },
});

test('tombol pintas: B (besar atau kecil) mengalihkan; WASD, panah, dan Esc mengakhiri; tombol lain diabaikan', () => {
  assert.equal(MOON_GAZE_KEY, 'b');
  assert.equal(isGazeToggleKey('b'), true);
  assert.equal(isGazeToggleKey('B'), true);
  assert.equal(isGazeToggleKey('n'), false);
  assert.equal(isGazeToggleKey(undefined), false);
  for (const k of ['w', 'A', 's', 'D', 'ArrowUp', 'ArrowLeft', 'Escape']) assert.equal(isGazeCancelKey(k), true, k);
  for (const k of ['b', 'e', ' ', 'm', 'n', 'c', undefined]) assert.equal(isGazeCancelKey(k), false, String(k));
});

test('tombol B tidak bentrok dengan tombol pintas hotel-main.js yang sudah ada', () => {
  for (const k of ['w', 'a', 's', 'd', 'm', 'c', 'j', 'n', 'h', 'e', ' ', '[', ']', '-', '=', '+']) assert.notEqual(k, MOON_GAZE_KEY);
});

test('gazeEase: 0 ke 1, naik monoton, dijepit di luar rentang', () => {
  assert.equal(gazeEase(0), 0);
  assert.equal(gazeEase(1), 1);
  assert.equal(gazeEase(-5), 0);
  assert.equal(gazeEase(5), 1);
  let prev = -1;
  for (let k = 0; k <= 1.0001; k += 0.05) {
    const v = gazeEase(k);
    assert.ok(v >= prev - 1e-12);
    prev = v;
  }
  assert.ok(Math.abs(gazeEase(0.5) - 0.5) < 1e-12);
});

test('needsNight: siang dan bulan yang belum tampak memerlukan malam, bulan yang sudah tampak tidak', () => {
  assert.equal(needsNight(0), true);
  assert.equal(needsNight(0.29), true);
  assert.equal(needsNight(NaN), true);
  assert.equal(needsNight(0.3), false);
  assert.equal(needsNight(1), false);
});

test('isTypingTarget: kolom isian dikenali, elemen biasa tidak', () => {
  assert.equal(isTypingTarget(null), false);
  assert.equal(isTypingTarget({}), false);
  assert.equal(isTypingTarget({ closest: (sel) => (sel.includes('input') ? {} : null) }), true);
  assert.equal(isTypingTarget({ closest: () => null }), false);
});

test('mountMoonButton: tanpa DOM atau tanpa baris tombol tidak berbuat apa-apa', () => {
  const none = mountMoonButton({ doc: null });
  assert.equal(none.mounted, false);
  none.setOn(true);
  none.dispose();
  const noHost = mountMoonButton({ doc: { querySelector: () => null, createElement: makeEl } });
  assert.equal(noHost.mounted, false);
});

test('mountMoonButton: memasang tombol bergaya .rb, klik memanggil onToggle, setOn mengubah aria-pressed, dispose melepasnya', () => {
  const host = makeEl();
  const doc = { querySelector: (sel) => (sel === '.rbs' ? host : null), createElement: () => makeEl() };
  let toggled = 0;
  const mount = mountMoonButton({ onToggle: () => { toggled += 1; }, doc });
  assert.equal(mount.mounted, true);
  assert.equal(host.children.length, 1);
  const button = host.children[0];
  assert.equal(button.className, 'rb');
  assert.equal(button.id, 'moon-button');
  assert.equal(button.attrs['aria-pressed'], 'false');
  assert.equal(button.children.length, 2);
  assert.equal(button.children[1].textContent, 'Bulan');
  button.listeners.click();
  assert.equal(toggled, 1);
  mount.setOn(true);
  assert.equal(button.attrs['aria-pressed'], 'true');
  mount.setOn(false);
  assert.equal(button.attrs['aria-pressed'], 'false');
  mount.dispose();
  assert.equal(button.removed, true);
  assert.equal(button.listeners.click, undefined);
});
