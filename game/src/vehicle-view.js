// Tampilan mobil armada (THREE): badan, kaca/roda/bumper, lampu; satu lampu depan untuk mobil yang kita kemudikan.
import * as THREE from 'three';
import { carGeometries } from './villa-props.js';

export function createVehicleView({ scene, fleet }) {
  const cg = carGeometries();
  const detailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2 });
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const root = new THREE.Group();
  root.name = 'armada-mobil';
  scene.add(root);

  const entries = fleet.cars.map((car) => {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: car.color, roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
    const body = new THREE.Mesh(cg.body, bodyMat);
    const details = new THREE.Mesh(cg.details, detailMat);
    const lights = new THREE.Mesh(cg.lights, lightMat);
    body.castShadow = details.castShadow = true;
    lights.castShadow = false;
    const tilt = new THREE.Group(); // kemiringan badan saat menikung/mengerem
    tilt.add(body, details, lights);
    group.add(tilt);
    group.position.set(car.x, 0, car.z);
    group.rotation.y = car.heading;
    root.add(group);
    return { car, group, tilt, bodyMat };
  });

  const head = new THREE.SpotLight(0xfff1cf, 0, 60, 0.6, 0.55, 1.1);
  head.castShadow = false;
  const headTarget = new THREE.Object3D();
  scene.add(head, headTarget);
  head.target = headTarget;

  let pitch = 0;
  let roll = 0;
  return {
    update(delta) {
      const mine = fleet.driving;
      for (const e of entries) {
        const { car, group, tilt } = e;
        group.position.set(car.x, 0, car.z);
        group.rotation.y = car.heading;
        const driven = car === mine;
        const targetRoll = -(car.steer ?? 0) * Math.min(1, Math.abs(car.speed) / 18) * 0.06;
        tilt.rotation.z += (targetRoll - tilt.rotation.z) * Math.min(1, delta * 6);
        tilt.rotation.x += (0 - tilt.rotation.x) * Math.min(1, delta * 6);
        void driven;
      }
      if (mine) {
        const fx = Math.sin(mine.heading);
        const fz = Math.cos(mine.heading);
        head.position.set(mine.x + fx * 2.2, 0.8, mine.z + fz * 2.2);
        headTarget.position.set(mine.x + fx * 20, 0, mine.z + fz * 20);
        head.intensity += (90 - head.intensity) * Math.min(1, delta * 5);
      } else head.intensity += (0 - head.intensity) * Math.min(1, delta * 5);
      void pitch;
      void roll;
    },
    dispose() {
      scene.remove(root, head, headTarget);
      for (const e of entries) e.bodyMat.dispose();
      detailMat.dispose();
      lightMat.dispose();
    },
  };
}
