import * as THREE from 'three';
import { LANES_PER_DIRECTION } from './highway.js';
import { birdPose, birdSpecs, birdVisibility, lightLevel, hitVehicle, mixedTrafficSpecs, trafficPose } from './hotel-life-data.js';
import { createVehicleSet, setVehicleLights } from './hotel-vehicle-parts.js';
import { buildAircraft } from './hotel-aircraft.js';

// Hotel dan jalan terasa hidup (THREE): lalu lintas campuran (mobil, motor, bus, truk; lampu menyala saat gelap dan hujan) di Lingkar NIKORA
// dan burung yang mengitari tapak di siang hari, serta helikopter dan pesawat yang mengorbit menara (hotel-aircraft.js, dipasang di sini karena
// modul ini sudah dipanggil tiap frame oleh hotel-main.js). Data dan matematikanya di hotel-life-data.js (diuji); bentuk kendaraan di
// hotel-vehicle-parts.js (dipakai bersama hotel-commute.js). Kendaraan selalu tampil utuh dan tetap melaju; bila pemain berada di badan
// kendaraan, update() melaporkan tabrakan ({ hit }) dan hotel-main.js melempar pemain. ?lalin=0 mematikan lalu lintas, ?burung=0 burung, ?pesawat=0 helikopter dan pesawat. Lajur dalam sisi utara dikosongkan
// untuk kendaraan karyawan (COMMUTE_LANE).
// update() juga melaporkan kendaraan yang cukup dekat untuk terdengar ({ sources }); hotel-main.js meneruskannya ke hotel-traffic-audio.js (suara mesin).
// Yang SUDAH ada dan tidak diulang: petugas (hotel-staff-view.js), karyawan pulang-pergi (hotel-commute.js), langit dan lampu (hotel-sky.js),
// hujan (rain-boot.js). Suara sekitar ada di hotel-ambience.js.

const HIT_RANGE = 14; // m: hanya kendaraan yang sedekat ini ke pemain yang diperiksa tabrakannya (badan terpanjang: bus 11,5 m)
const SOUND_RANGE = 120; // m: kendaraan yang lebih jauh dari ini tidak mungkin terdengar (jangkauan terjauh di hotel-traffic-audio.js: bus dan truk)
const NO_SOURCES = Object.freeze([]);

