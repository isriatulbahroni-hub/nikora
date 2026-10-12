import { h } from '../engine/dom.js';
import { createParticles } from '../engine/particles.js';
import { sceneTokens } from '../engine/content.js';
import { buildScenery } from '../engine/scenery.js';
import { ctaInk } from './envelope.js';
import { createAvatar } from '../engine/avatars.js';
import { text3d } from '../engine/text3d.js';

export { text3d };

const VARS = {
  bg1: '--bg1', bg2: '--bg2', paper: '--paper', letter: '--letter', ink: '--ink', accent: '--accent',
  accent2: '--accent2', glow: '--glow', stageInk: '--stage-ink', sealFill: '--seal-fill', sealInk: '--seal-ink',
};

/** Beri animasi muncul bertahap: elemen ke-i tampil i * 90ms setelah yang pertama. */
export function rv(el, i = 0) {
  el.classList.add('rv');
  el.style.setProperty('--i', String(i));
  return el;
}

/**
 * Kerangka adegan bergaya halaman: panggung bertema + partikel + (opsional) pemandangan berlapis.
 * Semua pendengar/penghitung waktu didaftarkan di sini dan dibersihkan sekali lewat destroy().
 */
export function createShell(container, ctx, kind, { scenery = null, sceneryId = null, hero = null, walkers = true } = {}) {
  const { view, env = {} } = ctx;
  const light = !!env.light;
  const reduced = !!env.reduced;
  const theme = view.theme;
  const tk = sceneTokens(view, kind);

  const stage = h('div', {
    class: 'pg-stage', 'data-scene': kind, 'data-pattern': theme.envelope.pattern,
    'data-variant': theme.envelope.variant, 'data-light': light ? '1' : null, 'data-reduced': reduced ? '1' : null,
  });
  for (const [k, v] of Object.entries(VARS)) stage.style.setProperty(v, tk[k]);
  stage.style.setProperty('--font-display', theme.fonts.display);
  stage.style.setProperty('--font-body', theme.fonts.body);
  stage.style.setProperty('--cta-ink', ctaInk(tk));

  const canvas = h('canvas', { class: 'env-particles', 'aria-hidden': 'true' });
  const particles = createParticles(canvas, { kind: theme.envelope.particles, colors: [tk.glow, tk.accent2, tk.accent, tk.letter], light, reduced });
  const bg = scenery ? buildScenery(scenery, sceneryId || 7, { hero: hero ? hero(tk) : null }) : null;
  if (bg) stage.append(bg);
  if (walkers && !bg && !light && !reduced) stage.append(buildWalkers(view, tk));
  stage.append(canvas);
  container.append(stage);
  particles.start();

  const cleanups = [];
  let finish;
  const done = new Promise((r) => { finish = r; });

  const shell = {
    stage, view, theme, tk, env, particles, done, finish,
    on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      cleanups.push(() => target.removeEventListener(type, fn, opts));
    },
    /** Jalankan fn berkala; mengembalikan fungsi untuk menghentikannya lebih awal. */
    every(fn, ms) {
      const id = setInterval(fn, ms);
      const stop = () => clearInterval(id);
      cleanups.push(stop);
      return stop;
    },
    after(fn, ms) {
      const id = setTimeout(fn, ms);
      cleanups.push(() => clearTimeout(id));
    },
    /** Tombol lanjut yang selalu terlihat di bawah layar. */
    footer(label, onClick = finish) {
      const btn = h('button', { class: 'pg-cta', type: 'button', text: label, onclick: () => onClick() });
      stage.append(h('div', { class: 'pg-foot' }, btn));
      return btn;
    },
    /** Beberapa aksi di bawah layar: tautan (href) atau tombol; yang pertama menjadi utama. */
    actions(list) {
      const foot = h('div', { class: 'pg-foot pg-foot-multi' }, list.map((a, i) => (a.href
        ? h('a', { class: `pg-cta${i ? ' pg-ghost' : ''}`, href: a.href, text: a.label })
        : h('button', { class: `pg-cta${i ? ' pg-ghost' : ''}`, type: 'button', text: a.label, onclick: () => a.onClick() }))));
      stage.append(foot);
      return foot;
    },
    api() {
      return {
        done,
        destroy() {
          cleanups.splice(0).forEach((fn) => fn());
          particles.destroy();
          container.replaceChildren();
        },
      };
    },
  };

  /* Kemiringan hidup: --px/--py (-1..1) dari jari/kursor, dan dari sensor gerak ponsel bila ada.
     Dipakai pemandangan (parallax), teks 3D (ketebalan bergeser), serta lembar dan kartu (miring). */
  if (!reduced && !light) bindTilt(shell);
  return shell;
}

/** Adegan tanpa isi: mesin melewatinya tanpa transisi. */
export const skippedScene = () => ({ skipped: true, done: Promise.resolve(), destroy() {} });

/** Kepala adegan seragam: label kecil + judul + garis hias. */
export function heading(eyebrow, title, i = 0) {
  return h('header', { class: 'pg-head' },
    eyebrow ? rv(h('p', { class: 'pg-eyebrow', text: eyebrow }), i) : null,
    rv(text3d('h2', { class: 'pg-title' }, title), i + 1),
    rv(h('span', { class: 'pg-rule' }), i + 2));
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function bindTilt(shell) {
  const { stage } = shell;
  let gyro = false;
  const set = (x, y) => {
    stage.style.setProperty('--px', clamp(x, -1, 1).toFixed(3));
    stage.style.setProperty('--py', clamp(y, -1, 1).toFixed(3));
  };
  shell.on(stage, 'pointermove', (e) => {
    if (gyro) return;
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    set(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2);
  });
  const onTilt = (e) => {
    if (e.gamma == null || e.beta == null) return;
    gyro = true;
    set(e.gamma / 22, (e.beta - 50) / 24);
  };
  const listen = () => shell.on(window, 'deviceorientation', onTilt);
  const DOE = typeof window !== 'undefined' ? window.DeviceOrientationEvent : null;
  if (DOE && typeof DOE.requestPermission === 'function') {
    // iOS: izin sensor hanya bisa diminta dari sentuhan pertama.
    shell.on(stage, 'pointerdown', () => DOE.requestPermission().then((r) => { if (r === 'granted') listen(); }).catch(() => {}), { once: true });
  } else if (DOE) listen();
}

/** Beberapa tamu kecil berjalan di dasar layar seperti penghuni dunia; satu membawa papan nama tamu. */
function buildWalkers(view, tk) {
  const wrap = h('div', { class: 'walkers', 'aria-hidden': 'true' });
  const roles = ['guest', 'child', 'guest', 'groom'];
  const name = view.recipient ? view.recipient.slice(0, 14) : null;
  roles.slice(0, 3).forEach((role, i) => {
    const av = createAvatar({ role, top: i % 2 ? tk.accent : tk.sealFill, accent: tk.accent2, seed: i * 3 + view.title.length, walking: true });
    wrap.append(h('div', { class: 'walker', style: { '--dur': `${26 + i * 9}s`, '--delay': `${-i * 11}s`, '--sz': `${1 - i * 0.14}` } },
      i === 0 && name ? h('span', { class: 'nametag', text: name }) : null, av));
  });
  return wrap;
}
