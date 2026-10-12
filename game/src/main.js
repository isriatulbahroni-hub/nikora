import * as THREE from 'three';
import { VoiceChat } from './voice.js';
import { loadEventInfo, parseEventParams } from './event-context.js';
import './gate.css';
import { mountGate, shouldShowGate } from './gate.js';
import { applyPose, createAvatar, makeBubble, setAvatarConfig, setStageRing } from './avatar.js';
import { createPartyController, speakerIds } from './party.js';
import { loadConfig, saveConfig, toWire } from './avatar-config.js';
import { createAvatarEditor } from './avatar-editor.js';
import { GAME_RULES, cameraRelativeMovement, normalizeMovement } from './game-rules.js';
import { HALL, SEATS, TABLES, facingAngle, findNearestSeat, resolveCollisions } from './hall-layout.js';
import { resolveServerUrl, startMultiplayer } from './multiplayer-view.js';
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
  clapButton: $('#touch-clap'),
  danceButton: $('#touch-dance'),
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
const eventParams = parseEventParams(window.location.search);
if (shouldShowGate(window.location.search)) {
  mountGate({ world: 'hall', search: window.location.search, supabase: { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY } });
}
// Judul acara dari undangan ditampilkan sebagai sapaan di kartu masuk (tanpa menambah HUD saat bermain).
if (eventParams.slug) {
  loadEventInfo(eventParams.slug, { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY }).then((info) => {
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
const focus = new THREE.Vector3(START.x, 0.5, START.z);
let priorFrameTime = 0;
let idleAngle = 0;
let yaw = 0; // putaran kamera di sekitar pemain
let zoom = 1;
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
  ui.muteButton.textContent = muted ? '×' : '♪';
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

// ---- Dunia: aula resepsi ----
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });

function box(w, h, d, material, x, y, z, { cast = true } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function screenTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 512, 288);
  gradient.addColorStop(0, '#2b2030');
  gradient.addColorStop(1, '#5a2431');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 288);
  ctx.fillStyle = '#f3d58a';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('LAYAR SIARAN LANGSUNG', 256, 134);
  ctx.fillStyle = '#e8dcc4';
  ctx.font = '22px sans-serif';
  ctx.fillText('(placeholder, belum tersambung)', 256, 176);
  return new THREE.CanvasTexture(canvas);
}

function buildTable(table) {
  const cloth = mat(0xf4efe6, { roughness: 0.9 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(HALL.tableRadius, HALL.tableRadius, 0.78, 28), cloth);
  top.position.set(table.x, 0.39, table.z);
  top.castShadow = true;
  top.receiveShadow = true;
  scene.add(top);
  const flowers = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat(0xe58fa8));
  flowers.position.set(table.x, 0.98, table.z);
  scene.add(flowers);
  const candle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd98a }));
  candle.position.set(table.x + 0.45, 0.84, table.z);
  scene.add(candle);
}

function buildChair(seat) {
  const wood = mat(0x8a6a4a);
  const chair = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), wood);
  base.position.y = 0.44;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.07), wood);
  back.position.set(0, 0.72, 0.23); // sandaran di belakang pemain (+z lokal)
  base.castShadow = true;
  chair.add(base, back);
  chair.position.set(seat.x, 0, seat.z);
  chair.rotation.y = seat.rot;
  scene.add(chair);
}

function buildStage() {
  const gold = mat(0xd4a84b, { metalness: 0.4, roughness: 0.4 });
  box(HALL.stage.halfWidth * 2, 0.4, 3.4, mat(0xb9a07a), 0, 0.2, -9.3);
  box(2.6, 0.05, 1.4, mat(0x8c2f39), 0, 0.43, -9.2, { cast: false }); // karpet pelaminan
  // sofa pelaminan
  for (const x of [-0.8, 0.8]) {
    box(1.1, 0.4, 0.8, mat(0xf2e4cf), x, 0.6, -10.2);
    box(1.1, 0.8, 0.2, mat(0xf2e4cf), x, 1.0, -10.55);
  }
  // gapura bunga
  box(0.25, 3.4, 0.25, gold, -2.4, 2.1, -10.9);
  box(0.25, 3.4, 0.25, gold, 2.4, 2.1, -10.9);
  box(5.05, 0.25, 0.25, gold, 0, 3.9, -10.9);
  const bloom = new THREE.SphereGeometry(0.28, 10, 8);
  for (let i = 0; i < 9; i += 1) {
    const flower = new THREE.Mesh(bloom, mat(i % 2 ? 0xe58fa8 : 0xf6e8ee));
    flower.position.set(-2.4 + i * 0.6, 3.75 - Math.sin((i / 8) * Math.PI) * 0.1, -10.8);
    scene.add(flower);
  }
}

function createScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d1722);
  scene.fog = new THREE.Fog(0x1d1722, 26, 48);

  const size = root.getBoundingClientRect();
  camera = new THREE.PerspectiveCamera(46, size.width / size.height, 0.1, 90);
  camera.position.set(0, 12, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(size.width, size.height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.setAttribute('aria-label', 'Tampilan aula resepsi 3D ORBIT');
  root.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x3a2f3f, 1.7));
  const key = new THREE.DirectionalLight(0xffe2b8, 2.4);
  key.position.set(-6, 14, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15 });
  scene.add(key);
  for (const [x, z] of [[0, -8], [-6, 2], [6, 2]]) {
    const lamp = new THREE.PointLight(0xffc98a, 18, 14, 2);
    lamp.position.set(x, 4.2, z);
    scene.add(lamp);
  }

  // lantai kayu, karpet merah menuju pelaminan, dinding
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), mat(0x7a5a3c, { roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  box(2.2, 0.02, 19, mat(0x8c2f39, { roughness: 0.95 }), 0, 0.012, 1.6, { cast: false });
  box(0.08, 0.025, 19, mat(0xd4a84b, { metalness: 0.4 }), -1.15, 0.015, 1.6, { cast: false });
  box(0.08, 0.025, 19, mat(0xd4a84b, { metalness: 0.4 }), 1.15, 0.015, 1.6, { cast: false });

  const wall = mat(0xe8dcc4, { roughness: 0.9 });
  box(24, 6, 0.35, wall, 0, 3, -11.65); // dinding belakang
  box(0.35, 1.1, 23, wall, -11.65, 0.55, 0);
  box(0.35, 1.1, 23, wall, 11.65, 0.55, 0);
  box(24, 0.7, 0.35, wall, 0, 0.35, 11.65);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 4.5),
    new THREE.MeshBasicMaterial({ map: screenTexture() }),
  );
  screen.position.set(0, 4.3, -11.45);
  scene.add(screen);

  buildStage();
  for (const table of TABLES) buildTable(table);
  for (const seat of SEATS) buildChair(seat);
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
  addSeatedNpc(null, 0xf6e8ee, 'Mempelai', { x: -0.8, y: 0.4 + HALL.seatedDrop, z: -10.2, rot: facingAngle(0, 1) });
  addSeatedNpc(null, 0x2f3a55, 'Mempelai', { x: 0.8, y: 0.4 + HALL.seatedDrop, z: -10.2, rot: facingAngle(0, 1) });
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
  const speakers = speakerIds(party.state);
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
  const movement = cameraRelativeMovement(getMovementInput(), yaw);
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
  ui.guests.textContent = multiplayer ? `${remote + 1}` : netError ? `offline · ${netError}` : joined ? '…' : 'offline';
  $('#online-dot').classList.toggle('is-online', Boolean(multiplayer));
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

function updateCamera(delta, now) {
  const fit = Math.min(1.9, Math.max(1, 1.45 / camera.aspect));
  if (!joined) {
    idleAngle += delta * 0.12;
    camera.position.set(Math.sin(idleAngle) * 19, 11, Math.cos(idleAngle) * 19);
    camera.lookAt(0, 1, 0);
    return;
  }
  const smoothing = 1 - Math.exp(-5 * delta);
  focus.x += (me.x - focus.x) * smoothing;
  focus.z += (me.z - focus.z) * smoothing;
  const target = new THREE.Vector3(focus.x, 0.6, focus.z);
  const distance = 9.5 * fit * zoom;
  const desired = new THREE.Vector3(
    focus.x + Math.sin(yaw) * distance,
    8.5 * fit * zoom,
    focus.z + Math.cos(yaw) * distance,
  );
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
  const pose = isDancing(now) ? 'dance' : selfAct ?? (now < clapUntil ? 'clap' : walking ? 'walk' : null);
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
  if (voice && multiplayer && Math.floor(now * 10) !== lastVoiceTick) {
    lastVoiceTick = Math.floor(now * 10);
    voice.update(me, multiplayer.net.players, party ? speakerIds(party.state) : undefined);
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
  renderer.render(scene, camera);
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

function setupCameraGestures() {
  const pointers = new Map();
  let pinchStart = 0;
  let zoomStart = 1;
  const clampZoom = (value) => Math.min(1.6, Math.max(0.55, value));
  root.addEventListener('pointerdown', (event) => {
    root.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      zoomStart = zoom;
    }
  });
  root.addEventListener('pointermove', (event) => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    if (pointers.size === 1) {
      yaw -= (event.clientX - last.x) * 0.006; // geser ke kanan memutar kamera ke kanan
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && pinchStart > 0) {
      const [a, b] = [...pointers.values()];
      zoom = clampZoom(zoomStart * (pinchStart / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))));
    }
  });
  ['pointerup', 'pointercancel'].forEach((type) =>
    root.addEventListener(type, (event) => {
      pointers.delete(event.pointerId);
      pinchStart = 0;
    }),
  );
  root.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoom = clampZoom(zoom * (1 + Math.sign(event.deltaY) * 0.08));
  }, { passive: false });
}

function setupInput() {
  setupInputMode();
  setupCameraGestures();
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
  });
  const turn = () => {
    if (heldKeys.has('KeyQ')) yaw += 0.03;
    if (heldKeys.has('KeyZ')) yaw -= 0.03;
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

function setupJoin() {
  avatarEditor = createAvatarEditor({
    canvas: $('#avatar-preview'),
    tabsEl: $('#editor-tabs'),
    optionsEl: $('#editor-options'),
    initial: avatarCfg,
    onChange: (cfg) => { $('#editor-dance').hidden = cfg.m === 0; },
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
    window.setTimeout(() => ui.footer.classList.add('is-faded'), 8000);
    joined = true;
    ui.joinOverlay.hidden = true;
    sfx.join();
    startMultiplayer({ scene, search: window.location.search, name: playerName, onError: (m) => { netError = m; } })
      .then((session) => {
        multiplayer = session;
        if (session) {
          clearSimulatedGuests();
          session.net.setAvatar?.(toWire(avatarCfg)); // avatar buatan sendiri, dilihat sama oleh semua orang
        }
        session?.net.on('chat', addChatLine);
        session?.net.on('greet-req', (msg) => showGreetRequest(msg));
        setupVoice(session);
        setupParty(session);
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
