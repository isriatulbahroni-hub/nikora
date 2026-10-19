// Panel pilih lantai lift: muncul di layar saat pemain berdiri di dalam kabin.
const STYLE = `
#lift-panel{position:fixed;z-index:9;left:50%;top:calc(max(12px,env(safe-area-inset-top)) + 120px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 14px 12px;border-radius:18px;background:rgba(24,17,11,.84);border:1px solid rgba(224,185,92,.55);box-shadow:0 8px 28px rgba(0,0,0,.35);color:#f4e9d3;font:500 13px ui-sans-serif,system-ui,sans-serif}
#lift-panel[hidden]{display:none}
#lift-panel .lift-title{font:600 15px Georgia,serif;color:#e8c46e;letter-spacing:.02em}
#lift-panel .lift-row{display:flex;gap:10px}
#lift-panel button{min-width:48px;height:48px;border-radius:50%;border:1.5px solid #c9a24b;background:#2a1d10;color:#f4e9d3;font:600 18px Georgia,serif;cursor:pointer;touch-action:manipulation}
#lift-panel button:disabled{opacity:.45;cursor:default}
#lift-panel button[aria-current="true"]{background:#c9a24b;color:#1b1208}
#lift-panel button:focus-visible{outline:2px solid #e8c46e;outline-offset:2px}
`;

/**
 * levels = daftar lantai (0, 1, 2). onPick(level) dipanggil saat tombol lantai ditekan.
 * update({ show, level, busy }) dipanggil tiap frame; DOM hanya disentuh saat nilainya berubah.
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
  title.className = 'lift-title';
  title.textContent = 'Lift Lobi';
  const row = doc.createElement('div');
  row.className = 'lift-row';
  const status = doc.createElement('div');
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
  return {
    update({ show = false, level = 0, busy = false } = {}) {
      const k = `${show}|${level}|${busy}`;
      if (k === key) return;
      key = k;
      el.hidden = !show;
      buttons.forEach((b, i) => {
        b.disabled = levels[i] === level || busy;
        b.setAttribute('aria-current', levels[i] === level ? 'true' : 'false');
      });
      status.textContent = busy ? 'Lift sedang dipakai' : `Kamu di lantai ${level + 1}`;
    },
  };
}
