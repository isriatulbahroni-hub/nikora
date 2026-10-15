import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
dom.window.HTMLCanvasElement.prototype.getContext = () => null;        // tanpa kanvas/WebGL
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const { enhanceGifts } = await import('../src/world3d/card-ui.js');

const GIFTS = [
  { kind: 'bank', label: 'BCA', accountName: 'Dimas Pratama', accountNo: '0123456789' },
  { kind: 'ewallet', label: 'GoPay', accountName: 'Rani', accountNo: '081234567890' },
];
const mk = () => { const root = document.createElement('div'); const list = document.createElement('ul'); list.className = 'g-list'; list.innerHTML = '<li>teks asli</li>'; root.append(list); document.body.append(root); return { root, list }; };
const no = () => false;

test('mengganti daftar dengan kartu: daftar disembunyikan, label akses lengkap, destroy memulihkan', async () => {
  const { root, list } = mk(); const copied = [];
  const c = await enhanceGifts({ list, gifts: GIFTS, copy: (t) => copied.push(t), env: {}, probe: no });
  assert.ok(root.querySelector('.gc-ui')); assert.equal(list.hidden, true);
  assert.match(root.querySelector('.gc-stage').getAttribute('aria-label'), /BCA.*Dimas Pratama.*0123456789/);
  c.destroy();
  assert.equal(root.querySelector('.gc-ui'), null); assert.equal(list.hidden, false);
});

test('tanpa WebGL/kanvas: kartu CSS dengan dua sisi, nomor dikelompokkan di kartu tetapi disalin utuh', async () => {
  const { root, list } = mk(); const copied = [];
  const c = await enhanceGifts({ list, gifts: GIFTS, copy: (t, b) => { copied.push(t); b.textContent = 'Tersalin'; }, env: {}, probe: no });
  assert.equal(c.mode, 'css'); assert.ok(root.querySelector('.gc')); assert.equal(root.querySelectorAll('.gc-face').length, 2);
  assert.match(root.querySelector('.gc-front').textContent, /0123 4567 89/);
  root.querySelector('.g-copy').click();
  assert.deepEqual(copied, ['0123456789']); assert.equal(root.querySelector('.g-copy').textContent, 'Tersalin');
  c.destroy();
});

test('balik kartu: tombol dan ketukan kartu sama-sama membalik, aria-pressed ikut', async () => {
  const { root, list } = mk();
  const c = await enhanceGifts({ list, gifts: GIFTS, copy() {}, env: {}, probe: no });
  const flip = root.querySelector('.gc-flip'), card = root.querySelector('.gc');
  assert.equal(flip.getAttribute('aria-pressed'), 'false');
  flip.click(); assert.equal(flip.getAttribute('aria-pressed'), 'true'); assert.equal(card.style.getPropertyValue('--flip'), '180deg');
  card.click(); assert.equal(flip.getAttribute('aria-pressed'), 'false'); assert.equal(card.style.getPropertyValue('--flip'), '0deg');
  c.destroy();
});

test('beberapa rekening: tab memilih kartu, info dan tombol salin mengikuti, kartu kembali ke sisi depan', async () => {
  const { root, list } = mk(); const copied = [];
  const c = await enhanceGifts({ list, gifts: GIFTS, copy: (t) => copied.push(t), env: {}, probe: no });
  const tabs = [...root.querySelectorAll('.gc-tab')];
  assert.equal(tabs.length, 2); assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  root.querySelector('.gc-flip').click();
  tabs[1].click();
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true'); assert.equal(tabs[0].getAttribute('aria-selected'), 'false');
  assert.equal(root.querySelector('.gc-info strong').textContent, 'GoPay'); assert.equal(root.querySelector('.gc-info code').textContent, '081234567890');
  assert.equal(root.querySelector('.gc').style.getPropertyValue('--flip'), '0deg');
  root.querySelector('.g-copy').click(); assert.deepEqual(copied, ['081234567890']);
  c.destroy();
});

test('satu rekening: tanpa tab; tanpa nomor: tombol salin dan nomor disembunyikan', async () => {
  const { root, list } = mk();
  const c = await enhanceGifts({ list, gifts: [{ kind: 'qris', label: 'QRIS', accountName: 'Dimas' }], copy() {}, env: {}, probe: no });
  assert.equal(root.querySelector('.gc-tabs'), null);
  assert.equal(root.querySelector('.g-copy').hidden, true); assert.equal(root.querySelector('code').hidden, true);
  c.destroy();
});

