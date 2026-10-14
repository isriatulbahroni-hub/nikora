import * as THREE from 'three';
import { applyPose, createAvatar, setStageRing } from './avatar.js';
import { loadConfig, toWire } from './avatar-config.js';
import { startMultiplayer } from './multiplayer-view.js';
import { loadEventInfo, parseEventParams } from './event-context.js';
import './gate.css';
import { mountGate, shouldShowGate } from './gate.js';
import { LEVEL_HEIGHT, VILLA_SCREEN, findNearestSpot, getVillaWorld, levelY, roomAt, sameVoiceSpace, spotPose } from './villa-layout.js';
import { buildCameraOccluders, resolveCameraDistance } from './villa-camera.js';
import './screen.css';
import { createScreen } from './screen/screen-setup.js';
import { createQualityGovernor } from './quality.js';
// Kualitas grafis adaptif: turunkan resolusi render bila HP tersendat (lebih-lebih saat video layar diputar).
const lowQuality = new URLSearchParams(window.location.search).get('q') === 'low';
function applyQuality(renderer, scene, q) {
  renderer.setPixelRatio(q.ratio);
  if (renderer.shadowMap.enabled !== q.shadows) {
    renderer.shadowMap.enabled = q.shadows;
    scene.traverse((o) => {
      if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; });
    });
  }
}

import { createPartyController, stageIds } from './party.js';
import { takeRoleKey } from './role-key.js';
import { renderPartyPanel } from './party-panel.js';
import { VOICE_CROWD, VoiceChat } from './voice.js';
import { buildVillaWorld } from './villa-world.js';

const PLAYER_SPEED = 5.2; // harus sama dengan server (ROOM_RULES.playerSpeed)
const SNAP_DISTANCE = 2.5; // jika posisi klien menyimpang dari server lebih dari ini, ikuti server
const world = getVillaWorld();
const $ = (id) => document.getElementById(id);

function showError(message, detail = '') {
  $('villa-error').style.display = 'grid';
  $('villa-error-text').textContent = message;
  $('villa-error-detail').textContent = detail;
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

const hooks = { action: () => {}, map: () => {}, mic: () => {}, camera: () => {} };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const CAM_LIMITS = Object.freeze({ minPitch: 0.06, maxPitch: 1.5, minDist: 1.5, maxDist: 70 });
// Sudut kamera siap pakai: Orang ketiga (setinggi manusia), Lebar, Udara, dan Atas
const CAM_PRESETS = Object.freeze([{ pitch: 0.28, dist: 5.6 }, { pitch: 0.55, dist: 11 }, { pitch: 0.95, dist: 21 }, { pitch: 1.5, dist: 44 }]);

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
    } else if (!e.repeat && (k === 'e' || k === ' ')) {
      hooks.action();
      e.preventDefault();
    } else if (!e.repeat && k === 'm') hooks.map();
    else if (!e.repeat && k === 'c') hooks.camera();
    else if (k === '[') camState.yaw += 0.12;
    else if (k === ']') camState.yaw -= 0.12;
    else if (k === '-') camState.dist = clamp(camState.dist * 1.1, CAM_LIMITS.minDist, CAM_LIMITS.maxDist);
    else if (k === '=' || k === '+') camState.dist = clamp(camState.dist * 0.9, CAM_LIMITS.minDist, CAM_LIMITS.maxDist);
    else if (!e.repeat && k === 'v') hooks.mic();
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

