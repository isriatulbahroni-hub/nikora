// Penataan perabot hotel: kamar tamu lengkap (tempat tidur, kamar mandi, sofa, meja kerja, lemari, TV, AC, lampu)
// dan semua fasilitas publik (restoran, ballroom, spa, gym, bioskop, musala, ...). Data murni (tanpa THREE).
//
// Aturan penataan:
//  - perabot padat tidak boleh menutup jalur pintu dan lorong (doorKeepouts) dan tidak saling menimpa;
//  - perabot yang tidak muat (mis. di kamar yang menyusut di lantai atas) dilewati, bukan dipaksa;
//  - perabot besar (bar, prasmanan, tempat tidur suite) mencoba beberapa posisi sampai ada yang bebas dari jalur pintu;
//  - kamar tamu memakai kerangka lokal (u = menyamping, v = masuk dari pintu) sehingga empat arah kamar
//    (utara, selatan, barat, timur) mendapat tata letak yang sama.
import { PROP_DEFS, propRect } from './hotel-props.js';
import { cinemaSeatPlan } from './cinema-5d-data.js';

const EPS = 1e-6;
/** Arah hadap (ry): depan perabot = +z lokal; 0 = selatan (+z), PI = utara (-z), PI/2 = timur (+x), -PI/2 = barat (-x). */
export const FACE = Object.freeze({ S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 });
const WALL = 0.17; // setengah tebal dinding (0,15) + celah
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const overlaps = (a, b, m = 0) => a.minX < b.maxX - m && a.maxX > b.minX + m && a.minZ < b.maxZ - m && a.maxZ > b.minZ + m;
const near = (a, b) => Math.abs(a - b) < EPS;
const rowsOf = (a, b, step) => {
  const out = [];
  for (let v = a; v <= b + EPS; v += step) out.push(v);
  return out;
};

/**
 * Persegi terlarang di dalam satu ruang: jalur 2,6 m di depan tiap pintu, dan lorong penuh antara dua pintu lebar
 * (>= 4 m) yang berhadapan, supaya pemain selalu bisa lewat dari pintu ke pintu.
 */
export function doorKeepouts(rect, doors) {
  const [x1, z1, x2, z2] = rect;
  const edges = { n: [], s: [], w: [], e: [] };
  for (const d of doors) {
    if (d.orient === 'h' && d.x > x1 - EPS && d.x < x2 + EPS) {
      if (near(d.z, z1)) edges.n.push(d);
      else if (near(d.z, z2)) edges.s.push(d);
    } else if (d.orient === 'v' && d.z > z1 - EPS && d.z < z2 + EPS) {
      if (near(d.x, x1)) edges.w.push(d);
      else if (near(d.x, x2)) edges.e.push(d);
    }
  }
  const lane = (d) => d.width / 2 + 0.55;
  const depth = 2.6;
  const out = [];
  for (const d of edges.n) out.push({ minX: d.x - lane(d), maxX: d.x + lane(d), minZ: z1 - 1, maxZ: Math.min(z2, z1 + depth) });
  for (const d of edges.s) out.push({ minX: d.x - lane(d), maxX: d.x + lane(d), minZ: Math.max(z1, z2 - depth), maxZ: z2 + 1 });
  for (const d of edges.w) out.push({ minX: x1 - 1, maxX: Math.min(x2, x1 + depth), minZ: d.z - lane(d), maxZ: d.z + lane(d) });
  for (const d of edges.e) out.push({ minX: Math.max(x1, x2 - depth), maxX: x2 + 1, minZ: d.z - lane(d), maxZ: d.z + lane(d) });
  for (const a of edges.n) for (const c of edges.s) {
    if (a.width >= 4 && c.width >= 4 && Math.abs(a.x - c.x) <= 3.5) {
      const w = Math.max(lane(a), lane(c));
      out.push({ minX: Math.min(a.x, c.x) - w, maxX: Math.max(a.x, c.x) + w, minZ: z1, maxZ: z2 });
    }
  }
  for (const a of edges.w) for (const c of edges.e) {
    if (a.width >= 4 && c.width >= 4 && Math.abs(a.z - c.z) <= 3.5) {
      const w = Math.max(lane(a), lane(c));
      out.push({ minX: x1, maxX: x2, minZ: Math.min(a.z, c.z) - w, maxZ: Math.max(a.z, c.z) + w });
    }
  }
  return out;
}


