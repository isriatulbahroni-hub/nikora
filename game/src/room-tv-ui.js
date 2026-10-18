// Antarmuka TV kamar: tombol "Tonton TV" saat dekat TV, lembar untuk memilih video (link atau berkas dari HP),
// dan kontrol kecil. Videonya diputar DI LAYAR TV (bukan jendela mengambang): video langsung jadi tekstur layar TV
// (lewat onVideo), YouTube/TikTok (iframe) ditempel pas di layar TV tiap render. Lokal: tidak mengubah layar utama
// dan tidak terlihat tamu lain.
import { classifyMedia, nearestTv, MEDIA_MESSAGES } from './room-tv.js';
import { quadToMatrix3d } from './room-tv-quad.js';
import { tvBridge } from './room-tv-bridge.js';

const EMBED_W = 640;
const EMBED_H = 360;

const CSS = `
.tv-chip{position:fixed;z-index:8;left:14px;top:calc(max(12px,env(safe-area-inset-top)) + 88px);border:0;border-radius:999px;padding:8px 14px;background:rgba(20,32,26,.88);color:#fff;font:700 13px ui-sans-serif,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.35);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.tv-chip[hidden]{display:none}
.tv-now{position:fixed;z-index:9;left:14px;top:calc(max(12px,env(safe-area-inset-top)) + 88px);display:flex;align-items:center;gap:4px;max-width:calc(100vw - 28px);padding:4px 6px 4px 12px;border-radius:999px;background:rgba(20,32,26,.88);color:#fff;font:700 13px ui-sans-serif,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.35)}
.tv-now[hidden]{display:none}
.tv-now span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:2px}
.tv-now button{background:none;border:0;color:#fff;font-size:16px;cursor:pointer;padding:4px 7px;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.tv-stage{position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden}
.tv-embed{position:fixed;z-index:4;left:0;top:0;width:${EMBED_W}px;height:${EMBED_H}px;transform-origin:0 0;visibility:hidden;background:#000;border:0}
.tv-field{width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:16px ui-sans-serif,sans-serif}
.tv-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.tv-btn{border:0;border-radius:12px;padding:10px 16px;font:700 14px ui-sans-serif,sans-serif;background:#e8c46e;color:#2d210a;cursor:pointer;touch-action:manipulation}
.tv-btn.ghost{background:rgba(255,255,255,.16);color:#fff}
.tv-msg{min-height:18px;margin-top:8px;font-size:12px;opacity:.9}
.tv-hint{margin-top:4px;font-size:11px;opacity:.65}
`;

export function mountRoomTvUi({ tvs, onActive = () => {}, onVideo = (id, video) => tvBridge.setVideo(id, video), doc = document }) {
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

  // kontrol kecil (judul, jeda, bisu, matikan); videonya sendiri ada di layar TV
  const now = el('div', 'tv-now');
  now.hidden = true;
  const nowTitle = el('span');
  const playPause = el('button', '', '⏸');
  playPause.type = 'button';
  playPause.setAttribute('aria-label', 'Jeda atau lanjutkan');
  const muteBtn = el('button', '', '🔊');
  muteBtn.type = 'button';
  muteBtn.setAttribute('aria-label', 'Bisukan atau nyalakan suara');
  const stopBtn = el('button', '', '✕');
  stopBtn.type = 'button';
  stopBtn.setAttribute('aria-label', 'Matikan TV');
  now.append(nowTitle, playPause, muteBtn, stopBtn);
  // video disembunyikan di sini (tetap di DOM agar iOS mau memutar); iframe ditempel di layar TV
  const stage = el('div', 'tv-stage');

  doc.body.append(chip, sheet, now, stage);

  let nearTv = null;
  let lastNear = '';
  let current = null; // { tv, objectUrl, kind, node }

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
    onVideo(null, null);
    if (current.kind === 'video') current.node.pause?.();
    current.node.remove(); // iframe/video dilepas: suara berhenti
    if (current.objectUrl) URL.revokeObjectURL(current.objectUrl);
    current = null;
    now.hidden = true;
    onActive(null);
    refreshChip();
  }

  function start(tv, node, label, kind, objectUrl = null) {
    stop();
    current = { tv, objectUrl, kind, node };
    if (kind === 'video') {
      stage.append(node);
      onVideo(tv.id, node);
    } else {
      node.classList.add('tv-embed');
      doc.body.append(node);
    }
    nowTitle.textContent = `📺 ${label}`;
    playPause.hidden = kind !== 'video';
    muteBtn.hidden = kind !== 'video';
    playPause.textContent = '⏸';
    muteBtn.textContent = '🔊';
    now.hidden = false;
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
    v.setAttribute('playsinline', '');
    v.crossOrigin = 'anonymous'; // wajib agar video link luar bisa jadi tekstur WebGL (butuh header CORS dari server video)
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
    if (m.kind === 'video') return start(tv, makeVideo(m.src), tv.roomName, 'video');
    const frame = doc.createElement('iframe');
    frame.src = m.src;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.title = 'TV kamar';
    start(tv, frame, tv.roomName, 'embed');
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
    start(nearTv, makeVideo(url), `${nearTv.roomName} · ${f.name.slice(0, 24)}`, 'video', url);
  });
  playPause.addEventListener('click', () => {
    const v = current?.node;
    if (current?.kind !== 'video') return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    playPause.textContent = v.paused ? '▶' : '⏸';
  });
  muteBtn.addEventListener('click', () => {
    if (current?.kind !== 'video') return;
    current.node.muted = !current.node.muted;
    muteBtn.textContent = current.node.muted ? '🔇' : '🔊';
  });
  stopBtn.addEventListener('click', stop);

  function layout(quad) {
    if (current?.kind !== 'embed') return;
    const f = current.node;
    if (!quad) {
      f.style.visibility = 'hidden';
      return;
    }
    f.style.transform = quadToMatrix3d(quad, EMBED_W, EMBED_H);
    f.style.visibility = 'visible';
  }
  // tiap render: sudut layar TV aktif di layar HP -> iframe menempel di TV (quad null = TV tidak terlihat)
  tvBridge.onFrame = (camera, w, h) => {
    if (current?.kind === 'embed') layout(tvBridge.screenQuad(current.tv.id, camera, w, h));
  };

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
      if (tvBridge.onFrame) tvBridge.onFrame = null;
      chip.remove();
      sheet.remove();
      now.remove();
      stage.remove();
    },
  };
}
