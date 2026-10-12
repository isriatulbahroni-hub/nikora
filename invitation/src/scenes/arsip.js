import { h } from '../engine/dom.js';
import { archiveContent } from '../engine/content.js';
import { createShell, heading, rv, skippedScene } from './shell.js';

/**
 * Adegan 12 - Arsip kenangan. Setelah acara selesai: ucapan terima kasih, foto pilihan, dan ucapan
 * tamu. Tamu bisa kembali ke dunia 3D untuk mengunjungi kenangan.
 */
export function mountArsip(container, ctx) {
  const { view } = ctx;
  const c = archiveContent(view);
  if (!c.show) return skippedScene();
  const s = createShell(container, ctx, 'arsip');

  const photos = c.photos.length ? h('div', { class: 'ar-grid' }, c.photos.map((p, i) => h('img', {
    class: 'ar-photo', src: p.src, alt: p.alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', style: { '--r': `${((i % 3) - 1) * 3}deg` },
  }))) : null;
  const wishes = c.messages.length ? h('ul', { class: 'ar-wishes' }, c.messages.map((m) => h('li', {}, h('p', { text: m.text }), m.name ? h('strong', { text: m.name }) : null))) : null;

  s.stage.append(h('div', { class: 'pg-scroll' }, heading(c.eyebrow, c.title), rv(h('p', { class: 'pn-text', text: c.body }), 3), photos ? rv(photos, 4) : null, wishes ? rv(wishes, 5) : null));
  const acts = [];
  if (view.worldUrl) acts.push({ href: view.worldUrl, label: 'Kunjungi dunia kenangan' });
  acts.push({ label: c.cta, onClick: s.finish });
  s.actions(acts);
  return s.api();
}