/** Jalur sempit (selebar daun pintu, 1,15 m ke dalam) di depan pintu kamar lain yang membuka ke persegi ini (kamar pojok). */
function neighborKeepouts(rect, doors) {
  const [x1, z1, x2, z2] = rect;
  const out = [];
  for (const d of doors) {
    const hw = d.width / 2;
    if (d.orient === 'h' && d.x > x1 - EPS && d.x < x2 + EPS) {
      if (near(d.z, z1)) out.push({ minX: d.x - hw, maxX: d.x + hw, minZ: z1 - 1, maxZ: z1 + 1.15 });
      else if (near(d.z, z2)) out.push({ minX: d.x - hw, maxX: d.x + hw, minZ: z2 - 1.15, maxZ: z2 + 1 });
    } else if (d.orient === 'v' && d.z > z1 - EPS && d.z < z2 + EPS) {
      if (near(d.x, x1)) out.push({ minX: x1 - 1, maxX: x1 + 1.15, minZ: d.z - hw, maxZ: d.z + hw });
      else if (near(d.x, x2)) out.push({ minX: x2 - 1.15, maxX: x2 + 1, minZ: d.z - hw, maxZ: d.z + hw });
    }
  }
  return out;
}

class Lay {
  constructor(rect, keep, inset = 0.35) {
    [this.x1, this.z1, this.x2, this.z2] = rect;
    this.w = this.x2 - this.x1;
    this.d = this.z2 - this.z1;
    this.cx = (this.x1 + this.x2) / 2;
    this.cz = (this.z1 + this.z2) / 2;
    this.keep = keep;
    this.inset = inset;
    this.out = [];
    this.solid = [];
  }

  // pusat perabot yang bersandar di dinding, dengan setengah kedalaman h
  north(h) { return this.z1 + this.inset + 0.02 + h; }
  south(h) { return this.z2 - this.inset - 0.02 - h; }
  west(h) { return this.x1 + this.inset + 0.02 + h; }
  east(h) { return this.x2 - this.inset - 0.02 - h; }

  place(type, x, z, ry = 0, extra = {}) {
    const def = PROP_DEFS[type];
    if (!def) throw new Error(`perabot tidak dikenal: ${type}`);
    const p = { type, x, z, ry, ...extra };
    const q = propRect(p);
    const m = def.wall ? -0.05 : this.inset;
    if (q.minX < this.x1 + m - EPS || q.maxX > this.x2 - m + EPS || q.minZ < this.z1 + m - EPS || q.maxZ > this.z2 - m + EPS) return null;
    if (!def.flat && !def.wall && this.keep.some((k) => overlaps(q, k))) return null;
    if (def.solid) {
      if (this.solid.some((s) => overlaps(q, s, 0.02))) return null;
      this.solid.push(q);
    }
    this.out.push(p);
    return p;
  }

  /** Coba beberapa pergeseran (pecahan lebar ruang dari tengah); berhenti di yang pertama muat. */
  placeAny(type, offsets, z, ry, extra = {}) {
    for (const o of offsets) {
      const p = this.place(type, this.cx + o * this.w, z, ry, extra);
      if (p) return p;
    }
    return null;
  }
}

const SHIFTS = [0, -0.25, 0.25, -0.15, 0.15, -0.35, 0.35, -0.4, 0.4];
const polar = (x, z, a, r) => [x + Math.sin(a) * r, z + Math.cos(a) * r];

function seatsAround(L, x, z, n, r = 1.1, type = 'chair') {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const [cx, cz] = polar(x, z, a, r);
    L.place(type, cx, cz, a + Math.PI); // menghadap meja
  }
}

function diningGrid(L, step = 4.6, n = 4, margin = 2.4, top = 0) {
  for (const x of rowsOf(L.x1 + margin, L.x2 - margin, step)) {
    for (const z of rowsOf(L.z1 + margin + top, L.z2 - margin, step)) {
      if (L.place('table', x, z)) seatsAround(L, x, z, n);
    }
  }
}

