import './studio.css';
import { createClient } from './api.js';
import { loginView, createView, listView, detailView } from './views.js';
import { h } from '../engine/dom.js';

const KEY = 'orbit.studio.session';
const store = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (v) => { try { v == null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); } catch { /* penyimpanan diblokir: sesi hanya hidup selama halaman terbuka */ } },
};
const root = document.getElementById('studio');
const show = (node) => root.replaceChildren(node);
const inviteBase = `${location.origin}${location.pathname.replace(/studio(\.html)?$/, '')}`;
const worldBase = import.meta.env.VITE_WORLD_URL;

let client;
try {
  client = createClient({ url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY, store });
} catch (e) {
  show(h('div', { class: 's-card' }, h('h1', { text: 'Studio belum siap' }), h('p', { class: 's-msg', role: 'alert', text: e.message })));
}

async function home() {
  if (!client.session()) return show(loginView({ client, onDone: home }));
  try {
    const items = await client.myInvitations();
    show(listView({
      items, email: client.session().user && client.session().user.email,
      onOpen: (slug) => show(detailView({ client, slug, inviteBase, worldBase, onBack: home })),
      onNew: () => show(createView({ client, onCreated: (slug) => show(detailView({ client, slug, inviteBase, worldBase, onBack: home })), onCancel: home })),
      onSignOut: () => { client.signOut(); home(); },
    }));
  } catch (e) {
    if (/masuk|Sesi/.test(e.message)) return show(loginView({ client, onDone: home }));
    show(h('div', { class: 's-card' }, h('p', { class: 's-msg', role: 'alert', text: e.message }), h('button', { class: 's-btn', type: 'button', text: 'Coba lagi', onclick: home })));
  }
}

if (client) home();
