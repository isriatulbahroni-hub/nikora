// Editor avatar ala pemilihan hero: pratinjau 3D (putar, zoom, reset, pose) + tab pilihan + acak + foto wajah (dengan layar potong) + unduh 3D.
import * as THREE from 'three';
import './avatar-editor.css';
import './avatar-editor-clips.css';
import { ACCESSORIES, CHARACTERS, HAIR_COLORS, HAIR_STYLES, OUTFITS, SKINS, randomConfig, sanitizeConfig } from './avatar-config.js';
import { applyPose, createAvatar, setAvatarConfig } from './avatar.js';
import { FACE_STYLES, applyFacePhoto, cropSquare, faceCanvasFromImage, skinIndexFromCanvas, thumbnailDataUrl } from './avatar-face.js';
import { PREVIEW_CLIPS } from './avatar-editor-clips.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const STYLE_LABEL = { asli: 'Asli', royal: 'Royal', kartun: 'Kartun' };
const CHARACTER_ICON = ['🧍', '👩'];
const CAM = { min: 2.2, max: 5, rest: 3.5 };
export const TABS = [
  { id: 'm', label: 'Karakter', swatch: false, items: CHARACTERS.map(({ name }) => ({ name })) },
  { id: 'o', label: 'Pakaian', swatch: true, items: OUTFITS },
  { id: 's', label: 'Kulit', swatch: true, items: SKINS },
  { id: 'h', label: 'Rambut', swatch: false, items: HAIR_STYLES.map((name) => ({ name })) },
  { id: 'k', label: 'Warna', swatch: true, items: HAIR_COLORS },
  { id: 'a', label: 'Aksesori', swatch: false, items: ACCESSORIES.map((name) => ({ name })) },
];

