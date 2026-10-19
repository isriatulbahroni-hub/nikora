import * as THREE from 'three';
import { VOICE_CROWD, VoiceChat } from './voice.js';
import { loadEventInfo, parseEventParams } from './event-context.js';
import './gate.css';
import { mountGate, shouldShowGate } from './gate.js';
import './screen.css';
import { createScreen } from './screen/screen-setup.js';
import { createQualityGovernor } from './quality.js';
import { modeFor } from './event-mode.js';
import { applyPose, auraSpecFor, createAvatar, makeBubble, setAurasVisible, setAvatarAura, setAvatarConfig, setStageRing } from './avatar.js';
import { createPartyController, stageIds } from './party.js';
import { takeRoleKey } from './role-key.js';
import { loadConfig, saveConfig, toWire } from './avatar-config.js';
import { createAvatarEditor } from './avatar-editor.js';
import { applyFacePhoto } from './avatar-face.js';
import { GAME_RULES, cameraRelativeMovement, normalizeMovement } from './game-rules.js';
import { HALL, SEATS, facingAngle, findNearestSeat, resolveCollisions } from './hall-layout.js';
import { armLength, cameraOffset, clamp, clampCam, createCamState, easeToDefault, orbitBy, panBy, panUnitsPerPixel, relaxPan, zoomBy } from './hall-camera.js';
import { buildHallWorld } from './hall-world.js';
import { resolveServerUrl, startMultiplayer } from './multiplayer-view.js';
import { dayPartIndex } from './avatar-aura.js';
import { requestSensorPermission, sensorAvailable, startMirror } from './motion-mirror.js';
import './style.css';

const $ = (selector) => document.querySelector(selector);
const root = $('#game-root');
const ui = {
  hud: $('.hall-hud'),
  footer: $('.arena-footer'),
  status: $('#hall-status'),
  guests: $('#hall-guests'),
  joinOverlay: $('#join-overlay'),
  joinForm: $('#join-form'),
  nameInput: $('#name-input'),
  sitButton: $('#touch-sit'),
  sitLabel: $('#sit-label'),
  clapButton: $('#emote-clap'),
  danceButton: $('#emote-dance'),
  muteButton: $('#mute-button'),
  chatBox: $('#chat-box'),
  chatLog: $('#chat-log'),
  chatForm: $('#chat-form'),
  chatInput: $('#chat-input'),
  chatButton: $('#chat-button'),
  greetMenu: $('#greet-menu'),
  greetName: $('#greet-name'),
  greetToast: $('#greet-toast'),
  greetToastText: $('#greet-toast-text'),
  greetYes: $('#greet-yes'),
  greetNo: $('#greet-no'),
};

const PLAYER_SPEED = GAME_RULES.playerSpeed;
const START = Object.freeze({ x: 0, z: 9.4 });
const OFFLINE = !resolveServerUrl(window.location.search);
const heldKeys = new Set();
const joystick = { x: 0, z: 0 };
const JOY_RADIUS = 52;
const JOY_DEADZONE = 0.14;

const me = { x: START.x, z: START.z, rot: Math.PI, sit: null };
let joined = false;
let playerName = 'Tamu';
let gestureAct = null; // gestur solo dari Cermin Gerak (melambai/membungkuk/berputar)
let gestureUntil = 0;
let mirrorStop = null;
let noticeTimer = 0;

function notify(text) {
  const el = $('#notice');
  el.textContent = text;
  el.hidden = false;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { el.hidden = true; }, 4200);
}

/** Aura diri sendiri: nama + bagian hari di perangkat ini. Bagian harinya dikirim agar semua klien memakai warna yang sama. */
function applySelfAura() {
  const part = dayPartIndex(new Date().getHours());
  setAvatarAura(playerAvatar, auraSpecFor(playerName, part));
  multiplayer?.net.setAura?.(part);
}

function onMirrorGesture(kind) {
  const now = performance.now() * 0.001; // sama dengan basis waktu loop render
  if (!joined || me.sit !== null || isDancing(now) || now < gestureUntil) return;
  if (multiplayer && !multiplayer.net.setGesture?.(kind)) return; // ditolak (mis. sedang ada aksi lain)
  gestureAct = kind;
  gestureUntil = now + 1.8;
}

async function toggleMirror() {
  if (mirrorStop) {
    mirrorStop();
    mirrorStop = null;
    $('#emote-mirror').setAttribute('aria-pressed', 'false');
    notify('Cermin Gerak dimatikan');
    return;
  }
  if (!sensorAvailable()) {
    notify('Perangkat ini tidak punya sensor gerak. Cermin Gerak hanya jalan di HP.');
    return;
  }
  if (!(await requestSensorPermission())) {
    notify('Izin sensor gerak ditolak. Aktifkan di pengaturan browser untuk memakai Cermin Gerak.');
    return;
  }
  mirrorStop = startMirror({ onGesture: onMirrorGesture });
  $('#emote-mirror').setAttribute('aria-pressed', 'true');
  notify('Cermin Gerak aktif: miring kiri = hormat, miring kanan = lambai, miring jauh = berputar');
}
const eventParams = parseEventParams(window.location.search);
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
if (shouldShowGate(window.location.search)) {
  mountGate({ world: 'hall', search: window.location.search, supabase: { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY } });
}
// Judul acara dari undangan ditampilkan sebagai sapaan di kartu masuk (tanpa menambah HUD saat bermain).
if (eventParams.slug) {
  loadEventInfo(eventParams.slug, { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY }).then((info) => {
    eventMode = modeFor(info?.eventType, info?.mode);
    if (!info?.title) return;
    document.title = `${info.title} · ORBIT`;
    const eyebrow = document.querySelector('#join-form .eyebrow');
    if (eyebrow) eyebrow.textContent = info.title;
  });
}
let multiplayer = null;
let sitSince = 0;
let clapUntil = 0;
let danceUntil = 0; // hanya dipakai saat offline; saat online, joget mengikuti act jaringan
let renderer;
let scene;
let camera;
let playerAvatar;
let npcs = [];
let netError = '';
let hallScreen = null;
let hallWorld = null; // NIKORA Royal Wedding World (hall-world.js)
let quality = null;
let eventMode = modeFor();
// Kualitas grafis adaptif: turunkan resolusi render bila HP tersendat (lebih-lebih saat video layar diputar).
const lowQuality = new URLSearchParams(window.location.search).get('q') === 'low';
function applyQuality(renderer, scene, q) {
  renderer.setPixelRatio(q.ratio);
  hallWorld?.setShadows(q.shadows);
  if (renderer.shadowMap.enabled !== q.shadows) {
    renderer.shadowMap.enabled = q.shadows;
    scene.traverse((o) => {
      if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; });
    });
  }
}

