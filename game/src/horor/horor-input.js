// Input Mansion Horor: keyboard + joystick layar (kiri) + tombol aksi (kanan). Satu `intent()` untuk keduanya.
//
// Pola joystick melayang dan tombol layar mengikuti game bulu tangkis di repo ini (src/badminton/index.js);
// pemetaan aksi dan penggabungan arah digital + analog mengikuti KantLex/yoru-no-gakko (MIT) src/01-core.js
// (lihat docs/horor/THIRD_PARTY_NOTICES.md). `doc` dan `win` bisa disuntik supaya modul ini bisa diuji tanpa peramban.
//
// Aksi: interact (E/Enter), fire (Spasi), reload (R), inv (I/Tab), pause (Esc/P), run (Shift; di layar sentuh: tombol Lari).
// Arah: WASD / panah.
const KEYMAP = Object.freeze({
  arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
  shift: 'run', e: 'interact', enter: 'interact', ' ': 'fire', r: 'reload', i: 'inv', tab: 'inv', escape: 'pause', p: 'pause',
});
const BUTTONS = Object.freeze([
  { act: 'interact', label: 'Aksi', pos: 'right:18px;bottom:96px' },
  { act: 'fire', label: 'Tembak', pos: 'right:96px;bottom:34px' },
  { act: 'reload', label: 'Isi', pos: 'right:18px;bottom:22px', small: true },
  { act: 'inv', label: 'Tas', pos: 'right:18px;top:12px', small: true },
  { act: 'run', label: 'Lari', pos: 'right:96px;bottom:122px', small: true, toggle: true },
]);
export const JOY_RADIUS = 56;
export const JOY_DEAD = 0.12;
export const ACTIONS = Object.freeze(['interact', 'fire', 'reload', 'inv', 'pause']);

const detectTouch = (win) => !!(win.matchMedia?.('(pointer: coarse)')?.matches || (win.navigator?.maxTouchPoints ?? 0) > 0);

/**
 * @param {object} o
 * @param {Document} [o.doc]
 * @param {Window} [o.win]
 * @param {HTMLElement} [o.host]  Tempat tombol dan joystick dipasang (default: tanpa UI sentuh)
 * @param {boolean} [o.touch]  Paksa tampilkan UI sentuh (default: deteksi layar sentuh)
 * @param {() => void} [o.onGesture]  Dipanggil pada interaksi pertama (membuka kunci audio peramban)
 */