export function createAvatarEditor({
  canvas, tabsEl, optionsEl, initial, onChange = () => {},
  photoButton = null, photoInput = null, styleButton = null, clearButton = null, exportButton = null, onFace = () => {}, onNotice = () => {},
}) {
  let cfg = sanitizeConfig(initial);
  let tab = TABS[0].id;
  let previewAct = null; // null | 'wave' | 'dance'
  let previewClip = null; // null | id klip Mixamo (anims/extra); hanya berlaku untuk model manusia
  let clock = 0;
  let renderer = null;
  let scene;
  let camera;
  let avatar;
  let raf = 0;
  let dragging = false;
  let lastX = 0;
  let last = 0;
  let camDist = CAM.rest;
  const touches = new Map();
  let pinchStart = 0;
  let pinchDist = CAM.rest;
  let photoBitmap = null; // foto asli tetap di perangkat; hanya hasil potongan yang dipakai
  let crop = { zoom: 1, offsetX: 0, offsetY: 0 };
  let face = null; // canvas wajah hasil potongan + filter
  let styleIdx = 0;
  let busy = false;
  let clearArmed = 0;
  const stage = canvas?.parentElement;

  function refreshPhotoUi() {
    const human = cfg.m > 0; // model manusia (Michelle) tidak punya wajah yang bisa diganti
    if (photoButton) {
      photoButton.hidden = human;
      photoButton.textContent = face ? 'Ganti foto 📷' : 'Foto wajah 📷';
    }
    if (styleButton) {
      styleButton.hidden = human || !face;
      styleButton.textContent = `Gaya: ${STYLE_LABEL[FACE_STYLES[styleIdx]]}`;
    }
    if (clearButton) {
      clearButton.hidden = human || !face;
      if (!clearArmed) clearButton.textContent = 'Hapus foto';
    }
  }

  function centerSelectedTab() {
    const sel = tabsEl.querySelector('[aria-selected="true"]');
    if (sel) tabsEl.scrollLeft = sel.offsetLeft - (tabsEl.clientWidth - sel.offsetWidth) / 2;
  }

  function renderOptions() {
    tabsEl.replaceChildren();
    // Model manusia tidak punya pakaian/rambut yang bisa diubah: hanya tab Karakter yang tampil.
    const visible = cfg.m > 0 ? TABS.filter((t) => t.id === 'm') : TABS;
    if (!visible.some((t) => t.id === tab)) tab = 'm';
    for (const t of visible) {
      const b = document.createElement('button');
      b.type = 'button';
      b.role = 'tab';
      b.className = 'editor-tab';
      b.textContent = t.label;
      b.setAttribute('aria-selected', String(t.id === tab));
      b.addEventListener('click', () => { tab = t.id; renderOptions(); });
      tabsEl.append(b);
    }
    centerSelectedTab();
    optionsEl.replaceChildren();
    const current = TABS.find((t) => t.id === tab);
    optionsEl.className = `editor-options ${current.swatch ? 'is-swatch' : tab === 'm' ? 'is-cards' : 'is-text'}`;
    current.items.forEach((item, index) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'editor-opt';
      b.setAttribute('aria-pressed', String(cfg[tab] === index));
      b.setAttribute('aria-label', item.name);
      b.title = item.name;
      if (current.swatch) {
        b.style.background = hex(item.hex);
      } else if (tab === 'm') {
        const icon = document.createElement('span');
        icon.className = 'opt-icon';
        icon.textContent = CHARACTER_ICON[index] ?? '🙂';
        const label = document.createElement('span');
        label.textContent = item.name;
        b.append(icon, label);
      } else {
        b.textContent = item.name;
      }
      b.addEventListener('click', () => { cfg = { ...cfg, [tab]: index }; apply(); renderOptions(); });
      optionsEl.append(b);
    });
    refreshPhotoUi();
  }

  function apply() {
    if (cfg.m === 0 && previewClip) { // avatar Sederhana tidak punya rangka Mixamo: gerakan dihentikan
      previewClip = null;
      syncPoseButtons();
    }
    if (avatar) {
      setAvatarConfig(avatar, cfg);
      if (face) applyFacePhoto(avatar, face); // rambut/aksesori dibangun ulang: foto dan posisi kacamata dipasang lagi
    }
    onChange(cfg);
  }

  async function buildFace({ pickSkin }) {
    if (!photoBitmap || busy) return;
    busy = true;
    try {
      face = await faceCanvasFromImage(photoBitmap, { ...crop, style: FACE_STYLES[styleIdx] });
      if (pickSkin) cfg = { ...cfg, s: skinIndexFromCanvas(face) }; // warna kulit mengikuti foto (dipilih saat gaya Asli)
      if (avatar) applyFacePhoto(avatar, face);
      apply();
      renderOptions();
      onFace(face);
    } catch (error) {
      console.warn('[avatar] foto wajah gagal diproses', error);
      onNotice('Foto tidak bisa dibaca. Coba foto lain.');
    } finally {
      busy = false;
    }
  }

  function clearFace() {
    photoBitmap?.close?.();
    photoBitmap = null;
    face = null;
    styleIdx = 0;
    crop = { zoom: 1, offsetX: 0, offsetY: 0 };
    if (avatar) applyFacePhoto(avatar, null);
    onFace(null);
    refreshPhotoUi();
  }

  // ---- Layar potong foto: geser + zoom sampai wajah pas di lingkaran ----
  const cropUi = (() => {
    const panel = canvas?.closest('.editor-panel');
    if (!panel) return null;
    const sheet = document.createElement('div');
    sheet.className = 'crop-sheet';
    sheet.hidden = true;
    const hint = document.createElement('p');
    hint.className = 'crop-hint';
    hint.textContent = 'Geser dan zoom sampai wajahmu pas di dalam lingkaran. Foto diproses di perangkatmu dan tidak diunggah.';
    const frameEl = document.createElement('div');
    frameEl.className = 'crop-frame';
    const cc = document.createElement('canvas');
    cc.width = 280;
    cc.height = 280;
    cc.className = 'crop-canvas';
    const ring = document.createElement('div');
    ring.className = 'crop-ring';
    frameEl.append(cc, ring);
    const zoomEl = document.createElement('input');
    zoomEl.type = 'range';
    zoomEl.min = '1';
    zoomEl.max = '3';
    zoomEl.step = '0.01';
    zoomEl.value = '1';
    zoomEl.className = 'crop-zoom';
    zoomEl.setAttribute('aria-label', 'Zoom foto');
    const actions = document.createElement('div');
    actions.className = 'crop-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'party-btn is-ghost';
    cancel.textContent = 'Batal';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'party-btn';
    ok.textContent = 'Pakai foto';
    actions.append(cancel, ok);
    sheet.append(hint, frameEl, zoomEl, actions);
    panel.append(sheet);

    let bmp = null;
    let st = { zoom: 1, offsetX: 0, offsetY: 0 };
    let drag = null;
    const draw = () => {
      const ctx = cc.getContext('2d');
      const { side, sx, sy } = cropSquare(bmp.width, bmp.height, st);
      ctx.clearRect(0, 0, cc.width, cc.height);
      ctx.drawImage(bmp, sx, sy, side, side, 0, 0, cc.width, cc.height);
    };
    const close = (keep) => {
      sheet.hidden = true;
      if (!keep) bmp?.close?.();
      bmp = null;
    };
    cc.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; cc.setPointerCapture(e.pointerId); });
    cc.addEventListener('pointermove', (e) => {
      if (!drag || !bmp) return;
      const { side } = cropSquare(bmp.width, bmp.height, st);
      const k = (cc.width / cc.getBoundingClientRect().width) * (side / cc.width); // piksel layar -> piksel gambar
      const rx = (bmp.width - side) / 2;
      const ry = (bmp.height - side) / 2;
      if (rx > 0) st.offsetX = Math.max(-1, Math.min(1, st.offsetX - ((e.clientX - drag.x) * k) / rx));
      if (ry > 0) st.offsetY = Math.max(-1, Math.min(1, st.offsetY - ((e.clientY - drag.y) * k) / ry));
      drag = { x: e.clientX, y: e.clientY };
      draw();
    });
    ['pointerup', 'pointercancel'].forEach((t) => cc.addEventListener(t, () => { drag = null; }));
    zoomEl.addEventListener('input', () => { st.zoom = Number(zoomEl.value); if (bmp) draw(); });
    cc.addEventListener('wheel', (e) => {
      e.preventDefault();
      st.zoom = Math.max(1, Math.min(3, st.zoom * (1 - Math.sign(e.deltaY) * 0.06)));
      zoomEl.value = String(st.zoom);
      if (bmp) draw();
    }, { passive: false });
    cancel.addEventListener('click', () => close(false));
    ok.addEventListener('click', () => {
      photoBitmap?.close?.();
      photoBitmap = bmp;
      crop = { ...st };
      styleIdx = 0;
      close(true);
      buildFace({ pickSkin: true });
    });
    return {
      open(bitmap) {
        bmp = bitmap;
        st = { zoom: 1, offsetX: 0, offsetY: 0 };
        zoomEl.value = '1';
        sheet.hidden = false;
        draw();
      },
    };
  })();

  photoButton?.addEventListener('click', () => photoInput?.click());
  photoInput?.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    photoInput.value = ''; // supaya foto yang sama bisa dipilih lagi
    if (!file) return;
    if (!file.type.startsWith('image/')) { onNotice('Pilih berkas gambar.'); return; }
    try {
      const bitmap = await createImageBitmap(file); // arah foto (EXIF) diikuti browser
      if (cropUi) cropUi.open(bitmap);
      else { photoBitmap = bitmap; styleIdx = 0; buildFace({ pickSkin: true }); }
    } catch (error) {
      console.warn('[avatar] foto tidak bisa dibuka', error);
      onNotice('Foto tidak bisa dibaca. Coba foto lain.');
    }
  });
  styleButton?.addEventListener('click', () => {
    styleIdx = (styleIdx + 1) % FACE_STYLES.length;
    buildFace({ pickSkin: false });
  });
  clearButton?.addEventListener('click', () => {
    if (!clearArmed) { // ketuk dua kali: pertama minta konfirmasi, kedua menghapus
      clearButton.textContent = 'Yakin hapus?';
      clearArmed = window.setTimeout(() => { clearArmed = 0; refreshPhotoUi(); }, 3000);
      return;
    }
    window.clearTimeout(clearArmed);
    clearArmed = 0;
    clearFace();
  });
  exportButton?.addEventListener('click', async () => {
    if (!avatar) { onNotice('Pratinjau 3D tidak tersedia di perangkat ini.'); return; }
    try {
      const { downloadAvatarGLB } = await import('./avatar-export.js'); // dimuat hanya saat dibutuhkan
      await downloadAvatarGLB(avatar, 'avatar-orbit');
    } catch (error) {
      console.warn('[avatar] ekspor 3D gagal', error);
      onNotice('Gagal membuat berkas 3D.');
    }
  });

  // ---- Pose pratinjau dan reset kamera (tombol ada di .editor-stage pada index.html) ----
  function syncPoseButtons() {
    stage?.querySelectorAll('[data-pose]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pose === previewAct)));
    stage?.querySelectorAll('[data-clip]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.clip === previewClip)));
  }
  function setPose(act) {
    previewAct = previewAct === act ? null : act;
    previewClip = null;
    syncPoseButtons();
  }
  function setClip(id) {
    if (cfg.m === 0) { // klip Mixamo hanya bisa dimainkan model manusia
      onNotice('Gerakan lengkap hanya untuk karakter Michelle. Pilih Michelle dulu.');
      return;
    }
    previewClip = previewClip === id ? null : id;
    previewAct = null;
    syncPoseButtons();
  }
  stage?.querySelectorAll('[data-pose]').forEach((b) => b.addEventListener('click', () => setPose(b.dataset.pose)));
  const clipsEl = stage?.querySelector('[data-clips]');
  if (clipsEl) {
    for (const c of PREVIEW_CLIPS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stage-chip';
      b.dataset.clip = c.id;
      b.setAttribute('aria-pressed', 'false');
      b.textContent = `${c.icon} ${c.label}`;
      b.addEventListener('click', () => setClip(c.id));
      clipsEl.append(b);
    }
  }
  const resetView = () => {
    camDist = CAM.rest;
    if (avatar) avatar.rotation.y = Math.PI - 0.5;
  };
  stage?.querySelector('[data-view-reset]')?.addEventListener('click', resetView);

  function placeCamera() {
    camera.position.set(0, 1.05, camDist);
    camera.lookAt(0, 0.95, 0);
  }

  function initPreview() {
    if (renderer || !canvas) return;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      renderer = null; // pratinjau tidak tersedia; pilihan tetap berfungsi
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff0dc, 0x3a2f3f, 1.8));
    const key = new THREE.DirectionalLight(0xffe2b8, 2.2);
    key.position.set(2, 4, 3);
    scene.add(key);
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    placeCamera();
    avatar = createAvatar({ config: cfg });
    avatar.rotation.y = Math.PI - 0.5; // depan avatar (-Z) menghadap kamera pratinjau
    if (face) applyFacePhoto(avatar, face);
    scene.add(avatar);
    canvas.addEventListener('pointerdown', (e) => {
      touches.set(e.pointerId, e.clientX);
      canvas.setPointerCapture(e.pointerId);
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        pinchStart = Math.abs(a - b);
        pinchDist = camDist;
        dragging = false;
      } else {
        dragging = true;
        lastX = e.clientX;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, e.clientX);
      if (touches.size === 2 && pinchStart > 8) {
        const [a, b] = [...touches.values()];
        camDist = Math.min(CAM.max, Math.max(CAM.min, pinchDist * (pinchStart / Math.max(8, Math.abs(a - b)))));
      } else if (dragging) {
        avatar.rotation.y += (e.clientX - lastX) * 0.012;
        lastX = e.clientX;
      }
    });
    ['pointerup', 'pointercancel'].forEach((t) => canvas.addEventListener(t, (e) => {
      touches.delete(e.pointerId);
      pinchStart = 0;
      dragging = touches.size === 1;
      if (dragging) lastX = [...touches.values()][0];
    }));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      camDist = Math.min(CAM.max, Math.max(CAM.min, camDist * (1 + Math.sign(e.deltaY) * 0.08)));
    }, { passive: false });
  }

  function frame(time) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (time - last) / 1000 || 0);
    last = time;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w && h && (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio()))) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    clock += dt;
    const human = avatar.userData.human;
    if (human) human.forcedClip = previewClip; // diset tiap frame supaya tetap berlaku saat model manusia baru selesai dimuat
    applyPose(avatar, previewAct, clock, dt);
    if (!dragging && touches.size === 0) avatar.rotation.y += dt * 0.6;
    placeCamera();
    renderer.render(scene, camera);
  }

  renderOptions();
  return {
    get config() { return cfg; },
    /** Canvas wajah (atau null) untuk dipasang pada avatar pemain di dunia. Tidak berlaku untuk model manusia. */
    get faceCanvas() { return cfg.m > 0 ? null : face; },
    /** Thumbnail kecil (data URL) untuk dikirim ke pemain lain; null bila tak ada foto. */
    faceThumbnail(size = 96) { return face && cfg.m === 0 ? thumbnailDataUrl(face, size) : null; },
    clearFace,
    set(next) { cfg = sanitizeConfig(next); apply(); renderOptions(); },
    randomize() { cfg = randomConfig(); apply(); renderOptions(); },
    start() {
      initPreview();
      if (renderer && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    toggleDance() { setPose('dance'); return previewAct === 'dance'; },
    get isHuman() { return cfg.m > 0; },
  };
}
