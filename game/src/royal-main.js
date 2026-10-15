import * as THREE from 'three';
import { applyPose, createAvatar, setStageRing } from './avatar.js';
import { loadConfig, toWire } from './avatar-config.js';
import { startMultiplayer } from './multiplayer-view.js';
import { loadEventInfo, parseEventParams } from './event-context.js';
import './gate.css';
import { mountGate, shouldShowGate } from './gate.js';
import { chooseCameraPose, forwardLookBlend, resolveCameraDistance } from './villa-camera.js';
import { createQualityGovernor } from './quality.js';
import { modeFor } from './event-mode.js';
import { createPartyController, stageIds } from './party.js';
import { takeRoleKey } from './role-key.js';
import { renderPartyPanel } from './party-panel.js';
import { VOICE_CROWD, VoiceChat } from './voice.js';
import {
  BLESS_ZONE, DINING_TABLES, GAME_PADS, ISLAND_BY_ID, LAKE_LEVEL, PHOTO_SPOT, PIANO, buildRoyalOccluders, findNearestSpot, getRoyalWorld,
  nearestGamePad, nearestPortal, roomAt, spotPose, zoneOfPoint,
} from './royal-layout.js';
import { createRoyalWorld } from './royal-world.js';
import { createSky } from './royal-sky.js';
import { approach, nightAt } from './royal-time.js';
import { createFx, createRibbons } from './royal-fx.js';
import { createPiano } from './royal-music.js';
import { MOODS, classifyMood } from './royal-emotion.js';
import { SKY_MODES, decodeFx, encodeFx } from './royal-protocol.js';
import { composeSouvenir, downloadCanvas } from './royal-photo.js';

// The Royal Wedding · Istana Cinta: venue baru dengan istana yang bisa dijelajahi luar-dalam, danau kristal, pulau melayang
// (portal cahaya + penerbangan kamera tanpa layar loading), langit senja→malam, berkat pelaminan, kembang api dari ucapan,
// gelembung suara meja VIP, piano live, dan photobooth. Memakai infrastruktur yang sama dengan Villa (LiveKit, suara, panggung MC).
const PLAYER_SPEED = 5.2;
const FLIGHT_MS = 2800;
const PORTAL_COOLDOWN_MS = 3200;
const world = getRoyalWorld();
const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (t) => t * t * (3 - 2 * t);
const rnd = (a, b) => a + Math.random() * (b - a);
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

