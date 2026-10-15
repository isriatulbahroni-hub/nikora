import { h } from '../engine/dom.js';
import { THEMES, getTheme, EVENT_LABELS } from '../themes/index.js';
import { icon } from './icons.js';
import { miniEnvelope } from './dashboard.js';

const typeLabel = (t) => (EVENT_LABELS[t] ? EVENT_LABELS[t].replace('Undangan ', '') : t);
const SEAL = { bintang8: 'Segel bintang', cincin: 'Segel cincin', lilin: 'Segel lilin', mahkota: 'Segel mahkota', orb: 'Segel cahaya', perisai: 'Segel perisai', pita: 'Pita kado', tenun: 'Segel tenun', titik: 'Segel titik' };

/**
 * Template & amplop: pilih tema (termasuk gaya amplop, segel, dan pemandangan cover) untuk satu undangan,
 * lihat langsung di pratinjau dari amplop sampai akhir, lalu simpan. Tema yang dipilih menjadi dasar
 * Tampilan sendiri (warna/font) dan adegan lainnya, jadi semuanya tersambung.
 */
export function templateView({ client, slug, inv, inviteBase, onSaved }) {
  const saved = { id: inv.theme };
  let selected = inv.theme;
  let showAll = false;
  const base = String(inviteBase || '').replace(/\/+$/, '');
  const src = (id) => `${base}/?slug=${encodeURIComponent(slug)}&preview=1&frame=1&to=${encodeURIComponent('Tamu Undangan')}&tema=${encodeURIComponent(id)}`;
  let frameOrigin = '*';
  try { frameOrigin = new URL(src(selected), location.href).origin; } catch { /* '*' hanya bila alamat tak terbaca */ }

  const msg = h('p', { class: 's-msg', role: 'status', 'aria-live': 'polite' });
  const grid = h('div', { class: 'st-themes', role: 'radiogroup', 'aria-label': 'Pilih tema dan amplop' });
  const iframe = h('iframe', { class: 's-frame st-frame', title: 'Pratinjau undangan dengan tema terpilih', src: src(selected), sandbox: 'allow-scripts allow-same-origin allow-popups', referrerpolicy: 'no-referrer' });
  const useBtn = h('button', { class: 'st-btn st-btn-primary', type: 'button', onclick: save });
  const nameNow = h('strong');
  const toggle = h('button', { class: 'st-btn st-btn-ghost', type: 'button', onclick: () => { showAll = !showAll; paint(); } });

  let ready = false;
  const play = () => { try { iframe.contentWindow.postMessage({ type: 'orbit-preview:draft', kind: 'amplop' }, frameOrigin); } catch { /* bingkai belum siap */ } };
  const onFrame = (e) => {
    if (!root.isConnected) { window.removeEventListener('message', onFrame); return; }
    if (e.source !== iframe.contentWindow || (frameOrigin !== '*' && e.origin !== frameOrigin)) return;
    if (e.data && e.data.type === 'orbit-preview:ready') { ready = true; play(); }
  };
  window.addEventListener('message', onFrame);

  function choose(id) {
    selected = id;
    ready = false;
    iframe.src = src(id);
    paint();
  }

  async function save() {
    useBtn.disabled = true;
    msg.textContent = 'Menyimpan...';
    try { await client.saveTheme(slug, selected); saved.id = selected; onSaved(selected); msg.textContent = 'Tema disimpan. Lanjut isi undangannya.'; } catch (e) { msg.textContent = e.message; }
    paint();
  }

  function themeCard(t) {
    const on = t.id === selected;
    const b = h('button', { class: `st-theme${on ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(on), onclick: () => choose(t.id) },
      miniEnvelope(t, { size: 'lg' }),
      h('div', { class: 'st-theme-info' }, h('strong', { text: t.label }), h('span', { text: t.mood }),
        h('p', {}, h('span', { class: 'st-tag', text: t.envelope.variant === 'kado' ? 'Kado' : 'Amplop' }), h('span', { class: 'st-tag', text: SEAL[t.envelope.seal] || 'Segel' }), t.id === saved.id ? h('span', { class: 'st-tag is-ok' }, icon('check', { size: 11 }), 'Dipakai') : null)));
    return b;
  }

  function paint() {
    const own = THEMES.filter((t) => t.eventType === inv.event_type);
    const others = THEMES.filter((t) => t.eventType !== inv.event_type);
    grid.replaceChildren(...[
      h('h2', { class: 'st-h2', text: `Tema ${typeLabel(inv.event_type)}` }), h('div', { class: 'st-themegrid' }, own.map(themeCard)),
      showAll ? h('h2', { class: 'st-h2', text: 'Tema jenis acara lain' }) : null,
      showAll ? h('div', { class: 'st-themegrid' }, others.map(themeCard)) : null,
    ].filter(Boolean));
    toggle.textContent = showAll ? 'Sembunyikan tema lain' : 'Tampilkan semua tema';
    const t = getTheme(selected);
    nameNow.textContent = t ? t.label : '';
    useBtn.replaceChildren(icon('check', { size: 16 }), h('span', { text: selected === saved.id ? 'Tema ini sedang dipakai' : 'Pakai tema ini' }));
    useBtn.disabled = selected === saved.id;
  }

  const root = h('div', { class: 'st-page' },
    h('div', { class: 'st-pagehead' }, h('div', {}, h('h1', { text: 'Template & amplop' }), h('p', { class: 'st-sub', text: `${slug} - pilih amplop dan suasana undangan. Pratinjau memutar dari amplop sampai akhir.` }))),
    h('div', { class: 'st-split2' },
      h('section', { class: 'st-panel' }, grid, h('div', { class: 'st-row' }, toggle)),
      h('aside', { class: 'st-panel st-previewcol' },
        h('div', { class: 'st-panelhead' }, h('h2', { text: 'Pratinjau Undangan' }), h('a', { class: 'st-iconbtn', href: src(selected), target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Buka pratinjau di tab baru' }, icon('expand', { size: 18 }))),
        iframe,
        h('div', { class: 'st-savebar' }, h('p', { class: 'st-sub' }, 'Terpilih: ', nameNow), useBtn, msg,
          h('a', { class: 'st-link', href: `#/editor/${slug}` }, 'Lanjut: isi undangan')))));
  paint();
  return root;
}
