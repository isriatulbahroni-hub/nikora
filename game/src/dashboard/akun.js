// Halaman akun: admin membuat akun pemilik acara (dan developer membuat admin). Nilai isian disimpan di ctx.ui supaya
// tidak hilang saat dasbor menyegarkan diri; teks selalu lewat h()/textContent.
import { KIND_HELP, KIND_LABELS, allowedKinds, generatePassword, validateAccountForm } from './account-form.js';
import { postAccount } from './api.js';
import { STUDIO_URL } from './config.js';
import { h } from './dom.js';
import { icon } from './icons.js';

const pageHead = (title, subtitle) => h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), subtitle && h('p', { class: 'muted' }, subtitle)));
const card = (...children) => h('section', { class: 'card' }, children);
const empty = (iconName, title, text) => h('div', { class: 'empty' }, icon(iconName, 28), h('strong', null, title), text && h('p', { class: 'muted' }, text));

export function viewAccounts(ctx) {
  const ui = ctx.ui;
  const head = pageHead('Akun Pemilik', 'Buat akun untuk pemilik acara. Mereka masuk ke Studio dengan email dan kata sandi ini; pendaftaran sendiri tidak dibuka.');
  if (ctx.demo) return h('div', { class: 'page narrow' }, head, card(empty('users', 'Tidak tersedia di mode contoh', 'Masuk dengan akun staf atau rahasia induk untuk membuat akun.')));
  const kinds = allowedKinds({ role: ctx.role, viaSecret: ctx.viaSecret });
  if (!kinds.length) return h('div', { class: 'page narrow' }, head, card(empty('users', 'Tidak punya izin', 'Peran akun ini tidak boleh membuat akun.')));
  if (!kinds.includes(ui.akunKind)) ui.akunKind = kinds[0];

  const email = h('input', { id: 'akun-email', class: 'input', type: 'email', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'email@pemilik-acara.com', value: ui.akunEmail ?? '', oninput: (e) => { ui.akunEmail = e.target.value; } });
  const pass = h('input', { id: 'akun-pass', class: 'input mono', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'minimal 8 karakter', value: ui.akunPass ?? '', oninput: (e) => { ui.akunPass = e.target.value; } });
  const kind = kinds.length > 1
    ? h('select', { id: 'akun-kind', class: 'input', onchange: (e) => ctx.setUi({ akunKind: e.target.value }) }, kinds.map((k) => h('option', { value: k, selected: k === ui.akunKind }, KIND_LABELS[k])))
    : null;

  const submit = async () => {
    const check = validateAccountForm({ email: ui.akunEmail, password: ui.akunPass, kind: ui.akunKind });
    if (!check.ok) return ctx.setUi({ akunError: check.message });
    ctx.setUi({ akunBusy: true, akunError: '' });
    const res = await postAccount({ secret: ctx.secret, token: ctx.token, ...check.value });
    if (!res.ok) {
      ctx.setUi({ akunBusy: false, akunError: res.message });
      if (res.code === 'session_expired' || res.code === 'not_staff') ctx.logout();
      return undefined;
    }
    return ctx.setUi({ akunBusy: false, akunError: '', akunEmail: '', akunPass: '', akunResult: { email: res.account.email, password: check.value.password, kind: res.account.kind } });
  };

  const form = card(
    h('div', { class: 'card-head' }, h('h2', null, 'Buat akun baru')),
    kind && h('label', { class: 'form-label', for: 'akun-kind' }, 'Jenis akun'),
    kind,
    h('small', { class: 'muted block' }, KIND_HELP[ui.akunKind] ?? ''),
    h('label', { class: 'form-label', for: 'akun-email' }, 'Email'), email,
    h('label', { class: 'form-label', for: 'akun-pass' }, 'Kata sandi awal'), pass,
    h('div', { class: 'btn-group top' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => ctx.setUi({ akunPass: generatePassword() }) }, icon('key', 16), 'Buat sandi acak')),
    ui.akunError ? h('div', { class: 'error-box', role: 'alert' }, ui.akunError) : null,
    h('div', { class: 'btn-group top' },
      h('button', { type: 'button', class: 'btn btn-gold', disabled: ui.akunBusy === true, onclick: submit }, ui.akunBusy ? 'Membuat…' : 'Buat akun')),
    h('p', { class: 'muted small' }, 'Akun langsung aktif (email tidak perlu dikonfirmasi). Berikan email dan kata sandi ini ke orangnya secara pribadi.'));

  const r = ui.akunResult;
  const where = r && (r.kind === 'pemilik' ? STUDIO_URL : `${window.location.origin}/dashboard.html`);
  const share = r ? `Akun Nikora\nEmail: ${r.email}\nKata sandi: ${r.password}\nMasuk: ${where}` : '';
  const result = r
    ? card(
      h('div', { class: 'card-head' }, h('h2', null, 'Akun dibuat')),
      h('div', { class: 'status-row' }, h('span', { class: 'grow muted' }, 'Jenis'), h('strong', null, KIND_LABELS[r.kind] ?? r.kind)),
      h('div', { class: 'status-row' }, h('span', { class: 'grow muted' }, 'Email'), h('strong', null, r.email)),
      h('div', { class: 'status-row' }, h('span', { class: 'grow muted' }, 'Kata sandi'), h('code', { class: 'link-url' }, r.password)),
      h('p', { class: 'note' }, icon('info', 16), 'Kata sandi hanya tampil di sini. Setelah ditutup tidak bisa dilihat lagi.'),
      h('div', { class: 'btn-group top' },
        h('button', { type: 'button', class: 'btn btn-gold btn-sm', onclick: async () => { try { await navigator.clipboard.writeText(share); ctx.toast('Data akun disalin.'); } catch { ctx.toast('Tekan lama kata sandi untuk menyalin.'); } } }, icon('copy', 14), 'Salin'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => window.open(`https://wa.me/?text=${encodeURIComponent(share)}`, '_blank', 'noopener') }, icon('send', 14), 'WhatsApp'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => ctx.setUi({ akunResult: null }) }, 'Selesai')))
    : null;

  return h('div', { class: 'page narrow' }, head, result, form);
}

/** Tautan peran dibuat di browser dari rahasia induk, jadi login akun staf belum bisa memakainya. */
export function viewLinksNeedSecret() {
  return h('div', { class: 'page narrow' },
    pageHead('Tautan Pemilik/MC', 'Tautan khusus pemilik acara dan MC.'),
    card(empty('key', 'Perlu rahasia induk', 'Saat ini tautan peran hanya bisa dibuat dengan rahasia induk (developer). Masuk dengan rahasia induk, atau minta developer membuatkannya.')));
}

/** Putar rahasia dan kunci peran: hanya developer. */
export function viewDeveloperOnly() {
  return h('div', { class: 'page narrow' },
    pageHead('Admin & Peran', 'Keamanan akses admin dan kunci peran.'),
    card(empty('shield', 'Hanya developer', 'Halaman ini hanya untuk developer.')));
}