export function createHotelLife({ scene, low = false, search = '' } = {}) {
  const q = new URLSearchParams(search);
  const trafficOn = q.get('lalin') !== '0';
  const birdsOn = q.get('burung') !== '0';
  const aircraftOn = q.get('pesawat') !== '0';
  const root = new THREE.Group();
  root.name = 'nikora-life';
  scene.add(root);
  const owned = [];
  const dummy = new THREE.Object3D();
  const local = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  const sources = []; // kendaraan yang terdengar frame ini (dipakai ulang tiap frame)

  // ---- lalu lintas: satu kumpulan per jenis kendaraan
  const specs = trafficOn ? mixedTrafficSpecs({ lanes: low ? 2 : LANES_PER_DIRECTION, perLane: low ? 4 : 9 }) : [];
  const groups = new Map();
  for (const s of specs) {
    if (!groups.has(s.kind)) groups.set(s.kind, []);
    groups.get(s.kind).push(s);
  }
  const sets = [...groups].map(([kind, list]) => ({ list, set: createVehicleSet({ parent: root, kind, capacity: list.length, riders: true, name: `lalin-${kind}` }) }));

  // ---- burung: dua sayap per burung (satu InstancedMesh per sisi), berporos di badan
  const birdList = birdsOn ? birdSpecs(low ? 8 : 16) : [];
  let birds = null;
  if (birdList.length) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x1d2229, side: THREE.DoubleSide });
    const make = (dx) => {
      const geo = new THREE.BoxGeometry(1.1, 0.05, 0.4).translate(dx, 0, 0);
      const mesh = new THREE.InstancedMesh(geo, mat, birdList.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      root.add(mesh);
      owned.push(geo);
      return mesh;
    };
    owned.push(mat);
    birds = { left: make(-0.55), right: make(0.55) };
  }
  // ---- helikopter dan pesawat: anak `root`, jadi ikut disembunyikan selama lorong perjalanan; galat di dalamnya tidak mematikan lalu lintas dan burung
  let aircraft = null;
  if (aircraftOn) {
    try {
      aircraft = buildAircraft(root);
    } catch (error) {
      console.warn('[hotel] helikopter dan pesawat dilewati', error);
      aircraft = null;
    }
  }
  let level = 0;

  return {
    root,
    info: () => ({ cars: specs.length, kinds: Object.fromEntries(sets.map(({ list, set }) => [set.kind, list.length])), birds: birdList.length, aircraft: aircraft?.info() ?? null, lights: level }),
    /**
     * Tiap frame: time detik, me = pemain {x, z}, night 0..1 (nightLevel), rain 0..1, active = false selama perjalanan lorong (dunia berbeda).
     * hittable = pemain boleh tertabrak sekarang (berjalan kaki di luar, tidak sedang terbaring/kebal/di kendaraan). Mengembalikan
     * { hit: { id, kind, speed, dirX, dirZ }, sources } : hit = kendaraan pertama yang mengenai pemain (atau null); sources = kendaraan dalam
     * SOUND_RANGE dari pemain, [{ id, kind, x, z, speed, vx, vz }] untuk hotel-traffic-audio.js (kosong selama lorong). Daftar sources dipakai ulang
     * tiap frame: pakai segera, jangan disimpan.
     */
    update({ time, me, night = 0, rain = 0, active = true, hittable = false }) {
      root.visible = active;
      let hit = null;
      sources.length = 0;
      if (!active) return { hit, sources: NO_SOURCES };
      if (sets.length) {
        level = lightLevel(night, rain);
        setVehicleLights(level);
        for (const { list, set } of sets) {
          for (let i = 0; i < list.length; i++) {
            const p = trafficPose(list[i], time);
            set.place(i, p.x, p.z, p.heading, 1, list[i].color);
            if (hittable && !hit && Math.abs(p.x - me.x) < HIT_RANGE && Math.abs(p.z - me.z) < HIT_RANGE) {
              const h = hitVehicle(p, list[i].kind, me);
              if (h) hit = { id: list[i].id, kind: list[i].kind, speed: list[i].speed, dirX: h.dirX, dirZ: h.dirZ };
            }
            const sx = p.x - me.x;
            const sz = p.z - me.z;
            if (sx * sx + sz * sz < SOUND_RANGE * SOUND_RANGE) {
              const v = list[i].speed;
              sources.push({ id: list[i].id, kind: list[i].kind, x: p.x, z: p.z, speed: v, vx: Math.sin(p.heading) * v, vz: Math.cos(p.heading) * v });
            }
          }
          set.commit(list.length);
        }
      }
      if (birds) {
        const visible = birdVisibility(night, rain) > 0.05;
        birds.left.visible = visible;
        birds.right.visible = visible;
        if (visible) {
          for (let i = 0; i < birdList.length; i++) {
            const p = birdPose(birdList[i], time);
            dummy.position.set(p.x, p.y, p.z);
            dummy.rotation.set(0, p.heading, 0);
            dummy.scale.setScalar(1.5);
            dummy.updateMatrix();
            local.makeRotationZ(p.flap);
            world.multiplyMatrices(dummy.matrix, local);
            birds.left.setMatrixAt(i, world);
            local.makeRotationZ(-p.flap);
            world.multiplyMatrices(dummy.matrix, local);
            birds.right.setMatrixAt(i, world);
          }
          birds.left.instanceMatrix.needsUpdate = true;
          birds.right.instanceMatrix.needsUpdate = true;
        }
      }
      if (aircraft) {
        try {
          aircraft.update(time);
        } catch (error) {
          console.warn('[hotel] helikopter dan pesawat dimatikan karena galat', error);
          try { aircraft.dispose(); } catch { /* sudah dibuang */ }
          aircraft = null;
        }
      }
      return { hit, sources };
    },
    dispose() {
      scene.remove(root);
      aircraft?.dispose();
      for (const { set } of sets) set.dispose();
      for (const m of [birds?.left, birds?.right]) m?.dispose?.();
      for (const x of owned) x.dispose?.();
    },
  };
}
