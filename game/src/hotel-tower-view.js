import * as THREE from 'three';
import { HOTEL_LEVEL_HEIGHT, HOTEL_TOP_Y } from './hotel-layout.js';
import { facadeLayout } from './hotel-facade-data.js';
import { bayTexture } from './hotel-facade.js';
import { crownSpec, diagridSegments, edgeSegments, podiumWingTriangles, skinRings } from './hotel-tower-shape.js';
import { SATELLITES, satelliteRings, satelliteSpire } from './hotel-satellites.js';
import { BAY_WIDTH, beamTransform, capData, loftData, ridgeSegments, skyBeltBoxes, wingData } from './hotel-tower-parts.js';

// Bentuk luar menara NIKORA Grand Hotel: kulit kaca berfaset yang meruncing (hotel-tower-shape.js), rangka diagonal, mahkota dan jarum
// puncak, helipad menjorok, sayap kristal biru di dasar, sabuk emas Sky Lobby, dan empat menara pendamping (hotel-satellites.js). Semua data hitungan ada di
// hotel-tower-parts.js (murni, diuji); modul ini hanya mengubahnya menjadi mesh THREE. Seluruhnya statis dan murah: beberapa mesh saja.
//
// Kulit memakai tekstur bay bermipmap yang sama dengan fasad lama (hotel-facade.js), jadi tiang emas tidak berkedip dari jauh.
// Sisi depan bidang menghadap keluar, jadi dari dalam gedung orang tetap melihat ke luar.
const BOX = new THREE.BoxGeometry(1, 1, 1);

function geometryOf(data, withUv = false) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
  if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  g.computeBoundingSphere();
  return g;
}