const focus = new THREE.Vector3(START.x, 0.5, START.z);
let priorFrameTime = 0;
let idleAngle = 0;
const cam = createCamState(); // putar, miring, zoom, dan geser kamera (hall-camera.js)
let camResetting = false; // tombol/tuts C: kamera meluncur kembali ke tampilan awal
let lastStatus = '';
let hudTimer = 0;
const LABEL_RANGE = 8; // nama avatar hanya terlihat dalam jarak ini

// ---- Suara sintetis (tanpa file aset) ----
let audioCtx = null;
let muted = false;
function tone(freq, duration, { type = 'triangle', volume = 0.06, slideTo = null, delay = 0 } = {}) {
  if (muted) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const start = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  } catch {
    /* audio tidak tersedia; dunia tetap berjalan */
  }
}
const sfx = {
  sit: () => tone(260, 0.12, { slideTo: 180 }),
  stand: () => tone(180, 0.12, { slideTo: 300 }),
  clap: () => [0, 0.11, 0.22].forEach((delay) => tone(1700, 0.05, { type: 'square', volume: 0.05, slideTo: 900, delay })),
  join: () => [392, 523, 659].forEach((f, i) => tone(f, 0.16, { delay: i * 0.1 })),
};
function toggleMute() {
  muted = !muted;
  ui.muteButton.setAttribute('aria-pressed', String(muted));
  ui.muteButton.setAttribute('aria-label', muted ? 'Nyalakan suara' : 'Matikan suara');
  ui.muteButton.querySelector('.tile-ico').textContent = muted ? '×' : '♪';
}

function spawnFloat(text, position, kind) {
  const point = new THREE.Vector3(position.x, 2.2, position.z).project(camera);
  const size = root.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = `float-num ${kind}`;
  el.textContent = text;
  el.style.left = `${((point.x + 1) / 2) * size.width}px`;
  el.style.top = `${((1 - point.y) / 2) * size.height}px`;
  root.parentElement.append(el);
  el.addEventListener('animationend', () => el.remove());
  window.setTimeout(() => el.remove(), 1200);
}

function showStartupError(message, detail = '') {
  const box = document.createElement('div');
  box.className = 'render-error';
  const title = document.createElement('strong');
  title.textContent = 'Aula tidak dapat dimulai.';
  const text = document.createElement('span');
  text.textContent = message;
  box.append(title, text);
  if (detail) {
    const code = document.createElement('code');
    code.textContent = detail;
    box.append(code);
  }
  root.replaceChildren(box);
  ui.status.textContent = 'ERROR';
}

function hasWebGL2() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

