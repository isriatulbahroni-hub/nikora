import * as THREE from 'three';
import { AIRCRAFT, orbitPose } from './hotel-aircraft-data.js';

// Helikopter dan pesawat yang mengorbit menara (data orbit: hotel-aircraft-data.js). Hanya pemandangan: tidak bisa dikendarai dan tidak punya tabrakan.
// Model badan, rotor, baling-baling, dan roda diporting dari Courier City (https://github.com/shubhransh-gupta/courier-city, lisensi MIT,
// (c) 2026 Shubhransh Gupta; src/entities/Helicopter.js dan Airplane.js pada branch feature/bruno-simon-graphics-and-physics). Yang dibuang:
// kontrol pemain, fisika, suara, lampu sorot, dan bayangan di tanah. Yang ditambah: skala, lampu strobo, dan gerak orbit berbasis waktu.
// Pemberitahuan lisensi lengkap ada di THIRD_PARTY_NOTICES.md.

function helicopterMaterials() {
  return {
    body: new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.6, roughness: 0.3 }), // livery biru langit
    dark: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.82 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 }),
  };
}

/** Helikopter (kabin bulat, ekor, rotor utama 4 bilah, rotor ekor, dua skid). Menghadap +z. */
function createHelicopter(M) {
  const g = new THREE.Group();
  const cabinGeo = new THREE.SphereGeometry(1.6, 16, 12);
  cabinGeo.scale(1.0, 0.95, 1.8);
  const cabin = new THREE.Mesh(cabinGeo, M.body);
  cabin.position.y = 1.6;
  g.add(cabin);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.52, 14, 12, 0, Math.PI, 0, Math.PI / 1.5), M.glass);
  cockpit.rotation.x = Math.PI / 2;
  cockpit.position.set(0, 1.6, 0.8);
  g.add(cockpit);
  const boomGeo = new THREE.CylinderGeometry(0.24, 0.42, 6.2, 10);
  boomGeo.rotateX(Math.PI / 2);
  const boom = new THREE.Mesh(boomGeo, M.body);
  boom.position.set(0, 1.8, -4.2);
  g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 1.2), M.body);
  fin.position.set(0, 2.3, -7.2);
  g.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.6), M.dark);
  stab.position.set(0, 1.9, -6.5);
  g.add(stab);

  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 3.2, 0);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), M.metal);
  mast.position.y = -0.3;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 10), M.dark);
  mainRotor.add(mast, hub);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 5.2), M.dark);
    blade.position.set(Math.sin(a) * 2.6, 0, Math.cos(a) * 2.6);
    blade.rotation.y = a;
    mainRotor.add(blade);
  }
  g.add(mainRotor);

  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.22, 2.3, -7.2);
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.02), M.dark);
    b.rotation.z = (i / 2) * Math.PI;
    tailRotor.add(b);
  }
  g.add(tailRotor);

  const skidGeo = new THREE.CylinderGeometry(0.09, 0.09, 4.4, 8);
  skidGeo.rotateX(Math.PI / 2);
  const left = new THREE.Mesh(skidGeo, M.dark);
  left.position.set(-1.25, 0.25, 0);
  const right = new THREE.Mesh(skidGeo, M.dark);
  right.position.set(1.25, 0.25, 0);
  g.add(left, right);
  for (const sz of [-0.9, 0.9]) {
    for (const sx of [-1.25, 1.25]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), M.dark);
      strut.position.set(sx * 0.85, 0.75, sz);
      strut.rotation.z = sx > 0 ? -0.28 : 0.28;
      g.add(strut);
    }
  }
  return { group: g, spin: { mainRotor, tailRotor }, strobeAt: [0, 3.4, -7.2] };
}

function airplaneMaterials() {
  return {
    body: new THREE.MeshStandardMaterial({ color: 0xf8f9fa, roughness: 0.35, metalness: 0.1 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xff3838, roughness: 0.4, metalness: 0.2 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x222f3e, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0984e3, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.8 }),
  };
}

