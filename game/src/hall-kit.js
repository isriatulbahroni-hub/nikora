import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Perangkat bantu membangun dunia: geometri statis digabung per material (satu draw call per material),
// ditambah bentuk arsitektur (lengkung, bingkai) yang dipakai istana, gazebo, dan gapura.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function transform(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** UV dunia (proyeksi kotak) supaya tekstur berulang pada ukuran nyata, tak peduli bentuk geometrinya. */
function applyWorldUV(geo, scale) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv ?? new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (let i = 0; i < pos.count; i += 1) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, pos.getX(i) * scale, pos.getZ(i) * scale);
    else if (ax >= az) uv.setXY(i, pos.getZ(i) * scale, pos.getY(i) * scale);
    else uv.setXY(i, pos.getX(i) * scale, pos.getY(i) * scale);
  }
  geo.setAttribute('uv', uv);
}

export class Batcher {
  /** Pengali jumlah segmen (mode ringan memakai < 1). */
  static detail = 1;

  /** Ukuran sel (m) pemecah mesh gabungan agar frustum culling bisa membuang area di luar layar. */
  static cell = 22;

  constructor() {
    this.groups = new Map();
  }

  add(geo, material, matrix) {
    const g = geo;
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (material.userData.worldUV) applyWorldUV(g, material.userData.worldUV);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(_p);
    g.userData.cell = `${Math.floor(c.x / Batcher.cell)}:${Math.floor(c.z / Batcher.cell)}`;
    const list = this.groups.get(material) ?? [];
    list.push(g);
    this.groups.set(material, list);
    return this;
  }

  box(material, w, h, d, x, y, z, ry = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), material, transform(x, y, z, 0, ry, 0));
  }

  /** Kotak dengan sisi bawah di y0. */
  slab(material, w, h, d, x, y0, z, ry = 0) {
    return this.box(material, w, h, d, x, y0 + h / 2, z, ry);
  }

  /** Silinder dengan dasar di y0. */
  cyl(material, rTop, rBottom, h, x, y0, z, seg = 20, open = false) {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, Math.max(6, Math.round(seg * Batcher.detail)), 1, open), material, transform(x, y0 + h / 2, z));
  }

  sphere(material, r, x, y, z, sx = 1, sy = 1, sz = 1, wSeg = 14, hSeg = 10) {
    return this.add(new THREE.SphereGeometry(r, Math.max(6, Math.round(wSeg * Batcher.detail)), Math.max(4, Math.round(hSeg * Batcher.detail))), material, transform(x, y, z, 0, 0, 0, sx, sy, sz));
  }

  /** Benda putar dari profil [[radius, y], ...]. */
  lathe(material, profile, x, y, z, seg = 32, scale = 1) {
    const pts = profile.map(([r, yy]) => new THREE.Vector2(r, yy));
    return this.add(new THREE.LatheGeometry(pts, Math.max(8, Math.round(seg * Batcher.detail))), material, transform(x, y, z, 0, 0, 0, scale, scale, scale));
  }

  geometry(material, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    return this.add(geo, material, transform(x, y, z, rx, ry, rz, sx, sy, sz));
  }

  /** Gabungkan menjadi mesh per material dan tambahkan ke `parent`. */
  build(parent, { shadows = true } = {}) {
    const meshes = [];
    for (const [material, all] of this.groups) {
      const cells = new Map();
      for (const g of all) {
        const key = g.userData.cell;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(g);
      }
      for (const list of cells.values()) {
        const indexed = list.filter((g) => g.index).length;
        const normalized = indexed === 0 || indexed === list.length ? list : list.map((g) => (g.index ? g.toNonIndexed() : g));
        const merged = mergeGeometries(normalized, false);
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = shadows && material.userData.cast !== false && !material.userData.unlit;
        mesh.receiveShadow = shadows && !material.userData.unlit;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        parent.add(mesh);
        meshes.push(mesh);
      }
      for (const g of all) g.dispose();
    }
    this.groups.clear();
    return meshes;
  }
}