/** Batang lurus (diagonal, rusuk) sebagai satu InstancedMesh kotak yang diputar searah batang. */
function beamMesh(segs, thickness, material) {
  const mesh = new THREE.InstancedMesh(BOX, material, segs.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  segs.forEach((seg, i) => {
    const t = beamTransform(seg);
    q.setFromUnitVectors(up, dir.set(t.dir[0], t.dir[1], t.dir[2]));
    mesh.setMatrixAt(i, m.compose(pos.set(t.mid[0], t.mid[1], t.mid[2]), q, scl.set(thickness, t.length, thickness)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Balok-balok datar berputar sumbu y (sabuk Sky Lobby). */
function boxMesh(items, material) {
  const mesh = new THREE.InstancedMesh(BOX, material, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  items.forEach((it, i) => mesh.setMatrixAt(i, m.compose(p.set(it.x, it.y, it.z), q.setFromEuler(e.set(0, it.ry, 0)), s.set(it.sx, it.sy, it.sz))));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * Menggambar seluruh bentuk luar menara dan menara pendamping ke `parent`. Mengembalikan { group, dispose }.
 * Jarum puncak digambar sebagai CylinderGeometry di atas HOTEL_TOP_Y: hotel-sky.js mencarinya untuk menaruh lampu peringatan.
 */
export function buildTowerShell(parent, { anisotropy = 8 } = {}) {
  const group = new THREE.Group();
  group.name = 'hotel-tower-shell';
  const geometries = [];
  const materials = [];
  const textures = [];
  const geo = (g) => { geometries.push(g); return g; };
  const mat = (m) => { materials.push(m); return m; };

  const layout = facadeLayout({ bayWidth: BAY_WIDTH, levelHeight: HOTEL_LEVEL_HEIGHT, finWidth: 0.28, edgeHeight: 0.24 });
  const map = bayTexture(layout, anisotropy, 1, 1); // pengulangan lewat uv tiap bidang, jadi tekstur tidak perlu diatur ulang
  textures.push(map);
  const glass = mat(new THREE.MeshStandardMaterial({ map, roughness: 0.32, metalness: 0.12, transparent: true, depthWrite: false }));
  const steel = mat(new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.3, metalness: 0.8 }));
  const champagne = mat(new THREE.MeshStandardMaterial({ color: 0xefe2b4, roughness: 0.3, metalness: 0.7 }));
  const gold = mat(new THREE.MeshStandardMaterial({ color: 0xc9a24b, roughness: 0.35, metalness: 0.75 }));
  const wingMat = mat(new THREE.MeshStandardMaterial({ color: 0x2f78c8, roughness: 0.25, metalness: 0.45, emissive: 0x0a2a55, emissiveIntensity: 0.35, flatShading: true, side: THREE.DoubleSide }));
  const capMat = mat(new THREE.MeshStandardMaterial({ color: 0x39414a, roughness: 0.5, metalness: 0.6 }));

  const skin = (rings, name) => {
    const mesh = new THREE.Mesh(geo(geometryOf(loftData(rings), true)), glass);
    mesh.name = name;
    mesh.renderOrder = 1; // sesudah benda tak tembus, supaya kaca tidak menimpa apa pun yang ada di depannya
    group.add(mesh);
    return mesh;
  };
  const cap = (pts, y) => group.add(new THREE.Mesh(geo(geometryOf(capData(pts, y))), capMat));
  const cone = (x, baseY, z, rTop, rBottom, height, segments, material) => {
    const mesh = new THREE.Mesh(geo(new THREE.CylinderGeometry(rTop, rBottom, height, segments)), material);
    mesh.position.set(x, baseY + height / 2, z);
    group.add(mesh);
    return mesh;
  };

  // ---- menara utama: kulit, rangka diagonal, rusuk sudut, sabuk emas Sky Lobby
  const rings = skinRings();
  skin(rings, 'hotel-skin');
  group.add(beamMesh(diagridSegments(rings), 1.8, champagne), beamMesh(edgeSegments(rings), 2.4, steel), boxMesh(skyBeltBoxes(rings), gold));

  // ---- mahkota meruncing dan jarum puncak
  const crown = crownSpec();
  skin(crown.rings, 'hotel-crown');
  cap(crown.rings.at(-1).pts, crown.rings.at(-1).y);
  cone(crown.spire.x, crown.spire.baseY, crown.spire.z, 1.6, crown.spire.radius, crown.spire.height, 8, steel);
  cone(crown.needle.x, crown.needle.baseY, crown.needle.z, 0.15, 1.6, crown.needle.height, 6, steel);
  const tip = new THREE.Mesh(geo(new THREE.SphereGeometry(2.2, 8, 6)), mat(new THREE.MeshBasicMaterial({ color: 0xff3a2a })));
  tip.position.set(crown.needle.x, crown.tipY, crown.needle.z);
  group.add(tip);

  // ---- helipad menjorok di sisi utara puncak (seperti Burj Al Arab): lengan baja dari atap dan dua penopang miring ke badan menara.
  // Letak dan ukurannya tetap (0, HOTEL_TOP_Y + 1,06, 448, r 11) karena hotel-sky.js mencari silinder datar berjari-jari >= 10 di atas atap
  // untuk lampu tepinya; yang ditambahkan paling akhir (cakram helipad) yang dipakai, jadi alas lebarnya digambar lebih dulu.
  const topShape = rings.at(-1).shape;
  const padZ = 448;
  cone(0, HOTEL_TOP_Y, padZ, 11.6, 11.6, 1.0, 40, steel); // alas
  const armEnd = topShape.z0 - 0.5; // menembus sedikit ke dalam kulit puncak
  group.add(
    boxMesh([{ x: 0, y: HOTEL_TOP_Y + 0.5, z: (armEnd + padZ) / 2, sx: 8, sy: 1.0, sz: armEnd - padZ, ry: 0 }], steel),
    beamMesh([-3.5, 3.5].map((x) => ({ a: [x, HOTEL_TOP_Y - 45, topShape.z0 + 0.3], b: [x, HOTEL_TOP_Y + 0.2, padZ + 3] })), 1.6, steel),
  );
  const pad = new THREE.Mesh(geo(new THREE.CylinderGeometry(11, 11, 0.12, 40)), mat(new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.7, metalness: 0.2 })));
  pad.position.set(0, HOTEL_TOP_Y + 1.06, padZ);
  const padRing = new THREE.Mesh(geo(new THREE.TorusGeometry(9.6, 0.25, 6, 48)), mat(new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5, metalness: 0.2 })));
  padRing.rotation.x = Math.PI / 2;
  padRing.position.set(0, HOTEL_TOP_Y + 1.15, padZ);
  group.add(padRing, boxMesh([
    { x: -4, y: HOTEL_TOP_Y + 1.2, z: padZ, sx: 0.8, sy: 0.05, sz: 6, ry: 0 }, { x: 4, y: HOTEL_TOP_Y + 1.2, z: padZ, sx: 0.8, sy: 0.05, sz: 6, ry: 0 }, { x: 0, y: HOTEL_TOP_Y + 1.2, z: padZ, sx: 8, sy: 0.05, sz: 0.8, ry: 0 },
  ], mat(new THREE.MeshBasicMaterial({ color: 0xf5f2e8 }))), pad);

  // ---- sayap kristal podium
  const wings = new THREE.Mesh(geo(geometryOf(wingData(podiumWingTriangles()))), wingMat);
  wings.name = 'hotel-podium-wings';
  group.add(wings);

  // ---- menara pendamping
  for (const s of SATELLITES) {
    const sr = satelliteRings(s);
    skin(sr, `hotel-satellite-${s.id}`);
    group.add(beamMesh(ridgeSegments(sr), 1.2, steel));
    cap(sr.at(-1).pts, s.height);
    const sp = satelliteSpire(s);
    cone(sp.x, sp.baseY, sp.z, 0.2, sp.radius, sp.height, 6, steel);
  }

  parent.add(group);
  return {
    group,
    dispose() {
      parent.remove(group);
      group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
