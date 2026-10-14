import { isHex, hexToRgb, contrast } from './color.js';

/**
 * Tampilan sendiri: pelanggan memilih 4 warna, 2 font, dan foto sampul. Dari 4 warna itu dihitung
 * seluruh set warna tema (kertas, tinta, segel, cahaya) dengan kontras dijaga otomatis, sehingga
 * apa pun pilihannya teks tetap terbaca dan efek 3D (ketebalan huruf, pemandangan) ikut berwarna sama.
 * Disimpan di invitations.extra.style; disaring ulang di sini setiap kali dibaca.
 */

export const COLOR_FIELDS = [
  { key: 'bg1', label: 'Latar utama', hint: 'Warna paling gelap/dasar layar' },
  { key: 'bg2', label: 'Latar kedua', hint: 'Warna cahaya di tengah latar' },
  { key: 'accent', label: 'Warna aksen', hint: 'Hiasan, garis, segel' },
  { key: 'accent2', label: 'Warna sorotan', hint: 'Tombol, ketebalan huruf 3D, kilau' },
];

/** Font yang dikurasi (Google Fonts). Bebas tanpa batas bisa merusak tata letak dan memperlambat halaman tamu. */
export const FONT_CHOICES = [
  { id: 'Playfair Display', kind: 'Serif elegan', css: 'Playfair+Display:ital,wght@0,500;0,700;1,500', stack: "'Playfair Display','Times New Roman',serif" },
  { id: 'Cormorant Garamond', kind: 'Serif klasik', css: 'Cormorant+Garamond:ital,wght@0,500;0,700;1,500', stack: "'Cormorant Garamond',Garamond,Georgia,serif" },
  { id: 'Cinzel', kind: 'Huruf kapital megah', css: 'Cinzel:wght@500;700', stack: "'Cinzel','Trajan Pro',Georgia,serif" },
  { id: 'DM Serif Display', kind: 'Serif tegas', css: 'DM+Serif+Display:ital@0;1', stack: "'DM Serif Display',Georgia,serif" },
  { id: 'Lora', kind: 'Serif nyaman dibaca', css: 'Lora:ital,wght@0,400;0,600;1,400', stack: "Lora,Georgia,serif" },
  { id: 'Merriweather', kind: 'Serif jelas', css: 'Merriweather:wght@400;700', stack: "Merriweather,Georgia,serif" },
  { id: 'Amiri', kind: 'Nuansa Arab', css: 'Amiri:ital,wght@0,400;0,700;1,400', stack: "Amiri,'Palatino Linotype',Georgia,serif" },
  { id: 'Great Vibes', kind: 'Tulisan tangan anggun', css: 'Great+Vibes', stack: "'Great Vibes','Brush Script MT',cursive" },
  { id: 'Dancing Script', kind: 'Tulisan tangan luwes', css: 'Dancing+Script:wght@500;700', stack: "'Dancing Script','Brush Script MT',cursive" },
  { id: 'Poppins', kind: 'Sans modern', css: 'Poppins:wght@400;600;700', stack: "Poppins,'Segoe UI',Arial,sans-serif" },
  { id: 'Montserrat', kind: 'Sans bersih', css: 'Montserrat:wght@400;600;700', stack: "Montserrat,'Segoe UI',Arial,sans-serif" },
  { id: 'Nunito', kind: 'Sans ramah', css: 'Nunito:wght@400;600;800', stack: "Nunito,'Segoe UI',Arial,sans-serif" },
  { id: 'Inter', kind: 'Sans netral', css: 'Inter:wght@400;600;700', stack: "Inter,'Segoe UI',Arial,sans-serif" },
  { id: 'Fredoka', kind: 'Ceria bulat', css: 'Fredoka:wght@500;700', stack: "Fredoka,'Trebuchet MS',Arial,sans-serif" },
  { id: 'Bangers', kind: 'Komik', css: 'Bangers', stack: "Bangers,Impact,Arial,sans-serif" },
  { id: 'Orbitron', kind: 'Futuristik', css: 'Orbitron:wght@500;700', stack: "Orbitron,'Segoe UI',Arial,sans-serif" },
];
const FONT_BY_ID = new Map(FONT_CHOICES.map((f) => [f.id, f]));

const httpsUrl = (v) => {
  if (typeof v !== 'string' || v.length > 1000) return null;
  try { const u = new URL(v.trim()); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
};

/** #rgb atau #rrggbb -> #rrggbb huruf kecil; selain itu null. */
export function normHex(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return isHex(s) ? s : null;
}

/** Saring style dari database/pesan. Mengembalikan objek bersih atau null bila kosong. */
export function sanitizeStyle(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  const colors = {};
  for (const { key } of COLOR_FIELDS) { const c = normHex(raw.colors && raw.colors[key]); if (c) colors[key] = c; }
  if (Object.keys(colors).length) out.colors = colors;
  const fonts = {};
  for (const k of ['display', 'body']) { const id = raw.fonts && raw.fonts[k]; if (FONT_BY_ID.has(id)) fonts[k] = id; }
  if (Object.keys(fonts).length) out.fonts = fonts;
  const image = raw.cover && httpsUrl(raw.cover.image);
  if (image) {
    const dim = Number(raw.cover.dim);
    out.cover = { image, dim: Number.isFinite(dim) ? Math.min(0.8, Math.max(0.3, dim)) : 0.5 };
  }
  return Object.keys(out).length ? out : null;
}

/* ---------- warna ---------- */
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a, b, t) => { const A = hexToRgb(a); const B = hexToRgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };

