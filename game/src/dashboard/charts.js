// Geometri grafik batang + garis (SVG). Murni angka, bisa dites tanpa DOM; penggambaran ada di views.js.
/** Batas atas sumbu Y berupa 4 x langkah bulat, sehingga empat garis bantu selalu berupa bilangan bulat (hitungan acara/pengguna). */
export function niceMax(value) {
  if (!(value > 0)) return 4;
  const need = Math.max(1, value / 4);
  const exp = 10 ** Math.floor(Math.log10(need));
  for (const m of [1, 2, 3, 4, 5, 6, 8, 10]) if (need <= m * exp) return 4 * m * exp;
  return 40 * exp;
}

/** labels: string[]; bars: number[]; line: number[] | null (panjang sama). Mengembalikan koordinat dalam ruang width x height. */
export function chartGeometry({ labels, bars = [], line = null, width = 600, height = 220, pad = { top: 12, right: 12, bottom: 28, left: 34 }, maxLabels = 7 }) {
  const n = labels.length;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const yMax = niceMax(Math.max(0, ...bars, ...(line ?? [])));
  const step = n > 0 ? innerW / n : innerW;
  const barW = Math.max(2, Math.min(34, step * 0.56));
  const yOf = (v) => pad.top + innerH - (Math.max(0, v) / yMax) * innerH;
  const xMid = (i) => pad.left + step * i + step / 2;
  const ticks = [0, 1, 2, 3, 4].map((i) => ({ value: (yMax / 4) * i, y: yOf((yMax / 4) * i) }));
  const barRects = bars.map((v, i) => ({ x: xMid(i) - barW / 2, y: yOf(v), w: barW, h: Math.max(0, pad.top + innerH - yOf(v)), value: v }));
  const points = line ? line.map((v, i) => ({ x: xMid(i), y: yOf(v), value: v })) : [];
  const every = Math.max(1, Math.ceil(n / maxLabels));
  const xLabels = labels.map((text, i) => ({ x: xMid(i), text })).filter((_, i) => i % every === 0 || i === n - 1);
  return { width, height, yMax, ticks, bars: barRects, line: points, xLabels, baseline: pad.top + innerH, pad };
}

export const linePath = (points) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
