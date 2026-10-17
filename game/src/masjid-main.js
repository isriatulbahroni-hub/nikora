import * as THREE from 'three';
import { applyPose, createAvatar } from './avatar.js';
import { loadConfig } from './avatar-config.js';
import { createQualityGovernor } from './quality.js';
import { chooseCameraPose, forwardLookBlend, resolveCameraDistance } from './villa-camera.js';
import { getMasjidWorld } from './masjid-layout.js';
import { buildMasjidWorld } from './masjid-world.js';
import { createPostureController } from './masjid-posture-data.js';
import { applyPosture } from './masjid-posture.js';
import { exhibitById, nearestExhibit } from './masjid-exhibits.js';

// Masjid Agung NIKORA: kompleks sangat luas yang dijelajahi dengan avatar (mode offline, satu pemain).
// Berjalan 5,2 m/s seperti di vila; tombol Lari (Shift / R) menaikkannya supaya jarak ratusan meter tetap nyaman.
const WALK_SPEED = 5.2;
const RUN_SPEED = 16;
const world = getMasjidWorld();
const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lowQuality = new URLSearchParams(window.location.search).get('q') === 'low';

function showError(message, detail = '') {
  $('masjid-error').style.display = 'grid';
  $('masjid-error-text').textContent = message;
  $('masjid-error-detail').textContent = detail;
}

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

// ---------- input ----------
const held = new Set();
const joystick = { x: 0, z: 0 };
let shiftHeld = false;
let runToggle = false;
const KEYS = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
const hooks = { map: () => {}, camera: () => {}, places: () => {}, run: () => {}, sit: () => {}, pray: () => {}, next: () => {}, tap: () => {} };
const CAM_LIMITS = Object.freeze({ minPitch: 0.06, maxPitch: 1.5, minDist: 1.5, maxDist: 140 });
// Orang ketiga, lebar, udara, dan pandangan atas (skala masjid ratusan meter)
const CAM_PRESETS = Object.freeze([{ pitch: 0.28, dist: 6 }, { pitch: 0.55, dist: 12 }, { pitch: 0.95, dist: 30 }, { pitch: 1.5, dist: 90 }]);

function readInput() {
  let x = joystick.x;
  let z = joystick.z;
  for (const k of held) {
    x += KEYS[k][0];
    z += KEYS[k][1];
  }
  const len = Math.hypot(x, z);
  return len > 1 ? { x: x / len, z: z / len } : { x, z };
}

/** Arah gerak relatif kamera: dorong joystick ke atas = menjauhi kamera, di sudut putar mana pun. */
function cameraRelative(input, yaw) {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  return { x: rx * input.x - fx * input.z, z: rz * input.x - fz * input.z };
}

