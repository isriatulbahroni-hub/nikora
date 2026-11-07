// Dekorasi tematik per ruang hotel NIKORA (data murni, tanpa THREE): tiap ruangan dihias sesuai namanya
// (Grand Lobby, Ballroom, Spa, Sauna, Musholla, Kids Club, Mini Cinema, Library, Presidential Suite, Sky Chapel, dst.),
// kamar tamu menurut kelasnya (Deluxe, Premier, Grand Premier, Royal Residence). Hanya penampilan: tidak mengubah
// tabrakan, denah, atau perabot. Hasilnya kotak-kotak per bahan (matte, wood, gold, marble, velvet, glass, light) yang
// digabung ke InstancedMesh hotel-luxe.js, sehingga tidak menambah draw call.
//
// Aturan: hiasan menempel di dinding, langit-langit, atau lantai (tipis); benda tegak hanya menempel ke dinding dan
// selalu melewati pintu (tidak menutup bukaan pintu). Dinding kulit luar (kaca) hanya diberi hiasan di atas bukaan.
import { LAMP_COLOR } from './hotel-props.js';
import { C } from './hotel-luxe-data.js';
import { HOTEL_WALL_HEIGHT as WALL_H, floorName } from './hotel-layout.js';

export const DECOR_MATS = Object.freeze(['matte', 'wood', 'gold', 'marble', 'velvet', 'glass', 'light']);

export const PAL = Object.freeze({
  ...C,
  jade: 0x1f6b52, rosewood: 0x5a1f26, teal: 0x0f5f66, plum: 0x4a1d4e, silver: 0xcfd4da, bronze: 0x8c5a2b, rosegold: 0xd9a08c,
  navy: 0x14213d, cream: 0xf3ead6, sand: 0xe1cfa7, slate: 0x2f3640, bamboo: 0xb99b62, cedar: 0xb5733a, steel: 0xc9ced3,
  white: 0xf8f8f4, sky: 0x9fd3ea, turquoise: 0x2aa7a0, lilac: 0xc9a7e0, mint: 0x9fd9bf, butter: 0xf6e08a, coral: 0xf08a7a,
  leaf: 0x2f7a3e, wine: 0x5b1a2d,
});
// Warna lampu: mengalikan warna bahan 'light' (warm = warna lampu standar hotel).
export const GLOW = Object.freeze({ warm: LAMP_COLOR, amber: 0xffc062, rose: 0xff8fb0, ice: 0x9fdcff, violet: 0xb07cff, pink: 0xff4fd0, cyan: 0x40e0ff, green: 0x7dffb0 });

