import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CINEMA_LEVEL, EYE_WATER, canvasTransform, cinemaHapticsEnabled, createHotelCinema, createRumbleHaptics, overlayLevels, tiltScale } from './cinema-5d-fx.js';
import { WATER_MAX } from './cinema-5d-data.js';
import { hotelLevelY, hotelRoomsAtLevel } from './hotel-layout.js';

class FakeEl {
  constructor(tag) {
    this.tag = tag;
    this.style = {};
    this.children = [];
    this.listeners = {};
    this.textContent = '';
    this.parentElement = null;
    this.clientWidth = 900;
    this.clientHeight = 500;
  }
  setAttribute() {}
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  remove() { this.removed = true; }
  getContext() { return null; }
}
const makeEnv = ({ reduced = false, store = {} } = {}) => {
  const doc = { createElement: (t) => new FakeEl(t), body: new FakeEl('body') };
  const win = {
    matchMedia: () => ({ matches: reduced }),
    addEventListener() {}, removeEventListener() {}, innerWidth: 900, innerHeight: 500,
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  };
  const canvas = new FakeEl('canvas');
  const wrap = new FakeEl('div');
  wrap.appendChild(canvas);
  return { doc, win, renderer: { domElement: canvas }, canvas, wrap, scene: new THREE.Scene(), store };
};
const room = hotelRoomsAtLevel(CINEMA_LEVEL).find((r) => r.id === 'cinema');
const inSeat = { x: -60, z: 530, y: hotelLevelY(CINEMA_LEVEL), level: CINEMA_LEVEL };

test('bioskop 5D: ruang bioskop ada di lantai 3 dan efek mati bila ?bioskop=0 atau ruang tidak ada', () => {
  assert.ok(room, 'Mini Cinema lantai 3');
  const env = makeEnv();
  assert.equal(createHotelCinema({ ...env, search: '?bioskop=0' }).info().on, false);
  assert.equal(createHotelCinema({ ...env, room: undefined, search: '', scene: env.scene }).info().on === true, true, 'ruang bawaan ditemukan');
});

test('bioskop 5D: miring dan skala kanvas menutup sudut layar', () => {
  assert.ok(tiltScale(0) > 1 && tiltScale(0) < 1.1);
  assert.ok(tiltScale(12, 1.8) > tiltScale(5, 1.8));
  assert.ok(tiltScale(-12, 1.8) === tiltScale(12, 1.8));
  assert.ok(tiltScale(12, 1.8) >= Math.cos((12 * Math.PI) / 180) + 1.8 * Math.sin((12 * Math.PI) / 180), 'sudut tidak terbuka');
  assert.equal(canvasTransform({ tilt: 0, shake: { x: 0, y: 0 } }), '');
  const t = canvasTransform({ tilt: 12, shake: { x: 0.02, y: -0.01 }, aspect: 1.8 });
  assert.match(t, /rotate\(12\.00deg\)/);
  assert.match(t, /scale\(1\.\d+\)/);
});

test('bioskop 5D: lapisan layar: gelap dibatasi, kilatan dibatasi, nuansa bawah air hanya saat kepala tenggelam', () => {
  assert.deepEqual(overlayLevels({}), { dim: 0, flash: 0, tint: 0 });
  assert.ok(overlayLevels({ dim: 1 }).dim <= 0.9);
  assert.ok(overlayLevels({ flash: 1 }).flash <= 0.9);
  assert.equal(overlayLevels({ water: EYE_WATER }).tint, 0);
  assert.ok(overlayLevels({ water: WATER_MAX }).tint > 0);
});

test('bioskop 5D: getaran HP: mati dengan ?getar=0, ?bioskop=0, atau kurangi gerakan; denyut mengikuti jeda', () => {
  assert.equal(cinemaHapticsEnabled('', false), true);
  assert.equal(cinemaHapticsEnabled('?getar=0', false), false);
  assert.equal(cinemaHapticsEnabled('?bioskop=0', false), false);
  assert.equal(cinemaHapticsEnabled('', true), false);
  const calls = [];
  const h = createRumbleHaptics({ vibrate: (ms) => calls.push(ms) });
  assert.equal(h(0, 0.01), 0);
  assert.ok(h(1, 1) > 0);
  assert.equal(h(1.05, 1), 0, 'masih dalam jeda');
  assert.ok(h(1.3, 1) > 0);
  assert.equal(calls.length, 2);
  assert.equal(createRumbleHaptics({ vibrate: () => calls.push(0), enabled: false })(5, 1), 0);
  assert.doesNotThrow(() => createRumbleHaptics({ vibrate: () => { throw new Error('x'); } })(9, 1));
});

test('bioskop 5D: di luar ruang bioskop tidak ada efek apa pun', () => {
  const env = makeEnv();
  const c = createHotelCinema({ ...env, search: '' });
  c.update({ me: { x: 0, z: 507, level: 0 }, delta: 0.016, nowMs: 31000 });
  const i = c.info();
  assert.equal(i.inside, false);
  assert.equal(i.transform, '');
  assert.equal(i.water.visible, false);
  assert.equal(env.canvas.style.transform ?? '', '');
  // di lantai 3 tetapi di ruang lain
  c.update({ me: { x: 30, z: 507, level: CINEMA_LEVEL }, delta: 0.016, nowMs: 31000 });
  assert.equal(c.info().inside, false);
  c.dispose();
});

