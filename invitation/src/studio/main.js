import './studio.css';
import { createClient } from './api.js';
import { loginView, createView, listView, detailView } from './views.js';
import { editorView } from './editor.js';
import { leaveStudio, topbarView, goodbyeView, hasUnsaved } from './exit.js';
import { h } from '../engine/dom.js';

const KEY = 'orbit.studio.session';
const store = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (v) => { try { v == null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); } catch { /* penyimpanan diblokir: sesi hanya hidup selama halaman terbuka */ } },
};
const root = document.getElementById('studio');
const exitUrl = import.meta.env.VITE_EXIT_URL;
/** Tampilkan layar; bilah atas dengan tombol Keluar muncul di semua layar setelah masuk. */
function show(node) {
  const s = client && client.session();
  if (!s) return root.replaceChildren(node);
  root.replaceChildren(topbarView({ email: s.user && s.user.email, onSignOut: signOut }), node);
}
function signOut() {
  return leaveStudio({ client, exitUrl, onGoodbye: () => root.replaceChildren(goodbyeView({ onAgain: home })) });
}
// Menutup tab atau pindah situs saat ada isian belum tersimpan: peramban bertanya dulu.
window.addEventListener('beforeunload', (e) => { if (hasUnsaved()) { e.preventDefault(); e.returnValue = ''; } });
const inviteBase = `${location.origin}${location.pathname.replace(/studio(\.html)?$/, '')}`;
const worldBase = import.meta.env.VITE_WORLD_URL;

let client;
try {
  client = createClient({ url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY, store });
} catch (e) {
  show(h('div', { class: 's-card' }, h('h1', { text: 'Studio belum siap' }), h('p', { class: 's-msg', role: 'alert', text: e.message })));
}

function openDetail(slug) {
  show(detailView({ client, slug, inviteBase, worldBase, onBack: home, onDeleted: home, onEdit: () => show(editorView({ client, slug, inviteBase, onBack: () => openDetail(slug) })) }));
}

async function home() {
  if (!client.session()) return show(loginView({ client, onDone: home }));
  try {
    const items = await client.myInvitations();
    show(listView({
      items, email: client.session().user && client.session().user.email,
      onOpen: (slug) => openDetail(slug),
      onDelete: (slugs) => client.deleteInvitations(slugs),
      onNew: () => show(createView({ client, onCreated: (slug) => openDetail(slug), onCancel: home })),
    }));
  } catch (e) {
    if (/masuk|Sesi/.test(e.message)) return show(loginView({ client, onDone: home }));
    show(h('div', { class: 's-card' }, h('p', { class: 's-msg', role: 'alert', text: e.message }), h('button', { class: 's-btn', type: 'button', text: 'Coba lagi', onclick: home })));
  }
}

if (client) home();