// ---- Dunia: NIKORA Royal Wedding World (istana, kolam, jembatan, gazebo; lihat hall-world.js) ----
function createScene() {
  scene = new THREE.Scene();

  const size = root.getBoundingClientRect();
  camera = new THREE.PerspectiveCamera(46, size.width / size.height, 0.1, 700); // far lebar: langit, laut, dan pegunungan jauh
  camera.position.set(0, 12, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearAlpha(1);
  quality = createQualityGovernor({ deviceRatio: window.devicePixelRatio || 1, cap: 1.75, floor: lowQuality ? 2 : 0 });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  if (lowQuality) applyQuality(renderer, scene, quality.settings());
  renderer.setSize(size.width, size.height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.setAttribute('aria-label', 'Tampilan aula resepsi 3D ORBIT');
  root.append(renderer.domElement);

  // Dunia mengatur sendiri langit, kabut, cahaya, meja, kursi, dan pelaminan (tata letak dari hall-layout.js).
  hallWorld = buildHallWorld({ scene, renderer });
  hallScreen = createScreen({ scene, renderer, host: root, spec: hallWorld.screenSpec });
  hallScreen.resize(size.width, size.height); // layar acara di dalam gerbang istana
  if (lowQuality) hallWorld.setShadows(false);
}

function addSeatedNpc(seatId, color, name, { x, y, z, rot } = {}) {
  const seat = seatId == null ? null : SEATS[seatId];
  const avatar = createAvatar({ color, name });
  avatar.position.set(x ?? seat.x, y ?? HALL.seatedDrop, z ?? seat.z);
  avatar.rotation.y = rot ?? seat.rot;
  scene.add(avatar);
  npcs.push({ avatar, baseY: avatar.position.y, phase: Math.random() * 6.28, seatId });
}

// Tamu simulasi duduk dihapus begitu tersambung ke tamu sungguhan (mempelai di panggung tetap sebagai dekor).
function clearSimulatedGuests() {
  npcs = npcs.filter((n) => {
    if (n.seatId == null) return true;
    scene.remove(n.avatar);
    return false;
  });
}

function populateOfflineGuests() {
  // Tamu simulasi hanya di mode offline agar tidak bentrok dengan kursi pemain sungguhan di server.
  const colors = [0xf2a65a, 0x6ab8e8, 0xc77dff, 0xf25f5c, 0x70c1b3, 0xffe066];
  const seats = [0, 2, 3, 7, 10, 14, 15, 19, 26, 28];
  seats.forEach((id, i) => addSeatedNpc(id, colors[i % colors.length], null));
  // sofa pelaminan ada di x = +-1,2, z = -22,9 (hall-world.js); duduk di dudukan sofa, bukan di lantai
  addSeatedNpc(null, 0xf6e8ee, 'Mempelai', { x: -1.2, y: HALL.stage.height + 0.1 + HALL.seatedDrop, z: -22.9, rot: facingAngle(0, 1) });
  addSeatedNpc(null, 0x2f3a55, 'Mempelai', { x: 1.2, y: HALL.stage.height + 0.1 + HALL.seatedDrop, z: -22.9, rot: facingAngle(0, 1) });
}

// ---- Input dan aksi ----
function getMovementInput() {
  const right = heldKeys.has('KeyD') || heldKeys.has('ArrowRight');
  const left = heldKeys.has('KeyA') || heldKeys.has('ArrowLeft');
  const down = heldKeys.has('KeyS') || heldKeys.has('ArrowDown');
  const up = heldKeys.has('KeyW') || heldKeys.has('ArrowUp');
  const keyboard = normalizeMovement(Number(right) - Number(left), Number(down) - Number(up));
  if (keyboard.x || keyboard.z) return keyboard;
  return normalizeMovement(joystick.x, joystick.z);
}

function occupiedSeats() {
  const set = new Set(npcs.map((n) => n.seatId).filter((id) => id != null));
  for (const p of multiplayer?.net.players ?? []) {
    if (p.id !== multiplayer.net.id && p.sit != null) set.add(p.sit);
  }
  return set;
}

function standUp(now) {
  if (me.sit === null) return;
  me.sit = null;
  sitSince = now;
  sfx.stand();
}

function isDancing(now) {
  return multiplayer ? selfState()?.act === 'dance' : now < danceUntil;
}

function setDancing(on, now) {
  if (multiplayer) multiplayer.net.setDance?.(on);
  else danceUntil = on ? now + 45 : 0;
}

function toggleDance(now) {
  if (!joined || me.sit !== null) return;
  setDancing(!isDancing(now), now);
}

function toggleSit(now) {
  if (!joined) return;
  if (isDancing(now)) setDancing(false, now);
  if (me.sit !== null) return standUp(now);
  const seat = findNearestSeat(me, occupiedSeats());
  if (!seat) return;
  me.sit = seat.id;
  me.x = seat.x;
  me.z = seat.z;
  me.rot = seat.rot;
  sitSince = now;
  sfx.sit();
}

function clap(now) {
  if (!joined || now < clapUntil) return;
  clapUntil = now + 0.9;
  sfx.clap();
  spawnFloat('👏', me, 'is-clap');
}

function goToEntrance(now) {
  standUp(now);
  me.x = START.x;
  me.z = START.z;
  me.rot = Math.PI;
}

function selfState() {
  return multiplayer?.net.players.find((p) => p.id === multiplayer.net.id) ?? null;
}

const GREET_RANGE = 2.2;
const GREET_TEXT = { handshake: 'mengajak salaman', highfive: 'mengajak tos' };
let pendingGreet = null;
let greetToastTimer = 0;

function nearestRemote() {
  if (!multiplayer || me.sit !== null) return null;
  let best = null;
  let bestD = GREET_RANGE;
  for (const p of multiplayer.net.players) {
    if (p.id === multiplayer.net.id || p.sit != null || p.act) continue;
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

function setupGreet() {
  ui.greetMenu.querySelectorAll('[data-greet]').forEach((btn) =>
    btn.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const target = nearestRemote();
      if (target) multiplayer.net.sendGreet(target.id, btn.dataset.greet);
      ui.greetMenu.hidden = true;
    }),
  );
  const hideToast = () => {
    ui.greetToast.hidden = true;
    pendingGreet = null;
    window.clearTimeout(greetToastTimer);
  };
  $('#greet-yes').addEventListener('click', () => {
    if (pendingGreet) multiplayer?.net.replyGreet(pendingGreet.from, true);
    hideToast();
  });
  $('#greet-no').addEventListener('click', () => {
    if (pendingGreet) multiplayer?.net.replyGreet(pendingGreet.from, false);
    hideToast();
  });
  return (msg) => {
    pendingGreet = msg;
    ui.greetToastText.textContent = `${msg.name ?? 'Tamu'} ${GREET_TEXT[msg.kind] ?? 'menyapa'}`;
    ui.greetToast.hidden = false;
    window.clearTimeout(greetToastTimer);
    greetToastTimer = window.setTimeout(hideToast, 8000);
  };
}
let showGreetRequest = () => {};
let lastVoiceTick = -1;
let lastPartyTick = -1;
let party = null;
let avatarCfg = loadConfig(safeStorage());
let avatarEditor = null;
let editMode = false;

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function partyName(id) {
  return multiplayer?.net.players.find((p) => p.id === id)?.name ?? 'Tamu';
}

function partyButton(label, onClick, ghost = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = ghost ? 'party-btn is-ghost' : 'party-btn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function partyRow(text, button) {
  const row = document.createElement('div');
  row.className = 'party-row';
  const span = document.createElement('span');
  span.textContent = text;
  row.append(span);
  if (button) row.append(button);
  return row;
}

function partyHeading(text) {
  const h = document.createElement('h4');
  h.textContent = text;
  return h;
}

function renderParty() {
  if (!party) return;
  const s = party.state;
  const role = party.role;
  const body = $('#party-body');
  body.replaceChildren();
  $('#party-button').dataset.count = role === 'host' ? String(s.hands.length) : '0';
  $('#menu-dot').hidden = !(role === 'host' && s.hands.length > 0); // titik merah di ≡: ada tamu yang angkat tangan
  if (!s.host) {
    body.append(partyRow('Belum ada MC. Jadi MC untuk membuka panggung.'), partyButton('Jadi MC', () => party.claimHost()));
    return;
  }
  body.append(partyHeading('MC'), partyRow(`${partyName(s.host)}${role === 'host' ? ' (kamu)' : ''}`));
  if (s.speakers.length) {
    body.append(partyHeading('Pembicara'));
    for (const id of s.speakers) {
      body.append(partyRow(partyName(id), role === 'host' ? partyButton('Turunkan', () => party.revoke(id), true) : null));
    }
  }
  if (role === 'listener') {
    body.append(party.handRaised
      ? partyButton('Turunkan tangan', () => party.lowerHand(), true)
      : partyButton('Angkat tangan ✋', () => party.raiseHand()));
  } else if (role === 'speaker') {
    body.append(partyButton('Turun dari panggung', () => party.revoke(), true));
  } else {
    body.append(partyHeading(`Angkat tangan (${s.hands.length})`));
    if (!s.hands.length) body.append(partyRow('Belum ada yang mengangkat tangan.'));
    for (const id of s.hands) body.append(partyRow(partyName(id), partyButton('Naikkan', () => party.grant(id))));
    body.append(partyButton('Tutup panggung', () => party.close(), true));
  }
}

function applyStage() {
  if (!party || !multiplayer) return;
  const speakers = stageIds(party.state, multiplayer.net.players);
  for (const p of multiplayer.net.players) {
    const group = p.id === multiplayer.net.id ? playerAvatar : multiplayer.view.getAvatar(p.id);
    if (group) setStageRing(group, speakers.has(p.id));
  }
}

function togglePartyPanel() {
  if (!party) return;
  const panel = $('#party-panel');
  panel.hidden = !panel.hidden;
  renderParty();
}

function setupParty(session) {
  if (!session || typeof session.net.sendParty !== 'function') return;
  party = createPartyController({ net: session.net, onChange: () => { renderParty(); applyStage(); } });
  $('#party-button').hidden = false;
  $('#party-button').addEventListener('click', togglePartyPanel);
  $('#party-close').addEventListener('click', () => { $('#party-panel').hidden = true; });
  renderParty();
}

// Suara proximity (LiveKit). Tersambung otomatis untuk MENDENGAR begitu server menyiapkan token;
// mikrofon baru menyala saat tombol 🎙 ditekan dan bisa dimatikan (mute) kapan saja.
let voice = null;
let voiceBusy = false;
let micToastTimer = 0;
function micToast(text) {
  ui.greetToastText.textContent = text;
  ui.greetYes.hidden = true;
  ui.greetNo.hidden = true;
  ui.greetToast.hidden = false;
  window.clearTimeout(micToastTimer);
  micToastTimer = window.setTimeout(() => {
    ui.greetToast.hidden = true;
    ui.greetYes.hidden = false;
    ui.greetNo.hidden = false;
  }, 3500);
}
async function toggleMic() {
  const btn = $('#mic-button');
  if (voiceBusy || !voice?.room) return;
  voiceBusy = true;
  try {
    await voice.setMic(!voice.micOn);
  } catch (error) {
    console.warn('[voice]', error);
    btn.classList.remove('is-on');
    btn.setAttribute('aria-pressed', 'false');
    micToast('Mikrofon tidak bisa dipakai. Izinkan akses mikrofon di browser.');
  } finally {
    voiceBusy = false;
  }
}
function setupVoice(session) {
  if (!session) return;
  const btn = $('#mic-button');
  session.net.on('voice', async (msg) => {
    if (!msg.enabled || voice) return;
    voice = new VoiceChat();
    voice.onChange = (on) => {
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', on ? 'Matikan mikrofon' : 'Nyalakan mikrofon');
      btn.classList.toggle('is-on', on);
    };
    try {
      if (msg.room) await voice.attach(msg.room); // transport LiveKit: Room sudah tersambung
      else await voice.connect({ url: msg.url, token: msg.token });
      btn.hidden = false;
      // Browser memblokir audio sebelum ada sentuhan: aktifkan pada sentuhan pertama.
      window.addEventListener('pointerdown', () => voice?.room?.startAudio().catch(() => {}), { once: true });
    } catch (error) {
      console.warn('[voice] gagal tersambung:', error);
      voice?.dispose();
      voice = null;
    }
  });
  session.net.requestVoiceToken();
  btn.addEventListener('click', toggleMic);
}

function updatePlayer(delta, now) {
  const paired = selfState();
  if (paired?.with) {
    // Server memegang posisi saat berpasangan: ikuti, jangan bergerak sendiri.
    me.x = paired.x;
    me.z = paired.z;
    me.rot = paired.rot;
    return false;
  }
  const movement = cameraRelativeMovement(getMovementInput(), cam.yaw);
  const moving = movement.x !== 0 || movement.z !== 0;
  if (me.sit !== null && moving) standUp(now); // bergerak = berdiri

  if (me.sit === null) {
    if (moving) me.rot = facingAngle(movement.x, movement.z);
    const next = resolveCollisions({
      x: me.x + movement.x * PLAYER_SPEED * delta,
      z: me.z + movement.z * PLAYER_SPEED * delta,
    });
    me.x = next.x;
    me.z = next.z;
  }

  // Server menolak duduk yang tidak sah: ikuti kebenaran server.
  const self = multiplayer?.net.players.find((p) => p.id === multiplayer.net.id);
  if (self && me.sit !== null && now - sitSince > 0.8 && self.sit !== me.sit) standUp(now);

  multiplayer?.sendInput(moving && me.sit === null ? movement.x : 0, moving && me.sit === null ? movement.z : 0, me.rot, now * 1000, me.sit, { x: me.x, z: me.z });
  return moving && me.sit === null;
}

function updateHud() {
  const near = joined ? nearestRemote() : null;
  const showMenu = near !== null && !selfState()?.act;
  if (showMenu) ui.greetName.textContent = near.name;
  if (ui.greetMenu.hidden === showMenu) ui.greetMenu.hidden = !showMenu;
  const seat = me.sit === null ? findNearestSeat(me, occupiedSeats()) : null;
  const canAct = me.sit !== null || seat !== null;
  ui.sitButton.classList.toggle('is-ready', canAct);
  ui.sitLabel.textContent = me.sit !== null ? 'BERDIRI' : 'DUDUK';
  const remote = multiplayer?.view.count ?? 0;
  ui.guests.textContent = multiplayer ? (multiplayer.net.status === 'reconnecting' ? 'menyambung ulang…' : `${remote + 1}`) : netError ? `offline · ${netError}` : joined ? '…' : 'offline';
  const reconnecting = multiplayer?.net.status === 'reconnecting';
  $('#online-dot').classList.toggle('is-online', Boolean(multiplayer) && !reconnecting);
  $('#online-dot').classList.toggle('is-wait', reconnecting);
}

// ---- Obrolan ----
const CHAT_LINE_TTL = 9000; // pesan memudar dari log setelah 9 detik (kecuali kolom ketik terbuka)
const CHAT_KEEP = 40;
const bubbles = new Map(); // id pemain -> { sprite, timer }

function avatarFor(id) {
  if (id === (multiplayer?.net.id ?? 'self')) return playerAvatar;
  return multiplayer?.view.getAvatar(id) ?? null;
}

function showBubble(id, text) {
  const group = avatarFor(id);
  const sprite = makeBubble(text);
  if (!group || !sprite) return;
  const old = bubbles.get(id);
  if (old) {
    old.group.remove(old.sprite);
    old.sprite.material.map?.dispose();
    old.sprite.material.dispose();
    window.clearTimeout(old.timer);
  }
  group.add(sprite);
  const timer = window.setTimeout(() => {
    group.remove(sprite);
    sprite.material.map?.dispose();
    sprite.material.dispose();
    bubbles.delete(id);
  }, 6000);
  bubbles.set(id, { group, sprite, timer });
}

function addChatLine({ id, name, text }) {
  const self = id === (multiplayer?.net.id ?? 'self');
  const item = document.createElement('li');
  item.className = `chat-line${self ? ' is-self' : ''}`;
  const who = document.createElement('b');
  who.textContent = name;
  item.append(who, document.createTextNode(text)); // textContent saja: tidak ada HTML dari pemain lain
  ui.chatLog.append(item);
  while (ui.chatLog.children.length > CHAT_KEEP) ui.chatLog.firstChild.remove();
  window.setTimeout(() => item.classList.add('is-old'), CHAT_LINE_TTL);
  showBubble(id, text);
}

function openChat(open) {
  ui.chatForm.hidden = !open;
  ui.chatBox.classList.toggle('is-open', open);
  if (open) {
    heldKeys.clear();
    ui.chatInput.focus();
  } else {
    ui.chatInput.blur();
  }
}

function setupChat() {
  ui.chatButton.addEventListener('click', () => joined && openChat(ui.chatForm.hidden));
  ui.chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = ui.chatInput.value.replace(/\s+/g, ' ').trim().slice(0, 160);
    ui.chatInput.value = '';
    if (!text) return;
    if (multiplayer) multiplayer.sendChat(text); // server menyiarkan balik ke semua, termasuk kita
    else addChatLine({ id: 'self', name: playerName, text }); // mode offline: hanya terlihat lokal
  });
  ui.chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') openChat(false);
  });
}

