import { h } from '../engine/dom.js';
import { icon } from './icons.js';

export const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home', path: () => '#/dashboard' },
  { id: 'tamu', label: 'Tamu', icon: 'users', path: (slug) => (slug ? `#/tamu/${slug}` : '#/tamu') },
  { id: 'editor', label: 'Editor', icon: 'pencil', path: (slug) => (slug ? `#/editor/${slug}` : '#/editor') },
  { id: 'template', label: 'Template', icon: 'layout', path: (slug) => (slug ? `#/template/${slug}` : '#/template') },
  { id: 'pengaturan', label: 'Pengaturan', icon: 'settings', path: () => '#/pengaturan' },
  { id: 'bantuan', label: 'Bantuan', icon: 'help', path: () => '#/bantuan' },
];

/**
 * Kerangka Studio: bilah atas (logo, akun, Keluar), menu samping di layar lebar, dan menu bawah di ponsel.
 * Menu Editor dan Template membawa undangan yang terakhir dibuka, jadi alurnya tersambung.
 */
export function shellView({ active, email, slug, onSignOut, content }) {
  const link = (n, cls) => h('a', { class: `${cls}${n.id === active ? ' is-active' : ''}`, href: n.path(slug), 'aria-current': n.id === active ? 'page' : null },
    icon(n.icon, { size: cls === 'st-bnav-item' ? 22 : 20 }), h('span', { text: n.label }));
  return h('div', { class: 'st-app' },
    h('header', { class: 'st-top' },
      h('a', { class: 'st-brand', href: '#/dashboard', 'aria-label': 'Studio, ke Dashboard' }, icon('flower', { size: 30 }), h('span', { text: 'Studio' })),
      h('div', { class: 'st-account' },
        h('span', { class: 'st-chip', title: email || '' }, icon('user', { size: 16 }), h('span', { class: 'st-chip-text', text: email || 'Akun' })),
        h('button', { class: 'st-exit', type: 'button', text: 'Keluar', onclick: onSignOut }))),
    h('nav', { class: 'st-side', 'aria-label': 'Menu utama' }, NAV.map((n) => link(n, 'st-nav-item'))),
    h('main', { class: 'st-main', id: 'st-main' }, content),
    h('nav', { class: 'st-bnav', 'aria-label': 'Menu utama (ponsel)' }, NAV.map((n) => link(n, 'st-bnav-item'))));
}
