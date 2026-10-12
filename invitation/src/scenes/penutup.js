import { h } from '../engine/dom.js';
import { closingContent } from '../engine/content.js';
import { starPolygon } from '../engine/shapes.js';
import { createShell, rv, text3d } from './shell.js';

/**
 * Adegan 11 - Penutup. Ucapan terima kasih dan doa dari tuan rumah, ditutup dengan ledakan partikel
 * tema. Tombol "Selesai" membawa tamu ke kartu akhir (masuk ke dunia / ulangi).
 */
export function mountPenutup(container, ctx) {
  const s = createShell(container, ctx, 'penutup');
  const c = closingContent(ctx.view);
  let i = 0;
  s.stage.append(h('div', { class: 'pn-body' },
    rv(h('span', { class: 'pn-mark', 'aria-hidden': 'true' }, h('i', { style: { 'clip-path': starPolygon(8, 0.62) } })), i++),
    c.eyebrow ? rv(h('p', { class: 'pg-eyebrow', text: c.eyebrow }), i++) : null,
    rv(text3d('h2', { class: 'pg-title pn-title' }, c.title), i++),
    rv(h('span', { class: 'pg-rule' }), i++),
    rv(h('p', { class: 'pn-text', text: c.body }), i++),
    c.sign ? rv(h('p', { class: 'pn-sign', text: c.sign }), i++) : null,
    rv(text3d('p', { class: 'pn-name' }, c.signature), i++),
    c.hosts ? rv(h('p', { class: 'pn-hosts', text: c.hosts }), i++) : null));
  s.after(() => s.particles.burst(46), 500);
  s.footer(c.cta).focus({ preventScroll: true });
  return s.api();
}
