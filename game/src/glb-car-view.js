// Tampilan luar mobil dari model GLB (katalog carros) sebagai pengganti badan mobil prosedural (luxury-cars.js).
// Opsional dan aman: tanpa berkas GLB (belum disalin, gagal dimuat) mobil prosedural tetap dipakai. Aktifkan dengan `?glb=1`
// di alamat halaman (atau `?glb=<url dasar>` bila berkas dilayani dari tempat lain). Fisika, kursi, dan suara tidak berubah.
// Batasan: roda, pintu, dan lampu rem model GLB tidak bergerak (hanya badan yang ikut miring/menunduk).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLB_BASE, fitToSpec, glbEntry, glbUrl } from './glb-car-catalog.js';

/** Alamat dasar GLB dari query `glb` (`1` = /cars, `0`/kosong = mati), atau null bila tidak aktif. */
export function defaultGlbBase() {
  if (typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('glb');
  if (!v || v === '0') return null;
  return v === '1' ? GLB_BASE : v;
}

let loader = null;
const loading = new Map(); // url -> Promise<THREE.Object3D | null>; gagal dicatat sebagai null supaya tidak diulang tiap mobil

function loadScene(url) {
  if (!loading.has(url)) {
    loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // berkas carros dikompres meshopt
    loading.set(url, loader.loadAsync(url).then((gltf) => gltf.scene).catch(() => null));
  }
  return loading.get(url);
}

/** Satu salinan model GLB yang sudah dipasang ke kerangka mobil (lihat fitToSpec); null bila tidak tersedia. */
async function buildSkin(modelId, spec, base, envMap) {
  const url = glbUrl(modelId, base);
  if (!url) return null;
  const src = await loadScene(url);
  if (!src) return null;
  const inner = src.clone(true);
  const box = new THREE.Box3().setFromObject(inner);
  if (box.isEmpty()) return null;
  const fit = fitToSpec(box.min, box.max, spec.length, { flip: glbEntry(modelId).flip });
  if (!fit) return null;
  inner.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (envMap) for (const m of mats) if (m.isMeshStandardMaterial && !m.envMap) m.envMap = envMap;
  });
  const holder = new THREE.Group(); // transformasi dipasang di pemegang supaya transformasi akar model asli tetap
  holder.name = `glb-${modelId}`;
  holder.add(inner);
  holder.scale.setScalar(fit.scale);
  holder.rotation.y = fit.rotY;
  holder.position.set(fit.position.x, fit.position.y, fit.position.z);
  return holder;
}

/**
 * Mengganti badan prosedural tiap mobil mewah (entri vehicle-view.js) dengan model GLB begitu berkasnya selesai dimuat.
 * Roda setir tetap (untuk tampilan kabin); bagian prosedural lain disembunyikan. Mengembalikan { dispose }.
 */
export function applyGlbSkins(entries, { base = GLB_BASE, envMap = null } = {}) {
  let disposed = false;
  const done = [];
  for (const e of entries) {
    if (!e.luxury) continue;
    buildSkin(e.car.model, e.car.spec, base, envMap)
      .then((skin) => {
        if (!skin || disposed) return;
        for (const part of e.tilt.children) if (part !== e.steering.pivot) part.visible = false;
        e.tilt.add(skin);
        done.push({ e, skin });
      })
      .catch(() => {});
  }
  return {
    dispose() {
      disposed = true;
      for (const { e, skin } of done) e.tilt.remove(skin);
    },
  };
}
