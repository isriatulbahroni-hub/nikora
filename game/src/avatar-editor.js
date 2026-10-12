// Editor avatar ala pemilihan hero: pratinjau 3D yang bisa diputar + tab pilihan + acak.
import * as THREE from 'three';
import { ACCESSORIES, CHARACTERS, HAIR_COLORS, HAIR_STYLES, OUTFITS, SKINS, randomConfig, sanitizeConfig } from './avatar-config.js';
import { applyPose, createAvatar, setAvatarConfig } from './avatar.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
export const TABS = [
  { id: 'm', label: 'Karakter', swatch: false, items: CHARACTERS.map(({ name }) => ({ name })) },
  { id: 'o', label: 'Pakaian', swatch: true, items: OUTFITS },
  { id: 's', label: 'Kulit', swatch: true, items: SKINS },
  { id: 'h', label: 'Rambut', swatch: false, items: HAIR_STYLES.map((name) => ({ name })) },
  { id: 'k', label: 'Warna', swatch: true, items: HAIR_COLORS },
  { id: 'a', label: 'Aksesori', swatch: false, items: ACCESSORIES.map((name) => ({ name })) },
];

export function createAvatarEditor({ canvas, tabsEl, optionsEl, initial, onChange = () => {} }) {
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
  }

  function apply() {
    if (avatar) setAvatarConfig(avatar, cfg);
    onChange(cfg);
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
    camera.position.set(0, 1.25, 4.2);
    camera.lookAt(0, 1.0, 0);
    avatar = createAvatar({ config: cfg });
    avatar.rotation.y = Math.PI - 0.5; // depan avatar (-Z) menghadap kamera pratinjau
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