function showHud(ms = 2400) {
  ui.hud.classList.add('is-visible');
  window.clearTimeout(hudTimer);
  hudTimer = window.setTimeout(() => ui.hud.classList.remove('is-visible'), ms);
}

function updateLabels() {
  const groups = [...npcs.map((n) => n.avatar), ...(multiplayer?.view.avatarGroups() ?? [])];
  for (const group of groups) {
    const label = group.userData.label;
    if (!label) continue;
    const distance = Math.hypot(group.position.x - me.x, group.position.z - me.z);
    const opacity = joined ? Math.min(1, Math.max(0, (LABEL_RANGE - distance) / 3)) : 0;
    label.material.opacity = opacity;
    label.visible = opacity > 0.02;
  }
}

function cameraFit() {
  return Math.min(1.9, Math.max(1, 1.45 / camera.aspect));
}

function updateCamera(delta, now) {
  const fit = cameraFit();
  if (!joined) {
    idleAngle += delta * 0.12;
    camera.position.set(Math.sin(idleAngle) * 46, 20, -8 + Math.cos(idleAngle) * 46); // orbit lebar: dunia kini seluas ±28 m
    camera.lookAt(0, 4, -8);
    return;
  }
  const smoothing = 1 - Math.exp(-5 * delta);
  focus.x += (me.x - focus.x) * smoothing;
  focus.z += (me.z - focus.z) * smoothing;
  if (camResetting && easeToDefault(cam, delta)) camResetting = false;
  const input = getMovementInput();
  if (input.x || input.z) relaxPan(cam, delta); // berjalan: kamera kembali mengikuti pemain
  const target = new THREE.Vector3(focus.x + cam.panX, 0.6, focus.z + cam.panZ);
  const offset = cameraOffset(cam, fit);
  const desired = new THREE.Vector3(target.x + offset.x, offset.y, target.z + offset.z);
  camera.position.lerp(desired, 1 - Math.exp(-6 * delta));
  camera.lookAt(target);
}

