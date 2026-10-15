import { h } from '../engine/dom.js';
import { KIND_LABELS } from '../engine/config.js';
import { safeUrl } from '../engine/content.js';
import { zonedIso, isoToLocal } from './api.js';
import { resizeToJpeg } from './images.js';
import { appearanceView } from './appearance.js';
import { icon } from './icons.js';

const TAB_ICON = { tampilan: 'palette', surat: 'mail', cover: 'image', kisah: 'book', detail: 'calendar', galeri: 'image', hari_acara: 'calendar', arsip: 'book', penutup: 'heart' };

/**
 * Editor "Isi undangan": satu tab per adegan. Setiap tab dibangun dari skema kecil, lalu
 * disimpan ke invitation_scenes.config (dijaga RLS: hanya pemilik). Tampilan tamu menyaring ulang semuanya.
 */
const T = (key, label, max, extra = {}) => ({ type: 'text', key, label, max, ...extra });
const A = (key, label, max, extra = {}) => ({ type: 'area', key, label, max, ...extra });
const L = (key, label, max, extra = {}) => ({ type: 'lines', key, label, max, ...extra });
const U = (key, label, extra = {}) => ({ type: 'url', key, label, ...extra });
const D = (key, label) => ({ type: 'datetime', key, label });
const N = (key, label, extra = {}) => ({ type: 'number', key, label, ...extra });
const R = (key, label, maxRows, fields) => ({ type: 'rows', key, label, maxRows, fields });

export const SCHEMAS = {
  surat: [T('greeting', 'Salam pembuka', 90), L('paragraphs', 'Isi surat (satu paragraf per baris, maks 5)', 400, { maxLines: 5 }), T('hosts', 'Tuan rumah / keluarga', 160), T('close', 'Salam penutup', 90), T('signature', 'Tanda tangan', 80)],
  cover: [T('tagline', 'Kalimat di bawah nama', 120), { type: 'check', key: 'countdown', label: 'Tampilkan hitung mundur', def: true }],
  kisah: [T('title', 'Judul', 80), R('items', 'Cerita', 8, [T('when', 'Waktu (mis. 2019)', 40), T('title', 'Judul', 80), A('text', 'Isi cerita', 400)])],
  detail: [R('events', 'Rangkaian acara', 6, [T('label', 'Nama acara (Akad, Resepsi)', 60), D('start', 'Mulai'), T('time', 'Jam (teks bebas, opsional)', 40), T('venue', 'Tempat', 100), T('address', 'Alamat', 200), U('mapUrl', 'Link peta (https)'), T('note', 'Catatan', 200), N('duration', 'Durasi (menit)', { min: 15, max: 720, def: 120 })]),
    T('dressCode', 'Busana', 120), L('notes', 'Catatan tambahan (satu per baris, maks 4)', 200, { maxLines: 4 })],
  galeri: [T('title', 'Judul', 80), { type: 'images', key: 'images', label: 'Foto', maxRows: 12 }],
  hari_acara: [R('rundown', 'Susunan acara hari H', 10, [T('time', 'Jam', 20), T('title', 'Kegiatan', 100), D('start', 'Mulai (untuk penanda "sekarang", opsional)')]), U('streamUrl', 'Link siaran langsung (YouTube/TikTok, https)')],
  arsip: [A('body', 'Ucapan terima kasih', 400), R('messages', 'Ucapan pilihan tamu', 6, [T('name', 'Nama', 60), A('text', 'Ucapan', 240)])],
  penutup: [T('title', 'Judul', 80), A('body', 'Doa / ucapan penutup', 500), T('sign', 'Salam', 60), T('signature', 'Tanda tangan', 80), T('hosts', 'Tuan rumah / keluarga', 160)],
};
export const EDITABLE = Object.keys(SCHEMAS);

/** Beri tahu editor bahwa isian berubah tanpa kejadian input asli (tambah/hapus baris, foto). */
const notify = (el) => el.dispatchEvent(new (el.ownerDocument.defaultView.Event)('input', { bubbles: true }));

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200);