const FACE = 0.17; // permukaan dalam dinding dari garis dinding (sama dengan WALL di hotel-furnish.js)
const SIDES = Object.freeze(['n', 's', 'w', 'e']);
const near = (a, b) => Math.abs(a - b) < 0.2;
const hash = (a, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const FLOWERS = [PAL.coral, PAL.blush, PAL.cream, PAL.rosegold, PAL.white];
const SPINES = [PAL.wine, PAL.emerald, PAL.navy, PAL.walnut, PAL.bronze, PAL.burgundy, PAL.teal, PAL.cream];
const along = (side, d) => (side === 'n' || side === 's' ? d.x : d.z);

class Deco {
  constructor(room, ctx, props) {
    [this.x1, this.z1, this.x2, this.z2] = room.rect;
    this.w = this.x2 - this.x1;
    this.d = this.z2 - this.z1;
    this.cx = (this.x1 + this.x2) / 2;
    this.cz = (this.z1 + this.z2) / 2;
    this.room = room;
    this.y0 = ctx.y0;
    this.F = ctx.F;
    this.doors = ctx.doors ?? [];
    this.level = ctx.level ?? 0;
    this.props = props;
    this.out = Object.fromEntries(DECOR_MATS.map((m) => [m, []]));
  }

  add(mat, x, y, z, sx, sy, sz, color, ry = 0) {
    if (!(sx > 0 && sy > 0 && sz > 0)) return;
    this.out[mat].push({ x, y: this.y0 + y, z, sx, sy, sz, ry, color });
  }

  of(type) { return this.props.filter((p) => p.type === type); }

  span(side) { return side === 'n' || side === 's' ? [this.x1, this.x2] : [this.z1, this.z2]; }

  perimeter(side) {
    const F = this.F;
    if (!F) return false;
    if (side === 'n') return near(this.z1, F[1]);
    if (side === 's') return near(this.z2, F[3]);
    if (side === 'w') return near(this.x1, F[0]);
    return near(this.x2, F[2]);
  }

  innerSides() { return SIDES.filter((s) => !this.perimeter(s)); }

  doorsOn(side) {
    const { x1, z1, x2, z2 } = this;
    return this.doors.filter((d) => {
      if (side === 'n') return d.orient === 'h' && near(d.z, z1) && d.x > x1 - 0.2 && d.x < x2 + 0.2;
      if (side === 's') return d.orient === 'h' && near(d.z, z2) && d.x > x1 - 0.2 && d.x < x2 + 0.2;
      if (side === 'w') return d.orient === 'v' && near(d.x, x1) && d.z > z1 - 0.2 && d.z < z2 + 0.2;
      return d.orient === 'v' && near(d.x, x2) && d.z > z1 - 0.2 && d.z < z2 + 0.2;
    });
  }

  /** Bagian sisi dinding yang bebas pintu: [[a, b], ...] sepanjang dinding. */
  runs(side, margin = 0.15, min = 0.8) {
    const [a, b] = this.span(side);
    const gaps = this.doorsOn(side).map((d) => [along(side, d) - d.width / 2 - margin, along(side, d) + d.width / 2 + margin]).sort((p, q) => p[0] - q[0]);
    const out = [];
    let cur = a + 0.1;
    for (const [g0, g1] of gaps) {
      if (g0 - cur >= min) out.push([cur, Math.min(g0, b - 0.1)]);
      cur = Math.max(cur, g1);
    }
    if (b - 0.1 - cur >= min) out.push([cur, b - 0.1]);
    return out;
  }

  /** Apakah selebar `len` di titik t sepanjang sisi tidak menyentuh pintu. */
  free(side, t, len, margin = 0.4) {
    return this.doorsOn(side).every((d) => Math.abs(along(side, d) - t) > d.width / 2 + len / 2 + margin);
  }

  /** Titik berjarak `every` sepanjang sisi (mulai setengah langkah), hanya yang bebas pintu. */
  marks(side, every, len, margin = 0.4) {
    const [a, b] = this.span(side);
    if (b - a < len + 0.6) return [];
    const n = Math.max(1, Math.floor((b - a) / every));
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = a + ((i + 0.5) * (b - a)) / n;
      if (this.free(side, t, len, margin)) out.push(t);
    }
    return out;
  }

  /** Kotak menempel di dinding: t = titik sepanjang dinding, len = panjang sepanjang dinding, dep = tebal ke dalam ruang. */
  wallBox(side, t, yc, len, h, dep, color, mat) {
    const o = FACE + dep / 2;
    if (side === 'n') this.add(mat, t, yc, this.z1 + o, len, h, dep, color);
    else if (side === 's') this.add(mat, t, yc, this.z2 - o, len, h, dep, color);
    else if (side === 'w') this.add(mat, this.x1 + o, yc, t, dep, h, len, color);
    else this.add(mat, this.x2 - o, yc, t, dep, h, len, color);
  }

  /** Pita sepanjang dinding, terpotong di tiap pintu. */
  run(sides, yc, h, dep, color, mat = 'gold') {
    for (const s of sides) for (const [a, b] of this.runs(s)) this.wallBox(s, (a + b) / 2, yc, b - a, h, dep, color, mat);
  }

  local(p, dx, dz) {
    const c = Math.cos(p.ry ?? 0);
    const s = Math.sin(p.ry ?? 0);
    return { x: p.x + dx * c + dz * s, z: p.z - dx * s + dz * c };
  }

  /** Kotak di kerangka lokal perabot p (depan perabot = +z lokal). */
  addLocal(p, mat, dx, y, dz, sx, sy, sz, color) {
    const q = this.local(p, dx, dz);
    this.add(mat, q.x, y, q.z, sx, sy, sz, color, p.ry ?? 0);
  }

  // ---------------------------------------------------------------- langit-langit
  frieze(color = PAL.gold, sides = SIDES) {
    this.run(sides, 3.46, 0.36, 0.1, color, 'gold');
    this.run(sides, 3.24, 0.05, 0.14, color, 'gold');
  }

  cove(glow = GLOW.warm, inset = 0.42, y = WALL_H - 0.2) {
    const a = this.x1 + inset;
    const b = this.x2 - inset;
    const c = this.z1 + inset;
    const e = this.z2 - inset;
    if (b - a < 1 || e - c < 1) return;
    this.add('light', (a + b) / 2, y, c, b - a, 0.04, 0.06, glow);
    this.add('light', (a + b) / 2, y, e, b - a, 0.04, 0.06, glow);
    this.add('light', a, y, (c + e) / 2, 0.06, 0.04, e - c, glow);
    this.add('light', b, y, (c + e) / 2, 0.06, 0.04, e - c, glow);
  }

  coffers(step, color = PAL.gold, mat = 'gold') {
    const y = WALL_H - 0.08;
    const nx = Math.max(1, Math.round(this.w / step));
    const nz = Math.max(1, Math.round(this.d / step));
    for (let i = 1; i < nx; i++) this.add(mat, this.x1 + (i * this.w) / nx, y, this.cz, 0.12, 0.1, this.d - 0.6, color);
    for (let j = 1; j < nz; j++) this.add(mat, this.cx, y, this.z1 + (j * this.d) / nz, this.w - 0.6, 0.1, 0.12, color);
  }

  pendant(x, z, glow = GLOW.warm, drop = 0.7, shade = 0.3) {
    this.add('gold', x, WALL_H - drop / 2, z, 0.02, drop, 0.02, PAL.gold);
    this.add('gold', x, WALL_H - drop + 0.02, z, shade + 0.04, 0.03, shade + 0.04, PAL.gold);
    this.add('light', x, WALL_H - drop - 0.05, z, shade, 0.12, shade, glow);
  }

  lantern(x, y, z, glow = GLOW.amber, s = 0.3) {
    this.add('gold', x, y + s / 2 + 0.03, z, s * 0.6, 0.05, s * 0.6, PAL.gold);
    this.add('glass', x, y, z, s, s, s, PAL.cream);
    this.add('light', x, y, z, s * 0.4, s * 0.5, s * 0.4, glow);
    this.add('gold', x, y - s / 2 - 0.03, z, s * 0.6, 0.05, s * 0.6, PAL.gold);
  }

  // ---------------------------------------------------------------- lantai
  flat(mat, x, z, sx, sz, color, layer = 0, ry = 0) { this.add(mat, x, 0.0745 + layer * 0.004, z, sx, 0.003, sz, color, ry); }

  border(inset, th, color, mat = 'gold', layer = 0) {
    const a = this.x1 + inset;
    const b = this.x2 - inset;
    const c = this.z1 + inset;
    const e = this.z2 - inset;
    if (b - a < 1 || e - c < 1) return;
    this.flat(mat, (a + b) / 2, c, b - a, th, color, layer);
    this.flat(mat, (a + b) / 2, e, b - a, th, color, layer);
    this.flat(mat, a, (c + e) / 2, th, e - c, color, layer);
    this.flat(mat, b, (c + e) / 2, th, e - c, color, layer);
  }

  medallion(x, z, s, a = PAL.gold, b = PAL.onyx, c = PAL.ivory) {
    this.flat('gold', x, z, s, s, a, 0);
    this.flat('marble', x, z, s - 0.5, s - 0.5, b, 1);
    this.flat('gold', x, z, s * 0.66, s * 0.66, a, 2, Math.PI / 4);
    this.flat('marble', x, z, s * 0.52, s * 0.52, c, 3, Math.PI / 4);
    this.flat('gold', x, z, s * 0.16, s * 0.16, a, 4);
  }

  rug(x, z, sx, sz, ry, color, edge = null) {
    this.flat('velvet', x, z, sx, sz, color, 0, ry);
    if (!edge) return;
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
    const t = 0.07;
    const m = 0.12;
    for (const sg of [-1, 1]) {
      const p = at(0, sg * (sz / 2 - m));
      this.flat('gold', p[0], p[1], sx - 2 * m + t, t, edge, 1, ry);
      const q = at(sg * (sx / 2 - m), 0);
      this.flat('gold', q[0], q[1], t, sz - 2 * m + t, edge, 1, ry);
    }
  }

  runner(x1, z1, x2, z2, width, color, edge = PAL.gold) {
    const horiz = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const len = horiz ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    this.flat('velvet', cx, cz, horiz ? len : width, horiz ? width : len, color, 0);
    for (const sg of [-1, 1]) {
      const o = sg * (width / 2 - 0.05);
      this.flat('gold', horiz ? cx : cx + o, horiz ? cz + o : cz, horiz ? len : 0.06, horiz ? 0.06 : len, edge, 1);
    }
  }

  // ---------------------------------------------------------------- dinding
  pilasters(sides, every = 8, { shaft = PAL.ivory, mat = 'marble', w = 0.5, dep = 0.16, top = 3.3, cap = PAL.gold } = {}) {
    const h = top - 0.28;
    for (const s of sides) {
      for (const t of this.marks(s, every, w + 0.3)) {
        this.wallBox(s, t, 0.1, w + 0.12, 0.2, dep + 0.04, PAL.onyx, 'marble');
        this.wallBox(s, t, 0.2 + h / 2, w, h, dep, shaft, mat);
        this.wallBox(s, t, top, w + 0.16, 0.16, dep + 0.06, cap, 'gold');
      }
    }
  }

  sconces(side, every, glow = GLOW.amber) {
    for (const t of this.marks(side, every, 0.3, 0.6)) {
      this.wallBox(side, t, 2.1, 0.16, 0.34, 0.1, PAL.gold, 'gold');
      this.wallBox(side, t, 2.38, 0.12, 0.2, 0.12, glow, 'light');
    }
  }

  panels(side, { y = 1.9, h = 1.6, w = 1.3, gap = 0.25, color = PAL.burgundy, mat = 'velvet', frame = PAL.gold } = {}) {
    for (const t of this.marks(side, w + gap, w + 0.1)) {
      this.wallBox(side, t, y, w, h, 0.07, color, mat);
      this.wallBox(side, t, y + h / 2, w + 0.1, 0.05, 0.09, frame, 'gold');
      this.wallBox(side, t, y - h / 2, w + 0.1, 0.05, 0.09, frame, 'gold');
    }
  }

  mirrors(side, every, { w = 1.4, h = 2.2, y = 1.8 } = {}) {
    for (const t of this.marks(side, every, w + 0.3)) {
      this.wallBox(side, t, y, w + 0.16, h + 0.16, 0.06, PAL.gold, 'gold');
      this.wallBox(side, t, y, w, h, 0.08, PAL.sky, 'glass');
    }
  }

  curtain(side, t, len, color, h = 3.5, mat = 'velvet') {
    this.wallBox(side, t, h / 2 + 0.1, len, h, 0.22, color, mat);
    this.wallBox(side, t, h + 0.14, len + 0.3, 0.07, 0.3, PAL.gold, 'gold');
    this.wallBox(side, t, 1.2, len + 0.02, 0.05, 0.26, PAL.gold, 'gold');
  }

  books(side, t, len, rows = 4) {
    for (let r = 0; r < rows; r++) {
      const base = 0.55 + r * 0.62;
      this.wallBox(side, t, base, len, 0.04, 0.22, PAL.walnut, 'wood');
      const n = Math.floor(len / 0.2);
      for (let i = 0; i < n; i++) {
        const h = 0.38 + hash(i, r + t) * 0.16;
        this.wallBox(side, t - len / 2 + (i + 0.5) * (len / n), base + 0.02 + h / 2, (len / n) * 0.86, h, 0.16, SPINES[Math.floor(hash(i + 3, r) * SPINES.length)], 'matte');
      }
    }
  }

  mosaic(side, t, len, h, palette, y0 = 0.4) {
    const nx = Math.floor(len / 0.45);
    const ny = Math.floor(h / 0.45);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const color = palette[Math.floor(hash(i, j + t) * palette.length)];
        this.wallBox(side, t - len / 2 + (i + 0.5) * (len / nx), y0 + (j + 0.5) * (h / ny), len / nx - 0.03, h / ny - 0.03, 0.05, color, 'marble');
      }
    }
  }

  roses(side, t, len, h, y0 = 0.5) {
    const nx = Math.floor(len / 0.3);
    const ny = Math.floor(h / 0.3);
    this.wallBox(side, t, y0 + h / 2, len, h, 0.06, PAL.leaf, 'velvet');
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        if (hash(i, j + t) < 0.18) continue;
        this.wallBox(side, t - len / 2 + (i + 0.5) * (len / nx), y0 + (j + 0.5) * (h / ny), 0.22, 0.22, 0.14, FLOWERS[Math.floor(hash(j, i + t) * FLOWERS.length)], 'velvet');
      }
    }
  }

  trellis(side, t, len, h) {
    const nx = Math.floor(len / 0.5);
    const ny = Math.floor(h / 0.5);
    for (let i = 0; i <= nx; i++) this.wallBox(side, t - len / 2 + (i * len) / nx, 0.3 + h / 2, 0.04, h, 0.07, PAL.walnut, 'wood');
    for (let j = 0; j <= ny; j++) this.wallBox(side, t, 0.3 + (j * h) / ny, len, 0.04, 0.09, PAL.walnut, 'wood');
    for (let k = 0; k < 26; k++) this.wallBox(side, t - len / 2 + hash(k, 1) * len, 0.35 + hash(k, 2) * h, 0.3, 0.26, 0.16, hash(k, 3) < 0.2 ? PAL.coral : PAL.leaf, 'matte');
  }

  // ---------------------------------------------------------------- tempat tidur dan langit
  canopy(p, { post = PAL.gold, drape = PAL.blush, h = 2.5, drapeMat = 'glass' } = {}) {
    const hw = p.type === 'bed_s' ? 1.0 : p.w ? p.w / 2 + 0.1 : 1.2;
    const hz = 1.3;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.addLocal(p, 'gold', sx * hw, h / 2, sz * hz, 0.08, h, 0.08, post);
    for (const sz of [-1, 1]) this.addLocal(p, 'gold', 0, h, sz * hz, 2 * hw + 0.08, 0.06, 0.06, post);
    for (const sx of [-1, 1]) {
      this.addLocal(p, 'gold', sx * hw, h, 0, 0.06, 0.06, 2 * hz, post);
      this.addLocal(p, drapeMat, sx * hw, h / 2 + 0.1, 0, 0.03, h - 0.3, 2 * hz, drape);
    }
    this.addLocal(p, 'velvet', 0, h - 0.12, -hz, 2 * hw, 0.24, 0.05, drape);
  }

  ceilingRose(x, z, s, glow = GLOW.warm) {
    this.add('gold', x, WALL_H - 0.05, z, s, 0.04, s, PAL.gold);
    this.add('gold', x, WALL_H - 0.08, z, s * 0.66, 0.03, s * 0.66, PAL.gold, Math.PI / 4);
    this.add('light', x, WALL_H - 0.11, z, s * 0.3, 0.03, s * 0.3, glow);
  }

  starCeiling(step, glow = GLOW.warm) {
    for (let x = this.x1 + step / 2; x < this.x2 - 0.5; x += step) {
      for (let z = this.z1 + step / 2; z < this.z2 - 0.5; z += step) {
        if (hash(x, z) < 0.35) continue;
        this.add('light', x + (hash(z, x) - 0.5) * step * 0.6, WALL_H - 0.06, z + (hash(x, z + 1) - 0.5) * step * 0.6, 0.08, 0.03, 0.08, glow);
      }
    }
  }

  // ---------------------------------------------------------------- teras terbuka
  torch(x, z, glow = GLOW.amber) {
    this.add('gold', x, 0.8, z, 0.06, 1.6, 0.06, PAL.gold);
    this.add('gold', x, 1.62, z, 0.2, 0.05, 0.2, PAL.gold);
    this.add('light', x, 1.76, z, 0.12, 0.2, 0.12, glow);
  }

  planter(x, z, sx, sz, flowers = true) {
    this.add('wood', x, 0.3, z, sx, 0.6, sz, PAL.walnut);
    this.add('gold', x, 0.62, z, sx + 0.04, 0.04, sz + 0.04, PAL.gold);
    this.add('matte', x, 0.85, z, sx - 0.1, 0.45, sz - 0.1, PAL.leaf);
    if (flowers) for (let k = 0; k < 4; k++) this.add('matte', x + (hash(k, x) - 0.5) * (sx - 0.3), 1.12, z + (hash(k, z) - 0.5) * (sz - 0.3), 0.14, 0.14, 0.14, FLOWERS[k % FLOWERS.length]);
  }

  pergola(post = PAL.white, beam = PAL.white, glow = GLOW.amber) {
    const a = this.x1 + 0.5;
    const b = this.x2 - 0.5;
    const c = this.z1 + 0.5;
    const e = this.z2 - 0.5;
    if (b - a < 2 || e - c < 2) return;
    const zs = [];
    const nz = Math.max(1, Math.ceil((e - c) / 8));
    for (let k = 0; k <= nz; k++) zs.push(c + (k * (e - c)) / nz);
    for (const x of [a, b]) for (const z of zs) this.add('matte', x, 1.7, z, 0.16, 3.4, 0.16, post);
    for (const z of zs) this.add('matte', this.cx, 3.42, z, b - a + 0.3, 0.12, 0.14, beam);
    for (const x of [a, b]) this.add('matte', x, 3.42, this.cz, 0.14, 0.12, e - c + 0.3, beam);
    for (let z = c + 1; z < e; z += 2.2) this.add('wood', this.cx, 3.5, z, b - a + 0.3, 0.05, 0.07, PAL.walnut);
    for (let z = c + 0.8; z < e; z += 1.6) {
      this.add('light', a + 0.4, 3.32, z, 0.07, 0.07, 0.07, glow);
      this.add('light', b - 0.4, 3.32, z, 0.07, 0.07, 0.07, glow);
    }
  }
}