function renderFrame(time) {
  requestAnimationFrame(renderFrame);
  const now = time * 0.001;
  const delta = Math.min((time - priorFrameTime) * 0.001 || 0, 0.05);
  priorFrameTime = time;

  const walking = joined ? updatePlayer(delta, now) : false;
  if (walking && isDancing(now)) setDancing(false, now); // bergerak menghentikan joget
  const selfAct = selfState()?.act ?? null;
  if (walking) gestureUntil = 0; // berjalan menghentikan gestur lokal
  const pose = isDancing(now) ? 'dance' : now < gestureUntil ? gestureAct : selfAct ?? (now < clapUntil ? 'clap' : walking ? 'walk' : null);
  applyPose(playerAvatar, pose, now, delta);
  const bob = walking ? Math.abs(Math.sin(now * 13)) * 0.09 : 0;
  const hop = now < clapUntil ? Math.abs(Math.sin((clapUntil - now) * 14)) * 0.12 : 0;
  const k = 1 - Math.exp(-14 * delta);
  const yTarget = (me.sit === null ? 0 : HALL.seatedDrop) + bob + hop;
  playerAvatar.position.x += (me.x - playerAvatar.position.x) * (me.sit === null ? 1 : k);
  playerAvatar.position.z += (me.z - playerAvatar.position.z) * (me.sit === null ? 1 : k);
  playerAvatar.position.y += (yTarget - playerAvatar.position.y) * k;
  const diff = ((me.rot - playerAvatar.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  playerAvatar.rotation.y += diff * k;

  for (const npc of npcs) npc.avatar.position.y = npc.baseY + Math.sin(now * 1.6 + npc.phase) * 0.012;

  multiplayer?.view.update(delta, now);
  hallScreen?.tick(now * 1000);
  hallWorld?.update(now, focus, camera);
  if (voice && multiplayer && Math.floor(now * 10) !== lastVoiceTick) {
    lastVoiceTick = Math.floor(now * 10);
    voice.update(me, multiplayer.net.players, stageIds(party?.state, multiplayer.net.players), { ...VOICE_CROWD, duck: eventMode.duck, selfId: multiplayer.net.id });
    $('#mic-button').classList.toggle('is-speaking', voice.micOn && voice.speaking().has(multiplayer.net.id));
  }
  if (party && Math.floor(now * 2) !== lastPartyTick) {
    lastPartyTick = Math.floor(now * 2);
    party.tick();
    applyStage();
  }
  updateLabels();
  updateHud();
  updateCamera(delta, now);
  const qChange = quality?.setFloor(lowQuality ? 2 : hallScreen?.controller?.state?.src ? 1 : 0) ?? quality?.tick(performance.now());
  if (qChange) applyQuality(renderer, scene, qChange);
  renderer.render(scene, camera);
  hallScreen?.render(scene, camera);
}

// ---- Kontrol ----
function setupJoystick() {
  const zone = $('#joy-zone');
  const base = $('#joy-base');
  const knob = $('#joy-knob');
  let pointerId = null;
  let center = { x: 0, y: 0 };

  const home = () => {
    const r = zone.getBoundingClientRect();
    return { x: Math.min(96, r.width / 2), y: Math.max(r.height - 96, r.height / 2) };
  };
  const place = (c) => {
    center = c;
    base.style.left = `${c.x}px`;
    base.style.top = `${c.y}px`;
  };
  const reset = () => {
    pointerId = null;
    joystick.x = 0;
    joystick.z = 0;
    knob.style.transform = '';
    base.classList.remove('active');
    place(home());
  };
  const move = (event) => {
    const r = zone.getBoundingClientRect();
    let dx = event.clientX - r.left - center.x;
    let dy = event.clientY - r.top - center.y;
    const length = Math.hypot(dx, dy);
    if (length > JOY_RADIUS) {
      dx = (dx / length) * JOY_RADIUS;
      dy = (dy / length) * JOY_RADIUS;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const strength = Math.hypot(dx, dy) / JOY_RADIUS;
    if (strength < JOY_DEADZONE) {
      joystick.x = 0;
      joystick.z = 0;
    } else {
      joystick.x = dx / JOY_RADIUS;
      joystick.z = dy / JOY_RADIUS;
    }
  };

  zone.addEventListener('pointerdown', (event) => {
    if (pointerId !== null) return;
    event.preventDefault();
    pointerId = event.pointerId;
    zone.setPointerCapture(pointerId);
    const r = zone.getBoundingClientRect();
    place({
      x: Math.max(70, Math.min(r.width - 70, event.clientX - r.left)),
      y: Math.max(70, Math.min(r.height - 70, event.clientY - r.top)),
    });
    base.classList.add('active');
    move(event);
  });
  zone.addEventListener('pointermove', (event) => {
    if (event.pointerId === pointerId) move(event);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) =>
    zone.addEventListener(type, (event) => {
      if (event.pointerId === pointerId || type === 'lostpointercapture') reset();
    }),
  );
  window.addEventListener('resize', reset);
  reset();
}

function setupInputMode() {
  const forced = new URLSearchParams(location.search).has('touch');
  const set = (mode) => { document.body.dataset.input = mode; };
  set(forced || window.matchMedia('(hover: none) and (pointer: coarse)').matches ? 'touch' : 'keyboard');
  if (forced) return;
  window.addEventListener('pointerdown', (event) => set(event.pointerType === 'touch' ? 'touch' : 'keyboard'), { capture: true });
  window.addEventListener('keydown', () => set('keyboard'), { capture: true });
}

function isTyping(event) {
  return event.target instanceof HTMLInputElement || !ui.joinOverlay.hidden;
}

/** Kendali kamera: seret = putar + miringkan; cubit dua jari = zoom; geser dua jari = geser (pan); roda = zoom. Mouse: klik kanan/tengah/Shift + seret = geser. */
function setupCameraGestures() {
  const pointers = new Map();
  let pinchStart = 0;
  let zoomStart = 1;
  let mid = null; // titik tengah dua jari sebelumnya
  const unitsPerPx = () => panUnitsPerPixel(armLength(cam, cameraFit()), root.getBoundingClientRect().height);
  const twoFingers = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };
  root.addEventListener('pointerdown', (event) => {
    root.setPointerCapture(event.pointerId);
    camResetting = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pan: event.pointerType === 'mouse' && (event.button === 1 || event.button === 2 || event.shiftKey) });
    if (pointers.size === 2) {
      const two = twoFingers();
      pinchStart = two.dist;
      mid = two.mid;
      zoomStart = cam.zoom;
    }
  });
  root.addEventListener('pointermove', (event) => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    last.x = event.clientX;
    last.y = event.clientY;
    if (pointers.size === 1) {
      if (last.pan) panBy(cam, dx, dy, unitsPerPx());
      else orbitBy(cam, dx, dy);
    } else if (pointers.size === 2 && pinchStart > 0) {
      const two = twoFingers();
      cam.zoom = zoomStart * (pinchStart / Math.max(1, two.dist));
      clampCam(cam);
      if (mid) panBy(cam, two.mid.x - mid.x, two.mid.y - mid.y, unitsPerPx());
      mid = two.mid;
    }
  });
  ['pointerup', 'pointercancel'].forEach((type) =>
    root.addEventListener(type, (event) => {
      pointers.delete(event.pointerId);
      pinchStart = 0;
      mid = null;
    }),
  );
  root.addEventListener('contextmenu', (event) => event.preventDefault()); // klik kanan dipakai untuk geser
  root.addEventListener('wheel', (event) => {
    event.preventDefault();
    camResetting = false;
    // cubit di trackpad datang sebagai wheel + ctrlKey dengan langkah kecil; roda mouse memakai langkah tetap
    const step = event.ctrlKey ? clamp(event.deltaY, -30, 30) * 0.01 : Math.sign(event.deltaY) * 0.1;
    zoomBy(cam, Math.exp(step));
  }, { passive: false });
}

