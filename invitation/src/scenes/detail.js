import { h } from '../engine/dom.js';
import { detailContent, icsFor } from '../engine/content.js';
import { createShell, heading, rv, skippedScene, text3d } from './shell.js';

/** Unduh satu acara sebagai berkas kalender (.ics). */
function saveToCalendar(ev, view, index) {
  const body = icsFor(ev, view, index);
  if (!body || typeof Blob === 'undefined' || !URL.createObjectURL) return;
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
  const a = h('a', { href: url, download: `${(view.slug || 'acara')}-${index + 1}.ics` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Adegan 05 - Detail acara. Satu kartu per rangkaian (akad, resepsi, dst.): tanggal, jam, tempat,
 * tombol peta dan simpan ke kalender, lalu busana dan catatan tambahan.
 */
export function mountDetail(container, ctx) {
  const { view } = ctx;
  const c = detailContent(view);
  if (!c.events.length) return skippedScene();
  const s = createShell(container, ctx, 'detail');
  let i = 3;

  const cards = c.events.map((ev, idx) => rv(h('article', { class: 'dt-card' },
    text3d('h3', { class: 'dt-label' }, ev.label),
    ev.dateText ? h('p', { class: 'dt-date', text: ev.dateText }) : null,
    ev.timeText ? h('p', { class: 'dt-time', text: ev.timeText }) : null,
    ev.venue ? h('p', { class: 'dt-venue', text: ev.venue }) : null,
    ev.address ? h('p', { class: 'dt-addr', text: ev.address }) : null,
    ev.note ? h('p', { class: 'dt-note', text: ev.note }) : null,
    h('div', { class: 'dt-actions' },
      ev.mapUrl ? h('a', { class: 'dt-btn', href: ev.mapUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Buka Peta' }) : null,
      ev.start ? h('button', { class: 'dt-btn', type: 'button', text: 'Simpan ke Kalender', onclick: () => saveToCalendar(ev, view, idx) }) : null),
  ), i++));

  const extras = (c.dressCode || c.notes.length) ? rv(h('div', { class: 'dt-extra' },
    c.dressCode ? h('p', {}, h('strong', { text: 'Busana: ' }), c.dressCode) : null,
    c.notes.map((n) => h('p', { class: 'dt-note', text: n }))), i++) : null;

  s.stage.append(h('div', { class: 'pg-scroll' }, heading(c.eyebrow, c.title), h('div', { class: 'dt-list' }, cards), extras));
  s.footer(c.cta);
  return s.api();
}
