// Bentuk luar menara NIKORA Grand Hotel (satuan meter). Murni data + matematika (tanpa THREE), digambar oleh hotel-world.js.
// Acuan: menara kaca ramping berfaset dengan rangka diagonal, mahkota meruncing ke jarum, dan sayap kristal biru di dasar.
//
// Kulit kaca: loft antar cincin segi delapan (persegi dengan sudut dipotong). Cincin ke-k berada di batas zona 50 lantai.
// Interior zona k memakai tapak hotelFootprint(zona k) = skala di batas ATAS zonanya, jadi kulit di bawah zona (cincin k)
// memakai tapak zona sebelumnya (lebih lebar) dan kulit di atas zona memakai tapak zona itu sendiri: kulit selalu di luar tapak.
import { HOTEL_LEVEL_HEIGHT, HOTEL_SITE, HOTEL_TOP_Y, PODIUM_LEVELS, TOWER_CENTER, TOWER_ZONE_LEVELS, hotelFootprint, hotelLevelY } from './hotel-layout.js';

export const SKIN_CHAMFER_RATIO = 0.035; // potongan sudut = 3,5% dari sisi terpendek tapak
export const SKIN_GAP = 1.2; // jarak minimum kulit dari tapak di luar kebutuhan potongan sudut
export const TOWER_ZONES = 20; // 1000 lantai / 50
export const PANEL_ZONES = 4; // satu panel rangka diagonal = 4 zona (200 lantai ~ 210 m)
export const WING_MIN_CLEARANCE = 7.2; // tinggi bebas minimum sayap podium di atas tanah (pemain dan kamera lewat di bawahnya)

/** Persegi kulit [x0, z0, x1, z1] dan potongan sudut `c` untuk satu tapak. Bidang potongan sudut selalu di luar sudut tapak. */
export function skinShape(fp) {
  const c = SKIN_CHAMFER_RATIO * Math.min(fp[2] - fp[0], fp[3] - fp[1]);
  const e = c / 2 + SKIN_GAP; // jarak bidang potong dari sudut tapak = (2e - c) / sqrt(2) = SKIN_GAP * sqrt(2)
  return { x0: fp[0] - e, z0: fp[1] - e, x1: fp[2] + e, z1: fp[3] + e, c, e };
}

/** Cincin segi delapan di ketinggian y, urut dari barat laut searah jarum jam (dilihat dari atas, x ke timur, z ke selatan). */
export function skinRing(fp, y) {
  const s = skinShape(fp);
  const { x0, z0, x1, z1, c } = s;
  return { y, shape: s, pts: [[x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c]] };
}

/** 21 cincin: dasar menara (di atas podium), lalu batas atas tiap zona sampai atap. */
export function skinRings() {
  const rings = [skinRing(hotelFootprint(PODIUM_LEVELS), hotelLevelY(PODIUM_LEVELS))];
  for (let k = 1; k <= TOWER_ZONES; k++) rings.push(skinRing(hotelFootprint(TOWER_ZONE_LEVELS * (k - 1)), k === TOWER_ZONES ? HOTEL_TOP_Y : TOWER_ZONE_LEVELS * k * HOTEL_LEVEL_HEIGHT));
  return rings;
}

/** Persegi kulit (dan potongan sudut) di ketinggian y, diinterpolasi linear antar cincin; null di luar menara. */
export function skinShapeAt(y, rings = skinRings()) {
  if (y < rings[0].y - 1e-9 || y > rings[rings.length - 1].y + 1e-9) return null;
  let i = 0;
  while (i < rings.length - 2 && y > rings[i + 1].y) i++;
  const a = rings[i];
  const b = rings[i + 1];
  const t = Math.min(1, Math.max(0, (y - a.y) / (b.y - a.y)));
  const mix = (k) => a.shape[k] + (b.shape[k] - a.shape[k]) * t;
  return { x0: mix('x0'), z0: mix('z0'), x1: mix('x1'), z1: mix('z1'), c: mix('c') };
}

// Empat sisi utama kulit = pasangan indeks titik cincin; arah luar (x, z) tiap sisi.
const FACES = [{ a: 0, b: 1, n: [0, -1] }, { a: 2, b: 3, n: [1, 0] }, { a: 4, b: 5, n: [0, 1] }, { a: 6, b: 7, n: [-1, 0] }];
const ROD_PUSH = 0.25; // batang menonjol sedikit dari kulit supaya tidak tertanam

const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/** Rangka diagonal: tiap panel (4 zona) tiap sisi utama berisi dua diagonal bersilang; tiap diagonal dipecah per zona agar mengikuti kulit yang meruncing. */
export function diagridSegments(rings = skinRings()) {
  const segs = [];
  const zones = rings.length - 1;
  for (let i = 0; i < zones; i++) {
    const j = i % PANEL_ZONES;
    for (const f of FACES) {
      for (const flip of [false, true]) {
        const t0 = flip ? 1 - j / PANEL_ZONES : j / PANEL_ZONES;
        const t1 = flip ? 1 - (j + 1) / PANEL_ZONES : (j + 1) / PANEL_ZONES;
        const p = lerp(rings[i].pts[f.a], rings[i].pts[f.b], t0);
        const q = lerp(rings[i + 1].pts[f.a], rings[i + 1].pts[f.b], t1);
        segs.push({ a: [p[0] + f.n[0] * ROD_PUSH, rings[i].y, p[1] + f.n[1] * ROD_PUSH], b: [q[0] + f.n[0] * ROD_PUSH, rings[i + 1].y, q[1] + f.n[1] * ROD_PUSH] });
      }
    }
  }
  return segs;
}

