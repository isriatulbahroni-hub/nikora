// Armada mobil bersama di dunia villa: kepemilikan kursi, sinkron antar-pemain, dan fisika lokal pengemudi.
// Tanpa THREE dan tanpa jaringan sungguhan: `send` dan `receive` disambungkan ke LiveKit oleh villa-main.js.
//
// Model sinkron (tidak ada server otoritatif): pengemudi adalah pemilik mobilnya. Ia mengirim pose 10x/dtk (tidak andal)
// dan 1x/dtk lewat jalur andal bersama daftar penumpang. Pemain lain hanya menggambar (interpolasi + prediksi singkat).
// Naik/turun disiarkan andal. Pendatang baru menerima snapshot dari tiap klien yang mobilnya bergeser atau terisi.
import { CAR, BOARD_RANGE, SEAT_OFFSETS, boardVehicle, createVehicle, exitPose, findBoardable, forward, leaveVehicle, seatWorld, stepVehicle, wrapAngle } from './vehicle.js';
import { HOTEL_CAR_SPOTS } from './hotel-layout.js';
import { SEATED_DROP } from './villa-layout.js';
import { CAR_MODELS, hotelModelFor } from './car-models.js';

export const CAR_SIT_BASE = 1000; // id duduk (`sit`) di jaringan: BASE + indeks mobil * 8 + kursi
export const carSitId = (index, seat) => CAR_SIT_BASE + index * 8 + seat;
export function parseCarSit(sit) {
  if (!Number.isInteger(sit) || sit < CAR_SIT_BASE) return null;
  const n = sit - CAR_SIT_BASE;
  return { index: Math.floor(n / 8), seat: n % 8 };
}

const PALETTE = [0x1f2a36, 0xf2f2f0, 0x8e1b1b, 0x3a3f46, 0x274a7c, 0xb9bcc0, 0x1a1a1a, 0xe9e1cf];
const SEND_MS = 100;
const HEARTBEAT_MS = 1000;
const PREDICT_MAX_S = 0.25;

// Cat varian untuk salinan kedua tiap model hotel (salinan pertama memakai cat asli model).
const ALT_PAINT = Object.freeze({ royale: 0xe9e4d6, noir: 0x1a2d4a, argent: 0xe8e8ea, rubis: 0x0d0d10 });

/** Daftar mobil awal: 6 di parkir depan gerbang villa (sedan lama) dan 8 mobil mewah di drop-off/parkir hotel. */
export function defaultCars() {
  const out = [];
  let i = 0;
  for (const x of [-11, 11]) for (const z of [94, 101, 108]) out.push({ id: `villa_${i++}`, x, z, heading: 0 }); // menghadap selatan, ke jalan raya
  const hotel = [...HOTEL_CAR_SPOTS.filter((s) => s.id.startsWith('valet')), ...HOTEL_CAR_SPOTS.filter((s) => s.id.startsWith('hp_0_')).slice(0, 4)];
  hotel.forEach((s, k) => {
    const model = hotelModelFor(k);
    const color = k < Object.keys(CAR_MODELS).length ? CAR_MODELS[model].paint : ALT_PAINT[model];
    out.push({ id: `hotel_${k}`, x: s.x, z: s.z, heading: s.heading, model, color });
  });
  return out.map((c, k) => ({ ...c, color: c.color ?? PALETTE[k % PALETTE.length] }));
}

/** Tiap halaman (vila, hotel) punya ruang LiveKit sendiri, jadi masing-masing hanya membuat mobil di wilayahnya (indeks kursi dihitung per halaman). */
export const villaCars = () => defaultCars().filter((c) => c.id.startsWith('villa_'));
export const hotelCars = () => defaultCars().filter((c) => c.id.startsWith('hotel_'));

const r2 = (n) => Math.round(n * 100) / 100;

export class Fleet {
  /** send(msg, { reliable, to }) menyiarkan; now() = ms. env = { colliders, surfaceAt } untuk fisika pengemudi lokal. */
  constructor({ specs = defaultCars(), selfId = null, send = () => {}, now = () => Date.now(), env = {} } = {}) {
    this.selfId = selfId;
    this.send = send;
    this.now = now;
    this.env = env;
    this.cars = specs.map((s, index) => {
      const v = createVehicle(s);
      return Object.assign(v, { index, home: { x: s.x, z: s.z, heading: s.heading }, target: null, targetAt: 0, lastState: 0, lastBeat: 0, sent: null });
    });
    this.mine = null; // { index, seat } kursi lokal
  }

  byId(id) { return this.cars.find((c) => c.id === id) ?? null; }
  carOf(playerId) { return this.cars.find((c) => c.seats.includes(playerId)) ?? null; }
  /** Mobil yang sedang dikemudikan pemain lokal (mesin hidup + kursi 0), atau null. */
  get driving() { return this.mine && this.mine.seat === 0 ? this.cars[this.mine.index] : null; }
  get sitId() { return this.mine ? carSitId(this.mine.index, this.mine.seat) : null; }

