import { h } from '../engine/dom.js';
import { submitRsvp, loadWishes, loadGifts } from '../engine/guest-api.js';
import { enterLabel } from '../engine/world-link.js';

const VARS = {
  bg1: '--bg1', bg2: '--bg2', paper: '--paper', letter: '--letter', ink: '--ink', accent: '--accent',
  accent2: '--accent2', glow: '--glow', stageInk: '--stage-ink',
};

const DEMO_WISHES = [
  { name: 'Keluarga Pak Ahmad', wish: 'Semoga sakinah, mawaddah, warahmah.' },
  { name: 'Sinta', wish: 'Bahagia selalu, sampai jumpa di dunia pernikahan!' },
];
const DEMO_GIFTS = [
  { kind: 'bank', label: 'Bank Contoh', accountName: 'Nama Contoh', accountNo: '1234567890', qrPath: null },
  { kind: 'ewallet', label: 'E-Wallet Contoh', accountName: 'Nama Contoh', accountNo: '081234567890', qrPath: null },
];


const SVG_NS = 'http://www.w3.org/2000/svg';
const KIND_TAG = { bank: 'TRANSFER BANK', ewallet: 'E-WALLET', qris: 'QRIS' };

/** Nomor rekening dikelompokkan per 4 digit agar terbaca seperti kartu. Nilai asli (untuk salin) tidak diubah. */
export function formatAccountNo(no) {
  const raw = String(no || '').trim();
  return /^\d{8,}$/.test(raw) ? raw.replace(/(\d{4})(?=\d)/g, '$1 ') : raw;
}

function contactless() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'bc-contactless');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M8 7a7 7 0 0 1 0 10', 'M12 4.5a11 11 0 0 1 0 15', 'M16 2a15 15 0 0 1 0 20']) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Kartu bank penuh: rasio kartu asli (85,6 x 54 mm), chip emas, nomor timbul, warna dari tema. */
export function bankCard(g, { reduced = false } = {}) {
  const number = formatAccountNo(g.accountNo);
  const card = h('div', {
    class: 'bank-card', 'data-kind': g.kind, role: 'group',
    'aria-label': [g.label, g.accountName ? `atas nama ${g.accountName}` : null, g.accountNo ? `nomor ${g.accountNo}` : null].filter(Boolean).join(', '),
  },
  h('div', { class: 'bc-top' }, h('strong', { class: 'bc-brand', text: g.label }), h('span', { class: 'bc-tag', text: KIND_TAG[g.kind] || 'HADIAH' })),
  h('div', { class: 'bc-mid' }, h('span', { class: 'bc-chip', 'aria-hidden': 'true' }), contactless()),
  number ? h('div', { class: 'bc-number', text: number }) : h('div', { class: 'bc-number bc-number-qris', text: 'Pindai kode QRIS' }),
  h('div', { class: 'bc-bottom' }, h('span', { class: 'bc-holder-label', text: 'ATAS NAMA' }), h('span', { class: 'bc-holder', text: g.accountName || '' })));
  if (!reduced) {
    // Miring mengikuti jari/kursor: efek kartu fisik yang berkilau.
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
      card.style.setProperty('--rx', `${(-y * 14).toFixed(2)}deg`);
    });
    const reset = () => { card.style.removeProperty('--rx'); card.style.removeProperty('--ry'); };
    card.addEventListener('pointerleave', reset);
    card.addEventListener('pointercancel', reset);
  }
  return card;
}

const isDemo = (view) => !view.slug || view.slug === 'demo';

/** Kerangka bersama: latar tema + kartu. Mengembalikan elemen dan fungsi selesai. */
function frame(container, ctx, kind) {
  const { view } = ctx;
  const tk = view.theme.tokens;
  const stage = h('section', { class: `guest-stage guest-${kind}`, 'data-kind': kind });
  for (const [k, v] of Object.entries(VARS)) stage.style.setProperty(v, tk[k]);
  stage.style.setProperty('--font-display', view.theme.fonts.display);
  stage.style.setProperty('--font-body', view.theme.fonts.body);
  const card = h('div', { class: 'guest-card' });
  stage.append(card);
  container.append(stage);
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  return { stage, card, done, finish: () => resolve(), destroy: () => stage.remove() };
}

const heading = (eyebrow, title) => [h('p', { class: 'g-eyebrow', text: eyebrow }), h('h2', { class: 'g-title', text: title })];

