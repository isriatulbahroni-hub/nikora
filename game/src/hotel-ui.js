// Antarmuka ringan untuk hotel dan mobil (DOM murni, tanpa berkas CSS): panel lift dan indikator kecepatan.
const BASE = 'position:fixed;z-index:30;font:600 13px system-ui,sans-serif;color:#fff;';

/** Panel lift: tombol tiap lantai (1..N). onPick(level) dipanggil saat tombol ditekan. */
export function mountLiftPanel({ levelCount, names = [], onPick }) {
  const el = document.createElement('div');
  el.style.cssText = `${BASE}right:10px;top:50%;transform:translateY(-50%);display:none;padding:10px;border-radius:14px;background:rgba(20,17,13,.86);border:1px solid #c9a24b;box-shadow:0 6px 24px rgba(0,0,0,.4);max-width:190px`;
  const title = document.createElement('div');
  title.style.cssText = 'text-align:center;color:#e7c76a;margin-bottom:8px;letter-spacing:.04em';
  el.appendChild(title);
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px';
  const buttons = [];
  for (let i = levelCount - 1; i >= 0; i--) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(i + 1);
    b.title = names[i] ?? '';
    b.style.cssText = 'min-width:48px;min-height:44px;border-radius:10px;border:1px solid #c9a24b;background:#2a2318;color:#f1e9d6;font:700 16px system-ui,sans-serif;touch-action:manipulation';
    b.addEventListener('click', () => onPick(i));
    buttons[i] = b;
    grid.appendChild(b);
  }
  el.appendChild(grid);
  document.body.appendChild(el);
  let shown = false;
  let lastLevel = -1;
  return {
    update(visible, level) {
      if (visible !== shown) {
        shown = visible;
        el.style.display = visible ? 'block' : 'none';
        lastLevel = -1;
      }
      if (visible && level !== lastLevel) {
        lastLevel = level;
        title.textContent = `LIFT · Lantai ${level + 1}${names[level] ? ` — ${names[level]}` : ''}`;
        buttons.forEach((b, i) => { b.style.background = i === level ? '#c9a24b' : '#2a2318'; b.style.color = i === level ? '#1a1306' : '#f1e9d6'; });
      }
    },
    dispose: () => el.remove(),
  };
}

/** Indikator kecepatan (km/j) saat mengemudi. */
export function mountSpeedHud() {
  const el = document.createElement('div');
  el.style.cssText = `${BASE}left:50%;top:64px;transform:translateX(-50%);display:none;padding:6px 14px;border-radius:12px;background:rgba(0,0,0,.55);font-size:16px`;
  document.body.appendChild(el);
  let last = '';
  return {
    set(kmh) {
      const text = kmh === null ? '' : `${Math.round(Math.abs(kmh))} km/j`;
      if (text === last) return;
      last = text;
      el.style.display = text ? 'block' : 'none';
      el.textContent = text;
    },
    dispose: () => el.remove(),
  };
}
