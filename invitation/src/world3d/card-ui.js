import { h } from '../engine/dom.js';
import { cardModel, paintCard } from './card-art.js';
import { webglAvailable } from '../scenes/envelope-auto.js';

const FONTS = ['600 40px Cin', '78px GV', 'italic 500 30px Cor'];

/** Kartu cadangan: CSS 3D memakai gambar kanvas yang sama (atau teks biasa bila kanvas tidak ada). */
function createCardCSS(stage, { models, index = 0, still = false, onFlip }) {
  let current = index, back = false, ry = 0, rx = 0;
  const card = h('div', { class: 'gc', 'data-still': still ? '1' : null });
  const sheen = h('div', { class: 'gc-sheen' });
  const faces = () => {
    const art = paintCard(models[current]);
    const m = models[current];
    if (art) {
      const url = (c) => c.toDataURL('image/jpeg', .9);
      return [h('img', { class: 'gc-face gc-front', alt: '', src: url(art.front.color), draggable: 'false' }), h('img', { class: 'gc-face gc-back', alt: '', src: url(art.back.color), draggable: 'false' })];
    }
    return [
      h('div', { class: 'gc-face gc-front gc-plain' }, h('span', { text: m.bank }), h('span', { class: 'gc-plain-no', text: m.number }), h('span', { text: m.holderUpper })),
      h('div', { class: 'gc-face gc-back gc-plain' }, h('span', { text: 'Tanda kasih' }), h('span', {}), h('span', { text: m.bank })),
    ];
  };
  const paint = () => card.replaceChildren(...faces(), sheen);
  const apply = () => { card.style.setProperty('--rx', `${rx.toFixed(1)}deg`); card.style.setProperty('--ry', `${ry.toFixed(1)}deg`); card.style.setProperty('--flip', back ? '180deg' : '0deg'); };
  paint(); apply(); const shadow = h('div', { class: 'gc-shadow' }, card); stage.append(shadow);
  const move = (e) => {
    if (still) return;
    const r = card.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
    ry = Math.max(-28, Math.min(28, px * 50)); rx = Math.max(-18, Math.min(18, -py * 34)); card.style.setProperty('--sx', `${((px + .5) * 100).toFixed(0)}%`); apply();
  };
  const leave = () => { rx = ry = 0; apply(); };
  const flip = () => { back = !back; apply(); if (onFlip) onFlip(back); };
  card.addEventListener('pointermove', move); card.addEventListener('pointerleave', leave); card.addEventListener('click', flip);
  return {
    setIndex(i) { if (i === current) return; current = i; back = false; paint(); apply(); },
    flip, isBack: () => back,
    setHidden(v) { shadow.classList.toggle('gc-off', !!v); },
    destroy() { shadow.remove(); },
  };
}

/**
 * Ganti daftar hadiah teks dengan kartu rekening emas 3D. `list` disembunyikan, bukan dihapus,
 * dan seluruh informasi (bank, nama, nomor, tombol salin) tetap tersedia sebagai teks.
 * Mengembalikan { destroy } yang memulihkan daftar semula.
 */
export async function enhanceGifts({ list, gifts, copy, env = {}, probe = webglAvailable, make3D = (st, o) => import('./card3d.js').then((m) => m.createCard3D(st, o)) }) {
  if (document.fonts && document.fonts.load) await Promise.all(FONTS.map((f) => document.fonts.load(f, 'ABC 123 Dimas').catch(() => {})));   // peramban lama: pakai huruf cadangan
  const models = gifts.map(cardModel);
  let idx = 0, api = null, mode = 'css';

  const stage = h('div', { class: 'gc-stage', role: 'group', 'aria-label': models[0].aria });
  const bank = h('strong', {}), holder = h('span', {}), no = h('code', {});
  const copyBtn = h('button', { type: 'button', class: 'g-copy', text: 'Salin nomor' });
  const flipBtn = h('button', { type: 'button', class: 'gc-flip', 'aria-pressed': 'false', text: 'Balik kartu' });
  const tabs = models.length > 1 ? h('div', { class: 'gc-tabs', role: 'tablist', 'aria-label': 'Pilih rekening' }) : null;
  const tabEls = tabs ? models.map((m, i) => h('button', { type: 'button', role: 'tab', class: 'gc-tab', 'aria-selected': String(i === 0), text: m.label })) : [];
  if (tabs) tabs.append(...tabEls);

  const info = () => {
    const m = models[idx];
    bank.textContent = m.label; holder.textContent = m.holder; holder.hidden = !m.holder;
    no.textContent = m.raw; no.hidden = !m.raw; copyBtn.hidden = !m.raw; copyBtn.textContent = 'Salin nomor';
    stage.setAttribute('aria-label', m.aria);
    tabEls.forEach((t, i) => t.setAttribute('aria-selected', String(i === idx)));
  };
  const onFlip = (b) => flipBtn.setAttribute('aria-pressed', String(b));

  // Kartu CSS SELALU tampil lebih dulu, sehingga tamu tidak pernah melihat area kosong. Kartu 3D menggantikannya
  // hanya setelah terbukti menggambar pada kanvas yang terlihat (onReady); bila gagal, kartu CSS tetap dipakai.
  // ?kartu=css memaksa kartu CSS saja (pengujian).
  const forceCss = typeof location !== 'undefined' && /(^|[?&])kartu=css(&|$)/.test(location.search || '');
  const use3D = !forceCss && !env.light && !env.reduced && probe();
  const css = createCardCSS(stage, { models, index: 0, still: !!env.reduced || !!env.light, onFlip });
  let three = null;
  api = css; stage.dataset.mode = 'css';
  const toCss = (why) => {
    if (three) { const wasBack = three.isBack(); try { three.destroy(); } catch { /* abaikan */ } three = null; if (wasBack !== css.isBack()) css.flip(); }
    css.setHidden(false); css.setIndex(idx); api = css; mode = 'css'; stage.dataset.mode = 'css'; stage.classList.remove('gc-gl');
    if (why) stage.dataset.fail = String(why);
  };
  const toThree = () => {
    if (!three) return;
    if (css.isBack()) css.flip();                                  // sisi depan, sama seperti kartu 3D yang baru tampil
    three.setIndex(idx); css.setHidden(true); api = three; mode = '3d'; stage.dataset.mode = '3d';
  };
  if (use3D) {
    try { three = await make3D(stage, { models, index: 0, onFlip, onFail: toCss, onReady: () => toThree() }); }
    catch (e) { console.warn('Kartu 3D tidak dapat dimuat, kartu CSS tetap dipakai:', e); three = null; }
  }

  tabEls.forEach((t, i) => t.addEventListener('click', () => { idx = i; css.setIndex(i); if (three) three.setIndex(i); info(); }));
  copyBtn.addEventListener('click', (e) => copy(models[idx].raw, e.currentTarget));
  flipBtn.addEventListener('click', () => api.flip());
  info();

  const ui = h('div', { class: 'gc-ui' }, stage, tabs,
    h('div', { class: 'gc-info' }, bank, holder, no),
    h('div', { class: 'gc-actions' }, copyBtn, flipBtn),
    h('p', { class: 'gc-hint', text: 'Ketuk kartu untuk membaliknya, geser untuk memiringkannya.' }));
  list.before(ui); list.hidden = true;
  return { get mode() { return mode; }, destroy() { try { if (three) three.destroy(); } catch { /* abaikan */ } css.destroy(); ui.remove(); list.hidden = false; } };
}
