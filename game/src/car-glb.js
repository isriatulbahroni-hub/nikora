// Memuat model mobil berformat GLB (buatan sendiri, mis. dari Blender) untuk armada: diskalakan ke panjang mobil di spesifikasi, dipusatkan di titik
// tengah mobil, roda menyentuh tanah, moncong menghadap +z (konvensi vehicle.js). Roda dikenali dari nama node (wheel/roda/tyre/tire/velg/rim)
// dan dipasang pada poros putar supaya bisa berputar dan membelok; bila namanya tidak dikenali, mobil tetap tampil tanpa roda berputar.
// Roda setir asli model dikenali dari nama node (steer/setir/kemudi), dipasang pada poros putar, dan posisinya dilaporkan supaya kursi pengemudi,
// tangan, dan kamera kabin berada tepat di setir itu (vehicle-view.js); setir buatan kode hanya dipasang bila model tidak punya setir sendiri.
// Poros putar setir dihitung dari bentuk lingkarnya (bidang rata terbaik), bukan dari perkiraan kotak, dan bagian kecil tak bernama setir yang menempel
// di bidang itu (hub, lambang, tombol) ikut berputar: dulu setir terlihat "patah" saat dibelokkan karena porosnya miring dan hub tertinggal.
// Material kaca (nama mengandung glass/kaca/window/windshield) dibuat bening sederhana (tanpa transmission) supaya pandangan dari kabin jernih.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const WHEEL_NAME = /wheel|roda|tyre|tire|velg|(?<!t)rim/i;
const NOT_WHEEL = /steer|setir|kemudi|arch|well|fender|caliper|kaliper|cover|light|lamp/i;
const STEER_NAME = /steer|setir|kemudi/i;
const NOT_STEER = /column|kolom|stalk|tuas|paddle|shaft|lock|ctrl|control|wiper/i; // bagian yang tidak ikut berputar bersama setir
const NOT_SPIN_PART = /column|kolom|stalk|tuas|paddle|shaft|lock|ctrl|control|wiper|dash|gauge|cluster|screen|display|speedo|needle|dial|ipad|vent|panel/i; // bukan bagian setir walau dekat
const SPIN_SLAB = 0.06; // m: bagian tak bernama ikut berputar bila jaraknya dari bidang setir tidak lebih dari ini
const GLASS_NAME = /glass|kaca|window|windshield|windscreen|jendela/i;
const NOT_GLASS = /frame|trim|seal|rubber|karet|wiper|mirror|cermin|spion|cover/i;
const GLASS_OPACITY = 0.28;
const asArray = (m) => (Array.isArray(m) ? m : [m]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Decoder Draco dimuat dari CDN Google (versi dipatok) hanya bila sebuah GLB memakai kompresi Draco; GLB biasa tidak menyentuhnya.
const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';
let sharedLoader = null;
/** Pemuat GLTF bersama yang mendukung GLB berkompresi Draco dan meshopt (decoder meshopt ikut terbundel, tanpa CDN); dibuat saat pertama dipakai. */
function defaultLoader() {
  if (!sharedLoader) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_DECODER_PATH);
    sharedLoader = new GLTFLoader();
    sharedLoader.setDRACOLoader(draco);
    sharedLoader.setMeshoptDecoder(MeshoptDecoder);
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

/** Titik-titik simpul (kerangka root) dari semua mesh di bawah `nodes`, dijarangkan hingga paling banyak ~cap titik. */
function worldPoints(nodes, cap = 4000) {
  const meshes = [];
  let total = 0;
  for (const n of nodes) {
    n.traverse((m) => {
      const pos = m.isMesh ? m.geometry?.attributes?.position : null;
      if (!pos) return;
      meshes.push(m);
      total += pos.count;
    });
  }
  const step = Math.max(1, Math.ceil(total / cap));
  const pts = [];
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  }
  return pts;
}

