// Antarmuka TV kamar: tombol "Tonton TV" saat dekat TV, lembar untuk memilih video (link atau berkas dari HP),
// dan pemutar kecil pribadi. Pemutarnya lokal: tidak mengubah layar utama dan tidak terlihat tamu lain.
import { classifyMedia, nearestTv, MEDIA_MESSAGES } from './room-tv.js';

const CSS = `
.tv-chip{position:fixed;z-index:8;left:14px;top:calc(max(12px,env(safe-area-inset-top)) + 88px);border:0;border-radius:999px;padding:8px 14px;background:rgba(20,32,26,.88);color:#fff;font:700 13px ui-sans-serif,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.35);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.tv-chip[hidden]{display:none}
.tv-card{position:fixed;z-index:9;right:10px;top:calc(max(10px,env(safe-area-inset-top)) + 196px);width:min(52vw,260px);border-radius:14px;overflow:hidden;background:#000;border:1px solid rgba(255,255,255,.2);box-shadow:0 6px 20px rgba(0,0,0,.5)}
.tv-card.big{right:auto;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,720px)}
.tv-card[hidden]{display:none}
.tv-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 10px;background:rgba(20,32,26,.95);color:#fff;font:600 12px ui-sans-serif,sans-serif}
.tv-bar span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tv-bar button{background:none;border:0;color:#fff;font-size:16px;cursor:pointer;padding:2px 6px}
.tv-media{position:relative;width:100%;aspect-ratio:16/9;background:#000}
.tv-media iframe,.tv-media video{position:absolute;inset:0;width:100%;height:100%;border:0}
.tv-field{width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:16px ui-sans-serif,sans-serif}
.tv-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.tv-btn{border:0;border-radius:12px;padding:10px 16px;font:700 14px ui-sans-serif,sans-serif;background:#e8c46e;color:#2d210a;cursor:pointer;touch-action:manipulation}
.tv-btn.ghost{background:rgba(255,255,255,.16);color:#fff}
.tv-msg{min-height:18px;margin-top:8px;font-size:12px;opacity:.9}
.tv-hint{margin-top:4px;font-size:11px;opacity:.65}
`;