// ---- Bentuk lengkung ----
/** Lengkung lancip: dari tepi kanan (sudah di y0+straight) ke puncak lalu ke tepi kiri. Pusat di x=0. */
export function archPath(path, w, straight, rise, y0 = 0) {
  const half = w / 2;
  const top = y0 + straight + rise;
  path.lineTo(half, y0 + straight);
  path.bezierCurveTo(half, y0 + straight + rise * 0.55, half * 0.2, top - rise * 0.08, 0, top);
  path.bezierCurveTo(-half * 0.2, top - rise * 0.08, -half, y0 + straight + rise * 0.55, -half, y0 + straight);
  return path;
}

/** Bentuk jendela/gerbang berlengkung lancip. */
export function archShape(w, straight, rise, y0 = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, y0);
  s.lineTo(w / 2, y0);
  archPath(s, w, straight, rise, y0);
  s.closePath();
  return s;
}

/** Bidang jendela berlengkung dengan UV 0..1 (untuk tekstur kaca bercahaya). */
export function archPlane(w, straight, rise) {
  const geo = new THREE.ShapeGeometry(archShape(w, straight, rise), 10);
  const total = straight + rise;
  const pos = geo.attributes.position;
  const uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / total);
  geo.setAttribute('uv', uv);
  return geo;
}

/** Bingkai lengkung (luar dikurangi dalam), diekstrusi sedalam `depth` ke arah +z. */
export function archFrame(w, straight, rise, thick, depth) {
  const outer = archShape(w + thick * 2, straight + thick * 0.2, rise + thick * 0.9, -0.0);
  const inner = new THREE.Path();
  inner.moveTo(-w / 2, 0);
  inner.lineTo(w / 2, 0);
  archPath(inner, w, straight, rise, 0);
  inner.closePath();
  outer.holes.push(inner);
  return new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 10 });
}

/** Tabir: pelat berlubang lengkung diekstrusi (dinding berbukaan lengkung). */
export function wallWithArch(width, height, archW, straight, rise, depth) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, height);
  s.lineTo(-width / 2, height);
  s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-archW / 2, 0);
  hole.lineTo(archW / 2, 0);
  archPath(hole, archW, straight, rise, 0);
  hole.closePath();
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 12 });
}

/** Profil kubah bawang/elips: dari dasar (r0, 0) ke puncak, titik-titik untuk LatheGeometry. */
export function domeProfile(radius, height, { onion = 0.0, steps = 18 } = {}) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = t * Math.PI * 0.5;
    let r = Math.cos(a) * radius;
    const y = Math.sin(a) * height;
    if (onion) r *= 1 + Math.sin(t * Math.PI) * onion; // sedikit menggembung seperti kubah bawang
    pts.push([Math.max(r, 0.001), y]);
  }
  return pts;
}

/** Rusuk kubah: tabung tipis menelusuri meridian. */
export function domeRibs(radius, height, count, tube, onion = 0) {
  const geos = [];
  const profile = domeProfile(radius, height, { onion, steps: 14 });
  for (let k = 0; k < count; k += 1) {
    const a = (k / count) * Math.PI * 2;
    const pts = profile.map(([r, y]) => new THREE.Vector3(Math.cos(a) * (r + tube * 0.6), y, Math.sin(a) * (r + tube * 0.6)));
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, tube, 5, false));
  }
  return mergeGeometries(geos, false);
}

/** PRNG berbenih (dunia selalu sama bagi semua pemain). */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mesh instans dari daftar { x, y, z, ry, s, color }. */
export function instanced(geometry, material, items, { castShadow = false, receiveShadow = false } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const color = new THREE.Color();
  let hasColor = false;
  items.forEach((it, i) => {
    const s = it.s ?? 1;
    mesh.setMatrixAt(i, transform(it.x, it.y, it.z, it.rx ?? 0, it.ry ?? 0, it.rz ?? 0, it.sx ?? s, it.sy ?? s, it.sz ?? s));
    if (it.color !== undefined) {
      hasColor = true;
      mesh.setColorAt(i, color.set(it.color));
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (hasColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.frustumCulled = false; // instans tersebar luas; biarkan GPU memotong
  return mesh;
}