function showError(message, detail = '') {
  $('royal-error').style.display = 'grid';
  $('royal-error-text').textContent = message;
  $('royal-error-detail').textContent = detail;
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
const hooks = { action: () => {}, mic: () => {}, camera: () => {} };
const CAM_LIMITS = Object.freeze({ minPitch: 0.06, maxPitch: 1.5, minDist: 1.5, maxDist: 90 });
const CAM_PRESETS = Object.freeze([{ pitch: 0.28, dist: 5.6 }, { pitch: 0.55, dist: 11 }, { pitch: 0.95, dist: 21 }, { pitch: 1.5, dist: 44 }]);

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
  const typing = () => document.activeElement?.tagName === 'TEXTAREA';
  addEventListener('keydown', (e) => {
    if (typing()) return;
    const k = e.key.toLowerCase();
    if (k in KEYS) {
      held.add(k);
      e.preventDefault();
    } else if (!e.repeat && (k === 'e' || k === ' ')) {
      hooks.action();
      e.preventDefault();
    } else if (!e.repeat && k === 'c') hooks.camera();
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

let audioCtx = null;
/** Denting gelas singkat saat bersulang (hanya bila dekat meja). */
function clink() {
  try {
    audioCtx = audioCtx ?? new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume?.();
    const t = audioCtx.currentTime;
    for (const f of [2093, 2637]) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.55);
    }
  } catch {
    /* audio tidak tersedia */
  }
}

// ---------- start ----------
async function start() {
  const supabase = { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY };
  const gate = shouldShowGate(window.location.search) ? mountGate({ world: 'royal', search: window.location.search, supabase }) : null;
  if (!hasWebGL2()) {
    showError('Browser ini tidak mendukung WebGL 2. Aktifkan akselerasi perangkat keras lalu muat ulang.');
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const mono = (params.get('mono') || 'N&A').replace(/[<>]/g, '').slice(0, 6);
  const root = $('royal-root');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearAlpha(1);
  const quality = createQualityGovernor({ deviceRatio: window.devicePixelRatio || 1, cap: window.matchMedia?.('(pointer: coarse)').matches ? 2.25 : 2, floor: lowQuality ? 2 : 0 });
  renderer.setPixelRatio(quality.settings().ratio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.25, 1200);
  const built = createRoyalWorld({ scene, renderer, layout: world, mono });
  scene.traverse((o) => {
    if (o.isDirectionalLight) o.shadow.camera.updateProjectionMatrix();
  });
  const sky = createSky(scene);
  const fx = createFx({ scene, camera, renderer });
  const ribbons = createRibbons(scene, { x: PIANO.x, y: 0.7, z: PIANO.z });
  const piano = createPiano();
  if (lowQuality) applyQuality(renderer, scene, quality.settings());
  const occluders = buildRoyalOccluders(world);
  let camArm = 0;
  let camPitch = null;
  const camState = { yaw: 0, pitch: CAM_PRESETS[0].pitch, dist: CAM_PRESETS[0].dist };
  const camNow = { ...camState };
  let preset = 0;
  hooks.camera = () => {
    preset = (preset + 1) % CAM_PRESETS.length;
    camState.pitch = CAM_PRESETS[preset].pitch;
    camState.dist = CAM_PRESETS[preset].dist;
  };
  let eventMode = modeFor();
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
  const eventParams = parseEventParams(window.location.search);
  loadEventInfo(eventParams.slug, supabase).then((info) => {
    eventMode = modeFor(info?.eventType, info?.mode);
    if (info?.title) document.title = `${info.title} · Istana Cinta`;
  });
  const name = (params.get('name') || eventParams.to || store('orbit-name') || `Tamu-${Math.floor(Math.random() * 900 + 100)}`).replace(/[<>]/g, '').slice(0, 24);
  const avatarConfig = loadConfig(storage);
  const avatar = createAvatar({ config: avatarConfig, name });
  avatar.rotation.order = 'YXZ';
  scene.add(avatar);
  const me = { ...world.place('main', world.spawn.x, world.spawn.z) };
  let facing = Math.PI; // menghadap utara ke istana: rot 0 = utara
  facing = 0;
  camState.yaw = 0;
  camNow.yaw = 0;
  camera.position.set(me.x, 8, me.z + 11);

  // ---------- UI dasar ----------
  const toastEl = $('toast');
  let toastTimer = 0;
  const toast = (text) => {
    toastEl.textContent = text;
    toastEl.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.display = 'none'; }, Math.max(3200, text.length * 70));
  };
  const show = (el, on) => { el.hidden = !on; };

  // ---------- duduk ----------
  let seat = null;
  let seatSince = 0;
  let multiplayer = null;
  const actBtn = $('act-button');
  const poseFor = (id) => {
    const spot = world.spots[id];
    return spot ? spotPose(spot) : null;
  };
  const occupiedSpots = () => {
    const set = new Set();
    if (multiplayer) for (const p of multiplayer.net.players) if (p.id !== multiplayer.net.id && p.sit != null) set.add(p.sit);
    return set;
  };
  const nearestSpot = () => (seat === null ? findNearestSpot(me, world.spots, occupiedSpots()) : null);
  const standUp = () => { seat = null; };
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

  // ---------- suara dekat (gelembung meja VIP diatur lewat world.canHear) ----------
  let voice = null;
  let voiceBusy = false;
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
        if (msg.room) await voice.attach(msg.room);
        else await voice.connect({ url: msg.url, token: msg.token });
        micBtn.hidden = false;
        window.addEventListener('pointerdown', () => voice?.room?.startAudio().catch(() => {}), { once: true });
      } catch (error) {
        console.warn('[voice] gagal tersambung:', error);
        voice?.dispose();
        voice = null;
      }
    });
    session.net.requestVoiceToken();
  }

  // ---------- panggung MC ----------
  let party = null;
  const partyBtn = $('party-button');
  const partyPanel = $('party-panel');
  const nameOf = (id) => (id === multiplayer?.net.id ? 'Kamu' : multiplayer?.net.players.find((p) => p.id === id)?.name ?? 'Tamu');
  function renderParty() {
    if (party) renderPartyPanel({ body: $('party-body'), party, nameOf, button: partyBtn });
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

  // ---------- langit dan musik ----------
  let skyMode = SKY_MODES.includes(params.get('sky')) ? params.get('sky') : 'auto';
  let night = nightAt(skyMode, Date.now());
  const SKY_LABEL = { auto: 'otomatis', sunset: 'senja', night: 'malam' };
  const skyBtn = $('sky-button');
  const refreshSkyBtn = () => {
    skyBtn.setAttribute('aria-label', `Langit: ${SKY_LABEL[skyMode]}`);
    skyBtn.title = `Langit: ${SKY_LABEL[skyMode]} (ketuk untuk ganti)`;
  };
  refreshSkyBtn();
  const musicBtn = $('music-button');
  musicBtn.addEventListener('click', () => {
    if (piano.on) piano.stop();
    else {
      piano.start();
      if (!piano.on) toast('Audio tidak tersedia di browser ini.');
    }
    musicBtn.setAttribute('aria-pressed', String(piano.on));
    musicBtn.setAttribute('aria-label', piano.on ? 'Matikan piano live' : 'Nyalakan piano live');
  });

  // ---------- efek bersama: ucapan, bersulang, pad, langit (lewat kanal obrolan) ----------
  const wishesEl = $('wishes');
  const playerById = (id) => {
    if (!multiplayer || id === multiplayer.net.id) return { x: me.x, z: me.z, y: me.y, zone: me.zone, sit: seat, name };
    const p = multiplayer.net.players.find((q) => q.id === id);
    return p ? { ...p, zone: zoneOfPoint(p.x, p.y ?? 0, p.z) } : null;
  };
  function addWish(who, text, mood) {
    const row = document.createElement('div');
    row.className = 'wish';
    const b = document.createElement('b');
    b.textContent = `${who}: `;
    row.append(b, document.createTextNode(`${text} ${mood.mood === 'romantic' ? '❤' : mood.mood === 'funny' ? '😄' : mood.mood === 'pray' ? '🙏' : '🎉'}`));
    wishesEl.append(row);
    while (wishesEl.children.length > 4) wishesEl.firstChild.remove();
    setTimeout(() => row.remove(), 14000);
  }
  function launchPoint(p) {
    if (p?.zone === 'isle_star') {
      const isl = ISLAND_BY_ID.isle_star;
      return { x: isl.cx + rnd(-4, 4), y: isl.y, z: isl.cz + rnd(-4, 4) };
    }
    return { x: rnd(-18, 18), y: LAKE_LEVEL, z: rnd(8, 24) };
  }
  function onWish(m) {
    const mood = classifyMood(m.text);
    addWish(m.name || 'Tamu', m.text, mood);
    const p = playerById(m.id);
    const lp = launchPoint(p);
    fx.firework({ ...lp, mood });
    if (p && p.zone === 'main' && Math.hypot(p.x - BLESS_ZONE.x, p.z - BLESS_ZONE.z) <= BLESS_ZONE.r + 2) {
      fx.blessing(p.x, p.y ?? 0, p.z);
      built.inlay.pulse();
    }
  }
  function onFx(f, m) {
    const sender = playerById(m.id);
    if (f.kind === 'sky') {
      if (multiplayer && !multiplayer.net.canHost(m.id)) return;
      skyMode = f.arg;
      refreshSkyBtn();
      toast(`Langit: ${SKY_LABEL[skyMode]}`);
    } else if (f.kind === 'toast') {
      const table = Number.isInteger(sender?.sit) ? world.spots[sender.sit]?.table : null;
      const t = DINING_TABLES.find((q) => q.id === f.arg);
      if (!t || table !== f.arg) return;
      fx.toast(t.x, 0.0, t.z);
      if (me.zone === 'main' && Math.hypot(me.x - t.x, me.z - t.z) < 16) clink();
    } else if (f.kind === 'pad') {
      const pad = GAME_PADS.find((q) => q.id === f.arg && q.kind === 'firework');
      if (!pad || sender?.zone !== 'isle_game') return;
      fx.firework({ x: pad.x + rnd(-1, 1), y: ISLAND_BY_ID.isle_game.y, z: pad.z + rnd(-3, -1), mood: { ...MOODS[pad.mood], colors: [pad.color] } });
    }
  }
  const broadcast = (text, local) => {
    if (multiplayer) multiplayer.net.sendChat(text);
    else local({ id: null, name, text });
  };
  function setupFxChannel(session) {
    session?.net.on('chat', (m) => {
      const f = decodeFx(m.text);
      if (f) onFx(f, m);
      else onWish(m);
    });
  }
  skyBtn.addEventListener('click', () => {
    const next = SKY_MODES[(SKY_MODES.indexOf(skyMode) + 1) % SKY_MODES.length];
    broadcast(encodeFx('sky', next), (m) => onFx({ kind: 'sky', arg: next }, m));
  });

  // tombol kontekstual
  const bless = { btn: $('ctx-bless'), sheet: $('bless-sheet'), text: $('bless-text') };
  bless.btn.addEventListener('click', () => {
    bless.sheet.classList.add('is-open');
    bless.text.focus();
  });
  $('bless-cancel').addEventListener('click', () => bless.sheet.classList.remove('is-open'));
  $('bless-send').addEventListener('click', () => {
    const text = bless.text.value.replace(/[\u0000-\u001f\u007f<>\u200b]/g, '').trim().slice(0, 120);
    if (!text) return;
    bless.text.value = '';
    bless.sheet.classList.remove('is-open');
    broadcast(text, onWish);
    toast('Ucapanmu terkirim ✨');
  });
  const toastBtn = $('ctx-toast');
  toastBtn.addEventListener('click', () => {
    const table = seat !== null ? world.spots[seat]?.table : null;
    if (!table) return;
    clink();
    broadcast(encodeFx('toast', table), (m) => onFx({ kind: 'toast', arg: table }, { ...m, id: null }));
  });
  const padBtn = $('ctx-pad');
  let currentPad = null;
  padBtn.addEventListener('click', () => {
    if (!currentPad || currentPad.kind !== 'firework') return;
    broadcast(encodeFx('pad', currentPad.id), (m) => onFx({ kind: 'pad', arg: currentPad.id }, m));
  });

  // ---------- photobooth ----------
  const photo = { btn: $('ctx-photo'), sheet: $('photo-sheet'), img: $('photo-img'), save: $('photo-save'), shoot: $('photo-shoot'), hint: $('photo-hint'), poses: $('photo-poses') };
  let photoPose = 'wave';
  let activePose = null;
  let captureNext = false;
  let lastCard = null;
  let prevCam = null;
  photo.btn.addEventListener('click', () => {
    photo.img.style.display = 'none';
    show(photo.save, false);
    show(photo.shoot, true);
    show(photo.poses, true);
    photo.hint.textContent = 'Pilih gaya, lalu ketuk Ambil Foto. Kartu suvenir berbingkai emas bisa langsung kamu unduh.';
    photo.sheet.classList.add('is-open');
  });
  photo.poses.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pose]');
    if (!b) return;
    photoPose = b.dataset.pose;
    photo.poses.querySelectorAll('[data-pose]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  $('photo-close').addEventListener('click', () => {
    photo.sheet.classList.remove('is-open');
    multiplayer?.net.setDance?.(false);
    activePose = null;
  });
  photo.shoot.addEventListener('click', () => {
    photo.sheet.classList.remove('is-open');
    if (seat !== null) standUp();
    activePose = photoPose === 'stand' ? null : photoPose;
    if (multiplayer) {
      if (activePose === 'dance') multiplayer.net.setDance(true);
      else if (activePose === 'wave' || activePose === 'bow') multiplayer.net.setGesture(activePose);
    }
    prevCam = { ...camState };
    let d = (facing + Math.PI - camState.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    camState.yaw += d;
    camState.pitch = 0.2;
    camState.dist = 4.6;
    setTimeout(() => { captureNext = true; }, 1300);
  });
  photo.save.addEventListener('click', () => {
    if (lastCard) downloadCanvas(lastCard, 'nikora-royal-wedding.png');
  });
  function finishPhoto(snap) {
    $('flash').classList.remove('go');
    void $('flash').offsetWidth;
    $('flash').classList.add('go');
    lastCard = composeSouvenir(snap, { mono, name });
    photo.img.src = lastCard.toDataURL('image/jpeg', 0.9);
    photo.img.style.display = 'block';
    photo.hint.textContent = 'Kartu fotomu siap! Unduh untuk disimpan di galeri.';
    show(photo.save, true);
    show(photo.shoot, false);
    show(photo.poses, false);
    photo.sheet.classList.add('is-open');
    multiplayer?.net.setDance?.(false);
    activePose = null;
    if (prevCam) Object.assign(camState, prevCam);
  }

  // ---------- jaringan ----------
  let netStatus = 'Menyambung…';
  (gate ? gate.passed : Promise.resolve())
    .then(() => startMultiplayer({ scene, search: window.location.search, name, world: 'royal', poseFor, roleKey, onError: (m) => { netStatus = `Offline · ${m}`; } }))
    .then((session) => {
      multiplayer = session;
      if (!session && netStatus === 'Menyambung…') netStatus = 'Offline';
      session?.net.setAvatar?.(toWire(avatarConfig));
      setupVoice(session);
      setupParty(session);
      setupFxChannel(session);
      if (session && roleKey && session.net.role === 'guest') {
        toast(session.net.restricted ? 'Kunci pemilik/MC tidak dikenali server. Buat ulang tautan di /admin.html.' : 'Server belum membaca EVENT_ROLE_SECRET, jadi peran belum aktif.');
      }
      if (session && (session.net.role === 'owner' || session.net.role === 'mc')) toast(`Masuk sebagai ${session.net.role === 'owner' ? 'pemilik acara' : 'MC'}.`);
    })
    .catch((error) => console.warn('[multiplayer]', error));

  // ---------- loop ----------
  let last = performance.now();
  let walkClock = 0;
  let placeId = '';
  let voiceTick = 0;
  let partyTick = 0;
  let flight = null;
  let portalCooldown = performance.now() + 1500;
  let bounceStart = -1e9;
  let springCooldown = 0;
  let hintedMusic = false;

  function startFlight(portal, now) {
    const dest = world.place(portal.to.zone, portal.to.x, portal.to.z);
    if (seat !== null) standUp();
    flight = { t0: now, from: { x: me.x, y: me.y, z: me.z }, to: dest, arc: 5 + Math.abs(dest.y - me.y) * 0.18 };
    toast(`Terbang ke ${portal.label}…`);
  }

  function frame(time) {
    requestAnimationFrame(frame);
    const delta = Math.min((time - last) / 1000, 0.05);
    last = time;
    const t = time / 1000;

    // gerak, penerbangan portal, dan efek pegas
    const input = readInput();
    if (seat !== null && Math.hypot(input.x, input.z) > 0.35) standUp();
    const move = cameraRelative(input, camNow.yaw);
    let flightK = 0;
    let moving = false;
    if (flight) {
      const s = clamp((time - flight.t0) / FLIGHT_MS, 0, 1);
      const e = smooth(s);
      flightK = Math.sin(Math.PI * s);
      const nx = flight.from.x + (flight.to.x - flight.from.x) * e;
      const nz = flight.from.z + (flight.to.z - flight.from.z) * e;
      const dx = nx - me.x;
      const dz = nz - me.z;
      if (Math.hypot(dx, dz) > 1e-4) facing = Math.atan2(-dx, -dz);
      me.x = nx;
      me.z = nz;
      me.y = flight.from.y + (flight.to.y - flight.from.y) * e + Math.sin(Math.PI * s) * flight.arc;
      if (s >= 1) {
        Object.assign(me, flight.to);
        flight = null;
        portalCooldown = time + PORTAL_COOLDOWN_MS;
      }
    } else {
      moving = seat === null && (move.x !== 0 || move.z !== 0);
      if (moving) {
        const next = world.move(me, move.x * PLAYER_SPEED * delta, move.z * PLAYER_SPEED * delta);
        me.x = next.x;
        me.z = next.z;
        me.zone = next.zone;
        me.y = next.y;
        facing = Math.atan2(-move.x, -move.z);
        walkClock += delta;
        if (activePose && !captureNext) activePose = null;
        const portal = time > portalCooldown ? nearestPortal(me) : null;
        if (portal) startFlight(portal, time);
        const sp = nearestGamePad(me);
        if (sp?.kind === 'spring' && time > springCooldown) {
          bounceStart = time;
          springCooldown = time + 1400;
        }
      }
    }

    // jaringan
    if (multiplayer) {
      multiplayer.sendInput(seat === null ? move.x : 0, seat === null ? move.z : 0, facing, time, seat, { x: me.x, z: me.z, y: me.y });
      const mine = multiplayer.net.players.find((p) => p.id === multiplayer.net.id);
      if (mine && seat !== null && time - seatSince > 800 && mine.sit !== seat) standUp();
      multiplayer.view.update(delta, t);
      if (party && time - partyTick > 500) {
        partyTick = time;
        party.tick();
        applyStage();
      }
      if (voice && time - voiceTick > 100) {
        voiceTick = time;
        const self = { x: me.x, z: me.z, y: me.y, zone: me.zone, sit: seat };
        voice.update(me, multiplayer.net.players, stageIds(party?.state, multiplayer.net.players), {
          ...VOICE_CROWD,
          duck: eventMode.duck,
          selfId: multiplayer.net.id,
          canHear: (p) => world.canHear(self, p),
        });
        const speaking = voice.speaking();
        micBtn.classList.toggle('is-speaking', voice.micOn && speaking.has(multiplayer.net.id));
      }
    }

    // avatar lokal
    const pose = seat !== null ? poseFor(seat) : null;
    const k = 1 - Math.exp(-14 * delta);
    const bounce = Math.max(0, 1 - (time - bounceStart) / 900);
    const hop = bounce > 0 ? Math.abs(Math.sin((1 - bounce) * Math.PI * 2)) * 3.2 * bounce : 0;
    if (pose) {
      avatar.position.x += (pose.x - avatar.position.x) * k;
      avatar.position.z += (pose.z - avatar.position.z) * k;
      avatar.position.y += (pose.y - avatar.position.y) * k;
      avatar.rotation.y = pose.rotY;
    } else {
      avatar.position.x = me.x;
      avatar.position.z = me.z;
      const bob = moving ? Math.abs(Math.sin(walkClock * 12)) * 0.08 : 0;
      avatar.position.y += (me.y + bob + hop - avatar.position.y) * Math.max(k, 0.5);
      avatar.rotation.y = facing;
    }
    applyPose(avatar, flight ? 'wave' : activePose ?? (moving ? 'walk' : null), t, delta);

    // kamera
    camState.pitch = clamp(camState.pitch, CAM_LIMITS.minPitch, CAM_LIMITS.maxPitch);
    camState.dist = clamp(camState.dist, CAM_LIMITS.minDist, CAM_LIMITS.maxDist);
    const ck = 1 - Math.exp(-12 * delta);
    camNow.yaw += (camState.yaw - camNow.yaw) * ck;
    camNow.pitch += (camState.pitch - camNow.pitch) * ck;
    camNow.dist += (camState.dist - camNow.dist) * ck;
    const wide = clamp((camNow.dist - 8) / 6, 0, 1);
    const fit = 1 + (Math.min(1.9, Math.max(1, 1.45 / camera.aspect)) - 1) * wide;
    const want = camNow.dist * fit + 22 * flightK;
    const eye = { x: me.x, y: me.y + 1.45, z: me.z };
    const occ = flight ? [] : occluders;
    const camPose = chooseCameraPose(eye, camNow.yaw, camNow.pitch + 0.3 * flightK, want, occ);
    camPitch = camPitch === null ? camPose.pitch : camPitch + (camPose.pitch - camPitch) * (1 - Math.exp(-6 * delta));
    const cp = Math.cos(camPitch);
    const dir = { x: Math.sin(camNow.yaw) * cp, y: Math.sin(camPitch), z: Math.cos(camNow.yaw) * cp };
    const { dist: freeArm } = resolveCameraDistance(eye, dir, want, occ);
    camArm = camArm === 0 || freeArm < camArm ? freeArm : camArm + (freeArm - camArm) * (1 - Math.exp(-4 * delta));
    camera.position.set(eye.x + dir.x * camArm, eye.y + dir.y * camArm, eye.z + dir.z * camArm);
    const look = forwardLookBlend(camArm);
    const ahead = { x: eye.x - Math.sin(camNow.yaw) * 6, y: eye.y - 0.3, z: eye.z - Math.cos(camNow.yaw) * 6 };
    camera.lookAt(me.x + (ahead.x - me.x) * look, me.y + 1.2 + (ahead.y - (me.y + 1.2)) * look, me.z + (ahead.z - me.z) * look);
    avatar.visible = camArm > 0.95;

    // langit, cahaya, dan efek
    night = approach(night, nightAt(skyMode, Date.now()), delta, 0.25);
    const atm = sky.update(night, camera.position, t);
    built.setAtmosphere(atm);
    renderer.toneMappingExposure = atm.exposure;
    const here = roomAt(me.zone, me.x, me.z);
    const onInlay = me.zone === 'main' && Math.hypot(me.x - BLESS_ZONE.x, me.z - (-40.2)) < 3.2;
    let crowdOnInlay = onInlay;
    if (!crowdOnInlay && multiplayer) crowdOnInlay = multiplayer.net.players.some((p) => p.id !== multiplayer.net.id && Math.hypot(p.x - BLESS_ZONE.x, p.z + 40.2) < 3.2 && (p.y ?? 0) < 2);
    built.inlay.setStanding(crowdOnInlay);
    built.update(t, delta, { x: me.x, y: me.y, z: me.z }, here.indoor);
    fx.update(delta, t);
    const dPiano = me.zone === 'main' ? Math.hypot(me.x - PIANO.x, me.z - PIANO.z) : 120;
    piano.setVolume(here.id === 'music' ? 0.9 : me.zone === 'main' ? 0.7 * clamp(1 - dPiano / 70, 0, 1) ** 1.6 : 0.12);
    ribbons.update(piano.spectrum(), piano.level(), t);
    if (here.id === 'music' && !piano.on && !hintedMusic) {
      hintedMusic = true;
      toast('Ketuk 🎹 di kanan atas untuk menyalakan piano live');
    }

    const qChange = quality.setFloor(lowQuality ? 2 : 0) ?? quality.tick(performance.now());
    if (qChange) applyQuality(renderer, scene, qChange);
    renderer.render(scene, camera);
    if (captureNext) {
      captureNext = false;
      const snap = document.createElement('canvas');
      snap.width = renderer.domElement.width;
      snap.height = renderer.domElement.height;
      snap.getContext('2d').drawImage(renderer.domElement, 0, 0);
      finishPhoto(snap);
    }

    // tombol kontekstual dan HUD
    const near = nearestSpot();
    setActLabel(seat !== null ? 'Berdiri' : near ? 'Duduk' : '');
    const free = !flight && !photo.sheet.classList.contains('is-open') && !bless.sheet.classList.contains('is-open');
    show(bless.btn, free && me.zone === 'main' && Math.hypot(me.x - BLESS_ZONE.x, me.z - BLESS_ZONE.z) <= BLESS_ZONE.r);
    show(toastBtn, free && seat !== null && !!world.spots[seat]?.table);
    show(photo.btn, free && here.id === 'photo');
    currentPad = free ? nearestGamePad(me) : null;
    show(padBtn, !!currentPad && currentPad.kind === 'firework');
    const key = `${here.id}@${me.zone}`;
    if (key !== placeId) {
      placeId = key;
      $('place').textContent = here.name;
    }
    const others = multiplayer ? multiplayer.net.players.filter((p) => p.id !== multiplayer.net.id) : [];
    $('online').textContent = multiplayer ? (multiplayer.net.status === 'reconnecting' ? 'Menyambung ulang…' : `Online: ${others.length + 1}`) : netStatus;
  }
  requestAnimationFrame(frame);

  window.__royal = {
    state: () => ({ x: me.x, z: me.z, y: me.y, zone: me.zone, place: roomAt(me.zone, me.x, me.z), seat, flying: !!flight, night, skyMode, online: !!multiplayer }),
    renderStats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio() }),
    teleport: (zone, x, z) => {
      Object.assign(me, world.place(zone, x, z));
      camera.position.set(me.x + 1.5, me.y + 12, me.z + 14);
    },
    portals: () => nearestPortal(me)?.id ?? null,
    photoSpot: PHOTO_SPOT,
  };
}

start().catch((error) => {
  console.error('[royal]', error);
  showError('Terjadi kesalahan saat memulai.', String(error?.stack ?? error));
});
