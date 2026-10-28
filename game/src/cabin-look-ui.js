// Pandangan kabin hanya lewat geseran layar (tanpa tombol, supaya layar bersih): saat mengemudi dari kamera kabin, geser satu jari untuk menoleh
// (ke teman di kursi penumpang, ke belakang, menengadah). Lepas: pandangan kembali menatap jalan setelah jeda singkat.
// Logikanya ada di cabin-look.js (murni, ada tesnya); berkas ini hanya menerjemahkan geseran piksel menjadi sudut.
import { createCabinLook, peekYaw } from './cabin-look.js';

const DRAG_YAW = 0.006; // rad per piksel: geser ke kanan = menoleh ke kanan
const DRAG_PITCH = 0.005; // rad per piksel: geser ke atas = menengadah

export function mountCabinLook() {
  const look = createCabinLook();
  const s = look.state;
  let shown = false;
  return {
    /** Dipanggil tiap frame dengan keadaan kamera kabin; saat kamera kabin berakhir pandangan kembali ke depan seketika. */
    show(on) {
      if (on === shown) return;
      shown = on;
      if (!on) look.snap();
    },
    /** Tidak dipakai lagi (dulu menentukan sisi tombol Teman); dibiarkan agar pemanggil tidak perlu berubah. */
    setEyeX() {},
    /** Geseran layar dalam piksel (dx kanan, dy bawah). */
    drag(dx, dy) {
      look.drag(-dx * DRAG_YAW, -dy * DRAG_PITCH);
    },
    /** Satu frame. Mengembalikan { yaw, pitch } pandangan: yaw sudah termasuk intip ke arah belokan (steer, + = kiri) saat menatap lurus. */
    step(dt, steer = 0) {
      look.step(dt);
      return { yaw: s.yaw + peekYaw(steer, s.yaw), pitch: s.pitch };
    },
    dispose() {},
  };
}
