import { hexToRgb } from '../engine/color.js';
import { mix } from '../engine/style.js';

/**
 * Ambil 4 warna serasi dari sebuah foto (untuk sampul): kuantisasi 4 bit per kanal, lalu pilih
 * aksen (paling hidup dan banyak), sorotan (warna lain yang terang), dan dua latar dari yang gelap.
 * Murni dihitung di peramban dari piksel RGBA; tidak ada yang dikirim ke mana pun.
 */
const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const sat = ([r, g, b]) => { const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function paletteFromPixels(data, { step = 1 } = {}) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4 * step) {
    if (data[i + 3] < 200) continue;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n += 1; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
    buckets.set(key, b);
  }
  const colors = [...buckets.values()].map((b) => { const c = [b.r / b.n, b.g / b.n, b.b / b.n]; return { c, n: b.n, s: sat(c), l: lum(c) }; });
  if (!colors.length) return null;
  const total = colors.reduce((a, c) => a + c.n, 0);

  const mid = colors.filter((c) => c.l > 0.12 && c.l < 0.88);
  const pool = mid.length ? mid : colors;
  const accent = pool.reduce((best, c) => ((c.n / total) * (0.25 + c.s) ** 1.6 > (best.n / total) * (0.25 + best.s) ** 1.6 ? c : best), pool[0]);
  const bright = colors.filter((c) => dist(c.c, accent.c) > 70 && c.l > 0.45).sort((a, b) => (b.n * (0.3 + b.s)) - (a.n * (0.3 + a.s)))[0];
  const dark = colors.filter((c) => c.l < 0.3).sort((a, b) => b.n - a.n)[0];

  const A = hex(...accent.c);
  const accent2 = bright ? hex(...bright.c) : mix(A, '#ffffff', 0.55);
  const bg1 = dark ? mix(hex(...dark.c), '#000000', 0.35) : mix(A, '#000000', 0.78);
  const bg2 = mix(bg1, A, 0.38);
  return { bg1, bg2, accent: A, accent2 };
}

/** Dari berkas gambar: kecilkan ke 64 px lalu hitung paletnya. */
export async function paletteFromImage(file) {
  const bmp = await createImageBitmap(file);
  const k = 64 / Math.max(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * k));
  canvas.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  if (bmp.close) bmp.close();
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const out = paletteFromPixels(px);
  if (!out) throw new Error('Warna foto tidak terbaca.');
  return out;
}

export { hexToRgb };
