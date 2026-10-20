import './studio.css';
import { createClient } from './api.js';
import { loginView, createView, detailView, titleOf } from './views.js';
import { editorView } from './editor.js';
import { dashboardView } from './dashboard.js';
import { templateView } from './template.js';
import { guestsView } from './guests.js';
import { worldOfRow } from '../engine/world-link.js';
import { pickerView, settingsView, helpView } from './pages.js';
import { shellView } from './shell.js';
import { parseRoute } from './route.js';
import { leaveStudio, goodbyeView, hasUnsaved } from './exit.js';
import { adminView } from './admin.js';
import { createAdminApi } from './admin-api.js';
import { createCheckinApi } from './checkin-api.js';
import { checkinView } from './checkin.js';
import { queueView } from './checkin-admin.js';
import { h } from '../engine/dom.js';

const KEY = 'orbit.studio.session';
const SLUG_KEY = 'orbit.studio.slug';
const store = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (v) => { try { v == null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); } catch { /* penyimpanan diblokir: sesi hanya hidup selama halaman terbuka */ } },
};
const recall = () => { try { return sessionStorage.getItem(SLUG_KEY); } catch { return null; } };
const remember = (s) => { try { sessionStorage.setItem(SLUG_KEY, s); } catch { /* abaikan */ } };

const root = document.getElementById('studio');
const exitUrl = import.meta.env.VITE_EXIT_URL;
const inviteBase = `${location.origin}${location.pathname.replace(/studio(\.html)?$/, '')}`;
const worldBase = import.meta.env.VITE_WORLD_URL;
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

let client;
try {
  client = createClient({ url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY, store });
} catch (e) {
  root.replaceChildren(h('div', { class: 's-card' }, h('h1', { text: 'Studio belum siap' }), h('p', { class: 's-msg', role: 'alert', text: e.message })));
}

// Peran staf hanya untuk menampilkan menu Admin. Disimpan per akun supaya tidak bertanya ke database di tiap pindah halaman.
let roleCache = { uid: null, role: null };
async function staffRole() {
  const uid = client.userId();
  if (roleCache.uid === uid) return roleCache.role;
  try { roleCache = { uid, role: await client.staffRole() }; } catch { return null; } // gagal tidak disimpan, dicoba lagi nanti
  return roleCache.role;
}

function signOut() {
  roleCache = { uid: null, role: null };
  return leaveStudio({ client, exitUrl, onGoodbye: () => root.replaceChildren(goodbyeView({ onAgain: render })) });
}

// Menutup tab atau pindah situs saat ada isian belum tersimpan: peramban bertanya dulu.
window.addEventListener('beforeunload', (e) => { if (hasUnsaved()) { e.preventDefault(); e.returnValue = ''; } });
// Pindah halaman di dalam Studio dengan isian belum tersimpan: tanya dulu, batalkan bila tidak jadi.
let lastHash = location.hash;
window.addEventListener('hashchange', () => {
  if (hasUnsaved() && !window.confirm('Ada perubahan yang belum disimpan. Tetap pindah halaman?')) {
    const back = lastHash;
    history.replaceState(null, '', back || '#/dashboard');
    return;
  }
  lastHash = location.hash;
  render();
});

const note = (text, retry) => h('div', { class: 's-card' }, h('p', { class: 's-msg', role: 'alert', text }), retry ? h('button', { class: 's-btn', type: 'button', text: 'Coba lagi', onclick: retry }) : null);

async function render() {
  if (!client) return;
  if (!client.session()) return root.replaceChildren(loginView({ client, onDone: render }));
  const { page, slug } = parseRoute(location.hash);
  if (slug) remember(slug);
  const cur = slug || recall();
  const session = client.session();
  const email = session.user && session.user.email;
  const role = await staffRole();
  const checkinApi = createCheckinApi({ client, url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY });
  const ACTIVE = { dashboard: 'dashboard', undangan: 'dashboard', buat: 'dashboard', tamu: 'tamu', checkin: 'checkin', editor: 'editor', template: 'template', pengaturan: 'pengaturan', bantuan: 'bantuan', admin: 'admin' };
  const shell = (content) => root.replaceChildren(shellView({ active: ACTIVE[page], email, slug: cur, onSignOut: signOut, content, isAdmin: Boolean(role) }));
  const setContent = (node) => { const m = document.getElementById('st-main'); if (m) m.replaceChildren(node); };
  const hrefs = { editor: (s) => `#/editor/${s}`, template: (s) => `#/template/${s}`, tamu: (s) => `#/tamu/${s}`, detail: (s) => `#/undangan/${s}` };
  shell(h('p', { class: 'st-loading', role: 'status', text: 'Memuat...' }));
  window.scrollTo(0, 0);
  try {
    if (page === 'pengaturan') return setContent(settingsView({ email, onSignOut: signOut }));
    if (page === 'bantuan') return setContent(helpView());
    if (page === 'admin') {
      if (!role) return setContent(note('Halaman ini hanya untuk admin.', () => go('#/dashboard')));
      return setContent(h('div', {}, queueView({ api: checkinApi }), adminView({ api: createAdminApi({ client }), role })));
    }
    if (page === 'buat') return setContent(createView({ client, onCreated: (s) => go(`#/template/${s}`), onCancel: () => go('#/dashboard') }));
    const items = await client.myInvitations();
    if (page === 'dashboard') {
      const stats = await client.dashboardStats(items.map((i) => i.slug)).catch(() => ({}));
      return setContent(dashboardView({ items, stats, hrefs, onDelete: (slugs) => client.deleteInvitations(slugs) }));
    }
    if (page === 'tamu') return setContent(guestsView({ client, items, slug: cur, inviteBase, worldBase, onPick: (s) => go(`#/tamu/${s}`) }));
    const need = { editor: ['Editor', 'Pilih undangan yang ingin diisi.'], template: ['Template & amplop', 'Pilih undangan untuk memilih amplop dan suasananya.'], undangan: ['Bagikan', 'Pilih undangan.'], checkin: ['Check-in tamu', 'Pilih undangan untuk mengajukan check-in tamu yang menginap.'] }[page];
    if (!slug) return setContent(pickerView({ title: need[0], lead: need[1], items, hrefFor: (s) => `#/${page}/${s}` }));
    if (!items.some((i) => i.slug === slug)) return setContent(note('Undangan itu tidak ditemukan di akunmu.', () => go('#/dashboard')));
    if (page === 'checkin') return setContent(checkinView({ api: checkinApi, slug, title: titleOf(items.find((i) => i.slug === slug)) }));
    if (page === 'undangan') return setContent(detailView({ client, slug, inviteBase, worldBase, world: worldOfRow(items.find((i) => i.slug === slug)), onBack: () => go('#/dashboard'), onDeleted: () => go('#/dashboard'), onEdit: () => go(`#/editor/${slug}`) }));
    if (page === 'editor') return setContent(editorView({ client, slug, inviteBase, onBack: () => go(`#/undangan/${slug}`) }));
    if (page === 'template') {
      const inv = await client.invitationOf(slug);
      return setContent(templateView({ client, slug, inv, inviteBase, onSaved: () => {} }));
    }
  } catch (e) {
    if (/masuk|Sesi/.test(e.message)) return root.replaceChildren(loginView({ client, onDone: render }));
    setContent(note(e.message, render));
  }
}

if (client) render();
