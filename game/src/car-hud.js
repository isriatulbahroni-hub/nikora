// HUD mengemudi untuk mobil mewah (DOM murni, tanpa berkas CSS). Meniru kontrol game balap seluler: semua kecil, transparan, di tepi layar,
// supaya jalan di depan tetap terlihat. Kiri bawah: penggeser setir mendatar (lepas = kembali ke tengah). Kanan bawah: pedal rem dan gas,
// dengan tombol R (mundur) di atas pedal rem. Kiri atas: lencana kecil gigi + km/j. Tombol klakson bulat di atas penggeser setir.
// Warna mengikuti panel hotel (emas #c9a24b).
const BASE = 'position:fixed;z-index:30;font:600 13px system-ui,sans-serif;color:#fff;';
const SAFE_TOP = 'max(12px,env(safe-area-inset-top))';
const SAFE_BOTTOM = 'max(24px,env(safe-area-inset-bottom))';
const GLASS = 'rgba(20,17,13,.5)';
const RIB = 'repeating-linear-gradient(0deg,rgba(255,255,255,.34) 0 3px,rgba(255,255,255,.08) 3px 8px)';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * set(kmh, info, compact) dipanggil tiap frame (kmh null = sembunyi). info = { gear } atau null. compact tidak lagi mengubah tampilan
 * (lencana kecil tetap ada di kamera kabin, seperti game acuan); parameter dipertahankan agar car-ride.js tidak berubah.
 * pedals() = { gas, brake, reverse } (0/1); steer() = posisi penggeser setir -1..1 (kanan = +, sama dengan sumbu x joystick).
 */
