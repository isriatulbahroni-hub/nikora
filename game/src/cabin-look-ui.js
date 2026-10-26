// Tombol dan gestur pandangan kabin (DOM murni, tanpa berkas CSS): saat mengemudi dari kamera kabin, pemain bisa menoleh ke teman di kursi penumpang,
// menoleh ke belakang, kembali menatap jalan, atau menahan pandangan. Logikanya ada di cabin-look.js (murni, ada tesnya); berkas ini hanya tombol dan geseran.
// Letak tombol: tengah atas layar (lanskap, di antara lencana kiri dan tombol kanan atas); layar sempit: tengah bawah, di atas tombol mesin.
import { LOOK, createCabinLook, passengerYaw, peekYaw } from './cabin-look.js';

const GOLD = '#c9a24b';
const INK = '#1a1306';
const CREAM = '#f1e9d6';
const GLASS = 'rgba(20,17,13,.5)';
const LINE = 'rgba(255,255,255,.35)';
const DRAG_YAW = 0.006; // rad per piksel: geser ke kanan = menoleh ke kanan
const DRAG_PITCH = 0.005; // rad per piksel: geser ke atas = menengadah
const NARROW = 620; // lebar layar (px) di bawah ini: tombol pindah ke tengah bawah

export function mountCabinLook() {
  const look = createCabinLook();
  const s = look.state;
  let eyeX = 0.4; // setir kiri secara bawaan; diganti lewat setEyeX dengan posisi mata pengemudi mobil yang dikemudikan
  let shown = false;

  const row = document.createElement('div');
  row.style.cssText = 'position:fixed;z-index:30;left:50%;transform:translateX(-50%);display:none;gap:4px;touch-action:manipulation;user-select:none;-webkit-user-select:none';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Pandangan kabin');

  const lit = (b, on) => {
    if (b._l === on) return;
    b._l = on;
    b.style.background = on ? GOLD : GLASS;
    b.style.color = on ? INK : CREAM;
  };
  const make = (label, aria, run) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-label', aria);
    b.style.cssText = `min-width:56px;height:32px;padding:0 8px;border-radius:8px;border:1px solid ${LINE};background:${GLASS};color:${CREAM};font:700 11px system-ui,sans-serif;touch-action:manipulation`;
    b.addEventListener('click', run);
    row.appendChild(b);
    return b;
  };
  const friend = make('Teman', 'Menoleh ke kursi penumpang', () => look.glance(passengerYaw(eyeX)));
  const back = make('Belakang', 'Menoleh ke belakang', () => look.glance(LOOK.back));
  const front = make('Depan', 'Menatap jalan', () => look.front());
  const pin = make('Tahan', 'Tahan atau lepas pandangan', () => look.toggleHold());
  document.body.appendChild(row);

  const place = () => {
    const narrow = window.innerWidth < NARROW;
    row.style.top = narrow ? '' : 'calc(max(12px,env(safe-area-inset-top)) + 8px)';
    row.style.bottom = narrow ? 'calc(max(24px,env(safe-area-inset-bottom)) + 62px)' : '';
  };
  addEventListener('resize', place);
  place();

  const at = (yaw) => s.hold && Math.abs(s.yaw - yaw) < 0.12;
  const paint = () => {
    lit(friend, at(passengerYaw(eyeX)));
    lit(back, at(LOOK.back));
    lit(front, !s.hold && Math.abs(s.yaw) < 0.05);
    lit(pin, s.hold);
  };
  paint();

  return {
    /** Tampilkan tombol hanya selama kamera kabin aktif; saat disembunyikan pandangan kembali ke depan seketika. */
    show(on) {
      if (on === shown) return;
      shown = on;
      row.style.display = on ? 'flex' : 'none';
      if (!on) {
        look.snap();
        paint();
      }
    },
    /** Posisi samping mata pengemudi (kerangka mobil, + = kiri): menentukan sisi kursi penumpang. */
    setEyeX(x) {
      if (Number.isFinite(x)) eyeX = x;
    },
    /** Geseran layar dalam piksel (dx kanan, dy bawah). */
    drag(dx, dy) {
      look.drag(-dx * DRAG_YAW, -dy * DRAG_PITCH);
    },
    /** Satu frame. Mengembalikan { yaw, pitch } pandangan: yaw sudah termasuk intip ke arah belokan (steer, + = kiri) saat menatap lurus. */
    step(dt, steer = 0) {
      look.step(dt);
      paint();
      return { yaw: s.yaw + peekYaw(steer, s.yaw), pitch: s.pitch };
    },
    dispose() {
      removeEventListener('resize', place);
      row.remove();
    },
  };
}