/** Bangun kolom isian dari skema. read() mengembalikan { value, errors }. */
function buildFields(fields, data, ctx) {
  const parts = fields.map((f) => buildField(f, data ? data[f.key] : undefined, ctx));
  return {
    nodes: parts.map((p) => p.node),
    read() {
      const out = {};
      const errors = [];
      fields.forEach((f, i) => {
        const r = parts[i].read();
        errors.push(...r.errors);
        if (r.value !== undefined) out[f.key] = r.value;
      });
      return { value: out, errors };
    },
  };
}

function wrap(label, control) {
  return h('label', { class: 's-field' }, h('span', { text: label }), control);
}

function buildField(f, val, ctx) {
  switch (f.type) {
    case 'text': case 'url': {
      const el = h('input', { class: 's-input', type: f.type === 'url' ? 'url' : 'text', maxlength: String(f.max || 200), value: val || '', placeholder: f.type === 'url' ? 'https://' : '' });
      return { node: wrap(f.label, el), read: () => {
        const v = f.type === 'url' ? el.value.trim() : clean(el.value, f.max);
        if (!v) return { value: undefined, errors: [] };
        if (f.type === 'url') return safeUrl(v) ? { value: safeUrl(v), errors: [] } : { value: undefined, errors: [`${f.label}: hanya link https yang diterima.`] };
        return { value: v, errors: [] };
      } };
    }
    case 'area': {
      const el = h('textarea', { class: 's-input', rows: '3', maxlength: String(f.max || 400) });
      el.value = val || '';
      return { node: wrap(f.label, el), read: () => ({ value: clean(el.value, f.max) || undefined, errors: [] }) };
    }
    case 'lines': {
      const el = h('textarea', { class: 's-input', rows: '4' });
      el.value = Array.isArray(val) ? val.join('\n') : '';
      return { node: wrap(f.label, el), read: () => {
        const lines = el.value.split('\n').map((l) => clean(l, f.max)).filter(Boolean);
        if (lines.length > (f.maxLines || 5)) return { value: undefined, errors: [`${f.label}: maksimal ${f.maxLines || 5} baris.`] };
        return { value: lines.length ? lines : undefined, errors: [] };
      } };
    }
    case 'check': {
      const el = h('input', { type: 'checkbox' });
      el.checked = val === undefined ? f.def !== false : val !== false;
      return { node: h('label', { class: 's-field s-check' }, el, h('span', { text: f.label })), read: () => ({ value: el.checked === (f.def !== false) ? undefined : el.checked, errors: [] }) };
    }
    case 'number': {
      const el = h('input', { class: 's-input', type: 'number', min: String(f.min || 0), max: String(f.max || 1000), value: val || '' });
      return { node: wrap(f.label, el), read: () => {
        const n = Number(el.value);
        return { value: el.value && Number.isFinite(n) ? Math.min(f.max || 1000, Math.max(f.min || 0, Math.round(n))) : undefined, errors: [] };
      } };
    }
    case 'datetime': {
      const el = h('input', { class: 's-input', type: 'datetime-local', value: val ? isoToLocal(val, ctx.tz) : '' });
      return { node: wrap(`${f.label} (zona ${ctx.tz})`, el), read: () => {
        if (!el.value) return { value: undefined, errors: [] };
        const iso = zonedIso(el.value, ctx.tz);
        return iso ? { value: iso, errors: [] } : { value: undefined, errors: [`${f.label}: tanggal tidak valid.`] };
      } };
    }
    case 'rows': return buildRows(f, val, ctx);
    case 'images': return buildImages(f, val, ctx);
    default: return { node: h('span'), read: () => ({ value: undefined, errors: [] }) };
  }
}

