// HUD mengemudi untuk mobil mewah (DOM murni, tanpa berkas CSS). Gaya mengikuti panel hotel di hotel-ui.js.
// Sengaja minimal supaya tidak mengganggu pengemudi: lencana kecil kecepatan + gigi di kiri atas (tidak menutupi tombol),
// dan satu tombol klakson di atas tombol Naik/Turun. Gas dan rem = joystick (atas gas, bawah rem lalu mundur): tidak ada pedal terpisah.
const BASE = 'position:fixed;z-index:30;font:600 13px system-ui,sans-serif;color:#fff;';
const SAFE_TOP = 'max(12px,env(safe-area-inset-top))';
const SAFE_BOTTOM = 'max(28px,env(safe-area-inset-bottom))';

/**
 * HUD mengemudi: kecepatan (km/j) dan gigi dalam satu lencana kecil, plus tombol klakson (tahan untuk berbunyi).
 * set(kmh, info, compact) dipanggil tiap frame (kmh null = sembunyi). info = { gear } atau null.
 * compact = kamera kabin: spidometer sudah ada di dasbor 3D, jadi lencana disembunyikan dan hanya klakson yang tersisa.
 */
export function mountCarHud({ onHorn = () => {} } = {}) {
  const badge = document.createElement('div');
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-live', 'off');
  badge.style.cssText = `${BASE}left:14px;top:calc(${SAFE_TOP} + 92px);display:none;align-items:baseline;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(20,17,13,.55);pointer-events:none;text-shadow:0 1px 4px rgba(0,0,0,.6)`;
  const speed = document.createElement('span');
  speed.style.cssText = 'font:800 22px system-ui,sans-serif;color:#f1e9d6;min-width:34px;text-align:right';
  const unit = document.createElement('span');
  unit.textContent = 'km/j';
  unit.style.cssText = 'font-size:11px;color:#c9b88a';
  const gear = document.createElement('span');
  gear.style.cssText = 'font:800 13px system-ui,sans-serif;color:#1a1306;background:#c9a24b;border-radius:6px;min-width:20px;padding:1px 5px;text-align:center';
  badge.append(speed, unit, gear);
  document.body.appendChild(badge);

  const horn = document.createElement('button');
  horn.type = 'button';
  horn.textContent = 'Klakson';
  horn.setAttribute('aria-label', 'Klakson (tahan, atau tombol H)');
  horn.style.cssText = `${BASE}right:20px;bottom:calc(${SAFE_BOTTOM} + 126px);display:none;width:88px;height:44px;border-radius:12px;border:1px solid rgba(201,162,75,.8);background:rgba(42,35,24,.72);color:#f1e9d6;font:700 14px system-ui,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none`;
  const down = (e) => { e.preventDefault(); horn.style.background = '#c9a24b'; horn.style.color = '#1a1306'; onHorn(true); };
  const up = () => { horn.style.background = 'rgba(42,35,24,.72)'; horn.style.color = '#f1e9d6'; onHorn(false); };
  horn.addEventListener('pointerdown', down);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) horn.addEventListener(ev, up);
  document.body.appendChild(horn);

  // Gas/rem hanya dari joystick atau W/S; nilai nol tetap dikembalikan supaya car-ride.js/mergeControls tidak berubah.
  const pedals = { gas: 0, brake: 0 };
  let shown = false;
  return {
    set(kmh, info = null, compact = false) {
      const visible = kmh !== null;
      if (visible !== shown) {
        shown = visible;
        horn.style.display = visible ? 'block' : 'none';
        // saat mengemudi, judul dan nama tempat disembunyikan (lihat .driving di hotel.html) supaya layar bersih
        document.body.classList.toggle('driving', visible);
      }
      if (!visible) { badge.style.display = 'none'; return; }
      badge.style.display = compact ? 'none' : 'flex';
      speed.textContent = String(Math.round(Math.abs(kmh)));
      gear.style.display = info ? '' : 'none';
      if (info) gear.textContent = String(info.gear);
    },
    /** Keadaan pedal (selalu 0: tidak ada pedal layar). */
    pedals: () => pedals,
    dispose: () => { badge.remove(); horn.remove(); document.body.classList.remove('driving'); },
  };
}
