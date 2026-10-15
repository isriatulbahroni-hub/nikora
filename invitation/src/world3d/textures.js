import * as THREE from 'three';
import { PEONY, FLAP_PTS } from './designs.js';

export const DEFAULT_CONTENT = {
  title: 'Rani & Dimas', eyebrow: 'UNDANGAN PERNIKAHAN', mono: 'R·D',
  lead: 'Dengan penuh rasa syukur, kami mengundang Anda untuk hadir', date: 'SABTU, 12 DESEMBER 2026',
};

/** Pecah teks menjadi baris selebar max (measure = fungsi pengukur lebar). Lebih dari maxLines dipotong dengan "…". */
export function wrapLines(measure, text, max, maxLines = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (!cur || measure(t) <= max) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  let last = lines.slice(maxLines - 1).join(' ');
  while (last.length > 1 && measure(`${last}…`) > max) last = last.slice(0, -1);
  return [...lines.slice(0, maxLines - 1), `${last.trimEnd()}…`];
}

/**
 * Kalimat pembuka surat: kecilkan huruf bertahap (dan boleh bertambah baris) sampai SELURUH teks muat.
 * Memotong dengan "…" hanya jalan terakhir untuk teks yang benar-benar sangat panjang.
 * measureAt(teks, ukuran) -> lebar dalam satuan kanvas.
 */
export function fitLead(measureAt, text, max) {
  const plan = [[14, 3], [13, 3], [12, 4], [11, 4], [10, 5]];
  for (const [size, n] of plan) {
    const lines = wrapLines((t) => measureAt(t, size), text, max, 99);
    if (lines.length <= n) return { size, lines, lh: size * 1.22, cut: false };
  }
  const [size, n] = plan[plan.length - 1];
  return { size, lines: wrapLines((t) => measureAt(t, size), text, max, n), lh: size * 1.22, cut: true };
}

/** Ukuran huruf terbesar (<= base) agar teks muat dalam lebar max. */
export const fitSize = (measureAt, base, max) => { const w = measureAt(base); return w <= max ? base : Math.max(base * .45, base * max / w); };

/* Setiap permukaan = dua kanvas: warna (albedo) + ORM (G=kekasaran, B=logam).
   Foil emas digambar ke keduanya sehingga memantulkan cahaya seperti logam sungguhan. */
const GOLD = [[0, '#8a6420'], [.28, '#f3d985'], [.5, '#b8892f'], [.72, '#fff1b8'], [1, '#8f6a22']];
const METAL = 'rgb(0,95,255)', ROUGH = 'rgb(0,205,0)';

function layer(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const m = document.createElement('canvas'); m.width = w; m.height = h;
  const y = m.getContext('2d'); y.fillStyle = ROUGH; y.fillRect(0, 0, w, h);
  return { c, x: c.getContext('2d'), m, y, w, h };
}
const goldPaint = (L) => { const g = L.x.createLinearGradient(0, 0, L.w, L.h * 1.2); GOLD.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
const both = (L, fn) => { fn(L.x, goldPaint(L)); fn(L.y, METAL); };
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}
/** Peta timbul serat kertas: abu-abu 128 dengan goresan tipis acak (deterministik). */
function fibers(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); if (!x) return null;
  x.fillStyle = '#808080'; x.fillRect(0, 0, w, h);
  let seed = 91; const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < Math.floor(w * h / 260); i++) {
    const px = r() * w, py = r() * h, len = 6 + r() * 22, a = r() * 6.283;
    x.strokeStyle = r() < .5 ? 'rgba(255,255,255,.30)' : 'rgba(0,0,0,.30)'; x.lineWidth = .8 + r() * .8;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
  }
  return c;
}
const pair = (L, paper = false) => {
  const out = { map: tex(L.c), mr: tex(L.m, false) };
  if (paper) { const f = fibers(Math.max(2, L.w >> 1), Math.max(2, L.h >> 1)); if (f) out.bump = tex(f, false); }
  return out;
};