function setupInput(canvas, camState) {
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k in KEYS) {
      held.add(k);
      e.preventDefault();
    } else if (k === 'shift') shiftHeld = true;
    else if (!e.repeat && k === 'm') hooks.map();
    else if (!e.repeat && k === 'c') hooks.camera();
    else if (!e.repeat && k === 'j') hooks.places();
    else if (!e.repeat && k === 'r') hooks.run();
    else if (!e.repeat && k === 'b') hooks.sit();
    else if (!e.repeat && k === 'p') hooks.pray();
    else if (!e.repeat && (k === 'n' || k === 'enter')) hooks.next();
    else if (k === '[') camState.yaw += 0.12;
    else if (k === ']') camState.yaw -= 0.12;
    else if (k === '-') camState.dist = clamp(camState.dist * 1.1, CAM_LIMITS.minDist, CAM_LIMITS.maxDist);
    else if (k === '=' || k === '+') camState.dist = clamp(camState.dist * 0.9, CAM_LIMITS.minDist, CAM_LIMITS.maxDist);
  });
  addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    held.delete(k);
    if (k === 'shift') shiftHeld = false;
  });
  addEventListener('blur', () => {
    held.clear();
    shiftHeld = false;
  });
  canvas.addEventListener('wheel', (e) => {
    camState.dist = clamp(camState.dist * (e.deltaY > 0 ? 1.1 : 0.9), CAM_LIMITS.minDist, CAM_LIMITS.maxDist);
    e.preventDefault();
  }, { passive: false });

  // Seret = putar dan miringkan kamera (satu jari/mouse); cubit dua jari = zoom, putar dua jari = putar kamera.
  // Ketukan singkat tanpa geser = memilih benda di dunia (mis. etalase museum).
  const pointers = new Map();
  let pinch = null;
  let tap = null;
  const twoFingers = () => {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tap = pointers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null;
    if (pointers.size === 2) pinch = twoFingers();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap = null;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      camState.yaw -= dx * 0.006;
      camState.pitch = clamp(camState.pitch + dy * 0.005, CAM_LIMITS.minPitch, CAM_LIMITS.maxPitch);
    } else if (pointers.size === 2 && pinch) {
      const now = twoFingers();
      if (now.d > 1 && pinch.d > 1) camState.dist = clamp(camState.dist * (pinch.d / now.d), CAM_LIMITS.minDist, CAM_LIMITS.maxDist);
      let turn = now.angle - pinch.angle;
      if (turn > Math.PI) turn -= Math.PI * 2;
      if (turn < -Math.PI) turn += Math.PI * 2;
      camState.yaw -= turn;
      pinch = now;
    }
  });
  const release = (e) => {
    if (tap && tap.id === e.pointerId && e.type === 'pointerup' && performance.now() - tap.t < 450) hooks.tap(e.clientX, e.clientY);
    tap = null;
    pointers.delete(e.pointerId);
    pinch = pointers.size === 2 ? twoFingers() : null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const zone = $('joy-zone');
  const base = $('joy-base');
  const knob = $('joy-knob');
  const RADIUS = 52;
  let pointerId = null;
  let origin = null;
  const update = (e) => {
    let dx = e.clientX - origin.x;
    let dy = e.clientY - origin.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mag = Math.hypot(dx, dy) / RADIUS;
    if (mag < 0.14) {
      joystick.x = 0;
      joystick.z = 0;
    } else {
      joystick.x = dx / RADIUS;
      joystick.z = dy / RADIUS;
    }
  };
  zone.addEventListener('pointerdown', (e) => {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    zone.setPointerCapture(pointerId);
    const rect = base.getBoundingClientRect();
    origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    update(e);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId === pointerId) update(e);
  });
  const end = (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    joystick.x = 0;
    joystick.z = 0;
    knob.style.transform = '';
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
}

// ---------- peta mini ----------
const ROOM_COLORS = { hall: '#2e7d5b', women: '#5aa07f', study: '#a48d62', library: '#8a6a45', museum: '#b9b4a8', wudhu: '#7fb7c8', akad: '#e9d9b0', walimah: '#efd0c0' };
const ZONE_COLORS = { sahn: '#e4d8bd', riwaq: '#cbbd98', plaza: '#d4c8aa', corridor: '#cfc3a4', garden: '#9cbb7a' };