/** Gelapkan/terangkan latar (menjauhi tinta) sampai kontras >= min. */
function fit(bg, ink, min) {
  // tinta terang -> latar digelapkan ke hitam; tinta gelap -> latar diterangkan ke putih
  const target = contrast(ink, '#000000') > contrast(ink, '#ffffff') ? '#000000' : '#ffffff';
  let c = bg;
  for (let i = 0; i < 24 && contrast(ink, c) < min; i++) c = mix(c, target, 0.12);
  return c;
}

/**
 * Dari warna pilihan pelanggan (sebagian boleh kosong = ikut tema) hitung seluruh token tema.
 * notes berisi penjelasan penyesuaian otomatis agar studio bisa memberi tahu pelanggan.
 */
export function deriveTokens(base, colors = {}) {
  const notes = [];
  let bg1 = colors.bg1 || base.bg1;
  let bg2 = colors.bg2 || base.bg2;
  const accent = colors.accent || base.accent;
  let accent2 = colors.accent2 || base.accent2;

  const whiteOk = Math.min(contrast('#ffffff', bg1), contrast('#ffffff', bg2));
  const darkOk = Math.min(contrast('#141414', bg1), contrast('#141414', bg2));
  const stageInk = whiteOk >= darkOk ? '#ffffff' : '#141414';
  const f1 = fit(bg1, stageInk, 4.5);
  const f2 = fit(bg2, stageInk, 4.5);
  if (f1 !== bg1 || f2 !== bg2) notes.push(stageInk === '#ffffff' ? 'Latar digelapkan sedikit agar tulisan putih terbaca.' : 'Latar diterangkan sedikit agar tulisan gelap terbaca.');
  bg1 = f1; bg2 = f2;

  if (contrast(accent2, bg1) < 2.2) {
    const towards = stageInk;
    for (let i = 0; i < 12 && contrast(accent2, bg1) < 2.2; i++) accent2 = mix(accent2, towards, 0.15);
    notes.push('Warna sorotan disesuaikan agar terlihat jelas di atas latar.');
  }

  const letter = mix('#ffffff', accent, 0.05);
  let ink = mix(accent, '#000000', 0.74);
  if (contrast(ink, letter) < 7) ink = '#141414';
  const paper = mix(letter, accent2, 0.3);
  const glow = mix(accent2, '#ffffff', 0.45);
  let sealFill = accent;
  let sealInk = contrast('#ffffff', sealFill) >= contrast('#141414', sealFill) ? '#ffffff' : '#141414';
  for (let i = 0; i < 12 && contrast(sealInk, sealFill) < 3; i++) sealFill = mix(sealFill, sealInk === '#ffffff' ? '#000000' : '#ffffff', 0.15);

  return { tokens: { bg1, bg2, paper, letter, ink, accent, accent2, glow, stageInk, sealFill, sealInk }, notes };
}

/** Terapkan style ke tema: kembalikan tema baru (tidak mengubah aslinya). */
export function applyStyle(theme, rawStyle) {
  const style = sanitizeStyle(rawStyle);
  if (!style) return theme;
  const next = { ...theme };
  if (style.colors) next.tokens = { ...theme.tokens, ...deriveTokens(theme.tokens, style.colors).tokens };
  if (style.fonts) {
    next.fonts = {
      display: style.fonts.display ? FONT_BY_ID.get(style.fonts.display).stack : theme.fonts.display,
      body: style.fonts.body ? FONT_BY_ID.get(style.fonts.body).stack : theme.fonts.body,
    };
  }
  return next;
}

/** Muat font pilihan dari Google Fonts (satu <link>, display=swap). Aman dipanggil berulang. */
export function loadFonts(style, doc = typeof document !== 'undefined' ? document : null) {
  const s = sanitizeStyle(style);
  if (!doc || !s || !s.fonts) return null;
  const ids = [...new Set(Object.values(s.fonts))];
  const href = `https://fonts.googleapis.com/css2?${ids.map((id) => `family=${FONT_BY_ID.get(id).css}`).join('&')}&display=swap`;
  const existing = doc.getElementById('orbit-style-fonts');
  if (existing && existing.getAttribute('href') === href) return existing;
  const link = existing || doc.createElement('link');
  link.id = 'orbit-style-fonts';
  link.rel = 'stylesheet';
  link.href = href;
  if (!existing) doc.head.append(link);
  return link;
}
