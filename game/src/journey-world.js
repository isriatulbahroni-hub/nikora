// Perjalanan menuju tempat acara (THREE): medan, jalan, pagar pengaman, rambu, jembatan, danau, pepohonan, gerbang utama, dan
// area kedatangan. Semua geometri bersumber dari journey.js (satu fungsi tinggi medan untuk gambar dan tabrakan) dan dimuat per
// potongan di sekitar kamera supaya ringan di HP. Bangunan tempat acara di area kedatangan masih berupa bentuk SEMENTARA
// (placeholder); halaman tempat acara yang sebenarnya dibuka dari tombol masuk (lihat journey-main.js).
import * as THREE from 'three';
import { GATE_S, ROAD, SEGMENTS, UTURN, bridgeAt, clamp, eventsOf, frameAt, nearestOnRoute, noise2, rng, segmentAt, smooth, terrainHeight, uturnSigns, uturnSites, waterLevelOf } from './journey.js';
import { CARRIAGE_HALF, HIGHWAY_HALF, LANES_PER_DIRECTION, LANE_WIDTH, MEDIAN_WIDTH, SHOULDER_WIDTH } from './highway.js';
import { VENUES } from './venues.js';
import { lampThreshold, paintLamps, warmScale } from './night-lamps.js';

export const CHUNK = 96; // sisi potongan medan (m)
export const RES = 24; // sel per sisi potongan (4 m)
export const RADIUS = 3; // potongan di sekeliling kamera (±3 => 7 x 7)
export const FOG_FAR = 340;
const ROAD_CHUNK = 160;
const ROAD_RANGE = 640;

// Jalan perjalanan memakai penampang yang SAMA PERSIS dengan Jalan Raya NIKORA (highway.js): 4 lajur per arah + median bertanaman 5 m +
// bahu 3,5 m = 42 m (setengah lebar HALF = 21 m). Dulu 11 m, lalu 19 m, sehingga di gerbang jalan raya yang lebar harus menyempit lewat
// sayap aspal yang tampak ditempel. Sekarang lebarnya sama dari jalan raya sampai ujung rute: tidak ada penyempitan dan tidak ada sambungan.
// journey.js (data rute dan medan) tetap memakai ROAD.half lama; di sini medan diratakan selebar HALF lewat groundHeight().
export const HALF = HIGHWAY_HALF;
const CARR = CARRIAGE_HALF; // tepi lajur terluar (garis tepi putih); sisanya (HALF - CARR) = bahu jalan
const MED = MEDIAN_WIDTH / 2; // setengah lebar median

// Dulu pelebaran di awal rute (sayap aspal dari 34,5 m ke 19 m). Dipertahankan sebagai konstanta kosong supaya modul lain tetap bisa memanggilnya.
export const FLARE = Object.freeze({ s1: 0, half: HALF, shoulder: SHOULDER_WIDTH });
/** Setengah lebar aspal (termasuk bahu) pada jarak s dari awal rute: selalu HALF (sama dengan jalan raya hotel). */
export const flareHalf = () => HALF;

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

// Aspal sama dengan jalan raya hotel (highway-world.js): lajur 0x2a2c31, bahu 0x3b3d43, garis tepi putih. Median dan marka lajur digambar
// per potongan jalan (buildRoad) supaya bisa dibuka di tempat putar balik.
const STRIPS = [ // [lateral kiri-, lateral kiri+, warna, tinggi]
  [-HALF, -CARR, 0x3b3d43, 0.028],
  [-CARR, CARR, 0x2a2c31, 0.03],
  [CARR, HALF, 0x3b3d43, 0.028],
  [-CARR - 0.1, -CARR + 0.1, 0xf2f0e4, 0.045],
  [CARR - 0.1, CARR + 0.1, 0xf2f0e4, 0.045],
];

