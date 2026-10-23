// Perekat naik/turun/mengemudi mobil bersama (Fleet) untuk halaman mana pun (vila, hotel): satu kode, bukan salinan per halaman.
// Tanpa THREE: tampilan mobil (vehicle-view.js) dan speedometer (hotel-ui.js) diterima dari pemanggil.

import { gearFor, rpmFor } from './car-models.js';
import { mergeControls } from './cockpit.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Data untuk HUD mobil bermodel: nama, gigi (R/N/1..n), RPM. Mobil tanpa model -> null (HUD hanya menampilkan kecepatan). */
export function hudInfo(car) {
  const m = car.spec?.model ? car.spec : null;
  if (!m) return null;
  const g = car.speed < -0.25 ? 'R' : gearFor(m, car.speed) || 'N';
  return { name: m.name, gear: g, rpm: Math.round(rpmFor(m, car.speed, car.throttle ?? 0, car.engine)), rpmMax: m.engine.maxRpm };
}

/**
 * Joystick/tombol -> gas dan setir. Dorong ke atas = gas, ke bawah = rem lalu mundur. Setir kanan = belok kanan:
 * di vehicle.js heading yang membesar memutar mobil ke kiri (arah +x saat menghadap selatan), jadi sumbu x dibalik.
 */
export function carControls(input) {
  return { throttle: clamp(-(input.z ?? 0), -1, 1), steer: clamp(-(input.x ?? 0), -1, 1) };
}

/**
 * Kontrol final satu frame: joystick/keyboard (rawInput) digabung dengan HUD layar sentuh.
 * hud.pedals() = { gas, brake, reverse }, hud.steer() = penggeser setir -1..1 (kanan = +).
 * Tombol R ditahan = mundur; rem ditahan saat hampir berhenti juga = mundur.
 */
export function driveControls(rawInput, hud, speed = 0) {
  const pedals = hud?.pedals?.();
  let ctl = mergeControls(carControls(rawInput), pedals);
  const slide = hud?.steer?.() ?? 0;
  if (slide) ctl = { ...ctl, steer: carControls({ x: slide, z: 0 }).steer };
  if (pedals?.reverse) ctl = { ...ctl, throttle: -1, brake: false };
  else if (pedals?.brake && !pedals.gas && speed < 0.5) ctl = { ...ctl, throttle: -1, brake: false };
  return ctl;
}

/**
 * fleet: Fleet; view: createVehicleView(); hud: mountSpeedHud(); exit({x,z}) -> {x,z} titik turun yang sah (bukan di dalam tembok);
 * camState: { yaw, dist, pitch } kamera orbit; isDragging(): pemain sedang/baru saja memutar kamera sendiri; toast(text).
 */
export function createCarRide({ fleet, view, hud, audio = null, exit = (p) => p, camState = null, isDragging = () => false, isCabin = () => false, toast = () => {} }) {
  /** Naik ke kursi kosong terdekat. Mengembalikan true bila berhasil. */
  function board(me) {
    const r = fleet.board(me);
    if (!r) return false;
    if (camState) {
      camState.dist = Math.max(camState.dist, 9); // kamera menjauh supaya mobil terlihat
      camState.pitch = Math.min(camState.pitch, 0.5);
    }
    toast(r.seat === 0 ? 'Kamu mengemudi: geser setir di kiri, pedal gas dan rem di kanan, tombol R untuk mundur (atau W/S/A/D). E = turun.' : 'Kamu penumpang. E = turun.');
    return true;
  }

  /** Turun di sisi pintu; titik turun digeser bila mengenai penghalang. */
  function leave(me) {
    audio?.horn(false);
    const out = fleet.leave();
    if (!out) return false;
    const p = exit({ x: out.x, z: out.z });
    me.x = p.x;
    me.z = p.z;
    me.level = 0;
    me.stair = null;
    me.y = 0;
    return true;
  }

  /** Sambungkan armada ke transport jaringan (LiveKit: sendCar/'car'). Tanpa transport itu mobil tetap bisa dipakai sendiri. */
  function wire(net, me) {
    if (fleet.mine) leave(me); // naik sebelum tersambung: turun dulu karena id pemain berganti
    fleet.selfId = net.id;
    fleet.onEvicted = () => toast('Kursi itu sudah dipakai orang lain.');
    fleet.onHorn = (car, local) => { if (!local) audio?.honkAt(Math.hypot(car.x - me.x, car.z - me.z)); };
    if (typeof net.sendCar !== 'function') return;
    fleet.send = (msg, opts) => net.sendCar(msg, opts);
    net.on('car', ({ from, msg }) => fleet.receive(from, msg));
    net.on('left', (m) => fleet.dropPlayer(m.id));
    net.carSnapshot = () => fleet.snapshot();
  }

  /**
   * Satu frame. rawInput = joystick/tombol mentah. Pengemudi menjalankan fisika; penumpang dan pengemudi dipindah ke kursinya.
   * Mengembalikan { riding, sit, facing } (facing = arah hadap avatar di kursi, atau null).
   */
  function step(me, { delta, rawInput }) {
    const driving = fleet.driving;
    if (driving) {
      fleet.drive(driveControls(rawInput, hud, driving.speed), delta);
      if (driving.hit > 6) toast('Tabrakan!');
      if (camState && !isDragging()) {
        // kamera pelan-pelan berputar ke belakang mobil (konvensi kamera: yaw = heading + PI berarti kamera di belakang)
        const diff = Math.atan2(Math.sin(driving.heading + Math.PI - camState.yaw), Math.cos(driving.heading + Math.PI - camState.yaw));
        camState.yaw += diff * (1 - Math.exp(-2.2 * delta));
      }
    }
    fleet.update(delta);
    view.update(delta);
    hud.set(driving ? driving.speed * 3.6 : null, driving ? hudInfo(driving) : null, Boolean(driving && isCabin()));
    audio?.engine(driving);
    const sit = fleet.sitId;
    const seatPose = sit !== null ? fleet.seatPose(sit) : null;
    if (!seatPose) return { riding: false, sit: null, facing: null };
    me.x = seatPose.x;
    me.z = seatPose.z;
    me.level = 0;
    me.stair = null;
    me.y = 0;
    return { riding: true, sit, facing: seatPose.rotY };
  }

  /** Klakson: down=true saat tombol ditekan/ditahan, false saat dilepas. Hanya pengemudi. */
  function horn(down) {
    if (!fleet.driving) { audio?.horn(false); return false; }
    if (down) { audio?.unlock(); audio?.horn(true); fleet.honk(); } else audio?.horn(false);
    return true;
  }

  return { board, leave, wire, step, horn };
}