/** Sofa menghadap meja kopi, dengan dua kursi malas di sisinya. */
function cluster(L, x, z, ry, { arm = true } = {}) {
  const f = { x: Math.sin(ry), z: Math.cos(ry) };
  const r = { x: -Math.cos(ry), z: Math.sin(ry) };
  L.place('sofa', x, z, ry);
  L.place('coffee_table', x + f.x * 1.7, z + f.z * 1.7, ry);
  if (arm) {
    L.place('armchair', x + f.x * 1.7 + r.x * 1.8, z + f.z * 1.7 + r.z * 1.8, ry + Math.PI / 2);
    L.place('armchair', x + f.x * 1.7 - r.x * 1.8, z + f.z * 1.7 - r.z * 1.8, ry - Math.PI / 2);
  }
}

const plants = (L) => {
  for (const x of [L.x1 + 0.75, L.x2 - 0.75]) for (const z of [L.z1 + 0.75, L.z2 - 0.75]) L.place('plant', x, z);
};

const MAT_COLORS = [0x3b82a0, 0xa23b3b, 0x7a5aa0, 0x3f7d36];

const GEN = {
  lobby(L) {
    for (const s of [-1, 1]) {
      L.place('desk', L.cx + s * 10, L.south(0.5), FACE.N);
      cluster(L, L.cx + s * 19, L.cz - 1, s < 0 ? FACE.E : FACE.W);
      for (const k of [33, 47, 61]) cluster(L, L.cx + s * k, L.cz - 1, s < 0 ? FACE.E : FACE.W); // lobi lebar: beberapa kelompok duduk
      L.place('plant', L.cx + s * 24, L.north(0.3));
      L.place('plant', L.cx + s * 7, L.north(0.3));
    }
  },
  concierge(L) {
    L.place('desk', L.cx, L.north(0.5), FACE.S);
    L.place('luggage_cart', L.x1 + 1.5, L.cz + 2, FACE.E);
    L.place('luggage_cart', L.x2 - 1.5, L.cz + 2, FACE.W);
    cluster(L, L.cx, L.south(0.5), FACE.N);
    plants(L);
  },
  foyer(L) {
    for (const z of rowsOf(L.z1 + 3, L.z2 - 3, 5)) {
      L.place('sofa', L.west(0.5), z, FACE.E);
      L.place('sofa', L.east(0.5), z, FACE.W);
      L.place('coffee_table', L.cx, z, FACE.S);
    }
    plants(L);
  },
  lobby_cafe(L) {
    L.placeAny('bar_counter', SHIFTS, L.north(0.6), FACE.S, { w: Math.max(3, Math.min(8, L.w - 1.5)), d: 1.2 });
    for (const x of rowsOf(L.cx - 3, L.cx + 3, 1.5)) L.place('stool', x, L.north(0) + 1.7, FACE.N);
    diningGrid(L, 3.6, 2, 2.2, 3.5);
  },
  dining(L) {
    L.placeAny('buffet', SHIFTS, L.north(0.5), FACE.S, { w: Math.max(3, Math.min(8, L.w - 4)), d: 1.0 });
    diningGrid(L, 4.6, 4, 2.4, 2.5);
    plants(L);
  },
  kitchen(L) {
    const xs = rowsOf(L.x1 + 1.6, L.x2 - 1.6, 2.5);
    xs.forEach((x, i) => {
      const last = i === xs.length - 1;
      const t = i === 0 || last ? 'fridge' : i % 2 ? 'stove' : 'kitchen_counter';
      L.place(t, x, L.north(0.4), FACE.S);
      L.place(i === 0 || last ? 'fridge' : 'kitchen_counter', x, L.south(0.4), FACE.N);
    });
    for (const x of rowsOf(L.x1 + 3, L.x2 - 3, 4.5)) L.place('kitchen_counter', x, L.cz, FACE.S);
  },
  ballroom(L) {
    L.placeAny('stage', SHIFTS, L.north(2.0), FACE.S, { w: Math.min(14, L.w * 0.5), d: 4 });
    L.place('arch', L.cx, L.z1 + 0.3, FACE.S, { w: 5 });
    L.place('podium', L.cx + Math.min(9, L.w * 0.3), L.north(0.3) + 0.4, FACE.S);
    for (const x of rowsOf(L.x1 + 3.2, L.x2 - 3.2, 5.4)) {
      for (const z of rowsOf(L.z1 + 7.8, L.z2 - 2.6, 5.2)) {
        if (L.place('table', x, z)) seatsAround(L, x, z, 6, 1.15);
      }
    }
  },
  bridal_suite(L) {
    L.place('bed', L.cx, L.north(1.12), FACE.S);
    L.place('dresser', L.west(0.25), L.cz, FACE.E);
    L.place('wardrobe', L.east(0.3), L.cz, FACE.W);
    cluster(L, L.cx, L.south(0.5), FACE.N);
    plants(L);
  },
  meeting_center(L) {
    for (const k of [-1, 1]) {
      const z = L.cz + k * 8;
      L.place('conf_table', L.cx, z, FACE.S, { w: Math.min(8, L.w - 6), d: 1.8 });
      for (const x of rowsOf(L.cx - 3, L.cx + 3, 1.5)) {
        L.place('chair', x, z - 1.4, FACE.S);
        L.place('chair', x, z + 1.4, FACE.N);
      }
    }
    L.place('whiteboard', L.x1 + 0.12, L.cz, FACE.E, { w: 4 });
    plants(L);
  },
  business_center(L) {
    for (const x of rowsOf(L.x1 + 3, L.x2 - 3, 3.4)) {
      for (const z of rowsOf(L.z1 + 3, L.z2 - 4, 4)) {
        if (L.place('work_desk', x, z, FACE.S)) L.place('chair', x, z - 0.9, FACE.S);
      }
    }
    L.place('counter', L.cx, L.south(0.5), FACE.N);
  },
  spa(L) {
    for (const x of rowsOf(L.x1 + 3, L.x2 - 3, 5)) {
      for (const z of [L.z1 + 3, L.z2 - 3.2]) {
        if (L.place('massage_bed', x, z, FACE.S)) L.place('stool', x + 0.9, z, FACE.W);
      }
    }
    L.place('tub', L.x1 + 4.5, L.cz, FACE.S);
    L.place('tub', L.x2 - 4.5, L.cz, FACE.S);
    plants(L);
  },
  sauna(L) {
    L.place('sauna_stove', L.cx, L.north(0.4), FACE.S);
    L.place('sauna_bench', L.west(0.35), L.cz + 1, FACE.E, { w: Math.max(2, Math.min(10, L.d - 5)), d: 0.7 });
    L.place('sauna_bench', L.east(0.35), L.cz + 1, FACE.W, { w: Math.max(2, Math.min(10, L.d - 5)), d: 0.7 });
  },
  salon(L) {
    for (const z of rowsOf(L.z1 + 3, L.z2 - 3, 3)) {
      if (L.place('mirror_station', L.west(0.2), z, FACE.E)) L.place('salon_chair', L.west(0.2) + 1.1, z, FACE.W);
    }
    plants(L);
  },
  indoor_pool(L) {
    for (const x of rowsOf(L.x1 + 2, L.x2 - 2, 2.2)) {
      L.place('lounger', x, L.north(0.95), FACE.S);
      L.place('lounger', x, L.south(0.95), FACE.N);
    }
    for (const z of rowsOf(L.z1 + 6, L.z2 - 6, 3)) {
      L.place('lounger', L.west(0.35), z, FACE.E);
      L.place('lounger', L.east(0.35), z, FACE.W);
    }
  },
  gym(L) {
    for (const x of rowsOf(L.x1 + 2.2, L.x2 - 2.2, 2.0)) L.place('treadmill', x, L.north(0.9), FACE.N);
    for (const x of rowsOf(L.x1 + 2.2, L.x2 - 2.2, 1.8)) L.place('exercise_bike', x, L.north(0.55) + 3.4, FACE.N);
    for (const x of rowsOf(L.x1 + 3, L.x2 - 3, 4.5)) L.place('bench_press', x, L.cz + 2, FACE.S);
    for (const x of rowsOf(L.x1 + 2.5, L.x2 - 2.5, 3.2)) L.place('weight_rack', x, L.south(0.3), FACE.N);
    for (const x of rowsOf(L.x1 + 3, L.x2 - 3, 1.4)) L.place('rug', x, L.cz - 5, 0, { w: 0.7, d: 1.9, color: 0x3b82a0 });
  },
  yoga(L) {
    let i = 0;
    for (const x of rowsOf(L.x1 + 1.6, L.x2 - 1.6, 1.6)) {
      for (const z of rowsOf(L.z1 + 2.5, L.z2 - 2.5, 2.6)) L.place('rug', x, z, 0, { w: 0.75, d: 1.9, color: MAT_COLORS[i++ % MAT_COLORS.length] });
    }
  },
  arcade_shops(L) {
    for (const z of [L.z1 + 5, L.z1 + 10]) for (const x of rowsOf(L.x1 + 3, L.x2 - 3, 4.2)) L.place('gondola', x, z, FACE.S, { w: 3.0, d: 0.6 });
    for (const x of rowsOf(L.x1 + 2, L.x2 - 2, 4)) L.place('mannequin', x, L.north(0.3));
    L.place('counter', L.x1 + 3, L.south(0.5), FACE.N);
    L.place('counter', L.x2 - 3, L.south(0.5), FACE.N);
  },
  musholla(L) {
    L.place('mihrab', L.x1 + 0.12, L.cz, FACE.E, { w: 2.4 });
    L.place('mimbar', L.x1 + 1.3, L.cz + 4, FACE.E);
    for (const z of rowsOf(L.z1 + 2.5, L.z2 - 2.5, 1.5)) {
      for (const x of rowsOf(L.x1 + 3.2, L.x2 - 1.5, 1.4)) L.place('rug', x, z, 0, { w: 1.2, d: 0.7, color: 0x2e6b4f });
    }
    L.place('shoe_rack', L.east(0.2), L.z2 - 1.5, FACE.W);
  },
  kids_club(L) {
    L.place('rug', L.cx, L.cz, 0, { w: Math.max(2, Math.min(7, L.w - 1)), d: Math.max(2, Math.min(9, L.d - 3)), color: 0xf0c75e });
    L.place('play_house', L.x1 + 1.6, L.north(0.7), FACE.S);
    for (const [dx, dz] of [[-1.5, -1], [1.5, 1.5], [0, 4]]) L.place('toy_block', L.cx + dx, L.cz + dz);
    L.place('coffee_table', L.east(0.35), L.cz, FACE.W);
    L.place('chair', L.east(0.35) - 0.9, L.cz, FACE.E);
    plants(L);
  },
  // Bioskop 5D (cinema-5d-data.js): layar lebar, kursi dalam blok dengan lorong, satu kursi dikosongkan untuk adegan hantu (dibuat oleh
  // cinema-5d-fx.js), dan foyer di belakang: kelompok duduk di sepanjang dinding timur dan tanaman.
  cinema(L) {
    const plan = cinemaSeatPlan([L.x1, L.z1, L.x2, L.z2]);
    L.place('screen', plan.screen.x, plan.screen.z, FACE.E, { w: plan.screen.w });
    for (const s of plan.seats) L.place('cinema_seat', s.x, s.z, FACE.W);
    for (const z of [L.cz - 18, L.cz + 18]) cluster(L, L.x2 - 4, z, FACE.W);
    L.place('counter', plan.foyerX + 2, L.z1 + 1.2, FACE.S);
    L.place('counter', plan.foyerX + 5, L.z1 + 1.2, FACE.S);
    plants(L);
  },
  game_zone(L) {
    for (const z of rowsOf(L.z1 + 2.5, L.z2 - 2.5, 1.0)) L.place('arcade', L.east(0.4), z, FACE.W);
    for (const x of rowsOf(L.x1 + 2.5, L.x2 - 6, 1.0)) L.place('arcade', x, L.north(0.4), FACE.S);
    L.place('pool_table', L.cx, L.cz - 4, FACE.S);
    L.place('pool_table', L.cx, L.cz + 4, FACE.S);
    plants(L);
  },
  library(L) {
    const len = Math.max(2, Math.min(5, L.d / 4));
    for (const dz of [-5, 5]) {
      L.place('shelf', L.west(0.25), L.cz + dz, FACE.E, { w: len, d: 0.5 });
      L.place('shelf', L.east(0.25), L.cz + dz, FACE.W, { w: len, d: 0.5 });
    }
    L.place('table', L.cx, L.cz - 3);
    seatsAround(L, L.cx, L.cz - 3, 4);
    L.place('armchair', L.cx - 3, L.cz + 5, FACE.E);
    L.place('armchair', L.cx + 3, L.cz + 5, FACE.W);
    L.place('lamp', L.cx, L.cz + 5);
    plants(L);
  },
  lounge(L) {
    L.placeAny('bar_counter', SHIFTS, L.north(0.6), FACE.S, { w: Math.max(3, Math.min(10, L.w - 8)), d: 1.2 });
    for (const x of rowsOf(L.cx - 4, L.cx + 4, 1.6)) L.place('stool', x, L.north(0) + 2.0, FACE.N);
    for (const s of [-1, 1]) {
      for (const k of [12, 21, 33, 45]) cluster(L, L.cx + s * k, L.cz + 3, s < 0 ? FACE.E : FACE.W);
    }
    plants(L);
  },
  suite(L) {
    const wanted = L.w > 20 ? 2 : 1;
    let placed = 0;
    for (const o of SHIFTS) {
      if (placed >= wanted) break;
      if (L.place('bed', L.cx + o * L.w, L.north(1.12), FACE.S)) placed++;
    }
    L.place('dresser', L.west(0.25), L.cz - 2, FACE.E);
    L.place('wardrobe', L.east(0.3), L.cz - 2, FACE.W);
    cluster(L, L.cx, L.cz + 2, FACE.N);
    const dz = L.south(0.5) - 1.0;
    if (L.place('dining_table', L.cx, dz)) {
      for (const dx of [-0.6, 0.6]) {
        L.place('chair', L.cx + dx, dz - 0.9, FACE.S);
        L.place('chair', L.cx + dx, dz + 0.9, FACE.N);
      }
    }
    L.place('bathtub', L.east(0.4), L.south(0.4) - 1, FACE.W);
    plants(L);
  },
  terrace(L) {
    for (const x of rowsOf(L.x1 + 2, L.x2 - 2, 3.2)) {
      for (const z of rowsOf(L.z1 + 2, L.z2 - 2.5, 4.2)) {
        L.place('lounger', x - 0.6, z, FACE.S);
        L.place('lounger', x + 0.6, z, FACE.S);
        L.place('coffee_table', x, z + 1.4, FACE.S);
      }
    }
    plants(L);
  },
  chapel(L) {
    L.place('arch', L.cx, L.z1 + 0.3, FACE.S, { w: 4 });
    L.place('podium', L.cx, L.z1 + 2.4, FACE.S);
    for (const z of rowsOf(L.z1 + 5, L.z2 - 2.5, 1.5)) {
      for (const dx of [-4.6, -2.4, 2.4, 4.6]) L.place('pew', L.cx + dx, z, FACE.N);
    }
    plants(L);
  },
};

