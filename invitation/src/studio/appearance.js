import { h } from '../engine/dom.js';
import { COLOR_FIELDS, FONT_CHOICES, sanitizeStyle, deriveTokens, normHex, loadFonts } from '../engine/style.js';
import { resolveTheme } from '../themes/index.js';
import { resizeToJpeg } from './images.js';
import { paletteFromImage } from './palette.js';

const fontStack = (id) => (FONT_CHOICES.find((f) => f.id === id) || {}).stack || 'inherit';

/**
 * Tab "Tampilan": 4 warna, 2 font, foto sampul. Semua kontras dijaga otomatis oleh deriveTokens, jadi
 * pelanggan bebas memilih tanpa merusak keterbacaan; efek 3D mengikuti warna pilihannya.
 */
export function appearanceView({ client, slug, inv, send, onChange, onSaved, setMsg }) {
  const theme = resolveTheme(inv.theme, inv.event_type);
  const saved = sanitizeStyle(inv.extra && inv.extra.style) || {};
  const state = {
    colors: { ...(saved.colors || {}) },
    fonts: { ...(saved.fonts || {}) },
    cover: saved.cover ? { ...saved.cover } : null,
  };
  const shown = (key) => state.colors[key] || theme.tokens[key];

  const notes = h('ul', { class: 's-notes', 'aria-live': 'polite' });
  const current = () => sanitizeStyle({ colors: state.colors, fonts: state.fonts, cover: state.cover });

  function refresh({ silent } = {}) {
    const d = deriveTokens(theme.tokens, state.colors);
    notes.replaceChildren(...d.notes.map((n) => h('li', { text: n })));
    loadFonts({ fonts: state.fonts });
    for (const k of ['display', 'body']) samples[k].style.fontFamily = fontStack(state.fonts[k]);
    if (!silent) { send(); onChange(); }
  }

  /* --- warna --- */
  const rows = new Map();
  const colorRows = COLOR_FIELDS.map((f) => {
    const picker = h('input', { type: 'color', class: 's-color', 'aria-label': f.label, value: shown(f.key) });
    const text = h('input', { type: 'text', class: 's-input s-hex', maxlength: '7', value: shown(f.key), 'aria-label': `${f.label} (kode warna)`, spellcheck: 'false' });
    const set = (c) => { state.colors[f.key] = c; picker.value = c; text.value = c; refresh(); };
    picker.addEventListener('input', () => set(picker.value));
    text.addEventListener('change', () => { const c = normHex(text.value); if (c) set(c); else text.value = shown(f.key); });
    rows.set(f.key, { picker, text });
    return h('div', { class: 's-colorrow' }, h('div', {}, h('strong', { text: f.label }), h('small', { text: f.hint })), picker, text);
  });
  const setAllColors = (c) => { for (const f of COLOR_FIELDS) { state.colors[f.key] = c[f.key]; rows.get(f.key).picker.value = c[f.key]; rows.get(f.key).text.value = c[f.key]; } refresh(); };

  const palFile = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 's-input', 'aria-label': 'Foto untuk diambil warnanya' });
  palFile.addEventListener('change', async () => {
    const f = palFile.files && palFile.files[0];
    if (!f) return;
    setMsg('Membaca warna foto...');
    try { setAllColors(await paletteFromImage(f)); setMsg('Warna diambil dari foto. Ubah satuan bila perlu.'); } catch (e) { setMsg(e.message); }
    palFile.value = '';
  });

  /* --- font --- */
  const samples = {};
  const fontField = (key, label, sampleText) => {
    const sel = h('select', { class: 's-input', 'aria-label': label },
      h('option', { value: '', text: 'Ikut tema' }), ...FONT_CHOICES.map((f) => h('option', { value: f.id, text: `${f.id} - ${f.kind}` })));
    sel.value = state.fonts[key] || '';
    samples[key] = h('p', { class: 's-sample', text: sampleText });
    sel.addEventListener('change', () => { if (sel.value) state.fonts[key] = sel.value; else delete state.fonts[key]; refresh(); });
    return h('label', { class: 's-field' }, h('span', { text: label }), sel, samples[key]);
  };

  /* --- sampul --- */
  const thumb = h('div', { class: 's-thumb', hidden: !state.cover });
  const dim = h('input', { type: 'range', min: '30', max: '80', step: '5', value: String(Math.round(((state.cover && state.cover.dim) || 0.5) * 100)), 'aria-label': 'Gelap lapisan foto' });
  const paintCover = () => {
    thumb.hidden = !state.cover;
    thumb.replaceChildren(...(state.cover ? [h('img', { src: state.cover.image, alt: 'Foto sampul', referrerpolicy: 'no-referrer' }),
      h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Hapus foto', onclick: () => { state.cover = null; paintCover(); refresh(); } })] : []));
  };
  const setCover = (image) => { state.cover = { image, dim: Number(dim.value) / 100 }; paintCover(); refresh(); };
  dim.addEventListener('input', () => { if (state.cover) { state.cover.dim = Number(dim.value) / 100; refresh(); } });
  const coverFile = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 's-input', 'aria-label': 'Unggah foto sampul' });
  coverFile.addEventListener('change', async () => {
    const f = coverFile.files && coverFile.files[0];
    if (!f) return;
    setMsg('Mengunggah foto sampul...');
    try { setCover(await client.uploadImage(slug, await resizeToJpeg(f))); setMsg(''); } catch (e) { setMsg(e.message); }
    coverFile.value = '';
  });
  const coverUrl = h('input', { type: 'url', class: 's-input', placeholder: 'atau tempel link foto https://...', 'aria-label': 'Link foto sampul' });
  coverUrl.addEventListener('change', () => {
    const v = coverUrl.value.trim();
    if (!v) return;
    const ok = sanitizeStyle({ cover: { image: v } });
    if (!ok) { setMsg('Hanya link https yang diterima.'); return; }
    setCover(ok.cover.image); coverUrl.value = ''; setMsg('');
  });
  paintCover();

  /* --- simpan / kembalikan --- */
  const save = h('button', { class: 's-btn', type: 'button', text: 'Simpan tampilan', onclick: async () => {
    save.disabled = true; setMsg('Menyimpan...');
    try { const s = await client.saveStyle(slug, current()); onSaved(s); setMsg('Tampilan tersimpan.'); } catch (e) { setMsg(e.message); }
    save.disabled = false;
  } });
  const reset = h('button', { class: 's-btn s-ghost', type: 'button', text: 'Kembalikan ke tema', onclick: () => {
    state.colors = {}; state.fonts = {}; state.cover = null;
    for (const f of COLOR_FIELDS) { rows.get(f.key).picker.value = theme.tokens[f.key]; rows.get(f.key).text.value = theme.tokens[f.key]; }
    for (const sel of node.querySelectorAll('select')) sel.value = '';
    paintCover(); refresh();
  } });

  const node = h('div', { class: 's-grid s-appearance' },
    h('p', { class: 's-sub', text: `Dasar: tema ${theme.label}. Pilih bebas; kontras tulisan dijaga otomatis dan efek 3D ikut berwarna sama.` }),
    h('div', { class: 's-group' }, h('h2', { text: 'Warna' }), ...colorRows, notes,
      h('label', { class: 's-field' }, h('span', { text: 'Ambil warna dari foto (opsional)' }), palFile)),
    h('div', { class: 's-group' }, h('h2', { text: 'Font' }), fontField('display', 'Font judul dan nama', 'Dimas & Rani'), fontField('body', 'Font isi surat', 'Dengan segala kerendahan hati, kami mengundang Anda.')),
    h('div', { class: 's-group' }, h('h2', { text: 'Foto sampul' }), thumb, h('label', { class: 's-field' }, h('span', { text: 'Gelap lapisan foto (agar nama terbaca)' }), dim), coverFile, coverUrl),
    h('div', { class: 's-row' }, save, reset));
  refresh({ silent: true });
  return { node, current };
}
