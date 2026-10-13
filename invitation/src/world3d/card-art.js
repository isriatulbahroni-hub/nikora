/**
 * Gambar kartu rekening emas (sisi depan & belakang) ke kanvas 2D.
 * Setiap sisi = tiga kanvas: warna, ORM (G=kekasaran, B=logam), dan peta timbul (bump).
 * Tanpa Three.js, sehingga dipakai juga oleh kartu cadangan CSS.
 * Ini ilustrasi nomor rekening untuk hadiah, bukan kartu pembayaran (tertulis di sisi belakang).
 */
export const CARD = { W: 85.6, H: 53.98, R: 3.18 };            // mm, ukuran ID-1 (ISO/IEC 7810)
export const ART = { w: 1712, h: 1080 };                          // piksel pada skala 20 px/mm

const clean = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** Nomor murni angka 8-19 digit dikelompokkan 4-4-4; selain itu ditampilkan apa adanya. */
export function groupNumber(no) {
  const s = clean(no, 40);
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  if (/^[0-9 \-]+$/.test(s) && digits.length >= 8 && digits.length <= 19) return digits.replace(/(.{4})(?=.)/g, '$1 ');
  return s;
}

/** Data tampilan satu kartu dari satu baris hadiah. */
export function cardModel(g = {}) {
  const label = clean(g.label, 60) || 'Hadiah';
  const holder = clean(g.accountName, 80);
  const raw = clean(g.accountNo, 40);
  const kind = g.kind === 'ewallet' || g.kind === 'qris' ? g.kind : 'bank';
  return {
    kind, label, holder, raw,
    bank: label.toUpperCase().slice(0, 22),
    tier: kind === 'ewallet' ? 'DOMPET DIGITAL' : kind === 'qris' ? 'QRIS' : 'TANDA KASIH',
    number: groupNumber(raw) || (kind === 'qris' ? 'QRIS' : '•••• •••• ••••'),
    holderUpper: holder.toUpperCase().slice(0, 30),
    aria: `Kartu ${label}${holder ? `, atas nama ${holder}` : ''}${raw ? `, nomor ${raw}` : ''}`,
  };
}

/** Ukuran huruf terbesar (<= base) agar teks muat dalam lebar max. */
export const fit = (measureAt, base, max, min = 40) => { const w = measureAt(base); return w <= max ? base : Math.max(min, base * max / w); };

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rr = (x, px, py, w, h, r) => { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); };
const MR_GOLD = 'rgb(0,88,255)', MR_TEXT = 'rgb(0,120,200)', MR_CHIP = 'rgb(0,60,255)', MR_PLASTIC = 'rgb(0,150,0)', MR_PAPER = 'rgb(0,215,0)';

function surface(w, h) {
  const c = mk(w, h), m = mk(w, h), b = mk(w, h);
  const x = c.getContext('2d'), y = m.getContext('2d'), z = b.getContext('2d');
  if (!x || !y || !z) return null;
  y.fillStyle = MR_GOLD; y.fillRect(0, 0, w, h); z.fillStyle = '#808080'; z.fillRect(0, 0, w, h);
  return { c, m, b, x, y, z, w, h };
}

function goldBase(S, dark = false) {
  const { x, w, h } = S;
  const g = x.createLinearGradient(0, 0, w, h);
  const stops = dark ? [[0, '#6f4f14'], [.25, '#bf9535'], [.45, '#e3c673'], [.6, '#b88b2c'], [.82, '#d9b44f'], [1, '#79561a']] : [[0, '#9b7222'], [.22, '#d8b25a'], [.42, '#f6e3a0'], [.58, '#cfa443'], [.8, '#e9cc7a'], [1, '#8d671c']];
  stops.forEach(([o, c]) => g.addColorStop(o, c)); x.fillStyle = g; x.fillRect(0, 0, w, h);
  // serat logam tersikat (garis halus horizontal)
  let s = 7; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 2600; i++) { x.strokeStyle = r() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(60,40,5,.05)'; x.lineWidth = 1; const px = r() * w, py = r() * h, len = 80 + r() * 460; x.beginPath(); x.moveTo(px, py); x.lineTo(px + len, py + (r() - .5) * 2); x.stroke(); }
}

