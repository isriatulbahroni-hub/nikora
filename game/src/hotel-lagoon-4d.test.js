import test from 'node:test';
import assert from 'node:assert/strict';
import { DROPLET_MAX, HAPTIC_MIN_LEVEL, SPRAY_RANGE, createLagoonHaptics, createLagoonSpray, dropletRate, lagoonBeat, lagoonHapticsEnabled, mistLevel, sprayLevel } from './hotel-lagoon-4d.js';
import { LAGOON_VIEW, PIER, SOUND_SOURCES, lagoonSoundLevel } from './hotel-lagoon-data.js';

const main = SOUND_SOURCES.find((s) => s.id === 'main');
const endOfPier = { x: PIER.platform[2] - 0.5, z: 535 };

test('4D lagoon: tingkat basah naik mendekati air terjun dan nol di luar jangkauan atau saat tidak aktif', () => {
  const end = mistLevel(endOfPier);
  assert.ok(end > 0.85, `ujung dermaga ${end}`);
  assert.ok(mistLevel({ x: main.x - 8, z: main.z }) < end);
  assert.ok(mistLevel({ x: main.x - 8, z: main.z }) > mistLevel({ x: main.x - 14, z: main.z }));
  assert.equal(mistLevel({ x: main.x - SPRAY_RANGE, z: main.z }), 0);
  assert.equal(mistLevel({ x: LAGOON_VIEW.x, z: LAGOON_VIEW.z }), 0, 'titik Jelajah di dermaga awal belum basah');
  assert.equal(mistLevel({ x: 0, z: 400 }), 0);
  assert.equal(mistLevel({ ...endOfPier, active: false }), 0);
  const mid = { x: main.x - 9, z: main.z };
  assert.ok(mistLevel({ ...mid, rain: 1 }) > mistLevel({ ...mid, rain: 0 }), 'hujan menambah');
  assert.ok(mistLevel({ ...endOfPier, rain: 1 }) <= 1);
});

test('4D lagoon: percikan di layar paling kuat saat menghadap air terjun', () => {
  const pos = { x: main.x - 6, z: main.z };
  const facing = sprayLevel({ ...pos, fx: 1, fz: 0 }); // menghadap timur = ke air terjun
  const back = sprayLevel({ ...pos, fx: -1, fz: 0 });
  assert.ok(facing > back * 2, `${facing} vs ${back}`);
  assert.ok(Math.abs(back / mistLevel(pos) - 0.4) < 1e-9, 'membelakangi = 40%');
  assert.ok(Math.abs(facing - mistLevel(pos)) < 1e-9, 'menghadap penuh = tingkat basah');
  assert.equal(sprayLevel({ x: 0, z: 400, fx: 0, fz: -1 }), 0);
  assert.equal(sprayLevel({ ...pos, fx: 1, fz: 0, active: false }), 0);
});

test('4D lagoon: denyut getaran makin rapat dan kuat saat dekat, tidak ada di bawah ambang', () => {
  assert.equal(lagoonBeat(0), null);
  assert.equal(lagoonBeat(HAPTIC_MIN_LEVEL - 0.01), null);
  assert.equal(lagoonBeat(NaN), null);
  const a = lagoonBeat(HAPTIC_MIN_LEVEL);
  const b = lagoonBeat(1);
  assert.ok(b.gap < a.gap && b.ms > a.ms);
  assert.ok(b.ms <= 22 && a.ms >= 8, 'getaran halus, tidak sekeras tabrakan');
  assert.ok(lagoonBeat(5).ms === b.ms, 'level dibatasi 1');
});