test('bioskop 5D: di kursi saat tsunami: kanvas miring dan berguncang, air naik, mode tenang mematikan gerakan', () => {
  const env = makeEnv();
  const c = createHotelCinema({ ...env, search: '' });
  c.update({ me: inSeat, delta: 0.016, nowMs: 31000 }); // detik 31 adegan tsunami (slot 0)
  const i = c.info();
  assert.equal(i.inside, true);
  assert.equal(i.id, 'tsunami');
  assert.equal(i.playing, true);
  assert.match(env.canvas.style.transform, /rotate\(/);
  assert.equal(env.wrap.style.overflow, 'hidden', 'sudut layar disembunyikan selama miring');
  assert.equal(i.water.visible, true);
  assert.ok(i.water.y > hotelLevelY(CINEMA_LEVEL) && i.water.y < hotelLevelY(CINEMA_LEVEL) + WATER_MAX + 0.1);
  c.setComfort('calm');
  c.update({ me: inSeat, delta: 0.016, nowMs: 31000 });
  assert.equal(c.info().comfort, 'calm');
  assert.equal(env.canvas.style.transform, '', 'tanpa miring dan guncangan');
  assert.equal(env.store['nikora.bioskop.nyaman'], 'calm', 'pilihan disimpan');
  c.dispose();
  assert.equal(env.canvas.style.transform, '');
});

test('bioskop 5D: jeda antar tayangan: efek nol dan papan menghitung mundur', () => {
  const env = makeEnv();
  const c = createHotelCinema({ ...env, search: '' });
  c.update({ me: inSeat, delta: 0.016, nowMs: 70000 }); // tsunami berdurasi 52 dtk; detik 70 = jeda
  const i = c.info();
  assert.equal(i.playing, false);
  assert.equal(i.water.visible, false);
  assert.equal(i.transform, '');
  const hud = env.doc.body.children.find((el) => el.tag === 'div' && el.style.top);
  assert.ok(hud, 'papan info dipasang');
  assert.equal(hud.style.display, 'flex');
  assert.match(hud.children[0].textContent, /berikutnya Hantu dalam 0:20/);
  c.dispose();
});

test('bioskop 5D: kurangi gerakan memaksa mode tenang dan tidak bisa diganti', () => {
  const env = makeEnv({ reduced: true });
  const c = createHotelCinema({ ...env, search: '?nyaman=full' });
  assert.equal(c.info().comfort, 'calm');
  c.setComfort('full');
  assert.equal(c.info().comfort, 'calm');
  assert.equal(c.info().reducedMotion, true);
});

test('bioskop 5D: pilihan kenyamanan: alamat mengalahkan simpanan, simpanan dipakai bila tidak ada alamat, tombol berputar', () => {
  assert.equal(createHotelCinema({ ...makeEnv({ store: { 'nikora.bioskop.nyaman': 'gentle' } }), search: '' }).info().comfort, 'gentle');
  assert.equal(createHotelCinema({ ...makeEnv({ store: { 'nikora.bioskop.nyaman': 'gentle' } }), search: '?nyaman=calm' }).info().comfort, 'calm');
  assert.equal(createHotelCinema({ ...makeEnv({ store: { 'nikora.bioskop.nyaman': 'ngawur' } }), search: '' }).info().comfort, 'full');
  const c = createHotelCinema({ ...makeEnv(), search: '' });
  assert.deepEqual([c.cycleComfort(), c.cycleComfort(), c.cycleComfort()], ['gentle', 'calm', 'full']);
});

test('bioskop 5D: adegan hantu menggeser kursi kosong dan menggelapkan ruangan; kilatan mati di mode tenang', () => {
  const env = makeEnv();
  const c = createHotelCinema({ ...env, search: '' });
  const ghostAt = (nowMs, comfort) => {
    if (comfort) c.setComfort(comfort);
    c.update({ me: inSeat, delta: 0.016, nowMs });
    const ghost = env.scene.getObjectByName('bioskop-kursi-hantu');
    return { ghost, v: c.info().values, x: ghost.position.x };
  };
  const slot = 90000; // slot 1 = hantu
  const rest = ghostAt(slot + 10000);
  assert.equal(c.info().id, 'hantu');
  const moved = ghostAt(slot + 30000);
  assert.ok(moved.v.chair > 0.99 && moved.x < rest.x - 0.8, 'kursi bergeser ke arah layar');
  assert.ok(moved.v.dim > 0.5);
  const scare = ghostAt(slot + 31080, 'full');
  assert.ok(scare.v.flash > 0.5, 'kejutan pada detik 31');
  assert.equal(ghostAt(slot + 31080, 'calm').v.flash, 0);
  assert.equal(env.scene.getObjectByName('bioskop-air').visible, false);
  c.dispose();
  assert.equal(env.scene.getObjectByName('bioskop-air'), undefined, 'air dibuang dari dunia');
});
