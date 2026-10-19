import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOY_DEAD, JOY_RADIUS, createHororInput } from './horor-input.js';
import { createPlayer, stepPlayer } from './horor-player.js';

// DOM tiruan secukupnya: elemen mencatat listener dan anak; doc/win punya fire() untuk memicu peristiwa.
function makeTarget() {
  const handlers = {};
  return {
    handlers,
    addEventListener(t, f) {
      (handlers[t] ||= new Set()).add(f);
    },
    removeEventListener(t, f) {
      handlers[t]?.delete(f);
    },
    fire(t, e = {}) {
      const ev = { preventDefault() {}, ...e };
      for (const f of [...(handlers[t] ?? [])]) f(ev);
      return ev;
    },
    count: () => Object.values(handlers).reduce((n, s) => n + s.size, 0),
  };
}
function makeEl(tag) {
  const el = makeTarget();
  Object.assign(el, {
    tag, style: {}, dataset: {}, children: [], textContent: '', removed: false,
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    remove() { this.removed = true; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
    setPointerCapture() {},
  });
  return el;
}
function makeEnv(touch = true) {
  const doc = Object.assign(makeTarget(), { createElement: makeEl });
  const win = Object.assign(makeTarget(), { navigator: { maxTouchPoints: touch ? 5 : 0 }, matchMedia: () => ({ matches: touch }) });
  doc.defaultView = win;
  const host = makeEl('div');
  return { doc, win, host };
}
const find = (el, pred) => {
  if (pred(el)) return el;
  for (const c of el.children) {
    const r = find(c, pred);
    if (r) return r;
  }
  return null;
};
const key = (doc, type, k, extra = {}) => doc.fire(type, { key: k, ...extra });

test('keyboard: WASD dan panah memberi arah; diagonal dinormalkan', () => {
  const { doc, win } = makeEnv(false);
  const inp = createHororInput({ doc, win });
  key(doc, 'keydown', 'w');
  let i = inp.intent();
  assert.deepEqual([i.x, i.y, i.mag, i.up, i.analog], [0, 1, 1, true, false]);
  key(doc, 'keydown', 'ArrowRight');
  i = inp.intent();
  assert.ok(Math.abs(Math.hypot(i.x, i.y) - 1) < 1e-9, 'diagonal panjang 1');
  assert.ok(i.right && i.up);
  key(doc, 'keyup', 'w');
  key(doc, 'keyup', 'ArrowRight');
  i = inp.intent();
  assert.deepEqual([i.x, i.y, i.mag], [0, 0, 0]);
  inp.destroy();
});

test('keyboard: aksi tercatat sekali per tekan, repeat diabaikan, Shift = lari', () => {
  const { doc, win } = makeEnv(false);
  const inp = createHororInput({ doc, win });
  key(doc, 'keydown', 'e');
  key(doc, 'keydown', 'e', { repeat: true });
  assert.equal(inp.hit('interact'), true);
  inp.consume('interact');
  assert.equal(inp.hit('interact'), false);
  key(doc, 'keyup', 'e'); // lepas dulu: Enter juga berarti 'interact' dan baru terhitung tekan baru bila E sudah lepas
  key(doc, 'keydown', ' ');
  assert.equal(inp.hit('fire'), true);
  assert.equal(inp.down('fire'), true);
  inp.endFrame();
  assert.equal(inp.hit('fire'), false, 'hit hilang sesudah endFrame');
  assert.equal(inp.down('fire'), true, 'tetap ditahan');
  key(doc, 'keyup', ' ');
  assert.equal(inp.down('fire'), false);
  key(doc, 'keydown', 'Shift');
  assert.equal(inp.intent().run, true);
  key(doc, 'keyup', 'Shift');
  assert.equal(inp.intent().run, false);
  for (const [k, a] of [['r', 'reload'], ['i', 'inv'], ['Tab', 'inv'], ['Escape', 'pause'], ['Enter', 'interact']]) {
    key(doc, 'keydown', k);
    assert.equal(inp.hit(a), true, `${k} -> ${a}`);
    key(doc, 'keyup', k);
    inp.endFrame();
  }
  inp.destroy();
});

test('keyboard: tombol tak dikenal tidak di-preventDefault; tombol dikenal ya (mencegah gulir halaman)', () => {
  const { doc, win } = makeEnv(false);
  const inp = createHororInput({ doc, win });
  let prevented = 0;
  doc.fire('keydown', { key: 'F5', preventDefault: () => prevented++ });
  assert.equal(prevented, 0);
  doc.fire('keydown', { key: ' ', preventDefault: () => prevented++ });
  assert.equal(prevented, 1);
  inp.destroy();
});

test('blur melepas semua tombol (tidak berjalan sendiri sesudah pindah tab)', () => {
  const { doc, win } = makeEnv(false);
  const inp = createHororInput({ doc, win });
  key(doc, 'keydown', 'w');
  key(doc, 'keydown', 'Shift');
  win.fire('blur');
  const i = inp.intent();
  assert.deepEqual([i.mag, i.up, i.run], [0, false, false]);
  inp.destroy();
});

test('layar sentuh: UI dipasang di host; desktop tanpa UI', () => {
  const t = makeEnv(true);
  const inp = createHororInput({ ...t, host: t.host });
  assert.equal(inp.isTouch, true);
  assert.equal(t.host.children.length, 1);
  const labels = t.host.children[0].children.filter((c) => c.tag === 'button').map((b) => b.dataset.act).sort();
  assert.deepEqual(labels, ['fire', 'interact', 'inv', 'reload', 'run']);
  inp.destroy();
  const d = makeEnv(false);
  const inp2 = createHororInput({ ...d, host: d.host });
  assert.equal(inp2.isTouch, false);
  assert.equal(d.host.children.length, 0);
  inp2.destroy();
  const forced = makeEnv(false);
  const inp3 = createHororInput({ ...forced, host: forced.host, touch: true });
  assert.equal(forced.host.children.length, 1, 'touch dipaksa');
  inp3.destroy();
});

test('joystick melayang: dorong atas = maju analog, di luar radius dijepit, lepas = nol', () => {
  const { doc, win, host } = makeEnv(true);
  const inp = createHororInput({ doc, win, host });
  const zone = host.children[0].children[0];
  zone.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
  zone.fire('pointermove', { pointerId: 1, clientX: 100, clientY: 200 - JOY_RADIUS });
  let i = inp.intent();
  assert.equal(i.analog, true);
  assert.ok(i.y > 0.99 && Math.abs(i.x) < 1e-9 && i.mag > 0.99, JSON.stringify(i));
  zone.fire('pointermove', { pointerId: 1, clientX: 100 + JOY_RADIUS * 5, clientY: 200 });
  i = inp.intent();
  assert.ok(i.x > 0.99 && i.mag <= 1 + 1e-9, 'dijepit ke radius');
  assert.ok(i.right);
  zone.fire('pointermove', { pointerId: 1, clientX: 100 + 2, clientY: 200 });
  assert.equal(inp.intent().mag, 0, 'di dalam zona mati');
  assert.ok(JOY_DEAD > 0.1 * 1 && 2 / JOY_RADIUS < JOY_DEAD);
  zone.fire('pointermove', { pointerId: 1, clientX: 100, clientY: 200 + JOY_RADIUS });
  assert.equal(inp.intent().down, true);
  zone.fire('pointerup', { pointerId: 1 });
  i = inp.intent();
  assert.deepEqual([i.x, i.y, i.mag, i.analog], [0, 0, 0, false]);
  inp.destroy();
});

test('joystick: hanya satu jari mengendalikan; jari lain dan pointerId asing diabaikan', () => {
  const { doc, win, host } = makeEnv(true);
  const inp = createHororInput({ doc, win, host });
  const zone = host.children[0].children[0];
  zone.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
  zone.fire('pointerdown', { pointerId: 2, clientX: 300, clientY: 50 });
  zone.fire('pointermove', { pointerId: 2, clientX: 300, clientY: 0 });
  assert.equal(inp.intent().mag, 0, 'jari kedua tidak menggerakkan');
  zone.fire('pointermove', { pointerId: 1, clientX: 100, clientY: 200 - JOY_RADIUS });
  assert.ok(inp.intent().y > 0.9);
  zone.fire('pointerup', { pointerId: 2 });
  assert.ok(inp.intent().y > 0.9, 'melepas jari kedua tidak mematikan joystick');
  zone.fire('pointercancel', { pointerId: 1 });
  assert.equal(inp.intent().mag, 0);
  inp.destroy();
});

test('tombol layar: aksi = sekali tekan, Lari = sakelar', () => {
  const { doc, win, host } = makeEnv(true);
  const inp = createHororInput({ doc, win, host });
  const btn = (a) => find(host, (e) => e.dataset?.act === a);
  btn('interact').fire('pointerdown', { pointerId: 3 });
  assert.equal(inp.hit('interact'), true);
  btn('interact').fire('pointerup', { pointerId: 3 });
  assert.equal(inp.down('interact'), false);
  btn('fire').fire('pointerdown', { pointerId: 3 });
  assert.equal(inp.down('fire'), true, 'tembak ditahan selama jari di tombol');
  btn('fire').fire('pointerleave', { pointerId: 3 });
  assert.equal(inp.down('fire'), false);
  btn('run').fire('pointerdown', { pointerId: 3 });
  assert.equal(inp.intent().run, true);
  btn('run').fire('pointerup', { pointerId: 3 });
  assert.equal(inp.intent().run, true, 'sakelar tetap menyala');
  btn('run').fire('pointerdown', { pointerId: 3 });
  assert.equal(inp.intent().run, false);
  inp.destroy();
});

test('onGesture dipanggil pada interaksi pertama (membuka kunci audio peramban)', () => {
  const { doc, win, host } = makeEnv(true);
  let n = 0;
  const inp = createHororInput({ doc, win, host, onGesture: () => n++ });
  key(doc, 'keydown', 'w');
  host.children[0].children[0].fire('pointerdown', { pointerId: 1, clientX: 1, clientY: 1 });
  assert.equal(n, 2);
  inp.destroy();
});

test('destroy: semua listener lepas, UI dibuang, aman dipanggil dua kali', () => {
  const { doc, win, host } = makeEnv(true);
  const inp = createHororInput({ doc, win, host });
  assert.ok(doc.count() > 0 && win.count() > 0);
  inp.destroy();
  assert.equal(doc.count(), 0);
  assert.equal(win.count(), 0);
  assert.equal(host.children[0].removed, true);
  assert.doesNotThrow(() => inp.destroy());
  key(doc, 'keydown', 'w');
  assert.equal(inp.intent().mag, 0, 'sesudah destroy tidak menerima input');
});

test('terpadu dengan stepPlayer: keyboard tank dan joystick modern menggerakkan pemain', () => {
  const k = makeEnv(false);
  const kb = createHororInput({ doc: k.doc, win: k.win });
  const p = createPlayer({ rot: 0 });
  key(k.doc, 'keydown', 'ArrowUp');
  for (let t = 0; t < 1; t += 1 / 60) stepPlayer(p, kb.intent(), 1 / 60, { scheme: 'tank' });
  assert.ok(p.z > 1);
  kb.destroy();

  const t = makeEnv(true);
  const joy = createHororInput({ doc: t.doc, win: t.win, host: t.host });
  const q = createPlayer({ rot: 0 });
  const zone = t.host.children[0].children[0];
  zone.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
  zone.fire('pointermove', { pointerId: 1, clientX: 100 - JOY_RADIUS, clientY: 200 }); // kiri layar
  for (let s = 0; s < 1; s += 1 / 60) stepPlayer(q, joy.intent(), 1 / 60, { scheme: 'modern', camYaw: 0 });
  assert.ok(q.x > 1, `kamera +z: kiri layar = +x, x=${q.x}`);
  joy.destroy();
});
