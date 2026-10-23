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

  // pedal rem dan gas di kanan bawah (layar sentuh); ditahan = ditekan. Menimpa gas/rem joystick selama ditekan.
  const pedals = { gas: 0, brake: 0 };
  const pedalBox = document.createElement('div');
  pedalBox.style.cssText = `${BASE}right:14px;bottom:18px;display:none;gap:12px;align-items:flex-end;touch-action:none`;
  const pedal = (label, key, h) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-label', `Pedal ${label}`);
    b.style.cssText = `width:62px;height:${h}px;border-radius:12px;border:1px solid #c9a24b;background:#2a2318;color:#f1e9d6;font:800 13px system-ui,sans-serif;touch-action:none;user-select:none`;
    const set = (on) => { pedals[key] = on ? 1 : 0; b.style.background = on ? '#c9a24b' : '#2a2318'; b.style.color = on ? '#1a1306' : '#f1e9d6'; };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); set(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
    return b;
  };
  pedalBox.append(pedal('REM', 'brake', 84), pedal('GAS', 'gas', 112));
  document.body.appendChild(pedalBox);
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  let shown = false;
  let isCompact = false;
  return {
    /** compact = kamera kabin: spidometer sudah ada di dasbor 3D, jadi hanya tombol klakson yang tersisa (pojok kiri bawah). */
    set(kmh, info = null, compact = false) {
      const visible = kmh !== null;
      if (visible !== shown) {
        shown = visible;
        el.style.display = visible ? 'block' : 'none';
        pedalBox.style.display = visible && coarse ? 'flex' : 'none';
        if (!visible) { pedals.gas = 0; pedals.brake = 0; }
      }
      if (!visible) return;
      if (compact !== isCompact) {
        isCompact = compact;
        for (const n of [name, row, bar]) n.style.display = compact ? 'none' : '';
        el.style.cssText = compact
          ? `${BASE}left:14px;bottom:96px;top:auto;transform:none;display:block;padding:0;background:none;border:none`
          : `${BASE}left:50%;top:60px;transform:translateX(-50%);display:block;min-width:210px;padding:8px 14px 10px;border-radius:14px;background:rgba(20,17,13,.82);border:1px solid #c9a24b;text-align:center`;
      }
      speed.textContent = String(Math.round(Math.abs(kmh)));
      name.textContent = info?.name ?? 'Mobil';
      if (!compact) gear.style.display = bar.style.display = info ? '' : 'none';
      if (info) {
        gear.textContent = String(info.gear);
        fill.style.width = `${Math.round(Math.min(1, info.rpm / info.rpmMax) * 100)}%`;
        fill.style.background = info.rpm / info.rpmMax > 0.88 ? '#d5412f' : '#c9a24b';
      }
    },
    /** Keadaan pedal layar { gas, brake } (0/1). */
    pedals: () => pedals,
    dispose: () => { el.remove(); pedalBox.remove(); },
  };
}