// ---------------------------------------------------------------- tema per ruangan
const THEMES = {};
const def = (ids, fn) => { for (const id of ids.split(' ')) THEMES[id] = fn; };
const everyThird = (list) => list.filter((_, i) => i % 3 === 0);

def('lobby', (D) => {
  D.coffers(9);
  D.frieze();
  D.cove(GLOW.amber);
  D.pilasters(D.innerSides(), 9);
  for (let k = -3; k <= 3; k++) {
    const x = D.cx + k * 26;
    if (x > D.x1 + 8 && x < D.x2 - 8) D.medallion(x, D.cz, 6.5);
  }
  for (const p of D.of('desk')) {
    if (!D.free('s', p.x, 6.6, 0.1)) continue;
    D.wallBox('s', p.x, 1.9, 6.4, 2.6, 0.08, PAL.ivory, 'marble');
    D.wallBox('s', p.x, 3.22, 6.6, 0.08, 0.1, PAL.gold, 'gold');
    D.wallBox('s', p.x, 0.58, 6.6, 0.08, 0.1, PAL.gold, 'gold');
    for (const sg of [-1, 1]) D.wallBox('s', p.x + sg * 3.26, 1.9, 0.08, 2.7, 0.1, PAL.gold, 'gold');
    D.wallBox('s', p.x, 0.5, 6.2, 0.04, 0.06, GLOW.amber, 'light');
  }
});

