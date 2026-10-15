// Editor avatar ala pemilihan hero: pratinjau 3D yang bisa diputar + tab pilihan + acak + foto wajah + unduh 3D.
import * as THREE from 'three';
import { ACCESSORIES, CHARACTERS, HAIR_COLORS, HAIR_STYLES, OUTFITS, SKINS, randomConfig, sanitizeConfig } from './avatar-config.js';
import { applyPose, createAvatar, setAvatarConfig } from './avatar.js';
import { FACE_STYLES, applyFacePhoto, faceCanvasFromImage, skinIndexFromCanvas, thumbnailDataUrl } from './avatar-face.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const STYLE_LABEL = { asli: 'Asli', royal: 'Royal', kartun: 'Kartun' };
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
  let dancing = false;
  let clock = 0;
  let renderer = null;
  let scene;
  let camera;
  let avatar;
  let raf = 0;
  let dragging = false;
  let lastX = 0;
  let last = 0;
  let photoFile = null; // foto asli tetap di perangkat; hanya hasil potongan yang dipakai
  let face = null; // canvas wajah hasil potongan + filter
  let styleIdx = 0;
  let busy = false;

  function refreshPhotoUi() {
    const human = cfg.m > 0; // model manusia (Michelle) tidak punya wajah yang bisa diganti
    if (photoButton) photoButton.hidden = human;
    if (styleButton) {
      styleButton.hidden = human || !face;
      styleButton.textContent = `Gaya: ${STYLE_LABEL[FACE_STYLES[styleIdx]]}`;
    }
    if (clearButton) clearButton.hidden = human || !face;
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
    optionsEl.replaceChildren();
    const current = TABS.find((t) => t.id === tab);
    optionsEl.className = `editor-options ${current.swatch ? 'is-swatch' : 'is-text'}`;
    current.items.forEach((item, index) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'editor-opt';
      b.setAttribute('aria-pressed', String(cfg[tab] === index));
      b.setAttribute('aria-label', item.name);
      b.title = item.name;
      if (current.swatch) b.style.background = hex(item.hex);
      else b.textContent = item.name;
      b.addEventListener('click', () => { cfg = { ...cfg, [tab]: index }; apply(); renderOptions(); });
      optionsEl.append(b);
    });
    refreshPhotoUi();
  }

  function apply() {
    if (avatar) setAvatarConfig(avatar, cfg);
    onChange(cfg);
  }

  async function buildFace({ pickSkin }) {
    if (!photoFile || busy) return;
    busy = true;
    try {
      face = await faceCanvasFromImage(photoFile, { style: FACE_STYLES[styleIdx] });
      if (pickSkin) cfg = { ...cfg, s: skinIndexFromCanvas(face) }; // warna kulit mengikuti foto (diambil dari foto asli, bukan hasil filter)
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
    photoFile = null;
    face = null;
    styleIdx = 0;
    if (avatar) applyFacePhoto(avatar, null);
    onFace(null);
    refreshPhotoUi();
  }

  photoButton?.addEventListener('click', () => photoInput?.click());
  photoInput?.addEventListener('change', () => {
    const file = photoInput.files?.[0];
    photoInput.value = ''; // supaya foto yang sama bisa dipilih lagi
    if (!file) return;
    if (!file.type.startsWith('image/')) { onNotice('Pilih berkas gambar.'); return; }
    photoFile = file;
    styleIdx = 0;
    buildFace({ pickSkin: true });
  });
  styleButton?.addEventListener('click', () => {
    styleIdx = (styleIdx + 1) % FACE_STYLES.length;
    buildFace({ pickSkin: false });
  });
  clearButton?.addEventListener('click', clearFace);
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
    camera.position.set(0, 1.25, 4.2);
    camera.lookAt(0, 1.0, 0);
    avatar = createAvatar({ config: cfg });
    avatar.rotation.y = Math.PI - 0.5; // depan avatar (-Z) menghadap kamera pratinjau
    if (face) applyFacePhoto(avatar, face);
    scene.add(avatar);
    canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (dragging) { avatar.rotation.y += (e.clientX - lastX) * 0.012; lastX = e.clientX; } });
    ['pointerup', 'pointercancel'].forEach((t) => canvas.addEventListener(t, () => { dragging = false; }));
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
    applyPose(avatar, dancing && cfg.m > 0 ? 'dance' : null, clock, dt);
    if (!dragging) avatar.rotation.y += dt * 0.6;
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
    toggleDance() { dancing = !dancing; return dancing; },
    get isHuman() { return cfg.m > 0; },
  };
}
