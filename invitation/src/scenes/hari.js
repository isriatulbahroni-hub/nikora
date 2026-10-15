import { h } from '../engine/dom.js';
import { dayContent, countdownParts } from '../engine/content.js';
import { enterLabel } from '../engine/world-link.js';
import { createShell, heading, rv, skippedScene } from './shell.js';

const pad = (n) => String(n).padStart(2, '0');

/** Status ditentukan dari fase waktu sebenarnya, supaya "Segera dimulai" tidak muncul saat acara masih berhari-hari lagi. */
const STATUS = {
  before: 'Acara akan datang', soon: 'Segera dimulai', live: 'Sedang berlangsung',
  after: 'Baru saja selesai', past: 'Acara telah selesai',
};

/**
 * Adegan 10 - Hari acara. Hanya tampil dari 24 jam sebelum sampai 6 jam sesudah acara: status hidup
 * (segera / berlangsung / selesai), susunan acara dengan penanda "sekarang", tautan siaran langsung,
 * dan pintu masuk ke dunia 3D untuk bergabung bersama tamu lain.
 */
export function mountHariAcara(container, ctx) {
  const { view } = ctx;
  const c = dayContent(view);
  if (!c.show) return skippedScene();
  const s = createShell(container, ctx, 'hari_acara');

  const status = h('p', { class: 'hr-status', 'data-phase': c.phase, role: 'status' }, h('i', { class: 'hr-dot', 'aria-hidden': 'true' }), h('span', { text: STATUS[c.phase] || c.status || '' }));
  const count = h('p', { class: 'hr-count', role: 'timer', hidden: true });
  function tick() {
    const p = c.start && countdownParts(c.start);
    if (!p || c.phase === 'live' || c.phase === 'after') { count.hidden = true; return; }
    count.hidden = false;
    count.textContent = `Dimulai dalam ${p.days ? `${p.days} hari ` : ''}${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}`;
  }
  tick();
  if (c.start) s.every(tick, 1000);

  const list = c.rundown.length ? h('ol', { class: 'hr-run' }, c.rundown.map((r, i) => h('li', { class: i === c.current ? 'is-now' : (i < c.current ? 'is-done' : '') },
    h('time', { text: r.time || '' }), h('span', { text: r.title })))) : null;
  const stream = c.streamUrl ? h('a', { class: 'dt-btn hr-stream', href: c.streamUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Tonton siaran langsung' }) : null;

  s.stage.append(h('div', { class: 'pg-scroll' }, heading(c.eyebrow, c.title), rv(status, 3), rv(count, 4), list ? rv(list, 5) : null, stream ? rv(stream, 6) : null));
  const acts = [];
  if (view.worldUrl) acts.push({ href: view.worldUrl, label: enterLabel(view.eventType) });
  acts.push({ label: c.cta, onClick: s.finish });
  s.actions(acts);
  return s.api();
}
