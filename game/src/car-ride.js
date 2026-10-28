// Perekat naik/turun/mengemudi mobil bersama (Fleet) untuk halaman mana pun (vila, hotel): satu kode, bukan salinan per halaman.
// Tanpa THREE: tampilan mobil (vehicle-view.js) dan speedometer (hotel-ui.js) diterima dari pemanggil.
//
// Dua mode kontrol, ditentukan HUD yang diberikan:
//  - HUD bertahap (punya hud.bind, yaitu car-hud.js): mesin harus dinyalakan, gigi dipilih (P/R/N/D), rem tangan, keluar hanya saat berhenti (car-state.js).
//  - HUD lama (tanpa hud.bind): perilaku semula, pengemudi naik = langsung bisa jalan.
//
// Akses dari luar (opsi access: true, dipakai hotel): mendekati mobil tidak langsung naik. Pemain membuka pintu di sisi yang didekati
// (atau bagasi) dulu, baru naik lewat pintu itu (car-access.js). Tanpa opsi itu (vila) board() tetap langsung menaikkan pemain.
//
// Efek 4D (tambahan indra, tanpa mengubah fisika): getaran mesin dan sentakan pindah gigi (haptics.js, ?getar=0 mematikan),
// lampu depan otomatis saat gelap atau hujan (car-auto-lights.js; menekan tombol lampu = pengemudi mengatur sendiri sampai turun).

import { gearFor, rpmFor } from './car-models.js';
import { mergeControls } from './cockpit.js';
import {
  blockedReason, canLeave, createCarState, driveInput, hudModel, setIndicator, shift, startEngine, stopEngine, tickEngine, toggle, toggleHandbrake,
} from './car-state.js';
import { AUTO_CLOSE_M, anyOpen, closeDoorsAndTrunk, createAccess, doorOfSeat, findAccess, tickAccess, toggleAccess } from './car-access.js';
import { partsFrom, setParts } from './car-parts.js';
import { createCrashHaptics, createEngineHaptics, engineHapticsEnabled } from './haptics.js';
import { createAutoLights, envFromGlobals } from './car-auto-lights.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const IDLE_STATE = createCarState(); // keadaan mobil tanpa pengemudi bertahap: lampu padam, mesin mati (hanya dibaca)
const ENGINE_BUZZ_AFTER_CRASH = 0.45; // detik: getaran mesin ditahan sesudah tabrakan supaya tidak memotong getaran tabrakan

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

/** Pemain sedang meminta gas (pedal gas atau dorong ke atas/W). */
export function wantsGas(rawInput, hud) {
  return Math.max(hud?.pedals?.()?.gas ?? 0, carControls(rawInput).throttle) > 0;
}

/**
 * Kontrol final satu frame: joystick/keyboard (rawInput) digabung dengan HUD layar sentuh.
 * hud.pedals() = { gas, brake, reverse }, hud.steer() = setir -1..1 (kanan = +).
 * Tanpa `state`: perilaku lama (tombol R ditahan = mundur; rem ditahan saat hampir berhenti juga = mundur).
 * Dengan `state` (car-state.js): gigi menentukan arah gas; mesin mati, P, atau rem tangan = mobil tidak bergerak.
 */
export function driveControls(rawInput, hud, speed = 0, state = null) {
  const pedals = hud?.pedals?.();
  const slide = hud?.steer?.() ?? 0;
  if (state) {
    const base = carControls(rawInput);
    const steer = slide ? carControls({ x: slide, z: 0 }).steer : base.steer;
    const gas = Math.max(pedals?.gas ?? 0, base.throttle > 0 ? base.throttle : 0);
    const brake = Boolean(pedals?.brake) || base.throttle < 0;
    return driveInput(state, { gas, brake, steer, speed });
  }
  let ctl = mergeControls(carControls(rawInput), pedals);
  if (slide) ctl = { ...ctl, steer: carControls({ x: slide, z: 0 }).steer };
  if (pedals?.reverse) ctl = { ...ctl, throttle: -1, brake: false };
  else if (pedals?.brake && !pedals.gas && speed < 0.5) ctl = { ...ctl, throttle: -1, brake: false };
  return ctl;
}

/**
 * fleet: Fleet; view: createVehicleView(); hud: mountCarHud() (atau HUD lama); exit({x,z}) -> {x,z} titik turun yang sah (bukan di dalam tembok);
 * camState: { yaw, dist, pitch } kamera orbit; isDragging(): pemain sedang/baru saja memutar kamera sendiri; toast(text).
 * access: true = naik hanya lewat pintu yang dibuka dulu (interact/prompt); false = board() langsung menaikkan pemain.
 * env: () => ({ phase, rain }) | null; fase langit (-1 siang .. +1 malam) dan hujan (0..1) untuk lampu otomatis. Bawaan membaca halaman hotel
 * (window.__hotel dan window.__weather); halaman tanpa langit itu (vila) mengembalikan null sehingga lampu tetap manual.
 */
