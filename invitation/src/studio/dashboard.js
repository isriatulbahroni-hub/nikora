import { h } from '../engine/dom.js';
import { EVENT_LABELS, getTheme } from '../themes/index.js';
import { icon } from './icons.js';
import { countdownInfo, fmtDay } from './format.js';
import { titleOf } from './views.js';

const typeLabel = (t) => (EVENT_LABELS[t] ? EVENT_LABELS[t].replace('Undangan ', '') : t);
const FILL_TARGET = 3;

/** Miniatur amplop dari warna tema, supaya terlihat amplop mana yang dipakai. */
export function miniEnvelope(theme, { size = 'md' } = {}) {
  const t = theme.tokens;
  return h('div', { class: `st-env st-env-${size}`, 'data-variant': theme.envelope.variant, role: 'img', 'aria-label': `Amplop tema ${theme.label}`,
    style: { '--e1': t.bg1, '--e2': t.bg2, '--ep': t.paper, '--el': t.letter, '--ea': t.accent, '--ea2': t.accent2, '--es': t.sealFill, '--ei': t.sealInk } },
  h('i', { class: 'st-env-paper' }), h('i', { class: 'st-env-flap' }), h('i', { class: 'st-env-seal', 'data-seal': theme.envelope.seal }));
}

function statCard(iconName, value, label, tone = '') {
  return h('div', { class: `st-stat ${tone}` }, h('span', { class: 'st-stat-ic' }, icon(iconName, { size: 20 })),
    h('div', {}, h('strong', { text: String(value) }), h('span', { text: label })));
}

/** Kelengkapan: tema dipilih, isi >= 3 adegan, ada tamu, tampilan sendiri (opsional). */
export function completion(item, st) {
  const steps = [
    { id: 'tema', label: 'Tema', done: !!item.theme },
    { id: 'isi', label: `Isi ${Math.min(st.filled, 8)}/8`, done: st.filled >= FILL_TARGET },
    { id: 'tamu', label: st.guests ? `${st.guests} tamu` : 'Tamu', done: st.guests > 0 },
    { id: 'tampilan', label: 'Tampilan', done: !!(item.extra && item.extra.style) },
  ];
  return { steps, pct: Math.round((steps.filter((s) => s.done).length / steps.length) * 100) };
}

/**
 * Dasbor pelanggan: ringkasan semua acara + kartu per undangan dengan status, hitung mundur, tamu, RSVP,
 * kelengkapan, dan jalan pintas ke Editor / Template / Tamu / Kelola. Mode "Pilih" untuk menghapus banyak.
 */
