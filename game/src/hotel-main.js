import * as THREE from 'three';
import { applyPose, createAvatar } from './avatar.js';
import { loadConfig } from './avatar-config.js';
import { createQualityGovernor } from './quality.js';
import { chooseCameraPose, forwardLookBlend, resolveCameraDistance } from './villa-camera.js';
import { doorAssist, turnToward } from './villa-motion.js';
import { FLOOR_NAMES, HOTEL_BUILDING, HOTEL_FORECOURT, HOTEL_LEVEL_COUNT, HOTEL_PARKING, HOTEL_SPAWN, getHotelWorld, hotelLevelY } from './hotel-layout.js';
import { buildHotelWorld } from './hotel-world.js';
import { buildHotelOccluders } from './hotel-camera.js';
import { FLOOR_COLORS, GROUP_ORDER, cssColor, describePlace, hotelPlaces } from './hotel-places.js';

// NIKORA Grand Hotel: menara 15 lantai yang dijelajahi dengan avatar (mode offline, satu pemain).
// Lantai dicapai dengan 4 lift di inti bangunan; menu Jelajah melompat langsung ke ruang yang dipilih.
const SPEED = 5.2;
const world = getHotelWorld();
const places = hotelPlaces(world);
const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lowQuality = new URLSearchParams(window.location.search).get('q') === 'low';