/**
 * Bidang rata terbaik dari sekumpulan titik (analisis komponen utama, eigen Jacobi 3x3): sumbu = arah paling "tipis" (normal lingkar setir,
 * dibuat menghadap +z), pusat dan jari-jari = lingkaran terkecil yang membungkus titik pada bidang itu. null bila titik terlalu sedikit atau tidak cukup rata.
 */
function ringFrame(points) {
  const n = points.length;
  if (n < 12) return null;
  const mean = new THREE.Vector3();
  for (const p of points) mean.add(p);
  mean.divideScalar(n);
  const a = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of points) {
    const d = [p.x - mean.x, p.y - mean.y, p.z - mean.z];
    for (let i = 0; i < 3; i++) for (let j = i; j < 3; j++) a[i][j] += d[i] * d[j];
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < i; j++) a[i][j] = a[j][i];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    if (Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]) < 1e-12) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) { const x = a[k][p]; const y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = a[p][k]; const y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = v[k][p]; const y = v[k][q]; v[k][p] = c * x - s * y; v[k][q] = s * x + c * y; }
    }
  }
  const ev = [a[0][0], a[1][1], a[2][2]];
  const order = [0, 1, 2].sort((i, j) => ev[i] - ev[j]);
  if (!(ev[order[0]] <= 0.3 * ev[order[1]])) return null; // tidak cukup rata untuk disebut lingkar
  const col = (m) => new THREE.Vector3(v[0][m], v[1][m], v[2][m]).normalize();
  const axis = col(order[0]);
  if (axis.z < 0) axis.negate();
  const u = col(order[2]);
  const w = new THREE.Vector3().crossVectors(axis, u).normalize();
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  const d = new THREE.Vector3();
  for (const p of points) {
    d.copy(p).sub(mean);
    const pu = d.dot(u);
    const pv = d.dot(w);
    if (pu < minU) minU = pu;
    if (pu > maxU) maxU = pu;
    if (pv < minV) minV = pv;
    if (pv > maxV) maxV = pv;
  }
  const center = mean.clone().addScaledVector(u, (minU + maxU) / 2).addScaledVector(w, (minV + maxV) / 2);
  return { axis, center, radius: Math.max(maxU - minU, maxV - minV) / 2 };
}

/**
 * Cari roda setir asli di model: node (paling atas) bernama steer/setir/kemudi yang pusatnya di dalam kabin dan lebarnya sebesar roda setir (0,2-0,7 m).
 * Semua bagiannya dipasang pada satu poros yang tegak lurus bidang lingkar setir, supaya `spin.rotation.z` memutar setir tepat pada porosnya
 * (tanpa goyang/patah), dan bagian kecil tak bernama setir yang menempel di bidang itu (hub, lambang, tombol) ikut berputar.
 * Mengembalikan { spin, center (kerangka mobil, x + = kiri), radius, tilt (rad, sama tanda dengan cockpitSpec.wheel.tilt), names } atau null bila tidak ada.
 */