/** Rusuk vertikal di delapan sudut kulit (sepanjang tiap zona). */
export function edgeSegments(rings = skinRings()) {
  const segs = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let v = 0; v < rings[i].pts.length; v++) segs.push({ a: [rings[i].pts[v][0], rings[i].y, rings[i].pts[v][1]], b: [rings[i + 1].pts[v][0], rings[i + 1].y, rings[i + 1].pts[v][1]] });
  }
  return segs;
}

export const CROWN_STEPS = Object.freeze([{ dy: 0, k: 1 }, { dy: 60, k: 0.62 }, { dy: 130, k: 0.28 }]); // skala cincin mahkota terhadap pusat menara
export const SPIRE = Object.freeze({ height: 330, radius: 14, needleHeight: 120 });

/** Mahkota (cincin yang menyempit di atas atap) dan jarum puncak. */
export function crownSpec() {
  const top = skinRings().at(-1);
  const { x: cx, z: cz } = TOWER_CENTER;
  const rings = CROWN_STEPS.map((s) => ({ y: HOTEL_TOP_Y + s.dy, pts: top.pts.map(([x, z]) => [cx + (x - cx) * s.k, cz + (z - cz) * s.k]) }));
  const baseY = rings.at(-1).y;
  return { rings, spire: { baseY, height: SPIRE.height, radius: SPIRE.radius, x: cx, z: cz }, needle: { baseY: baseY + SPIRE.height - 4, height: SPIRE.needleHeight, x: cx, z: cz }, tipY: baseY + SPIRE.height - 4 + SPIRE.needleHeight };
}

// Sayap kristal podium: sisi menara di atas podium (level 0..3) memiliki atap miring bersegi tiga yang menggantung keluar, naik-turun
// bergantian sehingga berfaset. Tidak ada yang lebih rendah dari WING_MIN_CLEARANCE. Panjang menjorok dibatasi tepi tapak (HOTEL_SITE).
const WING_DROPS = [5.5, 9.0]; // turun dari tepi atap podium di titik luar (bergantian)
const WING_CORNER_DROP = 9.4;
const WING_STEP = 13;

/** Menjorok tiap sisi (utara, selatan, barat, timur) tanpa keluar dari tapak hotel. */
export function wingReach(b = hotelFootprint(0)) {
  const fit = (gap, want) => Math.max(0, Math.min(want, gap - 3));
  return { n: fit(b[1] - HOTEL_SITE.minZ, 18), s: fit(HOTEL_SITE.maxZ - b[3], 18), w: fit(b[0] - HOTEL_SITE.minX, 24), e: fit(HOTEL_SITE.maxX - b[2], 24) };
}

/** Daftar segitiga [[x,y,z] x3] sayap kristal podium. */
export function podiumWingTriangles() {
  const b = hotelFootprint(0);
  const yIn = hotelLevelY(PODIUM_LEVELS) - 0.2;
  const r = wingReach(b);
  const tris = [];
  const along = (from, to) => { const n = Math.max(1, Math.ceil((to - from) / WING_STEP)); return Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n); };
  const outer = {}; // titik luar tiap sisi (untuk menyambung sudut)
  const side = (name, pts, off, inner, outerPt) => {
    const ring = [];
    pts.forEach((s, i) => ring.push({ i, inn: inner(s), out: outerPt(s, yIn - WING_DROPS[i % 2], off) }));
    for (let i = 0; i < ring.length - 1; i++) {
      const A = ring[i]; const B = ring[i + 1];
      if (i % 2 === 0) tris.push([A.inn, B.inn, B.out], [A.inn, B.out, A.out]);
      else tris.push([A.inn, B.inn, A.out], [B.inn, B.out, A.out]);
    }
    outer[name] = ring;
  };
  const xs = along(b[0], b[2]);
  const zs = along(b[1], b[3]);
  side('n', xs, r.n, (x) => [x, yIn, b[1]], (x, y, o) => [x, y, b[1] - o]);
  side('s', xs, r.s, (x) => [x, yIn, b[3]], (x, y, o) => [x, y, b[3] + o]);
  side('w', zs, r.w, (z) => [b[0], yIn, z], (z, y, o) => [b[0] - o, y, z]);
  side('e', zs, r.e, (z) => [b[2], yIn, z], (z, y, o) => [b[2] + o, y, z]);
  // sudut: kipas dari sudut atap podium ke ujung dua sisi yang bertemu dan titik sudut terluar
  const y0 = yIn - WING_CORNER_DROP;
  const corner = (cx, cz, nSide, nIdx, wSide, wIdx, ox, oz) => {
    const inn = [cx, yIn, cz];
    const pn = outer[nSide][nIdx].out;
    const pw = outer[wSide][wIdx].out;
    const tip = [ox, y0, oz];
    tris.push([inn, pn, tip], [inn, tip, pw]);
  };
  corner(b[0], b[1], 'n', 0, 'w', 0, b[0] - r.w, b[1] - r.n);
  corner(b[2], b[1], 'n', outer.n.length - 1, 'e', 0, b[2] + r.e, b[1] - r.n);
  corner(b[0], b[3], 's', 0, 'w', outer.w.length - 1, b[0] - r.w, b[3] + r.s);
  corner(b[2], b[3], 's', outer.s.length - 1, 'e', outer.e.length - 1, b[2] + r.e, b[3] + r.s);
  return tris;
}