function guilloche(S) {
  const { x, w, h } = S; x.save(); x.lineWidth = 1.3;
  for (let j = 0; j < 36; j++) {
    x.strokeStyle = j % 2 ? 'rgba(255,255,255,.17)' : 'rgba(95,65,10,.13)'; x.beginPath();
    for (let px = 0; px <= w; px += 8) { const py = h * .5 + (j - 18) * 16 + Math.sin(px * .0105 + j * .42) * 20 + Math.sin(px * .029 + j) * 7; px ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
  }
  x.restore();
}

function rings(S, cx, cy, rad, a) {      // dua cincin bertaut, lambang pernikahan
  const { x } = S; x.save(); x.lineWidth = 9;
  for (const [dx, col] of [[-rad * .55, `rgba(255,248,214,${a})`], [rad * .55, `rgba(110,76,14,${a})`]]) { x.strokeStyle = col; x.beginPath(); x.arc(cx + dx, cy, rad, 0, 6.283); x.stroke(); }
  x.restore();
}

/** Teks timbul: sorot terang, bayangan gelap, warna utama; juga ke peta logam dan bump. */
function emboss(S, text, px, py, font, spacing, color, align = 'left') {
  for (const [ctx, mode] of [[S.x, 'c'], [S.y, 'm'], [S.z, 'b']]) {
    ctx.save(); ctx.font = font; ctx.letterSpacing = spacing; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    if (mode === 'c') { ctx.fillStyle = 'rgba(255,250,222,.7)'; ctx.fillText(text, px + 2.5, py + 2.5); ctx.fillStyle = 'rgba(55,36,4,.6)'; ctx.fillText(text, px - 1.6, py - 1.6); ctx.fillStyle = color; ctx.fillText(text, px, py); }
    else if (mode === 'm') { ctx.fillStyle = MR_TEXT; ctx.fillText(text, px, py); }
    else { ctx.shadowColor = '#fff'; ctx.shadowBlur = 5; ctx.fillStyle = '#fff'; ctx.fillText(text, px, py); }
    ctx.restore();
  }
}
const measure = (S, text, font, spacing) => { S.x.save(); S.x.font = font; S.x.letterSpacing = spacing; const w = S.x.measureText(text).width; S.x.restore(); return w; };

function chip(S, px, py, w, h) {
  const { x, y, z } = S;
  const g = x.createLinearGradient(px, py, px + w, py + h); g.addColorStop(0, '#f1e7c6'); g.addColorStop(.45, '#bfae80'); g.addColorStop(1, '#efe3bd');
  rr(x, px, py, w, h, 24); x.fillStyle = g; x.fill(); x.strokeStyle = 'rgba(70,50,10,.65)'; x.lineWidth = 3; x.stroke();
  rr(y, px, py, w, h, 24); y.fillStyle = MR_CHIP; y.fill();
  rr(z, px, py, w, h, 24); z.fillStyle = '#9a9a9a'; z.fill();
  const lines = [[px, py + h * .34, px + w, py + h * .34], [px, py + h * .66, px + w, py + h * .66], [px + w * .36, py, px + w * .36, py + h * .34], [px + w * .64, py, px + w * .64, py + h * .34], [px + w * .36, py + h * .66, px + w * .36, py + h], [px + w * .64, py + h * .66, px + w * .64, py + h], [px + w * .3, py + h * .34, px + w * .3, py + h * .66], [px + w * .7, py + h * .34, px + w * .7, py + h * .66]];
  for (const [ctx, col, lw] of [[x, 'rgba(60,44,8,.62)', 3], [z, '#000', 5]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); for (const [a, b, c, d] of lines) { ctx.moveTo(a, b); ctx.lineTo(c, d); } ctx.stroke(); rr(ctx, px + w * .3, py + h * .34, w * .4, h * .32, 14); ctx.stroke(); }
}

function contactless(S, cx, cy) {
  const { x, z } = S;
  for (const [ctx, col] of [[x, 'rgba(70,48,8,.82)'], [z, '#fff']]) { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 8; ctx.lineCap = 'round'; for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(cx - 30, cy, 20 + i * 17, -.8, .8); ctx.stroke(); } ctx.restore(); }
}

