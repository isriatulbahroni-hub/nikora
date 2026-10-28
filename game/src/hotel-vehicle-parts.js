import * as THREE from 'three';

// Bentuk kendaraan bersama (mobil, motor, bus, truk) untuk lalu lintas (hotel-life.js) dan karyawan pulang-pergi (hotel-commute.js).
// Tiap bagian = satu InstancedMesh dari kotak satuan yang diskalakan, jadi satu jenis kendaraan hanya beberapa draw call berapa pun jumlahnya.
const GROUND = 0.06;
const BOX = new THREE.BoxGeometry(1, 1, 1);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, ...o });
const MAT = {
  body: std(0xffffff, { roughness: 0.35, metalness: 0.5 }),
  cabin: std(0x1b2430, { roughness: 0.15, metalness: 0.6 }),
  wheel: std(0x111214, { roughness: 0.9, metalness: 0 }),
  dark: std(0x2a2d33, { roughness: 0.7 }),
  rider: std(0x2b3445, { roughness: 0.8, metalness: 0 }),
  head: new THREE.MeshBasicMaterial({ color: 0xfff1cf }),
  tail: new THREE.MeshBasicMaterial({ color: 0xff2a1c }),
};
const sym = (x, y, z, sx, sy, sz, m) => [{ m, c: [-x, y, z], s: [sx, sy, sz] }, { m, c: [x, y, z], s: [sx, sy, sz] }];

/** Bagian tiap jenis: m = bahan, c = pusat (x kanan, y atas, z depan), s = ukuran, tint = warna per kendaraan, rider = hanya untuk yang berjalan. */
export const VEHICLE_KINDS = Object.freeze({
  car: [
    { m: 'body', c: [0, 0.62, 0], s: [1.95, 0.7, 4.7], tint: true },
    { m: 'cabin', c: [0, 1.25, -0.35], s: [1.75, 0.55, 2.5] },
    ...sym(0.95, 0.3, 1.4, 0.28, 0.6, 0.75, 'wheel'), ...sym(0.95, 0.3, -1.4, 0.28, 0.6, 0.75, 'wheel'),
    ...sym(0.62, 0.78, 2.37, 0.42, 0.2, 0.1, 'head'), ...sym(0.65, 0.8, -2.37, 0.42, 0.16, 0.1, 'tail'),
  ],
  motor: [
    { m: 'body', c: [0, 0.55, 0], s: [0.4, 0.5, 1.7], tint: true },
    { m: 'dark', c: [0, 0.92, -0.15], s: [0.34, 0.12, 0.7] },
    { m: 'wheel', c: [0, 0.32, 0.72], s: [0.14, 0.64, 0.64] }, { m: 'wheel', c: [0, 0.32, -0.72], s: [0.14, 0.64, 0.64] },
    { m: 'head', c: [0, 0.85, 0.93], s: [0.22, 0.16, 0.08] }, { m: 'tail', c: [0, 0.8, -0.93], s: [0.22, 0.1, 0.08] },
    { m: 'rider', c: [0, 1.38, -0.12], s: [0.46, 0.85, 0.42], rider: true },
  ],
  bus: [
    { m: 'body', c: [0, 1.75, 0], s: [2.5, 2.7, 11.5], tint: true },
    { m: 'cabin', c: [0, 2.3, 0], s: [2.54, 0.9, 10.4] },
    ...sym(1.15, 0.5, 3.6, 0.3, 1.0, 1.0, 'wheel'), ...sym(1.15, 0.5, -3.6, 0.3, 1.0, 1.0, 'wheel'),
    ...sym(0.85, 0.8, 5.78, 0.5, 0.25, 0.1, 'head'), ...sym(0.9, 1.0, -5.78, 0.5, 0.25, 0.1, 'tail'),
  ],
  truck: [
    { m: 'body', c: [0, 1.75, -1.2], s: [2.4, 2.6, 5.6], tint: true },
    { m: 'dark', c: [0, 1.3, 2.55], s: [2.3, 2.0, 2.0] },
    { m: 'cabin', c: [0, 1.75, 3.1], s: [2.0, 0.8, 1.0] },
    ...sym(1.1, 0.5, 2.5, 0.3, 1.0, 1.0, 'wheel'), ...sym(1.1, 0.5, -2.8, 0.3, 1.0, 1.0, 'wheel'), ...sym(1.1, 0.5, -4.0, 0.3, 1.0, 1.0, 'wheel'),
    ...sym(0.8, 0.8, 3.6, 0.4, 0.2, 0.1, 'head'), ...sym(0.9, 0.9, -4.0, 0.4, 0.2, 0.1, 'tail'),
  ],
});

/** Lampu semua kendaraan menyala menurut level 0..1 (lightLevel di hotel-life-data.js). */
export function setVehicleLights(level) {
  MAT.head.color.setHex(0xfff1cf).multiplyScalar(0.3 + 0.7 * level);
  MAT.tail.color.setHex(0xff2a1c).multiplyScalar(0.35 + 0.65 * level);
}

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);

/** Satu kumpulan kendaraan sejenis: place(i, x, z, heading, scale, color), hide(i), commit(jumlahTerpakai). riders = pengendara motor ikut digambar. */
export function createVehicleSet({ parent, kind, capacity, riders = false, name = kind }) {
  const parts = VEHICLE_KINDS[kind].filter((p) => !p.rider || riders);
  const meshes = parts.map((p) => {
    const mesh = new THREE.InstancedMesh(BOX, MAT[p.m], capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // matriks berubah tiap frame: bola pembatas tidak dihitung ulang
    mesh.name = `${name}-${p.m}`;
    mesh.count = 0;
    if (p.tint) { mesh.setColorAt(0, WHITE); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    parent.add(mesh);
    return mesh;
  });
  const place = (i, x, z, heading, scale = 1, color = 0xffffff) => {
    const sc = Math.max(scale, 1e-4);
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    _q.setFromAxisAngle(UP, heading);
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      _p.set(x + (p.c[0] * cos + p.c[2] * sin) * sc, GROUND + p.c[1] * sc, z + (-p.c[0] * sin + p.c[2] * cos) * sc);
      _s.set(p.s[0] * sc, p.s[1] * sc, p.s[2] * sc);
      meshes[k].setMatrixAt(i, _m.compose(_p, _q, _s));
      if (p.tint) meshes[k].setColorAt(i, _c.setHex(color));
    }
  };
  return {
    kind,
    capacity,
    place,
    hide: (i) => place(i, 0, 0, 0, 0),
    commit(count) {
      for (const m of meshes) {
        m.count = count;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    },
    dispose() {
      for (const m of meshes) {
        parent.remove(m);
        m.dispose?.();
      }
    },
  };
}
