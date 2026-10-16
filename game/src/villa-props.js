import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './villa-textures.js';

const euler = new THREE.Euler();
const quat = new THREE.Quaternion();
const matrix = new THREE.Matrix4();
const ONE = new THREE.Vector3(1, 1, 1);

/** Salin geometri, terapkan transformasi, dan beri warna vertex (agar banyak bagian bisa digabung jadi satu mesh). */
export function part(geometry, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  quat.setFromEuler(euler.set(rx, ry, rz));
  matrix.compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(matrix);
  const c = new THREE.Color(color);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
  }
  return g;
}

export const merge = (parts) => mergeGeometries(parts, false);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rbox = (w, h, d, r = 0.04, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

/**
 * Kursi tamu (depan = +z, sandaran di sisi -z). Dudukan 0,56 m dan sandaran setinggi 1,25 m (dulu 0,44 m dan 1,0 m)
 * supaya sebanding dengan avatar dan ruangan. Tinggi permukaan dudukan tetap 0,545 m, jadi pose duduk avatar tidak bergeser.
 */
export function chairGeometry({ frame = '#cbb68a', cushion = '#f7f1e6' } = {}) {
  const parts = [];
  const h = 0.25; // jarak kaki/tiang dari tengah kursi
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(part(box(0.05, 0.46, 0.05), frame, { x: sx * h, y: 0.23, z: sz * h }));
    parts.push(part(box(0.045, 0.78, 0.045), frame, { x: sx * h, y: 0.86, z: -h }));
  }
  parts.push(part(box(0.56, 0.04, 0.56), frame, { y: 0.47 }));
  parts.push(part(rbox(0.52, 0.07, 0.52, 0.025, 2), cushion, { y: 0.51 }));
  parts.push(part(box(0.56, 0.07, 0.045), frame, { y: 1.215, z: -h }));
  for (const y of [0.74, 0.88, 1.02]) parts.push(part(box(0.46, 0.035, 0.03), frame, { y, z: -h }));
  return merge(parts);
}

/** Batang palem: melengkung ke +x di bagian atas, tinggi satuan (diskalakan per pohon). */
export const PALM_BEND = 0.55;
export function palmTrunkGeometry() {
  const rings = 14;
  const g = new THREE.CylinderGeometry(0.12, 0.23, 1, 9, rings, true);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const light = new THREE.Color('#8f7250');
  const dark = new THREE.Color('#6a4f35');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + PALM_BEND * y * y);
    const ring = Math.round(y * rings);
    const c = ring % 2 ? light : dark;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** Satu pelepah palem: memanjang di sumbu +x, naik sedikit lalu menjuntai. UV: u melintang, v sepanjang pelepah. */
export function frondGeometry(length = 2.5, width = 1.25, steps = 10) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = length * (0.5 * t - 0.62 * t * t);
    for (const side of [-1, 1]) {
      const cup = 0.09 * width; // tepi sedikit terangkat, membentuk huruf V dangkal
      positions.push(t * length, y + cup, side * width * 0.5);
      uvs.push(side < 0 ? 0 : 1, t);
    }
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function blob(center, radius, color, rand, { detail = 1, squash = 0.8 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 1 + 0.16 * Math.sin(x * 3.1 + y * 2.3 + radius) * Math.cos(z * 2.7 + x * 1.3 + radius * 3);
    pos.setXYZ(i, x * n, y * n, z * n);
  }
  g.computeVertexNormals();
  const base = new THREE.Color(color);
  const out = part(g, color, { x: center[0], y: center[1], z: center[2], sx: radius, sy: radius * squash, sz: radius });
  const colors = out.attributes.color;
  const p = out.attributes.position;
  for (let i = 0; i < colors.count; i++) {
    const k = 0.62 + 0.55 * Math.min(1, Math.max(0, (p.getY(i) - (center[1] - radius)) / (radius * 1.8)));
    const j = 0.92 + rand() * 0.16;
    colors.setXYZ(i, base.r * k * j, base.g * k * j, base.b * k * j);
  }
  return out;
}

/** Pohon berdaun lebar (varian 0..2) untuk lingkar luar villa. */
export function broadleafTreeGeometry(variant) {
  const rand = rng(100 + variant);
  const greens = ['#3f7d36', '#4d8c3d', '#2f6a30'];
  const parts = [part(cyl(0.16, 0.26, 2.6, 8), '#6b4f35', { y: 1.3 })];
  const blobs = 5 + variant;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rand();
    const r = i === 0 ? 0 : 0.9 + rand() * 0.5;
    parts.push(blob([Math.cos(a) * r, 3.0 + rand() * 1.4, Math.sin(a) * r], 1.25 + rand() * 0.55, greens[(variant + i) % 3], rand, { squash: 0.85 }));
  }
  return merge(parts);
}

/** Semak bulat (alas rata di y=0). */
export function shrubGeometry() {
  const rand = rng(7);
  return merge([
    blob([0, 0.42, 0], 0.62, '#3c7a35', rand, { detail: 1, squash: 0.78 }),
    blob([0.34, 0.34, 0.12], 0.4, '#4b8a3e', rand, { detail: 1, squash: 0.8 }),
    blob([-0.3, 0.32, -0.15], 0.38, '#35712f', rand, { detail: 1, squash: 0.8 }),
  ]);
}

