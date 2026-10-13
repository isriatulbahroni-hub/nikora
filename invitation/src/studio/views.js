import { h } from '../engine/dom.js';
import { EVENT_TYPES, EVENT_LABELS, THEMES } from '../themes/index.js';
import { WORLDS } from '../engine/world-link.js';
import { slugify, validateInvitation, shareLinks, whatsappUrl } from './api.js';

const field = (label, input, error) => h('label', { class: 's-field' }, h('span', { text: label }), input, h('small', { class: 's-err', role: 'alert', text: error || '' }));
const input = (props) => h('input', { class: 's-input', ...props });

/** Halaman masuk / daftar. */
export function loginView({ client, onDone }) {
  let mode = 'masuk';
  const email = input({ type: 'email', name: 'email', autocomplete: 'email', required: true, 'aria-label': 'Email' });
  const pass = input({ type: 'password', name: 'password', minlength: '6', autocomplete: 'current-password', required: true, 'aria-label': 'Kata sandi' });
  const msg = h('p', { class: 's-msg', role: 'status', 'aria-live': 'polite' });
  const submit = h('button', { class: 's-btn', type: 'submit', text: 'Masuk' });
  const toggle = h('button', { class: 's-link', type: 'button', text: 'Belum punya akun? Daftar' });
  toggle.addEventListener('click', () => {
    mode = mode === 'masuk' ? 'daftar' : 'masuk';
    submit.textContent = mode === 'masuk' ? 'Masuk' : 'Daftar';
    toggle.textContent = mode === 'masuk' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk';
    pass.setAttribute('autocomplete', mode === 'masuk' ? 'current-password' : 'new-password');
    msg.textContent = '';
  });
  const form = h('form', { class: 's-card', novalidate: true },
    h('h1', { text: 'Studio Undangan' }),
    h('p', { class: 's-sub', text: 'Masuk untuk membuat undangan dan membagikan link ke tamu.' }),
    field('Email', email), field('Kata sandi', pass), msg, submit, toggle);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    msg.textContent = 'Memproses...';
    try {
      if (mode === 'masuk') await client.signIn(email.value, pass.value);
      else {
        const r = await client.signUp(email.value, pass.value);
        if (r.needsConfirm) { msg.textContent = 'Akun dibuat. Cek email Anda untuk konfirmasi, lalu masuk.'; submit.disabled = false; return; }
      }
      onDone();
    } catch (err) {
      msg.textContent = err.message;
      submit.disabled = false;
    }
  });
  return form;
}

