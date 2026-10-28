import * as THREE from 'three';
import { HOTEL_TOP_LEVEL, SKY_WALK, hotelLevelY } from './hotel-layout.js';

// Sky Walk (THREE): dek kaca di luar tapak Sky Level; denah dan fisikanya di hotel-skywalk.js lewat hotel-layout.js.
// Tanpa atap: langit terbuka di atasnya dan ~4,2 km udara di bawah lantai kaca. Digambar sekali untuk seluruh menara
// (tiga InstancedMesh saja), jadi ikut terlihat dari luar dan tidak dibangun-buang per lantai seperti interior.
const GOLD = 0xc9a24b;
const RAIL_HEIGHT = 1.2;
const RIB_STEP = 5; // jarak rusuk emas di lantai kaca (m)
const POST_STEP = 5; // jarak tiang pagar (m)

const spread = (a, b, step) => {
  const n = Math.max(1, Math.round((b - a) / step));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
};

function instanced(parent, geometry, items, material) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  items.forEach((it, i) => mesh.setMatrixAt(i, m.compose(p.set(it.x, it.y, it.z), q, s.set(it.sx, it.sy, it.sz))));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

/** Bangun Sky Walk ke `parent`. Mengembalikan { group, dispose() }. */
export function buildSkyWalk(parent) {
  const [x0, z0, x1, z1] = SKY_WALK.outer;
  const y0 = hotelLevelY(HOTEL_TOP_LEVEL);
  const length = x1 - x0;
  const width = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const zN = z0 + 0.2; // garis pagar utara
  const zS = z1 - 0.2; // garis pagar selatan
  const xW = x0 + 0.2; // garis pagar ujung barat
  const glass = [];
  const gold = [];
  const light = [];

  // lantai kaca tembus pandang + rusuk emas melintang dan membujur (memberi rasa tinggi saat menunduk)
  glass.push({ x: cx, y: y0 - 0.06, z: cz, sx: length, sy: 0.12, sz: width });
  for (const x of spread(x0, x1, RIB_STEP)) gold.push({ x, y: y0 - 0.07, z: cz, sx: 0.16, sy: 0.14, sz: width });
  for (const z of spread(z0, z1, 4)) gold.push({ x: cx, y: y0 - 0.07, z, sx: length, sy: 0.14, sz: 0.16 });
  // balok tepi di bawah pagar
  gold.push({ x: cx, y: y0 - 0.25, z: zN, sx: length, sy: 0.5, sz: 0.4 }, { x: cx, y: y0 - 0.25, z: zS, sx: length, sy: 0.5, sz: 0.4 }, { x: xW, y: y0 - 0.25, z: cz, sx: 0.4, sy: 0.5, sz: width });

  // pagar kaca di sisi utara, selatan, dan ujung barat; sisi timur menyambung ke teras Infinity Pool (terbuka)
  glass.push({ x: cx, y: y0 + RAIL_HEIGHT / 2, z: zN, sx: length, sy: RAIL_HEIGHT, sz: 0.05 }, { x: cx, y: y0 + RAIL_HEIGHT / 2, z: zS, sx: length, sy: RAIL_HEIGHT, sz: 0.05 }, { x: xW, y: y0 + RAIL_HEIGHT / 2, z: cz, sx: 0.05, sy: RAIL_HEIGHT, sz: width });
  gold.push({ x: cx, y: y0 + RAIL_HEIGHT, z: zN, sx: length, sy: 0.08, sz: 0.12 }, { x: cx, y: y0 + RAIL_HEIGHT, z: zS, sx: length, sy: 0.08, sz: 0.12 }, { x: xW, y: y0 + RAIL_HEIGHT, z: cz, sx: 0.12, sy: 0.08, sz: width });
  const postH = RAIL_HEIGHT + 0.08;
  for (const x of spread(x0 + 0.2, x1, POST_STEP)) gold.push({ x, y: y0 + postH / 2, z: zN, sx: 0.12, sy: postH, sz: 0.12 }, { x, y: y0 + postH / 2, z: zS, sx: 0.12, sy: postH, sz: 0.12 });
  for (const z of spread(zN, zS, POST_STEP)) gold.push({ x: xW, y: y0 + postH / 2, z, sx: 0.12, sy: postH, sz: 0.12 });

  // garis lampu hangat di dalam pagar (terlihat jelas di malam hari)
  light.push({ x: cx, y: y0 + 0.03, z: z0 + 0.45, sx: length - 0.6, sy: 0.04, sz: 0.08 }, { x: cx, y: y0 + 0.03, z: z1 - 0.45, sx: length - 0.6, sy: 0.04, sz: 0.08 }, { x: x0 + 0.45, y: y0 + 0.03, z: cz, sx: 0.08, sy: 0.04, sz: width - 0.6 });

  const group = new THREE.Group();
  group.name = 'hotel-sky-walk';
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const materials = [
    new THREE.MeshStandardMaterial({ color: 0x9fd0e6, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false }),
    new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.35, metalness: 0.75 }),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8 }),
  ];
  const meshes = [instanced(group, unit, glass, materials[0]), instanced(group, unit, gold, materials[1]), instanced(group, unit, light, materials[2])];
  parent.add(group);
  return {
    group,
    dispose() {
      parent.remove(group);
      meshes.forEach((mesh) => mesh.dispose());
      unit.dispose();
      materials.forEach((m) => m.dispose());
    },
  };
}
