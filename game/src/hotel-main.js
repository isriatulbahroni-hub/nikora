import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { applyPose, createAvatar } from './avatar.js';
import { loadConfig, toWire } from './avatar-config.js';
import { createQualityGovernor } from './quality.js';
import { chooseCameraPose, forwardLookBlend, resolveCameraDistance } from './villa-camera.js';
import { doorAssist, turnToward } from './villa-motion.js';
import { FLOOR_NAMES, HOTEL_BUILDING, HOTEL_FORECOURT, HOTEL_LEVEL_COUNT, HOTEL_LEVEL_HEIGHT, HOTEL_PARKING, HOTEL_SITE, HOTEL_SPAWN, getHotelWorld, hotelLevelY, surfaceAt } from './hotel-layout.js';
import { buildHotelWorld } from './hotel-world.js';
import { mountLiftPanel } from './hotel-ui.js';
import { mountCarHud } from './car-hud.js';
import { createCarAudio } from './car-audio.js';
import { Fleet, hotelCars } from './vehicle-fleet.js';
import { createVehicleView } from './vehicle-view.js';
import { createCarRide } from './car-ride.js';
import { cockpitFov, eyeWorld, cockpitSpec } from './cockpit.js';
import { HIGHWAY_LIMIT, arrivalGate, gateArrival, gateAt, gateUrl } from './highway.js';
import { FLOOR_COLORS, GROUP_ORDER, cssColor, describePlace, hotelPlaces } from './hotel-places.js';
import { hoursAt, zoneFromSearch } from './day-night.js';
import { createStaffView } from './hotel-staff-view.js';
import { SKY_MODE_LABELS, createHotelSky } from './hotel-sky.js';
import { nightLevel } from './hotel-sky-data.js';
import { buildHotelSurroundings } from './hotel-surroundings.js';
import { BIRD_TARGET, BLEND_SECONDS, CAMERA_MODES, CINEMATIC_FOV, MODE_LIMITS, OBSERVER_POINTS, ORBIT_TARGETS, blendPose, cinematicPose, lookDir, observerFov, observerPoint, orbitPose, stepFree } from './hotel-camera.js';

// NIKORA Grand Hotel sebagai halaman sendiri (/hotel.html): menara 15 lantai yang dijelajahi dengan avatar (satu pemain).
// Geometri 3D dari hotel-world.js dan denah dari hotel-layout.js (dipakai bersama dunia villa); halaman ini hanya
// menambah rumput, kamera, lift, peta per lantai, dan menu Jelajah. Langit siang-senja-malam, awan, bintang, bulan, kabut,
// dan semua lampu menyala otomatis berasal dari hotel-sky.js (?sky=, ?tz=, tombol N).
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

/** Peta lingkungan ringan (RoomEnvironment) hanya untuk bahan mobil: cat dan krom memantulkan sesuatu, bukan hitam polos. */
function buildCarEnvMap(renderer) {
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return tex;
  } catch (error) {
    console.warn('[hotel] peta lingkungan mobil dilewati', error);
    return null;
  }
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
const hooks = { map: () => {}, camera: () => {}, modes: () => {}, mode: () => {}, places: () => {}, action: () => {}, sky: () => {}, horn: () => {} };
const vertKeys = new Set(); // R/F = naik/turun di kamera bebas
// lastDrag: kapan pemain terakhir memutar kamera (kamera mobil tidak melawan putaran itu); boost: Shift = kamera bebas 4x lebih cepat; vert: tombol naik/turun di layar
const camInput = { lastDrag: -1e9, boost: 1, vert: 0 };
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

