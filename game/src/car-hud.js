// HUD mengemudi untuk mobil mewah (DOM murni, tanpa berkas CSS). Gaya mengikuti panel hotel di hotel-ui.js.
const BASE = 'position:fixed;z-index:30;font:600 13px system-ui,sans-serif;color:#fff;';
const BTN = 'min-width:44px;min-height:44px;border-radius:10px;border:1px solid #c9a24b;background:#2a2318;color:#f1e9d6;font:700 14px system-ui,sans-serif;touch-action:manipulation';

/**
 * HUD mengemudi untuk mobil mewah: nama model, kecepatan (km/j), gigi, batang RPM, tombol klakson (44 px, tahan untuk berbunyi).
 * set(kmh, info) dipanggil tiap frame (kmh null = sembunyi). info = { name, gear, rpm, rpmMax } atau null (hanya kecepatan).
 * Warna mengikuti panel hotel: emas #c9a24b, latar #14110d, teks #f1e9d6.
 */
export function mountCarHud({ onHorn = () => {} } = {}) {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'off');
  el.style.cssText = `${BASE}left:50%;top:60px;transform:translateX(-50%);display:none;min-width:210px;padding:8px 14px 10px;border-radius:14px;background:rgba(20,17,13,.82);border:1px solid #c9a24b;text-align:center`;
  const name = document.createElement('div');
  name.style.cssText = 'font-size:12px;letter-spacing:.08em;color:#e7c76a;text-transform:uppercase';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:baseline;justify-content:center;gap:10px';
  const speed = document.createElement('span');
  speed.style.cssText = 'font:800 30px system-ui,sans-serif;color:#f1e9d6;min-width:64px;text-align:right';
  const unit = document.createElement('span');
  unit.textContent = 'km/j';
  unit.style.cssText = 'font-size:12px;color:#c9b88a';
  const gear = document.createElement('span');
  gear.style.cssText = 'font:800 20px system-ui,sans-serif;color:#1a1306;background:#c9a24b;border-radius:8px;min-width:30px;padding:0 6px;margin-left:6px';
  row.append(speed, unit, gear);
  const bar = document.createElement('div');
  bar.style.cssText = 'height:6px;border-radius:3px;background:#2a2318;margin:6px 0 8px;overflow:hidden';
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;width:0;background:#c9a24b';
  bar.appendChild(fill);
  const horn = document.createElement('button');
  horn.type = 'button';
  horn.textContent = 'Klakson';
  horn.setAttribute('aria-label', 'Klakson (tahan, atau tombol H)');
  horn.style.cssText = `${BTN};padding:0 18px;pointer-events:auto`;
  const down = (e) => { e.preventDefault(); horn.style.background = '#c9a24b'; horn.style.color = '#1a1306'; onHorn(true); };
  const up = () => { horn.style.background = '#2a2318'; horn.style.color = '#f1e9d6'; onHorn(false); };
  horn.addEventListener('pointerdown', down);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) horn.addEventListener(ev, up);
  el.append(name, row, bar, horn);
  document.body.appendChild(el);
  let shown = false;
  return {
    set(kmh, info = null) {
      const visible = kmh !== null;
      if (visible !== shown) {
        shown = visible;
        el.style.display = visible ? 'block' : 'none';
      }
      if (!visible) return;
      speed.textContent = String(Math.round(Math.abs(kmh)));
      name.textContent = info?.name ?? 'Mobil';
      gear.style.display = bar.style.display = info ? '' : 'none';
      if (info) {
        gear.textContent = String(info.gear);
        fill.style.width = `${Math.round(Math.min(1, info.rpm / info.rpmMax) * 100)}%`;
        fill.style.background = info.rpm / info.rpmMax > 0.88 ? '#d5412f' : '#c9a24b';
      }
    },
    dispose: () => el.remove(),
  };
}
