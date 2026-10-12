import { h } from '../engine/dom.js';
import { galleryContent } from '../engine/content.js';
import { createShell, heading, rv, skippedScene } from './shell.js';

/**
 * Adegan 06 - Galeri. Karusel 3D (coverflow): foto tengah menghadap kita, tetangganya miring ke
 * belakang. Geser, panah, atau papan ketik berpindah; ketuk foto tengah untuk memperbesar.
 */
export function mountGaleri(container, ctx) {
  const c = galleryContent(ctx.view);
  if (!c.images.length) return skippedScene();
  const s = createShell(container, ctx, 'galeri');
  const n = c.images.length;
  let at = 0;

  const items = c.images.map((img, idx) => {
    const face = img.src
      ? h('img', { src: img.src, alt: img.alt, loading: idx === 0 ? 'eager' : 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' })
      : h('div', { class: 'gl-ph', role: 'img', 'aria-label': img.alt, 'data-tone': String(idx % 4) });
    return h('button', { class: 'gl-item', type: 'button', 'aria-label': img.alt, onclick: () => (idx === at ? zoom(idx) : go(idx)) }, face);
  });
  const caption = h('p', { class: 'gl-caption', 'aria-live': 'polite' });
  const counter = h('p', { class: 'gl-count' });
  const flow = h('div', { class: 'gl-flow', tabindex: '0', 'aria-roledescription': 'karusel', 'aria-label': c.title }, items);

  function paint() {
    items.forEach((el, k) => {
      // jarak melingkar: foto terakhir menjadi tetangga kiri foto pertama
      let d = k - at;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      el.dataset.pos = String(Math.max(-3, Math.min(3, d)));
      el.tabIndex = d === 0 ? 0 : -1;
      el.setAttribute('aria-hidden', Math.abs(d) > 2 ? 'true' : 'false');
    });
    caption.textContent = c.images[at].caption || '';
    counter.textContent = `${at + 1} / ${n}`;
  }
  const go = (idx) => { at = (idx + n) % n; paint(); };

  /* geser dengan jari/kursor */
  let x0 = null;
  s.on(flow, 'pointerdown', (e) => { x0 = e.clientX; });
  s.on(flow, 'pointerup', (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1));
  });
  s.on(flow, 'pointercancel', () => { x0 = null; });
  s.on(flow, 'keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
  });

  /* perbesar */
  let box = null;
  function closeZoom() { if (box) { box.remove(); box = null; } }
  function zoom(idx) {
    const img = c.images[idx];
    const face = img.src ? h('img', { src: img.src, alt: img.alt, referrerpolicy: 'no-referrer' }) : h('div', { class: 'gl-ph gl-ph-big', 'data-tone': String(idx % 4), role: 'img', 'aria-label': img.alt });
    box = h('div', { class: 'gl-zoom', role: 'dialog', 'aria-modal': 'true', 'aria-label': img.alt, onclick: closeZoom },
      face, img.caption ? h('p', { text: img.caption }) : null,
      h('button', { class: 'gl-close', type: 'button', 'aria-label': 'Tutup', text: '×', onclick: closeZoom }));
    s.stage.append(box);
    box.querySelector('.gl-close').focus({ preventScroll: true });
  }
  s.on(document, 'keydown', (e) => { if (e.key === 'Escape') closeZoom(); });

  const prev = h('button', { class: 'ks-nav', type: 'button', 'aria-label': 'Foto sebelumnya', text: '‹', onclick: () => go(at - 1) });
  const next = h('button', { class: 'ks-nav', type: 'button', 'aria-label': 'Foto berikutnya', text: '›', onclick: () => go(at + 1) });
  s.stage.append(h('div', { class: 'gl-body' },
    heading(c.eyebrow, c.title), rv(flow, 3), rv(caption, 4),
    rv(h('div', { class: 'ks-ctrl' }, prev, counter, next), 5)));
  paint();
  s.footer(c.cta);
  const api = s.api();
  const destroy = api.destroy;
  api.destroy = () => { closeZoom(); destroy(); };
  return api;
}