test('keamanan: label/nama berisi HTML tampil sebagai teks, bukan elemen', async () => {
  const { root, list } = mk();
  const c = await enhanceGifts({ list, gifts: [{ kind: 'bank', label: '<img src=x onerror=alert(1)>', accountName: '<script>alert(2)</script>', accountNo: '1234567890' }], copy() {}, env: {}, probe: no });
  assert.equal(root.querySelectorAll('.gc-ui img, .gc-ui script').length, 0);
  assert.ok(root.querySelector('.gc-info strong').textContent.includes('<img'));
  c.destroy();
});

test('gerak minimal atau perangkat lemah: kartu CSS diam (tanpa miring), tidak memanggil WebGL', async () => {
  for (const env of [{ reduced: true }, { light: true }]) {
    const { root, list } = mk(); let probed = 0;
    const c = await enhanceGifts({ list, gifts: GIFTS, copy() {}, env, probe: () => { probed++; return true; } });
    assert.equal(c.mode, 'css'); assert.equal(probed, 0); assert.equal(root.querySelector('.gc').dataset.still, '1');
    c.destroy();
  }
});

test('WebGL terdeteksi tetapi pembuatan kartu 3D gagal: jatuh ke kartu CSS, tidak macet', async () => {
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  const { root, list } = mk();
  const c = await enhanceGifts({ list, gifts: GIFTS, copy() {}, env: {}, probe: () => true });
  console.warn = warn;
  assert.equal(c.mode, 'css'); assert.ok(root.querySelector('.gc')); assert.ok(warned >= 1);
  c.destroy();
});

const fake3D = () => { const calls = { destroyed: 0, idx: [] }; let opts; const make3D = async (stage, o) => { opts = o; const cv = document.createElement('canvas'); cv.className = 'gc-canvas'; stage.append(cv); return { setIndex: (i) => calls.idx.push(i), flip() {}, isBack: () => false, destroy() { calls.destroyed++; cv.remove(); } }; }; return { make3D, calls, fail: (w) => opts.onFail(w) }; };

test('GPU gagal menggambar (onFail): beralih ke kartu CSS di tempat, rekening terpilih dipertahankan, tab tetap berfungsi', async () => {
  const { root, list } = mk(); const f = fake3D();
  const c = await enhanceGifts({ list, gifts: GIFTS, copy() {}, env: {}, probe: () => true, make3D: f.make3D });
  const stage = root.querySelector('.gc-stage');
  assert.equal(c.mode, '3d'); assert.equal(stage.dataset.mode, '3d'); assert.ok(stage.querySelector('.gc-canvas')); assert.equal(stage.querySelector('.gc'), null);
  root.querySelectorAll('.gc-tab')[1].click(); assert.deepEqual(f.calls.idx, [1]);
  f.fail('kosong');
  assert.equal(f.calls.destroyed, 1); assert.equal(stage.querySelector('.gc-canvas'), null);
  assert.ok(stage.querySelector('.gc')); assert.equal(stage.dataset.mode, 'css'); assert.equal(stage.dataset.fail, 'kosong');
  assert.equal(root.querySelectorAll('.gc-face').length, 2);
  root.querySelectorAll('.gc-tab')[0].click();                       // tab masih bekerja pada kartu CSS
  assert.equal(f.calls.idx.length, 1);
  assert.equal(root.querySelector('.gc-info strong').textContent, 'BCA');
  f.fail('shader');                                                  // panggilan ganda tidak membuat kartu dobel
  assert.equal(stage.querySelectorAll('.gc').length, 1); assert.equal(f.calls.destroyed, 1);
  c.destroy(); assert.equal(root.querySelector('.gc-ui'), null); assert.equal(list.hidden, false);
});

test('pembuatan kartu 3D melempar galat -> kartu CSS; ?kartu=css memaksa kartu CSS', async () => {
  const { root, list } = mk();
  const c = await enhanceGifts({ list, gifts: GIFTS, copy() {}, env: {}, probe: () => true, make3D: async () => { throw new Error('gpu'); } });
  assert.equal(c.mode, 'css'); assert.ok(root.querySelector('.gc'));
  const dom2 = new JSDOM('<!doctype html>', { url: 'http://x.test/?tema=islami&kartu=css' });
  const old = globalThis.location; Object.defineProperty(globalThis, 'location', { value: dom2.window.location, configurable: true });
  try {
    const m = mk(); let called = 0;
    const c2 = await enhanceGifts({ list: m.list, gifts: GIFTS, copy() {}, env: {}, probe: () => true, make3D: async () => { called++; return null; } });
    assert.equal(c2.mode, 'css'); assert.equal(called, 0);
  } finally { Object.defineProperty(globalThis, 'location', { value: old, configurable: true }); }
});
