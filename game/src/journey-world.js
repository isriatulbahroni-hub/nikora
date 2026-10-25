// Perjalanan menuju tempat acara (THREE): medan, jalan, pagar pengaman, rambu, jembatan, danau, pepohonan, gerbang utama, dan
// area kedatangan. Semua geometri bersumber dari journey.js (satu fungsi tinggi medan untuk gambar dan tabrakan) dan dimuat per
// potongan di sekitar kamera supaya ringan di HP. Bangunan tempat acara di area kedatangan masih berupa bentuk SEMENTARA
// (placeholder); halaman tempat acara yang sebenarnya dibuka dari tombol masuk (lihat journey-main.js).
import * as THREE from 'three';
import { GATE_S, ROAD, SEGMENTS, bridgeAt, clamp, eventsOf, frameAt, nearestOnRoute, noise2, rng, segmentAt, smooth, terrainHeight, waterLevelOf } from './journey.js';
import { VENUES } from './venues.js';

export const CHUNK = 96; // sisi potongan medan (m)
export const RES = 24; // sel per sisi potongan (4 m)
export const RADIUS = 3; // potongan di sekeliling kamera (±3 => 7 x 7)
export const FOG_FAR = 340;
const ROAD_CHUNK = 160;
const ROAD_RANGE = 640;

// Lebar jalan perjalanan yang digambar: 4 lajur (2 per arah) + bahu = 19 m (setengah lebar HALF = 9,5 m). Dulu 11 m (2 lajur).
// journey.js (data rute dan medan) tetap memakai ROAD.half lama; di sini medan diratakan selebar HALF lewat groundHeight().
export const HALF = 9.5;
const LANE_EDGE = 7.5; // tepi lajur (garis tepi putih); sisanya (HALF - LANE_EDGE) = bahu jalan
const LANE_MID = 3.75; // garis pemisah lajur searah (putus-putus)

// Pelebaran jalan di awal rute: jalan raya hotel selebar 34,5 m (setengah lebar 17,25 m) menyempit mulus menjadi jalan perjalanan
// (HALF) sepanjang FLARE.s1 meter, seperti jalan sungguhan (bukan lompatan lebar yang menempel).
export const FLARE = Object.freeze({ s1: 90, half: 17.25, shoulder: 3.5 });
/** Setengah lebar aspal (termasuk bahu) pada jarak s dari awal rute; tidak pernah lebih sempit dari HALF. */
export const flareHalf = (s) => {
  const t = clamp(s / FLARE.s1, 0, 1);
  return FLARE.half + (HALF - FLARE.half) * t * t * (3 - 2 * t);
};

const BOX = new THREE.BoxGeometry(1, 1, 1);
const TRUNK = new THREE.CylinderGeometry(0.5, 0.7, 1, 5).translate(0, 0.5, 0);
const CROWN = new THREE.IcosahedronGeometry(1, 0);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...o });
const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });
const lat = (h) => ({ x: Math.cos(h), z: -Math.sin(h) }); // kiri pengemudi (sama dengan highway.js leftOf)
const fwd = (h) => ({ x: Math.sin(h), z: Math.cos(h) });
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

/** Kotak-kotak dalam satu InstancedMesh. items: { x, y, z, sx, sy, sz, ry?, color? } (pusat kotak). */
function boxes(parent, items, material, { cast = false, receive = false, geometry = BOX } = {}) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    q.setFromEuler(e.set(0, it.ry ?? 0, 0));
    m.compose(p.set(it.x, it.y, it.z), q, sc.set(it.sx, it.sy, it.sz));
    mesh.setMatrixAt(i, m);
    if (it.color !== undefined) mesh.setColorAt(i, c.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

/** Papan bertulisan (hanya di browser; di Node tanpa canvas dikembalikan null). */
function labelTexture(title, sub, { bg = '#1d2a22', fg = '#f6ecd2', edge = '#c9a24b', w = 768, h = 160 } = {}) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = edge;
  g.lineWidth = 6;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = sub ? 64 : 72;
  g.font = `600 ${size}px Georgia, serif`;
  while (g.measureText(title).width > w - 60 && size > 24) {
    size -= 4;
    g.font = `600 ${size}px Georgia, serif`;
  }
  g.fillText(title, w / 2, sub ? h * 0.4 : h / 2);
  if (sub) {
    g.font = '500 34px ui-sans-serif, sans-serif';
    g.fillText(sub, w / 2, h * 0.78);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function sign(parent, tex, fallback, w, h, x, y, z, ry) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), tex ? basic(0xffffff, { map: tex }) : basic(fallback));
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  parent.add(mesh);
  return mesh;
}

