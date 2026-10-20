import { h } from '../engine/dom.js';
import { whatsappUrl } from './api.js';
import { STATUS_LABEL, formatCode } from './checkin-api.js';

const field = (label, node) => h('label', { class: 's-field' }, h('span', { text: label }), node);
const input = (props) => h('input', { class: 's-input', ...props });
export const fmtDate = (v) => { try { return new Date(v).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };

/** Teks kartu yang disalin atau dikirim lewat WhatsApp. */
export function cardText({ title, guestName, code, roomLabel, expiresAt }) {
  return [
    `Kartu check-in${title ? ` - ${title}` : ''}`,
    `Tamu: ${guestName}`,
    `Kode: ${formatCode(code)}`,
    roomLabel ? `Kamar: ${roomLabel}` : null,
    `Berlaku sampai: ${fmtDate(expiresAt)}`,
  ].filter(Boolean).join('\n');
}

const cardState = (c, t) => (c.revoked_at ? 'Dicabut admin' : Date.parse(c.expires_at) <= t ? 'Kedaluwarsa' : 'Aktif');

/**
 * Halaman pemilik acara: ajukan check-in tamu ke admin, pantau statusnya, dan ambil kode kartu yang sudah disetujui.
 * Hanya admin yang menerbitkan kartu; di sini pemilik hanya mengajukan dan membatalkan pengajuannya sendiri.
 */
export function checkinView({ api, slug, title = '', now = () => Date.now() }) {
  const root = h('div', { class: 's-card' });
  const msg = h('p', { class: 's-msg', role: 'status', 'aria-live': 'polite' });
  const listBox = h('div', {});
  const run = async (fn) => { try { await fn(); } catch (err) { msg.textContent = err.message; } };
  const copy = async (text, btn) => {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Tersalin'; } catch { msg.textContent = 'Salin manual dari kotak kartu.'; }
  };

  const name = input({ name: 'guestName', maxlength: '80', required: true, placeholder: 'Nama tamu atau rombongan', 'aria-label': 'Nama tamu atau rombongan' });
  const size = input({ name: 'partySize', type: 'number', min: '1', max: '50', inputmode: 'numeric', 'aria-label': 'Jumlah orang' });
  size.value = '1';
  const note = input({ name: 'note', maxlength: '300', placeholder: 'Catatan untuk admin (opsional)', 'aria-label': 'Catatan untuk admin' });
  const submit = h('button', { class: 's-btn', type: 'submit', text: 'Ajukan check-in' });
  const form = h('form', { class: 's-group', novalidate: true },
    h('h2', { text: 'Ajukan check-in tamu' }),
    h('p', { class: 's-sub', text: 'Kartu check-in hanya diterbitkan admin. Ajukan di sini; setelah disetujui, kodenya muncul di bawah dan bisa kamu kirim ke tamu.' }),
    field('Nama tamu atau rombongan', name), field('Jumlah orang', size), field('Catatan', note), submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    msg.textContent = 'Mengirim pengajuan...';
    try {
      await api.request(slug, { guestName: name.value, partySize: size.value, note: note.value });
      name.value = '';
      size.value = '1';
      note.value = '';
      msg.textContent = 'Pengajuan terkirim. Menunggu admin.';
      await refresh();
    } catch (err) {
      msg.textContent = err.message;
    }
    submit.disabled = false;
  });

  function row(r, card) {
    const t = now();
    const extra = [];
    if (r.status === 'menunggu') {
      extra.push(h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Batalkan', onclick: () => run(async () => { msg.textContent = ''; await api.cancel(r.id); await refresh(); }) }));
    }
    if (r.status === 'ditolak' && r.decision_note) extra.push(h('p', { class: 's-sub', text: `Alasan: ${r.decision_note}` }));
    if (r.status === 'disetujui' && card) {
      const state = cardState(card, t);
      if (state !== 'Aktif') {
        extra.push(h('p', { class: 's-sub', text: `Status kartu: ${state}` })); // kode tidak ditampilkan lagi bila sudah tidak berlaku
      } else {
        const text = cardText({ title, guestName: card.guest_name, code: card.code, roomLabel: card.room_label, expiresAt: card.expires_at });
        extra.push(h('div', { class: 's-group' },
          h('code', { text }),
          h('p', { class: 's-sub', text: 'Status kartu: Aktif' }),
          h('div', { class: 's-row' },
            h('button', { class: 's-btn s-small', type: 'button', text: 'Salin', onclick: (e) => copy(text, e.currentTarget) }),
            h('a', { class: 's-btn s-small', href: whatsappUrl(text), target: '_blank', rel: 'noopener noreferrer', text: 'WhatsApp' }))));
      }
    }
    return h('li', {},
      h('span', { class: 's-itembody' }, h('strong', { text: `${r.guest_name} (${r.party_size} orang)` }), h('span', { text: `${STATUS_LABEL[r.status] || r.status} - diajukan ${fmtDate(r.created_at)}` })),
      ...extra);
  }

  async function refresh() {
    const [requests, cards] = await Promise.all([api.requestsOf(slug), api.cardsOf(slug)]);
    const list = requests || [];
    const byRequest = new Map((cards || []).map((c) => [c.request_id, c]));
    listBox.replaceChildren(
      h('h2', { text: `Pengajuan (${list.length})` }),
      list.length ? h('ul', { class: 's-list' }, list.map((r) => row(r, byRequest.get(r.id)))) : h('p', { class: 's-sub', text: 'Belum ada pengajuan.' }));
  }

  root.append(h('h1', { text: 'Check-in tamu' }), title ? h('p', { class: 's-sub', text: title }) : null, form, msg, listBox);
  run(refresh);
  return root;
}
