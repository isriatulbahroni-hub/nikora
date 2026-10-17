// Antarmuka tambahan ruangan: papan nama ruangan saat masuk, tombol aksi per ruangan (mis. Baca Qur'an di Ruang Tahfidz),
// dan kartu bacaan. Berdiri sendiri: hanya membaca #place dan window.__masjid, tanpa mengubah masjid-main.js.
import { FATIHAH, ROOM_ACTIONS } from './masjid-interiors-data.js';

const $ = (id) => document.getElementById(id);
const placeEl = $('place');
const plaque = $('plaque');
const plaqueText = $('plaque-text');
const ctxbar = $('ctxbar');
const quranCard = $('quran-card');
const SKIP = new Set(['Di luar kompleks', 'Kompleks Masjid']);
let plaqueTimer = 0;

function showPlaque(name) {
  if (!plaque || !name || SKIP.has(name)) return;
  plaqueText.textContent = name;
  plaque.classList.add('show');
  clearTimeout(plaqueTimer);
  plaqueTimer = setTimeout(() => plaque.classList.remove('show'), 3200);
}

const sitIfNeeded = () => {
  const b = $('sit-button');
  if (b && b.getAttribute('aria-pressed') !== 'true') b.click();
};
const ACTIONS = {
  quran: () => {
    sitIfNeeded();
    quranCard.hidden = false;
  },
  belajar: () => sitIfNeeded(),
};

const kindNow = () => window.__masjid?.state?.().place?.kind ?? null;

function refreshActions() {
  const list = ROOM_ACTIONS[kindNow()] ?? [];
  ctxbar.replaceChildren();
  ctxbar.hidden = list.length === 0;
  if (!list.length) quranCard.hidden = true;
  for (const a of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rb';
    const ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = a.icon;
    const lb = document.createElement('span');
    lb.className = 'lb';
    lb.textContent = a.label;
    b.append(ic, lb);
    b.addEventListener('click', () => ACTIONS[a.id]?.());
    ctxbar.appendChild(b);
  }
}

const DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arabicNumber = (n) => String(n).replace(/\d/g, (d) => DIGITS[Number(d)]);

if (quranCard) {
  const box = $('quran-text');
  FATIHAH.forEach((ayah, i) => {
    const p = document.createElement('p');
    p.className = 'ayah';
    p.lang = 'ar';
    p.dir = 'rtl';
    p.textContent = `${ayah} \uFD3F${arabicNumber(i + 1)}\uFD3E`;
    box.appendChild(p);
  });
  $('quran-close').addEventListener('click', () => {
    quranCard.hidden = true;
  });
}

if (placeEl) {
  new MutationObserver(() => {
    showPlaque(placeEl.textContent);
    refreshActions();
  }).observe(placeEl, { childList: true, characterData: true, subtree: true });
}