export function potPlantGeometry() {
  const rand = rng(17);
  return merge([
    part(cyl(0.3, 0.22, 0.46, 12), '#c97d54', { y: 0.23 }),
    part(cyl(0.32, 0.32, 0.05, 12), '#b46b44', { y: 0.47 }),
    blob([0, 0.95, 0], 0.46, '#3f8a3a', rand, { detail: 1, squash: 1.1 }),
    blob([0.26, 0.72, 0.1], 0.3, '#4e9a44', rand, { detail: 1, squash: 1 }),
    blob([-0.24, 0.78, -0.12], 0.3, '#2f7a32', rand, { detail: 1, squash: 1 }),
  ]);
}

/** Mobil: badan (diwarnai per instance), detail (kaca, roda, bumper), lampu (menyala). Depan = +z. */
export function carGeometries() {
  const body = merge([
    part(rbox(1.82, 0.6, 4.3, 0.22), '#ffffff', { y: 0.58 }),
    part(rbox(1.5, 0.1, 1.9, 0.05), '#ffffff', { y: 1.37, z: -0.15 }),
  ]);
  const detailParts = [part(rbox(1.62, 0.5, 2.15, 0.14), '#0e1822', { y: 1.08, z: -0.15 })];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      detailParts.push(part(cyl(0.35, 0.35, 0.26, 16), '#131313', { x: sx * 0.84, y: 0.35, z: sz * 1.38, rz: Math.PI / 2 }));
      detailParts.push(part(cyl(0.18, 0.18, 0.29, 10), '#b9bdc3', { x: sx * 0.84, y: 0.35, z: sz * 1.38, rz: Math.PI / 2 }));
    }
  }
  detailParts.push(part(rbox(1.7, 0.16, 0.2, 0.05), '#25272b', { y: 0.3, z: 2.14 }));
  detailParts.push(part(rbox(1.7, 0.16, 0.2, 0.05), '#25272b', { y: 0.3, z: -2.14 }));
  detailParts.push(part(rbox(0.9, 0.14, 0.05, 0.02), '#0d0d0d', { y: 0.56, z: 2.17 }));
  detailParts.push(part(box(0.5, 0.12, 0.02), '#f1f1ea', { y: 0.42, z: -2.17 }));
  const lights = merge([
    ...[-1, 1].map((s) => part(rbox(0.32, 0.12, 0.06, 0.03), '#fff3c4', { x: s * 0.62, y: 0.66, z: 2.17 })),
    ...[-1, 1].map((s) => part(rbox(0.34, 0.1, 0.06, 0.03), '#d02420', { x: s * 0.64, y: 0.68, z: -2.17 })),
  ]);
  return { body, details: merge(detailParts), lights };
}

/** Tempat tidur (kepala di sisi -z), duvet terpisah agar bisa diwarnai per instance, dan lampu meja. */
export function bedGeometries() {
  const base = merge([
    part(rbox(1.92, 0.26, 2.16, 0.05), '#6f4d33', { y: 0.23 }),
    part(rbox(1.8, 0.26, 2.06, 0.1), '#f6f2ea', { y: 0.49 }),
    part(rbox(2.1, 1.15, 0.14, 0.06), '#8a7a68', { y: 0.65, z: -1.12 }),
    ...[-1, 1].map((s) => part(rbox(0.7, 0.16, 0.42, 0.08), '#ffffff', { x: s * 0.46, y: 0.66, z: -0.78 })),
    ...[-1, 1].map((s) => part(rbox(0.46, 0.5, 0.42, 0.03), '#6f4d33', { x: s * 1.3, y: 0.25, z: -0.88 })),
    ...[-1, 1].map((s) => part(cyl(0.06, 0.07, 0.22, 8), '#d9c9a0', { x: s * 1.3, y: 0.61, z: -0.88 })),
  ]);
  const duvet = merge([
    part(rbox(1.88, 0.14, 1.4, 0.07), '#ffffff', { y: 0.67, z: 0.36 }),
    part(rbox(1.9, 0.08, 0.34, 0.04), '#ffffff', { y: 0.74, z: -0.22 }),
  ]);
  const lamps = merge([-1, 1].map((s) => part(cyl(0.1, 0.14, 0.2, 10), '#ffe2a8', { x: s * 1.3, y: 0.82, z: -0.88 })));
  return { base, duvet, lamps };
}

/** Lounger kolam renang (kepala di -z). */
export function loungerGeometry() {
  return merge([
    part(rbox(0.66, 0.08, 1.9, 0.03), '#f2f0ea', { y: 0.34 }),
    part(rbox(0.62, 0.07, 0.62, 0.03), '#f2f0ea', { y: 0.56, z: -0.78, rx: 0.5 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => part(box(0.05, 0.32, 0.05), '#d8d4ca', { x: sx * 0.27, y: 0.16, z: sz * 0.8 }))),
    part(rbox(0.6, 0.06, 1.8, 0.03), '#ffffff', { y: 0.4 }),
  ]);
}

export function lanternPostGeometry() {
  return merge([
    part(cyl(0.05, 0.08, 2.4, 8), '#2b2b2e', { y: 1.2 }),
    part(cyl(0.16, 0.16, 0.06, 8), '#2b2b2e', { y: 0.03 }),
    part(box(0.28, 0.06, 0.28), '#2b2b2e', { y: 2.45 }),
  ]);
}

export function lanternBulbGeometry() {
  return new THREE.BoxGeometry(0.22, 0.3, 0.22);
}

export function gardenFlowerGeometry() {
  return new THREE.IcosahedronGeometry(1, 0);
}
