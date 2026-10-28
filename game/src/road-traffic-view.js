// Menggambar lalu lintas karyawan villa di jalan perjalanan (villa-road-traffic.js) di dalam grup dunia perjalanan (bingkai rute: tinggi jalan = frameAt.y).
// Satu InstancedMesh per bagian kendaraan (bentuk dari hotel-vehicle-parts.js, bahan sendiri), jadi motor, mobil, dan bus hanya beberapa draw call berapa pun
// jumlahnya. Hanya kendaraan dalam jarak DRAW_R dari kamera yang digambar; sisanya cuma dihitung. Kendaraan hanya tampilan (tidak ikut fisika mobil pemain).
// Arah 'out' (menuju villa) memakai lajur kiri, arah 'back' lajur seberangnya, masing-masing di sisi median; muncul dan hilang halus di kedua ujung rute.
import * as THREE from 'three';
import { clamp, frameAt } from './journey.js';
import { MEDIAN_WIDTH } from './highway.js';
import { flareHalf } from './journey-world.js';
import { VEHICLE_KINDS } from './hotel-vehicle-parts.js';
import { journeyProfile, trafficAt } from './villa-road-traffic.js';

export const DRAW_R = 320; // m dari kamera
export const CAPS = Object.freeze({ motor: 28, car: 12, bus: 6 });
const FADE = 35; // m: muncul dan hilang halus di ujung rute
const GROUND = 0.06;
const MED_HALF = MEDIAN_WIDTH / 2;
const LANE_OFFSET = 3; // dari tepi median ke tengah lajur (m)
const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

const BOX = new THREE.BoxGeometry(1, 1, 1);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, ...o });
const makeMaterials = () => ({
  body: std(0xffffff, { roughness: 0.35, metalness: 0.5 }),
  cabin: std(0x1b2430, { roughness: 0.15, metalness: 0.6 }),
  wheel: std(0x111214, { roughness: 0.9, metalness: 0 }),
  dark: std(0x2a2d33, { roughness: 0.7 }),
  rider: std(0x2b3445, { roughness: 0.8, metalness: 0 }),
  head: new THREE.MeshBasicMaterial({ color: 0xfff1cf }),
  tail: new THREE.MeshBasicMaterial({ color: 0xff2a1c }),
});

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);

/** Kumpulan kendaraan sejenis: place(i, x, y, z, heading, pitch, scale, color), commit(jumlahTerpakai). */
function createSet({ parent, mats, kind, capacity, riders = false }) {
  const parts = VEHICLE_KINDS[kind].filter((p) => !p.rider || riders);
  const meshes = parts.map((p) => {
    const mesh = new THREE.InstancedMesh(BOX, mats[p.m], capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // matriks berubah tiap frame
    mesh.name = `jalan-${kind}-${p.m}`;
    mesh.count = 0;
    if (p.tint) {
      mesh.setColorAt(0, WHITE);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    parent.add(mesh);
    return mesh;
  });
  return {
    kind,
    capacity,
    place(i, x, y, z, heading, pitch, scale, color) {
      const sc = Math.max(scale, 1e-4);
      _e.set(-pitch, heading, 0, 'YXZ'); // pitch positif = hidung naik
      _q.setFromEuler(_e);
      for (let k = 0; k < parts.length; k++) {
        const p = parts[k];
        _p.set(p.c[0] * sc, p.c[1] * sc, p.c[2] * sc).applyQuaternion(_q);
        _p.x += x;
        _p.y += y + GROUND;
        _p.z += z;
        _s.set(p.s[0] * sc, p.s[1] * sc, p.s[2] * sc);
        meshes[k].setMatrixAt(i, _m.compose(_p, _q, _s));
        if (p.tint) meshes[k].setColorAt(i, _c.setHex(color));
      }
    },
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

/**
 * group = world.group dunia perjalanan villa (bingkai rute); j = rute (buildJourney); secondsNow() = detik dalam sehari (jam asli di zona acara).
 * Panggil update({ x, z }) tiap frame dengan posisi kamera di bingkai rute (worldToLocal).
 */
export function createRoadTrafficView({ group, j, secondsNow }) {
  const mats = makeMaterials();
  const sets = {
    motor: createSet({ parent: group, mats, kind: 'motor', capacity: CAPS.motor, riders: true }),
    car: createSet({ parent: group, mats, kind: 'car', capacity: CAPS.car }),
    bus: createSet({ parent: group, mats, kind: 'bus', capacity: CAPS.bus }),
  };
  const L = journeyProfile().length;
  const buf = [];
  let last = { active: 0, drawn: 0 };
  return {
    update(cam) {
      const list = trafficAt(secondsNow(), buf);
      const used = { motor: 0, car: 0, bus: 0 };
      for (const v of list) {
        const s = clamp(v.s, 0, L);
        const f = frameAt(j, s);
        const d = Math.min(MED_HALF + LANE_OFFSET, (MED_HALF + flareHalf(s)) / 2);
        const lane = v.dir === 'out' ? d : -d; // vektor kiri jalur di bingkai rute: (cos h, -sin h)
        const x = f.x + Math.cos(f.heading) * lane;
        const z = f.z - Math.sin(f.heading) * lane;
        if (Math.hypot(x - cam.x, z - cam.z) > DRAW_R) continue;
        const set = sets[v.kind];
        if (used[v.kind] >= set.capacity) continue;
        const slope = (frameAt(j, clamp(s + 3, 0, L)).y - frameAt(j, clamp(s - 3, 0, L)).y) / 6;
        const pitch = v.dir === 'out' ? Math.atan(slope) : -Math.atan(slope);
        const heading = v.dir === 'out' ? f.heading : f.heading + Math.PI;
        set.place(used[v.kind]++, x, f.y, z, heading, pitch, smooth(Math.min(s, L - s) / FADE), v.color);
      }
      for (const k of Object.keys(sets)) sets[k].commit(used[k]);
      last = { active: list.length, drawn: used.motor + used.car + used.bus };
    },
    /** Untuk pengujian dan debug: kendaraan yang sedang di jalan (dihitung) dan yang digambar. */
    stats: () => ({ ...last, drawnBy: null }),
    dispose() {
      for (const s of Object.values(sets)) s.dispose();
      for (const m of Object.values(mats)) m.dispose();
    },
  };
}