function buildRows(f, val, ctx) {
  const box = h('div', { class: 's-rows' });
  const rows = [];
  const addBtn = h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Tambah' });
  function add(data) {
    if (rows.length >= f.maxRows) return;
    const sub = buildFields(f.fields, data, ctx);
    const rm = h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Hapus' });
    const row = h('div', { class: 's-row-card' }, ...sub.nodes, rm);
    const entry = { row, sub };
    rm.addEventListener('click', () => { rows.splice(rows.indexOf(entry), 1); row.remove(); addBtn.disabled = false; notify(box); });
    rows.push(entry);
    box.append(row);
    addBtn.disabled = rows.length >= f.maxRows;
  }
  addBtn.addEventListener('click', () => { add({}); notify(box); });
  (Array.isArray(val) ? val : []).slice(0, f.maxRows).forEach(add);
  return {
    node: h('div', { class: 's-group' }, h('strong', { text: f.label }), box, addBtn),
    read() {
      const errors = [];
      const items = rows.map((r) => { const x = r.sub.read(); errors.push(...x.errors); return x.value; }).filter((v) => Object.keys(v).length);
      return { value: items.length ? items : undefined, errors };
    },
  };
}

/** Foto galeri: unggah dari ponsel (dikecilkan, ke bucket media) atau tempel link https; urutan bisa digeser. */
function buildImages(f, val, ctx) {
  const items = (Array.isArray(val) ? val : []).filter((i) => i && safeUrl(i.src)).map((i) => ({ src: safeUrl(i.src), caption: i.caption || '', alt: i.alt || '' }));
  const list = h('div', { class: 's-rows' });
  const msg = h('small', { class: 's-msg', role: 'status', 'aria-live': 'polite' });
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, class: 's-input' });
  const url = h('input', { class: 's-input', type: 'url', placeholder: 'atau tempel link foto https://...' });
  function paint(quiet) {
    if (!quiet) notify(list);
    list.replaceChildren(...items.map((it, i) => {
      const cap = h('input', { class: 's-input', type: 'text', maxlength: '120', placeholder: 'Keterangan foto', value: it.caption });
      cap.addEventListener('input', () => { it.caption = cap.value; });
      return h('div', { class: 's-row-card s-photo' },
        h('img', { src: it.src, alt: it.alt || 'Foto galeri', loading: 'lazy', referrerpolicy: 'no-referrer' }), cap,
        h('div', { class: 's-row' },
          h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Naik', disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; paint(); } }),
          h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Turun', disabled: i === items.length - 1, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; paint(); } }),
          h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Hapus', onclick: () => { items.splice(i, 1); paint(); } })));
    }));
  }
  file.addEventListener('change', async () => {
    for (const f1 of Array.from(file.files || [])) {
      if (items.length >= f.maxRows) { msg.textContent = `Maksimal ${f.maxRows} foto.`; break; }
      msg.textContent = `Mengunggah ${f1.name}...`;
      try {
        const blob = await resizeToJpeg(f1);
        const src = await ctx.client.uploadImage(ctx.slug, blob);
        items.push({ src, caption: '', alt: '' });
        paint();
        msg.textContent = '';
      } catch (e) { msg.textContent = e.message; }
    }
    file.value = '';
  });
  url.addEventListener('change', () => {
    const v = safeUrl(url.value.trim());
    if (!url.value.trim()) return;
    if (!v) { msg.textContent = 'Hanya link https yang diterima.'; return; }
    if (items.length >= f.maxRows) { msg.textContent = `Maksimal ${f.maxRows} foto.`; return; }
    items.push({ src: v, caption: '', alt: '' });
    url.value = '';
    msg.textContent = '';
    paint();
  });
  paint(true);
  return {
    node: h('div', { class: 's-group' }, h('strong', { text: `${f.label} (maks ${f.maxRows})` }), list, wrap('Unggah dari galeri ponsel', file), url, msg),
    read: () => ({ value: items.length ? items.map((i) => ({ src: i.src, caption: clean(i.caption, 120) || undefined, alt: clean(i.caption, 120) || undefined })) : undefined, errors: [] }),
  };
}

/** Halaman editor + pratinjau langsung: undangan asli di dalam bingkai, mengikuti ketikan. */
export function editorView({ client, slug, inviteBase, onBack }) {
  const root = h('div', { class: 's-card s-wide', 'data-pane': 'edit' });
  const msg = h('p', { class: 's-msg', role: 'status', 'aria-live': 'polite', text: 'Memuat...' });
  const tabs = h('div', { class: 's-tabs', role: 'tablist' });
  const body = h('div', { class: 's-editor' });
  const base = String(inviteBase || '').replace(/\/+$/, '');
  const frameSrc = `${base}/?slug=${encodeURIComponent(slug)}&preview=1&frame=1&to=${encodeURIComponent('Tamu Undangan')}`;
  const link = `${base}/?slug=${encodeURIComponent(slug)}&preview=1`;
  let frameOrigin = '*';
  try { frameOrigin = new URL(frameSrc, location.href).origin; } catch { /* pakai '*' hanya bila alamat tak terbaca */ }

  const iframe = h('iframe', { class: 's-frame', title: 'Pratinjau undangan', src: frameSrc, sandbox: 'allow-scripts allow-same-origin allow-popups', referrerpolicy: 'no-referrer' });
  const note = h('p', { class: 's-sub s-pvnote', role: 'status', 'aria-live': 'polite' });
  const seg = h('div', { class: 's-seg', role: 'group', 'aria-label': 'Tampilan' });
  const setPane = (p) => {
    root.dataset.pane = p;
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.pane === p));
    if (p === 'preview') sendDraft();
  };
  seg.append(
    h('button', { class: 's-btn s-small s-ghost', type: 'button', 'data-pane': 'edit', onclick: () => setPane('edit') }, icon('pencil', { size: 16 }), h('span', { text: 'Edit' })),
    h('button', { class: 's-btn s-small s-ghost', type: 'button', 'data-pane': 'preview', onclick: () => setPane('preview') }, icon('eye', { size: 16 }), h('span', { text: 'Pratinjau' })));

  root.append(h('div', { class: 's-row s-between' }, h('h1', { text: 'Isi undangan' }), h('button', { class: 's-link', type: 'button', text: 'Kembali', onclick: onBack })),
    h('p', { class: 's-sub s-subline' }, `${slug} - `, h('a', { href: link, target: '_blank', rel: 'noopener noreferrer', class: 's-link' }, icon('eye', { size: 14 }), ' Buka di tab baru')),
    seg, tabs,
    h('div', { class: 's-split' },
      h('div', { class: 's-editpane' }, body, msg),
      h('div', { class: 's-previewpane' },
        h('div', { class: 's-pvhead' }, h('h2', { text: 'Pratinjau Undangan' }), h('a', { class: 'st-iconbtn', href: link, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Buka pratinjau di tab baru' }, icon('expand', { size: 18 }))),
        note, iframe)));

  /* --- pesan ke/dari bingkai pratinjau --- */
  let ready = false;
  let queued = null;
  let draft = null;
  let timer = null;
  const post = (m) => { if (!ready) { queued = m; return; } try { iframe.contentWindow.postMessage(m, frameOrigin); } catch { /* bingkai belum siap */ } };
  function sendDraft() { if (draft) post(draft()); }
  const onFrame = (e) => {
    if (!root.isConnected) { window.removeEventListener('message', onFrame); return; }
    if (e.source !== iframe.contentWindow || (frameOrigin !== '*' && e.origin !== frameOrigin)) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'orbit-preview:ready') { ready = true; if (queued) { const m = queued; queued = null; post(m); } else sendDraft(); }
    if (d.type === 'orbit-preview:scene' && d.skipped) note.textContent = 'Adegan ini belum ada isinya, jadi belum tampil untuk tamu.';
    if (d.type === 'orbit-preview:scene' && !d.skipped) note.textContent = '';
  };
  window.addEventListener('message', onFrame);

  (async () => {
    const [inv0, scenes] = await Promise.all([client.invitationOf(slug), client.scenesOf(slug)]);
    if (!inv0) throw new Error('Undangan tidak ditemukan.');
    let inv = inv0;
    const tz = (inv.extra && inv.extra.tz) || 'Asia/Jakarta';
    const byKind = new Map((scenes || []).map((s) => [s.kind, s]));
    const ctx = { client, slug, tz };
    const buttons = new Map();

    function openAppearance() {
      for (const [k, b] of buttons) b.setAttribute('aria-selected', String(k === 'tampilan'));
      const ap = appearanceView({
        client, slug, inv,
        send: () => { clearTimeout(timer); timer = setTimeout(sendDraft, 300); },
        onChange: () => { root.dataset.dirty = '1'; },
        onSaved: (s) => { delete root.dataset.dirty; inv = { ...inv, extra: { ...(inv.extra || {}), style: s || undefined } }; },
        setMsg: (m) => { msg.textContent = m; },
      });
      draft = () => ({ type: 'orbit-preview:style', style: ap.current() });
      body.replaceChildren(ap.node);
      msg.textContent = '';
      note.textContent = '';
      sendDraft();
    }

    function open(kind) {
      if (kind === 'tampilan') return openAppearance();
      for (const [k, b] of buttons) b.setAttribute('aria-selected', String(k === kind));
      const existing = byKind.get(kind) || { kind, active: true, config: {} };
      const config = existing.config && typeof existing.config === 'object' ? existing.config : {};
      const form = buildFields(SCHEMAS[kind], config, ctx);
      const active = h('input', { type: 'checkbox' });
      active.checked = existing.active !== false;
      const save = h('button', { class: 's-btn s-savebtn', type: 'submit' }, icon('save', { size: 17 }), h('span', { text: 'Simpan perubahan' }));
      const el = h('form', { class: 's-grid', novalidate: true }, h('label', { class: 's-field s-check' }, active, h('span', { text: `Tampilkan adegan ${KIND_LABELS[kind] || kind}` })), ...form.nodes, save);
      // pertahankan kunci lain di config (mis. warna dari editor lain) yang tidak ada di skema
      const keep = Object.fromEntries(Object.entries(config).filter(([k]) => !SCHEMAS[kind].some((f) => f.key === k)));
      draft = () => {
        const r = form.read();
        return { type: 'orbit-preview:draft', kind, config: { ...keep, ...r.value }, active: active.checked };
      };
      const onEdit = () => { root.dataset.dirty = '1'; clearTimeout(timer); timer = setTimeout(sendDraft, 450); };
      el.addEventListener('input', onEdit);
      el.addEventListener('change', onEdit);
      el.addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = form.read();
        if (r.errors.length) { msg.textContent = r.errors[0]; return; }
        save.disabled = true;
        msg.textContent = 'Menyimpan...';
        try {
          await client.saveScene(slug, kind, { config: { ...keep, ...r.value }, active: active.checked });
          byKind.set(kind, { ...existing, config: { ...keep, ...r.value }, active: active.checked });
          delete root.dataset.dirty;
          msg.textContent = 'Tersimpan.';
        } catch (err) { msg.textContent = err.message; }
        save.disabled = false;
      });
      body.replaceChildren(el);
      msg.textContent = '';
      note.textContent = '';
      sendDraft();
    }

    for (const kind of ['tampilan', ...EDITABLE]) {
      const b = h('button', { class: 's-tab', type: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => {
        if (root.dataset.dirty === '1' && !byKind.__warned) { /* pindah tab tidak menghapus isian: dibiarkan */ }
        open(kind);
      } }, icon(TAB_ICON[kind] || 'pencil', { size: 15 }), h('span', { text: kind === 'tampilan' ? 'Tampilan' : (KIND_LABELS[kind] || kind) }));
      buttons.set(kind, b);
      tabs.append(b);
    }
    setPane('edit');
    open('surat');
  })().catch((e) => { msg.textContent = e.message; });
  return root;
}
