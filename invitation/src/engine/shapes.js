/** clip-path polygon untuk bintang n-sudut (n=8 untuk motif Islami). */
export function starPolygon(points = 8, inner = 0.62) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 50 : 50 * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    out.push(`${(50 + r * Math.cos(a)).toFixed(1)}% ${(50 + r * Math.sin(a)).toFixed(1)}%`);
  }
  return `polygon(${out.join(',')})`;
}
