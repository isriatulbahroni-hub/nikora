import { h } from '../engine/dom.js';
import { createParticles } from '../engine/particles.js';
import { sceneTokens } from '../engine/content.js';
import { buildScenery } from '../engine/scenery.js';
import { ctaInk } from './envelope.js';

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
export function createShell(container, ctx, kind, { scenery = null, sceneryId = null } = {}) {
  const { view, env = {} } = ctx;
  const light = !!env.light;
  const reduced = !!env.reduced;
  const theme = view.theme;
  const tk = sceneTokens(view, kind);

  const stage = h('div', {
    class: 'pg-stage', 'data-scene': kind, 'data-pattern': theme.envelope.pattern,
    'data-variant': theme.envelope.variant, 'data-light': light ? '1' : null,
  });
  for (const [k, v] of Object.entries(VARS)) stage.style.setProperty(v, tk[k]);
  stage.style.setProperty('--font-display', theme.fonts.display);
  stage.style.setProperty('--font-body', theme.fonts.body);
  stage.style.setProperty('--cta-ink', ctaInk(tk));

  const canvas = h('canvas', { class: 'env-particles', 'aria-hidden': 'true' });
  const particles = createParticles(canvas, { kind: theme.envelope.particles, colors: [tk.glow, tk.accent2, tk.accent, tk.letter], light, reduced });
  const bg = scenery ? buildScenery(scenery, sceneryId || 7) : null;
  if (bg) stage.append(bg);
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

  /* Parallax: lapisan pemandangan bergeser mengikuti kursor/jari. */
  if (bg && !reduced && !light) {
    shell.on(stage, 'pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      stage.style.setProperty('--px', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
      stage.style.setProperty('--py', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
    });
  }
  return shell;
}

/** Adegan tanpa isi: mesin melewatinya tanpa transisi. */
export const skippedScene = () => ({ skipped: true, done: Promise.resolve(), destroy() {} });

/** Kepala adegan seragam: label kecil + judul + garis hias. */
export function heading(eyebrow, title, i = 0) {
  return h('header', { class: 'pg-head' },
    eyebrow ? rv(h('p', { class: 'pg-eyebrow', text: eyebrow }), i) : null,
    rv(h('h2', { class: 'pg-title', text: title }), i + 1),
    rv(h('span', { class: 'pg-rule' }), i + 2));
}
