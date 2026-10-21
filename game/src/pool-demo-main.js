import * as THREE from 'three';
import { createPoolWaterSystem } from './pool-water.js';
import { POOL_DESIGNS } from './pool-water-logic.js';

// Halaman uji (/pool.html): lima kolam berdesain berbeda berjajar di dek, untuk memeriksa air sebelum dipasang di hotel.
// Kolam tertanam: dek berlubang, dasar dan dinding kolam di bawahnya, air di 0.12 m di bawah tepi dek.
const $ = (id) => document.getElementById(id);
const SKY = 0xbcd9ee;
const WATER_Y = -0.12;
const FLOOR_Y = -1.5;
const POOL_W = 12;
const POOL_D = 7;
const SPACING = 16;

function showError(message, detail = '') {
  $('pool-error').style.display = 'grid';
  $('pool-error-text').textContent = message;
  $('pool-error-detail').textContent = detail;
}

function start() {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) {
    showError('Browser ini tidak mendukung WebGL 2. Aktifkan akselerasi perangkat keras lalu muat ulang.');
    return;
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  $('pool-root').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const openFog = new THREE.Fog(SKY, 80, 400);
  const underFog = new THREE.Fog(0x0b5a7a, 0.5, 16);
  const openBackground = new THREE.Color(SKY);
  const underBackground = new THREE.Color(0x0b5a7a);
  scene.background = openBackground;
  scene.fog = openFog;
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.3);
  sun.position.set(150, 260, -120);
  scene.add(new THREE.HemisphereLight(0xdbeaff, 0x7a6b55, 1.0), sun);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1200);
  const names = Object.keys(POOL_DESIGNS);
  const centers = names.map((_, i) => (i - (names.length - 1) / 2) * SPACING);

  // Dek dengan lubang untuk tiap kolam (ShapeGeometry di bidang XY; setelah rotateX, y bentuk menjadi -z).
  const deck = new THREE.Shape();
  deck.moveTo(-60, -34);
  deck.lineTo(60, -34);
  deck.lineTo(60, 34);
  deck.lineTo(-60, 34);
  deck.closePath();
  for (const cx of centers) {
    const hole = new THREE.Path();
    hole.moveTo(cx - POOL_W / 2, -POOL_D / 2);
    hole.lineTo(cx + POOL_W / 2, -POOL_D / 2);
    hole.lineTo(cx + POOL_W / 2, POOL_D / 2);
    hole.lineTo(cx - POOL_W / 2, POOL_D / 2);
    hole.closePath();
    deck.holes.push(hole);
  }
  const deckGeometry = new THREE.ShapeGeometry(deck);
  deckGeometry.rotateX(-Math.PI / 2);
  scene.add(new THREE.Mesh(deckGeometry, new THREE.MeshLambertMaterial({ color: 0xd8cdb8 })));

  const plane = (w, h, x, y, z, rotY, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    scene.add(m);
    return m;
  };
  const box = (w, h, d, x, y, z, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    scene.add(m);
  };

  const water = createPoolWaterSystem({ renderer, scene, camera, sunDirection: sun.position });
  names.forEach((name, i) => {
    const cx = centers[i];
    const tile = POOL_DESIGNS[name].tile;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(POOL_W, POOL_D), new THREE.MeshLambertMaterial({ color: tile }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, FLOOR_Y, 0);
    scene.add(floor);
    const wallH = -FLOOR_Y;
    const wallY = FLOOR_Y + wallH / 2;
    plane(POOL_W, wallH, cx, wallY, -POOL_D / 2, 0, tile);
    plane(POOL_W, wallH, cx, wallY, POOL_D / 2, 0, tile);
    plane(POOL_D, wallH, cx - POOL_W / 2, wallY, 0, Math.PI / 2, tile);
    plane(POOL_D, wallH, cx + POOL_W / 2, wallY, 0, Math.PI / 2, tile);
    water.addPool({ id: name, x: cx, y: WATER_Y, z: 0, width: POOL_W, depth: POOL_D, design: name });
    box(0.9, 0.35, 2.1, cx - 2.5, 0.18, 6.0, 0xf5f5f0); // kursi berjemur: bahan pantulan di tepi kolam
    box(0.9, 0.35, 2.1, cx + 2.5, 0.18, 6.0, 0xf5f5f0);
  });
  box(120, 9, 0.6, 0, 4.5, -22, 0xe0a96d); // dinding berwarna di belakang kolam
  box(1.4, 7, 1.4, -26, 3.5, -12, 0xffffff);
  box(1.4, 7, 1.4, 26, 3.5, -12, 0xc0392b);

  // kamera orbit sederhana
  const cam = { yaw: 0, pitch: 0.55, dist: 40, underwater: false };
  const target = new THREE.Vector3(0, -0.3, 0);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const pointers = new Map();
  let pinch = 0;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      cam.yaw -= dx * 0.006;
      cam.pitch = clamp(cam.pitch + dy * 0.005, 0.04, 1.5);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 1 && d > 1) cam.dist = clamp(cam.dist * (pinch / d), 3, 110);
      pinch = d;
    }
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    pinch = 0;
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('wheel', (e) => {
    cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.1 : 0.9), 3, 110);
    e.preventDefault();
  }, { passive: false });

  const underButton = $('under-button');
  underButton.addEventListener('click', () => {
    cam.underwater = !cam.underwater;
    underButton.textContent = cam.underwater ? 'Permukaan' : 'Selam';
    underButton.setAttribute('aria-pressed', String(cam.underwater));
  });

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  let last = { underwater: 0, activePoolId: null };
  function frame(time) {
    requestAnimationFrame(frame);
    if (cam.underwater) {
      const mid = centers[Math.floor(centers.length / 2)];
      camera.position.set(mid, WATER_Y - 0.45, 2.4);
      camera.lookAt(mid, WATER_Y - 0.9, -3);
    } else {
      const cp = Math.cos(cam.pitch);
      camera.position.set(target.x + Math.sin(cam.yaw) * cp * cam.dist, target.y + Math.sin(cam.pitch) * cam.dist, target.z + Math.cos(cam.yaw) * cp * cam.dist);
      camera.lookAt(target);
    }
    last = water.update(time / 1000);
    const under = last.underwater > 0.5;
    scene.fog = under ? underFog : openFog;
    scene.background = under ? underBackground : openBackground;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  window.__pool = {
    state: () => ({ activePoolId: last.activePoolId, underwater: last.underwater, underwaterView: cam.underwater, pools: water.pools.map((p) => p.id) }),
    renderStats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures }),
  };
}

try {
  start();
} catch (error) {
  console.error('[pool]', error);
  showError('Terjadi kesalahan saat memulai.', String(error?.stack ?? error));
}