/* ---------- ornamen ---------- */
function corner(ctx, paint, x, y, rot, sc, k) {
  ctx.save(); ctx.translate(x * k, y * k); ctx.rotate(rot * Math.PI / 180); ctx.scale(sc * k, sc * k);
  ctx.strokeStyle = paint; ctx.fillStyle = paint; ctx.lineCap = 'round';
  ctx.lineWidth = 1.5; ctx.stroke(new Path2D('M2 78V32C2 14 14 2 32 2H78'));
  ctx.lineWidth = .8; ctx.stroke(new Path2D('M10 78V36C10 22 22 10 36 10H78'));
  ctx.lineWidth = 1.5; ctx.stroke(new Path2D('M18 44C18 30 30 18 44 18C54 18 56 30 46 33C38 35 36 26 43 25'));
  for (const [cx, cy] of [[2, 78], [78, 2]]) { ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, 6.283); ctx.fill(); }
  ctx.fill(new Path2D('M48 48q9-16 24-13-7 14-24 13z')); ctx.fill(new Path2D('M28 62q-16-9-13-24 14 7 13 24z'));
  ctx.restore();
}
function peony(ctx, cx, cy, s, p, k) {
  cx *= k; cy *= k; s *= k;
  const ell = (rx, ry, col, rot, tr, a = 1) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot * Math.PI / 180); ctx.translate(tr, 0); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 6.283); ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(120,40,60,.16)'; ctx.lineWidth = .6 * k; ctx.stroke(); ctx.restore(); };
  for (const a of [15, 75, 140, 200, 265, 325]) ell(s * .6, s * .21, p.l, a, s * .95, .92);
  const ring = (n, r, rx, ry, c, off) => { for (let i = 0; i < n; i++) ell(rx, ry, c, off + i * 360 / n, r); };
  ring(8, s * .62, s * .44, s * .31, p.o, 0); ring(7, s * .42, s * .35, s * .27, p.m, 22); ring(6, s * .24, s * .26, s * .2, p.i, 8);
  ctx.beginPath(); ctx.arc(cx, cy, s * .11, 0, 6.283); ctx.fillStyle = p.c; ctx.fill();
}
const GAP = 'M4 90V58H9V48H15V38H21V28H28V18H36V10H44V4H50V90Z';
function gapura(ctx, paint, x, y, s, k) {
  ctx.save(); ctx.translate(x * k, y * k); ctx.scale(s * k, s * k); ctx.fillStyle = paint;
  ctx.fill(new Path2D(GAP)); ctx.translate(120, 0); ctx.scale(-1, 1); ctx.fill(new Path2D(GAP)); ctx.restore();
}
function starTile(ctx, k, col, a, w, h) {
  const P = new Path2D('M22 3l4.6 10.2L37 8.6 32.4 19l10.6 3-10.6 3 4.6 10.4-10.4-4.6L22 41l-4.6-10.2L7 35.4 11.6 25 1 22l10.6-3L7 8.6l10.4 4.6z');
  ctx.save(); ctx.scale(k, k); ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineWidth = 1;
  for (let gx = 0; gx < w; gx += 44) for (let gy = 0; gy < h; gy += 44) { ctx.save(); ctx.translate(gx, gy); ctx.stroke(P); ctx.restore(); }
  ctx.restore();
}
function paintPattern(L, d, k, w, h) {
  const p = d.pattern, x = L.x; x.save(); x.scale(k, k);
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  if (p.kind === 'diamond') { for (let gx = 0; gx < w + 22; gx += 22) for (let gy = 0; gy < h + 22; gy += 22) { x.fillStyle = rgba(p.color, p.a); x.beginPath(); x.arc(gx + 11, gy + 11, 1.1, 0, 6.283); x.fill(); x.strokeStyle = rgba(p.color, p.a * .35); x.beginPath(); x.moveTo(gx + 11, gy + 3); x.lineTo(gx + 19, gy + 11); x.lineTo(gx + 11, gy + 19); x.lineTo(gx + 3, gy + 11); x.closePath(); x.stroke(); } }
  else if (p.kind === 'diag') { x.rotate(35 * Math.PI / 180); x.strokeStyle = rgba(p.color, p.a); x.lineWidth = 3; for (let i = -400; i < 600; i += 8) { x.beginPath(); x.moveTo(-100, i); x.lineTo(700, i); x.stroke(); } }
  else if (p.kind === 'wood') { x.rotate(28 * Math.PI / 180); for (let i = -400; i < 600; i += 26) { x.strokeStyle = rgba('#ffffff', p.a); x.lineWidth = 2; x.beginPath(); x.moveTo(-100, i); x.lineTo(700, i); x.stroke(); x.strokeStyle = 'rgba(0,0,0,.14)'; x.lineWidth = 3; x.beginPath(); x.moveTo(-100, i + 13); x.lineTo(700, i + 13); x.stroke(); } }
  else if (p.kind === 'speck') { x.fillStyle = rgba(p.color, p.a); for (let gx = 0; gx < w; gx += 6) for (let gy = 0; gy < h; gy += 6) { x.beginPath(); x.arc(gx + 3, gy + 3, .6, 0, 6.283); x.fill(); } }
  else if (p.kind === 'kawung') { x.strokeStyle = rgba(p.color, p.a); x.lineWidth = 1; for (let gx = 0; gx < w + 40; gx += 40) for (let gy = 0; gy < h + 40; gy += 40) { for (const [cx, cy, rx, ry] of [[20, 10, 8, 10], [20, 30, 8, 10], [10, 20, 10, 8], [30, 20, 10, 8]]) { x.beginPath(); x.ellipse(gx + cx, gy + cy, rx, ry, 0, 0, 6.283); x.stroke(); } } }
  else if (p.kind === 'lattice') { x.rotate(45 * Math.PI / 180); x.strokeStyle = rgba(p.color, p.a); x.lineWidth = 1; for (let i = -400; i < 600; i += 15) { x.beginPath(); x.moveTo(-100, i); x.lineTo(700, i); x.moveTo(i, -100); x.lineTo(i, 700); x.stroke(); } }
  else if (p.kind === 'star') { x.restore(); starTile(x, k, p.color, p.a, w, h); starTile(L.y, k, '#0060ff', p.a, w, h); return; }
  x.restore();
}