  nearest(pos, range = BOARD_RANGE) { return findBoardable(this.cars, pos, range); }

  /** Naik ke kursi (null = kursi kosong terdekat). Mengembalikan { car, seat } atau null. */
  board(pos, carIndex = null, seat = null) {
    if (this.mine || !this.selfId) return null;
    let car;
    let s;
    if (carIndex == null) {
      const hit = this.nearest(pos);
      if (!hit) return null;
      car = hit.vehicle;
      s = hit.seat;
    } else {
      car = this.cars[carIndex];
      s = seat;
      if (!car || Math.hypot(car.x - pos.x, car.z - pos.z) > BOARD_RANGE) return null;
    }
    if (!boardVehicle(car, s, this.selfId)) return null;
    this.mine = { index: car.index, seat: s };
    car.target = null;
    this.send({ t: 'v', k: 'b', c: car.index, s }, { reliable: true });
    return { car, seat: s };
  }

  /** Turun. Mengembalikan posisi turun {x,z} atau null. Pengemudi menyiarkan pose akhir mobil (parkir). */
  leave() {
    if (!this.mine) return null;
    const car = this.cars[this.mine.index];
    const wasDriver = this.mine.seat === 0;
    const out = leaveVehicle(car, this.selfId);
    this.mine = null;
    if (!out) return null;
    this.send({ t: 'v', k: 'l', c: car.index, s: out.seat, x: r2(car.x), z: r2(car.z), h: r2(car.heading) }, { reliable: true });
    if (wasDriver) car.speed = 0;
    return { x: out.x, z: out.z };
  }

  /** Pengemudi lokal: satu langkah fisika + siaran pose. input = { throttle, steer, brake }. */
  drive(input, dt) {
    const car = this.driving;
    if (!car) return null;
    // Langkah kecil (<= 1/60 dtk) supaya mobil cepat tidak menembus tembok tipis saat frame rate rendah.
    const steps = Math.max(1, Math.ceil(dt * 60));
    let hit = 0;
    for (let i = 0; i < steps; i++) {
      stepVehicle(car, input, dt / steps, this.env);
      hit = Math.max(hit, car.hit);
    }
    car.hit = hit;
    this.#broadcast(car);
    return car;
  }

  /** Klakson pengemudi lokal (dibatasi 4x/dtk); disiarkan ke pemain lain. Mengembalikan true bila berbunyi. */
  honk() {
    const car = this.driving;
    const t = this.now();
    if (!car || t - (this.lastHonk ?? -1e9) < 250) return false;
    this.lastHonk = t;
    this.send({ t: 'v', k: 'h', c: car.index }, { reliable: true });
    this.onHorn?.(car, true);
    return true;
  }

