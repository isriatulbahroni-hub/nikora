import * as THREE from 'three';
import { LANES_PER_DIRECTION } from './highway.js';
import { birdPose, birdSpecs, birdVisibility, lightLevel, proximityScale, trafficPose, trafficSpecs } from './hotel-life-data.js';

// Hotel dan jalan terasa hidup (THREE): lalu lintas di Lingkar NIKORA (mobil dengan lampu yang menyala saat gelap dan hujan) dan burung yang
// mengitari tapak di siang hari. Data dan matematikanya di hotel-life-data.js (diuji). Hanya pemandangan: tidak ada tabrakan; mobil lalu lintas
// mengecil halus bila terlalu dekat pemain. Semuanya InstancedMesh (sekitar 8 draw call). ?lalin=0 mematikan lalu lintas, ?burung=0 burung.
// Yang SUDAH ada dan tidak diulang: pesawat dan helikopter (hotel-aircraft.js), petugas (hotel-staff-view.js), langit dan lampu (hotel-sky.js),
// hujan (rain-boot.js). Suara sekitar ada di hotel-ambience.js.

const MIN_SCALE = 1e-4;
const HEAD = [[-0.62, 0.78, 2.22], [0.62, 0.78, 2.22]];
const TAIL = [[-0.65, 0.8, -2.22], [0.65, 0.8, -2.22]];
const WHEELS = [[-0.9, 0.3, 1.4], [0.9, 0.3, 1.4], [-0.9, 0.3, -1.4], [0.9, 0.3, -1.4]];

export function createHotelLife({ scene, low = false, search = '' } = {}) {
  const q = new URLSearchParams(search);
  const trafficOn = q.get('lalin') !== '0';
  const birdsOn = q.get('burung') !== '0';
  const root = new THREE.Group();
  root.name = 'nikora-life';
  scene.add(root);
  const owned = [];
  const own = (x) => {
    owned.push(x);
    return x;
  };
  const dummy = new THREE.Object3D();
  const local = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  const color = new THREE.Color();
  const instanced = (geo, mat, count) => {
    const mesh = new THREE.InstancedMesh(own(geo), own(mat), count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // matriks berubah tiap frame: bola pembatas tidak dihitung ulang
    root.add(mesh);
    return mesh;
  };

  // ---- lalu lintas
  const specs = trafficOn ? trafficSpecs({ lanes: low ? 2 : LANES_PER_DIRECTION, perLane: low ? 2 : 3 }) : [];
  let cars = null;
  if (specs.length) {
    const n = specs.length;
    const body = instanced(new THREE.BoxGeometry(1.85, 0.7, 4.4).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.5 }), n);
    specs.forEach((s, i) => body.setColorAt(i, color.setHex(s.color)));
    body.instanceColor.needsUpdate = true;
    const cabin = instanced(new THREE.BoxGeometry(1.6, 0.6, 2.2).translate(0, 1.35, -0.2), new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.15, metalness: 0.6 }), n);
    const wheels = instanced(new THREE.BoxGeometry(0.3, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.9 }), n * 4);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff1cf });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a1c });
    const heads = instanced(new THREE.BoxGeometry(0.42, 0.2, 0.1), headMat, n * 2);
    const tails = instanced(new THREE.BoxGeometry(0.42, 0.16, 0.1), tailMat, n * 2);
    cars = { body, cabin, wheels, heads, tails, headMat, tailMat };
  }

  // ---- burung: dua sayap per burung (satu InstancedMesh per sisi), berporos di badan
  const birdList = birdsOn ? birdSpecs(low ? 8 : 16) : [];
  let birds = null;
  if (birdList.length) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x1d2229, side: THREE.DoubleSide });
    birds = {
      left: instanced(new THREE.BoxGeometry(1.1, 0.05, 0.4).translate(-0.55, 0, 0), mat, birdList.length),
      right: instanced(new THREE.BoxGeometry(1.1, 0.05, 0.4).translate(0.55, 0, 0), mat, birdList.length),
    };
  }

  const place = (mesh, index, base, [x, y, z]) => {
    local.makeTranslation(x, y, z);
    world.multiplyMatrices(base, local);
    mesh.setMatrixAt(index, world);
  };
  let level = 0;

  return {
    root,
    info: () => ({ cars: specs.length, birds: birdList.length, lights: level }),
    /** Tiap frame: time detik, me = pemain {x, z}, night 0..1 (nightLevel), rain 0..1, active = false selama perjalanan lorong (dunia berbeda). */
    update({ time, me, night = 0, rain = 0, active = true }) {
      root.visible = active;
      if (!active) return;
      if (cars) {
        level = lightLevel(night, rain);
        cars.headMat.color.setHex(0xfff1cf).multiplyScalar(0.3 + 0.7 * level);
        cars.tailMat.color.setHex(0xff2a1c).multiplyScalar(0.35 + 0.65 * level);
        for (let i = 0; i < specs.length; i++) {
          const p = trafficPose(specs[i], time);
          const s = Math.max(MIN_SCALE, proximityScale(Math.hypot(p.x - me.x, p.z - me.z)));
          dummy.position.set(p.x, 0.06, p.z);
          dummy.rotation.set(0, p.heading, 0);
          dummy.scale.setScalar(s);
          dummy.updateMatrix();
          cars.body.setMatrixAt(i, dummy.matrix);
          cars.cabin.setMatrixAt(i, dummy.matrix);
          WHEELS.forEach((w, j) => place(cars.wheels, i * 4 + j, dummy.matrix, w));
          HEAD.forEach((w, j) => place(cars.heads, i * 2 + j, dummy.matrix, w));
          TAIL.forEach((w, j) => place(cars.tails, i * 2 + j, dummy.matrix, w));
        }
        for (const m of [cars.body, cars.cabin, cars.wheels, cars.heads, cars.tails]) m.instanceMatrix.needsUpdate = true;
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
    },
    dispose() {
      scene.remove(root);
      root.traverse((o) => o.dispose?.());
      for (const x of owned) x.dispose?.();
    },
  };
}
