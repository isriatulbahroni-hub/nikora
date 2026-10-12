import { h } from '../engine/dom.js';
import { suratContent } from '../engine/content.js';
import { createShell, rv } from './shell.js';

/**
 * Adegan 02 - Surat. Lembar surat tertulis tangan: salam, sapaan untuk tamu, isi, lalu tanda tangan
 * tuan rumah. Barisnya muncul satu per satu seperti ditulis.
 */
export function mountSurat(container, ctx) {
  const s = createShell(container, ctx, 'surat');
  const c = suratContent(ctx.view);
  let i = 0;
  const sheet = h('article', { class: 'sheet' },
    h('div', { class: 'sheet-inner' },
      c.eyebrow ? rv(h('p', { class: 'pg-eyebrow', text: c.eyebrow }), i++) : null,
      c.greeting ? rv(h('p', { class: 'sheet-greet', text: c.greeting }), i++) : null,
      c.recipient ? rv(h('p', { class: 'sheet-to' }, h('span', { text: c.toPrefix }), h('strong', { text: c.recipient })), i++) : null,
      rv(h('span', { class: 'pg-rule' }), i++),
      ...c.paragraphs.map((p) => rv(h('p', { class: 'sheet-p', text: p }), i++)),
      c.hosts ? rv(h('p', { class: 'sheet-hosts', text: c.hosts }), i++) : null,
      c.close ? rv(h('p', { class: 'sheet-close', text: c.close }), i++) : null,
      rv(h('p', { class: 'sheet-sign', text: c.signature }), i++),
    ));
  s.stage.append(h('div', { class: 'pg-scroll' }, sheet));
  s.footer(c.cta).focus({ preventScroll: true });
  return s.api();
}