def('concierge', (D) => {
  D.frieze(PAL.brass);
  D.cove(GLOW.amber);
  D.run(D.innerSides(), 1.9, 3.2, 0.05, PAL.walnut, 'wood');
  D.run(D.innerSides(), 1.25, 0.05, 0.09, PAL.brass, 'gold');
  for (const t of D.marks('s', 2.6, 0.8)) { // jam dunia di belakang meja
    D.wallBox('s', t, 2.95, 0.72, 0.72, 0.07, PAL.brass, 'gold');
    D.wallBox('s', t, 2.95, 0.58, 0.58, 0.09, PAL.cream, 'matte');
  }
  D.border(0.9, 0.08, PAL.brass);
});

def('lobby_cafe', (D) => {
  D.frieze(PAL.brass);
  D.cove(GLOW.amber);
  for (const t of everyThird(D.of('table'))) D.pendant(t.x, t.z, GLOW.amber, 0.8, 0.3);
  for (const s of D.innerSides()) D.panels(s, { y: 1.9, h: 1.7, w: 1.5, gap: 1.5, color: PAL.emerald });
  D.run(D.innerSides().slice(0, 1), 1.0, 1.3, 0.1, PAL.leaf, 'matte'); // dinding tanaman
  D.border(1.0, 0.1, PAL.gold);
});