function rigSteering(root, model) {
  const found = [];
  const walk = (o) => {
    if (o.name && STEER_NAME.test(o.name) && !NOT_STEER.test(o.name)) {
      found.push(o);
      return;
    }
    for (const child of o.children) walk(child);
  };
  walk(model);
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  const c = new THREE.Vector3();
  const sz = new THREE.Vector3();
  const nodes = [];
  for (const o of found) {
    part.setFromObject(o);
    if (part.isEmpty()) continue;
    part.getCenter(c);
    if (Math.abs(c.x) < 0.15 || Math.abs(c.x) > 1.1 || c.y < 0.45 || c.y > 1.4 || Math.abs(c.z) > 2.2) continue; // bukan roda setir di kabin
    nodes.push(o);
    box.union(part);
  }
  if (!nodes.length) return null;
  const size = box.getSize(new THREE.Vector3());
  if (size.x < 0.2 || size.x > 0.7) return null; // bukan seukuran roda setir
  let center = box.getCenter(new THREE.Vector3());
  let radius = size.x / 2;
  let tilt = -clamp(Math.atan2(Math.max(0, size.z - 0.03), size.y), 0, 0.8); // perkiraan kasar dari kotak (cadangan)
  let axis = null;
  const frame = ringFrame(worldPoints(nodes));
  if (frame && frame.radius >= 0.1 && frame.radius <= 0.35 && frame.center.distanceTo(center) < 0.15) {
    axis = frame.axis;
    center = frame.center;
    radius = frame.radius;
    tilt = clamp(Math.atan2(-axis.y, axis.z), -0.8, 0); // putaran di sumbu x yang setara dengan miring setir (dipakai kokpit untuk tangan)
  }

  // bagian kecil tak bernama setir yang menempel di bidang setir (hub, lambang, tombol) ikut berputar
  const extras = [];
  if (axis) {
    const taken = new Set(nodes);
    const under = (o, test) => { for (let p = o.parent; p; p = p.parent) if (test(p)) return true; return false; };
    const d = new THREE.Vector3();
    model.traverse((o) => {
      if (!o.isMesh || taken.has(o) || under(o, (p) => taken.has(p)) || NOT_SPIN_PART.test(o.name || '') || under(o, (p) => NOT_SPIN_PART.test(p.name || ''))) return;
      part.setFromObject(o);
      if (part.isEmpty()) return;
      part.getCenter(c);
      part.getSize(sz);
      d.copy(c).sub(center);
      const along = d.dot(axis);
      const inPlane = Math.sqrt(Math.max(0, d.lengthSq() - along * along));
      if (Math.abs(along) <= SPIN_SLAB && inPlane <= radius * 1.05 && Math.max(sz.x, sz.y, sz.z) <= radius * 2.2) extras.push(o);
    });
  }

  const outer = new THREE.Group();
  outer.position.copy(center);
  if (axis) outer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  else outer.rotation.x = tilt;
  const spin = new THREE.Group();
  outer.add(spin);
  root.add(outer);
  root.updateMatrixWorld(true);
  for (const o of [...nodes, ...extras]) spin.attach(o);
  return { spin, center, radius, tilt, names: nodes.map((o) => o.name), extras: extras.map((o) => o.name) };
}

/** Bahan kaca dibuat bening sederhana: tanpa transmission (buram dan hijau di HP), agak transparan, tidak menulis kedalaman, pantulan lingkungan lemah. */
function tameGlass(m) {
  if ('transmission' in m && m.transmission > 0) {
    m.transmission = 0;
    if ('thickness' in m) m.thickness = 0;
  }
  m.transparent = true;
  m.opacity = Math.min(m.opacity ?? 1, GLASS_OPACITY);
  m.depthWrite = false;
  if ('envMapIntensity' in m) m.envMapIntensity = 0.4;
  m.needsUpdate = true;
}

/**
 * Pasang `scene` (hasil GLTFLoader) ke kerangka mobil: panjangnya `length` m sepanjang sumbu z, pusat di (0, 0, 0), dasar di y = 0.
 * yaw = putaran tambahan (0 atau Math.PI) bila moncong model menghadap ke belakang. Mengembalikan { root, wheels, steering }
 * (steering = setir asli model, atau null bila model tidak punya setir yang namanya dikenali).
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
    for (const m of asArray(o.material)) {
      if (!m) continue;
      if (envMap && 'envMap' in m && !m.envMap) {
        m.envMap = envMap;
        m.envMapIntensity = 1;
        m.needsUpdate = true;
      }
      const label = m.name || o.name || '';
      if (GLASS_NAME.test(label) && !NOT_GLASS.test(label) && !NOT_GLASS.test(o.name || '')) {
        tameGlass(m);
        o.castShadow = false; // kaca tidak menggelapkan bagian dalam kabin
      }
    }
  });
  return { root, wheels: rigWheels(root, model), steering: rigSteering(root, model) };
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
