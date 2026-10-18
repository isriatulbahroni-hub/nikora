// Matematika murni untuk TV di dinding (tanpa THREE/DOM) agar bisa diuji.

/** Ukuran layar TV yang terisi video: seluruh video muat di dalam layar (pita hitam di sisi lebih, bukan terpotong). */
export function fitContain(aspect, width = 1.4, height = 0.8) {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return { width, height };
  return aspect > width / height ? { width, height: width / aspect } : { width: height * aspect, height };
}

/**
 * CSS matrix3d yang memetakan elemen berukuran w x h (asal kiri-atas) ke segi empat layar
 * [kiriAtas, kananAtas, kananBawah, kiriBawah] (piksel). Dipakai agar iframe YouTube/TikTok menempel di layar TV.
 */
export function quadToMatrix3d(quad, w, h) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  let g = 0;
  let hh = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    hh = (dx1 * sy - sx * dy1) / den;
  }
  const a = x1 - x0 + g * x1;
  const b = y1 - y0 + g * y1;
  const d = x3 - x0 + hh * x3;
  const e = y3 - y0 + hh * y3;
  return `matrix3d(${[a / w, b / w, 0, g / w, d / h, e / h, 0, hh / h, 0, 0, 1, 0, x0, y0, 0, 1].join(',')})`;
}

/** Titik (u,v) di 0..1 -> piksel lewat matrix3d di atas (untuk uji). */
export function applyMatrix3d(css, w, h, u, v) {
  const m = css.slice(9, -1).split(',').map(Number);
  const X = u * w;
  const Y = v * h;
  const den = m[3] * X + m[7] * Y + m[15];
  return [(m[0] * X + m[4] * Y + m[12]) / den, (m[1] * X + m[5] * Y + m[13]) / den];
}
