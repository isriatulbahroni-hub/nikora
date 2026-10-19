// Gerak pemain Mansion Horor: murni logika (tanpa THREE dan DOM), jadi bisa diuji penuh.
//
// Diport dari KantLex/yoru-no-gakko (MIT, Copyright (c) 2026 KantLex), src/06b-actors.js: updatePlayer + turnTo.
// Teks lisensi ada di docs/horor/THIRD_PARTY_NOTICES.md. Yang dibawa: dua skema kontrol, kecepatan, redaman
// langkah, dorongan mundur, tabrakan lingkaran-vs-kotak, dan siklus langkah kaki. Yang dibuang: model murid,
// animasi lengan/pedang, senter, dan semua yang terkait kendo/ofuda.
//
// Konvensi arah (sama dengan seluruh horor-*.js): rot 0 menghadap +z, maju = (sin rot, cos rot).
//
//   'tank'   : klasik survival horror. Atas = maju, bawah = mundur pelan, kiri/kanan = memutar badan.
//              Joystick layar: sumbu x memutar, sumbu y maju/mundur. Tidak bergantung kamera.
//   'modern' : relatif kamera. Pemain berbalik ke arah dorongan seperti yang terlihat dari kamera tetap, lalu berjalan.
//              Arah "dikunci" selama tombol ditahan, jadi pergantian kamera tidak membalik arah di tengah jalan
//              (ciri khas kamera tetap), sampai pemain melepas atau mengubah arah > ~40 derajat.
import { angDiff, clamp, lerp, pushOut } from './horor-core.js';

export const SPEED = Object.freeze({ walk: 1.45, run: 3.1, back: 0.85 });
export const TURN_RATE = Object.freeze({ walk: 2.8, run: 2.2 }); // rad/dtk (tank)
export const SNAP_RATE = 9; // rad/dtk: seberapa cepat badan berbalik ke arah dorongan (modern)
export const LATCH_BREAK = 0.7; // rad: perubahan arah dorongan yang melepas kunci kamera (modern)
export const PLAYER_R = 0.3;
export const SCHEMES = Object.freeze(['tank', 'modern']);

/** Layar sentuh: relatif kamera (joystick). Keyboard: tank (klasik). Bisa diganti pemain di pengaturan. */
export const defaultScheme = (isTouch) => (isTouch ? 'modern' : 'tank');
export const normalizeScheme = (s) => (s === 'modern' ? 'modern' : 'tank');

export function createPlayer({ x = 0, z = 0, rot = 0, y = 0 } = {}) {
  return { x, y, z, rot, r: PLAYER_R, speed: 0, kx: 0, kz: 0, fwdIntent: false, walk: 0, lastStep: 0, latch: null };
}

/** Arah pandang kamera tetap (rot) dari {pos, look}; menerima larik [x,y,z] maupun {x,y,z}. */
export function camYawOf(cam) {
  if (!cam) return 0;
  const g = (v, i, k) => (Array.isArray(v) ? v[i] : v[k]);
  return Math.atan2(g(cam.look, 0, 'x') - g(cam.pos, 0, 'x'), g(cam.look, 2, 'z') - g(cam.pos, 2, 'z'));
}

/** Dorongan mundur sesaat (kena serang, pintu terkunci): meluruh sendiri di stepPlayer. */
export function knockBack(p, k = 1.5) {
  p.kx = -Math.sin(p.rot) * k;
  p.kz = -Math.cos(p.rot) * k;
}

/**
 * Satu langkah gerak. `intent` = keluaran createHororInput().intent():
 *   { x, y, mag, analog, up, down, left, right, run }  (x kanan, y maju, mag 0..1, analog = hanya joystick)
 * `env`: { colliders, floorY, scheme, camYaw, frozen, turnOnly, slow }
 *   frozen = adegan/menu/mati (tak ada kendali), turnOnly = hanya boleh memutar, slow = diperlambat (mis. terpegang).
 * Mengembalikan { stepped, amp }: stepped = telapak kaki baru menyentuh lantai (mainkan suara langkah).
 */
export function stepPlayer(p, intent, dt, env = {}) {
  const { colliders = [], floorY = () => 0, scheme = 'tank', camYaw = 0, frozen = false, turnOnly = false, slow = false } = env;
  let fwd = 0;
  let turn = 0;
  if (!frozen && intent) {
    const top = intent.run ? SPEED.run : SPEED.walk;
    if (scheme === 'modern') {
      if (intent.mag > 0.05) {
        const a = Math.atan2(intent.x, intent.y);
        if (!p.latch || Math.abs(angDiff(p.latch.a, a)) > LATCH_BREAK) p.latch = { yaw: camYaw, a };
        const target = p.latch.yaw - a;
        p.rot += clamp(angDiff(p.rot, target), -SNAP_RATE * dt, SNAP_RATE * dt);
        fwd = top * intent.mag * Math.max(0, Math.cos(angDiff(p.rot, target))); // tidak mundur: berbalik dulu
      } else p.latch = null;
    } else {
      p.latch = null;
      if (intent.analog) {
        turn = -intent.x;
        fwd = intent.y > 0 ? top * intent.y : SPEED.back * intent.y;
      } else {
        turn = (intent.left ? 1 : 0) - (intent.right ? 1 : 0);
        if (intent.up) fwd = top;
        else if (intent.down) fwd = -SPEED.back;
      }
    }
    if (turnOnly) fwd = 0;
    if (slow) fwd *= 0.45;
  } else p.latch = null;

  p.fwdIntent = fwd > 0.2; // berjalan maju dengan sengaja: dibaca pembuka pintu
  p.rot += turn * (fwd > 2 ? TURN_RATE.run : TURN_RATE.walk) * dt;
  p.speed = lerp(p.speed, fwd, 1 - Math.exp(-dt * 10));
  p.x += Math.sin(p.rot) * p.speed * dt + p.kx * dt;
  p.z += Math.cos(p.rot) * p.speed * dt + p.kz * dt;
  const kd = Math.exp(-dt * 8);
  p.kx *= kd;
  p.kz *= kd;
  pushOut(p, p.r, colliders);
  p.y = lerp(p.y, floorY(p.x, p.z), 1 - Math.exp(-dt * 14));

  // siklus langkah: satu telapak tiap setengah putaran fase
  const amp = clamp(Math.abs(p.speed) / SPEED.walk, 0, 1.4);
  if (amp > 0.05) p.walk += dt * (Math.abs(p.speed) > 2 ? 10.5 : 7.4) * Math.sign(p.speed);
  const step = Math.floor(p.walk / Math.PI);
  let stepped = false;
  if (step !== p.lastStep) {
    p.lastStep = step;
    stepped = amp > 0.25;
  }
  return { stepped, amp };
}