export function createCarRide({ fleet, view, hud, audio = null, exit = (p) => p, camState = null, isDragging = () => false, isCabin = () => false, toast = () => {}, access = false, env = envFromGlobals }) {
  const geared = typeof hud?.bind === 'function';
  const states = new WeakMap(); // mobil -> keadaan pengemudi (car-state.js); hanya dipakai pada mode bertahap
  const autoLights = new WeakMap(); // mobil -> pembuat keputusan lampu otomatis; null = pengemudi mengatur lampu sendiri sampai turun
  const stateOf = (car) => {
    let s = states.get(car);
    if (!s) {
      s = createCarState();
      states.set(car, s);
    }
    return s;
  };
  const resetState = (car) => {
    states.set(car, createCarState());
    autoLights.delete(car); // pengemudi berikutnya mulai dengan lampu otomatis lagi
  };
  const accessStates = new WeakMap(); // mobil -> bukaan (pintu kiri/kanan, atap, bagasi); hanya dipakai pada mode access
  const accessOf = (car) => {
    let o = accessStates.get(car);
    if (!o) {
      o = createAccess();
      accessStates.set(car, o);
    }
    return o;
  };
  let lastCar = null; // mobil yang dikemudikan pada frame sebelumnya (keadaan dibersihkan saat tidak lagi mengemudi)
  let clock = 0;
  const crashBuzz = createCrashHaptics();
  const engineBuzz = createEngineHaptics({ enabled: engineHapticsEnabled(globalThis.location?.search ?? '', globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true) });
  let lastCrash = -1e9;
  let lastWarn = -1e9;

  /** Perintah dari HUD: { type: 'engine'|'gear'|'handbrake'|'lights'|'hazard'|'ac'|'belt'|'indicator', value }. Hanya pengemudi. */
  function act({ type, value } = {}) {
    const car = fleet.driving;
    if (!car || !geared) return;
    const st = stateOf(car);
    let r;
    if (type === 'engine') r = st.eng === 'off' ? startEngine(st, car.speed) : stopEngine(st, car.speed);
    else if (type === 'gear') r = shift(st, value, car.speed);
    else if (type === 'handbrake') r = toggleHandbrake(st);
    else if (type === 'indicator') r = setIndicator(st, value);
    else {
      if (type === 'lights') autoLights.set(car, null); // pengemudi memilih sendiri: lampu otomatis berhenti untuk mobil ini
      r = toggle(st, type);
    }
    if (r?.msg) toast(r.msg);
  }
  hud?.bind?.(act);

  /** Lampu depan otomatis: menyala (mesin hidup) saat langit gelap atau hujan, padam saat terang. Tanpa env (vila) tidak melakukan apa-apa. */
  function syncAutoLights(car, st) {
    let auto = autoLights.get(car);
    if (auto === null) return; // diatur sendiri oleh pengemudi
    const e = env?.();
    if (!e) return;
    if (!auto) {
      auto = createAutoLights();
      autoLights.set(car, auto);
    }
    st.lights = st.eng === 'on' && auto(e.phase, e.rain);
  }

  /** Sesudah fleet.board berhasil: keadaan pengemudi, kamera, dan pesan. */
  function afterBoard(r) {
    if (!r) return false;
    if (r.seat === 0) resetState(r.car);
    if (camState) {
      camState.dist = Math.max(camState.dist, 9); // kamera menjauh supaya mobil terlihat
      camState.pitch = Math.min(camState.pitch, 0.5);
    }
    if (r.seat !== 0) toast('Kamu penumpang. E = turun.');
    else if (geared) toast('Kamu di kursi pengemudi (mengemudi): tekan Nyalakan untuk menghidupkan mesin, lalu pilih gigi D. E = turun.');
    else toast('Kamu mengemudi: geser setir di kiri, pedal gas dan rem di kanan, tombol R untuk mundur (atau W/S/A/D). E = turun.');
    return true;
  }

  /** Naik ke kursi kosong terdekat, tanpa membuka pintu. Mengembalikan true bila berhasil. (Mode access: pakai interact.) */
  function board(me) {
    return afterBoard(fleet.board(me));
  }

  /** Teks tombol aksi saat berjalan kaki: 'Buka pintu kanan', 'Naik', 'Buka bagasi', 'Tutup bagasi', ... atau '' bila tidak ada mobil yang bisa diakses. */
  function prompt(me) {
    if (!access) return fleet.nearest(me) ? 'Naik' : '';
    return findAccess(fleet.cars, me, accessOf)?.plan.label ?? '';
  }

  /** Tombol aksi saat berjalan kaki. Mode access: buka/tutup pintu atau bagasi yang didekati, atau naik lewat pintu yang sudah terbuka. */
  function interact(me) {
    if (!access) return board(me);
    if (fleet.mine) return false;
    const hit = findAccess(fleet.cars, me, accessOf);
    if (!hit) return false;
    const { car, plan } = hit;
    if (plan.kind === 'board') {
      const r = fleet.board(me, car.index, plan.seat);
      if (r) accessOf(car)[plan.key] = false; // pintu menutup setelah pemain duduk
      return afterBoard(r);
    }
    const res = toggleAccess(accessOf(car), plan.key, car.speed);
    if (res.msg) toast(res.msg);
    if (res.ok) audio?.door?.(Math.hypot(car.x - me.x, car.z - me.z));
    return res.ok;
  }

  /** Turun di sisi pintu; titik turun digeser bila mengenai penghalang. Mode bertahap: hanya saat mobil sudah berhenti (force = lewati pemeriksaan). */
  function leave(me, { force = false } = {}) {
    const mine = fleet.mine;
    if (!mine) return false;
    const car = fleet.cars[mine.index];
    if (!force && geared && !canLeave(car.speed)) {
      toast('Hentikan mobil dulu sebelum keluar.');
      return false;
    }
    audio?.horn(false);
    const out = fleet.leave();
    if (!out) return false;
    if (mine.seat === 0) resetState(car);
    if (access) {
      accessOf(car)[doorOfSeat(car, mine.seat)] = true; // pintu di sisi kursi terbuka saat turun; menutup sendiri bila pemain menjauh
      audio?.door?.(0);
    }
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
    if (fleet.mine) leave(me, { force: true }); // naik sebelum tersambung: turun dulu karena id pemain berganti
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
   * Mode access, tiap frame: bukaan menutup sendiri saat mobil melaju atau pemain menjauh, lalu keadaan tampilan (pintu, bagasi, lampu, sein)
   * dipasang ke tiap mobil untuk dibaca vehicle-view.js lewat getParts.
   */
  function syncAccess(me, driving, st) {
    const mineCar = fleet.mine ? fleet.cars[fleet.mine.index] : null;
    for (const car of fleet.cars) {
      const o = accessOf(car);
      tickAccess(o, car.speed);
      if (car !== mineCar && anyOpen(o) && Math.hypot(car.x - me.x, car.z - me.z) > AUTO_CLOSE_M) closeDoorsAndTrunk(o);
      setParts(car, { ...partsFrom(car === driving && st ? st : IDLE_STATE, o), trunk: o.trunk });
    }
  }

  /**
   * Satu frame. rawInput = joystick/tombol mentah. Pengemudi menjalankan fisika; penumpang dan pengemudi dipindah ke kursinya.
   * Mengembalikan { riding, sit, facing } (facing = arah hadap avatar di kursi, atau null).
   */
  function step(me, { delta, rawInput }) {
    const driving = fleet.driving;
    if (lastCar && lastCar !== driving) resetState(lastCar); // turun, tergusur, atau pemain keluar: keadaan pengemudi dibersihkan
    lastCar = driving;
    clock += delta;
    const st = geared && driving ? stateOf(driving) : null;
    if (driving) {
      if (st) {
        if (tickEngine(st, delta)) toast('Mesin menyala. Pilih gigi D untuk maju atau R untuk mundur.');
        syncAutoLights(driving, st); // lampu otomatis (car-auto-lights.js)
        const why = wantsGas(rawInput, hud) ? blockedReason(st) : '';
        if (why && clock - lastWarn > 2.5) {
          lastWarn = clock;
          toast(why);
        }
        fleet.drive(driveControls(rawInput, hud, driving.speed, st), delta);
      } else {
        fleet.drive(driveControls(rawInput, hud, driving.speed), delta);
      }
      if (driving.hit > 6) toast('Tabrakan!');
      if (crashBuzz(driving.hit, clock)) lastCrash = clock; // HP bergetar saat menabrak (haptics.js)
      else if (clock - lastCrash > ENGINE_BUZZ_AFTER_CRASH) {
        const hi = hudInfo(driving);
        engineBuzz(clock, { on: !st || st.eng === 'on', rpmFrac: hi?.rpmMax ? hi.rpm / hi.rpmMax : 0, gear: hi?.gear ?? null }); // getaran mesin dan pindah gigi
      }
      if (camState && !isDragging()) {
        // kamera pelan-pelan berputar ke belakang mobil (konvensi kamera: yaw = heading + PI berarti kamera di belakang)
        const diff = Math.atan2(Math.sin(driving.heading + Math.PI - camState.yaw), Math.cos(driving.heading + Math.PI - camState.yaw));
        camState.yaw += diff * (1 - Math.exp(-2.2 * delta));
      }
    }
    fleet.update(delta);
    if (access) syncAccess(me, driving, st);
    view.update(delta);
    const info = driving ? hudInfo(driving) : null;
    hud.set(driving ? driving.speed * 3.6 : null, info, Boolean(driving && isCabin()));
    hud.view?.(driving && st ? hudModel(st, driving.speed, info?.gear) : null);
    audio?.engine(driving && (!st || st.eng !== 'off') ? driving : null); // mesin mati = tanpa suara mesin
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

  return { board, interact, prompt, leave, wire, step, horn, act, state: () => (fleet.driving && geared ? stateOf(fleet.driving) : null), access: accessOf };
}