// ---------- minimap ----------
const MAP_COLORS = {
  hall: '#ece4d4', lobby: '#d9cbb0', suite: '#a9805a', spa: '#a6cdc8', bridal: '#ecd2da',
  restaurant: '#bf9f7c', kitchen: '#c3c8ca', corridor: '#cdbb9c', guest: '#d4bc96',
  lounge: '#e0cfae', library: '#a98660', terrace: '#bcd4b2', stair: '#c9c1b2',
};
function createMinimap() {
  const canvas = $('minimap');
  const ctx = canvas.getContext('2d');
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const sx = canvas.width / (maxX - minX);
  const sz = canvas.height / (maxZ - minZ);
  const px = (x) => (x - minX) * sx;
  const pz = (z) => (z - minZ) * sz;
  const makeLayer = (level) => {
    const layer = document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const l = layer.getContext('2d');
    const data = world.levels[level];
    const rect = (r) => l.fillRect(px(r[0]), pz(r[1]), (r[2] - r[0]) * sx, (r[3] - r[1]) * sz);
    if (level === 0) {
      l.fillStyle = '#5a9a4e';
      l.fillRect(0, 0, layer.width, layer.height);
      for (const z of world.zones) {
        if (z.kind === 'courtyard') l.fillStyle = '#d7c9ae';
        else if (z.kind === 'parking') l.fillStyle = '#41444a';
        else continue;
        rect(z.rect);
      }
      l.fillStyle = '#dcd0b8';
      l.fillRect(px(-2.5), pz(16), 5 * sx, 26 * sz);
      l.fillStyle = '#39c3df';
      l.fillRect(px(-7), pz(2), 14 * sx, 14 * sz);
      l.fillStyle = '#fff';
      l.fillRect(px(-1.5), pz(2), 3 * sx, 14 * sz);
    } else {
      l.fillStyle = '#2f3a35'; // bayangan lantai bawah sebagai latar
      l.fillRect(0, 0, layer.width, layer.height);
      l.fillStyle = '#46544c';
      for (const r of world.levels[level - 1].rooms) rect(r.rect);
    }
    for (const r of data.rooms) {
      l.fillStyle = MAP_COLORS[r.kind] ?? '#ddd';
      rect(r.kind === 'stair' && level > 0 ? r.landing : r.rect);
    }
    l.fillStyle = '#5a4a3a';
    for (const w of data.walls) {
      if (w.orient === 'h') l.fillRect(px(w.a), pz(w.coord) - 0.6, (w.b - w.a) * sx, 1.2);
      else l.fillRect(px(w.coord) - 0.6, pz(w.a), 1.2, (w.b - w.a) * sz);
    }
    l.fillStyle = '#f3d58a'; // tangga
    for (const s of world.stairs) if (s.from === level || s.to === level) l.fillRect(px(s.x1), pz(Math.min(s.zBottom, s.zTop)), (s.x2 - s.x1) * sx, Math.abs(s.zBottom - s.zTop) * sz);
    return layer;
  };
  const layers = world.levels.map((_, level) => makeLayer(level));
  // di luar kompleks vila titik dijepit ke tepi peta (pemain boleh berjalan jauh keluar)
  const edgeX = (x) => px(Math.min(maxX, Math.max(minX, x)));
  const edgeZ = (z) => pz(Math.min(maxZ, Math.max(minZ, z)));
  const dot = (x, z, color, r) => {
    ctx.beginPath();
    ctx.arc(edgeX(x), edgeZ(z), r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };
  return (self, others, level = 0) => {
    ctx.drawImage(layers[Math.min(layers.length - 1, Math.max(0, level))], 0, 0);
    for (const o of others) if (Math.round((o.y ?? 0) / LEVEL_HEIGHT) === level) dot(o.x, o.z, '#ff8a3d', 3);
    dot(self.x, self.z, '#fff', 4.5);
    dot(self.x, self.z, '#e23b3b', 2.8);
  };
}

// ---------- start ----------
async function start() {
  const supabase = { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY };
  // Tamu dari undangan melewati gerbang dulu; dunia tetap memuat di belakangnya.
  const gate = shouldShowGate(window.location.search) ? mountGate({ world: 'villa', search: window.location.search, supabase }) : null;
  if (!hasWebGL2()) {
    showError('Browser ini tidak mendukung WebGL 2. Aktifkan akselerasi perangkat keras lalu muat ulang.');
    return;
  }
  const root = $('villa-root');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearAlpha(1);
  // batas resolusi dinaikkan (2,25 di layar sentuh) agar tidak buram; governor kualitas tetap menurunkannya bila lambat
  const quality = createQualityGovernor({ deviceRatio: window.devicePixelRatio || 1, cap: window.matchMedia?.('(pointer: coarse)').matches ? 2.25 : 2, floor: lowQuality ? 2 : 0 });
  renderer.setPixelRatio(quality.settings().ratio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const built = buildVillaWorld(scene, world, { renderer });
  if (lowQuality) applyQuality(renderer, scene, quality.settings()); // ?q=low: mulai langsung dengan kualitas hemat
  const camera = new THREE.PerspectiveCamera(48, 1, 0.2, 320);
  const occluders = buildCameraOccluders(world);
  let camArm = 0; // panjang lengan kamera yang sudah dihaluskan (dipendekkan seketika saat terhalang)
  const indoorLight = new THREE.PointLight(0xffe2b8, 0, 17, 1.4);
  scene.add(indoorLight);
  let indoorK = 0;
  // target kamera (diubah oleh gestur) dan nilai yang dihaluskan untuk tampilan
  const camState = { yaw: 0, pitch: CAM_PRESETS[0].pitch, dist: CAM_PRESETS[0].dist };
  const camNow = { ...camState };
  let preset = 0;
  hooks.camera = () => {
    preset = (preset + 1) % CAM_PRESETS.length;
    camState.pitch = CAM_PRESETS[preset].pitch;
    camState.dist = CAM_PRESETS[preset].dist;
  };
  let screen = null; // layar tancap; dibuat setelah dunia siap
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    screen?.resize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = clamp(48 + (1.2 - camera.aspect) * 26, 48, 62); // layar potret: lebarkan sudut pandang, bukan menjauhkan kamera
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);
  setupInput(renderer.domElement, camState);
  $('cam-button').addEventListener('click', () => hooks.camera());

  const params = new URLSearchParams(window.location.search);
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
  const eventParams = parseEventParams(window.location.search);
  loadEventInfo(eventParams.slug, { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY }).then((info) => {
    if (info?.title) document.title = `${info.title} · NIKORA Villa`;
  });
  const name = (params.get('name') || eventParams.to || store('orbit-name') || `Tamu-${Math.floor(Math.random() * 900 + 100)}`).replace(/[<>]/g, '').slice(0, 24);
  screen = createScreen({ scene, renderer, host: root, spec: VILLA_SCREEN });
  screen.resize(window.innerWidth, window.innerHeight); // layar tancap besar di belakang pelaminan
  const avatarConfig = loadConfig(storage); // avatar yang sama dengan yang dibuat di aula
  const avatar = createAvatar({ config: avatarConfig, name });
  avatar.rotation.order = 'YXZ'; // miring (tidur) dulu, lalu arah hadap
  scene.add(avatar);
  const me = { x: world.spawn.x, z: world.spawn.z, level: 0, stair: null, y: 0 };
  const spawn = world.constrain(me);
  me.x = spawn.x;
  me.z = spawn.z;
  camera.position.set(me.x, 14, me.z + 11);

  // ---------- duduk / tidur ----------
  let seat = null; // id titik duduk/tidur yang sedang dipakai
  let seatSince = 0;
  let facing = 0;
  const actBtn = $('act-button');
  const poseFor = (id) => {
    const spot = world.spots[id];
    return spot ? spotPose(spot) : null;
  };
  let multiplayer = null;
  const occupiedSpots = () => {
    const set = new Set();
    if (multiplayer) for (const p of multiplayer.net.players) if (p.id !== multiplayer.net.id && p.sit != null) set.add(p.sit);
    return set;
  };
  const nearestSpot = () => (seat === null ? findNearestSpot(me, world.spots, occupiedSpots()) : null);
  const standUp = () => {
    if (seat === null) return;
    seat = null;
  };
  const sitDown = (now) => {
    const spot = nearestSpot();
    if (!spot) return false;
    seat = spot.id;
    seatSince = now;
    me.x = spot.x;
    me.z = spot.z;
    facing = spot.rot;
    return true;
  };
  hooks.action = () => (seat !== null ? standUp() : sitDown(performance.now()));
  actBtn.addEventListener('click', () => hooks.action());
  const setActLabel = (() => {
    let last = '';
    return (text) => {
      if (text === last) return;
      last = text;
      actBtn.hidden = !text;
      if (text) actBtn.textContent = text;
    };
  })();

  // ---------- peta (tersembunyi secara bawaan) ----------
  const mapBtn = $('map-button');
  const mapCanvas = $('minimap');
  const setMap = (on) => {
    mapCanvas.hidden = !on;
    mapBtn.setAttribute('aria-pressed', String(on));
    mapBtn.setAttribute('aria-label', on ? 'Sembunyikan peta' : 'Tampilkan peta');
    store('villa-map', on ? '1' : '0');
  };
  hooks.map = () => setMap(mapCanvas.hidden);
  mapBtn.addEventListener('click', () => hooks.map());
  setMap(store('villa-map') === '1');

  // ---------- suara dekat (LiveKit), sama seperti di aula ----------
  let voice = null;
  let voiceBusy = false;
  const toastEl = $('toast');
  let toastTimer = 0;
  const toast = (text) => {
    toastEl.textContent = text;
    toastEl.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.style.display = 'none';
    }, 3500);
  };
  const micBtn = $('mic-button');
  const toggleMic = async () => {
    if (voiceBusy || !voice?.room) return;
    voiceBusy = true;
    try {
      await voice.setMic(!voice.micOn);
    } catch (error) {
      console.warn('[voice]', error);
      micBtn.setAttribute('aria-pressed', 'false');
      toast('Mikrofon tidak bisa dipakai. Izinkan akses mikrofon di browser.');
    } finally {
      voiceBusy = false;
    }
  };
  hooks.mic = toggleMic;
  micBtn.addEventListener('click', toggleMic);
  function setupVoice(session) {
    if (!session) return;
    session.net.on('voice', async (msg) => {
      if (!msg.enabled || voice) return;
      voice = new VoiceChat();
      voice.onChange = (on) => {
        micBtn.setAttribute('aria-pressed', String(on));
        micBtn.setAttribute('aria-label', on ? 'Matikan mikrofon' : 'Nyalakan mikrofon');
      };
      try {
        if (msg.room) await voice.attach(msg.room); // transport LiveKit: Room sudah tersambung
        else await voice.connect({ url: msg.url, token: msg.token });
        micBtn.hidden = false;
        // Browser memblokir audio sebelum ada sentuhan: aktifkan pada sentuhan pertama.
        window.addEventListener('pointerdown', () => voice?.room?.startAudio().catch(() => {}), { once: true });
      } catch (error) {
        console.warn('[voice] gagal tersambung:', error);
        voice?.dispose();
        voice = null;
      }
    });
    session.net.requestVoiceToken();
  }

  // ---------- panggung MC (sama seperti di aula) ----------
  // MC dan pembicara yang dinaikkan MC (mis. pemilik acara) terdengar penuh di seluruh vila;
  // tamu lain hanya terdengar oleh yang berada dekat di ruangan yang sama.
  let party = null;
  const partyBtn = $('party-button');
  const partyPanel = $('party-panel');
  const partyBody = $('party-body');
  const nameOf = (id) => (id === multiplayer?.net.id ? 'Kamu' : multiplayer?.net.players.find((p) => p.id === id)?.name ?? 'Tamu');
  function renderParty() {
    if (party) renderPartyPanel({ body: partyBody, party, nameOf, button: partyBtn });
  }
  function applyStage() {
    if (!party || !multiplayer) return;
    const speakers = stageIds(party.state, multiplayer.net.players);
    for (const p of multiplayer.net.players) {
      const group = p.id === multiplayer.net.id ? avatar : multiplayer.view.getAvatar(p.id);
      if (group) setStageRing(group, speakers.has(p.id));
    }
  }
  function setupParty(session) {
    if (!session || typeof session.net.sendParty !== 'function') return;
    party = createPartyController({ net: session.net, onChange: () => { renderParty(); applyStage(); } });
    partyBtn.hidden = false;
    partyBtn.addEventListener('click', () => {
      partyPanel.hidden = !partyPanel.hidden;
      renderParty();
    });
    $('party-close').addEventListener('click', () => { partyPanel.hidden = true; });
    renderParty();
  }

  // kunci pemilik/MC dari tautan privat (?key=): disimpan untuk sesi ini, dihapus dari URL, diperiksa server
  const roleKey = takeRoleKey({
    search: window.location.search,
    storage: (() => {
      try {
        return window.sessionStorage;
      } catch {
        return null;
      }
    })(),
    replaceSearch: (q) => window.history.replaceState(null, '', `${window.location.pathname}${q}${window.location.hash}`),
  });

  // ---------- jaringan ----------
  let netStatus = 'Menyambung…'; // alasan ditampilkan bila gagal terhubung
  (gate ? gate.passed : Promise.resolve())
    .then(() => startMultiplayer({ scene, search: window.location.search, name, world: 'villa', poseFor, roleKey, onError: (m) => { netStatus = `Offline · ${m}`; } }))
    .then((session) => {
      multiplayer = session;
      if (!session && netStatus === 'Menyambung…') netStatus = 'Offline';
      session?.net.setAvatar?.(toWire(avatarConfig));
      setupVoice(session);
      setupParty(session);
      screen.attach(session);
      if (session && (session.net.role === 'owner' || session.net.role === 'mc')) {
        toast(`Masuk sebagai ${session.net.role === 'owner' ? 'pemilik acara' : 'MC'}. Suaramu terdengar di seluruh vila.`);
      }
    })
    .catch((error) => console.warn('[multiplayer]', error));

  const drawMap = createMinimap();
  let last = performance.now();
  let walkClock = 0;
  let placeId = '';
  let voiceTick = 0;
  let partyTick = 0;

  function frame(time) {
    requestAnimationFrame(frame);
    const rawMs = time - last;
    const delta = Math.min(rawMs / 1000, 0.05);
    last = time;

    const input = readInput();
    if (seat !== null && Math.hypot(input.x, input.z) > 0.35) standUp(); // bergerak = berdiri
    const move = cameraRelative(input, camNow.yaw); // relatif terhadap arah kamera
    const moving = seat === null && (move.x !== 0 || move.z !== 0);
    if (moving) {
      const next = world.move(me, move.x * PLAYER_SPEED * delta, move.z * PLAYER_SPEED * delta);
      me.x = next.x;
      me.z = next.z;
      me.level = next.level;
      me.stair = next.stair;
      me.y = next.y;
      facing = Math.atan2(-move.x, -move.z);
      walkClock += delta;
    }

    if (multiplayer) {
      multiplayer.sendInput(seat === null ? move.x : 0, seat === null ? move.z : 0, facing, time, seat, { x: me.x, z: me.z, y: me.y });
      const mine = multiplayer.net.players.find((p) => p.id === multiplayer.net.id);
      if (mine && seat === null && (Math.hypot(mine.x - me.x, mine.z - me.z) > SNAP_DISTANCE || Math.abs((mine.y ?? me.y) - me.y) > 1.5)) {
        me.x = mine.x;
        me.z = mine.z;
        if (mine.y !== undefined && Math.abs(mine.y - me.y) > 1.5) {
          me.y = mine.y; // server mengoreksi lantai
          me.level = Math.round(mine.y / LEVEL_HEIGHT);
          me.stair = null;
        }
      }
      if (mine && seat !== null && time - seatSince > 800 && mine.sit !== seat) standUp(); // server menolak
      multiplayer.view.update(delta, time / 1000);
      screen.tick(time);
      if (party && time - partyTick > 500) {
        partyTick = time;
        party.tick();
        applyStage();
      }
      if (voice && time - voiceTick > 100) {
        voiceTick = time;
        voice.update(me, multiplayer.net.players, stageIds(party?.state, multiplayer.net.players), {
          ...VOICE_CROWD,
          canHear: (p) => sameVoiceSpace(me, p), // beda ruangan (dibatasi dinding) tidak saling dengar
        });
        const speaking = voice.speaking();
        micBtn.classList.toggle('is-speaking', voice.micOn && speaking.has(multiplayer.net.id));
      }
    }

    // avatar lokal: berjalan, duduk, atau berbaring
    const pose = seat !== null ? poseFor(seat) : null;
    const k = 1 - Math.exp(-14 * delta);
    if (pose) {
      avatar.position.x += (pose.x - avatar.position.x) * k;
      avatar.position.z += (pose.z - avatar.position.z) * k;
      avatar.position.y += (pose.y - avatar.position.y) * k;
      avatar.userData.tilt = (avatar.userData.tilt ?? 0) + (pose.tilt - (avatar.userData.tilt ?? 0)) * k;
      avatar.rotation.y = pose.rotY;
    } else {
      avatar.position.x = me.x;
      avatar.position.z = me.z;
      avatar.position.y += (me.y + (moving && me.stair === null ? Math.abs(Math.sin(walkClock * 12)) * 0.08 : 0) - avatar.position.y) * Math.max(k, 0.5);
      avatar.userData.tilt = (avatar.userData.tilt ?? 0) * (1 - k);
      avatar.rotation.y = facing;
    }
    applyPose(avatar, moving ? 'walk' : null, time / 1000, delta);
    avatar.rotation.x += avatar.userData.tilt ?? 0; // applyPose menimpa rotation.x, tambahkan kemiringan tidur sesudahnya

    // kamera mengorbit pemain: yaw bebas 360°, pitch dari hampir sejajar tanah sampai pandangan atas
    camState.pitch = clamp(camState.pitch, CAM_LIMITS.minPitch, CAM_LIMITS.maxPitch);
    camState.dist = clamp(camState.dist, CAM_LIMITS.minDist, CAM_LIMITS.maxDist);
    const ck = 1 - Math.exp(-12 * delta);
    camNow.yaw += (camState.yaw - camNow.yaw) * ck;
    camNow.pitch += (camState.pitch - camNow.pitch) * ck;
    camNow.dist += (camState.dist - camNow.dist) * ck;
    const wide = clamp((camNow.dist - 8) / 6, 0, 1); // jarak jauh (udara/atas) di layar sempit tetap diperlebar sedikit
    const fit = 1 + (Math.min(1.9, Math.max(1, 1.45 / camera.aspect)) - 1) * wide;
    const want = camNow.dist * fit;
    const cp = Math.cos(camNow.pitch);
    const dir = { x: Math.sin(camNow.yaw) * cp, y: Math.sin(camNow.pitch), z: Math.cos(camNow.yaw) * cp };
    const eye = { x: me.x, y: me.y + 1.45, z: me.z };
    const { dist: freeArm } = resolveCameraDistance(eye, dir, want, occluders);
    // dinding/atap: kamera mundur ke depan penghalang seketika; saat bebas kembali perlahan (tanpa loncatan)
    camArm = camArm === 0 || freeArm < camArm ? freeArm : camArm + (freeArm - camArm) * (1 - Math.exp(-4 * delta));
    camera.position.set(eye.x + dir.x * camArm, eye.y + dir.y * camArm, eye.z + dir.z * camArm);
    camera.lookAt(me.x, me.y + 1.2, me.z);
    avatar.visible = camArm > 0.95; // kamera terlalu dekat: avatar tidak menutupi layar
    // cahaya dalam ruangan menyala halus saat pemain berada di dalam bangunan
    const inside = !me.stair && roomAt(me.x, me.z, me.level).indoor;
    indoorK += ((inside ? 1 : 0) - indoorK) * (1 - Math.exp(-3 * delta));
    indoorLight.intensity = 26 * indoorK;
    indoorLight.position.set(me.x, me.y + 2.3, me.z);
    const actors = [{ x: me.x, z: me.z, y: me.y }];
    if (multiplayer) for (const p of multiplayer.net.players) if (p.id !== multiplayer.net.id) actors.push({ x: p.x, z: p.z, y: p.y ?? 0 });
    built.update(me.x, me.z, delta, actors, camera.position);
    const qChange = quality.setFloor(lowQuality ? 2 : screen?.controller?.state?.src ? 1 : 0) ?? quality.tick(performance.now());
    if (qChange) applyQuality(renderer, scene, qChange);
    renderer.render(scene, camera);
    screen.render(scene, camera);

    const near = nearestSpot();
    setActLabel(seat !== null ? 'Berdiri' : near ? (near.kind === 'sleep' ? 'Tidur' : 'Duduk') : '');

    const place = me.stair ? { id: 'stair', name: 'Tangga' } : roomAt(me.x, me.z, me.level);
    const placeKey = `${place.id}@${me.level}`;
    if (placeKey !== placeId) {
      placeId = placeKey;
      $('place').textContent = me.level > 0 ? `Lantai ${me.level + 1} · ${place.name}` : place.name;
    }
    const others = multiplayer ? multiplayer.net.players.filter((p) => p.id !== multiplayer.net.id) : [];
    if (!mapCanvas.hidden) drawMap(me, others, me.level);
    $('online').textContent = multiplayer ? `Online: ${others.length + 1}` : netStatus;
  }
  requestAnimationFrame(frame);

  window.__villa = {
    state: () => ({
      x: me.x, z: me.z, y: me.y, level: me.level, stair: me.stair, place: roomAt(me.x, me.z, me.level), online: !!multiplayer, others: multiplayer ? multiplayer.view.count : 0,
      seat, action: actBtn.hidden ? '' : actBtn.textContent, mapVisible: !mapCanvas.hidden,
    }),
    renderStats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, pixelRatio: renderer.getPixelRatio(), canvas: [renderer.domElement.width, renderer.domElement.height] }),
    cam: () => ({ yaw: camState.yaw, pitch: camState.pitch, dist: camState.dist, nowYaw: camNow.yaw }),
    remotes: () => (multiplayer ? multiplayer.view.avatarGroups().map((g) => ({ y: g.position.y, rx: g.rotation.x, ry: g.rotation.y })) : []),
    // hanya untuk pengujian; dalam mode multiplayer server tetap otoritatif dan akan mengoreksi posisi
    teleport: (x, z, level = 0) => {
      const p = level === 0 ? world.constrain({ x, z }) : { x, z };
      me.x = p.x;
      me.z = p.z;
      me.level = level;
      me.stair = null;
      me.y = levelY(level);
      camera.position.set(me.x + 1.5, me.y + 28, me.z + 22);
    },
  };
}

start().catch((error) => {
  console.error('[villa]', error);
  showError('Terjadi kesalahan saat memulai.', String(error?.stack ?? error));
});