/** Adegan RSVP: konfirmasi hadir + ucapan. Ucapan otomatis tampil di buku tamu. */
export function mountRsvp(container, ctx) {
  const { view } = ctx;
  const f = frame(container, ctx, 'rsvp');
  const name = h('input', { type: 'text', name: 'name', maxlength: '80', autocomplete: 'name', required: true, value: view.recipient || '', 'aria-label': 'Nama Anda' });
  const guests = h('input', { type: 'number', name: 'guests', min: '1', max: '10', value: '1', inputmode: 'numeric', 'aria-label': 'Jumlah tamu' });
  const wish = h('textarea', { name: 'wish', maxlength: '300', rows: '3', placeholder: 'Tulis ucapan dan doa (tampil di buku tamu)', 'aria-label': 'Ucapan' });
  const status = h('p', { class: 'g-status', role: 'status', 'aria-live': 'polite' });
  let attending = true;
  const yes = h('button', { type: 'button', class: 'g-choice', 'aria-pressed': 'true', text: 'Hadir' });
  const no = h('button', { type: 'button', class: 'g-choice', 'aria-pressed': 'false', text: 'Berhalangan' });
  const setAttend = (v) => {
    attending = v;
    yes.setAttribute('aria-pressed', String(v));
    no.setAttribute('aria-pressed', String(!v));
    guests.disabled = !v;
  };
  yes.addEventListener('click', () => setAttend(true));
  no.addEventListener('click', () => setAttend(false));
  const send = h('button', { type: 'submit', class: 'cta', text: 'Kirim konfirmasi' });
  const skip = h('button', { type: 'button', class: 'cta cta-ghost', text: 'Lewati', onclick: () => f.finish() });

  const form = h('form', { class: 'g-form', novalidate: true },
    h('label', {}, 'Nama', name),
    h('div', { class: 'g-choices', role: 'group', 'aria-label': 'Kehadiran' }, yes, no),
    h('label', {}, 'Jumlah tamu', guests),
    h('label', {}, 'Ucapan', wish),
    status,
    h('div', { class: 'g-actions' }, send, skip));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    send.disabled = true;
    status.textContent = 'Mengirim...';
    try {
      const input = { name: name.value, attending, guests: guests.value, wish: wish.value };
      if (isDemo(view)) {
        const { cleanRsvp } = await import('../engine/guest-api.js');
        cleanRsvp(input); // contoh: validasi saja, tidak ada data terkirim
      } else {
        await submitRsvp(view.slug, input, ctx.api || {});
      }
      form.replaceChildren(
        h('p', { class: 'g-thanks', text: attending ? 'Terima kasih, kehadiran Anda tercatat.' : 'Terima kasih sudah memberi kabar.' }),
        h('div', { class: 'g-actions' }, h('button', { type: 'button', class: 'cta', text: 'Lanjut', onclick: () => f.finish() })));
    } catch (err) {
      status.textContent = err.message || 'Gagal mengirim.';
      send.disabled = false;
    }
  });

  f.card.append(...heading('Konfirmasi hadir', view.title), form);
  return { done: f.done, destroy: f.destroy };
}

/** Adegan buku tamu: ucapan terbaru dari para tamu (hanya baca). */
export function mountGuestbook(container, ctx) {
  const { view } = ctx;
  const f = frame(container, ctx, 'bukutamu');
  const list = h('ul', { class: 'g-list' });
  const status = h('p', { class: 'g-status', role: 'status', text: 'Memuat ucapan...' });
  const next = h('button', { type: 'button', class: 'cta', text: 'Lanjut', onclick: () => f.finish() });
  f.card.append(...heading('Buku tamu', 'Ucapan dan doa'), status, list, h('div', { class: 'g-actions' }, next));

  let alive = true;
  const render = (items) => {
    if (!alive) return;
    status.textContent = items.length ? '' : 'Belum ada ucapan. Jadilah yang pertama lewat konfirmasi hadir.';
    list.replaceChildren(...items.map((i) => h('li', {}, h('strong', { text: i.name }), h('span', { text: i.wish }))));
  };
  const load = isDemo(view) ? Promise.resolve(DEMO_WISHES) : loadWishes(view.slug, ctx.api || {});
  load.then(render).catch((e) => { if (alive) status.textContent = e.message || 'Buku tamu tidak dapat dimuat.'; });

  return { done: f.done, destroy: () => { alive = false; f.destroy(); } };
}

/** Adegan hadiah: rekening / e-wallet / QRIS. Adegan dilewati otomatis bila tidak ada yang aktif. */
export function mountGifts(container, ctx) {
  const { view } = ctx;
  const f = frame(container, ctx, 'hadiah');
  f.stage.hidden = true;
  const list = h('ul', { class: 'g-list g-gifts' });
  const status = h('p', { class: 'g-status', role: 'status' });
  f.card.append(...heading('Tanda kasih', 'Hadiah untuk mempelai'), list, status,
    h('div', { class: 'g-actions' }, h('button', { type: 'button', class: 'cta', text: 'Lanjut', onclick: () => f.finish() })));

  let alive = true;
  const copy = async (text, btn) => {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Tersalin';
    } catch {
      status.textContent = `Salin manual: ${text}`;
    }
  };
  const render = (gifts) => {
    if (!alive) return;
    if (!gifts.length) { f.finish(); return; }
    f.stage.hidden = false;
    list.replaceChildren(...gifts.map((g) => h('li', { class: 'g-giftitem' },
      bankCard(g, { reduced: !!(ctx.env && ctx.env.reduced) }),
      g.accountNo ? h('button', { type: 'button', class: 'g-copy', text: 'Salin nomor', onclick: (e) => copy(g.accountNo, e.currentTarget) }) : null)));
  };
  const load = isDemo(view) ? Promise.resolve(DEMO_GIFTS) : loadGifts(view.slug, ctx.api || {});
  load.then(render).catch(() => { if (alive) f.finish(); });

  return { done: f.done, destroy: () => { alive = false; f.destroy(); } };
}

export { enterLabel };