const STRIPS = [ // [lateral kiri-, lateral kiri+, warna, tinggi]
  [-HALF, -LANE_EDGE, 0x4a4b4d, 0.03],
  [-LANE_EDGE, LANE_EDGE, 0x2b2c2f, 0.03],
  [LANE_EDGE, HALF, 0x4a4b4d, 0.03],
  [-0.2, -0.06, 0xe0b020, 0.045],
  [0.06, 0.2, 0xe0b020, 0.045],
  [-LANE_EDGE - 0.08, -LANE_EDGE + 0.08, 0xe8e8e0, 0.045],
  [LANE_EDGE - 0.08, LANE_EDGE + 0.08, 0xe8e8e0, 0.045],
];

/** Pembangun dunia perjalanan untuk satu rute. */
export function createJourneyWorld(j, { shadows = true } = {}) {
  const group = new THREE.Group();
  const terrain = new Map();
  const roads = new Map();
  const mats = {
    ground: std(0xffffff, { vertexColors: true, roughness: 0.96 }),
    road: std(0xffffff, { vertexColors: true, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    trunk: std(0x6b4a2c),
    crown: std(0xffffff),
    steel: std(0xb9bec4, { metalness: 0.4, roughness: 0.5 }),
    post: std(0x8c8f93),
    yellow: std(0xf0c020, { roughness: 0.6 }),
    glow: basic(0xfff1c2),
    stone: std(0xe3d5b3),
    stoneDark: std(0x7d6e55),
    wood: std(0x5a3e28),
    pave: std(0xcdb892, { roughness: 0.8 }),
    white: std(0xece6d6),
    water: new THREE.MeshStandardMaterial({ color: 0x2b7c92, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.86 }),
  };

  // ------------------------------------------------------------ medan
  const zoneTint = (seg) => ({ utama: 0x5f9a45, berkelok: 0x4f8a3c, bukit: 0x477f3a, premium: 0x88b25a, kedatangan: 0x78a850 }[seg.id]);
  const waterAt = (s, y) => {
    for (const e of [...eventsOf(j, 'bridge'), ...eventsOf(j, 'lake')]) if (s >= e.s0 - 120 && s <= e.s1 + 120 && y < waterLevelOf(j, e) + 0.8) return true;
    return false;
  };

  /** Tinggi tanah di (x, z), diratakan selebar aspal (HALF, dan pelebaran di awal rute) supaya aspal tidak terkubur atau melayang di atas tanah. */
  function groundHeight(x, z, r) {
    const y = terrainHeight(j, x, z, r);
    const f = frameAt(j, r.s);
    const fh = flareHalf(r.s);
    const w = 1 - smooth(fh + 0.5, fh + ROAD.embank, Math.abs(r.d));
    return y + (f.y - y) * w;
  }

  function buildTerrain(cx, cz) {
    const n = RES + 1;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const info = new Array(n * n);
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const x = x0 + (b * CHUNK) / RES;
      const z = z0 + (a * CHUNK) / RES;
      const r = nearestOnRoute(j, x, z);
      const k = a * n + b;
      pos[k * 3] = x;
      pos[k * 3 + 1] = groundHeight(x, z, r);
      pos[k * 3 + 2] = z;
      info[k] = r;
    }
    const idx = [];
    for (let a = 0; a < RES; a++) for (let b = 0; b < RES; b++) {
      const i = a * n + b;
      idx.push(i, i + n, i + 1, i + 1, i + n, i + n + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const nor = geo.getAttribute('normal');
    for (let k = 0; k < n * n; k++) {
      const r = info[k];
      const seg = segmentAt(j, r.s);
      const steep = 1 - nor.getY(k);
      const v = noise2(pos[k * 3] / 9, pos[k * 3 + 2] / 9, j.spec.seed);
      let c = mix(zoneTint(seg), j.spec.tint, 0.35).lerp(new THREE.Color(0x2f5a2a), v * 0.5);
      c = c.lerp(new THREE.Color(0x8b6b4a), smooth(0.18, 0.45, steep) * 0.9); // tebing potongan: tanah dan batu
      const half = flareHalf(r.s);
      c = c.lerp(new THREE.Color(0x77756c), 1 - smooth(half + 0.4, half + 2.2, Math.abs(r.d))); // bahu kerikil
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(geo, mats.ground);
    mesh.receiveShadow = shadows;
    g.add(mesh);
    plantTrees(g, x0, z0);
    group.add(g);
    return g;
  }

  function plantTrees(parent, x0, z0) {
    const rand = rng((Math.imul(x0 | 0, 73856093) ^ Math.imul(z0 | 0, 19349663) ^ j.spec.seed) >>> 0);
    const trunks = [];
    const crowns = [];
    const STEP = 10;
    for (let a = 0; a < CHUNK; a += STEP) for (let b = 0; b < CHUNK; b += STEP) {
      const x = x0 + b + rand() * STEP;
      const z = z0 + a + rand() * STEP;
      const r = nearestOnRoute(j, x, z);
      const seg = segmentAt(j, r.s);
      const dens = { utama: 0.35, berkelok: 0.8, bukit: 0.65, premium: 0.4, kedatangan: 0.3 }[seg.id];
      if (rand() > dens * (0.5 + noise2(x / 60, z / 60, j.spec.seed + 7))) continue;
      if (Math.abs(r.d) < flareHalf(r.s) + 4) continue; // jangan menanam pohon di atas aspal (termasuk pelebaran)
      if (r.s > j.length - 40 || r.s < GATE_S + 5) { if (Math.abs(r.d) < 40) continue; }
      const y = groundHeight(x, z, r);
      const slope = Math.max(Math.abs(terrainHeight(j, x + 2, z) - y), Math.abs(terrainHeight(j, x, z + 2) - y)) / 2;
      if (slope > 0.75 || waterAt(r.s, y)) continue;
      const size = 0.8 + rand() * 0.9 + (seg.id === 'premium' ? 0.3 : 0);
      const th = 2.2 * size + (seg.id === 'premium' ? 2.5 : 0);
      trunks.push({ x, y, z, sx: 0.5 * size, sy: th, sz: 0.5 * size, color: 0x6b4a2c });
      crowns.push({ x, y: y + th + size * 0.9, z, sx: 2.2 * size, sy: 1.7 * size, sz: 2.2 * size, ry: rand() * 6, color: mix(zoneTint(seg), 0x2f6a2c, rand() * 0.7).getHex() });
    }
    boxes(parent, trunks, mats.trunk, { geometry: TRUNK });
    boxes(parent, crowns, mats.crown, { geometry: CROWN });
  }

  // ------------------------------------------------------------ jalan
  function buildRoad(c) {
    const s0 = c * ROAD_CHUNK;
    const s1 = Math.min(j.length, s0 + ROAD_CHUNK);
    const i0 = Math.floor(s0 / ROAD.step);
    const i1 = Math.min(j.n - 1, Math.ceil(s1 / ROAD.step) + 1);
    const cnt = i1 - i0 + 1;
    const pos = new Float32Array(STRIPS.length * cnt * 2 * 3);
    const col = new Float32Array(pos.length);
    const idx = [];
    let v = 0;
    for (const [l0, l1, color, dy] of STRIPS) {
      const base = v;
      const cc = new THREE.Color(color);
      for (let i = i0; i <= i1; i++) {
        const L = lat(j.hs[i]);
        for (const l of [l0, l1]) {
          pos[v * 3] = j.xs[i] + L.x * l;
          pos[v * 3 + 1] = j.ys[i] + dy;
          pos[v * 3 + 2] = j.zs[i] + L.z * l;
          col[v * 3] = cc.r;
          col[v * 3 + 1] = cc.g;
          col[v * 3 + 2] = cc.b;
          v++;
        }
      }
      for (let i = 0; i < cnt - 1; i++) {
        const a = base + i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const g = new THREE.Group();
    const road = new THREE.Mesh(geo, mats.road);
    road.receiveShadow = shadows;
    g.add(road);

    // pagar pengaman di sisi luar tikungan, rambu chevron, lampu jalan, garis pemisah lajur putus-putus
    const rails = [];
    const posts = [];
    const chev = [];
    const poles = [];
    const lampP = [];
    const lampH = [];
    const dashes = [];
    for (let s = s0; s < s1; s += 4) {
      const f = frameAt(j, s);
      const seg = segmentAt(j, s);
      const L = lat(f.heading);
      const k = f.curvature;
      const inBridge = bridgeAt(j, s);
      if (Math.round(s / 4) % 3 === 0) {
        for (const sd of [-1, 1]) dashes.push({ x: f.x + L.x * sd * LANE_MID, y: f.y + 0.06, z: f.z + L.z * sd * LANE_MID, sx: 0.15, sy: 0.02, sz: 4.5, ry: f.heading });
      }
      const sides = inBridge ? [-1, 1] : Math.abs(k) > 1 / 170 ? [-Math.sign(k)] : [];
      for (const sd of sides) {
        const d = sd * (HALF + 0.7);
        rails.push({ x: f.x + L.x * d, y: f.y + 0.75, z: f.z + L.z * d, sx: 0.12, sy: 0.32, sz: 4.1, ry: f.heading, color: 0xd9dcdf });
        posts.push({ x: f.x + L.x * d, y: f.y + 0.4, z: f.z + L.z * d, sx: 0.14, sy: 0.9, sz: 0.14, ry: f.heading });
      }
      if (!inBridge && Math.abs(k) > 1 / 85 && Math.round(s / 4) % 6 === 0) {
        const d = -Math.sign(k) * (HALF + 1.9);
        poles.push({ x: f.x + L.x * d, y: f.y + 0.9, z: f.z + L.z * d, sx: 0.08, sy: 1.8, sz: 0.08 });
        chev.push({ x: f.x + L.x * d, y: f.y + 1.9, z: f.z + L.z * d, sx: 0.95, sy: 0.85, sz: 0.06, ry: f.heading, color: 0xf2c200 });
      }
      if (['utama', 'premium', 'kedatangan'].includes(seg.id) && Math.round(s / 4) % 10 === 0 && !inBridge) {
        for (const sd of [-1, 1]) {
          const d = sd * (HALF + 2.4);
          lampP.push({ x: f.x + L.x * d, y: f.y + 3.4, z: f.z + L.z * d, sx: 0.14, sy: 6.8, sz: 0.14 });
          lampH.push({ x: f.x + L.x * (d - sd * 0.9), y: f.y + 6.75, z: f.z + L.z * (d - sd * 0.9), sx: 0.5, sy: 0.18, sz: 0.5, ry: f.heading });
        }
      }
    }
    boxes(g, dashes, mats.white);
    boxes(g, rails, mats.steel);
    boxes(g, posts, mats.post);
    boxes(g, poles, mats.post);
    boxes(g, chev, mats.yellow);
    boxes(g, lampP, mats.post);
    boxes(g, lampH, mats.glow);
    group.add(g);
    return g;
  }

  // ------------------------------------------------------------ pelebaran jalan di awal rute (menyambung jalan raya hotel)
  // Dua sayap aspal di kiri dan kanan jalan perjalanan: dari selebar jalan raya hotel di gerbang jalan raya (s = 0) menyempit mulus
  // sampai selebar jalan perjalanan. Warna aspal dan bahu sama dengan jalan raya hotel, garis tepi putih mengikuti tepi lajur.
  function buildFlare() {
    const STEP = 5;
    const n = Math.round(FLARE.s1 / STEP) + 1;
    const pos = [];
    const col = [];
    const idx = [];
    let v = 0;
    const shoulderW = (s) => (HALF - LANE_EDGE) + (FLARE.shoulder - (HALF - LANE_EDGE)) * ((flareHalf(s) - HALF) / (FLARE.half - HALF));
    const laneEdge = (s) => Math.max(HALF, flareHalf(s) - shoulderW(s)); // tepi lajur pelebaran (awal bahu)
    const ribbon = (sd, lo, hi, color, dy) => {
      const base = v;
      const cc = new THREE.Color(color);
      for (let i = 0; i < n; i++) {
        const s = Math.min(FLARE.s1, i * STEP);
        const f = frameAt(j, s);
        const L = lat(f.heading);
        const a = lo(s);
        const b = hi(s);
        const l0 = sd > 0 ? a : -b; // selalu l0 < l1 supaya sisi atas menghadap ke atas (sama dengan buildRoad)
        const l1 = sd > 0 ? b : -a;
        for (const l of [l0, l1]) {
          pos.push(f.x + L.x * l, f.y + dy, f.z + L.z * l);
          col.push(cc.r, cc.g, cc.b);
          v++;
        }
      }
      for (let i = 0; i < n - 1; i++) {
        const a = base + i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    };
    for (const sd of [-1, 1]) {
      ribbon(sd, () => HALF, laneEdge, 0x2a2c31, 0.03); // aspal lajur tambahan
      ribbon(sd, laneEdge, flareHalf, 0x3b3d43, 0.028); // bahu
      ribbon(sd, (s) => Math.max(HALF, laneEdge(s) - 0.2), laneEdge, 0xe8e8e0, 0.045); // garis tepi putih
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mats.road);
    mesh.name = 'pelebaran-jalan';
    mesh.receiveShadow = shadows;
    group.add(mesh);
  }

  // ------------------------------------------------------------ jembatan, air, danau, rambu persimpangan (sekali jadi)
  function buildFixed() {
    for (const e of eventsOf(j, 'bridge')) {
      const mid = (e.s0 + e.s1) / 2;
      const f = frameAt(j, mid);
      const wl = waterLevelOf(j, e);
      const len = e.s1 - e.s0 + 4;
      const g = new THREE.Group();
      g.position.set(f.x, f.y, f.z);
      g.rotation.y = f.heading;
      const items = [
        { x: 0, y: -0.35, z: 0, sx: HALF * 2 + 1.6, sy: 0.7, sz: len, color: 0x9a948a },
        { x: HALF + 0.5, y: 0.55, z: 0, sx: 0.4, sy: 1.1, sz: len, color: 0xcfc6b0 },
        { x: -HALF - 0.5, y: 0.55, z: 0, sx: 0.4, sy: 1.1, sz: len, color: 0xcfc6b0 },
      ];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) items.push({ x: sx * 6.5, y: (wl - f.y) / 2 - 0.7, z: sz * (len / 2 - 6), sx: 1.8, sy: f.y - wl - 0.7, sz: 1.8, color: 0x8d877c });
      boxes(g, items, std(0xffffff), { cast: false });
      const w = new THREE.Mesh(new THREE.PlaneGeometry(240, 120), mats.water);
      w.rotation.x = -Math.PI / 2;
      w.position.set(0, wl - f.y, 0);
      g.add(w);
      group.add(g);
    }
    for (const e of eventsOf(j, 'lake')) {
      const wl = waterLevelOf(j, e);
      const pos = [];
      const idx = [];
      let v = 0;
      for (let s = e.s0 - 60; s <= e.s1 + 60; s += 20) {
        const f = frameAt(j, s);
        const L = lat(f.heading);
        for (const d of [e.side * (HALF + 4), e.side * (HALF + 175)]) pos.push(f.x + L.x * d, wl, f.z + L.z * d);
        if (v) idx.push(v - 2, v, v - 1, v - 1, v, v + 1);
        v += 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mats.water);
      m.material.side = THREE.DoubleSide;
      group.add(m);
    }
    for (const e of eventsOf(j, 'junction')) {
      const f = frameAt(j, e.s - 26);
      const L = lat(f.heading);
      const d = (HALF + 3.2) * e.side * -1;
      const g = new THREE.Group();
      g.position.set(f.x + L.x * d, f.y, f.z + L.z * d);
      g.rotation.y = f.heading;
      boxes(g, [{ x: -1.6, y: 1.6, z: 0, sx: 0.14, sy: 3.2, sz: 0.14 }, { x: 1.6, y: 1.6, z: 0, sx: 0.14, sy: 3.2, sz: 0.14 }], mats.post);
      const venue = VENUES[j.venue]?.label ?? 'Tempat acara';
      sign(g, labelTexture(venue, 'lurus · jalan khusus tertutup'), 0x1d6a3a, 4.2, 1.1, 0, 2.7, -0.05, Math.PI);
      group.add(g);
    }
    buildFlare();
    group.add(buildGate(), buildArrival());
  }

  // ------------------------------------------------------------ gerbang utama (kompleks: fondasi, sayap tebal, tiang, kanopi, pos jaga, air mancur)
  // Tidak ada lagi hamparan paving pasir di atas jalan: dulu paving 120 m menutupi aspal sehingga jalan tampak "mundur" dan menempel.
  // Sekarang aspal jalan (dan pelebarannya) terus menerus lewat bawah gerbang. Gerbang dilebarkan mengikuti jalan 19 m.
  function buildGate() {
    const f = frameAt(j, GATE_S);
    const g = new THREE.Group();
    g.position.set(f.x, f.y, f.z);
    g.rotation.y = f.heading;
    const H = HALF;
    const wood = 0x5a3e28;
    const sand = 0xe3d5b3;
    const PIL = 14.8; // setengah jarak antar tiang gerbang
    const WING = 24.5; // pusat sayap
    const items = [];
    const slats = [];
    for (const sd of [-1, 1]) {
      items.push({ x: sd * WING, y: 2.9, z: 0, sx: 15, sy: 6.4, sz: 6, color: sand });
      items.push({ x: sd * WING, y: -1.5, z: 0, sx: 16.2, sy: 4.2, sz: 7.2, color: 0x7d6e55 }); // fondasi: menenggelamkan sayap ke tanah
      items.push({ x: sd * WING, y: 6.25, z: 0, sx: 15.8, sy: 0.4, sz: 6.8, color: wood });
      items.push({ x: sd * PIL, y: 5.2, z: 0, sx: 1.9, sy: 10.4, sz: 1.9, color: 0xeadfc2 }); // tiang
      items.push({ x: sd * PIL, y: -0.4, z: 0, sx: 2.8, sy: 1.6, sz: 2.8, color: 0x8d7e63 });
      for (let q = -6; q <= 6; q++) slats.push({ x: sd * WING + q * 1.05, y: 2.9, z: -3.1, sx: 0.5, sy: 4.4, sz: 0.25, color: 0x4a3a28 });
      items.push({ x: sd * (WING - 2), y: 0.5, z: -9, sx: 9.5, sy: 1, sz: 5.4, color: sand }); // kolam air mancur
      items.push({ x: sd * (WING - 2), y: 1.05, z: -9, sx: 8.6, sy: 0.12, sz: 4.5, color: 0x3aa6c4 });
      items.push({ x: sd * (WING - 2), y: 2.3, z: -9, sx: 0.28, sy: 2.6, sz: 0.28, color: 0xdff6ff });
    }
    items.push({ x: 0, y: 10.9, z: 0, sx: 66, sy: 0.9, sz: 10, color: wood }); // kanopi
    items.push({ x: 0, y: 11.5, z: 0, sx: 68, sy: 0.35, sz: 12, color: 0xcdbf9d });
    items.push({ x: 0, y: 9.5, z: -4.9, sx: 15.2, sy: 3.4, sz: 0.4, color: 0xc9a24b }); // bingkai papan nama
    items.push({ x: H + 2.7, y: 1.7, z: 1, sx: 2.6, sy: 3.4, sz: 5, color: 0x6b5a3c }); // pos jaga
    items.push({ x: H + 2.7, y: 3.5, z: 1, sx: 3.4, sy: 0.3, sz: 5.8, color: wood });
    items.push({ x: H + 2.7, y: 1.9, z: -1.55, sx: 2.2, sy: 1.6, sz: 0.1, color: 0x1b2a33 }); // kaca
    boxes(g, items, std(0xffffff), { cast: shadows, receive: shadows });
    boxes(g, slats, std(0xffffff));
    boxes(g, [{ x: 0, y: 10.3, z: -3.6, sx: 50, sy: 0.12, sz: 0.3, color: 0xffd98a }], basic(0xffffff)); // lampu hangat di bawah kanopi
    // palem (di luar tepi aspal pelebaran)
    const tr = [];
    const cr = [];
    for (const sd of [-1, 1]) for (const z of [-14, -21, -28]) {
      const x = sd * (H + 8.5);
      const h = 6.5 + ((z * 7) % 3);
      tr.push({ x, y: 0, z, sx: 0.4, sy: h, sz: 0.4, color: 0x8a6a3a });
      cr.push({ x, y: h + 0.4, z, sx: 2.8, sy: 0.9, sz: 2.8, ry: z, color: 0x2f7a35 });
    }
    boxes(g, tr, mats.trunk, { geometry: TRUNK });
    boxes(g, cr, mats.crown, { geometry: CROWN });
    // palang (terbuka), papan nama
    for (const sd of [-1, 1]) {
      const px = sd * (H + 1.1);
      const post = new THREE.Mesh(BOX, std(0x2b2f33));
      post.scale.set(0.4, 1.1, 0.4);
      post.position.set(px, 0.6, 0);
      g.add(post);
      const arm = new THREE.Mesh(BOX, std(0xd33b2c));
      arm.scale.set(3.6, 0.14, 0.14);
      arm.position.set(px - sd * Math.cos(1.2) * 1.8, 1.15 + Math.sin(1.2) * 1.8, 0);
      arm.rotation.z = sd * 1.2;
      g.add(arm);
    }
    sign(g, labelTexture('NIKORA', 'Kawasan Pernikahan', { bg: '#241a10', fg: '#f6ecd2', w: 1024, h: 250 }), 0x241a10, 14.4, 3.1, 0, 9.5, -5.15, Math.PI);
    return g;
  }

  // ------------------------------------------------------------ area kedatangan (bangunan SEMENTARA)
  function buildArrival() {
    const f = frameAt(j, j.length);
    const g = new THREE.Group();
    g.position.set(f.x, f.y, f.z);
    g.rotation.y = f.heading;
    const items = [{ x: 0, y: 0.09, z: 60, sx: 64, sy: 0.12, sz: 130, color: 0xcdb892 }];
    items.push({ x: 0, y: -2, z: 60, sx: 66, sy: 4, sz: 132, color: 0x7d6e55 });
    items.push({ x: 0, y: 7.2, z: 30, sx: 26, sy: 0.7, sz: 16, color: 0x5a3e28 }); // porte-cochere
    for (const x of [-12.5, -4.2, 4.2, 12.5]) for (const z of [24, 36]) items.push({ x, y: 3.6, z, sx: 0.9, sy: 7.2, sz: 0.9, color: 0xeadfc2 });
    items.push({ x: 0, y: 9.5, z: 92, sx: 70, sy: 19, sz: 30, color: 0xe8dcc0 });
    items.push({ x: 0, y: 19.4, z: 92, sx: 76, sy: 1, sz: 36, color: 0x6b5a3c });
    for (const sd of [-1, 1]) items.push({ x: sd * 44, y: 6.5, z: 86, sx: 16, sy: 13, sz: 20, color: 0xe8dcc0 });
    for (let x = -30; x <= 30; x += 6) items.push({ x, y: 7.5, z: 75, sx: 1.1, sy: 15, sz: 1.1, color: 0xf2ead6 });
    boxes(g, items, std(0xffffff), { cast: shadows, receive: shadows });
    const win = [];
    for (let x = -27; x <= 27; x += 6) win.push({ x, y: 7, z: 76.6, sx: 2.6, sy: 6, sz: 0.2, color: 0xffd38a });
    boxes(g, win, basic(0xffffff));
    const island = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.6, 0.6, 24), std(0x5f8f4a));
    island.position.set(0, 0.35, 56);
    g.add(island);
    const label = VENUES[j.venue]?.label ?? 'Tempat acara';
    sign(g, labelTexture(label, 'bentuk sementara', { bg: '#241a10', w: 1024, h: 200 }), 0x241a10, 26, 3.4, 0, 14, 76.8, 0);
    return g;
  }

  buildFixed();

  // ------------------------------------------------------------ pemuatan per potongan
  // Jalan dimuat LEBIH DULU dan yang terdekat dengan pemain lebih dulu (dulu dari yang paling belakang, dan menunggu anggaran tanah habis,
  // sehingga jalan tepat di depan pemain muncul paling akhir dan tampak menjauh saat pemain maju).
  function ensure(cam, s, budget = 2) {
    let built = 0;
    const c0 = Math.max(0, Math.floor((s - ROAD_RANGE) / ROAD_CHUNK));
    const c1 = Math.floor(Math.min(j.length, s + ROAD_RANGE) / ROAD_CHUNK);
    const mid = (c) => (c + 0.5) * ROAD_CHUNK;
    const need = [];
    for (let c = c0; c <= c1; c++) if (!roads.has(c)) need.push(c);
    need.sort((p, q) => Math.abs(mid(p) - s) - Math.abs(mid(q) - s));
    const roadBudget = budget >= 999 ? 999 : 2;
    for (const c of need) {
      if (built >= roadBudget) break;
      roads.set(c, buildRoad(c));
      built++;
    }
    for (const [c, g] of roads) if (c < c0 || c > c1) { dispose(g); roads.delete(c); }

    const ccx = Math.floor(cam.x / CHUNK);
    const ccz = Math.floor(cam.z / CHUNK);
    const want = [];
    for (let a = -RADIUS; a <= RADIUS; a++) for (let b = -RADIUS; b <= RADIUS; b++) want.push([ccx + b, ccz + a, a * a + b * b]);
    want.sort((p, q) => p[2] - q[2]);
    let terrainBuilt = 0;
    const keep = new Set();
    for (const [cx, cz] of want) {
      const key = `${cx},${cz}`;
      keep.add(key);
      if (!terrain.has(key) && terrainBuilt < budget) {
        terrain.set(key, buildTerrain(cx, cz));
        terrainBuilt++;
        built++;
      }
    }
    for (const [key, g] of terrain) if (!keep.has(key)) { dispose(g); terrain.delete(key); }
    return built;
  }

  function dispose(g) {
    group.remove(g);
    g.traverse((o) => {
      if (o.geometry && o.geometry !== BOX && o.geometry !== TRUNK && o.geometry !== CROWN) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
    });
  }

  /** Muat semua yang perlu di sekitar posisi awal sekaligus (layar loading singkat). */
  function prime(cam, s) {
    while (ensure(cam, s, 999) > 0) { /* ulangi sampai tidak ada yang baru */ }
  }

  return { group, ensure, prime, counts: () => ({ terrain: terrain.size, roads: roads.size }), dispose: () => { for (const g of [...terrain.values(), ...roads.values()]) dispose(g); terrain.clear(); roads.clear(); } };
}

export const SEGMENT_NAMES = SEGMENTS.map((s) => s.name);
export { fwd };
