import { h } from '../engine/dom.js';
import { safeUrl } from '../engine/content.js';

/** Ada isian editor yang belum disimpan? (editor menandai kartunya dengan data-dirty="1") */
export const hasUnsaved = (root = document) => !!root.querySelector('[data-dirty="1"]');

/**
 * Keluar dari Studio: sesi dihapus di perangkat dan di server, lalu pengguna meninggalkan situs.
 * Urutan: (1) tanya dulu bila ada perubahan belum tersimpan, (2) sign out, (3) bila VITE_EXIT_URL (https)
 * diisi, pindah ke sana; kalau tidak, coba tutup tab dan tampilkan layar "sudah keluar".
 */
export async function leaveStudio({ client, exitUrl, confirmFn, win = window, root = document, onGoodbye }) {
  const ask = confirmFn || ((m) => win.confirm(m));
  if (hasUnsaved(root) && !ask('Ada perubahan yang belum disimpan. Tetap keluar?')) return false;
  await client.signOut();
  const url = safeUrl(exitUrl);
  if (url) { win.location.replace(url); return true; }
  onGoodbye();
  try { win.close(); } catch { /* tab yang dibuka pengguna tidak bisa ditutup oleh halaman */ }
  return true;
}

export function topbarView({ email, onSignOut }) {
  return h('header', { class: 's-topbar' },
    h('strong', { text: 'Studio' }),
    email ? h('span', { class: 's-who', text: email }) : null,
    h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Keluar', onclick: onSignOut }));
}

export function goodbyeView({ onAgain }) {
  return h('div', { class: 's-card s-bye' },
    h('h1', { text: 'Kamu sudah keluar' }),
    h('p', { class: 's-sub', text: 'Sesi di perangkat ini sudah dihapus. Kamu bisa menutup tab ini.' }),
    h('button', { class: 's-btn', type: 'button', text: 'Masuk lagi', onclick: onAgain }));
}
