import * as THREE from 'three';
import { HOTEL_LEVEL_HEIGHT } from './hotel-layout.js';
import { crownSpec, podiumWingTriangles } from './hotel-tower-shape.js';
import { facadeLayout, facadeRepeat } from './hotel-facade-data.js';
import { bayTexture } from './hotel-facade.js';
import { QUAD_TRIANGLES, crownQuads, diagonalUV, quadNormal, skinQuads } from './hotel-tower-skin-data.js';
import { zoneTint } from './hotel-tower-glow-data.js';

// Kulit luar menara yang MERUNCING (hotel-tower-shape.js + hotel-tower-skin-data.js), pengganti kotak fasad penuh (hotel-facade.js):
//  - kulit kaca: 20 zona x 4 sisi, satu tekstur "bay" bermipmap (sama dengan fasad lama, jadi tidak berkedip dari jauh),
//    diwarnai per zona lewat vertex color (zoneTint: hijau toska di bawah, makin terang di atas) tanpa tekstur atau draw call tambahan,
//  - 4 potongan sudut per zona berwarna emas (lebar ~5 m, jelas terlihat dari jauh; tiang setipis 1 m akan berkedip),
//  - rangka diagonal bersilang sebagai TEKSTUR transparan per panel (4 zona = ~210 m), bukan batang tipis,
//  - mahkota meruncing, jarum puncak, dan sayap kristal di podium.
// Kulit berhenti di bawah Sky Level (lantai 1000), yang terasnya terbuka; mahkota mulai tepat di atap.
// Pantulan langit, nyala malam, dan berkas cahaya mahkota ditambahkan hotel-tower-glow.js (dicari lewat nama mesh: skin-glass, skin-corners, skin-diagrid-N, crown-*).
const SRGB = THREE.SRGBColorSpace;
const GOLD = 0xc9a24b;
const BAY_WIDTH = 6;

/** Tekstur diagonal satu panel: dua garis emas bersilang pada kanvas 512 x 512 (latar transparan). */
function paintDiagonals(panel) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.lineCap = 'butt';
  for (const d of diagonalUV(panel)) {
    const line = (width, color) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(d.u0 * S, (1 - d.v0) * S);
      g.lineTo(d.u1 * S, (1 - d.v1) * S);
      g.stroke();
    };
    line(10, '#c9a24b');
    line(3, '#e8cf86');
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = SRGB;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

/**
 * BufferGeometry (tanpa indeks) dari bidang kulit/mahkota. `uvOf(q)` mengembalikan 4 UV [lo0, lo1, hi1, hi0]; `push` menggeser titik keluar.
 * `colorOf(q)` (opsional) mengembalikan warna pengali [r, g, b] untuk seluruh bidang q (atribut 'color', pakai vertexColors pada bahan).
 */
