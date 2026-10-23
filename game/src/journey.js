// Perjalanan menuju tempat acara (murni data + matematika, tanpa THREE; gambar 3D ada di journey-world.js).
// Rencana pemilik: perjalanan virtual minimal 20 menit dengan banyak tikungan dan pemandangan berganti, lima bagian:
//   1 jalan utama (00-04), 2 berkelok melewati kawasan hijau (04-08), 3 bukit dan persimpangan (08-13),
//   4 kawasan premium (13-17), 5 kedatangan (17-20+). Rincian dan status: docs/PERJALANAN_RENCANA.md.
//
// Jalan dibangun dengan mengintegrasikan kelengkungan (bukan menyambung titik acak), jadi radius tikungan terkecil dan
// kemiringan terbesar dijamin oleh konstruksi dan bisa diuji. Tiap tempat acara punya benih sendiri => rute berbeda.
// Satuan meter dan detik. Heading seperti vehicle.js: maju = (sin h, cos h) pada (x, z). Titik awal = (0, 0, 0).

export const ROAD = Object.freeze({ half: 5.5, lane: 3.75, shoulder: 1.75, embank: 16, step: 2 });

/** Bagian perjalanan: menit awal/akhir dan kecepatan jelajah rata-rata (m/s). Panjang = durasi x kecepatan. */
export const SEGMENTS = Object.freeze([
  { id: 'utama', name: 'Jalan utama menuju kawasan NIKORA', from: 0, to: 4, cruise: 14 },
  { id: 'berkelok', name: 'Jalan berkelok melewati kawasan hijau', from: 4, to: 8, cruise: 12.5 },
  { id: 'bukit', name: 'Kawasan bukit dan persimpangan', from: 8, to: 13, cruise: 10 },
  { id: 'premium', name: 'Memasuki kawasan premium', from: 13, to: 17, cruise: 9 },
  { id: 'kedatangan', name: 'Kedatangan di lokasi acara', from: 17, to: 20.5, cruise: 7 },
]);

/** Jarak gerbang utama dari awal rute; 150 m setelah gerbang jalan dipaksa lurus dan datar (melewati gerbang tanpa belokan). */
export const GATE_S = 70;
export const MIN_DURATION_S = 20 * 60;
export const MAX_GRADE = 0.1; // kemiringan jalan terbesar (10%)
export const MIN_RADIUS = 28; // radius tikungan terkecil (tikungan tajam yang aman)

/** Benih dan watak tiap tempat acara (rute dan tema berbeda-beda). `attempt` = hasil searchAttempt(); dijaga oleh tes. */
export const JOURNEYS = Object.freeze({
  villa: { seed: 1101, attempt: 11, theme: 'hutan-tropis', lakeSide: 1, tint: 0x4f8a3c },
  hall: { seed: 2203, attempt: 27, theme: 'taman-kota', lakeSide: -1, tint: 0x6b9a45 },
  royal: { seed: 3307, attempt: 27, theme: 'bukit-istana', lakeSide: 1, tint: 0x5a8f52 },
  masjid: { seed: 4409, attempt: 10, theme: 'dataran-hijau', lakeSide: -1, tint: 0x7a9d4a },
});
export const journeyIds = () => Object.keys(JOURNEYS);