const BY_ID = {
  lobby: GEN.lobby, concierge: GEN.concierge, foyer: GEN.foyer, lobby_cafe: GEN.lobby_cafe,
  grand_dining: GEN.dining, specialty_dining: GEN.dining, sky_dining: GEN.dining,
  kitchen: GEN.kitchen, catering: GEN.kitchen, butler: GEN.kitchen,
  ballroom: GEN.ballroom, bridal_suite: GEN.bridal_suite, meeting_center: GEN.meeting_center, business_center: GEN.business_center,
  spa: GEN.spa, sauna: GEN.sauna, salon: GEN.salon, indoor_pool: GEN.indoor_pool, infinity_pool: GEN.indoor_pool, gym: GEN.gym, yoga: GEN.yoga,
  arcade_shops: GEN.arcade_shops, musholla: GEN.musholla, kids_club: GEN.kids_club, cinema: GEN.cinema, game_zone: GEN.game_zone, library: GEN.library,
  exec_lounge: GEN.lounge, sky_lounge: GEN.lounge,
  royal_suite: GEN.suite, presidential_suite: GEN.suite, sultan_suite: GEN.suite, garden_suite: GEN.suite,
  sky_terrace_w: GEN.terrace, sky_terrace_e: GEN.terrace, sky_spa: GEN.chapel,
};
const BY_KIND = {
  lobby: GEN.foyer, restaurant: GEN.dining, kitchen: GEN.kitchen, hall: GEN.ballroom, bridal: GEN.bridal_suite, meeting: GEN.meeting_center,
  spa: GEN.spa, pool: GEN.indoor_pool, gym: GEN.gym, shop: GEN.arcade_shops, prayer: GEN.musholla, kids: GEN.kids_club, cinema: GEN.cinema,
  games: GEN.game_zone, library: GEN.library, lounge: GEN.lounge, suite: GEN.suite, terrace: GEN.terrace,
};