/** Tombol zoom/pusatkan di layar (untuk HP dan untuk yang tidak punya roda). */
function setupCameraButtons() {
  const tap = (selector, fn) => $(selector)?.addEventListener('click', () => {
    camResetting = false;
    fn();
  });
  tap('#cam-zoom-in', () => zoomBy(cam, 1 / 1.25));
  tap('#cam-zoom-out', () => zoomBy(cam, 1.25));
  $('#cam-reset')?.addEventListener('click', () => { camResetting = true; });
}

function setupInput() {
  setupInputMode();
  setupCameraGestures();
  setupCameraButtons();
  const clock = () => performance.now() * 0.001;
  window.addEventListener('keydown', (event) => {
    if (isTyping(event)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    heldKeys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Enter' && joined) {
      event.preventDefault();
      openChat(true);
    }
    if (event.code === 'KeyE') toggleSit(clock());
    if (event.code === 'Space') clap(clock());
    if (event.code === 'KeyR' && joined) goToEntrance(clock());
    if (event.code === 'KeyM') toggleMute();
    if (event.code === 'KeyV') toggleMic();
    if (event.code === 'KeyP' && joined) togglePartyPanel();
    if (event.code === 'KeyG' && !event.repeat) toggleDance(clock());
    if (event.code === 'KeyC' && joined) camResetting = true; // pusatkan kamera
  });
  const turn = () => {
    if (heldKeys.has('KeyQ')) cam.yaw += 0.03;
    if (heldKeys.has('KeyZ')) cam.yaw -= 0.03;
    if (heldKeys.has('Equal') || heldKeys.has('NumpadAdd')) zoomBy(cam, 0.98); // + : zoom masuk (ditahan = terus mendekat)
    if (heldKeys.has('Minus') || heldKeys.has('NumpadSubtract')) zoomBy(cam, 1.02);
    requestAnimationFrame(turn);
  };
  turn();
  window.addEventListener('keyup', (event) => heldKeys.delete(event.code));
  window.addEventListener('blur', () => {
    heldKeys.clear();
    joystick.x = 0;
    joystick.z = 0;
  });

  showGreetRequest = setupGreet();
  setupJoystick();
  ui.sitButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    navigator.vibrate?.(12);
    toggleSit(clock());
  });
  $('#emote-mirror').addEventListener('click', () => { toggleMirror(); });
  $('#aura-toggle').addEventListener('click', () => {
    const on = $('#aura-toggle').getAttribute('aria-pressed') !== 'true';
    $('#aura-toggle').setAttribute('aria-pressed', String(on));
    setAurasVisible(on);
  });
  ui.danceButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    toggleDance(clock());
  });
  ui.clapButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    clap(clock());
  });
  document.querySelectorAll('.controls').forEach((el) => el.addEventListener('contextmenu', (e) => e.preventDefault()));
  ui.muteButton.addEventListener('click', toggleMute);
  $('#home-button').addEventListener('click', () => joined && goToEntrance(clock()));

  window.addEventListener('resize', () => {
    const size = root.getBoundingClientRect();
    if (size.width === 0 || size.height === 0) return;
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    renderer.setSize(size.width, size.height);
    hallScreen?.resize(size.width, size.height);
  });
}

