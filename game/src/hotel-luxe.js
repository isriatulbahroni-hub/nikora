// Interior hotel premium termewah (THREE): lantai marmer/parket/karpet bertekstur, panel dinding dan rel emas, bingkai pintu emas, lampu gantung
// kristal, lukisan berbingkai emas, dan perabot beludru/marmer/emas. Dipanggil hotel-world.js untuk tiap lantai yang dibangun; semua data dan
// aturannya ada di hotel-luxe-data.js (diuji). Ringan: tiap bahan = satu InstancedMesh per lantai, lantai = satu geometri per tekstur.
import * as THREE from 'three';
import { HOTEL_WALL_HEIGHT } from './hotel-layout.js';
import { DOOR_HEIGHT } from './villa-layout.js';
import { LAMP_COLOR } from './hotel-props.js';
import { C, chandelier, chandelierSpots, doorTrim, floorStyle, isGrandKind, propLuxParts, wallArt, wallTrim } from './hotel-luxe-data.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
let shared = null; // bahan dan tekstur dibuat sekali (kanvas), dipakai semua lantai

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')];
}
function tex(c, anisotropy) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/** Marmer ala Versailles: petak gading dan hitam berurat, garis emas. Satu gambar = 2 x 2 petak (4 m). */
function marbleTexture(a) {
  const [c, g] = canvas(512);
  const cells = [['#f2ece0', 'rgba(120,110,95,.35)'], ['#1b1c20', 'rgba(230,215,170,.35)'], ['#1b1c20', 'rgba(230,215,170,.35)'], ['#f2ece0', 'rgba(120,110,95,.35)']];
  cells.forEach(([base, vein], i) => {
    const x = (i % 2) * 256;
    const y = Math.floor(i / 2) * 256;
    g.fillStyle = base;
    g.fillRect(x, y, 256, 256);
    g.strokeStyle = vein;
    for (let k = 0; k < 7; k++) {
      g.lineWidth = 0.6 + rnd() * 1.6;
      g.beginPath();
      let px = x + rnd() * 256;
      let py = y;
      g.moveTo(px, py);
      for (let s = 0; s < 6; s++) { px += (rnd() - 0.5) * 90; py += 256 / 6; g.lineTo(Math.min(x + 256, Math.max(x, px)), py); }
      g.stroke();
    }
  });
  g.strokeStyle = '#c9a24b';
  g.lineWidth = 5;
  for (const p of [0, 256, 512]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 512); g.moveTo(0, p); g.lineTo(512, p); g.stroke(); }
  return tex(c, a);
}

/** Parket anyaman kayu gelap: blok 128 px berisi papan sejajar, selang-seling arah. Satu gambar = 3 m. */
function parquetTexture(a) {
  const [c, g] = canvas(512);
  for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) {
    const horizontal = (bx + by) % 2 === 0;
    for (let k = 0; k < 4; k++) {
      const l = 52 + rnd() * 26;
      g.fillStyle = `hsl(24,${38 + rnd() * 12}%,${l * 0.62}%)`;
      if (horizontal) g.fillRect(bx * 128, by * 128 + k * 32, 128, 31);
      else g.fillRect(bx * 128 + k * 32, by * 128, 31, 128);
    }
  }
  return tex(c, a);
}