/** Perabot satu ruang publik. Id Sky Lobby (mis. lobby_l51) dikembalikan ke id dasarnya (lobby). */
export function furnishPublic(room, doors) {
  const L = new Lay(room.rect, doorKeepouts(room.rect, doors));
  const key = room.id.replace(/_l\d+$/, '');
  const gen = BY_ID[key] ?? BY_KIND[room.kind];
  if (gen) gen(L);
  return L.out.map((p) => ({ ...p, room: room.id }));
}

// ---------------------------------------------------------------- kamar tamu
const DIRS = { in: [0, 1], out: [0, -1], r: [1, 0], l: [-1, 0] };

/** Kerangka lokal kamar tamu: u menyamping (0 = tengah pintu), v masuk dari pintu ke dinding belakang. */
export function guestFrame(cell) {
  const [x1, z1, x2, z2] = cell.rect;
  const d = cell.door;
  const horiz = d.orient === 'h';
  let inward;
  if (horiz) inward = near(d.z, z2) ? { x: 0, z: -1 } : { x: 0, z: 1 };
  else inward = near(d.x, x2) ? { x: -1, z: 0 } : { x: 1, z: 0 };
  const lat = { x: -inward.z, z: inward.x };
  return {
    W: horiz ? x2 - x1 : z2 - z1,
    D: horiz ? z2 - z1 : x2 - x1,
    horiz, inward, lat,
    toWorld: (u, v) => ({ x: d.x + lat.x * u + inward.x * v, z: d.z + lat.z * u + inward.z * v }),
    ry: (face) => {
      const [fu, fv] = DIRS[face];
      return Math.atan2(fu * lat.x + fv * inward.x, fu * lat.z + fv * inward.z);
    },
  };
}