/* ---------- permukaan ---------- */
export function pocketTextures(d, c = DEFAULT_CONTENT) {
  const k = 2.5, w = 440 * k, h = 290 * k, L = layer(w, h), x = L.x;
  x.fillStyle = d.body; x.fillRect(0, 0, w, h);
  paintPattern(L, d, k, 440, 290);
  let g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(0,0,0,.2)'); g.addColorStop(.38, 'rgba(0,0,0,0)'); g.addColorStop(.62, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.2)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  g = x.createLinearGradient(0, h, 0, h * .45); g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.lineJoin = 'round'; x.strokeStyle = 'rgba(0,0,0,.4)'; x.lineWidth = 2.4 * k; x.beginPath(); x.moveTo(0, h); x.lineTo(w / 2, h * .42); x.lineTo(w, h); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.24)'; x.lineWidth = 1.1 * k; x.beginPath(); x.moveTo(0, h - 3 * k); x.lineTo(w / 2, h * .42 - 3 * k); x.lineTo(w, h - 3 * k); x.stroke();
  (d.pocketCorners || []).forEach(c => both(L, (ctx, p) => corner(ctx, p, ...c, k)));
  (d.pocketFlowers || []).forEach(f => peony(x, f[0], f[1], f[2], PEONY[f[3]], k));
  if (d.pkName) both(L, (ctx, p) => { const sz = fitSize((b) => { ctx.font = `${b * k}px GV`; return ctx.measureText(c.title).width / k; }, 22, 230); ctx.font = `${sz * k}px GV`; ctx.textAlign = 'center'; ctx.fillStyle = p; ctx.fillText(c.title, 220 * k, 272 * k); });
  return pair(L, true);
}