export function mountRoomTvUi({ tvs, onActive = () => {}, doc = document }) {
  if (!doc.getElementById('tv-ui-style')) {
    const style = doc.createElement('style');
    style.id = 'tv-ui-style';
    style.textContent = CSS;
    doc.head.appendChild(style);
  }
  const el = (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const chip = el('button', 'tv-chip');
  chip.type = 'button';
  chip.hidden = true;

  // lembar pemilih video (memakai gaya .sheet bawaan villa.html)
  const sheet = el('div', 'sheet');
  sheet.hidden = true;
  const head = el('div', 'sheet-head');
  const sheetTitle = el('strong');
  const sheetClose = el('button', 'sheet-close', '✕');
  sheetClose.type = 'button';
  sheetClose.setAttribute('aria-label', 'Tutup');
  head.append(sheetTitle, sheetClose);
  const field = el('input', 'tv-field');
  field.type = 'text';
  field.placeholder = 'Tempel link YouTube / TikTok / video .mp4';
  field.autocomplete = 'off';
  field.autocapitalize = 'off';
  field.spellcheck = false;
  const file = el('input');
  file.type = 'file';
  file.accept = 'video/*';
  file.hidden = true;
  const row = el('div', 'tv-row');
  const playBtn = el('button', 'tv-btn', '▶ Putar');
  playBtn.type = 'button';
  const fileBtn = el('button', 'tv-btn ghost', '📁 Pilih dari HP');
  fileBtn.type = 'button';
  row.append(playBtn, fileBtn);
  const msg = el('div', 'tv-msg');
  const hint = el('div', 'tv-hint', 'Hanya kamu yang menonton. Layar utama dan tamu lain tidak terpengaruh.');
  sheet.append(head, field, row, file, msg, hint);

  // pemutar kecil pribadi
  const card = el('div', 'tv-card');
  card.hidden = true;
  const bar = el('div', 'tv-bar');
  const barTitle = el('span');
  const barBtns = el('span');
  const sizeBtn = el('button', '', '⤢');
  sizeBtn.type = 'button';
  sizeBtn.setAttribute('aria-label', 'Perbesar atau perkecil');
  const stopBtn = el('button', '', '✕');
  stopBtn.type = 'button';
  stopBtn.setAttribute('aria-label', 'Matikan TV');
  barBtns.append(sizeBtn, stopBtn);
  bar.append(barTitle, barBtns);
  const media = el('div', 'tv-media');
  card.append(bar, media);

  doc.body.append(chip, sheet, card);

  let nearTv = null;
  let lastNear = '';
  let current = null; // { tv, objectUrl }

  // ketikan di kolom link tidak boleh menggerakkan avatar (W/A/S/D, E, M, C, V didengar di window)
  for (const type of ['keydown', 'keyup']) field.addEventListener(type, (e) => e.stopPropagation());

  const setMsg = (text) => {
    msg.textContent = text ?? '';
  };

  function refreshChip() {
    chip.hidden = !nearTv || Boolean(current);
    if (nearTv) chip.textContent = `📺 Tonton TV · ${nearTv.roomName}`;
  }

  function stop() {
    if (!current) return;
    media.replaceChildren(); // iframe/video dilepas: suara berhenti
    if (current.objectUrl) URL.revokeObjectURL(current.objectUrl);
    current = null;
    card.hidden = true;
    card.classList.remove('big');
    onActive(null);
    refreshChip();
  }

  function start(tv, node, label, objectUrl = null) {
    stop();
    media.replaceChildren(node);
    current = { tv, objectUrl };
    barTitle.textContent = `📺 ${label}`;
    card.hidden = false;
    sheet.hidden = true;
    setMsg('');
    onActive(tv.id);
    refreshChip();
  }

  function makeVideo(src) {
    const v = doc.createElement('video');
    v.src = src;
    v.controls = true;
    v.autoplay = true;
    v.playsInline = true;
    v.addEventListener('error', () => {
      stop();
      sheet.hidden = false;
      setMsg('Video tidak bisa diputar. Coba link atau berkas lain.');
    });
    return v;
  }

  function playLink() {
    const tv = nearTv;
    if (!tv) return;
    const m = classifyMedia(field.value);
    if (m.kind === 'none') return setMsg('Tempel link video dulu, atau pilih dari HP.');
    if (m.kind === 'unsupported') return setMsg(MEDIA_MESSAGES[m.reason] ?? MEDIA_MESSAGES.format);
    if (m.kind === 'video') return start(tv, makeVideo(m.src), tv.roomName);
    const frame = doc.createElement('iframe');
    frame.src = m.src;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.title = 'TV kamar';
    start(tv, frame, tv.roomName);
  }

  function openSheet() {
    if (!nearTv) return;
    sheetTitle.textContent = `TV · ${nearTv.roomName}`;
    setMsg('');
    sheet.hidden = false;
  }

  chip.addEventListener('click', openSheet);
  sheetClose.addEventListener('click', () => {
    sheet.hidden = true;
  });
  playBtn.addEventListener('click', playLink);
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') playLink();
  });
  fileBtn.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f || !nearTv) return;
    if (!f.type.startsWith('video/')) return setMsg('Pilih berkas video.');
    const url = URL.createObjectURL(f);
    start(nearTv, makeVideo(url), `${nearTv.roomName} · ${f.name.slice(0, 24)}`, url);
  });
  sizeBtn.addEventListener('click', () => card.classList.toggle('big'));
  stopBtn.addEventListener('click', stop);

  return {
    /** Dipanggil tiap frame dengan posisi pemain; hanya menyentuh DOM saat TV terdekat berubah. */
    update(me) {
      const tv = nearestTv(tvs, me);
      const key = tv ? tv.id : '';
      if (key === lastNear) return;
      lastNear = key;
      nearTv = tv;
      if (!tv) sheet.hidden = true; // menjauh dari TV: lembar pemilih ditutup (video yang sedang jalan tetap berlanjut)
      refreshChip();
    },
    stop,
    dispose() {
      stop();
      chip.remove();
      sheet.remove();
      card.remove();
    },
  };
}
