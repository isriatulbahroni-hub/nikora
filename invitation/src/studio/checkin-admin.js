import { h } from '../engine/dom.js';
import { formatCode } from './checkin-api.js';
import { cardText, fmtDate } from './checkin.js';

const field = (label, node) => h('label', { class: 's-field' }, h('span', { text: label }), node);
const input = (props) => h('input', { class: 's-input', ...props });

/** Judul undangan untuk antrean: dua nama hanya untuk pernikahan. */
const titleOfInv = (inv, slug) => {
  const i = Array.isArray(inv) ? inv[0] : inv;
  if (!i) return slug;
  return [i.groom, i.event_type === 'pernikahan' ? i.bride : ''].filter(Boolean).join(' & ') || slug;
};

/**
 * Antrean check-in untuk admin: setujui (menerbitkan kartu), tolak, dan cabut kartu aktif.
 * Izin ditegakkan database (fungsi security definer yang memeriksa staf); tampilan ini hanya dipakai staf.
 */
export function queueView({ api }) {
  const root = h('div', { class: 's-card' });
  const msg = h('p', { class: 's-msg', role: 'status', 'aria-live': 'polite' });
  const result = h('div', { class: 's-group', hidden: true });
  const queueBox = h('div', {});
  const cardsBox = h('div', {});
  const run = async (fn) => { try { await fn(); } catch (err) { msg.textContent = err.message; } };
  const copy = async (text, btn) => {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Tersalin'; } catch { msg.textContent = 'Salin manual dari kotak kartu.'; }
  };

  function showCard(text) {
    result.hidden = false;
    result.replaceChildren(
      h('p', { class: 's-sub', text: 'Kartu diterbitkan. Kirim ke pemilik acara atau tamunya lewat jalur pribadi. Pemilik acara juga melihatnya di halaman Check-in.' }),
      h('code', { text }),
      h('button', { class: 's-btn s-small', type: 'button', text: 'Salin', onclick: (e) => copy(text, e.currentTarget) }));
  }

  function pendingRow(r) {
    const title = titleOfInv(r.invitations, r.slug);
    const room = input({ name: 'room', maxlength: '40', placeholder: 'mis. Kamar 3', 'aria-label': `Kamar untuk ${r.guest_name}` });
    return h('li', {},
      h('span', { class: 's-itembody' },
        h('strong', { text: `${r.guest_name} (${r.party_size} orang)` }),
        h('span', { text: `${title} - diajukan ${fmtDate(r.created_at)}${r.note ? ` - Catatan: ${r.note}` : ''}` })),
      field('Kamar (opsional)', room),
      h('div', { class: 's-row' },
        h('button', { class: 's-btn s-small', type: 'button', text: 'Setujui', onclick: () => run(async () => {
          msg.textContent = '';
          const issued = await api.approve(r.id, { roomLabel: room.value });
          showCard(cardText({ title, guestName: r.guest_name, code: issued.code, roomLabel: room.value.trim().slice(0, 40), expiresAt: issued.expiresAt }));
          await refresh();
        }) }),
        h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Tolak', onclick: () => run(async () => {
          const reason = window.prompt('Alasan menolak (opsional, dilihat pemilik acara):', '');
          if (reason === null) return;
          msg.textContent = '';
          await api.reject(r.id, reason);
          await refresh();
        }) })));
  }

  function cardRow(c) {
    return h('li', { class: 's-guest' },
      h('span', { class: 's-itembody' },
        h('strong', { text: `${c.guest_name}${c.room_label ? ` - ${c.room_label}` : ''}` }),
        h('span', { text: `${c.slug} - ${formatCode(c.code)} - berlaku sampai ${fmtDate(c.expires_at)}` })),
      h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Cabut', onclick: () => run(async () => {
        if (!window.confirm(`Cabut kartu ${c.guest_name}? Kode ini langsung tidak berlaku.`)) return;
        msg.textContent = '';
        await api.revoke(c.id);
        await refresh();
      }) }));
  }

  async function refresh() {
    const [queue, cards] = await Promise.all([api.queue(), api.activeCards()]);
    const q = queue || [];
    const c = cards || [];
    queueBox.replaceChildren(
      h('h2', { text: `Menunggu persetujuan (${q.length})` }),
      q.length ? h('ul', { class: 's-list' }, q.map(pendingRow)) : h('p', { class: 's-sub', text: 'Tidak ada pengajuan yang menunggu.' }));
    cardsBox.replaceChildren(
      h('h2', { text: `Kartu aktif (${c.length})` }),
      c.length ? h('ul', { class: 's-list' }, c.map(cardRow)) : h('p', { class: 's-sub', text: 'Belum ada kartu aktif.' }));
  }

  root.append(
    h('h1', { text: 'Antrean check-in' }),
    h('p', { class: 's-sub', text: 'Pemilik acara mengajukan di sini. Setujui untuk menerbitkan kartu check-in, atau tolak dengan alasan.' }),
    result, msg, queueBox, cardsBox);
  run(refresh);
  return root;
}