export function flapFrontTextures(d) {
  const k = 2.5, w = 440 * k, h = 174 * k, L = layer(w, h), x = L.x;
  x.fillStyle = d.body; x.fillRect(0, 0, w, h);
  paintPattern(L, d, k, 440, 174);
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(0,0,0,.22)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  if (d.edge) { const pts = FLAP_PTS[d.flap]; both(L, (ctx, p) => { ctx.strokeStyle = p; ctx.lineWidth = 1.7 * k; ctx.lineJoin = 'round'; ctx.beginPath(); pts.slice(1).concat([pts[0]]).forEach(([px, py], i) => { const X = px / 100 * w, Y = py / 100 * h; i ? ctx.lineTo(X + (px === 0 ? 2 : px === 100 ? -2 : 0) * k, Y - (py === 100 ? 3 : 0) * k) : ctx.moveTo(X - 2 * k, Y); }); ctx.stroke(); }); }
  (d.flapCorners || []).forEach(c => both(L, (ctx, p) => corner(ctx, p, ...c, k)));
  (d.flapFlowers || []).forEach(f => peony(x, f[0], f[1], f[2], PEONY[f[3]], k));
  if (d.flapGapura) both(L, (ctx, p) => gapura(ctx, p, ...d.flapGapura, k));
  if (d.flapCrescent) both(L, (ctx, p) => { ctx.save(); ctx.translate(220 * k, 40 * k); ctx.scale(k, k); ctx.fillStyle = p; ctx.fill(new Path2D('M-9 -2A11 11 0 1 0 6 8A9 9 0 1 1 -9 -2Z')); ctx.fill(new Path2D('M12 -8l2 5 5 0-4 3 2 5-5-3-5 3 2-5-4-3 5 0z')); ctx.restore(); });
  return pair(L);
}

export function flapBackTextures(d) {
  const k = 2.5, w = 440 * k, h = 174 * k, L = layer(w, h), x = L.x;
  x.fillStyle = d.liner; x.fillRect(0, 0, w, h);
  if (d.linerFloral) { for (const [px, py, s] of [[70, 60, 36], [190, 40, 30], [300, 66, 38], [400, 40, 28]]) peony(x, px, py, s, PEONY.pink, k); x.fillStyle = '#f3cd5b'; for (const [px, py] of [[130, 108], [250, 116], [360, 112]]) { x.beginPath(); x.arc(px * k, py * k, 7 * k, 0, 6.283); x.fill(); } }
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  return pair(L);
}

