// Panel pilih lantai lift: deretan tombol kecil di tepi kanan layar (seperti panel tombol di dinding kabin),
// muncul saat pemain berdiri di dalam kabin. Sengaja kecil dan tembus pandang supaya tidak menutupi pemandangan.
const STYLE = `
#lift-panel{position:fixed;z-index:9;right:calc(max(10px,env(safe-area-inset-right)) + 4px);top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;padding:8px;border-radius:22px;background:rgba(24,17,11,.5);border:1px solid rgba(224,185,92,.4);color:#f4e9d3;font:500 13px ui-sans-serif,system-ui,sans-serif;animation:lift-in .25s ease}
@keyframes lift-in{from{opacity:0}to{opacity:1}}
#lift-panel[hidden]{display:none}
#lift-panel .lift-row{display:flex;flex-direction:column-reverse;gap:8px}
#lift-panel button{width:42px;height:42px;border-radius:50%;border:1.5px solid #c9a24b;background:rgba(42,29,16,.78);color:#f4e9d3;font:600 17px Georgia,serif;cursor:pointer;touch-action:manipulation}
#lift-panel button:disabled{opacity:.45;cursor:default}
#lift-panel button[aria-current="true"]{background:#c9a24b;color:#1b1208}
#lift-panel button:focus-visible{outline:2px solid #e8c46e;outline-offset:2px}
#lift-panel .lift-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

// Panel baru disembunyikan bila sudah tidak ditampilkan selama jeda ini (berdiri di ambang kabin tidak membuatnya berkedip).
const HIDE_DELAY_MS = 250;

/**
 * levels = daftar lantai (0, 1, 2). onPick(level) dipanggil saat tombol lantai ditekan.
 * update({ show, level, busy }) dipanggil tiap frame; DOM hanya disentuh saat nilainya berubah.
 * Tombol disusun dari bawah ke atas (1 di bawah), seperti panel lift sungguhan.
 */
export function mountLiftUi({ levels = [0, 1, 2], onPick, doc = typeof document === 'undefined' ? null : document } = {}) {
  if (!doc) return { update() {} };
  const style = doc.createElement('style');
  style.textContent = STYLE;
  doc.head.appendChild(style);
  const el = doc.createElement('div');
  el.id = 'lift-panel';
  el.hidden = true;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Pilih lantai lift');
  const title = doc.createElement('div');
  title.className = 'lift-sr';
  title.textContent = 'Lift Lobi';
  const row = doc.createElement('div');
  row.className = 'lift-row';
  const status = doc.createElement('div');
  status.className = 'lift-sr';
  status.setAttribute('aria-live', 'polite');
  const buttons = levels.map((level) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = String(level + 1);
    b.setAttribute('aria-label', `Ke lantai ${level + 1}`);
    b.addEventListener('click', () => onPick?.(level));
    row.appendChild(b);
    return b;
  });
  el.append(title, row, status);
  doc.body.appendChild(el);
  let key = '';
  let lastShown = -Infinity;
  return {
    update({ show = false, level = 0, busy = false } = {}) {
      const now = performance.now();
      if (show) lastShown = now;
      const visible = show || now - lastShown < HIDE_DELAY_MS;
      const k = `${visible}|${level}|${busy}`;
      if (k === key) return;
      key = k;
      el.hidden = !visible;
      buttons.forEach((b, i) => {
        b.disabled = levels[i] === level || busy;
        b.setAttribute('aria-current', levels[i] === level ? 'true' : 'false');
      });
      status.textContent = busy ? 'Lift sedang dipakai' : `Kamu di lantai ${level + 1}`;
    },
  };
}
