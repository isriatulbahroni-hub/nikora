// Pandangan kamera kabin (murni, tanpa THREE/DOM): pengemudi menoleh ke kursi penumpang atau ke belakang untuk melihat teman, lalu kembali ke jalan.
// yaw + = kiri mobil (sama dengan eyeWorld di cockpit.js), pitch + = menengadah.
//  - Geser layar = menoleh. Dilepas: pandangan kembali ke depan setelah `returnAfter` detik, kecuali pandangan DITAHAN.
//  - Tombol arah pandang (teman / belakang) menoleh halus ke arah itu dan menahannya; tombol depan melepas tahanan dan kembali ke jalan.
//  - Tombol pin menahan/melepas pandangan di arah mana pun, supaya pemain tidak perlu terus menggeser layar saat ingin melihat teman.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const LOOK = Object.freeze({
  maxYaw: 3.0, // hampir menoleh penuh ke belakang
  minPitch: -0.55,
  maxPitch: 0.6,
  returnAfter: 2.4, // detik tanpa sentuhan sebelum kembali ke depan (bila tidak ditahan)
  side: 1.15, // rad (sekitar 66 derajat): kursi penumpang di sebelah
  back: 2.85, // rad: kursi belakang dan kaca belakang
});

/** Arah menoleh ke kursi penumpang = seberang sisi setir. eyeX = x mata pengemudi (kerangka mobil, + = kiri). Setir kiri: penumpang di kanan (yaw negatif). */
export const passengerYaw = (eyeX, side = LOOK.side) => (eyeX > 0 ? -side : side);

/** Intip ke arah belokan (rad): hanya saat melihat lurus ke depan; makin menoleh makin hilang supaya tidak mengganggu. */
export const peekYaw = (steer, lookYaw) => steer * 0.35 * (1 - clamp(Math.abs(lookYaw) / 0.35, 0, 1));

export function createCabinLook(opts = {}) {
  const o = { ...LOOK, ...opts };
  const s = { yaw: 0, pitch: 0, goalYaw: null, goalPitch: 0, hold: false, idle: 0 };
  return {
    state: s,
    /** Geser layar: dYaw/dPitch dalam rad (yaw + = kiri). Menghentikan gerak otomatis. */
    drag(dYaw, dPitch) {
      s.goalYaw = null;
      s.yaw = clamp(s.yaw + dYaw, -o.maxYaw, o.maxYaw);
      s.pitch = clamp(s.pitch + dPitch, o.minPitch, o.maxPitch);
      s.idle = 0;
    },
    /** Menoleh halus ke yaw tertentu lalu menahannya. */
    glance(yaw) {
      s.goalYaw = clamp(yaw, -o.maxYaw, o.maxYaw);
      s.goalPitch = 0;
      s.hold = true;
      s.idle = 0;
    },
    /** Kembali menatap jalan dan melepas tahanan. */
    front() {
      s.hold = false;
      s.goalYaw = 0;
      s.goalPitch = 0;
      s.idle = 0;
    },
    /** Tahan/lepas pandangan di arah sekarang. Mengembalikan keadaan tahan yang baru. */
    toggleHold() {
      s.hold = !s.hold;
      s.idle = 0;
      return s.hold;
    },
    /** Reset seketika (keluar dari kamera kabin). */
    snap() {
      s.yaw = 0;
      s.pitch = 0;
      s.goalYaw = null;
      s.goalPitch = 0;
      s.hold = false;
      s.idle = 0;
    },
    step(dt) {
      s.idle += dt;
      if (s.goalYaw === null && !s.hold && (s.yaw !== 0 || s.pitch !== 0) && s.idle >= o.returnAfter) {
        s.goalYaw = 0;
        s.goalPitch = 0;
      }
      if (s.goalYaw !== null) {
        const k = 1 - Math.exp(-6 * Math.max(0, dt));
        s.yaw += (s.goalYaw - s.yaw) * k;
        s.pitch += (s.goalPitch - s.pitch) * k;
        if (Math.abs(s.goalYaw - s.yaw) < 0.002 && Math.abs(s.goalPitch - s.pitch) < 0.002) {
          s.yaw = s.goalYaw;
          s.pitch = s.goalPitch;
          s.goalYaw = null;
        }
      }
      return s;
    },
  };
}
