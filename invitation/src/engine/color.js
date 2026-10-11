export const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

export function hexToRgb(hex) {
  if (!isHex(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Rasio kontras WCAG antara dua warna hex. Mengembalikan 0 jika salah satunya tidak valid. */
export function contrast(a, b) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  if (!A || !B) return 0;
  const la = luminance(A);
  const lb = luminance(B);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
