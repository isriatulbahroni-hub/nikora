// Perekat naik/turun/mengemudi mobil bersama (Fleet) untuk halaman mana pun (vila, hotel): satu kode, bukan salinan per halaman.
// Tanpa THREE: tampilan mobil (vehicle-view.js) dan speedometer (hotel-ui.js) diterima dari pemanggil.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// README ("Rencana pemilik"): tamu tidak boleh mengemudi tanpa persetujuan admin. Peran 'owner' dan 'mc' bertanda tangan di token
// LiveKit (tidak bisa dipalsukan klien). Tamu biasa (dan offline, tanpa admin yang bisa menyetujui) ditolak sampai alur persetujuan admin ada.
const DRIVER_ROLES = Object.freeze(['owner', 'mc']);

/**
 * Joystick/tombol -> gas dan setir. Dorong ke atas = gas, ke bawah = rem lalu mundur. Setir kanan = belok kanan:
 * di vehicle.js heading yang membesar memutar mobil ke kiri (arah +x saat menghadap selatan), jadi sumbu x dibalik.
 */
export function carControls(input) {
  return { throttle: clamp(-(input.z ?? 0), -1, 1), steer: clamp(-(input.x ?? 0), -1, 1) };
}

/**
 * fleet: Fleet; view: createVehicleView(); hud: mountSpeedHud(); exit({x,z}) -> {x,z} titik turun yang sah (bukan di dalam tembok);
 * camState: { yaw, dist, pitch } kamera orbit; isDragging(): pemain sedang/baru saja memutar kamera sendiri; toast(text).
 * role: peran awal (diisi ulang dari token saat wire()); hanya 'owner' dan 'mc' boleh naik.
 */
export function createCarRide({ fleet, view, hud, exit = (p) => p, camState = null, isDragging = () => false, toast = () => {}, role: initialRole = null }) {
  let role = initialRole;
  /** Boleh memakai mobil? (tamu butuh persetujuan admin: lihat catatan di atas) */
  const canUse = () => DRIVER_ROLES.includes(role);

  /** Naik ke kursi kosong terdekat. Mengembalikan true bila berhasil. Di luar jangkauan mobil: false tanpa pesan. */
  function board(me) {
    if (!fleet.nearest(me)) return false;
    if (!canUse()) {
      toast('Mobil hanya bisa dipakai setelah disetujui admin.');
      return false;
    }
    const r = fleet.board(me);
    if (!r) return false;
    if (camState) {
      camState.dist = Math.max(camState.dist, 9); // kamera menjauh supaya mobil terlihat
      camState.pitch = Math.min(camState.pitch, 0.5);
    }
    toast(r.seat === 0 ? 'Kamu mengemudi: W/S gas dan rem, A/D belok (atau joystick). E = turun.' : 'Kamu penumpang. E = turun.');
    return true;
  }

  /** Turun di sisi pintu; titik turun digeser bila mengenai penghalang. */
  function leave(me) {
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
    role = net.role ?? 'guest';
    fleet.selfId = net.id;
    fleet.onEvicted = () => toast('Kursi itu sudah dipakai orang lain.');
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
      fleet.drive(carControls(rawInput), delta);
      if (driving.hit > 6) toast('Tabrakan!');
      if (camState && !isDragging()) {
        // kamera pelan-pelan berputar ke belakang mobil (konvensi kamera: yaw = heading + PI berarti kamera di belakang)
        const diff = Math.atan2(Math.sin(driving.heading + Math.PI - camState.yaw), Math.cos(driving.heading + Math.PI - camState.yaw));
        camState.yaw += diff * (1 - Math.exp(-2.2 * delta));
      }
    }
    fleet.update(delta);
    view.update(delta);
    hud.set(driving ? driving.speed * 3.6 : null);
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

  return { board, leave, wire, step, canUse };
}