test('4D lagoon: pembuat getaran memberi jeda antar denyut, bisa dimatikan, dan kebal galat navigator', () => {
  const calls = [];
  const buzz = createLagoonHaptics({ vibrate: (ms) => calls.push(ms) });
  assert.equal(buzz(0, 0.05), 0);
  const first = buzz(1, 1);
  assert.ok(first > 0);
  assert.equal(buzz(1.1, 1), 0, 'masih dalam jeda');
  assert.ok(buzz(1.6, 1) > 0, 'sesudah jeda bergetar lagi');
  assert.equal(calls.length, 2);
  const off = createLagoonHaptics({ vibrate: (ms) => calls.push(ms), enabled: false });
  assert.equal(off(10, 1), 0);
  assert.equal(calls.length, 2);
  const broken = createLagoonHaptics({ vibrate: () => { throw new Error('tidak ada getaran'); } });
  assert.ok(broken(5, 1) > 0, 'galat vibrate diabaikan');
  assert.equal(lagoonHapticsEnabled('', false), true);
  assert.equal(lagoonHapticsEnabled('?getar=0', false), false);
  assert.equal(lagoonHapticsEnabled('?lagoon=0', false), false);
  assert.equal(lagoonHapticsEnabled('', true), false, 'kurangi gerakan');
});

test('4D lagoon: laju tetes layar dibatasi dan lebih sedikit di HP lemah; tanpa DOM tidak berbuat apa-apa', () => {
  assert.equal(dropletRate(0), 0);
  assert.equal(dropletRate(0.02), 0);
  assert.ok(dropletRate(1) > dropletRate(0.3));
  assert.ok(dropletRate(1, true) < dropletRate(1, false));
  assert.ok(DROPLET_MAX.low < DROPLET_MAX.normal);
  const none = createLagoonSpray({ doc: null, win: null });
  none.update({ level: 1, delta: 0.016 });
  assert.equal(none.info().on, false);
  none.dispose();
  const off = createLagoonSpray({ search: '?lagoon=0', doc: { createElement() { throw new Error('tidak boleh dipakai'); } }, win: {} });
  assert.equal(off.info().on, false);
});

test('4D lagoon: lapisan percikan memunculkan tetes, memudarkannya, dan menyembunyikan kanvas saat kering', () => {
  const ops = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === 'canvas' ? null : (...a) => ops.push([k, a])), set: () => true });
  let removed = false;
  const canvas = { style: {}, width: 0, height: 0, setAttribute() {}, getContext: () => ctx, remove() { removed = true; } };
  const doc = { createElement: () => canvas, body: { appendChild() {} } };
  const listeners = {};
  const win = { innerWidth: 800, innerHeight: 600, addEventListener: (e, f) => { listeners[e] = f; }, removeEventListener: (e) => { delete listeners[e]; }, matchMedia: () => ({ matches: false }) };
  const spray = createLagoonSpray({ doc, win });
  assert.equal(canvas.width, 400);
  assert.equal(canvas.style.display, 'none');
  for (let i = 0; i < 30; i++) spray.update({ level: 1, delta: 0.05 });
  assert.ok(spray.info().drops > 5 && spray.info().drops <= DROPLET_MAX.normal);
  assert.equal(canvas.style.display, 'block');
  assert.ok(ops.some(([k]) => k === 'arc'));
  for (let i = 0; i < 80; i++) spray.update({ level: 0, delta: 0.1 });
  assert.equal(spray.info().drops, 0);
  assert.equal(canvas.style.display, 'none');
  win.innerWidth = 1000;
  listeners.resize();
  assert.equal(canvas.width, 500);
  spray.dispose();
  assert.ok(removed && !listeners.resize);
  const reduced = createLagoonSpray({ doc, win: { ...win, matchMedia: () => ({ matches: true }) } });
  assert.equal(reduced.info().on, false, 'kurangi gerakan');
});

test('4D lagoon: hujan menambah volume suara air terjun 30%', () => {
  const base = { x: main.x - 6, z: main.z };
  const dry = lagoonSoundLevel(base).gain;
  const wet = lagoonSoundLevel({ ...base, rain: 1 }).gain;
  assert.ok(Math.abs(wet / dry - 1.3) < 1e-9);
  assert.equal(lagoonSoundLevel({ ...base, rain: 5 }).gain, wet, 'hujan dibatasi 1');
  assert.equal(lagoonSoundLevel({ ...base, rain: 1, active: false }).gain, 0);
});