/** Karpet mewah: dasar terang berpola wajik dan titik, diwarnai lewat tint bahan. Satu gambar = 3 m. */
function carpetTexture(a) {
  const [c, g] = canvas(256);
  g.fillStyle = '#e4e0d8';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#b9b2a4';
  g.lineWidth = 3;
  for (let i = -1; i < 3; i++) for (let j = -1; j < 3; j++) {
    const cx = i * 128 + 64;
    const cy = j * 128 + 64;
    g.beginPath(); g.moveTo(cx, cy - 60); g.lineTo(cx + 60, cy); g.lineTo(cx, cy + 60); g.lineTo(cx - 60, cy); g.closePath(); g.stroke();
    g.fillStyle = '#f6efd8';
    g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#f0dca0';
  g.lineWidth = 2;
  g.strokeRect(2, 2, 252, 252);
  return tex(c, a);
}

function materials(anisotropy) {
  if (shared) return shared;
  const std = (o) => new THREE.MeshStandardMaterial({ color: 0xffffff, ...o });
  shared = {
    matte: std({ roughness: 0.82 }),
    wood: std({ roughness: 0.3, metalness: 0.05 }),
    gold: std({ roughness: 0.28, metalness: 0.5, emissive: 0x3a2808, emissiveIntensity: 0.85 }),
    marble: std({ roughness: 0.12, metalness: 0.08 }),
    velvet: std({ roughness: 1 }),
    glass: std({ roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.4, depthWrite: false }),
    light: new THREE.MeshBasicMaterial({ color: LAMP_COLOR }),
    maps: { marble: marbleTexture(anisotropy), parquet: parquetTexture(anisotropy), carpet: carpetTexture(anisotropy) },
    tile: { marble: 4, parquet: 3, carpet: 3 },
    rough: { marble: 0.12, parquet: 0.32, carpet: 0.95 },
    floors: new Map(),
  };
  return shared;
}

const floorMaterial = (m, style) => {
  const key = `${style.tex}:${style.tint}`;
  if (!m.floors.has(key)) m.floors.set(key, new THREE.MeshStandardMaterial({ map: m.maps[style.tex], color: style.tint, roughness: m.rough[style.tex], metalness: style.tex === 'marble' ? 0.05 : 0 }));
  return m.floors.get(key);
};

function instanced(parent, items, material, { cast = false } = {}) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(BOX, material, items.length);
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    mesh.setMatrixAt(i, mat.compose(p.set(it.x, it.y, it.z), q.setFromEuler(e.set(0, it.ry ?? 0, 0)), s.set(it.sx, it.sy, it.sz)));
    if (it.color !== undefined) mesh.setColorAt(i, c.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = cast;
  mesh.computeBoundingSphere();
  parent.add(mesh);
}

/** Lantai bertekstur: satu geometri per (tekstur, tint); UV mengikuti ukuran ruang supaya motif tidak melar. */
function floorMeshes(parent, m, quads, y) {
  const groups = new Map();
  for (const { rect, style } of quads) {
    const key = `${style.tex}:${style.tint}`;
    if (!groups.has(key)) groups.set(key, { style, pos: [], uv: [], idx: [] });
    const gr = groups.get(key);
    const [x1, z1, x2, z2] = rect;
    const t = m.tile[style.tex];
    const n = gr.pos.length / 3;
    gr.pos.push(x1, y, z1, x2, y, z1, x2, y, z2, x1, y, z2);
    gr.uv.push(0, 0, (x2 - x1) / t, 0, (x2 - x1) / t, (z2 - z1) / t, 0, (z2 - z1) / t);
    gr.idx.push(n, n + 2, n + 1, n, n + 3, n + 2); // sisi atas (normal +y)
  }
  for (const gr of groups.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(gr.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(gr.uv, 2));
    geo.setIndex(gr.idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, floorMaterial(m, gr.style));
    mesh.receiveShadow = true;
    mesh.userData.luxeFloor = true;
    parent.add(mesh);
  }
}

/**
 * Tambahkan lapisan mewah ke grup satu lantai. ctx = { L (lantai dari getHotelWorld), l (indeks), y0, F (tapak), guestLevel }.
 * Perabot katalog digambar di sini (hotel-world.js tidak lagi menggambar bagian non-lampu); lampu tetap dari hotel-world.js.
 */
export function buildLuxeLevel(group, { L, l, y0, F, guestLevel, anisotropy = 8 }) {
  const m = materials(anisotropy);

  // ---- lantai
  const quads = [{ rect: F, style: floorStyle('base', guestLevel) }];
  for (const r of L.rooms) {
    const style = floorStyle(r.kind);
    if (style) quads.push({ rect: r.rect, style });
  }
  floorMeshes(group, m, quads, y0 + 0.064);

  // ---- dinding: lis lantai, panel, rel emas, lis atas; bingkai pintu
  const trim = wallTrim(L.walls, F, y0, HOTEL_WALL_HEIGHT);
  const gold = [...trim.gold, ...doorTrim(L.doors, y0, DOOR_HEIGHT)];
  const wood = [...trim.wood];
  const matte = [...trim.matte];
  const marble = [];
  const velvet = [];
  const glass = [];
  const light = [];

  // ---- perabot dari katalog (dipermak) per bahan
  const bucket = { matte, wood, gold, marble, velvet, glass, light };
  for (const p of L.props) {
    const ry = p.ry ?? 0;
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    for (const q of propLuxParts(p)) {
      (bucket[q.mat] ?? matte).push({ x: p.x + q.dx * c + q.dz * s, y: y0 + q.dy, z: p.z - q.dx * s + q.dz * c, sx: q.sx, sy: q.sy, sz: q.sz, ry, color: q.color });
    }
  }

  // ---- lampu gantung kristal dan lis emas di langit-langit ruang publik besar
  for (const r of L.rooms) {
    if (!isGrandKind(r.kind)) continue;
    for (const sp of chandelierSpots(r.rect)) {
      for (const q of chandelier(sp.x, sp.z, sp.s, y0, HOTEL_WALL_HEIGHT)) (q.mat === 'light' ? light : gold).push(q);
    }
    const [x1, z1, x2, z2] = r.rect;
    const top = y0 + HOTEL_WALL_HEIGHT - 0.06;
    gold.push({ x: (x1 + x2) / 2, y: top, z: z1 + 0.35, sx: x2 - x1 - 0.4, sy: 0.1, sz: 0.12, color: C.gold }, { x: (x1 + x2) / 2, y: top, z: z2 - 0.35, sx: x2 - x1 - 0.4, sy: 0.1, sz: 0.12, color: C.gold },
      { x: x1 + 0.35, y: top, z: (z1 + z2) / 2, sx: 0.12, sy: 0.1, sz: z2 - z1 - 0.4, color: C.gold }, { x: x2 - 0.35, y: top, z: (z1 + z2) / 2, sx: 0.12, sy: 0.1, sz: z2 - z1 - 0.4, color: C.gold });
  }

  // ---- lukisan berbingkai emas
  const art = wallArt(L.rooms, L.doors, L.props, y0);
  gold.push(...art.frames);
  matte.push(...art.canvas);
  light.push(...art.lights);

  instanced(group, matte, m.matte);
  instanced(group, wood, m.wood);
  instanced(group, gold, m.gold);
  instanced(group, marble, m.marble);
  instanced(group, velvet, m.velvet);
  instanced(group, glass, m.glass);
  instanced(group, light, m.light);
  return group;
}