/** Pembangun dunia perjalanan untuk satu rute. */
export function createJourneyWorld(j, { shadows = true } = {}) {
  const group = new THREE.Group();
  const terrain = new Map();
  const roads = new Map();
  const signMats = new Map();
  const mats = {
    ground: std(0xffffff, { vertexColors: true, roughness: 0.96 }),
    road: std(0xffffff, { vertexColors: true, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    plain: std(0xffffff),
    trunk: std(0x6b4a2c),
    crown: std(0xffffff),
    steel: std(0xb9bec4, { metalness: 0.4, roughness: 0.5 }),
    post: std(0x8c8f93),
    sign: std(0x6e7378),
    yellow: std(0xf0c020, { roughness: 0.6 }),
    laneYellow: std(0xe6b422, { roughness: 0.7 }),
    glow: basic(0xffffff), // warna per lampu dari night-lamps.js (padam siang, menyala satu per satu saat senja)
    warm: basic(0xffffff), // lampu hangat gerbang dan jendela kedatangan: meredup di siang
    stone: std(0xe3d5b3),
    stoneDark: std(0x7d6e55),
    wood: std(0x5a3e28),
    pave: std(0xcdb892, { roughness: 0.8 }),
    white: std(0xf2f0e4, { roughness: 0.7 }),
    water: new THREE.MeshStandardMaterial({ color: 0x2b7c92, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.86 }),
  };
  const sites = uturnSites(j);
  const nearGap = (s, pad = 0) => sites.some((u) => Math.abs(s - u.s) < UTURN.gap / 2 + pad);
  const lamps = new Set(); // InstancedMesh kepala lampu jalan (dicat ulang saat tingkat malam berubah)
  let nightNow = 0;

  // ------------------------------------------------------------ medan
  const zoneTint = (seg) => ({ utama: 0x5f9a45, berkelok: 0x4f8a3c, bukit: 0x477f3a, premium: 0x88b25a, kedatangan: 0x78a850 }[seg.id]);
  const waterAt = (s, y) => {
    for (const e of [...eventsOf(j, 'bridge'), ...eventsOf(j, 'lake')]) if (s >= e.s0 - 120 && s <= e.s1 + 120 && y < waterLevelOf(j, e) + 0.8) return true;
    return false;
  };

  /** Tinggi tanah di (x, z), diratakan selebar aspal (HALF) supaya aspal tidak terkubur atau melayang di atas tanah. */
  function groundHeight(x, z, r) {
    const y = terrainHeight(j, x, z, r);
    const f = frameAt(j, r.s);
    const w = 1 - smooth(HALF + 0.5, HALF + ROAD.embank, Math.abs(r.d));
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
      c = c.lerp(new THREE.Color(0x77756c), 1 - smooth(HALF + 0.4, HALF + 2.2, Math.abs(r.d))); // bahu kerikil
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
      if (Math.abs(r.d) < HALF + 9) continue; // jangan menanam pohon di atas aspal, di bahu, atau di tempat papan penunjuk berdiri
      if (r.s > j.length - 40 || r.s < GATE_S + 5) { if (Math.abs(r.d) < 50) continue; }
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

  // ------------------------------------------------------------ papan penunjuk putar balik
  /** Bahan papan (satu per teks dan jenis, dipakai bersama semua papan; dibuang di dispose). Hijau = jarak, biru = bukaan sudah di depan. */
  function signMaterial(sp) {
    const key = `${sp.kind}|${sp.text}`;
    let m = signMats.get(key);
    if (!m) {
      const dekat = sp.kind === 'dekat';
      const tex = labelTexture('PUTAR BALIK', sp.text, { bg: dekat ? '#0b4a8a' : '#0b6b3a', fg: '#ffffff', edge: '#ffffff', w: 1024, h: 300 });
      m = tex ? basic(0xffffff, { map: tex }) : basic(dekat ? 0x0b4a8a : 0x0b6b3a);
      signMats.set(key, m);
    }
    return m;
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

    // median bertanaman (dibuka di tempat putar balik), garis kuning di tepi median, marka lajur putus-putus, lampu dua lengan di median,
    // pagar pengaman di sisi luar tikungan, rambu chevron
    const rails = [];
    const posts = [];
    const chev = [];
    const poles = [];
    const curbs = [];
    const soils = [];
    const noses = [];
    const yellows = [];
    const dashes = [];
    const lampP = [];
    const lampA = [];
    const lampH = [];
    const medTrunks = [];
    const medCrowns = [];
    for (let s = s0; s < s1; s += 4) {
      const f = frameAt(j, s + 2); // bingkai di tengah sel 4 m
      const L = lat(f.heading);
      const k = f.curvature;
      const inBridge = bridgeAt(j, s + 2);
      const cell = Math.round(s / 4);
      const open = nearGap(s + 2);
      const hasMedian = !open && s + 4 <= j.length - 6;
      if (hasMedian) {
        curbs.push({ x: f.x, y: f.y + 0.15, z: f.z, sx: MEDIAN_WIDTH, sy: 0.3, sz: 4.25, ry: f.heading, color: 0xcfcfc8 });
        soils.push({ x: f.x, y: f.y + 0.18, z: f.z, sx: MEDIAN_WIDTH - 0.8, sy: 0.36, sz: 4.3, ry: f.heading, color: 0x4d7d3b });
        for (const sd of [-1, 1]) yellows.push({ x: f.x + L.x * sd * (MED + 0.3), y: f.y + 0.06, z: f.z + L.z * sd * (MED + 0.3), sx: 0.15, sy: 0.02, sz: 4.2, ry: f.heading });
      }
      // marka lajur putus-putus (tiap 12 m), tetap ada di bukaan putar balik
      if (cell % 3 === 0) {
        for (const sd of [-1, 1]) for (let q = 1; q < LANES_PER_DIRECTION; q++) {
          const d = sd * (MED + q * LANE_WIDTH);
          dashes.push({ x: f.x + L.x * d, y: f.y + 0.06, z: f.z + L.z * d, sx: 0.15, sy: 0.02, sz: 4.5, ry: f.heading });
        }
      }
      // pohon dan lampu di median
      if (hasMedian && !inBridge && !nearGap(s + 2, 10) && s > GATE_S - 30) {
        if (cell % 6 === 0 && cell % 8 !== 0) {
          const hgt = 3.4 + ((cell * 7) % 5) * 0.2;
          medTrunks.push({ x: f.x, y: f.y + 0.3, z: f.z, sx: 0.35, sy: hgt * 0.8, sz: 0.35, color: 0x6b4a2f });
          medCrowns.push({ x: f.x, y: f.y + 0.3 + hgt * 0.8 + 0.9, z: f.z, sx: 2.4, sy: 2.2, sz: 2.4, ry: cell, color: [0x2f6f3a, 0x3c8044, 0x27603a][cell % 3] });
        }
        if (cell % 8 === 0) {
          lampP.push({ x: f.x, y: f.y + 4.5, z: f.z, sx: 0.25, sy: 9, sz: 0.25 });
          lampA.push({ x: f.x, y: f.y + 8.9, z: f.z, sx: 17, sy: 0.18, sz: 0.18, ry: f.heading });
          for (const sd of [-1, 1]) lampH.push({ x: f.x + L.x * sd * 8, y: f.y + 8.7, z: f.z + L.z * sd * 8, sx: 0.8, sy: 0.2, sz: 0.5, ry: f.heading, color: 0xffffff, th: lampThreshold(cell) });
        }
      }
      const sides = inBridge ? [-1, 1] : Math.abs(k) > 1 / 170 ? [-Math.sign(k)] : [];
      for (const sd of sides) {
        const d = sd * (HALF + 0.7);
        rails.push({ x: f.x + L.x * d, y: f.y + 0.75, z: f.z + L.z * d, sx: 0.12, sy: 0.32, sz: 4.1, ry: f.heading, color: 0xd9dcdf });
        posts.push({ x: f.x + L.x * d, y: f.y + 0.4, z: f.z + L.z * d, sx: 0.14, sy: 0.9, sz: 0.14, ry: f.heading });
      }
      if (!inBridge && Math.abs(k) > 1 / 85 && cell % 6 === 0) {
        const d = -Math.sign(k) * (HALF + 1.9);
        poles.push({ x: f.x + L.x * d, y: f.y + 0.9, z: f.z + L.z * d, sx: 0.08, sy: 1.8, sz: 0.08 });
        chev.push({ x: f.x + L.x * d, y: f.y + 1.9, z: f.z + L.z * d, sx: 0.95, sy: 0.85, sz: 0.06, ry: f.heading, color: 0xf2c200 });
      }
    }
    // ujung bukaan putar balik: ujung median dicat kuning supaya kelihatan dari jauh
    for (const u of sites) {
      for (const sd of [-1, 1]) {
        const ss = u.s + sd * (UTURN.gap / 2 + 0.5);
        if (ss < s0 || ss >= s1) continue;
        const f = frameAt(j, ss);
        noses.push({ x: f.x, y: f.y + 0.17, z: f.z, sx: MEDIAN_WIDTH, sy: 0.34, sz: 1, ry: f.heading, color: 0xe6b422 });
      }
    }
    // papan penunjuk putar balik: dua arah, di luar bahu, menghadap lalu lintas yang datang
    const signBack = [];
    const signPosts = [];
    for (const sp of uturnSigns(j)) {
      if (sp.s < s0 || sp.s >= s1) continue;
      const f = frameAt(j, sp.s);
      const L = lat(f.heading);
      const d0 = (sp.dir === 1 ? 1 : -1) * (HALF + 4.6); // arah maju: sisi kiri jalan; arah balik: sisi kiri lalu lintas balik (= kanan rute)
      const ry = sp.dir === 1 ? f.heading + Math.PI : f.heading;
      const nx = Math.sin(ry);
      const nz = Math.cos(ry);
      const cx0 = f.x + L.x * d0;
      const cz0 = f.z + L.z * d0;
      const cy = f.y + 4.4;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.4), signMaterial(sp));
      board.position.set(cx0 + nx * 0.08, cy, cz0 + nz * 0.08);
      board.rotation.y = ry;
      g.add(board);
      signBack.push({ x: cx0, y: cy, z: cz0, sx: 8.2, sy: 2.6, sz: 0.12, ry, color: 0x6e7378 });
      for (const sd of [-1, 1]) signPosts.push({ x: cx0 + L.x * sd * 3, y: f.y + 2.3, z: cz0 + L.z * sd * 3, sx: 0.22, sy: 4.8, sz: 0.22 });
    }
    boxes(g, curbs, mats.plain, { receive: shadows });
    boxes(g, soils, mats.plain);
    boxes(g, noses, mats.plain);
    boxes(g, yellows, mats.laneYellow);
    boxes(g, dashes, mats.white);
    boxes(g, medTrunks, mats.trunk, { geometry: TRUNK });
    boxes(g, medCrowns, mats.crown, { geometry: CROWN });
    boxes(g, rails, mats.steel);
    boxes(g, posts, mats.post);
    boxes(g, poles, mats.post);
    boxes(g, chev, mats.yellow);
    boxes(g, lampP, mats.post);
    boxes(g, lampA, mats.post);
    const lampMesh = boxes(g, lampH, mats.glow);
    if (lampMesh) {
      lampMesh.userData.th = lampH.map((l) => l.th);
      lamps.add(lampMesh);
      paintLamps(lampMesh, nightNow);
    }
    boxes(g, signBack, mats.plain);
    boxes(g, signPosts, mats.post);
    group.add(g);
    return g;
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
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) items.push({ x: sx * 14, y: (wl - f.y) / 2 - 0.7, z: sz * (len / 2 - 6), sx: 2.4, sy: f.y - wl - 0.7, sz: 2.4, color: 0x8d877c });
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
    group.add(buildGate(), buildArrival());
  }

  // ------------------------------------------------------------ gerbang utama (kompleks: fondasi, sayap tebal, tiang, kanopi, pos jaga, air mancur)
  // Aspal jalan (selebar jalan raya hotel, tanpa penyempitan) terus menerus lewat bawah gerbang. Gerbang dilebarkan mengikuti jalan 42 m:
  // tiang, sayap, kanopi, dan lampu digeser keluar sebesar selisih setengah lebar jalan dibanding rancangan awal (jalan 19 m).
  function buildGate() {
    const f = frameAt(j, GATE_S);
    const g = new THREE.Group();
    g.position.set(f.x, f.y, f.z);
    g.rotation.y = f.heading;
    const H = HALF;
    const D = HALF - 9.5; // geser keluar dibanding rancangan awal
    const wood = 0x5a3e28;
    const sand = 0xe3d5b3;
    const PIL = 14.8 + D; // setengah jarak antar tiang gerbang
    const WING = 24.5 + D; // pusat sayap
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
    items.push({ x: 0, y: 10.9, z: 0, sx: 66 + 2 * D, sy: 0.9, sz: 10, color: wood }); // kanopi
    items.push({ x: 0, y: 11.5, z: 0, sx: 68 + 2 * D, sy: 0.35, sz: 12, color: 0xcdbf9d });
    items.push({ x: 0, y: 9.5, z: -4.9, sx: 15.2, sy: 3.4, sz: 0.4, color: 0xc9a24b }); // bingkai papan nama
    items.push({ x: H + 2.7, y: 1.7, z: 1, sx: 2.6, sy: 3.4, sz: 5, color: 0x6b5a3c }); // pos jaga
    items.push({ x: H + 2.7, y: 3.5, z: 1, sx: 3.4, sy: 0.3, sz: 5.8, color: wood });
    items.push({ x: H + 2.7, y: 1.9, z: -1.55, sx: 2.2, sy: 1.6, sz: 0.1, color: 0x1b2a33 }); // kaca
    boxes(g, items, std(0xffffff), { cast: shadows, receive: shadows });
    boxes(g, slats, std(0xffffff));
    boxes(g, [{ x: 0, y: 10.3, z: -3.6, sx: 50 + 2 * D, sy: 0.12, sz: 0.3, color: 0xffd98a }], mats.warm); // lampu hangat di bawah kanopi (meredup di siang)
    // palem (di luar tepi aspal)
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
    boxes(g, win, mats.warm); // jendela kedatangan: meredup di siang, terang di malam
    const island = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.6, 0.6, 24), std(0x5f8f4a));
    island.position.set(0, 0.35, 56);
    g.add(island);
    const label = VENUES[j.venue]?.label ?? 'Tempat acara';
    sign(g, labelTexture(label, 'bentuk sementara', { bg: '#241a10', w: 1024, h: 200 }), 0x241a10, 26, 3.4, 0, 14, 76.8, 0);
    return g;
  }

  buildFixed();

  /** Tingkat malam 0..1: kepala lampu jalan menyala satu per satu, lampu hangat gerbang dan jendela menyala penuh di malam hari. */
  function setNight(n) {
    nightNow = clamp(n, 0, 1);
    mats.warm.color.setScalar(warmScale(nightNow));
    for (const m of lamps) paintLamps(m, nightNow);
  }
  setNight(0);

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
      lamps.delete(o);
      if (o.geometry && o.geometry !== BOX && o.geometry !== TRUNK && o.geometry !== CROWN) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
    });
  }

  /** Muat semua yang perlu di sekitar posisi awal sekaligus (layar loading singkat). */
  function prime(cam, s) {
    while (ensure(cam, s, 999) > 0) { /* ulangi sampai tidak ada yang baru */ }
  }

  return {
    group, ensure, prime, setNight, counts: () => ({ terrain: terrain.size, roads: roads.size }),
    dispose: () => {
      for (const g of [...terrain.values(), ...roads.values()]) dispose(g);
      terrain.clear();
      roads.clear();
      lamps.clear();
      for (const m of signMats.values()) { m.map?.dispose?.(); m.dispose(); }
      signMats.clear();
    },
  };
}

export const SEGMENT_NAMES = SEGMENTS.map((s) => s.name);
export { fwd };