function openAvatarEditor(edit) {
  editMode = edit;
  ui.joinForm.classList.toggle('is-edit', edit);
  $('#editor-title').textContent = edit ? 'Ubah avatarmu' : 'Buat avatarmu';
  $('#join-label').textContent = edit ? 'Simpan' : 'Masuk';
  $('#editor-cancel').hidden = !edit;
  avatarEditor.set(avatarCfg);
  ui.joinOverlay.hidden = false;
  avatarEditor.start();
}

/** Dock bawah: lembar emoji (gerakan) dan lembar menu (≡). Hanya satu lembar terbuka; ketuk di luar atau Esc menutup. */
function setupDock() {
  const sheets = { emoji: { btn: $('#emoji-button'), el: $('#emoji-sheet') }, menu: { btn: $('#menu-button'), el: $('#menu-sheet') } };
  const closeAll = () => {
    for (const s of Object.values(sheets)) {
      s.el.hidden = true;
      s.btn.setAttribute('aria-expanded', 'false');
    }
  };
  const toggle = (name) => {
    const open = sheets[name].el.hidden;
    closeAll();
    if (open) {
      sheets[name].el.hidden = false;
      sheets[name].btn.setAttribute('aria-expanded', 'true');
    }
  };
  sheets.emoji.btn.addEventListener('click', () => toggle('emoji'));
  sheets.menu.btn.addEventListener('click', () => toggle('menu'));
  $('#menu-close').addEventListener('click', closeAll);
  for (const s of Object.values(sheets)) s.el.addEventListener('click', (e) => { if (e.target.closest('.sheet-tile')) closeAll(); });
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.sheet, .dock')) closeAll();
  });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape') closeAll(); });
  return { closeAll };
}

