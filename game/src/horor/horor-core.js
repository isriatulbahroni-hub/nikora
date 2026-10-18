// Pembantu dasar game horor (gaya survival horror, kamera tetap).
//
// Sebagian kode diport dari KantLex/yoru-no-gakko (MIT, Copyright (c) 2026 KantLex):
//   src/01-core.js (clamp, angDiff, pushOut, mergeMeshes, mat), src/03-textures.js (canvasTex, speckle, worldUV).
// Teks lisensi ada di docs/horor/THIRD_PARTY_NOTICES.md. Perubahan: jadi modul ES, tanpa akses DOM saat impor,
// tanpa variabel global.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
/** Selisih sudut terpendek a -> b, hasil di [-PI, PI]. */
export const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;
export const inRect = (x, z, r, m = 0) => x >= r[0] - m && x <= r[2] + m && z >= r[1] - m && z <= r[3] + m;

/** Geometri kotak (lebar, tinggi, dalam). */
export const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/**
 * Dorong lingkaran p (x, z) radius r keluar dari kotak sumbu-sejajar {x0,z0,x1,z1}.
 * `filter(box)` boleh dipakai untuk melewati kotak tertentu (mis. pintu terbuka).
 */
export function pushOut(p, r, boxes, filter) {
  for (let iter = 0; iter < 2; iter++) {
    for (const b of boxes) {
      if (filter && !filter(b)) continue;
      const cx = clamp(p.x, b.x0, b.x1);
      const cz = clamp(p.z, b.z0, b.z1);
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const k = (r - d) / d;
        p.x += dx * k;
        p.z += dz * k;
      } else {
        // pusat di dalam kotak: keluar lewat sisi terdekat
        const l = p.x - b.x0;
        const rr = b.x1 - p.x;
        const t = p.z - b.z0;
        const bt = b.z1 - p.z;
        const m = Math.min(l, rr, t, bt);
        if (m === l) p.x = b.x0 - r;
        else if (m === rr) p.x = b.x1 + r;
        else if (m === t) p.z = b.z0 - r;
        else p.z = b.z1 + r;
      }
    }
  }
  return p;
}

/** UV kotak diskalakan ke ukuran dunia: satu ulangan tekstur = `scale` meter di semua sisi. */
export function worldUV(geo, w, h, d, scale) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / scale, (uv.getY(i) * dims[f][1]) / scale);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Gabungkan mesh statis: satu draw call per material (+ status bayangan).
 * Mesh asal tidak diubah; hasilnya mesh baru dengan matrixAutoUpdate dimatikan.
 */
export function mergeMeshes(meshes) {
  const groups = new Map();
  for (const m of meshes) {
    const key = m.material.uuid + (m.castShadow ? 'c' : '') + (m.receiveShadow ? 'r' : '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  const out = [];
  for (const list of groups.values()) {
    const parts = list.map((m) => {
      m.updateWorldMatrix(true, false);
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      return g;
    });
    const hasUV = parts.every((g) => g.attributes.uv);
    let n = 0;
    for (const g of parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = hasUV ? new Float32Array(n * 2) : null;
    let o = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (uv) uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, list[0].material);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = list[0].receiveShadow;
    mesh.matrixAutoUpdate = false;
    out.push(mesh);
  }
  return out;
}

// Material datar (Lambert + flatShading): tampilan retro berupa poligon bersegi. Di-cache supaya mergeMeshes efektif.
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts, (k, v) => (v && v.isTexture ? v.uuid : v));
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
  matCache.set(key, m);
  return m;
}
/** Kosongkan cache material (dipanggil saat permainan di-destroy). */
export function disposeMaterials() {
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
}

/** Registri tekstur. Diisi oleh buildTextures() di browser; kosong saat uji tanpa DOM. */
export const TEX = {};

/** Material bertekstur bila teksturnya ada, kalau tidak warna polos (supaya Room tetap bisa dibangun tanpa DOM). */
export function texMat(name, fallbackColor, opts = {}) {
  const t = TEX[name];
  return t ? mat(0xffffff, { map: t, ...opts }) : mat(fallbackColor, opts);
}

/** Tekstur kanvas. Butuh DOM; hanya dipanggil dari buildTextures() di browser. */
export function canvasTex(w, h, draw, nearest = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (nearest) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  }
  return t;
}

/** Bintik acak pada kanvas (noda, debu) untuk tekstur prosedural. */
export function speckle(g, w, h, n, alpha, light = false) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = light ? `rgba(255,255,255,${Math.random() * alpha})` : `rgba(0,0,0,${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, rand(1, 3), rand(1, 3));
  }
}

/** Lepas semua tekstur di TEX (dipanggil saat destroy). */
export function disposeTextures() {
  const walk = (v) => {
    if (!v) return;
    if (v.isTexture) v.dispose();
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(TEX);
  for (const k of Object.keys(TEX)) delete TEX[k];
}