const dining = (wall, trim, glow, extra) => (D) => {
  D.coffers(6.5, trim);
  D.frieze(trim);
  D.cove(glow);
  for (const t of everyThird(D.of('table'))) D.pendant(t.x, t.z, glow, 0.85, 0.34);
  for (const s of D.innerSides()) {
    D.panels(s, { y: 1.95, h: 1.7, w: 1.6, gap: 1.4, color: wall });
    D.sconces(s, 5.5, glow);
  }
  D.border(1.0, 0.1, trim);
  if (extra) extra(D);
};
def('grand_dining', dining(PAL.burgundy, PAL.gold, GLOW.amber));
def('specialty_dining', dining(PAL.walnut, PAL.brass, GLOW.amber, (D) => { // ruang anggur: dinding botol
  const s = D.innerSides()[0];
  if (s) {
    const [a, b] = D.span(s);
    const t = (a + b) / 2;
    if (D.free(s, t, 10, 0.2)) D.bottleWall(s, t, 10);
  }
}));
def('sky_dining', dining(PAL.sapphire, PAL.silver, GLOW.ice));

Deco.prototype.bottleWall = function bottleWall(side, t, len) {
  const bottles = [0x2a6b4f, 0xa23b3b, 0xd4af37, 0x2b5aa0, 0x6a2c70];
  for (let r = 0; r < 4; r++) {
    const base = 0.7 + r * 0.6;
    this.wallBox(side, t, base, len, 0.04, 0.26, PAL.walnut, 'wood');
    const n = Math.floor(len / 0.24);
    for (let i = 0; i < n; i++) this.wallBox(side, t - len / 2 + (i + 0.5) * (len / n), base + 0.2, 0.09, 0.34, 0.1, bottles[Math.floor(hash(i, r) * bottles.length)], 'glass');
  }
  this.wallBox(side, t, 0.35, len, 0.7, 0.3, PAL.mahogany, 'wood');
};

const service = (D) => {
  D.run(D.innerSides(), 0.9, 1.6, 0.04, PAL.white, 'marble'); // dinding keramik
  D.run(D.innerSides(), 1.72, 0.05, 0.07, PAL.steel, 'gold');
  D.cove(GLOW.warm);
  for (const p of D.of('stove')) { // penghisap asap baja di atas kompor
    D.addLocal(p, 'gold', 0, 2.65, 0, 1.3, 0.5, 0.8, PAL.steel);
    D.addLocal(p, 'gold', 0, 3.3, 0, 0.4, 0.8, 0.4, PAL.steel);
  }
};
def('kitchen catering', service);
def('butler', (D) => {
  service(D);
  D.frieze(PAL.silver);
});

def('ballroom', (D) => {
  D.coffers(7);
  D.frieze();
  D.cove(GLOW.rose);
  D.pilasters(D.innerSides(), 8.5);
  D.border(1.1, 0.14, PAL.gold);
  for (const s of D.innerSides()) D.sconces(s, 6, GLOW.amber);
  for (const p of D.of('stage')) D.curtain('n', p.x, (p.w ?? 14) + 2.4, PAL.burgundy, 3.5); // latar panggung
});

def('bridal_suite', (D) => {
  D.frieze(PAL.rosegold);
  D.cove(GLOW.rose);
  for (const p of D.of('bed')) {
    D.canopy(p, { post: PAL.rosegold, drape: PAL.blush });
    D.roses('n', p.x, 3.4, 2.0); // dinding mawar di belakang ranjang
  }
  D.rug(D.cx, D.cz + 4, Math.min(6, D.w - 2), 4, 0, PAL.blush, PAL.rosegold);
});

def('foyer', (D) => {
  D.frieze();
  D.cove(GLOW.amber);
  for (const s of D.innerSides()) D.mirrors(s, 6);
  D.runner(D.cx, D.z1 + 2, D.cx, D.z2 - 2, 2.2, PAL.burgundy);
  D.pilasters(D.innerSides(), 9);
});

const exec = (panel, trim, glow) => (D) => {
  D.frieze(trim);
  D.cove(glow);
  for (const s of D.innerSides()) D.panels(s, { y: 2.2, h: 1.5, w: 1.4, gap: 0.5, color: panel, frame: trim });
  for (const p of D.of('conf_table')) { // lampu garis di atas meja rapat
    for (const sg of [-1, 1]) D.add('gold', p.x + sg * ((p.w ?? 8) / 2 - 0.5), WALL_H - 0.35, p.z, 0.02, 0.7, 0.02, PAL.gold);
    D.add('light', p.x, WALL_H - 0.72, p.z, (p.w ?? 8) - 1, 0.06, 0.3, glow);
  }
  D.border(1.0, 0.08, trim);
};
def('meeting_center', exec(PAL.navy, PAL.silver, GLOW.ice));
def('business_center', exec(PAL.slate, PAL.brass, GLOW.warm));

def('spa', (D) => {
  D.frieze(PAL.bamboo);
  D.cove(GLOW.amber);
  D.run(D.innerSides(), 1.9, 3.2, 0.05, PAL.bamboo, 'wood');
  for (const p of D.of('massage_bed')) D.canopy(p, { post: PAL.bamboo, drape: PAL.white, h: 2.3 });
  for (const x of [D.x1 + 2, D.x2 - 2]) for (const z of [D.z1 + 2, D.z2 - 2]) D.lantern(x, 2.4, z, GLOW.amber, 0.34);
  D.border(0.9, 0.5, PAL.slate, 'marble');
});