/** Pesawat baling-baling (badan, hidung, kanopi, sayap bertip merah, ekor, baling-baling). Menghadap +z. */
function createAirplane(M) {
  const g = new THREE.Group();
  const fuseGeo = new THREE.CylinderGeometry(0.75, 0.42, 8.5, 14);
  fuseGeo.rotateX(Math.PI / 2);
  const fuselage = new THREE.Mesh(fuseGeo, M.body);
  fuselage.position.y = 1.1;
  g.add(fuselage);
  const noseGeo = new THREE.ConeGeometry(0.75, 1.6, 14);
  noseGeo.rotateX(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, M.trim);
  nose.position.set(0, 1.1, 4.8);
  g.add(nose);
  const canopyGeo = new THREE.SphereGeometry(0.72, 14, 12);
  canopyGeo.scale(1, 0.72, 2.0);
  const canopy = new THREE.Mesh(canopyGeo, M.glass);
  canopy.position.set(0, 1.7, 1.4);
  g.add(canopy);
  const wings = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.14, 1.9), M.body);
  wings.position.set(0, 1.1, 0.7);
  g.add(wings);
  for (const wx of [-6.6, 6.6]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 1.9), M.trim);
    tip.position.set(wx, 1.4, 0.7);
    g.add(tip);
  }
  const hTail = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 1.1), M.trim);
  hTail.position.set(0, 1.35, -3.6);
  const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 1.4), M.trim);
  vTail.position.set(0, 2.2, -3.7);
  g.add(hTail, vTail);

  const propeller = new THREE.Group();
  propeller.position.set(0, 1.1, 5.65);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 10), M.trim);
  spinner.rotateX(-Math.PI / 2);
  const bladeGeo = new THREE.BoxGeometry(0.16, 2.6, 0.04);
  const b1 = new THREE.Mesh(bladeGeo, M.dark);
  const b2 = new THREE.Mesh(bladeGeo, M.dark);
  b2.rotation.z = Math.PI / 2;
  propeller.add(spinner, b1, b2);
  g.add(propeller);
  return { group: g, spin: { propeller }, strobeAt: [0, 2.4, -4.3] };
}

/** Bangun semua pesawat ke `parent`. Mengembalikan { group, update(t detik), info(), dispose() }. */
export function buildAircraft(parent) {
  const group = new THREE.Group();
  group.name = 'nikora-aircraft';
  const heliMats = helicopterMaterials();
  const planeMats = airplaneMaterials();
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const strobeGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const items = AIRCRAFT.map((o) => {
    const m = o.kind === 'plane' ? createAirplane(planeMats) : createHelicopter(heliMats);
    const strobe = new THREE.Mesh(strobeGeo, strobeMat);
    strobe.position.set(...m.strobeAt);
    m.group.add(strobe);
    m.group.rotation.order = 'YXZ';
    m.group.scale.setScalar(o.scale);
    m.group.name = o.id;
    group.add(m.group);
    return { o, ...m, strobe };
  });
  parent.add(group);

  const update = (t) => {
    for (const it of items) {
      const p = orbitPose(it.o, t);
      it.group.position.set(p.x, p.y, p.z);
      it.group.rotation.set(it.o.kind === 'heli' ? 0.1 : 0, p.yaw, p.roll);
      if (it.spin.mainRotor) {
        it.spin.mainRotor.rotation.y = t * 22;
        it.spin.tailRotor.rotation.x = t * 33;
      }
      if (it.spin.propeller) it.spin.propeller.rotation.z = t * 70;
      it.strobe.visible = Math.sin(t * 5 + it.o.phase * 7) > 0.75; // berkedip
    }
  };
  update(0);
  return {
    group,
    update,
    info: () => ({ aircraft: items.length, helicopters: items.filter((i) => i.o.kind === 'heli').length, planes: items.filter((i) => i.o.kind === 'plane').length }),
    dispose() {
      parent.remove(group);
      group.traverse((o) => o.geometry?.dispose?.());
      [...Object.values(heliMats), ...Object.values(planeMats), strobeMat].forEach((m) => m.dispose());
    },
  };
}