/**
 * Isi satu kamar tamu: tempat tidur (kepala di dinding belakang), kamar mandi bersekat (toilet, wastafel, shower),
 * lemari, meja kerja + kursi, unit TV, AC, kursi/sofa, lampu langit-langit. Kamar sempit di lantai atas memakai
 * tempat tidur 1,6 m dan kursi malas; kamar lebar mendapat sofa, meja kopi, dan tanaman.
 * Mengembalikan { props, bath } dengan bath = { rect, door } (sekat kamar mandi) atau null.
 */
export function furnishGuest(cell, doors = []) {
  const need = ['bed', 'bed_s', 'toilet', 'shower', 'vanity', 'wardrobe', 'tv_unit', 'ac_unit'];
  const score = (r) => new Set(r.props.map((p) => p.type).filter((t) => need.includes(t))).size;
  const done = (r) => score(r) >= need.length - 1; // bed dan bed_s saling menggantikan
  const a = furnishGuestOnce(cell, doors, false, true);
  if (done(a)) return a;
  // jalur pintu kamar tetangga (kamar pojok) menutupi satu sisi: coba tata letak dicerminkan
  const b = furnishGuestOnce(cell, doors, true, true);
  if (done(b)) return b;
  // kamar pojok sempit di lantai atas: perabot wajib tetap dipasang, hanya pelengkap yang menghindari jalur
  return furnishGuestOnce(cell, doors, false, false);
}