/** Form buat undangan. Alamat (slug) terisi otomatis dari nama, bisa diubah. */
export function createView({ client, onCreated, onCancel }) {
  const el = {
    eventType: h('select', { class: 's-input', name: 'eventType' }, EVENT_TYPES.filter((t) => THEMES.some((th) => th.eventType === t)).map((t) => h('option', { value: t, text: EVENT_LABELS[t].replace('Undangan ', '') }))),
    groom: input({ name: 'groom', maxlength: '60', required: true }),
    bride: input({ name: 'bride', maxlength: '60' }),
    eventDate: input({ name: 'eventDate', type: 'datetime-local', required: true }),
    slug: input({ name: 'slug', maxlength: '40', autocapitalize: 'none', spellcheck: 'false' }),
    theme: h('select', { class: 's-input', name: 'theme' }),
    world: h('select', { class: 's-input', name: 'world' }, h('option', { value: '', text: 'Otomatis (sesuai jenis acara)' }), WORLDS.map((w) => h('option', { value: w, text: w === 'villa' ? 'Villa (pernikahan)' : 'Aula' }))),
    venue: input({ name: 'venue', maxlength: '120' }),
    address: input({ name: 'address', maxlength: '240' }),
    mapsUrl: input({ name: 'mapsUrl', type: 'url', placeholder: 'https://maps.google.com/...' }),
  };
  let slugTouched = false;
  const msg = h('p', { class: 's-msg', role: 'status', 'aria-live': 'polite' });
  const errs = {};
  const wrap = (label, key, node) => { const f = field(label, node); errs[key] = f.querySelector('.s-err'); return f; };

  const fillThemes = () => {
    el.theme.replaceChildren(...THEMES.filter((t) => t.eventType === el.eventType.value).map((t) => h('option', { value: t.id, text: `${t.label} - ${t.mood}` })));
    el.bride.closest('label').hidden = el.eventType.value !== 'pernikahan';
  };
  const suggest = () => { if (!slugTouched) el.slug.value = slugify(el.eventType.value === 'pernikahan' ? `${el.bride.value} ${el.groom.value}` : el.groom.value); };
  el.eventType.addEventListener('change', () => { fillThemes(); suggest(); });
  el.groom.addEventListener('input', suggest);
  el.bride.addEventListener('input', suggest);
  el.slug.addEventListener('input', () => { slugTouched = true; });

  const submit = h('button', { class: 's-btn', type: 'submit', text: 'Buat undangan' });
  const form = h('form', { class: 's-card', novalidate: true },
    h('h1', { text: 'Buat undangan baru' }),
    wrap('Jenis acara', 'eventType', el.eventType),
    wrap('Nama mempelai pria / nama acara', 'groom', el.groom),
    wrap('Nama mempelai wanita', 'bride', el.bride),
    wrap('Tanggal dan jam', 'eventDate', el.eventDate),
    wrap('Tema', 'theme', el.theme),
    wrap('Alamat link (huruf kecil, angka, minus)', 'slug', el.slug),
    wrap('Dunia 3D', 'world', el.world),
    wrap('Nama tempat', 'venue', el.venue),
    wrap('Alamat lengkap', 'address', el.address),
    wrap('Link peta (opsional)', 'mapsUrl', el.mapsUrl),
    msg, h('div', { class: 's-row' }, submit, h('button', { class: 's-btn s-ghost', type: 'button', text: 'Batal', onclick: onCancel })));
  fillThemes();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = Object.fromEntries(Object.entries(el).map(([k, n]) => [k, n.value]));
    const v = validateInvitation(raw);
    for (const [k, n] of Object.entries(errs)) n.textContent = v.errors[k] || '';
    if (!v.ok) { msg.textContent = 'Periksa isian yang bertanda.'; return; }
    submit.disabled = true;
    msg.textContent = 'Membuat undangan...';
    try {
      await client.createInvitation(v.value);
      onCreated(v.value.slug);
    } catch (err) {
      msg.textContent = err.message;
      submit.disabled = false;
    }
  });
  return form;
}

const fmtDate = (v) => { try { return new Date(v).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }); } catch { return ''; } };

/** Daftar undangan milik pengguna. */
export function listView({ items, onOpen, onNew, onSignOut, email }) {
  return h('div', { class: 's-card' },
    h('div', { class: 's-row s-between' }, h('h1', { text: 'Undangan saya' }), onSignOut ? h('button', { class: 's-link', type: 'button', text: 'Keluar', onclick: onSignOut }) : null),
    email ? h('p', { class: 's-sub', text: email }) : null,
    items.length ? h('ul', { class: 's-list' }, items.map((i) => h('li', {}, h('button', { class: 's-item', type: 'button', onclick: () => onOpen(i.slug) },
      h('strong', { text: [i.groom, i.bride].filter(Boolean).join(' & ') }), h('span', { text: `${fmtDate(i.event_date)} - ${i.status}` }))))) : h('p', { class: 's-sub', text: 'Belum ada undangan.' }),
    h('button', { class: 's-btn', type: 'button', text: 'Buat undangan baru', onclick: onNew }));
}

