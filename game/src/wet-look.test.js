import test from 'node:test';
import assert from 'node:assert/strict';
import { WET, createWetLook } from './wet-look.js';

class Color {
  constructor(r, g, b) { this.r = r; this.g = g; this.b = b; }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
}
const std = (r = 0.8, g = 0.6, b = 0.4) => ({ color: new Color(r, g, b), roughness: 0.8, envMapIntensity: 1, isMeshStandardMaterial: true });
const basic = () => ({ color: new Color(0.8, 0.6, 0.4), isMeshBasicMaterial: true });
const glassMat = () => ({ ...std(), transparent: true, opacity: 0.3 });
const obj = (material, children = []) => ({ material, children, visible: true });
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('tanah basah menggelapkan dan menghaluskan bahan dunia, bahan polos dan kaca tidak disentuh', () => {
  const m = std();
  const b = basic();
  const g = glassMat();
  const scene = { children: [obj(m), obj(b), obj(g)] };
  createWetLook({ scene }).update({ time: 1, wet: 1 });
  assert.ok(near(m.color.r, 0.8 * (1 - WET.darken)));
  assert.ok(near(m.roughness, 0.8 * (1 - WET.rough)));
  assert.ok(near(m.envMapIntensity, 1 + WET.env));
  assert.equal(b.color.r, 0.8, 'bahan polos (langit, lampu) tetap');
  assert.equal(g.color.r, 0.8, 'kaca tetap');
});

test('mengering mengembalikan cat asli persis', () => {
  const m = std();
  const wl = createWetLook({ scene: { children: [obj(m)] } });
  wl.update({ time: 1, wet: 1 });
  assert.notEqual(m.color.r, 0.8);
  wl.update({ time: 3, wet: 0 });
  assert.equal(m.color.r, 0.8);
  assert.equal(m.roughness, 0.8);
  assert.equal(m.envMapIntensity, 1);
});

test('bahan yang dipakai bersama dibasahi sekali, bukan dua kali', () => {
  const m = std();
  createWetLook({ scene: { children: [obj(m), obj(m)] } }).update({ time: 1, wet: 1 });
  assert.ok(near(m.color.r, 0.8 * (1 - WET.darken)));
});

test('avatar pemain basah menurut keterpaparannya sendiri, bukan menurut tanah', () => {
  const am = basic(); // avatar boleh memakai bahan polos
  const avatar = obj(am);
  const m = std();
  const wl = createWetLook({ scene: { children: [obj(m), avatar] } });
  wl.update({ time: 1, wet: 1, personWet: 0, avatar });
  assert.ok(near(m.color.r, 0.8 * (1 - WET.darken)), 'dunia basah');
  assert.equal(am.color.r, 0.8, 'avatar kering karena berteduh');
  wl.update({ time: 3, wet: 1, personWet: 1, avatar });
  assert.ok(near(am.color.r, 0.8 * (1 - WET.person)));
  wl.update({ time: 6, wet: 1, personWet: 0, avatar });
  assert.equal(am.color.r, 0.8, 'mengering di bawah atap');
});

test('warna yang diubah kode lain saat basah menjadi dasar yang baru', () => {
  const m = std();
  const wl = createWetLook({ scene: { children: [obj(m)] } });
  wl.update({ time: 1, wet: 1 });
  m.color.r = 0.5; // mis. lampu menyala
  wl.update({ time: 10, wet: 1 });
  assert.ok(near(m.color.r, 0.5 * (1 - WET.darken)));
});

test('objek tersembunyi dilewati', () => {
  const m = std();
  const hidden = obj(m);
  hidden.visible = false;
  createWetLook({ scene: { children: [hidden] } }).update({ time: 1, wet: 1 });
  assert.equal(m.color.r, 0.8);
});