const ESSENTIAL = new Set(['bed', 'bed_s', 'toilet', 'shower', 'vanity', 'wardrobe', 'tv_unit', 'ac_unit']);

function furnishGuestOnce(cell, doors, mirror, strict) {
  const f0 = guestFrame(cell);
  const SWAP = { r: 'l', l: 'r' };
  const f = mirror ? { ...f0, toWorld: (u, v) => f0.toWorld(-u, v), ry: (face) => f0.ry(SWAP[face] ?? face) } : f0;
  // pintu kamar utara/selatan di pojok membuka ke dalam persegi kamar barat/timur: jalurnya harus bebas
  const keep = neighborKeepouts(cell.rect, doors.filter((d) => d !== cell.door));
  const { W, D } = f;
  const hw = W / 2;
  const props = [];
  const solids = [];
  const put = (type, u, v, face, extra = {}) => {
    const def = PROP_DEFS[type];
    const hx = extra.w != null ? extra.w / 2 : def.hx;
    const hz = extra.d != null ? extra.d / 2 : def.hz;
    const along = face === 'in' || face === 'out';
    const hu = along ? hx : hz;
    const hv = along ? hz : hx;
    const r = [u - hu, u + hu, v - hv, v + hv];
    if (!def.wall && !def.flat) {
      if (r[0] < -hw + WALL - EPS || r[1] > hw - WALL + EPS || r[2] < WALL - EPS || r[3] > D - WALL + EPS) return null;
      if (def.solid) {
        if (solids.some((s) => r[0] < s[1] - 0.02 && r[1] > s[0] + 0.02 && r[2] < s[3] - 0.02 && r[3] > s[2] + 0.02)) return null;
        solids.push(r);
      }
    }
    const c = f.toWorld(u, v);
    const p = { type, x: c.x, z: c.z, ry: f.ry(face), room: cell.id, ...extra };
    if (!def.wall && !def.flat && (strict || !ESSENTIAL.has(type)) && keep.some((k) => overlaps(propRect(p), k))) {
      if (def.solid) solids.pop();
      return null;
    }
    props.push(p);
    return p;
  };

  const full = W >= 5;
  const bw = full ? clamp(W - 3.3, 1.7, 3.0) : clamp(W - 1.95, 1.7, 2.4);
  const bd = Math.min(2.5, D - 2.6);
  const hasBath = bd >= 1.9;
  const bu1 = -hw;
  const bu2 = bu1 + bw;
  const bv1 = D - bd;
  const bedU = hasBath ? (bu2 + hw) / 2 : 0;
  const bedV = D - WALL - 1.1 - 0.06;

  put(full ? 'bed' : 'bed_s', bedU, bedV, 'out', full ? { tag: 'bed' } : { tag: 'bed', w: 1.6 });

  let bath = null;
  if (hasBath) {
    put('toilet', bu1 + WALL + 0.35, bv1 + 0.45, 'r');
    put('shower', bu1 + WALL + 0.4, D - WALL - 0.4, 'out');
    put('vanity', bu2 - 0.4, bv1 + 1.65, 'l');
    const a = f.toWorld(bu1, bv1);
    const b = f.toWorld(bu2, D);
    const rect = [Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z)];
    const dc = f.toWorld(bu2 - 0.6, bv1);
    bath = { rect, door: { x: dc.x, z: dc.z, orient: f.horiz ? 'h' : 'v', width: 0.95 } };
    const mid = f.toWorld((bu1 + bu2) / 2, (bv1 + D) / 2);
    props.push({ type: 'rug', x: mid.x, z: mid.z, ry: 0, room: cell.id, w: rect[2] - rect[0], d: rect[3] - rect[1], color: 0xcfd8dc });
  }

  const living = D - (hasBath ? bd : 2.5) - 0.1;
  put('wardrobe', -hw + WALL + 0.3, WALL + 0.6, 'r');
  put('ac_unit', -hw + WALL + 0.1, WALL + 0.6, 'r', { tag: 'ac' });
  put('work_desk', hw - WALL - 0.35, WALL + 0.7, 'l');
  put('chair', hw - WALL - 0.35 - 0.8, WALL + 0.7, 'r');
  for (const v of [2.45, 3.6, 4.6]) if (put('tv_unit', hw - WALL - 0.25, v, 'l', { tag: 'tv' })) break; // kamar pojok: geser bila jalur pintu tetangga menutupi
  if (full && living >= 4.3) {
    put('sofa', -hw + WALL + 0.5, 2.85, 'r');
    put('coffee_table', -hw + 1.8, 2.85, 'r');
    put('plant', hw - WALL - 0.3, D - bd - 0.5, 'in');
  } else {
    put('armchair', -hw + WALL + 0.45, 2.35, 'r');
  }
  put('ceiling_lamp', 0, living / 2 + 0.2, 'in', { tag: 'light' });
  put('ceiling_lamp', bedU, D - 1.3, 'in', { tag: 'light' });
  return { props, bath };
}

/**
 * Perabot satu lantai. rooms = ruang lantai itu (hotelRoomsAtLevel), doors = pintu lantai itu (tanpa sekat).
 * Mengembalikan { props, rooms, doors }: rooms/doors adalah sekat kamar mandi yang perlu digambar sebagai dinding.
 */
export function furnishLevel({ rooms, doors }) {
  const props = [];
  const partRooms = [];
  const partDoors = [];
  const guestDoors = rooms.filter((r) => r.kind === 'guest').map((r) => r.door);
  for (const room of rooms) {
    if (room.kind === 'core') continue;
    if (room.kind === 'guest') {
      const g = furnishGuest(room, guestDoors);
      props.push(...g.props);
      if (g.bath) {
        partRooms.push({ id: `${room.id}_bath`, rect: g.bath.rect });
        partDoors.push(g.bath.door);
      }
    } else {
      props.push(...furnishPublic(room, doors));
    }
  }
  return { props, rooms: partRooms, doors: partDoors };
}
