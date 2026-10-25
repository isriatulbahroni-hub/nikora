// Memuat model mobil berformat GLB (buatan sendiri, mis. dari Blender) untuk armada: diskalakan ke panjang mobil di spesifikasi, dipusatkan di titik
// tengah mobil, roda menyentuh tanah, moncong menghadap +z (konvensi vehicle.js). Roda dikenali dari nama node (wheel/roda/tyre/tire/velg/rim)
// dan dipasang pada poros putar supaya bisa berputar dan membelok; bila namanya tidak dikenali, mobil tetap tampil tanpa roda berputar.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const WHEEL_NAME = /wheel|roda|tyre|tire|velg|(?<!t)rim/i;
const NOT_WHEEL = /steer|setir|arch|well|fender|caliper|kaliper|cover|light|lamp/i;
const asArray = (m) => (Array.isArray(m) ? m : [m]);

// Decoder Draco dimuat dari CDN Google (versi dipatok) hanya bila sebuah GLB memakai kompresi Draco; GLB biasa tidak menyentuhnya.
const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';
let sharedLoader = null;
/** Pemuat GLTF bersama yang mendukung GLB berkompresi Draco; dibuat saat pertama dipakai. */
function defaultLoader() {
  if (!sharedLoader) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_DECODER_PATH);
    sharedLoader = new GLTFLoader();
    sharedLoader.setDRACOLoader(draco);
  }
  return sharedLoader;
}

/** Buang geometri, bahan, dan tekstur sebuah objek (dipakai saat armada dibuang). */
export function disposeObject(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    for (const mat of asArray(o.material)) {
      if (!mat) continue;
      for (const v of Object.values(mat)) if (v?.isTexture) v.dispose();
      mat.dispose();
    }
  });
}

/** Cari roda: node pertama (paling atas) bernama roda; hanya empat sudut (kiri/kanan x depan/belakang) di dekat tanah yang diterima. */
function rigWheels(root, model) {
  const found = [];
  const walk = (o) => {
    if (o.name && WHEEL_NAME.test(o.name) && !NOT_WHEEL.test(o.name)) {
      found.push(o);
      return;
    }
    for (const child of o.children) walk(child);
  };
  walk(model);
  const corners = new Map();
  const box = new THREE.Box3();
  const c = new THREE.Vector3();
  for (const o of found) {
    box.setFromObject(o);
    if (box.isEmpty()) continue;
    box.getCenter(c);
    if (Math.abs(c.x) < 0.6 || Math.abs(c.z) < 0.8 || c.y < 0.15 || c.y > 0.6) continue; // bukan roda (bagian dalam kabin, dll.)
    const key = `${c.x > 0 ? 'L' : 'R'}${c.z > 0 ? 'F' : 'B'}`;
    const g = corners.get(key) ?? { box: new THREE.Box3(), nodes: [] };
    g.box.union(box);
    g.nodes.push(o);
    corners.set(key, g);
  }
  if (corners.size !== 4) return [];
  const wheels = [];
  for (const [key, g] of corners) {
    const pivot = new THREE.Group();
    pivot.rotation.order = 'YXZ'; // belok (y) di luar, putar roda (x) di dalam
    pivot.position.copy(g.box.getCenter(new THREE.Vector3()));
    root.add(pivot);
    pivot.updateMatrixWorld(true);
    for (const o of g.nodes) pivot.attach(o);
    wheels.push({ pivot, front: key.endsWith('F'), side: key.startsWith('L') ? 1 : -1 });
  }
  return wheels;
}

/**
 * Pasang `scene` (hasil GLTFLoader) ke kerangka mobil: panjangnya `length` m sepanjang sumbu z, pusat di (0, 0, 0), dasar di y = 0.
 * yaw = putaran tambahan (0 atau Math.PI) bila moncong model menghadap ke belakang. Mengembalikan { root, wheels }.
 */
export function fitCar(scene, { length, yaw = 0, envMap = null }) {
  const root = new THREE.Group();
  const model = new THREE.Group(); // transformasi kita; transformasi asli berkas tetap di dalam `scene`
  model.add(scene);
  root.add(model);
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  root.updateMatrixWorld(true);
  box.setFromObject(model);
  if (box.isEmpty()) throw new Error('model mobil kosong');
  box.getSize(size);
  model.rotation.y = (size.x > size.z ? Math.PI / 2 : 0) + yaw; // panjang mobil searah sumbu z
  root.updateMatrixWorld(true);
  box.setFromObject(model).getSize(size);
  model.scale.setScalar(length / Math.max(1e-6, size.z));
  root.updateMatrixWorld(true);
  box.setFromObject(model).getCenter(center);
  model.position.set(-center.x, -box.min.y, -center.z);
  root.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (!envMap) return;
    for (const m of asArray(o.material)) {
      if (m && 'envMap' in m && !m.envMap) {
        m.envMap = envMap;
        m.envMapIntensity = 1;
        m.needsUpdate = true;
      }
    }
  });
  return { root, wheels: rigWheels(root, model) };
}

/** Muat berkas GLB (juga yang berkompresi Draco) lalu pasang dengan fitCar. Janji ditolak bila berkas gagal dimuat atau kosong. */
export function loadCarGlb({ url, length, yaw = 0, envMap = null, loader = defaultLoader() }) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        try {
          resolve(fitCar(gltf.scene, { length, yaw, envMap }));
        } catch (error) {
          reject(error);
        }
      },
      undefined,
      reject,
    );
  });
}
