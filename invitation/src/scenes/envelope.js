import { h } from '../engine/dom.js';
import { contrast } from '../engine/color.js';
import { envelopeSettings } from '../engine/config.js';
import { createParticles } from '../engine/particles.js';
import { createAudio } from '../engine/audio.js';
import { starPolygon } from '../engine/shapes.js';

const VARS = {
  bg1: '--bg1', bg2: '--bg2', paper: '--paper', letter: '--letter', ink: '--ink', accent: '--accent',
  accent2: '--accent2', glow: '--glow', stageInk: '--stage-ink', sealFill: '--seal-fill', sealInk: '--seal-ink',
};

/** Warna teks tombol: pilih yang paling terbaca di atas warna aksen. */
export function ctaInk(tk) {
  const candidates = [tk.bg1, tk.ink, '#000000', '#ffffff'];
  return candidates.reduce((best, c) => (contrast(c, tk.accent2) > contrast(best, tk.accent2) ? c : best), candidates[0]);
}

/**
 * Adegan 01 - Amplop pembuka. Varian 'amplop' (surat) atau 'kado' (kotak hadiah) dipilih oleh tema.
 * Urutan: closed -> breaking (segel pecah) -> flap (tutup terbuka) -> letter (surat naik)
 *         -> reading (kamera mendekat) -> done (tombol lanjut muncul).
 */
export function mountEnvelope(container, ctx) {
  const { view, env = {} } = ctx;
  const light = !!env.light;
  const reduced = !!env.reduced;
  const theme = view.theme;
  const cfg = theme.envelope;
  const s = envelopeSettings(view);
  const tk = s.tokens;

  const stage = h('div', {
    class: 'env-stage', 'data-state': 'closed', 'data-variant': cfg.variant,
    'data-pattern': cfg.pattern, 'data-seal': cfg.seal, 'data-light': light ? '1' : null,
  });
  for (const [k, v] of Object.entries(VARS)) stage.style.setProperty(v, tk[k]);
  stage.style.setProperty('--font-display', theme.fonts.display);
  stage.style.setProperty('--font-body', theme.fonts.body);
  stage.style.setProperty('--speed', String(s.speed));
  stage.style.setProperty('--cta-ink', ctaInk(tk));

  const canvas = h('canvas', { class: 'env-particles', 'aria-hidden': 'true' });
  const particles = createParticles(canvas, { kind: cfg.particles, colors: [tk.glow, tk.accent2, tk.accent, tk.letter], light, reduced });
  const audio = createAudio(theme.sfx);

  /* --- bagian visual --- */
  const sealBtn = h('button', { class: 'seal', type: 'button', 'aria-label': s.text.hint, text: s.sealText });
  if (cfg.seal === 'bintang8') sealBtn.style.clipPath = starPolygon(8, 0.66);
  const sealWrap = h('div', { class: 'seal-wrap' }, sealBtn);

  const letter = h('div', { class: 'letter' },
    h('div', { class: 'letter-inner' },
      h('p', { class: 'l-eyebrow', text: view.eventLabel }),
      h('h2', { class: 'l-title', text: view.title }),
      h('span', { class: 'l-rule' }),
      h('p', { class: 'l-lead', text: s.text.lead }),
      view.dateText ? h('p', { class: 'l-date', text: view.dateText }) : null,
    ));

  const shadow = h('div', { class: 'env-shadow' });
  const envelope = cfg.variant === 'kado'
    ? h('div', { class: 'envelope' },
        shadow, h('div', { class: 'env-back' }), letter,
        h('div', { class: 'gift-body' }, h('div', { class: 'gift-band' })),
        h('div', { class: 'gift-lid' }, h('div', { class: 'gift-band' })),
        sealWrap)
    : h('div', { class: 'envelope' },
        shadow, h('div', { class: 'env-back' }), letter,
        h('div', { class: 'env-front' }, h('div', { class: 'pk pk-l' }), h('div', { class: 'pk pk-r' }), h('div', { class: 'pk pk-b' })),
        h('div', { class: 'env-flap' }),
        sealWrap);

  const camera = h('div', { class: 'env-camera' }, envelope);
  const forLine = view.recipient
    ? h('p', { class: 'env-for' }, h('span', { text: s.text.toPrefix }), h('strong', { text: view.recipient }))
    : h('p', { class: 'env-for env-for-empty' });
  const tagline = h('p', { class: 'env-tagline', text: s.text.tagline });
  const hint = h('p', { class: 'env-hint', text: s.text.hint });
  const cta = h('button', { class: 'cta', type: 'button', text: s.text.openLabel });
  const skipBtn = h('button', { class: 'env-skip', type: 'button', text: s.text.skipLabel });
  const muteBtn = h('button', { class: 'env-mute', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Matikan suara', text: '♪' });

  stage.append(canvas, muteBtn, skipBtn, forLine, camera, tagline, hint, cta);
  container.append(stage);
  particles.start();

  /* --- alur animasi --- */
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms * s.speed));
  const setState = (st) => { stage.dataset.state = st; };
  let finished;
  const done = new Promise((r) => { finished = r; });

  let byKeyboard = false;
  function settle() {
    setState('done');
    if (byKeyboard) cta.focus({ preventScroll: true });
  }

  function open(instant) {
    if (stage.dataset.state !== 'closed') return;
    audio.unlock();
    audio.paper();
    if (instant || reduced) {
      stage.dataset.skip = '1';
      setState('reading');
      timers.push(setTimeout(settle, 60));
      return;
    }
    setState('breaking');
    later(() => { setState('flap'); if (cfg.variant === 'kado') particles.burst(70); }, 450);
    later(() => { setState('letter'); audio.chime(); if (cfg.variant !== 'kado') particles.burst(36); }, 1200);
    later(() => setState('reading'), 2150);
    later(settle, 3050);
  }

  function skip() {
    const st = stage.dataset.state;
    if (st === 'done') return;
    timers.forEach(clearTimeout);
    timers.length = 0;
    if (st === 'closed') audio.unlock();
    stage.dataset.skip = '1';
    setState('reading');
    timers.push(setTimeout(settle, 60));
  }

  sealBtn.addEventListener('click', (e) => { byKeyboard = e.detail === 0; open(false); });
  skipBtn.addEventListener('click', (e) => { byKeyboard = e.detail === 0; skip(); });
  cta.addEventListener('click', () => { if (stage.dataset.state === 'done') finished(); });
  muteBtn.addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    muteBtn.setAttribute('aria-pressed', String(audio.muted));
    muteBtn.setAttribute('aria-label', audio.muted ? 'Nyalakan suara' : 'Matikan suara');
    muteBtn.classList.toggle('is-off', audio.muted);
  });

  /* Amplop bisa dimiringkan sedikit dengan gerakan jari/kursor selama masih tertutup. */
  const tilt = (e) => {
    if (reduced || light || stage.dataset.state !== 'closed') return;
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    envelope.style.setProperty('--rx', `${(-y * 14).toFixed(1)}deg`);
    envelope.style.setProperty('--ry', `${(x * 18).toFixed(1)}deg`);
  };
  const untilt = () => { envelope.style.setProperty('--rx', '0deg'); envelope.style.setProperty('--ry', '0deg'); };
  stage.addEventListener('pointermove', tilt);
  stage.addEventListener('pointerleave', untilt);

  sealBtn.focus({ preventScroll: true });

  return {
    done,
    destroy() {
      timers.forEach(clearTimeout);
      timers.length = 0;
      particles.destroy();
      audio.close();
      container.replaceChildren();
    },
  };
}
