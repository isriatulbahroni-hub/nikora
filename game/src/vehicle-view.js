// Tampilan mobil armada (THREE). Mobil bermodel mewah (car.model) memakai luxury-cars.js: roda berputar dan membelok mengikuti
// kecepatan, suspensi menunduk/miring, pintu terbuka saat kursi berganti penghuni atau lewat tombol HUD, lampu depan/rem/mundur/sein menyala.
// Mobil bermodel berkas 3D (car.spec.glb, mis. NIKORA W16) dimuat dari GLB (car-glb.js): badan menunduk/miring, roda berputar bila namanya dikenali,
// dan roda setir ASLI model itu (dikenali dari namanya) ikut berputar. Setir buatan kode (lingkar torus penuh) hanya dipasang bila model tidak punya setir sendiri
// (dulu selalu dipasang, jadi setir tampil dobel). Posisi setir asli juga menentukan kursi pengemudi, tangan, dan kamera kabin (alignSpecToWheel);
// mode kabin (tangan, jam, spion) juga berlaku untuk mobil GLB.
// Pintu (DOOR_L/DOOR_R), atap (ROOF), dan bahan lampu (SIG_*, Headlight LED, Reverse Lamp) model GLB dikenali dari namanya dan digerakkan
// oleh car-parts-rig.js mengikuti keadaan dari car-parts.js (tombol HUD pengemudi); model tanpa nama itu tetap tampil seperti biasa.
// Belok roda depan mobil GLB dibatasi secara visual (GLB_STEER_VISUAL) supaya ban lebar tidak menembus lengkung roda/bodi saat setir diputar penuh.
// Mobil tanpa model memakai sedan lama (villa-props.js). Kinematik mobil pemain lain diturunkan dari pose (tanpa protokol baru).
// Keadaan tombol (pintu, atap, lampu, sein) hanya ada di perangkat pengemudi: tidak dikirim ke pemain lain.
import * as THREE from 'three';
import { carGeometries } from './villa-props.js';
import { bakeDoors, buildLuxuryCar } from './luxury-cars.js';
import { wrapAngle } from './vehicle.js';
import { buildSteeringWheel, createCockpitRig } from './cockpit-view.js';
import { alignSpecToWheel, cockpitSpec, wheelAngle } from './cockpit.js';
import { hudInfo } from './car-ride.js';
import { disposeObject, loadCarGlb } from './car-glb.js';
import { getParts } from './car-parts.js';
import { applyParts, rigParts } from './car-parts-rig.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const BASE = import.meta.env?.BASE_URL ?? '/';
export const DOOR_OPEN_S = 1.6; // lama pintu terbuka setelah kursi berganti penghuni
export const GLB_STEER_VISUAL = 0.3; // rad (~17 derajat): batas belok VISUAL roda depan mobil GLB; fisika/setir tetap memakai maxSteer penuh
const BLINK_S = 0.35; // setengah siklus sein mobil buatan kode (sama dengan lencana HUD)
const SIG_DIM = 0x4a3008;
const SIG_BRIGHT = 0xffa020;
// Posisi lampu sein mobil buatan kode: [x, y] di sisi kiri mobil (+x), depan (f) dan belakang (r); sisi kanan dicerminkan. Perkiraan, boleh disetel.
const SIGNAL_SPOTS = Object.freeze({
  royale: { f: [0.84, 0.52], r: [0.82, 0.9] },
  noir: { f: [0.7, 0.42], r: [0.9, 0.74] },
  argent: { f: [0.8, 0.3], r: [0.9, 0.7] },
  rubis: { f: [0.84, 0.62], r: [0.86, 1.02] },
});

/** Sudut roda depan (rad, + = belok kiri) dari laju yaw: dipakai untuk mobil yang dikemudikan pemain lain. */
export function steerFromYaw(yawRate, speed, wheelBase, max = 0.5) {
  if (Math.abs(speed) < 0.5) return 0;
  return clamp(Math.atan((yawRate * wheelBase) / speed), -max, max);
}