// ---------------------------------------------------------------- utilitas
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Derau nilai halus 0..1, deterministik. */
export function noise2(x, z, seed = 0) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(ix, iz, seed), hash2(ix + 1, iz, seed), u), lerp(hash2(ix, iz + 1, seed), hash2(ix + 1, iz + 1, seed), u), v);
}
export function fbm(x, z, seed = 0, octaves = 4) {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * f, z * f, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Rangkaian "tikungan" -> fungsi nilai dengan transisi halus: knots [{a, b, v}] (nilai v ditahan di [a, b], antar-knot disambung smoothstep). */
function profile(knots) {
  return (s) => {
    if (s <= knots[0].b) return knots[0].v;
    for (let i = 1; i < knots.length; i++) {
      const k = knots[i];
      if (s < k.a) return lerp(knots[i - 1].v, k.v, smooth(knots[i - 1].b, k.a, s));
      if (s <= k.b) return k.v;
    }
    return knots[knots.length - 1].v;
  };
}

// ---------------------------------------------------------------- penyusun tikungan per bagian
// Mengembalikan knots kelengkungan (1/m, + = belok kiri/lawan jarum jam dilihat dari atas) untuk panjang `len` mulai di `s0`.
// `st.theta` = penyimpangan arah kumulatif; dijaga mendekati nol (kecuali di sela tikungan tajam berpasangan) supaya rute
// berkelok-kelok tanpa melingkar dan menabrak dirinya sendiri.
function bendsFor(id, rand, s0, len, st) {
  const knots = [];
  let s = s0;
  const end = s0 + len;
  const add = (L, kappa, ramp) => {
    const a = s + ramp;
    const b = Math.min(end, a + L);
    knots.push({ a, b, v: kappa });
    st.theta += kappa * (b - a + ramp);
    s = b;
  };
  // arah tikungan berikut: bila arah sudah menyimpang, belok balik; selain itu acak (condong berganti-ganti)
  const pick = (lim, keep) => {
    if (Math.abs(st.theta) > lim) return -Math.sign(st.theta);
    return rand() < keep ? Math.sign(st.last || 1) : -Math.sign(st.last || 1);
  };
  const turn = (L, R, ramp, lim, keep) => {
    const sign = pick(lim, keep);
    st.last = sign;
    add(L, sign / R, ramp);
  };
  if (id === 'utama') {
    while (s < end) turn(250 + rand() * 250, 350 + rand() * 200, 120, 0.7, 0.35);
  } else if (id === 'berkelok') {
    while (s < end) turn(90 + rand() * 130, 70 + rand() * 70, 55 + rand() * 20, 0.8, 0.25);
  } else if (id === 'bukit') {
    let n = 0;
    while (s < end) {
      n++;
      const hairpinDue = Math.abs(st.theta) > 1.8 || (n % 3 === 2 && Math.abs(st.theta) < 0.5);
      if (hairpinDue) {
        const sign = Math.abs(st.theta) > 0.5 ? -Math.sign(st.theta) : (rand() < 0.5 ? -1 : 1);
        st.last = sign;
        add(Math.PI * MIN_RADIUS * (0.92 + rand() * 0.06), sign / MIN_RADIUS, 45); // tikungan tajam ~170 derajat
      } else turn(120 + rand() * 120, 80 + rand() * 60, 50, 0.9, 0.3);
    }
  } else if (id === 'premium') {
    while (s < end) turn(220 + rand() * 180, 180 + rand() * 240, 90, 0.9, 0.55);
  } else {
    // kedatangan: tikungan landai, satu tikungan terakhir ~60 derajat, lalu lurus ke area penurunan penumpang
    const straight = 260;
    const final = end - straight;
    while (s < final - 500) turn(160 + rand() * 120, 260 + rand() * 120, 90, 0.6, 0.3);
    const R = 130;
    const L = Math.min(Math.PI * R / 3, Math.max(60, final - s - 120));
    const sign = pick(0.2, 0.5);
    st.last = sign;
    add(L, sign / R, 80);
    knots.push({ a: end - straight + 60, b: end + 1, v: 0 });
  }
  return knots;
}

// Kemiringan jalan (naik + / turun -) per bagian: knots dengan rata-rata (bias) dan amplitudo.
function gradesFor(id, rand, s0, len) {
  const spec = { utama: [0, 0.012], berkelok: [0, 0.05], bukit: [0.035, 0.05], premium: [-0.02, 0.012], kedatangan: [0, 0.006] }[id];
  const knots = [];
  let s = s0;
  const end = s0 + len;
  while (s < end) {
    const run = 150 + rand() * 250;
    const v = clamp(spec[0] + (rand() * 2 - 1) * spec[1], -MAX_GRADE + 0.01, MAX_GRADE - 0.01);
    knots.push({ a: s + 80, b: Math.min(end, s + 80 + run), v });
    s = Math.min(end, s + 80 + run);
  }
  if (id === 'kedatangan') knots.push({ a: end - 380, b: end + 1, v: 0 });
  return knots;
}

// ---------------------------------------------------------------- pembangun rute
const cache = new Map();

export const MIN_CLEARANCE = 40; // jarak minimum antar-bagian jalan yang berjauhan jaraknya sepanjang rute (tidak berpotongan/berhimpit)

/** Rute lengkap untuk satu tempat acara (di-cache). `spec.attempt` = percobaan benih yang sudah dipilih (lihat searchAttempt). */
export function buildJourney(venue) {
  const spec = JOURNEYS[venue];
  if (!spec) throw new Error(`tempat acara tidak dikenal: ${venue}`);
  if (!cache.has(venue)) cache.set(venue, generate(venue, spec, spec.attempt ?? 0));
  return cache.get(venue);
}

/** Alat pengembang: cari nomor percobaan benih pertama yang lolos semua syarat ruang (hasilnya ditanam di JOURNEYS.*.attempt; dijaga oleh tes). */
export function searchAttempt(venue, max = 600) {
  const spec = JOURNEYS[venue];
  for (let a = 0; a < max; a++) if (routeIsClear(generate(venue, spec, a))) return a;
  return -1;
}

export const routeIsClear = (j) => selfClearance(j) >= MIN_CLEARANCE && waterClearanceOk(j);

/** Jarak terdekat antar-titik rute yang terpisah > 350 m sepanjang jalan (Infinity bila tidak ada). */
export function selfClearance(j) {
  const { fine, key } = j.grid;
  const sep = Math.ceil(350 / ROAD.step);
  let best = Infinity;
  for (let i = 0; i < j.n; i += 3) {
    const cx = Math.floor(j.xs[i] / FINE);
    const cz = Math.floor(j.zs[i] / FINE);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const l = fine.get(key(cx + a, cz + b));
      if (!l) continue;
      for (const q of l) {
        if (Math.abs(q - i) < sep) continue;
        const d = Math.hypot(j.xs[i] - j.xs[q], j.zs[i] - j.zs[q]);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

/** Jarak terdekat dari jendela [s0, s1] ke bagian jalan lain (di luar jendela + margin), maksimal ~64 m dicari. */
export function localClearance(j, s0, s1, margin = 80) {
  const { fine, key } = j.grid;
  let best = Infinity;
  const i0 = indexAt(j, s0);
  const i1 = indexAt(j, s1);
  for (let i = i0; i <= i1; i += 4) {
    const cx = Math.floor(j.xs[i] / FINE);
    const cz = Math.floor(j.zs[i] / FINE);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const l = fine.get(key(cx + a, cz + b));
      if (!l) continue;
      for (const q of l) {
        const sq = q * ROAD.step;
        if (sq >= s0 - margin && sq <= s1 + margin) continue;
        best = Math.min(best, Math.hypot(j.xs[i] - j.xs[q], j.zs[i] - j.zs[q]));
      }
    }
  }
  return best;
}
export const BRIDGE_CLEARANCE = 40;
export const LAKE_CLEARANCE = 50;
/** Jembatan (jurang) dan danau butuh ruang: tidak boleh ada ruas jalan lain terlalu dekat. */
export function waterClearanceOk(j) {
  for (const e of eventsOf(j, 'bridge')) if (localClearance(j, e.s0, e.s1) < BRIDGE_CLEARANCE) return false;
  for (const e of eventsOf(j, 'lake')) if (localClearance(j, e.s0, e.s1, 120) < LAKE_CLEARANCE) return false;
  return true;
}

export function generate(venue, spec, attempt) {
  const rand = rng(spec.seed + attempt * 7919);

  const bounds = [];
  let s = 0;
  for (const seg of SEGMENTS) {
    const len = Math.round((seg.to - seg.from) * 60 * seg.cruise);
    bounds.push({ ...seg, s0: s, s1: s + len, length: len });
    s += len;
  }
  const length = s;

  const kKnots = [];
  const gKnots = [];
  const st = { theta: 0, last: 0 };
  for (const b of bounds) {
    kKnots.push(...bendsFor(b.id, rand, b.s0, b.length, st));
    gKnots.push(...gradesFor(b.id, rand, b.s0, b.length));
  }
  const kappa0 = profile(kKnots);
  const grade0 = profile(gKnots);
  // jendela lurus dan datar untuk jembatan dan persimpangan: kelengkungan dan kemiringan dipaksa ~0 di dalamnya
  const reserve = reservations(bounds);
  const keepOf = (si, onlyGrade) => {
    let k = 1;
    for (const w of reserve) {
      if (w.gradeOnly && !onlyGrade) continue;
      k = Math.min(k, 1 - smooth(w.s0 - 25, w.s0, si) * (1 - smooth(w.s1, w.s1 + 25, si)));
    }
    return k;
  };
  const kappa = (si) => kappa0(si) * keepOf(si, false);
  const grade = (si) => grade0(si) * keepOf(si, true);

  const n = Math.floor(length / ROAD.step) + 1;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const zs = new Float32Array(n);
  const hs = new Float32Array(n);
  const ks = new Float32Array(n);
  const gs = new Float32Array(n);
  let x = 0;
  let y = 0;
  let z = 0;
  let h = 0;
  for (let i = 0; i < n; i++) {
    const si = i * ROAD.step;
    const k = clamp(kappa(si), -1 / MIN_RADIUS, 1 / MIN_RADIUS);
    const g = clamp(grade(si), -MAX_GRADE, MAX_GRADE);
    xs[i] = x;
    ys[i] = y;
    zs[i] = z;
    hs[i] = h;
    ks[i] = k;
    gs[i] = g;
    // titik tengah: perubahan arah separuh langkah dulu, supaya lintasan tidak bias
    const hm = h + (k * ROAD.step) / 2;
    x += Math.sin(hm) * ROAD.step;
    z += Math.cos(hm) * ROAD.step;
    y += g * ROAD.step;
    h += k * ROAD.step;
  }

  const j = { venue, spec, attempt, n, length, bounds, xs, ys, zs, hs, ks, gs, events: [], duration: 0, grid: null };
  j.duration = bounds.reduce((a, b) => a + b.length / b.cruise, 0);
  buildGrids(j);
  j.events = buildEvents(j, rand, reserve);
  return j;
}

const indexAt = (j, s) => clamp(Math.round(s / ROAD.step), 0, j.n - 1);

/** Jendela lurus-datar yang dicadangkan: persimpangan (bukit) dan jembatan (berkelok, bukit). */
function reservations(bounds) {
  const seg = (id) => bounds.find((b) => b.id === id);
  const out = [{ type: 'gatehall', s0: -30, s1: GATE_S + 150 }];
  const bk = seg('bukit');
  for (const f of [0.2, 0.5, 0.78]) out.push({ type: 'junction', s0: bk.s0 + bk.length * f - 35, s1: bk.s0 + bk.length * f + 35 });
  const bl = seg('berkelok');
  out.push({ type: 'bridge', s0: bl.s0 + bl.length * 0.55, s1: bl.s0 + bl.length * 0.55 + 48, label: 'Jembatan kecil' });
  out.push({ type: 'bridge', s0: bk.s0 + bk.length * 0.38, s1: bk.s0 + bk.length * 0.38 + 48, label: 'Jembatan sungai' });
  // danau: jalan datar sepanjang danau supaya permukaan air (datar) tidak menenggelamkan jalan
  const pr = seg('premium');
  out.push({ type: 'lakeflat', gradeOnly: true, s0: pr.s0 + pr.length * 0.2 - 40, s1: pr.s0 + pr.length * 0.8 + 40 });
  return out;
}

function buildEvents(j, rand, reserve) {
  const ev = [];
  const seg = (id) => j.bounds.find((b) => b.id === id);
  ev.push({ type: 'gate', s: GATE_S, label: 'Gerbang utama NIKORA' });
  for (const w of reserve) {
    if (w.type === 'gatehall' || w.type === 'lakeflat') continue;
    if (w.type === 'junction') ev.push({ type: 'junction', s: (w.s0 + w.s1) / 2, side: rand() < 0.5 ? -1 : 1, label: 'Jalan khusus (tertutup)' });
    else ev.push({ type: 'bridge', s0: w.s0, s1: w.s1, label: w.label });
  }
  const pr = seg('premium');
  ev.push({ type: 'lake', s0: pr.s0 + pr.length * 0.2, s1: pr.s0 + pr.length * 0.8, side: j.spec.lakeSide, label: 'Danau' });
  const ar = seg('kedatangan');
  ev.push({ type: 'dropoff', s: j.length, label: 'Area penurunan tamu' });
  ev.push({ type: 'reveal', s: ar.s1 - 260 - 160, label: 'Tempat acara terlihat' });
  return ev;
}

// ---------------------------------------------------------------- pencarian titik terdekat pada rute
const FINE = 32;
const COARSE = 256;
function buildGrids(j) {
  const fine = new Map();
  const coarse = new Map();
  const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  for (let i = 0; i < j.n; i++) {
    const fk = key(Math.floor(j.xs[i] / FINE), Math.floor(j.zs[i] / FINE));
    if (!fine.has(fk)) fine.set(fk, []);
    fine.get(fk).push(i);
    if (i % 10 === 0) {
      const ck = key(Math.floor(j.xs[i] / COARSE), Math.floor(j.zs[i] / COARSE));
      if (!coarse.has(ck)) coarse.set(ck, []);
      coarse.get(ck).push(i);
    }
  }
  j.grid = { fine, coarse, key };
}

function scan(j, list, x, z, best) {
  for (const i of list) {
    const dx = x - j.xs[i];
    const dz = z - j.zs[i];
    const d2 = dx * dx + dz * dz;
    if (d2 < best.d2) {
      best.d2 = d2;
      best.i = i;
    }
  }
}

/** Titik rute terdekat dari (x, z): { i, s, d (jarak bertanda, + = sisi kiri jalan), dist }. */
export function nearestOnRoute(j, x, z) {
  const best = { d2: Infinity, i: 0 };
  const { fine, coarse, key } = j.grid;
  const fx = Math.floor(x / FINE);
  const fz = Math.floor(z / FINE);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const l = fine.get(key(fx + a, fz + b));
    if (l) scan(j, l, x, z, best);
  }
  if (best.d2 === Infinity) {
    const cx = Math.floor(x / COARSE);
    const cz = Math.floor(z / COARSE);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = coarse.get(key(cx + a, cz + b));
      if (l) scan(j, l, x, z, best);
    }
  }
  if (best.d2 === Infinity) {
    for (let i = 0; i < j.n; i += 40) scan(j, [i], x, z, best);
  }
  const i = best.i;
  // perbaiki ke titik proyeksi pada garis tegak lurus arah jalan agar tepi tidak bergerigi
  const h = j.hs[i];
  const fxv = Math.sin(h);
  const fzv = Math.cos(h);
  const dx = x - j.xs[i];
  const dz = z - j.zs[i];
  const along = dx * fxv + dz * fzv;
  const left = dx * fzv - dz * fxv; // + = kiri pengemudi
  const si = i * ROAD.step + clamp(along, -ROAD.step, ROAD.step);
  return { i, s: clamp(si, 0, j.length), d: left, dist: Math.sqrt(best.d2) };
}

/** Kerangka jalan pada jarak s: posisi, arah, kemiringan, kelengkungan, miring badan jalan. */
export function frameAt(j, s) {
  const t = clamp(s / ROAD.step, 0, j.n - 1);
  const i = Math.floor(t);
  const i2 = Math.min(j.n - 1, i + 1);
  const f = t - i;
  const h0 = j.hs[i];
  const h1 = j.hs[i2];
  const heading = h0 + (h1 - h0) * f;
  const k = lerp(j.ks[i], j.ks[i2], f);
  const g = lerp(j.gs[i], j.gs[i2], f);
  const seg = segmentAt(j, s);
  const v = seg ? seg.cruise : 10;
  return {
    s, x: lerp(j.xs[i], j.xs[i2], f), y: lerp(j.ys[i], j.ys[i2], f), z: lerp(j.zs[i], j.zs[i2], f),
    heading, pitch: Math.atan(g), grade: g, curvature: k, bank: clamp((k * v * v) / 9.81 * 0.6, -0.07, 0.07),
  };
}

export const segmentAt = (j, s) => j.bounds.find((b) => s >= b.s0 && s < b.s1) ?? j.bounds[j.bounds.length - 1];

/** Waktu (detik) pada kecepatan jelajah untuk mencapai jarak s. */
export function timeAt(j, s) {
  let t = 0;
  for (const b of j.bounds) {
    if (s >= b.s1) t += b.length / b.cruise;
    else {
      if (s > b.s0) t += (s - b.s0) / b.cruise;
      break;
    }
  }
  return t;
}
/** Kebalikan timeAt: jarak yang ditempuh pada detik t. */
export function distanceAt(j, t) {
  let s = 0;
  let left = t;
  for (const b of j.bounds) {
    const d = b.length / b.cruise;
    if (left >= d) {
      left -= d;
      s = b.s1;
    } else return b.s0 + left * b.cruise;
  }
  return s;
}

export const eventsOf = (j, type) => j.events.filter((e) => e.type === type);
export const bridgeAt = (j, s) => eventsOf(j, 'bridge').find((e) => s >= e.s0 - 1 && s <= e.s1 + 1) ?? null;

// ---------------------------------------------------------------- medan
// Tinggi tanah = tinggi jalan terdekat + perbukitan relatif; dekat jalan tanah dipaksa rata dengan badan jalan, lalu
// menanjak/menurun mulus (tebing potongan dan tanggul) supaya jalan menyatu dengan lahan, bukan menempel di atasnya.
const ZONE_HILL = { utama: 3, berkelok: 8, bukit: 16, premium: 4, kedatangan: 2.5 };
const ZONE_SIDE = { utama: 0, berkelok: 0.22, bukit: 0.5, premium: 0.05, kedatangan: 0 };

export function waterLevelOf(j, ev) {
  const f = frameAt(j, (ev.s0 + ev.s1) / 2);
  return f.y - (ev.type === 'bridge' ? 6.5 : 1.8);
}

/** Tinggi tanah di (x, z). `hint` = hasil nearestOnRoute bila sudah dihitung. */
export function terrainHeight(j, x, z, hint = null) {
  const r = hint ?? nearestOnRoute(j, x, z);
  const f = frameAt(j, r.s);
  const seg = segmentAt(j, r.s);
  const dAbs = Math.abs(r.d);
  const far = smooth(ROAD.half + 3, ROAD.half + ROAD.embank + 30, dAbs);
  const hill = (fbm(x / 70, z / 70, j.spec.seed) - 0.5) * 2 * ZONE_HILL[seg.id] * far;
  const side = Math.sin(r.s / 450 + j.spec.seed) * ZONE_SIDE[seg.id];
  const slope = side * Math.min(dAbs, 70) * (r.d >= 0 ? 1 : -1) * 0.7;
  let natural = f.y + hill + slope - 0.4 * far;
  // jurang di bawah jembatan
  for (const e of eventsOf(j, 'bridge')) {
    const c = (e.s0 + e.s1) / 2;
    const w = Math.exp(-((r.s - c) ** 2) / (2 * 16 * 16));
    if (w > 0.002) natural = lerp(natural, waterLevelOf(j, e) - 1.5, w * smooth(ROAD.half + 1, ROAD.half + 9, dAbs));
  }
  // danau di kawasan premium
  for (const e of eventsOf(j, 'lake')) {
    if (r.s < e.s0 - 60 || r.s > e.s1 + 60) continue;
    const along = smooth(e.s0 - 60, e.s0 + 40, r.s) * (1 - smooth(e.s1 - 40, e.s1 + 60, r.s));
    const lateral = (r.d * e.side > 0 ? 1 : 0) * smooth(ROAD.half + 7, ROAD.half + 26, dAbs) * (1 - smooth(ROAD.half + 90, ROAD.half + 160, dAbs));
    const w = along * lateral;
    if (w > 0) natural = lerp(natural, waterLevelOf(j, e) - 3, w);
  }
  const wRoad = 1 - smooth(ROAD.half + 0.5, ROAD.half + ROAD.embank, dAbs);
  return lerp(natural, f.y, wRoad);
}

export const waterEvents = (j) => [...eventsOf(j, 'bridge'), ...eventsOf(j, 'lake')];