def('sauna', (D) => {
  D.run(D.innerSides(), 1.9, 3.4, 0.06, PAL.cedar, 'wood');
  D.run(SIDES.filter((s) => D.perimeter(s)), 3.46, 0.36, 0.1, PAL.cedar, 'wood');
  D.add('wood', D.cx, WALL_H - 0.05, D.cz, D.w - 0.4, 0.06, D.d - 0.4, PAL.cedar);
  for (const p of D.of('sauna_bench')) D.addLocal(p, 'light', 0, 0.3, (p.d ?? 0.7) / 2, Math.max(0.5, (p.w ?? 2) - 0.2), 0.04, 0.04, GLOW.amber);
});

def('salon', (D) => {
  D.frieze(PAL.rosegold);
  D.cove(GLOW.rose);
  for (const p of D.of('mirror_station')) D.pendant(p.x, p.z, GLOW.rose, 0.8, 0.3);
  for (const s of D.innerSides()) D.panels(s, { y: 1.9, h: 1.6, w: 1.3, gap: 0.8, color: PAL.blush });
  D.border(0.9, 0.08, PAL.rosegold);
});

def('indoor_pool', (D) => {
  D.frieze(PAL.gold);
  D.cove(GLOW.ice);
  for (const s of D.innerSides()) {
    const [a, b] = D.span(s);
    const t = (a + b) / 2;
    if (D.free(s, t, 9, 0.2)) D.mosaic(s, t, 9, 2.7, [PAL.turquoise, PAL.sky, PAL.teal, PAL.white, PAL.gold]);
  }
  for (const x of [D.x1 + 1.2, D.x2 - 1.2]) for (const z of [D.z1 + 1.2, D.z2 - 1.2]) D.lantern(x, 2.6, z, GLOW.ice, 0.3);
});

def('infinity_pool', (D) => { // dek kolam di udara terbuka: obor emas di tepi
  const a = D.x1 + 0.8;
  const b = D.x2 - 0.8;
  const c = D.z1 + 0.8;
  const e = D.z2 - 0.8;
  if (b - a < 2 || e - c < 2) return;
  for (let x = a; x <= b + 0.01; x += Math.max(4, (b - a) / Math.max(1, Math.round((b - a) / 9)))) { D.torch(x, c); D.torch(x, e); }
  for (let z = c + 9; z < e - 3; z += 9) { D.torch(a, z); D.torch(b, z); }
});

def('gym', (D) => {
  D.cove(GLOW.cyan);
  D.cove(GLOW.violet, 0.6, WALL_H - 0.36);
  D.frieze(PAL.onyx);
  for (const s of D.innerSides()) D.mirrors(s, 5, { w: 3.4, h: 2.2, y: 1.6 });
});

def('yoga', (D) => {
  D.frieze(PAL.bamboo);
  D.cove(GLOW.violet);
  D.run(D.innerSides(), 1.9, 3.2, 0.05, PAL.bamboo, 'wood');
  for (let x = D.x1 + 3; x < D.x2 - 1.5; x += 5) for (let z = D.z1 + 3; z < D.z2 - 1.5; z += 6) D.lantern(x, 2.9, z, GLOW.amber, 0.3);
});

def('arcade_shops', (D) => {
  D.frieze();
  D.cove(GLOW.warm);
  for (let z = D.z1 + 4; z < D.z2 - 2; z += 7) for (let x = D.x1 + 5; x < D.x2 - 4; x += 9) D.add('light', x, WALL_H - 0.06, z, 2.4, 0.04, 0.1, GLOW.warm);
  for (const s of D.innerSides()) {
    for (const t of D.marks(s, 14, 6)) { // etalase toko berportal emas
      D.wallBox(s, t, 1.5, 5.4, 2.6, 0.06, PAL.sky, 'glass');
      D.wallBox(s, t, 2.9, 6.0, 0.28, 0.14, PAL.onyx, 'marble');
      D.wallBox(s, t, 3.06, 6.0, 0.05, 0.16, PAL.gold, 'gold');
      for (const sg of [-1, 1]) D.wallBox(s, t + sg * 2.95, 1.55, 0.22, 3.1, 0.14, PAL.gold, 'gold');
      D.wallBox(s, t, 2.7, 4.8, 0.05, 0.1, GLOW.warm, 'light');
    }
  }
  for (let k = -2; k <= 2; k++) {
    const x = D.cx + k * 26;
    if (x > D.x1 + 8 && x < D.x2 - 8) D.medallion(x, D.cz, 5);
  }
});

def('musholla', (D) => {
  D.frieze(PAL.emerald);
  D.run(D.innerSides(), 3.46, 0.06, 0.12, PAL.gold, 'gold');
  D.cove(GLOW.warm);
  for (const s of D.innerSides()) { // panel kisi geometris
    for (const t of D.marks(s, 4, 1.8)) {
      D.wallBox(s, t, 1.9, 1.9, 2.4, 0.07, PAL.gold, 'gold');
      D.wallBox(s, t, 1.9, 1.7, 2.2, 0.09, PAL.emerald, 'velvet');
      D.wallBox(s, t, 1.9, 0.9, 0.9, 0.11, PAL.gold, 'gold');
      D.wallBox(s, t, 1.9, 0.62, 0.62, 0.12, PAL.ivory, 'marble');
    }
  }
  D.add('gold', D.cx, WALL_H - 0.07, D.cz, 3.2, 0.04, 3.2, PAL.gold); // bintang delapan di langit-langit
  D.add('gold', D.cx, WALL_H - 0.09, D.cz, 3.2, 0.04, 3.2, PAL.gold, Math.PI / 4);
  D.add('light', D.cx, WALL_H - 0.11, D.cz, 1.0, 0.03, 1.0, GLOW.warm);
  for (let x = D.x1 + 4; x < D.x2 - 2; x += 5) for (let z = D.z1 + 3.5; z < D.z2 - 2; z += 7) D.lantern(x, 2.9, z, GLOW.amber, 0.32);
  for (const p of D.of('mihrab')) { // bingkai lengkung emas
    const w = p.w ?? 2.4;
    for (const sg of [-1, 1]) D.addLocal(p, 'gold', sg * (w / 2 + 0.12), 1.4, 0.1, 0.14, 2.8, 0.14, PAL.gold);
    D.addLocal(p, 'gold', 0, 2.85, 0.1, w + 0.5, 0.16, 0.14, PAL.gold);
  }
});