/** Sisi depan. */
function front(model, fontsOk) {
  const S = surface(ART.w, ART.h); if (!S) return null;
  const { w, h } = S, serif = '600 {s}px Cin, "Palatino Linotype", Georgia, serif';
  goldBase(S); guilloche(S); rings(S, 1380, 560, 175, .2);
  chip(S, 128, 372, 214, 166); contactless(S, 428, 455);
  const bankSz = fit((b) => measure(S, model.bank, serif.replace('{s}', b), '5px'), 70, 880, 38);
  emboss(S, model.bank, 120, 168, serif.replace('{s}', bankSz), '5px', '#4a3410');
  emboss(S, model.tier, w - 120, 150, serif.replace('{s}', 34), '8px', '#5a4012', 'right');
  const numFont = (b) => serif.replace('{s}', b), numSz = fit((b) => measure(S, model.number, numFont(b), '9px'), 112, w - 250, 52);
  emboss(S, model.number, 120, 742, numFont(numSz), '9px', '#5c4210');
  if (model.holderUpper) { const nSz = fit((b) => measure(S, model.holderUpper, serif.replace('{s}', b), '5px'), 56, 980, 30); emboss(S, model.holderUpper, 120, 936, serif.replace('{s}', nSz), '5px', '#5c4210'); }
  // sorot tepi
  const e = S.x.createLinearGradient(0, 0, 0, h); e.addColorStop(0, 'rgba(255,255,255,.22)'); e.addColorStop(.12, 'rgba(255,255,255,0)'); e.addColorStop(.9, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(60,40,5,.28)'); S.x.fillStyle = e; S.x.fillRect(0, 0, w, h);
  return S;
}

/** Sisi belakang: pita magnetik, panel tanda tangan, hologram, dan keterangan. */
function back(model) {
  const S = surface(ART.w, ART.h); if (!S) return null;
  const { x, y, z, w, h } = S;
  goldBase(S, true); guilloche(S);
  const st = x.createLinearGradient(0, 110, 0, 290); st.addColorStop(0, '#0b0907'); st.addColorStop(.5, '#241e16'); st.addColorStop(1, '#0b0907');
  x.fillStyle = st; x.fillRect(0, 110, w, 180); y.fillStyle = MR_PLASTIC; y.fillRect(0, 110, w, 180); z.fillStyle = '#6a6a6a'; z.fillRect(0, 110, w, 180);
  rr(x, 110, 350, 1010, 150, 10); x.fillStyle = '#f7f1df'; x.fill(); rr(y, 110, 350, 1010, 150, 10); y.fillStyle = MR_PAPER; y.fill();
  x.save(); x.beginPath(); x.rect(110, 350, 1010, 150); x.clip(); x.strokeStyle = 'rgba(120,150,190,.35)'; x.lineWidth = 2; for (let i = -150; i < 1100; i += 22) { x.beginPath(); x.moveTo(110 + i, 500); x.lineTo(110 + i + 150, 350); x.stroke(); } x.restore();
  if (model.holder) { x.save(); x.font = '78px GV, "Brush Script MT", cursive'; x.fillStyle = '#242a55'; x.textBaseline = 'alphabetic'; const maxW = 930; let size = 78; while (size > 34 && (x.font = `${size}px GV, "Brush Script MT", cursive`, x.measureText(model.holder).width > maxW)) size -= 3; x.fillText(model.holder, 150, 452); x.restore(); }
  // hologram
  const hx = 1290, hy = 372, hg = x.createLinearGradient(hx, hy, hx + 230, hy + 150); [[0, '#8fe6d6'], [.3, '#e5b8ff'], [.55, '#fff0a8'], [.8, '#9cc8ff'], [1, '#ffb6d4']].forEach(([o, c]) => hg.addColorStop(o, c));
  rr(x, hx, hy, 230, 150, 20); x.fillStyle = hg; x.fill(); x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 3; x.stroke(); rr(y, hx, hy, 230, 150, 20); y.fillStyle = 'rgb(0,35,255)'; y.fill();
  rings(S, hx + 115, hy + 75, 40, .55);
  // keterangan
  const lines = ['Gunakan nomor di sisi depan untuk mentransfer hadiah.', 'Ilustrasi kartu rekening hadiah, bukan kartu pembayaran.'];
  x.save(); x.font = 'italic 500 34px Cor, Georgia, serif'; x.fillStyle = 'rgba(52,34,4,.9)'; x.textBaseline = 'alphabetic'; lines.forEach((t, i) => x.fillText(t, 120, 628 + i * 50)); x.restore();
  emboss(S, model.bank, 120, 936, '600 52px Cin, "Palatino Linotype", Georgia, serif', '5px', '#4a3410');
  return S;
}

/** Semua kanvas untuk satu kartu, atau null bila kanvas 2D tidak tersedia. */
export function paintCard(model) {
  const f = front(model), b = back(model);
  if (!f || !b) return null;
  const pick = (S) => ({ color: S.c, mr: S.m, bump: S.b });
  return { front: pick(f), back: pick(b) };
}
