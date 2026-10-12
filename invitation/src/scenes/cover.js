import { h } from '../engine/dom.js';
import { coverContent, countdownParts } from '../engine/content.js';
import { createShell, rv } from './shell.js';

/** Pemandangan latar diambil dari tema (theme.scenery); bawaan: bukit. */
export const sceneryOf = (theme) => theme.scenery || 'bukit';

const pad = (n) => String(n).padStart(2, '0');

/**
 * Adegan 03 - Cover. Poster pembuka: nama besar di depan pemandangan tiga lapis (parallax),
 * tanggal, dan hitung mundur hidup menuju hari acara.
 */
export function mountCover(container, ctx) {
  const { view } = ctx;
  const s = createShell(container, ctx, 'cover', { scenery: sceneryOf(view.theme), sceneryId: view.title.length * 7 + 3 });
  const c = coverContent(view);

  const names = h('h1', { class: 'cv-names' },
    c.names.flatMap((n, idx) => (idx === 0 ? [h('span', { class: 'cv-name', text: n })] : [h('span', { class: 'cv-amp', text: '&' }), h('span', { class: 'cv-name', text: n })])));

  const cells = ['Hari', 'Jam', 'Menit', 'Detik'].map((label) => ({ label, num: h('b', { text: '00' }) }));
  const count = h('div', { class: 'cv-count', role: 'timer', 'aria-label': 'Hitung mundur menuju acara' },
    cells.map((cell) => h('div', { class: 'cv-cell' }, cell.num, h('span', { text: cell.label }))));
  let stop = () => {};
  function tick() {
    const p = c.target && countdownParts(c.target);
    if (!p) { count.hidden = true; stop(); return; }
    count.hidden = false;
    [p.days, p.hours, p.minutes, p.seconds].forEach((v, idx) => { cells[idx].num.textContent = pad(v); });
  }
  count.hidden = true;
  if (c.target) { tick(); if (!count.hidden) stop = s.every(tick, 1000); }

  let i = 0;
  s.stage.append(h('div', { class: 'cv-body' },
    c.eyebrow ? rv(h('p', { class: 'pg-eyebrow cv-eyebrow', text: c.eyebrow }), i++) : null,
    rv(names, i++),
    c.tagline ? rv(h('p', { class: 'cv-tagline', text: c.tagline }), i++) : null,
    c.dateText ? rv(h('p', { class: 'cv-date', text: c.dateText }), i++) : null,
    rv(count, i++),
  ));
  s.footer(c.cta).focus({ preventScroll: true });
  return s.api();
}
