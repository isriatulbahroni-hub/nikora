import { h } from './dom.js';

/**
 * Teks bergaya 3D: dipecah per kata lalu per huruf supaya tiap huruf bisa terbang masuk, melayang,
 * dan diberi ketebalan (extrude) yang mengikuti kemiringan layar. Teks asli tetap ada di aria-label
 * sehingga pembaca layar membaca satu kalimat utuh. Teks panjang tidak dipecah per huruf.
 */
export function text3d(tag, props, text, { flat = false } = {}) {
  const el = h(tag, { ...props, class: `${(props && props.class) || ''} t3d`.trim() });
  const str = String(text ?? '');
  if (flat || str.length > 64) {
    el.textContent = str;
    return el;
  }
  el.setAttribute('aria-label', str);
  let c = 0;
  str.split(/(\s+)/).forEach((part) => {
    if (!part) return;
    if (/^\s+$/.test(part)) { el.append(document.createTextNode(' ')); return; }
    const wd = h('span', { class: 'wd', 'aria-hidden': 'true' });
    for (const ch of Array.from(part)) wd.append(h('span', { class: 'ch', style: { '--c': String(c++) }, text: ch }));
    el.append(wd);
  });
  return el;
}