/** Dasbor satu undangan: link bagikan, daftar tamu, RSVP, hadiah. */
export function detailView({ client, slug, inviteBase, worldBase, onBack, onEdit }) {
  const links = shareLinks({ slug, inviteBase, worldBase });
  const root = h('div', { class: 's-card' });
  const msg = h('p', { class: 's-msg', role: 'status', 'aria-live': 'polite' });
  const copy = async (text, btn) => {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Tersalin'; } catch { msg.textContent = `Salin manual: ${text}`; }
  };
  const linkRow = (label, url) => h('div', { class: 's-link-row' }, h('strong', { text: label }), h('code', { text: url }), h('button', { class: 's-btn s-small', type: 'button', text: 'Salin', onclick: (e) => copy(url, e.currentTarget) }));

  const guestsBox = h('div', {}), rsvpBox = h('div', {}), giftBox = h('div', {});

  async function renderGuests() {
    const rows = await client.guestsOf(slug);
    const name = input({ name: 'guest', maxlength: '80', placeholder: 'Nama tamu', 'aria-label': 'Nama tamu' });
    const add = h('form', { class: 's-row' }, name, h('button', { class: 's-btn s-small', type: 'submit', text: 'Tambah' }));
    add.addEventListener('submit', async (e) => { e.preventDefault(); if (!name.value.trim()) return; try { await client.addGuest(slug, name.value, null); await renderGuests(); } catch (err) { msg.textContent = err.message; } });
    guestsBox.replaceChildren(h('h2', { text: `Daftar tamu (${rows.length})` }), add,
      h('ul', { class: 's-list' }, rows.map((g) => {
        const url = links.forGuest(g.name);
        return h('li', { class: 's-guest' }, h('span', { text: g.name }),
          h('a', { class: 's-btn s-small', href: whatsappUrl(`Assalamualaikum, kami mengundang ${g.name}. Buka undangan: ${url}`), target: '_blank', rel: 'noopener noreferrer', text: 'WhatsApp' }),
          h('button', { class: 's-btn s-small', type: 'button', text: 'Salin link', onclick: (e) => copy(url, e.currentTarget) }),
          h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Hapus', onclick: async () => { try { await client.deleteGuest(slug, g.id); await renderGuests(); } catch (err) { msg.textContent = err.message; } } }));
      })));
  }

  async function renderRsvp() {
    const rows = await client.rsvpsOf(slug);
    const yes = rows.filter((r) => r.attending);
    const total = yes.reduce((n, r) => n + (r.guests || 0), 0);
    rsvpBox.replaceChildren(h('h2', { text: 'Konfirmasi hadir' }),
      h('p', { class: 's-sub', text: `${yes.length} konfirmasi hadir (${total} orang), ${rows.length - yes.length} berhalangan.` }),
      h('ul', { class: 's-list' }, rows.map((r) => h('li', {}, h('strong', { text: `${r.name} - ${r.attending ? `hadir (${r.guests})` : 'berhalangan'}` }), r.wish ? h('span', { text: r.wish }) : null))));
  }

  async function renderGifts() {
    const rows = await client.giftsOf(slug);
    const kind = h('select', { class: 's-input', 'aria-label': 'Jenis' }, ['bank', 'ewallet'].map((k) => h('option', { value: k, text: k === 'bank' ? 'Bank' : 'E-wallet' })));
    const label = input({ maxlength: '60', placeholder: 'Nama bank / e-wallet', 'aria-label': 'Nama bank atau e-wallet' });
    const an = input({ maxlength: '80', placeholder: 'Atas nama', 'aria-label': 'Atas nama' });
    const no = input({ maxlength: '40', placeholder: 'Nomor', inputmode: 'numeric', 'aria-label': 'Nomor rekening' });
    const add = h('form', { class: 's-grid' }, kind, label, an, no, h('button', { class: 's-btn s-small', type: 'submit', text: 'Tambah hadiah' }));
    add.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!label.value.trim() || !no.value.trim()) { msg.textContent = 'Nama dan nomor wajib diisi.'; return; }
      try { await client.addGift(slug, { kind: kind.value, label: label.value, accountName: an.value, accountNo: no.value, position: rows.length }); await renderGifts(); } catch (err) { msg.textContent = err.message; }
    });
    giftBox.replaceChildren(h('h2', { text: 'Hadiah / tanda kasih' }), add,
      h('ul', { class: 's-list' }, rows.map((g) => h('li', { class: 's-guest' }, h('span', { text: `${g.label} - ${g.account_name || ''} ${g.account_no || ''}` }),
        h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Hapus', onclick: async () => { try { await client.deleteGift(slug, g.id); await renderGifts(); } catch (err) { msg.textContent = err.message; } } })))));
  }

  root.append(
    h('div', { class: 's-row s-between' }, h('h1', { text: slug }), h('button', { class: 's-link', type: 'button', text: 'Kembali', onclick: onBack })),
    linkRow('Link undangan', links.invite), linkRow('Link dunia 3D', links.world),
    onEdit ? h('button', { class: 's-btn', type: 'button', text: 'Isi undangan (kisah, acara, galeri, ...)', onclick: onEdit }) : null,
    msg, guestsBox, rsvpBox, giftBox);
  const guard = (fn) => fn().catch((e) => { msg.textContent = e.message; });
  guard(renderGuests); guard(renderRsvp); guard(renderGifts);
  return root;
}
