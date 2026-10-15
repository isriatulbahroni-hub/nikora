import { h } from '../engine/dom.js';
import { shareLinks, whatsappUrl } from './api.js';
import { worldOfRow } from '../engine/world-link.js';
import { icon } from './icons.js';
import { titleOf } from './views.js';
import { csvOf, downloadText } from './format.js';

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Gabungkan daftar tamu dengan RSVP (dicocokkan lewat nama). RSVP tanpa tamu terdaftar tampil sebagai "umum". */
export function mergeGuests(guests, rsvps) {
  const byName = new Map();
  for (const r of rsvps) if (!byName.has(norm(r.name))) byName.set(norm(r.name), r);
  const used = new Set();
  const rows = guests.map((g) => {
    const r = byName.get(norm(g.name));
    if (r) used.add(r);
    return { name: g.name, category: g.category || '', status: r ? (r.attending ? 'hadir' : 'tidak') : 'belum', count: r && r.attending ? (r.guests || 1) : 0, meal: r ? r.meal || '' : '', wish: r ? r.wish || '' : '', registered: true };
  });
  for (const r of rsvps) if (!used.has(r)) rows.push({ name: r.name, category: '', status: r.attending ? 'hadir' : 'tidak', count: r.attending ? (r.guests || 1) : 0, meal: r.meal || '', wish: r.wish || '', registered: false });
  return rows;
}

export function summarize(rows) {
  const s = { total: rows.length, hadir: 0, orang: 0, tidak: 0, belum: 0 };
  for (const r of rows) { if (r.status === 'hadir') { s.hadir += 1; s.orang += r.count; } else if (r.status === 'tidak') s.tidak += 1; else s.belum += 1; }
  return s;
}

const STATUS = { hadir: 'Hadir', tidak: 'Berhalangan', belum: 'Belum membalas' };

/**
 * Tamu & RSVP: pantau semua tamu satu acara (hadir, berhalangan, belum membalas), cari/saring,
 * ekspor CSV, dan kirim pengingat WhatsApp berisi link pribadi tamu.
 */
