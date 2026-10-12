import { h } from '../engine/dom.js';
import { storyContent } from '../engine/content.js';
import { createShell, heading, rv, skippedScene } from './shell.js';

/**
 * Adegan 04 - Kisah. Kartu cerita yang digeser mendatar (snap), dengan penanda titik dan tombol
 * sebelumnya/berikutnya. Tanpa isi dari editor, adegan ini dilewati.
 */
export function mountKisah(container, ctx) {
  const c = storyContent(ctx.view);
  if (!c.items.length) return skippedScene();
  const s = createShell(container, ctx, 'kisah');
  const reduced = !!s.env.reduced;
  let at = 0;

  const cards = c.items.map((it, idx) => h('li', { class: 'ks-card' },
    h('div', { class: 'ks-inner', 'data-n': String(idx + 1) },
      it.when ? h('span', { class: 'ks-when', text: it.when }) : null,
      it.title ? h('h3', { class: 'ks-title', text: it.title }) : null,
      it.text ? h('p', { class: 'ks-text', text: it.text }) : null)));
  const track = h('ol', { class: 'ks-track', tabindex: '0', 'aria-label': c.title }, cards);
  const dots = c.items.map((_, idx) => h('button', { class: 'ks-dot', type: 'button', 'aria-label': `Kisah ${idx + 1}`, onclick: () => go(idx) }));
  const prev = h('button', { class: 'ks-nav', type: 'button', 'aria-label': 'Sebelumnya', text: '‹', onclick: () => go(at - 1) });
  const next = h('button', { class: 'ks-nav', type: 'button', 'aria-label': 'Berikutnya', text: '›', onclick: () => go(at + 1) });

  function mark(idx) {
    at = Math.max(0, Math.min(cards.length - 1, idx));
    cards.forEach((el, k) => el.classList.toggle('is-on', k === at));
    dots.forEach((d, k) => d.setAttribute('aria-current', String(k === at)));
    prev.disabled = at === 0;
    next.disabled = at === cards.length - 1;
  }
  function go(idx) {
    mark(idx);
    const el = cards[at];
    if (el.scrollIntoView) el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }
  s.on(track, 'scroll', () => {
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0, gap = Infinity;
    cards.forEach((el, k) => { const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid); if (d < gap) { gap = d; best = k; } });
    if (best !== at) mark(best);
  }, { passive: true });
  s.on(track, 'keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
  });

  s.stage.append(h('div', { class: 'ks-body' },
    heading(c.eyebrow, c.title),
    rv(track, 3),
    rv(h('div', { class: 'ks-ctrl' }, prev, h('div', { class: 'ks-dots' }, dots), next), 4)));
  mark(0);
  s.footer(c.cta);
  return s.api();
}