export function createHororInput({ doc = document, win = doc.defaultView ?? window, host = null, touch, onGesture = () => {} } = {}) {
  const isTouch = touch ?? detectTouch(win);
  const held = new Set();
  const pressed = new Set();
  const joy = { x: 0, y: 0, mag: 0 };
  let runToggle = false;
  let destroyed = false;
  const cleanups = [];
  const listen = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  const press = (a) => {
    if (!held.has(a)) pressed.add(a);
    held.add(a);
  };
  const onKeyDown = (e) => {
    const a = KEYMAP[String(e.key).toLowerCase()];
    if (!a) return;
    e.preventDefault?.();
    onGesture();
    if (!e.repeat) press(a);
    held.add(a);
  };
  const onKeyUp = (e) => {
    const a = KEYMAP[String(e.key).toLowerCase()];
    if (a) held.delete(a);
  };
  const clearAll = () => {
    held.clear();
    joy.x = joy.y = joy.mag = 0;
  };
  listen(doc, 'keydown', onKeyDown);
  listen(doc, 'keyup', onKeyUp);
  listen(win, 'blur', clearAll);

  // ---------- UI sentuh ----------
  let root = null;
  let joyBase = null;
  let joyKnob = null;
  if (isTouch && host) {
    root = doc.createElement('div');
    root.style.cssText = 'position:absolute;inset:0;touch-action:none;user-select:none;-webkit-user-select:none;pointer-events:none';
    const zone = doc.createElement('div'); // separuh kiri layar: tempat menaruh ibu jari
    zone.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:55%;pointer-events:auto;touch-action:none';
    joyBase = doc.createElement('div');
    joyBase.style.cssText = `position:absolute;display:none;width:${JOY_RADIUS * 2}px;height:${JOY_RADIUS * 2}px;border-radius:50%;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.35);pointer-events:none`;
    joyKnob = doc.createElement('div');
    joyKnob.style.cssText = 'position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,255,255,.4)';
    joyBase.appendChild(joyKnob);
    zone.appendChild(joyBase);
    root.appendChild(zone);

    let joyId = null;
    let origin = null;
    const joyUpdate = (e) => {
      let dx = e.clientX - origin.x;
      let dy = e.clientY - origin.y;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) {
        dx = (dx / len) * JOY_RADIUS;
        dy = (dy / len) * JOY_RADIUS;
      }
      joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / JOY_RADIUS;
      const ny = -dy / JOY_RADIUS; // dorong ke atas = maju
      const mag = Math.hypot(nx, ny);
      if (mag < JOY_DEAD) joy.x = joy.y = joy.mag = 0;
      else {
        joy.x = nx;
        joy.y = ny;
        joy.mag = Math.min(1, mag);
      }
    };
    const joyEnd = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null;
      joy.x = joy.y = joy.mag = 0;
      joyKnob.style.transform = '';
      joyBase.style.display = 'none';
    };
    listen(zone, 'pointerdown', (e) => {
      if (joyId !== null) return;
      onGesture();
      joyId = e.pointerId;
      zone.setPointerCapture?.(e.pointerId);
      const r = zone.getBoundingClientRect();
      origin = { x: e.clientX, y: e.clientY };
      joyBase.style.left = `${e.clientX - r.left - JOY_RADIUS}px`;
      joyBase.style.top = `${e.clientY - r.top - JOY_RADIUS}px`;
      joyBase.style.display = 'block';
      joyUpdate(e);
      e.preventDefault?.();
    });
    listen(zone, 'pointermove', (e) => {
      if (e.pointerId === joyId) joyUpdate(e);
    });
    listen(zone, 'pointerup', joyEnd);
    listen(zone, 'pointercancel', joyEnd);
    listen(zone, 'lostpointercapture', joyEnd);

    for (const b of BUTTONS) {
      const el = doc.createElement('button');
      el.textContent = b.label;
      el.dataset.act = b.act;
      const size = b.small ? 52 : 68;
      el.style.cssText = `position:absolute;${b.pos};width:${size}px;height:${size}px;border-radius:50%;border:2px solid rgba(255,255,255,.4);background:rgba(20,20,24,.55);color:#fff;font:600 ${b.small ? 12 : 14}px system-ui,sans-serif;pointer-events:auto;touch-action:none;padding:0`;
      listen(el, 'pointerdown', (e) => {
        onGesture();
        if (b.toggle) {
          runToggle = !runToggle;
          el.style.background = runToggle ? 'rgba(200,60,60,.7)' : 'rgba(20,20,24,.55)';
        } else press(b.act);
        e.preventDefault?.();
      });
      if (!b.toggle) {
        const off = () => held.delete(b.act);
        listen(el, 'pointerup', off);
        listen(el, 'pointercancel', off);
        listen(el, 'pointerleave', off);
      }
      root.appendChild(el);
    }
    host.appendChild(root);
  }

  const out = { x: 0, y: 0, mag: 0, analog: false, up: false, down: false, left: false, right: false, run: false };
  return {
    isTouch,
    /** Niat gerak frame ini (objek yang sama dipakai ulang): lihat stepPlayer di horor-player.js. */
    intent() {
      let x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
      let y = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
      out.analog = !x && !y && joy.mag > 0;
      const l = Math.hypot(x, y);
      if (l) {
        x /= l;
        y /= l;
      }
      x += joy.x;
      y += joy.y;
      const n = Math.hypot(x, y);
      const mag = Math.min(1, n);
      out.x = n ? (x / n) * mag : 0;
      out.y = n ? (y / n) * mag : 0;
      out.mag = mag;
      out.up = held.has('up') || joy.y > 0.5;
      out.down = held.has('down') || joy.y < -0.5;
      out.left = held.has('left') || joy.x < -0.5;
      out.right = held.has('right') || joy.x > 0.5;
      out.run = held.has('run') || runToggle;
      return out;
    },
    /** Ditekan sejak endFrame() terakhir (sekali per tekan). */
    hit: (a) => pressed.has(a),
    consume: (a) => pressed.delete(a),
    /** Ditahan sekarang (mis. 'fire' untuk tembak beruntun). */
    down: (a) => held.has(a),
    endFrame: () => pressed.clear(),
    /** Lepas semua yang tertekan (menu terbuka, tab disembunyikan). */
    reset: clearAll,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const fn of cleanups.splice(0)) {
        try {
          fn();
        } catch {
          /* destroy tidak boleh melempar galat */
        }
      }
      try {
        root?.remove();
      } catch {
        /* sudah lepas */
      }
      clearAll();
      pressed.clear();
    },
  };
}