export function guestsView({ client, items, slug, inviteBase, worldBase, onPick }) {
  const root = h('div', { class: 'st-page' });
  const msg = h('p', { class: 's-msg', role: 'status', 'aria-live': 'polite' });
  if (!items.length) { root.append(h('div', { class: 'st-empty' }, icon('users', { size: 36 }), h('h2', { text: 'Belum ada undangan' }), h('p', { text: 'Buat undangan dulu, lalu tamunya bisa dipantau di sini.' }), h('a', { class: 'st-btn st-btn-primary', href: '#/buat' }, 'Buat undangan'))); return root; }
  const cur = items.find((i) => i.slug === slug) || items[0];
  const links = shareLinks({ slug: cur.slug, inviteBase, worldBase, world: worldOfRow(cur) });
  let rows = [];
  let filter = 'semua';
  let query = '';

  const picker = h('select', { class: 's-input st-select', 'aria-label': 'Pilih undangan', onchange: (e) => onPick(e.target.value) },
    items.map((i) => h('option', { value: i.slug, text: titleOf(i) })));
  picker.value = cur.slug;
  const stats = h('div', { class: 'st-stats' });
  const chips = h('div', { class: 'st-chips', role: 'group', 'aria-label': 'Saring status' });
  const list = h('div', { class: 'st-guestlist' });
  const search = h('input', { class: 's-input', type: 'search', placeholder: 'Cari nama tamu...', 'aria-label': 'Cari nama tamu', oninput: (e) => { query = norm(e.target.value); paintList(); } });

  const text = (r) => `Assalamu'alaikum ${r.name}, berikut undangan ${titleOf(cur)}: ${links.forGuest(r.name)}`;
  function paintTop() {
    const s = summarize(rows);
    stats.replaceChildren(
      h('div', { class: 'st-stat' }, h('span', { class: 'st-stat-ic' }, icon('users', { size: 20 })), h('div', {}, h('strong', { text: String(s.total) }), h('span', { text: 'Total tamu' }))),
      h('div', { class: 'st-stat' }, h('span', { class: 'st-stat-ic' }, icon('check', { size: 20 })), h('div', {}, h('strong', { text: String(s.orang) }), h('span', { text: `Orang hadir (${s.hadir} konfirmasi)` }))),
      h('div', { class: 'st-stat' }, h('span', { class: 'st-stat-ic' }, icon('mail', { size: 20 })), h('div', {}, h('strong', { text: String(s.tidak) }), h('span', { text: 'Berhalangan' }))),
      h('div', { class: `st-stat${s.belum ? ' is-warn' : ''}` }, h('span', { class: 'st-stat-ic' }, icon('help', { size: 20 })), h('div', {}, h('strong', { text: String(s.belum) }), h('span', { text: 'Belum membalas' }))));
    chips.replaceChildren(...[['semua', 'Semua', s.total], ['hadir', 'Hadir', s.hadir], ['tidak', 'Berhalangan', s.tidak], ['belum', 'Belum membalas', s.belum]].map(([id, label, n]) =>
      h('button', { class: `st-chipbtn${filter === id ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(filter === id), onclick: () => { filter = id; paintTop(); paintList(); } }, `${label} `, h('b', { text: String(n) }))));
  }
  function paintList() {
    const shown = rows.filter((r) => (filter === 'semua' || r.status === filter) && (!query || norm(r.name).includes(query) || norm(r.wish).includes(query)));
    list.replaceChildren(...(shown.length ? shown.map((r) => h('article', { class: 'st-guest' },
      h('div', { class: 'st-guest-main' }, h('strong', { text: r.name }), h('p', {}, r.category ? h('span', { class: 'st-tag', text: r.category }) : null, r.registered ? null : h('span', { class: 'st-tag', text: 'Tautan umum' }),
        r.meal ? h('span', { class: 'st-tag', text: r.meal }) : null)),
      h('span', { class: `st-status is-${r.status}`, text: r.status === 'hadir' ? `Hadir (${r.count} orang)` : STATUS[r.status] }),
      r.wish ? h('p', { class: 'st-wish', text: `"${r.wish}"` }) : null,
      r.registered ? h('a', { class: 'st-btn st-btn-ghost st-btn-sm', href: whatsappUrl(text(r)), target: '_blank', rel: 'noopener noreferrer' }, h('span', { text: r.status === 'belum' ? 'Ingatkan' : 'Kirim ulang' })) : null))
      : [h('p', { class: 'st-sub', text: rows.length ? 'Tidak ada tamu yang cocok.' : 'Belum ada tamu. Tambahkan tamu di halaman Bagikan, atau bagikan link umum.' })]));
  }
  const exportCsv = () => downloadText(`tamu-${cur.slug}.csv`, csvOf([['Nama', 'Kategori', 'Status', 'Jumlah hadir', 'Menu', 'Ucapan', 'Link undangan'],
    ...rows.map((r) => [r.name, r.category, STATUS[r.status], r.count, r.meal, r.wish, r.registered ? links.forGuest(r.name) : ''])]));

  root.append(
    h('div', { class: 'st-pagehead' }, h('div', {}, h('h1', { text: 'Tamu & RSVP' }), h('p', { class: 'st-sub', text: 'Pantau siapa yang hadir, berhalangan, dan belum membalas.' })),
      h('div', { class: 'st-headacts' }, picker, h('a', { class: 'st-btn st-btn-ghost', href: `#/undangan/${cur.slug}` }, icon('qr', { size: 16 }), h('span', { text: 'Tambah tamu & QR' })), h('button', { class: 'st-btn st-btn-primary', type: 'button', onclick: exportCsv }, icon('save', { size: 16 }), h('span', { text: 'Ekspor CSV' })))),
    stats, h('section', { class: 'st-panel' }, h('div', { class: 'st-toolbar' }, search, chips), list), msg);

  (async () => {
    try { const [g, r] = await Promise.all([client.guestsOf(cur.slug), client.rsvpsOf(cur.slug)]); rows = mergeGuests(g || [], r || []); paintTop(); paintList(); } catch (e) { msg.textContent = e.message; }
  })();
  return root;
}