function showError(message, detail = '') {
  $('hotel-error').style.display = 'grid';
  $('hotel-error-text').textContent = message;
  $('hotel-error-detail').textContent = detail;
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
const KEYS = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
const hooks = { map: () => {}, camera: () => {}, places: () => {} };
const CAM_LIMITS = Object.freeze({ minPitch: 0.06, maxPitch: 1.5, minDist: 1.5, maxDist: 140 });
// Orang ketiga, lebar, udara, dan pandangan menara dari jauh
const CAM_PRESETS = Object.freeze([{ pitch: 0.28, dist: 5.6 }, { pitch: 0.55, dist: 11 }, { pitch: 0.95, dist: 21 }, { pitch: 0.4, dist: 110 }]);

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
    } else if (!e.repeat && k === 'm') hooks.map();
    else if (!e.repeat && k === 'c') hooks.camera();
    else if (!e.repeat && k === 'j') hooks.places();
    else if (k === '[') camState.yaw += 0.12;
    else if (k === ']') camState.yaw -= 0.12;
    else if (k === '-') camState.dist = clamp(camState.dist * 1.1, CAM_LIMITS.minDist, CAM_LIMITS.maxDist);
    else if (k === '=' || k === '+') camState.dist = clamp(camState.dist * 0.9, CAM_LIMITS.minDist, CAM_LIMITS.maxDist);
  });
  addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
  addEventListener('blur', () => held.clear());
  canvas.addEventListener('wheel', (e) => {
    camState.dist = clamp(camState.dist * (e.deltaY > 0 ? 1.1 : 0.9), CAM_LIMITS.minDist, CAM_LIMITS.maxDist);
    e.preventDefault();
  }, { passive: false });

  // Seret = putar dan miringkan kamera (satu jari/mouse); cubit dua jari = zoom, putar dua jari = putar kamera.
  const pointers = new Map();
  let pinch = null;
  const twoFingers = () => {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) pinch = twoFingers();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
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
    if (Math.hypot(dx, dy) / RADIUS < 0.14) {
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

// ---------- peta mini (per lantai) ----------
const MAP_MARGIN = 6;
function createMinimap() {
  const canvas = $('minimap');
  const ctx = canvas.getContext('2d');
  const minX = HOTEL_BUILDING[0] - MAP_MARGIN;
  const maxX = HOTEL_BUILDING[2] + MAP_MARGIN;
  const minZ = HOTEL_BUILDING[1] - MAP_MARGIN;
  const maxZ = HOTEL_BUILDING[3] + MAP_MARGIN;
  const sx = canvas.width / (maxX - minX);
  const sz = canvas.height / (maxZ - minZ);
  const px = (x) => (x - minX) * sx;
  const pz = (z) => (z - minZ) * sz;
  const layers = new Array(HOTEL_LEVEL_COUNT).fill(null);
  const makeLayer = (level) => {
    const layer = document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const l = layer.getContext('2d');
    const rect = (r) => l.fillRect(px(r[0]), pz(r[1]), (r[2] - r[0]) * sx, (r[3] - r[1]) * sz);
    l.fillStyle = level === 0 ? '#5f9a4e' : '#26303a';
    l.fillRect(0, 0, layer.width, layer.height);
    if (level === 0) {
      l.fillStyle = '#4a4d54';
      rect(HOTEL_FORECOURT);
      l.fillStyle = '#41444a';
      rect(HOTEL_PARKING);
    }
    l.fillStyle = '#9a8872'; // lorong
    rect(HOTEL_BUILDING);
    const data = world.levels[level];
    for (const r of data.rooms) {
      l.fillStyle = cssColor(FLOOR_COLORS[r.kind] ?? 0xcccccc);
      rect(r.rect);
    }
    l.fillStyle = '#4a3b2c';
    for (const w of data.walls) {
      if (w.orient === 'h') l.fillRect(px(w.a), pz(w.coord) - 0.6, (w.b - w.a) * sx, 1.2);
      else l.fillRect(px(w.coord) - 0.6, pz(w.a), 1.2, (w.b - w.a) * sz);
    }
    l.fillStyle = '#d4af37'; // lift
    for (const lift of world.lifts) rect(lift.rect);
    return layer;
  };
  const edgeX = (x) => px(clamp(x, minX, maxX));
  const edgeZ = (z) => pz(clamp(z, minZ, maxZ));
  return (self, facing, level) => {
    layers[level] ??= makeLayer(level);
    ctx.drawImage(layers[level], 0, 0);
    ctx.beginPath();
    ctx.arc(edgeX(self.x), edgeZ(self.z), 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(edgeX(self.x), edgeZ(self.z), 3, 0, Math.PI * 2);
    ctx.fillStyle = '#e23b3b';
    ctx.fill();
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
  const root = $('hotel-root');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearAlpha(1);
  const quality = createQualityGovernor({ deviceRatio: window.devicePixelRatio || 1, cap: window.matchMedia?.('(pointer: coarse)').matches ? 2.25 : 2, floor: lowQuality ? 2 : 0 });
  renderer.setPixelRatio(quality.settings().ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const built = buildHotelWorld(scene, world, { renderer });
  const camera = new THREE.PerspectiveCamera(48, 1, 0.2, 1800);
  const indoorLight = new THREE.PointLight(0xffe2b8, 0, 26, 1.3);
  scene.add(indoorLight);
  let indoorK = 0;

  const camState = { yaw: Math.PI, pitch: CAM_PRESETS[0].pitch, dist: CAM_PRESETS[0].dist }; // mulai menghadap fasad hotel (selatan)
  const camNow = { ...camState };
  let camArm = 0;
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
  const avatar = createAvatar({ config: loadConfig(storage), name });
  avatar.rotation.order = 'YXZ';
  scene.add(avatar);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  const me = { x: HOTEL_SPAWN.x, z: HOTEL_SPAWN.z, level: 0, stair: null, y: 0 };
  let facing = Math.PI; // 0 = utara (-z); mulai menghadap hotel di selatan
  let shownFacing = facing;
  let walkClock = 0;
  camera.position.set(me.x, 8, me.z - 12);

  // ---------- toast ----------
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
  if (window.matchMedia?.('(pointer: coarse)').matches && store('hotel-hint') !== '1') {
    store('hotel-hint', '1');
    setTimeout(() => toast('Geser joystick untuk berjalan. Masuk ke kabin lift di inti bangunan untuk naik, atau pakai menu Jelajah.', 7000), 1200);
  }

  // ---------- peta ----------
  const mapBtn = $('map-button');
  const mapCanvas = $('minimap');
  const setMap = (on) => {
    mapCanvas.hidden = !on;
    mapBtn.setAttribute('aria-pressed', String(on));
    store('hotel-map', on ? '1' : '0');
  };
  hooks.map = () => setMap(mapCanvas.hidden);
  mapBtn.addEventListener('click', () => hooks.map());
  setMap(store('hotel-map') !== '0');

  // ---------- teleport dan lift ----------
  const occluderCache = new Map();
  const occludersFor = (level) => {
    if (!occluderCache.has(level)) occluderCache.set(level, buildHotelOccluders(world, level));
    return occluderCache.get(level);
  };
  const resetCamera = () => {
    camArm = 0;
    camPitch = null;
  };
  let riding = null; // { from, to, fromY, toY, t0, ms }
  const fade = $('lift-fade');
  const teleport = (level, x, z) => {
    riding = null;
    fade.classList.remove('on');
    me.level = level;
    me.x = x;
    me.z = z;
    me.y = hotelLevelY(level);
    resetCamera();
  };
  const ride = (to) => {
    if (riding) return false;
    const r = world.rideLift({ x: me.x, z: me.z, level: me.level }, to);
    if (!r) return false;
    riding = { from: me.level, to, fromY: me.y, toY: r.y, t0: performance.now(), ms: r.travelMs };
    $('lift-msg').textContent = `Menuju Lantai ${to + 1} · ${FLOOR_NAMES[to]}`;
    fade.classList.add('on');
    return true;
  };
  const liftPanel = $('lift-panel');
  const liftButtons = [];
  for (let l = HOTEL_LEVEL_COUNT - 1; l >= 0; l--) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lift-btn';
    b.textContent = String(l + 1);
    b.title = `Lantai ${l + 1} · ${FLOOR_NAMES[l]}`;
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', () => ride(l));
    $('lift-grid').appendChild(b);
    liftButtons[l] = b;
  }
  let liftShown = false;
  let liftLevel = -1;

  // ---------- menu Jelajah ----------
  const panel = $('places-panel');
  const list = $('places-list');
  for (const group of GROUP_ORDER) {
    const items = places.filter((p) => p.group === group);
    if (!items.length) continue;
    const heading = document.createElement('div');
    heading.className = 'place-group';
    heading.textContent = group;
    list.appendChild(heading);
    for (const p of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'place-btn';
      b.textContent = p.level > 0 ? `${p.name} · Lt ${p.floor}` : p.name;
      b.addEventListener('click', () => {
        teleport(p.level, p.x, p.z);
        panel.hidden = true;
        toast(p.level > 0 ? `Lantai ${p.floor} · ${p.name}` : p.name);
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
  let placeKey = '';

  function frame(time) {
    requestAnimationFrame(frame);
    const delta = Math.min((time - last) / 1000, 0.05);
    last = time;

    let move = { x: 0, z: 0 };
    if (!riding) {
      move = cameraRelative(readInput(), camNow.yaw);
      move = doorAssist(me, move, world.levels[me.level].doors);
    }
    const moving = move.x !== 0 || move.z !== 0;
    if (moving) {
      const next = world.move(me, move.x * SPEED * delta, move.z * SPEED * delta);
      me.x = next.x;
      me.z = next.z;
      facing = Math.atan2(-move.x, -move.z);
      walkClock += delta;
    }

    // perjalanan lift: tinggi berubah halus, lantai tujuan menjadi nyata di akhir
    if (riding) {
      const t = clamp((performance.now() - riding.t0) / riding.ms, 0, 1);
      const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
      me.y = riding.fromY + (riding.toY - riding.fromY) * e;
      if (t >= 1) {
        me.level = riding.to;
        me.y = riding.toY;
        riding = null;
        fade.classList.remove('on');
        resetCamera();
        toast(`Lantai ${me.level + 1} · ${FLOOR_NAMES[me.level]}`);
      }
    }

    shownFacing = turnToward(shownFacing, facing, delta);
    avatar.position.x = me.x;
    avatar.position.z = me.z;
    avatar.position.y = me.y + (moving ? Math.abs(Math.sin(walkClock * 12)) * 0.08 : 0);
    avatar.rotation.y = shownFacing;
    applyPose(avatar, moving ? 'walk' : null, time / 1000, delta);
    blob.position.set(me.x, me.y + 0.04, me.z);

    // kamera mengorbit pemain; bila terhalang dinding, dinaikkan halus atau dipendekkan
    camState.pitch = clamp(camState.pitch, CAM_LIMITS.minPitch, CAM_LIMITS.maxPitch);
    camState.dist = clamp(camState.dist, CAM_LIMITS.minDist, CAM_LIMITS.maxDist);
    const ck = 1 - Math.exp(-12 * delta);
    camNow.yaw += (camState.yaw - camNow.yaw) * ck;
    camNow.pitch += (camState.pitch - camNow.pitch) * ck;
    camNow.dist += (camState.dist - camNow.dist) * ck;
    const wide = clamp((camNow.dist - 8) / 6, 0, 1);
    const fit = 1 + (Math.min(1.9, Math.max(1, 1.45 / camera.aspect)) - 1) * wide;
    const want = camNow.dist * fit;
    const eye = { x: me.x, y: me.y + 1.45, z: me.z };
    const boxes = riding ? [] : occludersFor(me.level);
    const camPose = chooseCameraPose(eye, camNow.yaw, camNow.pitch, want, boxes);
    camPitch = camPitch === null ? camPose.pitch : camPitch + (camPose.pitch - camPitch) * (1 - Math.exp(-6 * delta));
    const cp = Math.cos(camPitch);
    const dir = { x: Math.sin(camNow.yaw) * cp, y: Math.sin(camPitch), z: Math.cos(camNow.yaw) * cp };
    const { dist: freeArm } = resolveCameraDistance(eye, dir, want, boxes);
    camArm = camArm === 0 || freeArm < camArm ? freeArm : camArm + (freeArm - camArm) * (1 - Math.exp(-4 * delta));
    camera.position.set(eye.x + dir.x * camArm, eye.y + dir.y * camArm, eye.z + dir.z * camArm);
    const look = forwardLookBlend(camArm);
    const ahead = { x: eye.x - Math.sin(camNow.yaw) * 6, y: eye.y - 0.3, z: eye.z - Math.cos(camNow.yaw) * 6 };
    const lookY = me.y + 1.2;
    camera.lookAt(me.x + (ahead.x - me.x) * look, lookY + (ahead.y - lookY) * look, me.z + (ahead.z - me.z) * look);
    avatar.visible = camArm > 0.95;
    blob.visible = avatar.visible;

    // potongan tampak: di dalam bangunan hanya lantai sampai lantai pemain yang digambar; di luar, menara utuh
    const info = describePlace(world, me.x, me.z, me.level);
    const viewLevel = riding ? Math.max(riding.from, riding.to) : me.level;
    built.setView(viewLevel, info.inside || !!riding);
    const indoor = info.indoor && info.inside;
    indoorK += ((indoor ? 1 : 0) - indoorK) * (1 - Math.exp(-3 * delta));
    built.setIndoor(indoorK);
    indoorLight.intensity = 24 * indoorK;
    indoorLight.position.set(me.x, me.y + 2.6, me.z);

    // panel lift muncul saat berdiri di dalam kabin
    const inLift = !riding && !!world.liftAt(me.x, me.z);
    if (inLift !== liftShown) {
      liftShown = inLift;
      liftPanel.hidden = !inLift;
      if (inLift) liftLevel = -1; // paksa penyegaran sorotan
    }
    if (inLift && liftLevel !== me.level) {
      liftLevel = me.level;
      liftButtons.forEach((b, l) => {
        b.classList.toggle('current', l === me.level);
        b.disabled = l === me.level;
      });
    }

    const qChange = quality.tick(performance.now());
    if (qChange) renderer.setPixelRatio(qChange.ratio);
    renderer.render(scene, camera);

    const key = `${info.id}@${me.level}`;
    if (key !== placeKey) {
      placeKey = key;
      $('place').textContent = info.inside && me.level > 0 ? `Lantai ${me.level + 1} · ${FLOOR_NAMES[me.level]} · ${info.name}` : info.name;
    }
    if (!mapCanvas.hidden) drawMap(me, facing, me.level);
  }
  requestAnimationFrame(frame);

  window.__hotel = {
    state: () => ({ x: me.x, z: me.z, y: me.y, level: me.level, place: describePlace(world, me.x, me.z, me.level), riding: !!riding, lift: !!world.liftAt(me.x, me.z) }),
    cam: () => ({ yaw: camState.yaw, pitch: camState.pitch, dist: camState.dist }),
    renderStats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, pixelRatio: renderer.getPixelRatio() }),
    places: () => places,
    teleport, // hanya untuk pengujian dan menu Jelajah
    ride,
  };
}

start().catch((error) => {
  console.error('[hotel]', error);
  showError('Terjadi kesalahan saat memulai.', String(error?.stack ?? error));
});