function createMinimap() {
  const canvas = $('minimap');
  const ctx = canvas.getContext('2d');
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const sx = canvas.width / (maxX - minX);
  const sz = canvas.height / (maxZ - minZ);
  const px = (x) => (x - minX) * sx;
  const pz = (z) => (z - minZ) * sz;
  const layer = document.createElement('canvas');
  layer.width = canvas.width;
  layer.height = canvas.height;
  const l = layer.getContext('2d');
  const rect = (r) => l.fillRect(px(r[0]), pz(r[1]), (r[2] - r[0]) * sx, (r[3] - r[1]) * sz);
  l.fillStyle = '#d7c9ae';
  l.fillRect(0, 0, layer.width, layer.height);
  for (const z of world.zones) {
    l.fillStyle = ZONE_COLORS[z.kind] ?? '#d7c9ae';
    rect(z.rect);
  }
  for (const r of world.rooms) {
    l.fillStyle = ROOM_COLORS[r.kind] ?? '#ddd';
    rect(r.rect);
  }
  l.fillStyle = '#2f8f86'; // kubah utama
  l.beginPath();
  l.ellipse(px(0), pz(-140), 56 * sx, 56 * sz, 0, 0, Math.PI * 2);
  l.fill();
  l.fillStyle = '#39c3df'; // pancuran sahn
  l.beginPath();
  l.ellipse(px(0), pz(45), 9 * sx, 9 * sz, 0, 0, Math.PI * 2);
  l.fill();
  l.fillStyle = '#5a4a3a';
  for (const w of world.walls) {
    if (w.orient === 'h') l.fillRect(px(w.a), pz(w.coord) - 0.5, (w.b - w.a) * sx, 1);
    else l.fillRect(px(w.coord) - 0.5, pz(w.a), 1, (w.b - w.a) * sz);
  }
  l.fillStyle = '#d8b04a'; // menara
  for (const m of [[-190, -232], [190, -232], [-190, -48], [190, -48]]) l.fillRect(px(m[0]) - 2, pz(m[1]) - 2, 4, 4);
  const edgeX = (x) => px(clamp(x, minX, maxX));
  const edgeZ = (z) => pz(clamp(z, minZ, maxZ));
  return (self, facing) => {
    ctx.drawImage(layer, 0, 0);
    ctx.beginPath();
    ctx.arc(edgeX(self.x), edgeZ(self.z), 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(edgeX(self.x), edgeZ(self.z), 3, 0, Math.PI * 2);
    ctx.fillStyle = '#e23b3b';
    ctx.fill();
    // garis arah hadap avatar (0 = utara = -z)
    ctx.beginPath();
    ctx.moveTo(edgeX(self.x), edgeZ(self.z));
    ctx.lineTo(edgeX(self.x) - Math.sin(facing) * 10, edgeZ(self.z) - Math.cos(facing) * 10);
    ctx.strokeStyle = '#e23b3b';
    ctx.lineWidth = 2;
    ctx.stroke();
  };
}

// ---------- mulai ----------
async function start() {
  if (!hasWebGL2()) {
    showError('Browser ini tidak mendukung WebGL 2. Aktifkan akselerasi perangkat keras lalu muat ulang.');
    return;
  }
  const root = $('masjid-root');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearAlpha(1);
  const quality = createQualityGovernor({ deviceRatio: window.devicePixelRatio || 1, cap: window.matchMedia?.('(pointer: coarse)').matches ? 2.25 : 2, floor: lowQuality ? 2 : 0 });
  renderer.setPixelRatio(quality.settings().ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const built = buildMasjidWorld(scene, world, { renderer });
  const camera = new THREE.PerspectiveCamera(48, 1, 0.4, 1800);
  const indoorLight = new THREE.PointLight(0xffe2b8, 0, 60, 1.2);
  scene.add(indoorLight);
  let indoorK = 0;

  const camState = { yaw: 0, pitch: CAM_PRESETS[0].pitch, dist: CAM_PRESETS[0].dist };
  const camNow = { ...camState };
  let camArm = 0; // panjang lengan kamera yang dihaluskan (dipendekkan seketika saat terhalang)
  let camPitch = null;
  let preset = 0;
  hooks.camera = () => {
    preset = (preset + 1) % CAM_PRESETS.length;
    camState.pitch = CAM_PRESETS[preset].pitch;
    camState.dist = CAM_PRESETS[preset].dist;
  };
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = clamp(48 + (1.2 - camera.aspect) * 26, 48, 62);
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);
  setupInput(renderer.domElement, camState);
  $('cam-button').addEventListener('click', () => hooks.camera());

  const storage = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  const store = (key, value) => {
    try {
      if (value === undefined) return storage?.getItem(key) ?? null;
      storage?.setItem(key, value);
    } catch {
      /* penyimpanan tidak tersedia */
    }
    return null;
  };
  const params = new URLSearchParams(window.location.search);
  const name = (params.get('name') || store('orbit-name') || `Tamu-${Math.floor(Math.random() * 900 + 100)}`).replace(/[<>]/g, '').slice(0, 24);
  const avatar = createAvatar({ config: loadConfig(storage), name }); // avatar yang sama dengan aula dan vila
  avatar.rotation.order = 'YXZ';
  scene.add(avatar);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  const me = { x: world.spawn.x, z: world.spawn.z };
  const spawn = world.constrain(me);
  me.x = spawn.x;
  me.z = spawn.z;
  let facing = 0; // 0 = menghadap utara (-z)
  camera.position.set(me.x, 8, me.z + 12);

  // ---------- toast, peta, lari, jelajah ----------
  const toastEl = $('toast');
  let toastTimer = 0;
  const toast = (text, ms = 2600) => {
    toastEl.textContent = text;
    toastEl.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.style.display = 'none';
    }, ms);
  };

  // Petunjuk sekali saja untuk layar sentuh: sebelumnya petunjuk "seret untuk memutar kamera" disembunyikan di HP,
  // sehingga pengguna sentuh tidak tahu kamera bisa diputar dan di-zoom.
  if (window.matchMedia?.('(pointer: coarse)').matches && store('masjid-hint') !== '1') {
    store('masjid-hint', '1');
    setTimeout(() => toast('Geser joystick untuk berjalan. Seret layar di luar joystick untuk memutar kamera, cubit dua jari untuk zoom.', 7000), 1200);
  }

  // ---------- info etalase museum (ketuk etalase, atau tombol yang muncul saat berdekatan) ----------
  const exhibitSpots = world.props.filter((p) => p.type === 'glass' && p.exhibit).map((p) => ({ x: p.x, z: p.z, id: p.exhibit }));
  const exhibitCard = $('exhibit-card');
  const exhibitPrompt = $('exhibit-prompt');
  let promptId = null;
  const openExhibit = (id) => {
    const ex = exhibitById(id);
    if (!ex) return;
    $('exhibit-title').textContent = ex.title;
    $('exhibit-era').textContent = ex.era;
    $('exhibit-text').textContent = ex.text;
    exhibitCard.hidden = false;
  };
  $('exhibit-close').addEventListener('click', () => {
    exhibitCard.hidden = true;
  });
  exhibitPrompt.addEventListener('click', () => {
    if (promptId) openExhibit(promptId);
  });
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  hooks.tap = (cx, cy) => {
    if (!built.exhibitHits.length) return;
    ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(built.exhibitHits, false)[0];
    if (!hit) return;
    const id = hit.object.userData.exhibit;
    const spot = exhibitSpots.find((s) => s.id === id);
    if (spot && Math.hypot(spot.x - me.x, spot.z - me.z) > 14) toast('Dekati etalase ini untuk membuka infonya.');
    else openExhibit(id);
  };

  // ---------- duduk bersila dan shalat (acara tazkirah, tarannum, akad, shalat berjamaah) ----------
  const posture = createPostureController();
  const sitBtn = $('sit-button');
  const prayBtn = $('pray-button');
  const prayerBar = $('prayer-bar');
  const refreshPostureUi = () => {
    const s = posture.state();
    sitBtn.setAttribute('aria-pressed', String(s.sitting));
    prayBtn.setAttribute('aria-pressed', String(s.praying));
    prayerBar.hidden = !s.praying;
    if (s.praying) {
      $('prayer-label').textContent = s.label;
      $('prayer-next').textContent = s.last ? 'Selesai' : 'Gerakan berikutnya \u25B6';
    }
  };
  hooks.sit = () => {
    posture.toggleSit();
    refreshPostureUi();
    toast(posture.state().sitting ? 'Duduk bersila. Gerakkan joystick untuk berdiri.' : 'Berdiri');
  };
  hooks.pray = () => {
    if (posture.state().praying) {
      posture.stop();
      refreshPostureUi();
      return;
    }
    facing = 0; // menghadap utara = kiblat
    camState.yaw = 0;
    posture.startPrayer(2);
    refreshPostureUi();
    toast('Shalat 2 rakaat. Tekan "Gerakan berikutnya" tiap berpindah gerakan.');
  };
  hooks.next = () => {
    if (!posture.state().praying) return;
    posture.next();
    refreshPostureUi();
  };
  sitBtn.addEventListener('click', () => hooks.sit());
  prayBtn.addEventListener('click', () => hooks.pray());
  $('prayer-next').addEventListener('click', () => hooks.next());
  $('prayer-stop').addEventListener('click', () => {
    posture.stop();
    refreshPostureUi();
  });

  const mapBtn = $('map-button');
  const mapCanvas = $('minimap');
  const setMap = (on) => {
    mapCanvas.hidden = !on;
    mapBtn.setAttribute('aria-pressed', String(on));
    store('masjid-map', on ? '1' : '0');
  };
  hooks.map = () => setMap(mapCanvas.hidden);
  mapBtn.addEventListener('click', () => hooks.map());
  setMap(store('masjid-map') !== '0'); // peta terbuka secara bawaan: kompleksnya sangat luas

  const runBtn = $('run-button');
  hooks.run = () => {
    runToggle = !runToggle;
    runBtn.setAttribute('aria-pressed', String(runToggle));
    toast(runToggle ? 'Lari: nyala' : 'Lari: mati');
  };
  runBtn.addEventListener('click', () => hooks.run());

  const teleport = (x, z) => {
    posture.stop();
    refreshPostureUi();
    const p = world.constrain({ x, z });
    me.x = p.x;
    me.z = p.z;
    facing = 0;
    camState.yaw = 0;
    camNow.yaw = 0;
    camArm = 0;
    camPitch = null;
  };
  const panel = $('places-panel');
  const list = $('places-list');
  // menu Jelajah dikelompokkan (Halaman dan gerbang, Ibadah, Belajar dan budaya, Acara)
  for (const group of world.placeGroups) {
    const items = world.places.filter((p) => p.group === group);
    if (!items.length) continue;
    const heading = document.createElement('div');
    heading.className = 'place-group';
    heading.textContent = group;
    list.appendChild(heading);
    for (const p of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'place-btn';
      b.textContent = p.name;
      b.addEventListener('click', () => {
        teleport(p.x, p.z);
        panel.hidden = true;
        toast(p.name);
      });
      list.appendChild(b);
    }
  }
  hooks.places = () => {
    panel.hidden = !panel.hidden;
  };
  $('places-button').addEventListener('click', () => hooks.places());
  $('places-close').addEventListener('click', () => {
    panel.hidden = true;
  });

  const drawMap = createMinimap();
  let last = performance.now();
  let walkClock = 0;
  let placeId = '';

  function frame(time) {
    requestAnimationFrame(frame);
    const delta = Math.min((time - last) / 1000, 0.05);
    last = time;

    const move = cameraRelative(readInput(), camNow.yaw);
    const moving = move.x !== 0 || move.z !== 0;
    if (moving && posture.active()) {
      // bergerak = berdiri lagi (membatalkan duduk atau shalat)
      posture.stop();
      refreshPostureUi();
    }
    const running = shiftHeld || runToggle;
    if (moving) {
      const speed = running ? RUN_SPEED : WALK_SPEED;
      const next = world.move(me, move.x * speed * delta, move.z * speed * delta);
      me.x = next.x;
      me.z = next.z;
      facing = Math.atan2(-move.x, -move.z);
      walkClock += delta * (running ? 1.6 : 1);
    }

    avatar.position.x = me.x;
    avatar.position.z = me.z;
    avatar.rotation.y = facing;
    applyPose(avatar, moving ? 'walk' : null, time / 1000, delta);
    const dropNow = applyPosture(avatar, posture.pose(), delta); // <= 0: panggul turun saat duduk/sujud
    avatar.position.y += (((moving ? Math.abs(Math.sin(walkClock * 12)) * 0.08 : 0) + dropNow) - avatar.position.y) * Math.max(1 - Math.exp(-14 * delta), 0.5);
    blob.position.set(me.x, 0.16, me.z);

    // kamera mengorbit pemain; bila terhalang dinding/atap, dinaikkan halus atau dipendekkan
    camState.pitch = clamp(camState.pitch, CAM_LIMITS.minPitch, CAM_LIMITS.maxPitch);
    camState.dist = clamp(camState.dist, CAM_LIMITS.minDist, CAM_LIMITS.maxDist);
    const ck = 1 - Math.exp(-12 * delta);
    camNow.yaw += (camState.yaw - camNow.yaw) * ck;
    camNow.pitch += (camState.pitch - camNow.pitch) * ck;
    camNow.dist += (camState.dist - camNow.dist) * ck;
    const wide = clamp((camNow.dist - 8) / 6, 0, 1);
    const fit = 1 + (Math.min(1.9, Math.max(1, 1.45 / camera.aspect)) - 1) * wide;
    const want = camNow.dist * fit;
    const eye = { x: me.x, y: 1.45 + dropNow * 0.8, z: me.z }; // mata kamera ikut turun saat duduk
    const boxes = world.occludersNear(eye.x, eye.z, want + 12);
    const camPose = chooseCameraPose(eye, camNow.yaw, camNow.pitch, want, boxes);
    camPitch = camPitch === null ? camPose.pitch : camPitch + (camPose.pitch - camPitch) * (1 - Math.exp(-6 * delta));
    const cp = Math.cos(camPitch);
    const dir = { x: Math.sin(camNow.yaw) * cp, y: Math.sin(camPitch), z: Math.cos(camNow.yaw) * cp };
    const { dist: freeArm } = resolveCameraDistance(eye, dir, want, boxes);
    camArm = camArm === 0 || freeArm < camArm ? freeArm : camArm + (freeArm - camArm) * (1 - Math.exp(-4 * delta));
    camera.position.set(eye.x + dir.x * camArm, eye.y + dir.y * camArm, eye.z + dir.z * camArm);
    const look = forwardLookBlend(camArm);
    const ahead = { x: eye.x - Math.sin(camNow.yaw) * 6, y: eye.y - 0.3, z: eye.z - Math.cos(camNow.yaw) * 6 };
    const lookY = 1.2 + dropNow * 0.8;
    camera.lookAt(me.x + (ahead.x - me.x) * look, lookY + (ahead.y - lookY) * look, me.z + (ahead.z - me.z) * look);
    avatar.visible = camArm > 0.95;
    blob.visible = avatar.visible;

    // di dalam bangunan: cahaya langit dikurangi dan lampu dalam ruangan menyala halus mengikuti pemain
    const place = world.roomAt(me.x, me.z);
    indoorK += ((place.indoor ? 1 : 0) - indoorK) * (1 - Math.exp(-3 * delta));
    built.setIndoor(indoorK);
    indoorLight.intensity = 60 * indoorK;
    indoorLight.position.set(me.x, 3, me.z);

    const qChange = quality.tick(performance.now());
    if (qChange) renderer.setPixelRatio(qChange.ratio);
    renderer.render(scene, camera);

    if (place.id !== placeId) {
      placeId = place.id;
      $('place').textContent = place.name;
    }
    if (!mapCanvas.hidden) drawMap(me, facing);

    // tombol info muncul saat berdekatan dengan etalase museum; kartu info menutup sendiri bila pemain menjauh
    const nearEx = nearestExhibit(exhibitSpots, me.x, me.z);
    const nearId = nearEx ? nearEx.id : null;
    if (nearId !== promptId) {
      promptId = nearId;
      if (nearId) {
        exhibitPrompt.textContent = `\u24D8 ${exhibitById(nearId).title}`;
        exhibitPrompt.hidden = false;
      } else {
        exhibitPrompt.hidden = true;
        exhibitCard.hidden = true;
      }
    }
  }
  requestAnimationFrame(frame);

  window.__masjid = {
    state: () => ({ x: me.x, z: me.z, facing, place: world.roomAt(me.x, me.z), running: shiftHeld || runToggle, posture: posture.pose() }),
    cam: () => ({ yaw: camState.yaw, pitch: camState.pitch, dist: camState.dist }),
    renderStats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, pixelRatio: renderer.getPixelRatio() }),
    teleport, // hanya untuk pengujian dan tombol Jelajah
  };
}

start().catch((error) => {
  console.error('[masjid]', error);
  showError('Terjadi kesalahan saat memulai.', String(error?.stack ?? error));
});