export function mountCarHud({ onHorn = () => {} } = {}) {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  // lencana kecil: gigi + kecepatan
  const badge = document.createElement('div');
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-live', 'off');
  badge.style.cssText = `${BASE}left:14px;top:${SAFE_TOP};display:none;align-items:center;gap:6px;padding:3px 8px;border-radius:8px;background:${GLASS};pointer-events:none`;
  const gear = document.createElement('span');
  gear.style.cssText = 'font:800 13px system-ui,sans-serif;color:#1a1306;background:#c9a24b;border-radius:4px;min-width:22px;padding:1px 4px;text-align:center';
  const speed = document.createElement('span');
  speed.style.cssText = 'font:800 18px system-ui,sans-serif;color:#f1e9d6;min-width:32px;text-align:right;font-variant-numeric:tabular-nums';
  const unit = document.createElement('span');
  unit.textContent = 'KM/J';
  unit.style.cssText = 'font-size:9px;color:#c9b88a;letter-spacing:.06em';
  badge.append(gear, speed, unit);
  document.body.appendChild(badge);

  // klakson: tombol bulat kecil (tahan untuk berbunyi)
  const horn = document.createElement('button');
  horn.type = 'button';
  horn.innerHTML = '&#128227;';
  horn.setAttribute('aria-label', 'Klakson (tahan, atau tombol H)');
  horn.style.cssText = `${BASE}left:14px;bottom:calc(${SAFE_BOTTOM} + 70px);display:none;width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:${GLASS};font-size:20px;line-height:1;padding:0;touch-action:none;user-select:none;-webkit-user-select:none`;
  const hornOn = (on) => { horn.style.background = on ? '#c9a24b' : GLASS; };
  horn.addEventListener('pointerdown', (e) => { e.preventDefault(); hornOn(true); onHorn(true); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) horn.addEventListener(ev, () => { hornOn(false); onHorn(false); });
  document.body.appendChild(horn);

  // penggeser setir mendatar: lepas = pegas kembali ke tengah
  let steerValue = 0;
  let steerTarget = 0;
  let steerPointer = null;
  const KNOB = 44;
  const slider = document.createElement('div');
  slider.setAttribute('aria-label', 'Setir (geser kiri atau kanan)');
  slider.style.cssText = `${BASE}left:14px;bottom:${SAFE_BOTTOM};display:none;width:min(230px,46vw);height:${KNOB + 10}px;border-radius:${(KNOB + 10) / 2}px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);touch-action:none;user-select:none;-webkit-user-select:none`;
  const knob = document.createElement('div');
  knob.style.cssText = `position:absolute;top:4px;left:50%;width:${KNOB}px;height:${KNOB}px;margin-left:${-KNOB / 2}px;border-radius:50%;background:rgba(255,255,255,.82);box-shadow:0 2px 6px rgba(0,0,0,.35);pointer-events:none`;
  slider.appendChild(knob);
  const reach = () => Math.max(1, slider.clientWidth / 2 - KNOB / 2 - 5);
  const track = (e) => {
    const r = slider.getBoundingClientRect();
    steerTarget = clamp((e.clientX - (r.left + r.width / 2)) / reach(), -1, 1);
    if (Math.abs(steerTarget) < 0.04) steerTarget = 0;
  };
  slider.addEventListener('pointerdown', (e) => { e.preventDefault(); steerPointer = e.pointerId; slider.setPointerCapture?.(e.pointerId); track(e); });
  slider.addEventListener('pointermove', (e) => { if (e.pointerId === steerPointer) track(e); });
  const steerEnd = (e) => { if (e.pointerId !== steerPointer) return; steerPointer = null; steerTarget = 0; };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) slider.addEventListener(ev, steerEnd);
  document.body.appendChild(slider);

  // pedal rem (lebar, pendek) dan gas (sempit, tinggi), kanan bawah; ditahan = ditekan
  const pedals = { gas: 0, brake: 0, reverse: 0 };
  const pedalBox = document.createElement('div');
  pedalBox.style.cssText = `${BASE}right:14px;bottom:${SAFE_BOTTOM};display:none;gap:12px;align-items:flex-end;touch-action:none`;
  const pedal = (label, key, w, h) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Pedal ${label}`);
    b.style.cssText = `width:${w}px;height:${h}px;border-radius:10px;border:1px solid rgba(255,255,255,.35);background:${RIB},${GLASS};background-blend-mode:normal;padding:0;touch-action:none;user-select:none;-webkit-user-select:none`;
    const set = (on) => { pedals[key] = on ? 1 : 0; b.style.opacity = on ? '1' : '.72'; b.style.borderColor = on ? '#c9a24b' : 'rgba(255,255,255,.35)'; };
    set(false);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); set(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
    return b;
  };
  pedalBox.append(pedal('rem', 'brake', 64, 84), pedal('gas', 'gas', 46, 118));
  document.body.appendChild(pedalBox);

  // tombol R (mundur): tahan = mobil mundur; di atas pedal rem
  const rev = document.createElement('button');
  rev.type = 'button';
  rev.textContent = 'R';
  rev.setAttribute('aria-label', 'Mundur (tahan, atau tombol S)');
  rev.style.cssText = `${BASE}right:72px;bottom:calc(${SAFE_BOTTOM} + 94px);display:none;width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:${GLASS};color:#f1e9d6;font:800 18px system-ui,sans-serif;padding:0;touch-action:none;user-select:none;-webkit-user-select:none`;
  const revSet = (on) => { pedals.reverse = on ? 1 : 0; rev.style.background = on ? '#c9a24b' : GLASS; rev.style.color = on ? '#1a1306' : '#f1e9d6'; };
  rev.addEventListener('pointerdown', (e) => { e.preventDefault(); rev.setPointerCapture?.(e.pointerId); revSet(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) rev.addEventListener(ev, () => revSet(false));
  document.body.appendChild(rev);

  let shown = false;
  return {
    set(kmh, info = null) {
      const visible = kmh !== null;
      if (visible !== shown) {
        shown = visible;
        badge.style.display = visible ? 'flex' : 'none';
        horn.style.display = visible ? 'block' : 'none';
        slider.style.display = visible && coarse ? 'block' : 'none';
        pedalBox.style.display = visible && coarse ? 'flex' : 'none';
        rev.style.display = visible && coarse ? 'block' : 'none';
        // saat mengemudi: judul, nama tempat, dan joystick jalan disembunyikan (lihat body.driving di hotel.html)
        document.body.classList.toggle('driving', visible);
        if (!visible) { pedals.gas = 0; pedals.brake = 0; pedals.reverse = 0; steerValue = 0; steerTarget = 0; steerPointer = null; knob.style.transform = ''; }
      }
      if (!visible) return;
      steerValue += (steerTarget - steerValue) * (steerPointer === null ? 0.35 : 0.6); // lepas: pegas lembut ke tengah
      if (Math.abs(steerValue) < 0.005 && steerTarget === 0) steerValue = 0;
      knob.style.transform = `translateX(${(steerValue * reach()).toFixed(1)}px)`;
      speed.textContent = String(Math.round(Math.abs(kmh))).padStart(3, '0');
      gear.style.display = info ? '' : 'none';
      if (info) gear.textContent = String(info.gear);
    },
    /** Keadaan pedal layar { gas, brake, reverse } (0/1). */
    pedals: () => pedals,
    /** Posisi penggeser setir -1..1 (kanan = +). 0 bila tidak disentuh. */
    steer: () => steerValue,
    dispose: () => { badge.remove(); horn.remove(); slider.remove(); pedalBox.remove(); rev.remove(); document.body.classList.remove('driving'); },
  };
}