/** Kemiringan badan: pitch (+ = hidung turun) dari percepatan memanjang, roll (+ = sisi kiri naik) dari percepatan menyamping. */
export function bodyTilt(accel, lateral) {
  return { pitch: clamp(-accel * 0.0042, -0.045, 0.05), roll: clamp(lateral * 0.0075, -0.05, 0.05) };
}

function plateTexture(text) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#f4f2ea';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = 4;
  g.strokeRect(3, 3, 250, 58);
  g.fillStyle = '#111';
  g.font = '700 38px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createVehicleView({ scene, fleet, envMap = null, onDoor = () => {}, mirrors = true }) {
  const legacy = carGeometries();
  const legacyDetail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2 });
  const legacyLight = new THREE.MeshBasicMaterial({ vertexColors: true });
  const env = envMap ? { envMap, envMapIntensity: 1.0 } : {};
  const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.55, ...env });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x16222c, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.4, depthWrite: false, ...env });
  const doorMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05, ...env });
  const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.55, ...env });
  const models = new Map(); // id model -> geometri bersama
  const root = new THREE.Group();
  root.name = 'armada-mobil';
  scene.add(root);
  const textures = [];
  const ownMats = [];
  const ownGeos = [];
  const steeringWheels = [];
  const rigs = new Map(); // mobil -> rig kokpit (dibuat saat pertama dikemudikan dalam mode kabin)
  let cockpitCar = null;
  let clock = 0;

  const sharedModel = (id) => {
    if (!models.has(id)) models.set(id, buildLuxuryCar(id));
    return models.get(id);
  };

  function buildLuxuryEntry(car) {
    const shared = sharedModel(car.model);
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    group.add(tilt);
    const paintMat = new THREE.MeshPhysicalMaterial({ color: car.color, roughness: 0.2, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, ...env });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xdfe3e8 });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0x3a0a0a });
    const revMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
    const sigL = new THREE.MeshBasicMaterial({ color: SIG_DIM });
    const sigR = new THREE.MeshBasicMaterial({ color: SIG_DIM });
    ownMats.push(paintMat, headMat, tailMat, revMat, sigL, sigR);
    const mesh = (geo, mat, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      tilt.add(m);
      return m;
    };
    mesh(shared.paint, paintMat);
    mesh(shared.trim, trimMat);
    mesh(shared.glass, glassMat, false);
    mesh(shared.head, headMat, false);
    mesh(shared.tail, tailMat, false);
    mesh(shared.rev, revMat, false);

    // lampu sein: kotak kecil di empat sudut; kiri (+x) dan kanan (-x) berkedip sendiri-sendiri
    const spots = SIGNAL_SPOTS[car.model];
    if (spots) {
      const half = shared.model.length / 2;
      const geo = new THREE.BoxGeometry(0.16, 0.05, 0.05);
      ownGeos.push(geo);
      for (const [mat, s] of [[sigL, 1], [sigR, -1]]) {
        for (const [spot, z] of [[spots.f, half - 0.05], [spots.r, -half + 0.05]]) {
          const m = new THREE.Mesh(geo, mat);
          m.position.set(s * spot[0], spot[1], z);
          tilt.add(m);
        }
      }
    }

    const steering = buildSteeringWheel(cockpitSpec(car.spec));
    tilt.add(steering.pivot);
    steeringWheels.push(steering);

    const wheels = shared.wheels.map((w) => {
      const pivot = new THREE.Group();
      pivot.position.set(w.x, w.y, w.z);
      const flip = new THREE.Group();
      flip.rotation.y = w.side < 0 ? Math.PI : 0;
      const spin = new THREE.Group();
      const m = new THREE.Mesh(shared.wheel, wheelMat);
      m.castShadow = true;
      spin.add(m);
      flip.add(spin);
      pivot.add(flip);
      tilt.add(pivot);
      return { ...w, pivot, spin };
    });

    const doorGeos = bakeDoors(shared.model, shared.doorSpecs, car.color); // cat dibakar per mobil
    const doors = doorGeos.map((d) => {
      const pivot = new THREE.Group();
      pivot.position.set(d.pivot.x, d.pivot.y, d.pivot.z);
      const m = new THREE.Mesh(d.geometry, doorMat);
      m.castShadow = true;
      pivot.add(m);
      tilt.add(pivot);
      return { ...d, node: pivot, angle: 0, geometry: d.geometry };
    });

    const plates = shared.plates.map((p, i) => {
      const tex = plateTexture(`NKR ${String(car.index + 1).padStart(2, '0')}`);
      if (!tex) return null;
      textures.push(tex);
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      ownMats.push(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.115), mat);
      m.position.set(p.x, p.y, p.z + (i === 0 ? 0.002 : -0.002));
      m.rotation.y = p.ry;
      tilt.add(m);
      return m;
    });
    void plates;

    group.position.set(car.x, 0, car.z);
    group.rotation.y = car.heading;
    root.add(group);
    return { car, group, tilt, luxury: true, steering, wheels, doors, headMat, tailMat, revMat, sigL, sigR, paintMat, doorGeos, spinAngle: 0, accel: 0, yaw: 0, steer: 0, brake: false, prev: null, seats: car.seats.slice(), doorTimer: car.seats.map(() => 0), manL: false, manR: false, pitch: 0, roll: 0 };
  }

  /** Mobil dari berkas GLB: badan dimuat belakangan; selama belum selesai (atau bila gagal) tampil kotak sederhana supaya tetap kelihatan dan bisa dinaiki. */
  function buildGlbEntry(car) {
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    group.add(tilt);
    group.position.set(car.x, 0, car.z);
    group.rotation.y = car.heading;
    root.add(group);
    const entry = { car, group, tilt, glb: true, luxury: false, wheels: [], loaded: null, fallback: null, disposed: false, steering: null, rig: null, driverSide: 1, manL: false, manR: false, spinAngle: 0, accel: 0, yaw: 0, steer: 0, prev: null, seats: car.seats.slice(), doorTimer: car.seats.map(() => 0), pitch: 0, roll: 0 };
    const C = car.spec;
    // Setir buatan kode (lingkar torus penuh) hanya dipasang bila model tidak punya setir asli yang dikenali (atau gagal dimuat): tidak dobel.
    const addCodeWheel = () => {
      if (entry.steering || entry.disposed) return;
      const sw = buildSteeringWheel(cockpitSpec(C));
      tilt.add(sw.pivot);
      steeringWheels.push(sw);
      entry.steering = sw;
    };
    const stub = () => {
      if (entry.fallback || entry.loaded || entry.disposed) return;
      const mat = new THREE.MeshStandardMaterial({ color: car.color, roughness: 0.3, metalness: 0.5, ...env });
      const m = new THREE.Mesh(new THREE.BoxGeometry(C.width * 0.95, C.height * 0.6, C.length * 0.97), mat);
      m.position.y = C.wheelRadius + C.height * 0.3;
      m.castShadow = true;
      tilt.add(m);
      entry.fallback = m;
    };
    loadCarGlb({ url: `${BASE}${C.glb.file}`, length: C.length, yaw: C.glb.yaw ?? 0, envMap })
      .then((res) => {
        if (entry.disposed) {
          disposeObject(res.root);
          return;
        }
        if (entry.fallback) {
          tilt.remove(entry.fallback);
          entry.fallback.geometry.dispose();
          entry.fallback.material.dispose();
          entry.fallback = null;
        }
        tilt.add(res.root);
        entry.loaded = res.root;
        entry.wheels = res.wheels;
        entry.rig = rigParts(res.root); // pintu, atap, dan bahan lampu dari namanya (kosong bila model tidak punya)
        if (res.steering) {
          // setir asli model: itu yang diputar, dan kursi pengemudi + tangan + kamera kabin dipindah tepat ke setir itu
          entry.steering = { spin: res.steering.spin, own: true };
          entry.driverSide = res.steering.center.x < 0 ? -1 : 1; // + = kiri mobil: pintu pengemudi ada di sisi setir
          if (!alignSpecToWheel(car.spec, res.steering)) console.warn('[armada] setir model tidak masuk akal, kursi katalog dipakai:', C.glb.file, res.steering.names);
        } else {
          addCodeWheel();
        }
      })
      .catch((error) => {
        console.warn('[armada] model mobil gagal dimuat:', C.glb.file, error);
        stub();
        addCodeWheel();
      });
    return entry;
  }

  function buildLegacyEntry(car) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: car.color, roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
    const body = new THREE.Mesh(legacy.body, bodyMat);
    const details = new THREE.Mesh(legacy.details, legacyDetail);
    const lights = new THREE.Mesh(legacy.lights, legacyLight);
    body.castShadow = details.castShadow = true;
    lights.castShadow = false;
    const tilt = new THREE.Group();
    tilt.add(body, details, lights);
    group.add(tilt);
    group.position.set(car.x, 0, car.z);
    group.rotation.y = car.heading;
    root.add(group);
    return { car, group, tilt, luxury: false, bodyMat };
  }

  const entries = fleet.cars.map((car) => (car.spec.glb ? buildGlbEntry(car) : car.model ? buildLuxuryEntry(car) : buildLegacyEntry(car)));

  const head = new THREE.SpotLight(0xfff1cf, 0, 70, 0.6, 0.55, 1.1);
  head.castShadow = false;
  const headTarget = new THREE.Object3D();
  scene.add(head, headTarget);
  head.target = headTarget;

  /** Kinematik bersama: percepatan, laju yaw, setir, dan kemiringan badan dihaluskan dari pose mobil. */
  function followKinematics(e, delta, mine) {
    const { car } = e;
    const C = car.spec;
    const dt = Math.max(1e-4, delta);
    if (e.prev) {
      const a = (car.speed - e.prev.speed) / dt;
      const yawRate = wrapAngle(car.heading - e.prev.heading) / dt;
      const k = 1 - Math.exp(-10 * dt);
      e.accel += (clamp(a, -40, 40) - e.accel) * k;
      e.yaw += (clamp(yawRate, -3, 3) - e.yaw) * k;
    }
    e.prev = { speed: car.speed, heading: car.heading };
    const steerTarget = car === mine ? car.steer : steerFromYaw(e.yaw, car.speed, C.wheelBase, C.maxSteer);
    e.steer += (steerTarget - e.steer) * Math.min(1, dt * 14);
    const t = bodyTilt(e.accel, car.speed * e.yaw);
    e.pitch += (t.pitch - e.pitch) * Math.min(1, dt * 6);
    e.roll += (t.roll - e.roll) * Math.min(1, dt * 6);
    e.tilt.rotation.x = e.pitch;
    e.tilt.rotation.z = e.roll;
    e.spinAngle += (car.speed * dt) / C.wheelRadius;
    return dt;
  }

  /** Suara pintu saat tombol HUD membuka/menutup (kedua jenis mobil). closeToo = ikut bunyi saat menutup (mobil GLB tidak punya sudut pintu untuk diamati). */
  function manualDoorSound(e, p, closeToo) {
    const l = Boolean(p?.doorL);
    const r = Boolean(p?.doorR);
    if (l !== e.manL) {
      e.manL = l;
      if (l || closeToo) onDoor(e.car, l);
    }
    if (r !== e.manR) {
      e.manR = r;
      if (r || closeToo) onDoor(e.car, r);
    }
  }

  function animateLuxury(e, delta, mine) {
    const { car } = e;
    const dt = followKinematics(e, delta, mine);
    const p = getParts(car); // keadaan tombol HUD pengemudi (null = perilaku lama)
    e.steering.spin.rotation.z = wheelAngle(e.steer, car.spec.maxSteer); // roda setir ikut berputar (juga terlihat dari luar)
    for (const w of e.wheels) {
      w.spin.rotation.x = e.spinAngle * w.side;
      if (w.front) w.pivot.rotation.y = e.steer;
    }

    // pintu: terbuka sebentar setiap kursi berganti penghuni, atau selama tombol pintu HUD aktif
    car.seats.forEach((s, i) => {
      if (s !== e.seats[i]) {
        e.doorTimer[i] = DOOR_OPEN_S;
        e.seats[i] = s;
        onDoor(car, true);
      }
    });
    manualDoorSound(e, p, false);
    for (const d of e.doors) {
      const manual = d.side > 0 ? p?.doorL : p?.doorR; // side + = kiri mobil
      const want = manual || d.seats.some((s) => e.doorTimer[s] > 0) ? 1 : 0;
      const before = d.angle;
      d.angle += (want - d.angle) * Math.min(1, dt * 5);
      if (before > 0.5 && d.angle <= 0.5 && !want) onDoor(car, false);
      const a = d.angle * d.open;
      if (d.axis === 'x') d.node.rotation.x = a;
      else d.node.rotation.y = d.sign * a;
    }
    for (let i = 0; i < e.doorTimer.length; i++) e.doorTimer[i] = Math.max(0, e.doorTimer[i] - dt);

    // lampu: depan mengikuti tombol Lampu (tanpa tombol: menyala bila mesin hidup); rem bila melambat/ditahan atau rem tangan; mundur bila gigi R
    const on = car.engine;
    const lightsOn = p ? p.lights : on;
    const braking = Boolean(p?.handbrake) || (on && (car === mine ? car.braking : e.accel < -2.5 || (Math.abs(car.speed) < 0.2 && car.seats[0] !== null)));
    const reversing = p ? p.reverse : on && car.speed < -0.2;
    e.headMat.color.setHex(lightsOn ? 0xfff4d2 : 0xdfe3e8);
    e.tailMat.color.setHex(braking ? 0xff3030 : on || lightsOn ? 0xa51616 : 0x3a0a0a);
    e.revMat.color.setHex(reversing ? 0xffffff : 0x555555);
    // sein dan hazard berkedip (kiri = +x)
    const blink = Math.floor(clock / BLINK_S) % 2 === 0;
    const left = Boolean(p && (p.hazard || p.indicator < 0));
    const right = Boolean(p && (p.hazard || p.indicator > 0));
    e.sigL.color.setHex(left && blink ? SIG_BRIGHT : SIG_DIM);
    e.sigR.color.setHex(right && blink ? SIG_BRIGHT : SIG_DIM);
  }

  function animateGlb(e, delta, mine) {
    const { car } = e;
    const dt = followKinematics(e, delta, mine);
    const p = getParts(car);
    if (e.steering) e.steering.spin.rotation.z = wheelAngle(e.steer, car.spec.maxSteer); // roda setir (asli model atau buatan kode) ikut berputar
    const turn = clamp(e.steer, -GLB_STEER_VISUAL, GLB_STEER_VISUAL); // ban lebar tidak menembus lengkung roda saat setir penuh
    for (const w of e.wheels) {
      w.pivot.rotation.x = e.spinAngle;
      if (w.front) w.pivot.rotation.y = turn;
    }
    // pintu terbuka sebentar saat kursi berganti penghuni (kursi genap = sisi pengemudi, ganjil = sisi sebaliknya), atau selama tombol pintu HUD aktif
    car.seats.forEach((s, i) => {
      if (s !== e.seats[i]) {
        e.doorTimer[i] = DOOR_OPEN_S;
        e.seats[i] = s;
        onDoor(car, true);
      }
    });
    const open = { L: Boolean(p?.doorL), R: Boolean(p?.doorR) };
    for (let i = 0; i < e.doorTimer.length; i++) {
      const before = e.doorTimer[i];
      e.doorTimer[i] = Math.max(0, before - dt);
      if (before > 0) {
        const side = i % 2 === 0 ? e.driverSide : -e.driverSide;
        open[side > 0 ? 'L' : 'R'] = true;
      }
      if (before > 0 && e.doorTimer[i] === 0) onDoor(car, false);
    }
    manualDoorSound(e, p, true);
    if (e.rig) {
      applyParts(e.rig, {
        doorL: open.L,
        doorR: open.R,
        roof: Boolean(p?.roof),
        lights: p ? p.lights : Boolean(car.engine),
        hazard: Boolean(p?.hazard),
        indicator: p?.indicator ?? 0,
        reverse: p ? p.reverse : Boolean(car.engine) && car.speed < -0.2,
      }, dt, clock);
    }
  }

  return {
    entries,
    /** Mode kabin: car = mobil yang kamera-nya di dalam (atau null). Rig (tangan, jam, spion) dibuat sekali per mobil. */
    setCockpit(car) {
      if (car === cockpitCar) return;
      if (cockpitCar) rigs.get(cockpitCar)?.setActive(false);
      cockpitCar = car;
      if (!car) return;
      const entry = entries.find((x) => x.car === car);
      if (!entry?.luxury && !entry?.glb) { cockpitCar = null; return; }
      if (!rigs.has(car)) rigs.set(car, createCockpitRig(entry, { mirrors }));
      rigs.get(car).setActive(true);
    },
    /** Render spion kokpit (satu per frame) sebelum render utama. */
    renderMirrors(renderer, sceneToRender = scene) {
      if (cockpitCar) rigs.get(cockpitCar)?.renderMirrors(renderer, sceneToRender);
    },
    update(delta) {
      clock += delta;
      const mine = fleet.driving;
      for (const e of entries) {
        const { car, group, tilt } = e;
        group.position.set(car.x, 0, car.z);
        group.rotation.y = car.heading;
        if (e.luxury) {
          animateLuxury(e, delta, mine);
          const rig = rigs.get(car);
          if (rig?.active) rig.update({ wheelRot: wheelAngle(e.steer, car.spec.maxSteer), hud: hudInfo(car), time: clock });
        } else if (e.glb) {
          animateGlb(e, delta, mine);
          const rig = rigs.get(car);
          if (rig?.active) rig.update({ wheelRot: wheelAngle(e.steer, car.spec.maxSteer), hud: hudInfo(car), time: clock });
        } else {
          const targetRoll = -(car.steer ?? 0) * Math.min(1, Math.abs(car.speed) / 18) * 0.06;
          tilt.rotation.z += (targetRoll - tilt.rotation.z) * Math.min(1, delta * 6);
        }
      }
      if (mine) {
        const fx = Math.sin(mine.heading);
        const fz = Math.cos(mine.heading);
        const ahead = mine.spec.length / 2 + 0.2;
        head.position.set(mine.x + fx * ahead, 0.8, mine.z + fz * ahead);
        headTarget.position.set(mine.x + fx * 22, 0, mine.z + fz * 22);
        const mp = getParts(mine);
        const lightsOn = mp ? mp.lights : true; // HUD bertahap: sorot depan mengikuti tombol Lampu; HUD lama: menyala selama mengemudi
        head.intensity += ((lightsOn ? 90 : 0) - head.intensity) * Math.min(1, delta * 5);
      } else head.intensity += (0 - head.intensity) * Math.min(1, delta * 5);
    },
    dispose() {
      scene.remove(root, head, headTarget);
      for (const r of rigs.values()) r.dispose();
      for (const w of steeringWheels) w.dispose();
      for (const e of entries) {
        if (e.bodyMat) e.bodyMat.dispose();
        if (e.doorGeos) for (const d of e.doorGeos) d.geometry.dispose();
        if (e.glb) {
          e.disposed = true; // muatan yang belum selesai dibuang begitu tiba
          if (e.loaded) disposeObject(e.loaded);
          if (e.fallback) { e.fallback.geometry.dispose(); e.fallback.material.dispose(); }
        }
      }
      for (const s of models.values()) for (const k of ['paint', 'trim', 'glass', 'head', 'tail', 'rev', 'wheel']) s[k].dispose();
      for (const g of ownGeos) g.dispose();
      for (const m of [...ownMats, trimMat, glassMat, doorMat, wheelMat, legacyDetail, legacyLight]) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}