def('kids_club', (D) => {
  const bands = [PAL.coral, PAL.butter, PAL.mint, PAL.sky, PAL.lilac];
  bands.forEach((c, i) => D.run(D.innerSides(), 3.05 + i * 0.1, 0.09, 0.08, c, 'matte'));
  D.cove(GLOW.amber);
  D.starCeiling(1.6, GLOW.amber);
  for (const [i, c] of [PAL.coral, PAL.butter, PAL.mint, PAL.sky].entries()) D.flat('velvet', D.cx, D.cz, Math.max(1, Math.min(7, D.w - 1)) - i * 1.1, Math.max(1, Math.min(9, D.d - 3)) - i * 1.1, c, i);
  for (let k = 0; k < 6; k++) D.add('matte', D.x1 + 1.5 + hash(k, 1) * (D.w - 3), WALL_H - 0.5, D.z1 + 1.5 + hash(k, 2) * (D.d - 3), 1.1, 0.35, 0.7, PAL.white); // awan
});

def('cinema', (D) => {
  D.frieze(PAL.gold);
  D.run(D.innerSides(), 3.0, 0.05, 0.12, PAL.gold, 'gold');
  for (const s of D.innerSides()) D.panels(s, { y: 1.9, h: 1.9, w: 1.5, gap: 0.3, color: PAL.burgundy });
  D.starCeiling(1.4, GLOW.warm);
  for (const p of D.of('screen')) { // tirai beludru dan bingkai emas di sekeliling layar
    const w = p.w ?? 8;
    for (const sg of [-1, 1]) D.addLocal(p, 'velvet', sg * (w / 2 + 0.9), 1.9, 0.3, 1.6, 3.6, 0.35, PAL.burgundy);
    D.addLocal(p, 'velvet', 0, 3.55, 0.3, w + 3.4, 0.45, 0.4, PAL.burgundy);
    D.addLocal(p, 'gold', 0, 3.3, 0.18, w + 0.4, 0.07, 0.07, PAL.gold);
  }
  for (const sg of [-1, 1]) D.flat('light', (D.x1 + 5 + D.x2 - 2) / 2, D.cz + sg * 0.85, D.w - 7.5, 0.04, GLOW.amber, 0); // lampu lorong
});

def('game_zone', (D) => {
  D.cove(GLOW.cyan);
  D.cove(GLOW.pink, 0.6, WALL_H - 0.36);
  D.frieze(PAL.onyx);
  D.run(D.innerSides(), 2.8, 0.05, 0.08, GLOW.pink, 'light');
  D.run(D.innerSides(), 1.9, 0.05, 0.08, GLOW.cyan, 'light');
  D.border(0.6, 0.08, GLOW.pink, 'light');
});

def('library', (D) => {
  D.coffers(5, PAL.walnut, 'wood');
  D.frieze(PAL.brass);
  D.cove(GLOW.amber);
  D.run(D.innerSides(), 2.3, 0.04, 0.2, PAL.brass, 'gold');
  for (const s of D.innerSides().slice(0, 2)) {
    for (const k of [-16, 16]) {
      const t = (s === 'n' || s === 's' ? D.cx : D.cz) + k;
      const [a, b] = D.span(s);
      if (t - 2.5 > a && t + 2.5 < b && D.free(s, t, 5, 0.2) && !D.props.some((p) => p.type === 'shelf' && Math.abs((s === 'n' || s === 's' ? p.x : p.z) - t) < 3.5)) D.books(s, t, 5);
    }
  }
  D.border(1.0, 0.08, PAL.brass);
});

const lounge = (glow, accent) => (D) => {
  D.coffers(8, accent);
  D.frieze(accent);
  D.cove(glow);
  D.pilasters(D.innerSides(), 9, { shaft: PAL.champagne, mat: 'velvet' });
  for (const t of D.of('coffee_table')) D.pendant(t.x, t.z, glow, 0.9, 0.4);
  D.border(1.1, 0.1, accent);
};
def('exec_lounge', lounge(GLOW.amber, PAL.gold));
def('sky_lounge', lounge(GLOW.violet, PAL.silver));

const suite = ({ wall, trim, glow, rug, canopy, extra }) => (D) => {
  D.coffers(6, trim);
  D.frieze(trim);
  D.cove(glow);
  if (canopy) for (const p of D.of('bed')) D.canopy(p, canopy);
  D.rug(D.cx, D.cz + 2, Math.min(7, D.w - 2), 5, 0, rug, trim);
  for (const s of D.innerSides()) D.panels(s, { y: 1.95, h: 1.7, w: 1.5, gap: 1.5, color: wall, frame: trim });
  if (extra) extra(D);
};
def('royal_suite', suite({ wall: PAL.wine, trim: PAL.gold, glow: GLOW.amber, rug: PAL.wine, canopy: { post: PAL.gold, drape: PAL.burgundy, drapeMat: 'velvet' }, extra: (D) => { D.pilasters(D.innerSides(), 7); if (D.perimeter('n')) D.curtain('n', D.cx, Math.min(D.w - 1, 4), PAL.wine); } }));
def('presidential_suite', suite({ wall: PAL.navy, trim: PAL.silver, glow: GLOW.ice, rug: PAL.navy, canopy: null, extra: (D) => { D.pilasters(D.innerSides(), 7, { shaft: PAL.silver, cap: PAL.silver }); } }));
def('sultan_suite', suite({ wall: PAL.emerald, trim: PAL.gold, glow: GLOW.amber, rug: PAL.emerald, canopy: { post: PAL.gold, drape: PAL.emerald, h: 2.7, drapeMat: 'velvet' }, extra: (D) => {
  for (const s of D.innerSides()) {
    for (const t of D.marks(s, 6, 2.2)) { // lengkung emas
      for (const sg of [-1, 1]) D.wallBox(s, t + sg * 1.05, 1.45, 0.16, 2.9, 0.14, PAL.gold, 'gold');
      D.wallBox(s, t, 2.95, 2.4, 0.16, 0.14, PAL.gold, 'gold');
    }
  }
  for (let z = D.z1 + 3; z < D.z2 - 2; z += 6) for (const x of [D.x1 + 1.5, D.x2 - 1.5]) D.lantern(x, 2.8, z, GLOW.amber, 0.32);
} }));
def('garden_suite', suite({ wall: PAL.leaf, trim: PAL.brass, glow: GLOW.green, rug: PAL.jade, canopy: { post: PAL.walnut, drape: PAL.white }, extra: (D) => {
  for (const s of D.innerSides().slice(0, 2)) {
    const [a, b] = D.span(s);
    const t = (a + b) / 2;
    if (D.free(s, t, 4, 0.2)) D.trellis(s, t, 4, 2.8);
  }
  for (let z = D.z1 + 3; z < D.z2 - 2; z += 7) { D.planter(D.x1 + 1.0, z, 0.8, 1.4); D.planter(D.x2 - 1.0, z, 0.8, 1.4); }
} }));