const LK = 4;
export function letterTextures(d, c = DEFAULT_CONTENT) {
  const k = LK, w = 387 * k, h = 255 * k, L = layer(w, h), x = L.x, o = d.letter;
  x.fillStyle = d.letterBg; x.fillRect(0, 0, w, h);
  // serat kertas halus
  x.globalAlpha = .035; for (let i = 0; i < 1800; i++) { x.fillStyle = i % 2 ? '#000' : '#fff'; x.fillRect(Math.random() * w, Math.random() * h, 1.5 * k, .6 * k); } x.globalAlpha = 1;
  if (o.band) { x.fillStyle = o.band; x.fillRect(0, 228 * k, w, 27 * k); x.save(); x.scale(k, k); x.strokeStyle = 'rgba(240,207,134,.7)'; x.lineWidth = 1; for (let gx = 0; gx < 387 + 40; gx += 40) for (const [cx, cy, rx, ry] of [[20, 10, 8, 10], [20, 30, 8, 10], [10, 20, 10, 8], [30, 20, 10, 8]]) { x.beginPath(); x.ellipse(gx + cx, 228 + cy - 13, rx, ry, 0, 0, 6.283); x.stroke(); } x.restore(); x.fillStyle = o.band; x.fillRect(0, 228 * k, w, 0); }
  if (o.frame) both(L, (ctx, p) => { ctx.strokeStyle = p; ctx.lineWidth = .9 * k; ctx.strokeRect(9 * k, 9 * k, 369 * k, 237 * k); });
  if (o.arch) both(L, (ctx, p) => { ctx.save(); ctx.scale(k, k); ctx.strokeStyle = p; ctx.lineWidth = 1; ctx.stroke(new Path2D('M193 14C148 22 74 40 74 82V232H312V82C312 40 238 22 193 14Z')); ctx.restore(); });
  (o.corners || []).forEach(c => both(L, (ctx, p) => corner(ctx, p, ...c, k)));
  (o.flowers || []).forEach(f => peony(x, f[0], f[1], f[2], PEONY[f[3]], k));
  if (o.dots) { x.fillStyle = '#f3cd5b'; o.dots.forEach(([px, py]) => { x.beginPath(); x.arc(px * k, py * k, 5 * k, 0, 6.283); x.fill(); }); }
  if (o.gapura) both(L, (ctx, p) => gapura(ctx, p, ...o.gapura, k));
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.fillStyle = d.ink; x.globalAlpha = .82; x.font = `600 ${9.5 * k}px Cin`; x.letterSpacing = `${2.9 * k}px`; x.fillText(c.eyebrow, (193.5 + 1.5) * k, 66 * k); x.letterSpacing = '0px'; x.globalAlpha = 1;
  const nameMax = o.arch ? 215 : 300, nameSz = fitSize((b) => { x.font = `${b * k}px GV`; return x.measureText(c.title).width / k; }, 58, nameMax);
  x.fillStyle = d.nameColor; x.font = `${nameSz * k}px GV`; x.fillText(c.title, 193.5 * k, 126 * k);
  x.fillRect(161 * k, 139 * k, 64 * k, 1.5 * k);
  x.fillStyle = d.ink; x.globalAlpha = .9;
  const fl = fitLead((t, sz) => { x.font = `italic 500 ${sz * k}px Cor`; return x.measureText(t).width / k; }, c.lead, o.arch ? 220 : 290);
  x.font = `italic 500 ${fl.size * k}px Cor`;
  fl.lines.forEach((ln, i) => x.fillText(ln, 193.5 * k, (160 + fl.lh * i) * k)); x.globalAlpha = 1;
  if (c.date) { x.fillStyle = d.nameColor; x.font = `600 ${11 * k}px Cin`; x.letterSpacing = `${1.5 * k}px`; x.fillText(c.date, 194 * k, (160 + fl.lh * (fl.lines.length - 1) + 25) * k); x.letterSpacing = '0px'; }
  return pair(L, true);
}

export function sealFace(d, wide = false, content = DEFAULT_CONTENT) {
  const w = wide ? 512 : 256, h = wide ? 192 : 256, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.textAlign = 'center'; x.fillStyle = d.seal.ink; x.strokeStyle = d.seal.ink;
  if (!wide) { x.globalAlpha = .6; x.lineWidth = 4; x.beginPath(); x.arc(128, 128, 98, 0, 6.283); x.stroke(); x.globalAlpha = 1; const m = content.mono || ''; x.font = `600 ${m.length > 3 ? 56 : 74}px Cin`; x.fillText(m, 128, m.length > 3 ? 146 : 152); }
  else { x.globalAlpha = .55; x.lineWidth = 3; x.strokeRect(14, 14, w - 28, h - 28); x.globalAlpha = 1; x.font = '600 70px Cin'; x.letterSpacing = '12px'; x.fillText(content.mono || '', w / 2 + 6, 124); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function glowSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Pola sidik jari (garis papilari melingkar berbelit) untuk lapisan holografik di segel. Hanya gambar hiasan. */
export function fingerprintTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  if (x) {
    x.translate(128, 132); x.lineCap = 'round';
    for (let i = 2; i < 24; i++) {
      x.beginPath();
      for (let a = 0; a <= 6.4; a += .05) {
        const r = i * 5.1 + Math.sin(a * 3 + i * .7) * 1.7 + Math.sin(a * 5 - i) * .9 + (i > 12 ? Math.sin(a * 2) * 3 : 0);
        const px = Math.cos(a) * r * .9, py = Math.sin(a) * r * 1.08;
        a ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.strokeStyle = `rgba(255,255,255,${i < 4 ? .55 : .9})`; x.lineWidth = 2.1; x.stroke();
    }
    const g = x.createRadialGradient(0, 0, 40, 0, 0, 126); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = g; x.fillRect(-128, -132, 256, 256);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