  #payload(car, withSeats) {
    const m = { t: 'v', k: 's', c: car.index, x: r2(car.x), z: r2(car.z), h: r2(car.heading), v: r2(car.speed), e: car.engine ? 1 : 0 };
    if (withSeats) m.o = car.seats.slice();
    return m;
  }

  #broadcast(car) {
    const t = this.now();
    if (t - car.lastBeat >= HEARTBEAT_MS) {
      car.lastBeat = t;
      car.lastState = t;
      this.send(this.#payload(car, true), { reliable: true });
    } else if (t - car.lastState >= SEND_MS) {
      car.lastState = t;
      this.send(this.#payload(car, false));
    }
  }

  /** Dipanggil tiap frame: menghaluskan mobil yang dikemudikan orang lain. */
  update(dt) {
    const t = this.now();
    for (const car of this.cars) {
      if (this.driving === car || !car.target) continue;
      const age = Math.min(PREDICT_MAX_S, Math.max(0, (t - car.targetAt) / 1000));
      const f = forward(car.target.heading);
      const px = car.target.x + f.x * car.target.speed * age;
      const pz = car.target.z + f.z * car.target.speed * age;
      const k = 1 - Math.exp(-12 * dt);
      car.x += (px - car.x) * k;
      car.z += (pz - car.z) * k;
      car.heading = wrapAngle(car.heading + wrapAngle(car.target.heading - car.heading) * k);
      car.speed = car.target.speed;
    }
  }

  /** Pesan dari pemain lain (`from` = id pengirim dari LiveKit; isi pesan tidak dipercaya untuk identitas). */
  receive(from, m) {
    if (!m || m.t !== 'v' || typeof from !== 'string' || from === this.selfId) return;
    if (m.k === 'n') {
      for (const c of Array.isArray(m.cars) ? m.cars : []) this.#applySnapshot(from, c);
      return;
    }
    const car = Number.isInteger(m.c) ? this.cars[m.c] : null;
    if (!car) return;
    if (m.k === 'h') { // klakson: hanya dipercaya dari pemegang kursi pengemudi
      if (car.seats[0] === from) this.onHorn?.(car, false);
      return;
    }
    if (m.k === 'b') {
      const s = m.s;
      if (!Number.isInteger(s) || s < 0 || s >= car.seats.length) return;
      this.#evictOther(car, from);
      const holder = car.seats[s];
      if (holder === null || holder === from) car.seats[s] = from;
      else if (holder === this.selfId && from < this.selfId) this.#yield(car, s, from); // dua orang berebut kursi: id lebih besar mengalah
      else if (holder !== this.selfId && from < holder) car.seats[s] = from;
    } else if (m.k === 'l') {
      const idx = car.seats.indexOf(from);
      if (idx >= 0) car.seats[idx] = null;
      if (idx === 0) {
        car.engine = false;
        if (Number.isFinite(m.x) && Number.isFinite(m.z)) Object.assign(car, { x: m.x, z: m.z, heading: Number.isFinite(m.h) ? m.h : car.heading, speed: 0, target: null });
      }
    } else if (m.k === 's') {
      if (this.driving === car) return; // kita pengemudinya
      if (![m.x, m.z, m.h, m.v].every(Number.isFinite)) return;
      const holder = car.seats[0];
      if (holder !== from) {
        if (holder === this.selfId) return;
        this.#evictOther(car, from);
        car.seats[0] = from;
      }
      car.engine = m.e === 1;
      car.target = { x: m.x, z: m.z, heading: m.h, speed: m.v };
      car.targetAt = this.now();
      if (Array.isArray(m.o)) this.#applySeats(car, m.o, from);
    }
  }

  #applySeats(car, seats, from) {
    for (let i = 1; i < car.seats.length; i++) {
      const id = seats[i] ?? null;
      if (id === this.selfId || car.seats[i] === this.selfId) continue; // kursi kita sendiri tidak ditimpa orang lain
      car.seats[i] = typeof id === 'string' ? id : null;
    }
    void from;
  }

  #evictOther(car, from) {
    for (const other of this.cars) {
      if (other === car) continue;
      const i = other.seats.indexOf(from);
      if (i >= 0) other.seats[i] = null;
    }
    const i = car.seats.indexOf(from);
    if (i >= 0) car.seats[i] = null;
  }

  #yield(car, seat, winner) {
    car.seats[seat] = winner;
    this.mine = null;
    this.onEvicted?.();
  }

  #applySnapshot(from, c) {
    const car = Number.isInteger(c?.c) ? this.cars[c.c] : null;
    if (!car || this.driving === car || ![c.x, c.z, c.h].every(Number.isFinite)) return;
    if (car.target || car.seats.some((s) => s !== null)) return; // sudah tahu keadaannya dari sumber lebih baru
    Object.assign(car, { x: c.x, z: c.z, heading: c.h, speed: 0 });
    if (Array.isArray(c.o)) this.#applySeats(car, c.o, from);
    car.engine = car.seats[0] !== null;
  }

  /** Mobil yang berubah (bergeser dari tempat awal atau terisi), untuk dikirim ke pendatang baru. */
  snapshot() {
    return this.cars
      .filter((c) => c.seats.some((s) => s !== null) || Math.hypot(c.x - c.home.x, c.z - c.home.z) > 0.5 || Math.abs(wrapAngle(c.heading - c.home.heading)) > 0.05)
      .map((c) => ({ c: c.index, x: r2(c.x), z: r2(c.z), h: r2(c.heading), o: c.seats.slice() }));
  }

  /** Pemain keluar dunia: kursinya dikosongkan; mobil tanpa pengemudi berhenti di tempat. */
  dropPlayer(id) {
    for (const car of this.cars) {
      const i = car.seats.indexOf(id);
      if (i < 0) continue;
      car.seats[i] = null;
      if (i === 0) {
        car.engine = false;
        car.speed = 0;
        if (car.target) Object.assign(car, { x: car.target.x, z: car.target.z, heading: car.target.heading });
        car.target = null;
      }
    }
  }

  /** Pose avatar yang duduk di id duduk jaringan (untuk poseFor). Null bila bukan kursi mobil. */
  seatPose(sit) {
    const p = parseCarSit(sit);
    const car = p ? this.cars[p.index] : null;
    if (!car || p.seat >= car.seats.length || p.seat >= (car.spec?.seatOffsets ?? SEAT_OFFSETS).length) return null;
    const w = seatWorld(car, p.seat);
    return { x: w.x, z: w.z, y: SEATED_DROP + 0.12 + (car.spec?.seatLift ?? 0), rotY: w.facing, tilt: 0, snap: true };
  }

  exitFor(index, seat) { return exitPose(this.cars[index], seat); }
}

export { CAR };