def('sky_terrace_w sky_terrace_e', (D) => {
  D.pergola();
  for (let z = D.z1 + 3; z < D.z2 - 2; z += 8) { D.planter(D.x1 + 0.9, z, 0.7, 1.6); D.planter(D.x2 - 0.9, z, 0.7, 1.6); }
});

def('sky_spa', (D) => { // Sky Chapel & Wedding Deck
  D.frieze(PAL.white);
  D.cove(GLOW.rose);
  for (const s of D.innerSides()) for (const t of D.marks(s, 4, 1.8)) D.curtain(s, t, 1.8, PAL.white, 3.5, 'glass');
  D.runner(D.cx, D.z1 + 3.4, D.cx, D.z2 - 1.5, 1.6, PAL.burgundy, PAL.gold);
  for (const p of D.of('arch')) { // lengkung bunga
    const w = p.w ?? 4;
    D.addLocal(p, 'matte', 0, 2.55, 0.05, w, 0.4, 0.3, PAL.white);
    for (let k = 0; k < 9; k++) D.addLocal(p, 'matte', (hash(k, 1) - 0.5) * w, 2.5 + hash(k, 2) * 0.35, 0.12, 0.22, 0.22, 0.2, FLOWERS[k % FLOWERS.length]);
  }
  for (const p of D.of('pew')) { // bunga di ujung bangku sisi lorong
    D.add('matte', p.x + Math.sign(D.cx - p.x) * 1.05, 0.98, p.z, 0.2, 0.2, 0.2, FLOWERS[Math.floor(hash(p.x, p.z) * FLOWERS.length)]);
    D.add('matte', p.x + Math.sign(D.cx - p.x) * 1.05, 0.84, p.z, 0.12, 0.1, 0.12, PAL.leaf);
  }
});

// Kamar tamu menurut kelas lantainya (floorName): Deluxe, Premier, Grand Premier, Royal Residence.
const TIER = Object.freeze({ Deluxe: 'deluxe', Premier: 'premier', 'Grand Premier': 'grand', 'Royal Residence': 'royal' });
export const guestTier = (level) => TIER[floorName(level)] ?? 'deluxe';
const TIERS = Object.freeze({
  deluxe: { rug: PAL.sand, trim: PAL.brass },
  premier: { rug: PAL.emerald, trim: PAL.gold },
  grand: { rug: PAL.sapphire, trim: PAL.gold },
  royal: { rug: PAL.wine, trim: PAL.gold },
});
THEMES.guest = (D) => {
  const tier = guestTier(D.level);
  const t = TIERS[tier];
  D.frieze(t.trim);
  if (tier !== 'deluxe') D.cove(GLOW.amber);
  const bed = D.props.find((p) => p.tag === 'bed');
  if (bed) {
    const bw = bed.type === 'bed_s' ? 1.6 : 2.1;
    const rc = D.local(bed, 0, 0.7);
    D.rug(rc.x, rc.z, bw + 0.7, 3.0, bed.ry ?? 0, t.rug, tier === 'deluxe' ? null : PAL.gold);
    if (tier === 'royal' && D.w >= 4.5 && D.d >= 4.5) D.canopy(bed, { post: PAL.gold, drape: PAL.wine, drapeMat: 'velvet', h: 2.5 });
  }
  if (tier === 'grand' || tier === 'royal') D.ceilingRose(D.cx, D.cz, tier === 'royal' ? 1.6 : 1.1, GLOW.amber);
};

const GENERIC = (D) => { D.frieze(); D.cove(GLOW.warm); };

/** Nama tema satu ruang (id dasar tanpa akhiran Sky Lobby _lN), atau null bila ruang memakai tema umum. */
export function themeFor(room) {
  if (room.kind === 'guest') return 'guest';
  const key = room.id.replace(/_l\d+$/, '');
  return THEMES[key] ? key : null;
}

export const DECOR_THEMES = Object.freeze(Object.keys(THEMES));

/** Hiasan satu ruang: { matte, wood, gold, marble, velvet, glass, light }, tiap isi { x, y, z, sx, sy, sz, ry, color }. */
export function roomDecor(room, ctx, props = []) {
  const D = new Deco(room, ctx, props);
  if (room.kind === 'core') return D.out;
  const key = themeFor(room);
  (key ? THEMES[key] : GENERIC)(D);
  return D.out;
}

/**
 * Hiasan satu lantai. ctx = { L (lantai dari getHotelWorld), l (indeks lantai), y0 (tinggi lantai), F (tapak lantai) }.
 * Hasilnya digabung ke bucket bahan di buildLuxeLevel (hotel-luxe.js).
 */
export function levelDecor({ L, l, y0, F }) {
  const out = Object.fromEntries(DECOR_MATS.map((m) => [m, []]));
  const byRoom = new Map();
  for (const p of L.props) {
    if (!byRoom.has(p.room)) byRoom.set(p.room, []);
    byRoom.get(p.room).push(p);
  }
  const ctx = { y0, F, doors: L.doors, level: l };
  for (const room of L.rooms) {
    const d = roomDecor(room, ctx, byRoom.get(room.id) ?? []);
    for (const m of DECOR_MATS) for (const q of d[m]) out[m].push(q);
  }
  return out;
}
