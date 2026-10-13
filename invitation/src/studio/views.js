import { h } from '../engine/dom.js';
import { EVENT_TYPES, EVENT_LABELS, THEMES } from '../themes/index.js';
import { WORLDS } from '../engine/world-link.js';
import { slugify, validateInvitation, shareLinks, whatsappUrl } from './api.js';
import { qrPanel } from './qr.js';

/** Setiap jenis acara punya identitasnya sendiri: nama kolom, contoh isian, dan apakah ada nama kedua. */
export const IDENTITY = {
  pernikahan: { first: 'Nama mempelai pria', second: 'Nama mempelai wanita', hint: 'Contoh: Dimas', hint2: 'Contoh: Rani' },
  khitanan: { first: 'Nama anak', hint: 'Contoh: Muhammad Dimas' },
  ulang_tahun: { first: 'Nama yang berulang tahun', hint: 'Contoh: Aira' },
  tazkirah: { first: 'Nama acara', hint: 'Contoh: Tazkirah Akbar: Menata Hati' },
  tarannum: { first: 'Nama acara', hint: 'Contoh: Malam Tarannum Nusantara' },
  karaoke: { first: 'Nama acara', hint: 'Contoh: Malam Karaoke Bareng' },
  komunitas: { first: 'Nama acara / komunitas', hint: 'Contoh: Temu Komunitas Lombok' },
};
/** Judul undangan untuk daftar: dua nama hanya untuk pernikahan. */
export const titleOf = (i) => (i.event_type === 'pernikahan' ? [i.groom, i.bride] : [i.groom]).filter(Boolean).join(' & ');

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
    const id = IDENTITY[el.eventType.value] || IDENTITY.komunitas;
    firstField.querySelector('span').textContent = id.first;
    el.groom.placeholder = id.hint;
    const hasSecond = !!id.second;
    secondField.hidden = !hasSecond;
    if (hasSecond) { secondField.querySelector('span').textContent = id.second; el.bride.placeholder = id.hint2; } else el.bride.value = '';
  };
  const suggest = () => { if (!slugTouched) el.slug.value = slugify(el.eventType.value === 'pernikahan' ? `${el.bride.value} ${el.groom.value}` : el.groom.value); };
  el.eventType.addEventListener('change', () => { fillThemes(); suggest(); });
  el.groom.addEventListener('input', suggest);
  el.bride.addEventListener('input', suggest);
  el.slug.addEventListener('input', () => { slugTouched = true; });

  const submit = h('button', { class: 's-btn', type: 'submit', text: 'Buat undangan' });
  const firstField = wrap('Nama', 'groom', el.groom);
  const secondField = wrap('Nama kedua', 'bride', el.bride);
  const form = h('form', { class: 's-card', novalidate: true },
    h('h1', { text: 'Buat undangan baru' }),
    wrap('Jenis acara', 'eventType', el.eventType),
    firstField,
    secondField,
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

/** Daftar undangan milik pengguna. Mode "Pilih" untuk menghapus beberapa sekaligus (mis. sisa data uji). */
export function listView({ items, onOpen, onNew, onSignOut, onDelete, email }) {
  const root = h('div', { class: 's-card' });
  const msg = h('p', { class: 's-msg', role: 'status', 'aria-live': 'polite' });
  const chosen = new Set();
  let selecting = false;

  function paint() {
    const toggle = onDelete && items.length ? h('button', { class: 's-link', type: 'button', text: selecting ? 'Selesai' : 'Pilih', onclick: () => { selecting = !selecting; chosen.clear(); paint(); } }) : null;
    const row = (i) => {
      const label = `${titleOf(i)} - ${EVENT_LABELS[i.event_type] ? EVENT_LABELS[i.event_type].replace('Undangan ', '') : i.event_type}`;
      const body = h('span', { class: 's-itembody' }, h('strong', { text: titleOf(i) }),
        h('span', { text: `${EVENT_LABELS[i.event_type] ? EVENT_LABELS[i.event_type].replace('Undangan ', '') : i.event_type} - ${fmtDate(i.event_date)} - ${i.status}` }));
      if (!selecting) return h('li', {}, h('button', { class: 's-item', type: 'button', 'aria-label': label, onclick: () => onOpen(i.slug) }, body));
      const cb = h('input', { type: 'checkbox', 'aria-label': `Pilih ${titleOf(i)}` });
      cb.checked = chosen.has(i.slug);
      cb.addEventListener('change', () => { cb.checked ? chosen.add(i.slug) : chosen.delete(i.slug); paintBar(); });
      return h('li', {}, h('label', { class: 's-item s-pick' }, cb, body));
    };
    const bar = h('div', { class: 's-delbar', hidden: true });
    root._bar = bar;
    root.replaceChildren(...[
      h('div', { class: 's-row s-between' }, h('h1', { text: 'Undangan saya' }), onSignOut ? h('button', { class: 's-link', type: 'button', text: 'Keluar', onclick: onSignOut }) : toggle),
      onSignOut ? toggle : null,
      email ? h('p', { class: 's-sub', text: email }) : null,
      items.length ? h('ul', { class: 's-list' }, items.map(row)) : h('p', { class: 's-sub', text: 'Belum ada undangan.' }),
      bar, msg,
      selecting ? null : h('button', { class: 's-btn', type: 'button', text: 'Buat undangan baru', onclick: onNew }),
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
    const go = h('button', { class: 's-btn s-danger', type: 'button', text: `Hapus ${n || ''} terpilih`, disabled: true });
    word.addEventListener('input', () => { go.disabled = !(n > 0 && word.value.trim() === 'HAPUS'); });
    go.addEventListener('click', async () => {
      go.disabled = true;
      msg.textContent = 'Menghapus...';
      try {
        const count = await onDelete([...chosen]);
        items = items.filter((i) => !chosen.has(i.slug));
        chosen.clear();
        selecting = false;
        paint();
        msg.textContent = `${count} undangan dihapus.`;
      } catch (e) { msg.textContent = e.message; go.disabled = false; }
    });
    bar.replaceChildren(
      h('p', { class: 's-sub', text: n ? `${n} undangan dipilih. Tamu, RSVP, dan isi adegannya ikut terhapus dan tidak bisa dikembalikan.` : 'Centang undangan yang ingin dihapus.' }),
      ...(n ? [word, go] : []));
  }

  paint();
  return root;
}

/** Dasbor satu undangan: link bagikan, daftar tamu, RSVP, hadiah. */
export function detailView({ client, slug, inviteBase, worldBase, onBack, onEdit, onDeleted }) {
  const links = shareLinks({ slug, inviteBase, worldBase });
  const root = h('div', { class: 's-card' });
  const msg = h('p', { class: 's-msg', role: 'status', 'aria-live': 'polite' });
  const copy = async (text, btn) => {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Tersalin'; } catch { msg.textContent = `Salin manual: ${text}`; }
  };
  const linkRow = (label, url) => h('div', { class: 's-link-row' }, h('strong', { text: label }), h('code', { text: url }), h('button', { class: 's-btn s-small', type: 'button', text: 'Salin', onclick: (e) => copy(url, e.currentTarget) }));

  const guestsBox = h('div', {}), rsvpBox = h('div', {}), giftBox = h('div', {});

  /** Hapus permanen: harus mengetik alamat undangan agar tidak terhapus tak sengaja. */
  function dangerZone() {
    const word = h('input', { class: 's-input', type: 'text', placeholder: `Ketik ${slug} untuk konfirmasi`, autocomplete: 'off', 'aria-label': 'Ketik alamat undangan' });
    const go = h('button', { class: 's-btn s-danger', type: 'button', text: 'Hapus undangan ini', disabled: true });
    word.addEventListener('input', () => { go.disabled = word.value.trim() !== slug; });
    go.addEventListener('click', async () => {
      go.disabled = true;
      msg.textContent = 'Menghapus...';
      try { await client.deleteInvitations([slug]); if (onDeleted) onDeleted(slug); } catch (e) { msg.textContent = e.message; go.disabled = false; }
    });
    return h('div', { class: 's-group s-danger-zone' }, h('h2', { text: 'Hapus undangan' }),
      h('p', { class: 's-sub', text: 'Tamu, konfirmasi hadir, hadiah, dan isi adegan ikut terhapus dan tidak bisa dikembalikan.' }), word, go);
  }

  async function renderGuests() {
    const rows = await client.guestsOf(slug);
    const name = input({ name: 'guest', maxlength: '80', placeholder: 'Nama tamu', 'aria-label': 'Nama tamu' });
    const add = h('form', { class: 's-row' }, name, h('button', { class: 's-btn s-small', type: 'submit', text: 'Tambah' }));
    add.addEventListener('submit', async (e) => { e.preventDefault(); if (!name.value.trim()) return; try { await client.addGuest(slug, name.value, null); await renderGuests(); } catch (err) { msg.textContent = err.message; } });
    guestsBox.replaceChildren(h('h2', { text: `Daftar tamu (${rows.length})` }), add,
      h('ul', { class: 's-list' }, rows.map((g) => {
        const url = links.forGuest(g.name);
        const qrBox = h('div', { class: 's-qrbox', hidden: true });
        const qrBtn = h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'QR', 'aria-expanded': 'false', onclick: () => {
          qrBox.hidden = !qrBox.hidden;
          qrBtn.setAttribute('aria-expanded', String(!qrBox.hidden));
          if (!qrBox.hidden && !qrBox.firstChild) qrBox.append(qrPanel({ url, caption: g.name, name: `${slug}-${g.name}`, onError: (m) => { msg.textContent = m; } }));
        } });
        return h('li', { class: 's-guest' }, h('span', { text: g.name }), qrBtn,
          h('a', { class: 's-btn s-small', href: whatsappUrl(`Assalamualaikum, kami mengundang ${g.name}. Buka undangan: ${url}`), target: '_blank', rel: 'noopener noreferrer', text: 'WhatsApp' }),
          h('button', { class: 's-btn s-small', type: 'button', text: 'Salin link', onclick: (e) => copy(url, e.currentTarget) }),
          h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Hapus', onclick: async () => { try { await client.deleteGuest(slug, g.id); await renderGuests(); } catch (err) { msg.textContent = err.message; } } }), qrBox);
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
    h('div', { class: 's-group' }, h('h2', { text: 'Kode QR undangan' }), qrPanel({ url: links.invite, caption: 'Undangan', name: slug, onError: (m) => { msg.textContent = m; } })),
    msg, guestsBox, rsvpBox, giftBox, dangerZone());
  const guard = (fn) => fn().catch((e) => { msg.textContent = e.message; });
  guard(renderGuests); guard(renderRsvp); guard(renderGifts);
  return root;
}
