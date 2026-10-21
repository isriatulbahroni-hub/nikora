// Antarmuka ringan untuk hotel dan mobil (DOM murni, tanpa berkas CSS): panel lift dan indikator kecepatan.
const BASE = 'position:fixed;z-index:30;font:600 13px system-ui,sans-serif;color:#fff;';
const BTN = 'min-width:44px;min-height:44px;border-radius:10px;border:1px solid #c9a24b;background:#2a2318;color:#f1e9d6;font:700 14px system-ui,sans-serif;touch-action:manipulation';
const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * Panel lift untuk menara ber-lantai banyak: ketik nomor lantai, lompat cepat (±1, ±10, ±100), atau pilih lantai tujuan populer.
 * onPick(level) dipanggil dengan level (0 = Lantai 1). Panel muncul hanya saat pemain berdiri di dalam kabin.
 */
export function mountLiftPanel({ levelCount, names = [], onPick }) {
  const el = document.createElement('div');
  el.style.cssText = `${BASE}right:10px;top:50%;transform:translateY(-50%);display:none;padding:10px;border-radius:14px;background:rgba(20,17,13,.86);border:1px solid #c9a24b;box-shadow:0 6px 24px rgba(0,0,0,.4);width:230px;max-width:calc(100vw - 20px)`;
  const title = document.createElement('div');
  title.style.cssText = 'text-align:center;color:#e7c76a;margin-bottom:8px;letter-spacing:.04em';
  el.appendChild(title);

  // Nomor lantai tujuan.
  const entry = document.createElement('div');
  entry.style.cssText = 'display:flex;gap:6px;margin-bottom:8px';
  const input = document.createElement('input');
  input.type = 'number';
  input.inputMode = 'numeric';
  input.min = '1';
  input.max = String(levelCount);
  input.placeholder = `Lantai 1–${levelCount}`;
  input.setAttribute('aria-label', 'Nomor lantai tujuan');
  input.style.cssText = 'flex:1;min-width:0;min-height:44px;border-radius:10px;border:1px solid #c9a24b;background:#1a150d;color:#f1e9d6;padding:0 10px;font:700 16px system-ui,sans-serif';
  const go = document.createElement('button');
  go.type = 'button';
  go.textContent = 'Pergi';
  go.style.cssText = `${BTN};background:#c9a24b;color:#1a1306;padding:0 14px`;
  entry.append(input, go);
  el.appendChild(entry);
  const pickFloor = (floor) => {
    const n = Number(floor);
    if (!Number.isFinite(n)) return;
    onPick(clampInt(n, 1, levelCount) - 1);
    input.value = '';
  };
  go.addEventListener('click', () => pickFloor(input.value));
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // ketikan nomor tidak boleh menggerakkan avatar atau kamera
    if (e.key === 'Enter') pickFloor(input.value);
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());

  // Lompat relatif dari lantai sekarang.
  let current = 0;
  const steps = document.createElement('div');
  steps.style.cssText = 'display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-bottom:8px';
  for (const delta of [-100, -10, -1, 1, 10, 100]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = delta > 0 ? `+${delta}` : String(delta);
    b.style.cssText = `${BTN};min-width:0;padding:0;font-size:12px`;
    b.addEventListener('click', () => onPick(clampInt(current + delta, 0, levelCount - 1)));
    steps.appendChild(b);
  }
  el.appendChild(steps);

  // Tujuan populer: lobi, kamar pertama, tiap 100 lantai, dan puncak.
  const quick = document.createElement('div');
  quick.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-height:30vh;overflow-y:auto';
  const floors = [1, 2, 3, 4, 5, 50, 100, 250, 500, 750, 1000].filter((f) => f <= levelCount);
  const buttons = new Map();
  for (const floor of floors) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(floor);
    b.title = names[floor - 1] ?? '';
    b.style.cssText = BTN;
    b.addEventListener('click', () => onPick(floor - 1));
    buttons.set(floor - 1, b);
    quick.appendChild(b);
  }
  el.appendChild(quick);
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
        current = level;
        title.textContent = `LIFT · Lantai ${level + 1}${names[level] ? ` — ${names[level]}` : ''}`;
        for (const [i, b] of buttons) {
          b.style.background = i === level ? '#c9a24b' : '#2a2318';
          b.style.color = i === level ? '#1a1306' : '#f1e9d6';
        }
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