function quadsGeometry(quads, uvOf, push = 0, colorOf = null) {
  const pos = [];
  const nor = [];
  const uv = [];
  const col = colorOf ? [] : null;
  for (const q of quads) {
    const P = [q.lo[0], q.lo[1], q.hi[1], q.hi[0]];
    const n = quadNormal(q);
    const T = uvOf ? uvOf(q) : [[0, 0], [1, 0], [1, 1], [0, 1]];
    const C = colorOf ? colorOf(q) : null;
    for (const tri of QUAD_TRIANGLES) {
      for (const i of tri) {
        pos.push(P[i][0] + n[0] * push, P[i][1] + n[1] * push, P[i][2] + n[2] * push);
        nor.push(n[0], n[1], n[2]);
        uv.push(T[i][0], T[i][1]);
        if (col) col.push(C[0], C[1], C[2]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

const widthOf = (q) => Math.hypot(q.lo[1][0] - q.lo[0][0], q.lo[1][2] - q.lo[0][2]);

/** Bangun kulit menara ke `parent`. Mengembalikan { group, info(), dispose() }. Nama grup 'hotel-tower-skin' (hotel-sky.js mendeteksi bentuk meruncing lewat ketiadaan 'hotel-facade'). */
export function buildTowerSkin(parent, { anisotropy = 8 } = {}) {
  const group = new THREE.Group();
  group.name = 'hotel-tower-skin';
  const geometries = [];
  const materials = [];
  const textures = [];
  const add = (geometry, material, order = 0, name = '') => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.name = name;
    group.add(mesh);
    geometries.push(geometry);
    materials.push(material);
    return mesh;
  };

  const quads = skinQuads();
  const mains = quads.filter((q) => q.main);
  const chamfers = quads.filter((q) => !q.main);

  // kulit kaca: UV bay mengulang menurut ukuran bidang, jadi satu tekstur dan satu geometri untuk seluruh menara; warna per zona lewat vertex color
  const layout = facadeLayout({ bayWidth: BAY_WIDTH, levelHeight: HOTEL_LEVEL_HEIGHT, finWidth: 0.28, edgeHeight: 0.24 });
  const bay = bayTexture(layout, anisotropy, 1, 1);
  textures.push(bay);
  const zoneCount = mains.reduce((m, q) => Math.max(m, q.zone), 0) + 1;
  const glassGeo = quadsGeometry(mains, (q) => {
    const { u, v } = facadeRepeat(widthOf(q), q.hi[0][1] - q.lo[0][1], BAY_WIDTH, HOTEL_LEVEL_HEIGHT);
    return [[0, 0], [u, 0], [u, v], [0, v]];
  }, 0, (q) => zoneTint(q.zone, zoneCount));
  add(glassGeo, new THREE.MeshStandardMaterial({ map: bay, vertexColors: true, roughness: 0.32, metalness: 0.12, transparent: true, depthWrite: false }), 1, 'skin-glass');

  // potongan sudut emas (buram)
  add(quadsGeometry(chamfers), new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.35, metalness: 0.75 }), 0, 'skin-corners');

  // rangka diagonal: satu mesh per panel (tekstur berbeda tiap zona dalam panel), sedikit di depan kaca
  for (let panel = 0; panel < 4; panel++) {
    const sel = mains.filter((q) => q.panel === panel);
    if (!sel.length) continue;
    const map = paintDiagonals(panel);
    textures.push(map);
    add(
      quadsGeometry(sel, (q) => [[0, 0], [1, 0], [1, q.vTop], [0, q.vTop]], 0.3),
      new THREE.MeshStandardMaterial({ map, roughness: 0.35, metalness: 0.6, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      2,
      `skin-diagrid-${panel}`,
    );
  }

  // mahkota: dua tingkat kaca yang menyempit + tutup emas, jarum puncak, dan antena
  const crown = crownSpec();
  add(quadsGeometry(crownQuads(crown)), new THREE.MeshStandardMaterial({ color: 0x5fa8d3, roughness: 0.18, metalness: 0.45, transparent: true, opacity: 0.8, depthWrite: false }), 2, 'crown-glass');
  const top = crown.rings.at(-1);
  const cap = [];
  for (let e = 0; e < top.pts.length; e++) {
    const f = (e + 1) % top.pts.length;
    cap.push(crown.spire.x, top.y, crown.spire.z, top.pts[f][0], top.y, top.pts[f][1], top.pts[e][0], top.y, top.pts[e][1]); // menghadap ke atas
  }
  const capGeo = new THREE.BufferGeometry();
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(cap, 3));
  capGeo.computeVertexNormals();
  add(capGeo, new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.35, metalness: 0.75 }), 0, 'crown-cap');
  const metal = new THREE.MeshStandardMaterial({ color: 0xe6edf3, roughness: 0.3, metalness: 0.6 });
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(1.2, crown.spire.radius, crown.spire.height, 12), metal);
  spire.position.set(crown.spire.x, crown.spire.baseY + crown.spire.height / 2, crown.spire.z);
  spire.name = 'crown-spire';
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.4, crown.needle.height, 8), metal);
  needle.position.set(crown.needle.x, crown.needle.baseY + crown.needle.height / 2, crown.needle.z);
  needle.name = 'crown-needle'; // ditambahkan terakhir: hotel-sky.js memakai silinder tertinggi sebagai ujung antena (lampu peringatan)
  group.add(spire, needle);
  geometries.push(spire.geometry, needle.geometry);
  materials.push(metal);

  // sayap kristal podium: segitiga berfaset yang menggantung dari atap podium, di atas tinggi bebas 7,2 m
  const wingPos = [];
  for (const tri of podiumWingTriangles()) for (const p of tri) wingPos.push(p[0], p[1], p[2]);
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute(wingPos, 3));
  wingGeo.computeVertexNormals();
  add(wingGeo, new THREE.MeshStandardMaterial({ color: 0x7fc4e8, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.82, side: THREE.DoubleSide, flatShading: true, depthWrite: false }), 2, 'podium-wings');

  parent.add(group);
  return {
    group,
    info: () => ({ glassQuads: mains.length, cornerQuads: chamfers.length, wingTriangles: wingPos.length / 9, tipY: crown.tipY, meshes: group.children.length }),
    dispose() {
      parent.remove(group);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
