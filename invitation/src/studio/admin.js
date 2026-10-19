import { h } from '../engine/dom.js';
import { randomPassword } from './admin-api.js';

const ROLE = { klien: 'Klien', admin: 'Admin', owner: 'Pemilik platform' };
const field = (label, node) => h('label', { class: 's-field' }, h('span', { text: label }), node);
const input = (props) => h('input', { class: 's-input', ...props });
const originOf = () => { try { const o = globalThis.location && globalThis.location.origin; return o && o !== 'null' ? o : ''; } catch { return ''; } };

/**
 * Dasbor admin: buat akun klien, nonaktifkan/aktifkan, atur ulang kata sandi.
 * `role` hanya mengatur apa yang ditampilkan; izin sebenarnya ditegakkan server (api/admin/accounts).
 */
export function adminView({ api, role }) {
  const root = h('div', { class: 's-card' });
  const msg = h('p', { class: 's-msg', role: 'status', 'aria-live': 'polite' });
  const result = h('div', { class: 's-group', hidden: true });
  const listBox = h('div', {});
  let meId = null;

  const run = async (fn) => { try { await fn(); } catch (err) { msg.textContent = err.message; } };

  const copy = async (text, btn) => {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Tersalin'; } catch { msg.textContent = 'Salin manual dari kotak di atas.'; }
  };

  /** Tampilkan data masuk sekali supaya admin bisa menyalinnya. Kata sandi tidak disimpan di mana pun. */
  function showCredentials(title, email, password) {
    const text = `Email: ${email}\nKata sandi: ${password}\nMasuk: ${originOf()}/studio`;
    result.hidden = false;
    result.replaceChildren(
      h('p', { class: 's-sub', text: `${title} Kirim data ini ke klien lewat jalur pribadi, bukan di grup. Kata sandi ini tidak ditampilkan lagi.` }),
      h('code', { text }),
      h('button', { class: 's-btn s-small', type: 'button', text: 'Salin', onclick: (e) => copy(text, e.currentTarget) }));
  }

  const email = input({ type: 'email', name: 'email', autocomplete: 'off', required: true, placeholder: 'email klien', 'aria-label': 'Email klien' });
  const pass = input({ type: 'text', name: 'password', autocomplete: 'off', spellcheck: 'false', maxlength: '72', placeholder: 'kata sandi sementara (min. 8)', 'aria-label': 'Kata sandi sementara' });
  const makeAdmin = input({ type: 'checkbox', name: 'makeAdmin', 'aria-label': 'Jadikan admin' });
  const generate = h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Buat sandi acak', onclick: () => { try { pass.value = randomPassword(); } catch (err) { msg.textContent = err.message; } } });
  const submit = h('button', { class: 's-btn', type: 'submit', text: 'Buat akun' });
  const form = h('form', { class: 's-group', novalidate: true },
    h('h2', { text: 'Buat akun baru' }),
    field('Email', email),
    field('Kata sandi sementara', pass),
    generate,
    role === 'owner' ? h('label', { class: 's-row' }, makeAdmin, h('span', { text: 'Jadikan admin (bisa membuat akun dan kartu check-in)' })) : null,
    submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    msg.textContent = 'Membuat akun...';
    const password = pass.value;
    try {
      const { account } = await api.create({ email: email.value, password, makeAdmin: role === 'owner' && makeAdmin.checked });
      showCredentials(account.role === 'admin' ? 'Akun admin dibuat.' : 'Akun dibuat.', account.email, password);
      email.value = '';
      pass.value = '';
      makeAdmin.checked = false;
      msg.textContent = '';
      await refresh();
    } catch (err) {
      msg.textContent = err.message;
    }
    submit.disabled = false;
  });

  function row(a) {
    const staff = a.role !== 'klien';
    // Tombol hanya disembunyikan untuk akun yang pasti ditolak server; server tetap yang memutuskan.
    const canManage = a.id !== meId && a.role !== 'owner' && (!staff || role === 'owner');
    const buttons = canManage ? [
      h('button', { class: 's-btn s-small s-ghost', type: 'button', text: a.active ? 'Nonaktifkan' : 'Aktifkan', onclick: () => run(async () => {
        if (a.active && !window.confirm(`Nonaktifkan ${a.email}? Dia tidak bisa masuk lagi sampai diaktifkan.`)) return;
        msg.textContent = '';
        await api.setActive(a.id, !a.active);
        await refresh();
      }) }),
      h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Atur ulang sandi', onclick: () => run(async () => {
        if (!window.confirm(`Buat kata sandi baru untuk ${a.email}? Kata sandi lama langsung tidak berlaku.`)) return;
        msg.textContent = '';
        const password = randomPassword();
        await api.setPassword(a.id, password);
        showCredentials('Kata sandi diatur ulang.', a.email, password);
      }) }),
    ] : [];
    return h('li', { class: 's-guest' },
      h('span', { class: 's-itembody' }, h('strong', { text: a.email || a.id }), h('span', { text: `${ROLE[a.role] || a.role} - ${a.invitations} undangan - ${a.active ? 'aktif' : 'nonaktif'}` })),
      ...buttons);
  }

  async function refresh() {
    const { accounts, me } = await api.list();
    meId = me && me.id;
    listBox.replaceChildren(
      h('h2', { text: `Akun (${accounts.length})` }),
      accounts.length ? h('ul', { class: 's-list' }, accounts.map(row)) : h('p', { class: 's-sub', text: 'Belum ada akun.' }));
  }

  root.append(
    h('h1', { text: 'Admin' }),
    h('p', { class: 's-sub', text: 'Buat akun untuk klien, lalu kirim email dan kata sandi sementaranya. Klien masuk di halaman Studio. Pendaftaran sendiri ditutup.' }),
    form, result, msg, listBox);
  run(refresh);
  return root;
}
