import qrcode from 'qrcode-generator';
import { h } from '../engine/dom.js';

/**
 * Kode QR dibuat sepenuhnya di peramban (tanpa layanan luar, tautan tamu tidak keluar dari perangkat).
 * Tingkat koreksi M: tetap terbaca walau kertas sedikit kotor atau tergores.
 */
const NS = 'http://www.w3.org/2000/svg';

export function qrMatrix(text, level = 'M') {
  const qr = qrcode(0, level);
  qr.addData(String(text));
  qr.make();
  return { size: qr.getModuleCount(), dark: (r, c) => qr.isDark(r, c) };
}

/** SVG berisi satu path (garis-garis modul gelap), latar putih, margin 4 modul sesuai standar. */
export function qrSvg(text, { margin = 4, level = 'M', label = 'Kode QR undangan' } = {}) {
  const m = qrMatrix(text, level);
  const total = m.size + margin * 2;
  let d = '';
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (!m.dark(r, c)) continue;
      let run = 1;
      while (c + run < m.size && m.dark(r, c + run)) run++;
      d += `M${c + margin} ${r + margin}h${run}v1h-${run}z`;
      c += run - 1;
    }
  }
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', String(total)); bg.setAttribute('height', String(total)); bg.setAttribute('fill', '#ffffff');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d); p.setAttribute('fill', '#000000');
  svg.append(bg, p);
  return svg;
}

/** PNG tajam untuk dicetak: ukuran kelipatan bulat jumlah modul agar tepi tidak buram. */
export async function qrPng(text, { size = 1024, margin = 4, level = 'M' } = {}) {
  const m = qrMatrix(text, level);
  const total = m.size + margin * 2;
  const cell = Math.max(1, Math.floor(size / total));
  const px = cell * total;
  const canvas = document.createElement('canvas');
  canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000';
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Gambar QR tidak bisa dibuat.');
  return blob;
}

const fileName = (s) => String(s || 'undangan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'undangan';

/** Panel siap pakai: pratinjau, unduh PNG, bagikan. caption muncul di bawah kode (mis. nama tamu). */
export function qrPanel({ url, caption, name, onError = () => {} }) {
  const base = fileName(name || caption);
  const png = () => qrPng(url);
  const download = h('button', { class: 's-btn s-small', type: 'button', text: 'Unduh PNG', onclick: async () => {
    try {
      const blob = await png();
      const href = URL.createObjectURL(blob);
      const a = h('a', { href, download: `qr-${base}.png` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
    } catch (e) { onError(e.message); }
  } });
  const share = (typeof navigator !== 'undefined' && navigator.share) ? h('button', { class: 's-btn s-small s-ghost', type: 'button', text: 'Bagikan', onclick: async () => {
    try {
      const data = { title: caption || 'Undangan', text: caption ? `Undangan untuk ${caption}` : 'Undangan', url };
      const file = new File([await png()], `qr-${base}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
      await navigator.share(data);
    } catch (e) { if (e && e.name !== 'AbortError') onError(e.message); }
  } }) : null;
  return h('div', { class: 's-qr' }, qrSvg(url, { label: caption ? `Kode QR untuk ${caption}` : 'Kode QR undangan' }),
    caption ? h('strong', { text: caption }) : null,
    h('div', { class: 's-row' }, download, share));
}