function setupInput(canvas, ctl) {
  addEventListener('keydown', (e) => {
    camInput.boost = e.shiftKey ? 4 : 1;
    const k = e.key.toLowerCase();
    if (k in KEYS) {
      held.add(k);
      e.preventDefault();
    } else if (!e.repeat && k === 'm') hooks.map();
    else if (!e.repeat && k === 'c') hooks.camera();
    else if (!e.repeat && k === 'j') hooks.places();
    else if (!e.repeat && k === 'n') hooks.sky(); // ganti mode langit: otomatis, siang, senja, malam, demo
    else if (!e.repeat && k === 'h') hooks.horn(true);
    else if (!e.repeat && (k === 'e' || k === ' ')) {
      hooks.action(); // naik/turun mobil
      e.preventDefault();
    }
    else if (k === '[') ctl.turn(-0.12);
    else if (k === ']') ctl.turn(0.12);
    else if (k === '-') ctl.zoom(1.1);
    else if (k === '=' || k === '+') ctl.zoom(0.9);
    else if (!e.repeat && k === 'v') hooks.modes();
    else if (!e.repeat && /^[1-7]$/.test(k)) hooks.mode(Number(k) - 1);
    else if (k === 'r' || k === 'f') vertKeys.add(k);
  });
  addEventListener('keyup', (e) => { camInput.boost = e.shiftKey ? 4 : 1; vertKeys.delete(e.key.toLowerCase()); held.delete(e.key.toLowerCase()); if (e.key.toLowerCase() === 'h') hooks.horn(false); });
  addEventListener('blur', () => { held.clear(); vertKeys.clear(); });
  canvas.addEventListener('wheel', (e) => {
    ctl.zoom(e.deltaY > 0 ? 1.1 : 0.9);
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
    camInput.lastDrag = performance.now();
    if (pointers.size === 1) {
      ctl.look(dx, dy);
    } else if (pointers.size === 2 && pinch) {
      const now = twoFingers();
      if (now.d > 1 && pinch.d > 1) ctl.zoom(pinch.d / now.d);
      let turn = now.angle - pinch.angle;
      if (turn > Math.PI) turn -= Math.PI * 2;
      if (turn < -Math.PI) turn += Math.PI * 2;
      ctl.turn(turn);
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
  return (self, facing, level, others = []) => {
    layers[level] ??= makeLayer(level);
    ctx.drawImage(layers[level], 0, 0);
    for (const o of others) {
      if (Math.round((o.y ?? 0) / HOTEL_LEVEL_HEIGHT) !== level) continue; // hanya pemain di lantai yang sama
      ctx.beginPath();
      ctx.arc(edgeX(o.x), edgeZ(o.z), 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ff8a3d';
      ctx.fill();
    }
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

// ---------- cahaya dasar dan tanah (langit, kabut, bintang, dan lampu malam: hotel-sky.js; hotel-world.js hanya menggambar hotel, jalan, dan halamannya) ----------
function buildEnvironment(scene) {
  const hemi = new THREE.HemisphereLight(0xdbeaff, 0x7a6b55, 1.0);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.3);
  sun.position.set(150, 260, -120);
  scene.add(hemi, sun);
  const flat = (w, d, x, y, z, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    scene.add(m);
  };
  flat(1600, 1600, 0, 0, 300, 0x5f9a4e); // rumput
  flat(HOTEL_SITE.maxX - HOTEL_SITE.minX, HOTEL_SITE.maxZ - HOTEL_SITE.minZ, (HOTEL_SITE.minX + HOTEL_SITE.maxX) / 2, 0.012, (HOTEL_SITE.minZ + HOTEL_SITE.maxZ) / 2, 0xcfc6b2); // paving tapak
  return { hemi, sun };
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
  // maxTier 2: resolusi tidak pernah jatuh di bawah 1x (tingkat 3 = 0,75x membuat fasad menara buram dan bergerigi, apalagi saat merekam layar)
  const quality = createQualityGovernor({ deviceRatio: window.devicePixelRatio || 1, cap: window.matchMedia?.('(pointer: coarse)').matches ? 2.25 : 2, floor: lowQuality ? 2 : 0, maxTier: 2 });
  renderer.setPixelRatio(quality.settings().ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const lights = buildEnvironment(scene);
  const built = buildHotelWorld(scene);
  const surroundings = buildHotelSurroundings(scene, { low: lowQuality }); // satelit, kota, arena, hutan (hotel-surroundings.js)
  // Mobil bersama di drop-off/parkir hotel (8 mobil). Logika naik/turun/setir/jaringan: car-ride.js (sama dengan vila).
  const fleet = new Fleet({ specs: hotelCars(), selfId: 'lokal', env: { colliders: world.levels[0].colliders, surfaceAt, limit: HIGHWAY_LIMIT } });
  const carAudio = createCarAudio();
  let doorHook = () => {};
  const carView = createVehicleView({ scene, fleet, mirrors: !lowQuality, envMap: buildCarEnvMap(renderer), onDoor: (car, opening) => { if (opening) doorHook(car); } });
  // Karyawan hotel: ratusan petugas disimulasikan sebagai jadwal; hanya yang dekat pemain digambar (hotel-staff.js, hotel-staff-view.js).
  // Jam kerja mengikuti jam asli di zona waktu acara (?tz=, bawaan WIB), sama seperti langit; ?jam=10 mengunci jam (pengujian).
  const staffSearch = new URLSearchParams(window.location.search);
  const staffZone = zoneFromSearch(window.location.search);
  const jamParam = staffSearch.get('jam');
  const fixedHour = jamParam !== null && jamParam.trim() !== '' && Number.isFinite(Number(jamParam)) ? Number(jamParam) : null;
  const staffView = createStaffView({ scene, hourNow: () => fixedHour ?? hoursAt(Date.now(), staffZone) });
  // Jarak pandang 6,5 km supaya menara 4,2 km dan lampunya terlihat dari jauh (ketepatan kedalaman ditentukan jarak dekat, bukan jauh).
  const camera = new THREE.PerspectiveCamera(48, 1, 0.2, 6500);
  const sky = createHotelSky({ scene, renderer, camera, lights, search: window.location.search, low: lowQuality });
  const indoorLight = new THREE.PointLight(0xffe2b8, 0, 26, 1.3);
  scene.add(indoorLight);
  let indoorK = 0;

  const camState = { yaw: Math.PI, pitch: CAM_PRESETS[0].pitch, dist: CAM_PRESETS[0].dist }; // mulai menghadap fasad hotel (selatan)
  const camNow = { ...camState };
  let camArm = 0;
  let camPitch = null;
  let preset = 0;
  let cockpitOn = false; // kamera di dalam kabin (hanya saat mengemudi): setelah preset terakhir, tombol kamera masuk ke kabin
  let cockpitSeen = false;
  const cyclePreset = () => {
    if (fleet.driving) {
      if (cockpitOn) { cockpitOn = false; preset = 0; } else if (preset === CAM_PRESETS.length - 1) { cockpitOn = true; return; } else preset += 1;
      camState.pitch = CAM_PRESETS[preset].pitch;
      camState.dist = CAM_PRESETS[preset].dist;
      return;
    }
    preset = (preset + 1) % CAM_PRESETS.length;
    camState.pitch = CAM_PRESETS[preset].pitch;
    camState.dist = CAM_PRESETS[preset].dist;
  };
  const baseFov = () => clamp(48 + (1.2 - camera.aspect) * 26, 48, 62);
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = baseFov();
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);
  // ---------- mode kamera: orang ketiga / pertama / bebas / orbit / burung / sinematik / pengamat (hotel-camera.js) ----------
  let camMode = 'follow';
  let lastPose = null; // pose kamera terakhir yang dipakai (titik awal peralihan halus antar mode)
  let blend = null; // { t, from }
  let camClock = 0;
  let observerIdx = 0;
  let orbitIdx = 0;
  let fovTarget = 48;
  const orbitState = { ...ORBIT_TARGETS[0], yaw: 0.6 };
  const orbitNow = { ...orbitState };
  const freeCam = { x: 0, y: 5, z: 0, yaw: 0, pitch: 0.3 };
  const modeState = () => (camMode === 'orbit' || camMode === 'bird' ? orbitState : camMode === 'free' ? freeCam : camState);
  const canLook = () => camMode !== 'cinematic' && camMode !== 'observer';
  const ctl = {
    look(dx, dy) {
      if (!canLook()) return;
      const s = modeState();
      const L = MODE_LIMITS[camMode];
      s.yaw -= dx * 0.006;
      s.pitch = clamp(s.pitch + dy * 0.005, L.minPitch, L.maxPitch);
    },
    turn(a) { if (canLook()) modeState().yaw -= a; },
    zoom(f) {
      const L = MODE_LIMITS[camMode];
      if (L.maxDist > 0) { const s = modeState(); s.dist = clamp(s.dist * f, L.minDist, L.maxDist); }
    },
  };
  const observerYaw = () => { const o = OBSERVER_POINTS[observerIdx]; return Math.atan2(o.x - me.x, o.z - me.z); };
  const moveYaw = () => (camMode === 'orbit' || camMode === 'bird' ? orbitNow.yaw : camMode === 'observer' ? observerYaw() : camNow.yaw);
  let refreshCamUi = () => {};
  const setMode = (id) => {
    if (id === camMode || !CAMERA_MODES.some((m) => m.id === id)) return;
    if (id === 'first' && fleet.driving) { // saat mengemudi, "orang pertama" = kamera kabin
      if (camMode !== 'follow') setMode('follow');
      cockpitOn = true;
      toast('Kamera kabin');
      return;
    }
    if (camMode === 'first') camState.pitch = CAM_PRESETS[preset].pitch;
    if (lastPose) blend = { t: 0, from: lastPose };
    camMode = id;
    cockpitOn = false;
    if (id === 'first') {
      camState.pitch = 0;
      camState.yaw = shownFacing;
      camNow.yaw = shownFacing;
      camNow.pitch = 0;
    } else if (id === 'free') {
      const d = camera.getWorldDirection(new THREE.Vector3());
      Object.assign(freeCam, { x: camera.position.x, y: Math.max(1.2, camera.position.y), z: camera.position.z, yaw: Math.atan2(-d.x, -d.z), pitch: clamp(Math.asin(-d.y), -1.5, 1.5) });
    } else if (id === 'orbit') {
      Object.assign(orbitState, ORBIT_TARGETS[orbitIdx], { yaw: camNow.yaw });
      Object.assign(orbitNow, orbitState);
    } else if (id === 'bird') {
      Object.assign(orbitState, BIRD_TARGET, { yaw: camNow.yaw });
      Object.assign(orbitNow, orbitState);
    } else if (id === 'observer') {
      observerIdx = OBSERVER_POINTS.indexOf(observerPoint(me));
    }
    refreshCamUi();
    toast(CAMERA_MODES.find((m) => m.id === id).label);
  };
  const focusNext = () => {
    if (camMode === 'orbit') {
      orbitIdx = (orbitIdx + 1) % ORBIT_TARGETS.length;
      Object.assign(orbitState, ORBIT_TARGETS[orbitIdx]);
      toast(`Fokus: ${ORBIT_TARGETS[orbitIdx].name}`);
    } else if (camMode === 'observer') {
      observerIdx = (observerIdx + 1) % OBSERVER_POINTS.length;
      toast(`Pengamat: ${OBSERVER_POINTS[observerIdx].name}`);
    } else if (camMode === 'bird') {
      Object.assign(orbitState, BIRD_TARGET);
      toast('Pandangan burung diatur ulang');
    }
  };
  hooks.camera = () => (camMode === 'follow' ? cyclePreset() : focusNext());
  hooks.mode = (i) => { if (CAMERA_MODES[i]) setMode(CAMERA_MODES[i].id); };
  /** Pose kamera final menurut mode; followPose = pose kamera orbit-pemain lama (tetap dihitung agar peralihan kembali halus). */
  const applyCameraMode = (followPose, delta, rawInput) => {
    let pose = followPose;
    let fov = baseFov();
    if (camMode === 'first') {
      const dir = lookDir(camNow.yaw, camNow.pitch);
      const p = [me.x, me.y + 1.62, me.z];
      pose = { pos: p, look: [p[0] + dir.x * 10, p[1] + dir.y * 10, p[2] + dir.z * 10] };
      fov = 72;
    } else if (camMode === 'free') {
      const vertical = camInput.vert + (vertKeys.has('r') ? 1 : 0) - (vertKeys.has('f') ? 1 : 0);
      const drive = !fleet.mine; // di dalam mobil joystick mengemudi; kamera bebas naik/turun lewat tombol saja
      Object.assign(freeCam, stepFree(freeCam, { right: drive ? rawInput.x : 0, forward: drive ? rawInput.z : 0, up: vertical }, delta, camInput.boost));
      const dir = lookDir(freeCam.yaw, freeCam.pitch);
      pose = { pos: [freeCam.x, freeCam.y, freeCam.z], look: [freeCam.x + dir.x * 10, freeCam.y + dir.y * 10, freeCam.z + dir.z * 10] };
    } else if (camMode === 'orbit' || camMode === 'bird') {
      const k = 1 - Math.exp(-5 * delta);
      for (const key of ['x', 'y', 'z', 'dist', 'pitch', 'yaw']) orbitNow[key] += (orbitState[key] - orbitNow[key]) * k;
      pose = orbitPose(orbitNow);
      if (camMode === 'bird') fov = 55;
    } else if (camMode === 'cinematic') {
      camClock += delta;
      pose = cinematicPose(camClock);
      fov = CINEMATIC_FOV;
    } else if (camMode === 'observer') {
      const o = OBSERVER_POINTS[observerIdx];
      pose = { pos: [o.x, o.y, o.z], look: [me.x, me.y + 1.4, me.z] };
      fov = observerFov(Math.hypot(o.x - me.x, o.y - me.y - 1.4, o.z - me.z));
    }
    if (blend) {
      blend.t += delta / BLEND_SECONDS;
      pose = blendPose(blend.from, pose, blend.t);
      if (blend.t >= 1) blend = null;
    }
    fovTarget = fov;
    return pose;
  };
  const updateFov = (delta) => {
    if (cockpitOn && fleet.driving) return; // kamera kabin mengatur FOV-nya sendiri
    const d = fovTarget - camera.fov;
    if (Math.abs(d) > 0.02) {
      camera.fov += d * (1 - Math.exp(-5 * delta));
      camera.updateProjectionMatrix();
    }
  };
  setupInput(renderer.domElement, ctl);
  $('cam-button').addEventListener('click', () => hooks.modes());

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
  const avatarConfig = loadConfig(storage);
  const avatar = createAvatar({ config: avatarConfig, name });
  avatar.rotation.order = 'YXZ';
  scene.add(avatar);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  // Tamu yang datang dari tempat acara (?from=villa|hall|royal|masjid) muncul di gerbangnya, menghadap hotel; selain itu di drop-off.
  const arrival = arrivalGate(params.get('from'));
  const arrivalPose = arrival ? gateArrival(arrival) : null;
  const me = { x: arrivalPose?.x ?? HOTEL_SPAWN.x, z: arrivalPose?.z ?? HOTEL_SPAWN.z, level: 0, stair: null, y: 0 };
  let facing = arrivalPose?.facing ?? Math.PI; // 0 = utara (-z); mulai menghadap hotel di selatan
  if (arrivalPose) {
    camState.yaw = facing;
    camNow.yaw = facing;
  }
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
  hooks.sky = () => toast(`Langit: ${SKY_MODE_LABELS[sky.cycleMode()]}`);

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
  const liftPanel = mountLiftPanel({ levelCount: HOTEL_LEVEL_COUNT, names: FLOOR_NAMES, onPick: ride });

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
    $('cam-panel').hidden = true;
  };
  $('places-button').addEventListener('click', () => hooks.places());
  $('places-close').addEventListener('click', () => {
    panel.hidden = true;
  });

  // ---------- menu mode kamera ----------
  const camPanel = $('cam-panel');
  const camList = $('cam-list');
  const camCycle = $('cam-cycle');
  const modeBtns = CAMERA_MODES.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'place-btn';
    b.textContent = `${m.icon} ${m.label}`;
    b.addEventListener('click', () => { setMode(m.id); camPanel.hidden = true; });
    camList.appendChild(b);
    return b;
  });
  const holdVertical = (id, dir) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); camInput.vert = dir; });
    const stop = () => { camInput.vert = 0; };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
  };
  holdVertical('cam-up', 1);
  holdVertical('cam-down', -1);
  $('cam-focus').addEventListener('click', () => focusNext());
  $('cam-back').addEventListener('click', () => setMode('follow'));
  camCycle.addEventListener('click', () => hooks.camera());
  $('cam-close').addEventListener('click', () => { camPanel.hidden = true; });
  refreshCamUi = () => {
    modeBtns.forEach((b, i) => b.classList.toggle('on', CAMERA_MODES[i].id === camMode));
    $('cam-bar').hidden = camMode === 'follow';
    $('cam-up').hidden = camMode !== 'free';
    $('cam-down').hidden = camMode !== 'free';
    $('cam-focus').hidden = !(camMode === 'orbit' || camMode === 'bird' || camMode === 'observer');
    camCycle.hidden = !(camMode === 'follow' || camMode === 'orbit' || camMode === 'bird' || camMode === 'observer');
    camCycle.textContent = camMode === 'follow' ? 'Ganti jarak kamera (C)' : camMode === 'bird' ? 'Atur ulang pandangan (C)' : 'Ganti sasaran (C)';
  };
  hooks.modes = () => { camPanel.hidden = !camPanel.hidden; panel.hidden = true; };
  refreshCamUi();

  const drawMap = createMinimap();
  let last = performance.now();

  // ---------- mobil dan jaringan ----------
  const actBtn = $('act-button');
  const carHud = mountCarHud({ onHorn: (down) => carRide.horn(down) });
  const carRide = createCarRide({
    fleet, view: carView, hud: carHud, audio: carAudio, camState, toast,
    exit: (p) => world.move({ x: p.x, z: p.z, level: 0, stair: null, y: 0 }, 0, 0), // geser bila titik turun mengenai penghalang
    isDragging: () => performance.now() - camInput.lastDrag < 1500,
    isCabin: () => cockpitOn,
  });
  doorHook = (car) => carAudio.door(Math.hypot(car.x - me.x, car.z - me.z));
  hooks.action = () => {
    if (riding) return; // sedang di dalam lift
    if (fleet.mine) carRide.leave(me);
    else if (me.level === 0) carRide.board(me);
  };
  hooks.horn = (down) => carRide.horn(down);
  actBtn.addEventListener('click', () => hooks.action());
  let multiplayer = null;
  let netStatus = 'Menyambung…';
  // Multiplayer lewat LiveKit (ruang "hotel" terpisah dari vila). Dimuat belakangan: tanpa jaringan hotel tetap bisa dijelajahi sendiri.
  import('./multiplayer-view.js')
    .then(({ startMultiplayer }) => startMultiplayer({ scene, search: window.location.search, name, world: 'hotel', poseFor: (id) => fleet.seatPose(id), useVideoCall: false, onError: (m) => { netStatus = `Offline · ${m}`; } }))
    .then((session) => {
      multiplayer = session;
      if (!session) {
        if (netStatus === 'Menyambung…') netStatus = 'Offline';
        return;
      }
      session.net.setAvatar?.(toWire(avatarConfig));
      carRide.wire(session.net, me); // mobil bersama: pose dan kursi disiarkan lewat LiveKit
    })
    .catch((error) => {
      console.warn('[hotel] jaringan tidak tersedia:', error);
      netStatus = 'Offline';
    });
  let placeKey = '';
  let leavingTo = null; // gerbang yang sedang dimasuki (cegah pindah halaman dua kali)

  function frame(time) {
    requestAnimationFrame(frame);
    const delta = Math.min((time - last) / 1000, 0.05);
    last = time;

    const rawInput = riding ? { x: 0, z: 0 } : readInput();
    let move = { x: 0, z: 0 };
    const frozen = camMode === 'free' || camMode === 'cinematic'; // joystick menggerakkan kamera (bebas) atau tidak dipakai (sinematik)
    if (!riding && !fleet.mine && !frozen) { // di dalam mobil joystick = gas dan setir, bukan berjalan
      move = cameraRelative(rawInput, moveYaw());
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

    // mobil: pengemudi menjalankan fisika; pengemudi dan penumpang menempel di kursinya
    const car = carRide.step(me, { delta, rawInput });
    if (fleet.mine && camMode === 'first') setMode('follow'); // naik mobil dari mode orang pertama: kembali ke kamera pemain
    // Gerbang tempat acara di ujung jalan raya: berjalan atau mengemudi melewatinya = pindah ke halaman tempat acara itu
    const gate = leavingTo || me.level !== 0 ? null : gateAt(me.x, me.z);
    if (gate) {
      leavingTo = gate;
      toast(`Memasuki ${gate.label}…`, 3000);
      setTimeout(() => { window.location.href = gateUrl(gate, window.location.search); }, 700);
    }
    const seatPose = car.riding ? fleet.seatPose(car.sit) : null;
    if (car.riding) facing = car.facing;
    shownFacing = seatPose ? seatPose.rotY : turnToward(shownFacing, facing, delta);
    avatar.position.x = me.x;
    avatar.position.z = me.z;
    avatar.position.y = seatPose ? seatPose.y : me.y + (moving ? Math.abs(Math.sin(walkClock * 12)) * 0.08 : 0);
    avatar.rotation.y = shownFacing;
    avatar.userData.seated = !!seatPose;
    applyPose(avatar, moving ? 'walk' : null, time / 1000, delta);
    const others = multiplayer ? multiplayer.net.players.filter((p) => p.id !== multiplayer.net.id) : [];
    if (multiplayer) {
      multiplayer.view.update(delta, time / 1000); // pemain lain
      multiplayer.sendInput(move.x, move.z, facing, time, fleet.sitId, { x: me.x, z: me.z, y: me.y }); // sit = kursi mobil (id >= 1000) atau null
    }
    const online = multiplayer ? (multiplayer.net.status === 'reconnecting' ? 'Menyambung ulang…' : `Online: ${others.length + 1}`) : netStatus;
    if ($('online').textContent !== online) $('online').textContent = online;
    blob.position.set(me.x, me.y + 0.1, me.z);
    staffView.update(me, delta, time / 1000); // petugas hotel yang dekat pemain

    // kamera mengorbit pemain; bila terhalang dinding atau langit-langit, dinaikkan halus atau dipendekkan
    const camL = MODE_LIMITS[camMode === 'first' ? 'first' : 'follow'];
    camState.pitch = clamp(camState.pitch, camL.minPitch, camL.maxPitch);
    camState.dist = clamp(camState.dist, CAM_LIMITS.minDist, CAM_LIMITS.maxDist);
    const ck = 1 - Math.exp(-12 * delta);
    camNow.yaw += (camState.yaw - camNow.yaw) * ck;
    camNow.pitch += (camState.pitch - camNow.pitch) * ck;
    camNow.dist += (camState.dist - camNow.dist) * ck;
    const wide = clamp((camNow.dist - 8) / 6, 0, 1);
    const fit = 1 + (Math.min(1.9, Math.max(1, 1.45 / camera.aspect)) - 1) * wide;
    const want = camNow.dist * fit;
    const eye = { x: me.x, y: me.y + 1.45, z: me.z };
    const boxes = riding ? [] : built.occluders(me.level);
    const camPose = chooseCameraPose(eye, camNow.yaw, Math.max(CAM_LIMITS.minPitch, camNow.pitch), want, boxes);
    camPitch = camPitch === null ? camPose.pitch : camPitch + (camPose.pitch - camPitch) * (1 - Math.exp(-6 * delta));
    const cp = Math.cos(camPitch);
    const dir = { x: Math.sin(camNow.yaw) * cp, y: Math.sin(camPitch), z: Math.cos(camNow.yaw) * cp };
    const { dist: freeArm } = resolveCameraDistance(eye, dir, want, boxes);
    camArm = camArm === 0 || freeArm < camArm ? freeArm : camArm + (freeArm - camArm) * (1 - Math.exp(-4 * delta));
    const look = forwardLookBlend(camArm);
    const ahead = { x: eye.x - Math.sin(camNow.yaw) * 6, y: eye.y - 0.3, z: eye.z - Math.cos(camNow.yaw) * 6 };
    const lookY = me.y + 1.2;
    const followPose = {
      pos: [eye.x + dir.x * camArm, eye.y + dir.y * camArm, eye.z + dir.z * camArm],
      look: [me.x + (ahead.x - me.x) * look, lookY + (ahead.y - lookY) * look, me.z + (ahead.z - me.z) * look],
    };
    const pose = applyCameraMode(followPose, delta, rawInput); // mode kamera (hotel-camera.js), dengan peralihan halus antar mode
    camera.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    camera.lookAt(pose.look[0], pose.look[1], pose.look[2]);
    lastPose = pose;
    updateFov(delta);
    avatar.visible = camMode === 'follow' ? camArm > 0.95 : camMode !== 'first';
    blob.visible = avatar.visible;

    // kamera kabin: mata di kepala pengemudi, menghadap ke depan mobil, sedikit mengintip ke arah belokan; avatar disembunyikan
    const inCabin = cockpitOn && !!fleet.driving;
    if (!fleet.driving) cockpitOn = false;
    carView.setCockpit(inCabin ? fleet.driving : null);
    carAudio.cabin(inCabin);
    if (inCabin) {
      const dc = fleet.driving;
      const e = eyeWorld(dc, cockpitSpec(dc.spec), dc.steer * 0.35);
      camera.position.set(e.x, e.y, e.z);
      camera.lookAt(e.x + Math.sin(e.yaw) * 20, e.y - 0.12, e.z + Math.cos(e.yaw) * 20);
      camera.fov = cockpitFov(dc.speed, dc.spec.maxSpeed, camera.aspect);
      camera.updateProjectionMatrix();
      avatar.visible = false;
      blob.visible = false;
      cockpitSeen = true;
    } else if (cockpitSeen) {
      cockpitSeen = false;
      resize(); // kembalikan FOV kamera orbit
    }

    // di dalam ruangan beratap: cahaya langit diredam halus dan lampu ruangan menyala mengikuti pemain
    const info = describePlace(world, me.x, me.z, me.level);
    const indoor = info.indoor && info.inside;
    indoorK += ((indoor ? 1 : 0) - indoorK) * (1 - Math.exp(-3 * delta));
    sky.applyLights(indoorK); // intensitas dasar siang 1,0 dan 1,3 seperti semula; malam lebih redup dan kebiruan
    indoorLight.intensity = 24 * indoorK;
    indoorLight.position.set(me.x, me.y + 2.6, me.z);

    // panel lift muncul saat berdiri di dalam kabin
    liftPanel.update(!riding && !fleet.mine && !!world.liftAt(me.x, me.z), me.level);
    const carNear = !riding && !fleet.mine && me.level === 0 && fleet.nearest(me) !== null;
    const actText = riding ? '' : fleet.mine ? 'Turun' : carNear ? 'Naik' : '';
    if (actText) actBtn.textContent = actText;
    actBtn.hidden = !actText;

    sky.update(time); // langit, awan, bintang, dan lampu mengikuti kamera yang sudah final
    surroundings.setNight(nightLevel(sky.phase())); // jendela kota dan menara satelit menyala di malam hari
    const qChange = quality.tick(performance.now());
    if (qChange) renderer.setPixelRatio(qChange.ratio);
    if (inCabin) carView.renderMirrors(renderer, scene);
    renderer.render(scene, camera);

    const key = `${info.id}@${me.level}`;
    if (key !== placeKey) {
      placeKey = key;
      $('place').textContent = info.inside && me.level > 0 ? `Lantai ${me.level + 1} · ${FLOOR_NAMES[me.level]} · ${info.name}` : info.name;
    }
    if (!mapCanvas.hidden) drawMap(me, facing, me.level, others);
  }
  requestAnimationFrame(frame);

  window.__hotel = {
    state: () => ({ x: me.x, z: me.z, y: me.y, level: me.level, place: describePlace(world, me.x, me.z, me.level), riding: !!riding, lift: !!world.liftAt(me.x, me.z) }),
    cam: () => ({ yaw: camState.yaw, pitch: camState.pitch, dist: camState.dist }),
    renderStats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, pixelRatio: renderer.getPixelRatio() }),
    places: () => places,
    staff: () => staffView.stats(), // petugas yang sedang digambar (pengujian)
    sky: () => sky.info(), // langit dan lampu saat ini (pengujian)
    surroundings: () => surroundings.info(), // satelit, kota, pohon (pengujian)
    setSky: (mode) => sky.setMode(mode), // auto | day | sunset | night | cycle (pengujian)
    cars: () => fleet.cars.map((c) => ({ id: c.id, model: c.model, x: c.x, z: c.z, heading: c.heading, speed: c.speed, seats: c.seats.slice() })), // pengujian
    board: () => carRide.board(me),
    cockpit: () => cockpitOn, // kamera kabin aktif (pengujian)
    cycleCamera: () => hooks.camera(), // sama dengan tombol C: ganti jarak (orang ketiga) atau sasaran (orbit/pengamat) (pengujian)
    camMode: () => camMode,
    setCameraMode: (id) => setMode(id), // pengujian dan menu mode kamera
    freeCam: () => ({ ...freeCam }),
    driving: () => (fleet.driving ? { model: fleet.driving.model, speed: fleet.driving.speed, engine: fleet.driving.engine, steer: fleet.driving.steer, slip: fleet.driving.slip, tyreTemp: fleet.driving.tyreTemp } : null),
    teleport, // hanya untuk pengujian dan menu Jelajah
    leavingTo: () => leavingTo?.id ?? null,
    ride,
  };
}

start().catch((error) => {
  console.error('[hotel]', error);
  showError('Terjadi kesalahan saat memulai.', String(error?.stack ?? error));
});
