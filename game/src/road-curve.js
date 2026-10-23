// Jalan lengkung (murni, tanpa THREE): garis tengah berupa deretan titik rapat yang dibentuk dari gelombang menyamping,
// lengkap dengan pencarian titik terdekat berindeks sel (cepat dipanggil tiap frame untuk tiap mobil) dan radius tikungan.
// Satuan meter, bingkai hotel (x timur, z selatan). Arah "kiri" = leftOf(heading) di highway.js = (tz, -tx).

const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const smoothstep = (t) => { const c = clamp01(t); return c * c * (3 - 2 * c); };

const CELL = 64;

/**
 * Bangun jalan lengkung. start = titik awal, dir = vektor arah lurus (satuan), length = panjang sumbu,
 * waves = [{ amp, wl, phase }] simpangan menyamping (m), taperIn = panjang landai di awal, flatEnd = bagian lurus di ujung,
 * taperOut = panjang landai sebelum bagian lurus. Awal dan ujung selalu lurus searah sumbu supaya menyambung ke lingkar dan gerbang.
 * half = setengah lebar yang dianggap "di jalan"; reach = jarak pencarian titik terdekat.
 */
export function buildCurvedRoad({ start, dir, length, waves, taperIn = 250, taperOut = 250, flatEnd = 200, step = 8, half = 17.25, reach = 60 }) {
  const n = { x: dir.z, z: -dir.x }; // menyamping (kiri jika dir = maju)
  const offset = (s) => {
    const w = smoothstep(s / taperIn) * smoothstep((length - flatEnd - s) / taperOut);
    let o = 0;
    for (const k of waves) o += k.amp * Math.sin((2 * Math.PI * s) / k.wl + k.phase);
    return o * w;
  };
  const count = Math.ceil(length / step);
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const s = Math.min(length, i * step);
    const o = offset(s);
    pts.push({ x: start.x + dir.x * s + n.x * o, z: start.z + dir.z * s + n.z * o });
  }
  let arc = 0;
  pts.forEach((p, i) => {
    if (i > 0) arc += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    p.s = arc;
  });
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    p.tx = (b.x - a.x) / l;
    p.tz = (b.z - a.z) / l;
  });

  // indeks sel: tiap ruas dimasukkan ke semua sel yang tersentuh kotaknya (diperlebar reach + half)
  const pad = half + reach;
  const cells = new Map();
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const x0 = Math.floor((Math.min(a.x, b.x) - pad) / CELL);
    const x1 = Math.floor((Math.max(a.x, b.x) + pad) / CELL);
    const z0 = Math.floor((Math.min(a.z, b.z) - pad) / CELL);
    const z1 = Math.floor((Math.max(a.z, b.z) + pad) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const key = cx * 100003 + cz;
      let list = cells.get(key);
      if (!list) cells.set(key, (list = []));
      list.push(i);
    }
  }

  /** Titik terdekat pada garis tengah: { x, z, s (jarak sepanjang jalan), tx, tz, lateral (+ = kiri arah jalan), dist } atau null bila jauh (> half + reach). */
  function nearest(x, z) {
    const list = cells.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    if (!list) return null;
    let best = null;
    for (const i of list) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      const qx = a.x + dx * t;
      const qz = a.z + dz * t;
      const d = Math.hypot(x - qx, z - qz);
      if (!best || d < best.dist) best = { dist: d, i, t, qx, qz };
    }
    if (!best || best.dist > half + reach) return null;
    const a = pts[best.i];
    const b = pts[best.i + 1];
    let tx = a.tx + (b.tx - a.tx) * best.t;
    let tz = a.tz + (b.tz - a.tz) * best.t;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const lateral = (x - best.qx) * tz - (z - best.qz) * tx; // titik dot (tz, -tx)
    return { x: best.qx, z: best.qz, s: a.s + (b.s - a.s) * best.t, tx, tz, lateral, dist: best.dist };
  }

  let minRadius = Infinity;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
    if (area2 < 1e-9) continue;
    const r = (Math.hypot(b.x - a.x, b.z - a.z) * Math.hypot(c.x - b.x, c.z - b.z) * Math.hypot(c.x - a.x, c.z - a.z)) / (2 * area2);
    if (r < minRadius) minRadius = r;
  }
  /** Radius lengkung (m) di indeks titik i dengan tanda: + = membelok ke kiri. */
  const signedRadius = (i) => {
    const a = pts[Math.max(0, i - 2)];
    const b = pts[i];
    const c = pts[Math.min(pts.length - 1, i + 2)];
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    const area2 = Math.abs(cross);
    if (area2 < 1e-6) return Infinity;
    const r = (Math.hypot(b.x - a.x, b.z - a.z) * Math.hypot(c.x - b.x, c.z - b.z) * Math.hypot(c.x - a.x, c.z - a.z)) / (2 * area2);
    return cross < 0 ? r : -r; // heading (sin h, cos h): cross negatif = heading membesar = ke kiri
  };
  return { points: pts, length: arc, half, nearest, minRadius, signedRadius, start, dir };
}