function setupJoin() {
  setupDock();
  avatarEditor = createAvatarEditor({
    canvas: $('#avatar-preview'),
    tabsEl: $('#editor-tabs'),
    optionsEl: $('#editor-options'),
    initial: avatarCfg,
    onChange: (cfg) => { $('#editor-dance').hidden = cfg.m === 0; },
    photoButton: $('#photo-button'),
    photoInput: $('#photo-input'),
    styleButton: $('#photo-style'),
    clearButton: $('#photo-clear'),
    exportButton: $('#editor-export'),
    onNotice: notify,
  });
  $('#editor-random').addEventListener('click', () => avatarEditor.randomize());
  $('#editor-dance').addEventListener('click', () => avatarEditor.toggleDance());
  $('#editor-cancel').addEventListener('click', () => {
    avatarEditor.stop();
    ui.joinOverlay.hidden = true;
  });
  $('#avatar-button').addEventListener('click', () => openAvatarEditor(true));
  avatarEditor.start();
  try {
    ui.nameInput.value = eventParams.to ?? window.localStorage.getItem('orbit-name') ?? '';
  } catch {
    /* penyimpanan tidak tersedia */
  }
  ui.joinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    avatarCfg = avatarEditor.config;
    saveConfig(safeStorage(), avatarCfg);
    setAvatarConfig(playerAvatar, avatarCfg);
    applyFacePhoto(playerAvatar, avatarEditor.faceCanvas); // foto wajah (atau null = wajah 3D biasa); hanya terlihat di perangkat ini
    avatarEditor.stop();
    if (editMode) {
      ui.joinOverlay.hidden = true;
      multiplayer?.net.setAvatar?.(toWire(avatarCfg));
      return;
    }
    playerName = ui.nameInput.value.replace(/[<>]/g, '').trim().slice(0, 24) || 'Tamu';
    try {
      window.localStorage.setItem('orbit-name', playerName);
    } catch {
      /* abaikan */
    }
    document.body.classList.add('joined');
    $('#avatar-button').hidden = false;
    applySelfAura();
    window.setTimeout(() => ui.footer.classList.add('is-faded'), 8000);
    joined = true;
    ui.joinOverlay.hidden = true;
    sfx.join();
    startMultiplayer({ scene, search: window.location.search, name: playerName, roleKey, onError: (m) => { netError = m; } })
      .then((session) => {
        multiplayer = session;
        if (session) {
          clearSimulatedGuests();
          session.net.setAvatar?.(toWire(avatarCfg)); // avatar buatan sendiri, dilihat sama oleh semua orang
          session.net.setAura?.(dayPartIndex(new Date().getHours()));
        }
        session?.net.on('chat', addChatLine);
        session?.net.on('greet-req', (msg) => showGreetRequest(msg));
        setupVoice(session);
        setupParty(session);
        hallScreen?.attach(session);
      })
      .catch((error) => console.warn('[multiplayer]', error));
  });
}

async function startGame() {
  let stage = 'webgl-check';
  try {
    if (!hasWebGL2()) {
      showStartupError('Browser ini tidak menyediakan WebGL 2. Aktifkan akselerasi perangkat keras di pengaturan browser, lalu muat ulang.');
      return;
    }
    stage = 'scene';
    createScene();
    stage = 'avatar';
    playerAvatar = createAvatar({ config: avatarCfg });
    playerAvatar.position.set(me.x, 0, me.z);
    playerAvatar.rotation.y = me.rot;
    scene.add(playerAvatar);
    if (OFFLINE) populateOfflineGuests();
    stage = 'input';
    setupInput();
    setupJoin();
    setupChat();
    requestAnimationFrame(renderFrame);
  } catch (error) {
    console.error(`[startup:${stage}]`, error);
    showStartupError('Terjadi kesalahan saat memulai. Kirim detail di bawah ini ke pengembang.', `${stage}: ${error?.message ?? error}`);
  }
}

startGame();