export function dashboardView({ items, stats, onNew, onDelete, hrefs }) {
  const root = h('div', { class: 'st-page' });
  const msg = h('p', { class: 's-msg', role: 'status', 'aria-live': 'polite' });
  const chosen = new Set();
  let selecting = false;
  let list = items.slice();
  const st = (slug) => stats[slug] || { guests: 0, replied: 0, attending: 0, filled: 0 };

  function card(i) {
    const s = st(i.slug);
    const theme = getTheme(i.theme) || getTheme('pernikahan-minimalis');
    const when = countdownInfo(i.event_date);
    const c = completion(i, s);
    const head = h('div', { class: 'st-card-head' }, miniEnvelope(theme),
      h('div', { class: 'st-card-title' }, h('h3', { text: titleOf(i) }),
        h('p', {}, h('span', { class: 'st-tag', text: typeLabel(i.event_type) }), h('span', { class: `st-when is-${when.tone}`, text: when.label }))));
    const body = h('div', { class: 'st-card-body' },
      h('p', { class: 'st-meta' }, icon('calendar', { size: 15 }), h('span', { text: fmtDay(i.event_date) || 'Tanggal belum diisi' })),
      h('p', { class: 'st-meta' }, icon('layout', { size: 15 }), h('span', { text: `Amplop: ${theme.label}` })),
      h('div', { class: 'st-nums' },
        h('div', {}, h('strong', { text: String(s.guests) }), h('span', { text: 'Tamu' })),
        h('div', {}, h('strong', { text: String(s.attending) }), h('span', { text: 'Hadir' })),
        h('div', {}, h('strong', { text: String(Math.max(0, s.guests - s.replied)) }), h('span', { text: 'Belum balas' }))),
      h('div', { class: 'st-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(c.pct), 'aria-label': 'Kelengkapan undangan' }, h('i', { style: { width: `${c.pct}%` } })),
      h('ul', { class: 'st-steps' }, c.steps.map((x) => h('li', { class: x.done ? 'is-done' : '' }, x.done ? icon('check', { size: 12 }) : null, h('span', { text: x.label })))));
    const actions = h('div', { class: 'st-card-actions' },
      h('a', { class: 'st-btn st-btn-primary', href: hrefs.editor(i.slug) }, icon('pencil', { size: 15 }), h('span', { text: 'Edit isi' })),
      h('a', { class: 'st-btn st-btn-ghost', href: hrefs.template(i.slug) }, icon('layout', { size: 15 }), h('span', { text: 'Template' })),
      h('a', { class: 'st-btn st-btn-ghost', href: hrefs.tamu(i.slug) }, icon('users', { size: 15 }), h('span', { text: 'Tamu' })),
      h('a', { class: 'st-btn st-btn-ghost', href: hrefs.detail(i.slug) }, icon('qr', { size: 15 }), h('span', { text: 'Bagikan' })));
    if (!selecting) return h('article', { class: 'st-card' }, head, body, actions);
    const cb = h('input', { type: 'checkbox', 'aria-label': `Pilih ${titleOf(i)}` });
    cb.checked = chosen.has(i.slug);
    cb.addEventListener('change', () => { cb.checked ? chosen.add(i.slug) : chosen.delete(i.slug); paintBar(); });
    return h('label', { class: 'st-card st-card-pick' }, cb, head, body);
  }

  function paint() {
    const tot = list.reduce((a, i) => { const s = st(i.slug); a.g += s.guests; a.h += s.attending; a.p += Math.max(0, s.guests - s.replied); return a; }, { g: 0, h: 0, p: 0 });
    const upcoming = list.filter((i) => countdownInfo(i.event_date).tone !== 'past').length;
    const bar = h('div', { class: 'st-delbar', hidden: true });
    root._bar = bar;
    root.replaceChildren(...[
      h('div', { class: 'st-pagehead' },
        h('div', {}, h('h1', { text: 'Dashboard' }), h('p', { class: 'st-sub', text: 'Pantau semua acara, tamu, dan konfirmasi hadir di satu tempat.' })),
        h('div', { class: 'st-headacts' },
          list.length ? h('button', { class: 'st-btn st-btn-ghost', type: 'button', text: selecting ? 'Selesai memilih' : 'Pilih', onclick: () => { selecting = !selecting; chosen.clear(); paint(); } }) : null,
          selecting ? null : h('a', { class: 'st-btn st-btn-primary', href: '#/buat' }, icon('plus', { size: 16 }), h('span', { text: 'Buat undangan' })))),
      h('div', { class: 'st-stats' },
        statCard('mail', list.length, 'Undangan'), statCard('calendar', upcoming, 'Akan datang'),
        statCard('users', tot.g, 'Total tamu'), statCard('check', tot.h, 'Orang hadir'), statCard('help', tot.p, 'Belum membalas', tot.p ? 'is-warn' : '')),
      bar, msg,
      list.length ? h('div', { class: 'st-cards' }, list.map(card))
        : h('div', { class: 'st-empty' }, icon('mail', { size: 36 }), h('h2', { text: 'Belum ada undangan' }), h('p', { text: 'Buat undangan pertamamu: pilih jenis acara, tema amplop, lalu isi ceritanya.' }),
          h('a', { class: 'st-btn st-btn-primary', href: '#/buat' }, icon('plus', { size: 16 }), h('span', { text: 'Buat undangan' }))),
    ].filter(Boolean));
    paintBar();
  }

  function paintBar() {
    const bar = root._bar;
    if (!bar) return;
    bar.hidden = !selecting;
    if (!selecting) { bar.replaceChildren(); return; }
    const n = chosen.size;
    const word = h('input', { class: 's-input', type: 'text', placeholder: 'Ketik HAPUS untuk konfirmasi', autocomplete: 'off', 'aria-label': 'Ketik HAPUS' });
    const go = h('button', { class: 'st-btn st-btn-danger', type: 'button', text: `Hapus ${n || ''} terpilih`, disabled: true });
    word.addEventListener('input', () => { go.disabled = !(n > 0 && word.value.trim() === 'HAPUS'); });
    go.addEventListener('click', async () => {
      go.disabled = true; msg.textContent = 'Menghapus...';
      try {
        const count = await onDelete([...chosen]);
        list = list.filter((i) => !chosen.has(i.slug)); chosen.clear(); selecting = false; paint();
        msg.textContent = `${count} undangan dihapus.`;
      } catch (e) { msg.textContent = e.message; go.disabled = false; }
    });
    bar.replaceChildren(h('p', { class: 'st-sub', text: n ? `${n} undangan dipilih. Tamu, RSVP, dan isi adegannya ikut terhapus dan tidak bisa dikembalikan.` : 'Centang undangan yang ingin dihapus.' }), ...(n ? [word, go] : []));
  }

  paint();
  return root;
}
