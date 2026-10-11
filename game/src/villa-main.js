import * as THREE from 'three';
import { createAvatar } from './avatar.js';
import { loadConfig, toWire } from './avatar-config.js';
import { startMultiplayer } from './multiplayer-view.js';
import { getVillaWorld, roomAt } from './villa-layout.js';
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

function setupInput(canvas, camState) {
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k in KEYS) {
      held.add(k);
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
  addEventListener('blur', () => held.clear());
  canvas.addEventListener('wheel', (e) => {
    camState.zoom = Math.min(2.2, Math.max(0.6, camState.zoom * (e.deltaY > 0 ? 1.08 : 0.92)));
    e.preventDefault();
  }, { passive: false });

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
};
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
  l.fillStyle = '#5a9a4e';
  l.fillRect(0, 0, layer.width, layer.height);
  for (const z of world.zones) {
    if (z.kind === 'courtyard') l.fillStyle = '#d7c9ae';
    else if (z.kind === 'parking') l.fillStyle = '#41444a';
    else continue;
    l.fillRect(px(z.rect[0]), pz(z.rect[1]), (z.rect[2] - z.rect[0]) * sx, (z.rect[3] - z.rect[1]) * sz);
  }
  l.fillStyle = '#dcd0b8';
  l.fillRect(px(-2.5), pz(16), 5 * sx, 26 * sz);
  l.fillStyle = '#39c3df';
  l.fillRect(px(-7), pz(2), 14 * sx, 14 * sz);
  l.fillStyle = '#fff';
  l.fillRect(px(-1.5), pz(2), 3 * sx, 14 * sz);
  for (const r of world.rooms) {
    l.fillStyle = MAP_COLORS[r.kind] ?? '#ddd';
    l.fillRect(px(r.rect[0]), pz(r.rect[1]), (r.rect[2] - r.rect[0]) * sx, (r.rect[3] - r.rect[1]) * sz);
  }
  l.fillStyle = '#5a4a3a';
  for (const w of world.walls) {
    if (w.orient === 'h') l.fillRect(px(w.a), pz(w.coord) - 0.6, (w.b - w.a) * sx, 1.2);
    else l.fillRect(px(w.coord) - 0.6, pz(w.a), 1.2, (w.b - w.a) * sz);
  }
  const dot = (x, z, color, r) => {
    ctx.beginPath();
    ctx.arc(px(x), pz(z), r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };
  return (self, others) => {
    ctx.drawImage(layer, 0, 0);
    for (const o of others) dot(o.x, o.z, '#ff8a3d', 3);
    dot(self.x, self.z, '#fff', 4.5);
    dot(self.x, self.z, '#e23b3b', 2.8);
  };
}

// ---------- start ----------
async function start() {
  if (!hasWebGL2()) {
    showError('Browser ini tidak mendukung WebGL 2. Aktifkan akselerasi perangkat keras lalu muat ulang.');
    return;
  }
  const root = $('villa-root');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const built = buildVillaWorld(scene, world);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 400);
  const camState = { zoom: 1.25 };
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);
  setupInput(renderer.domElement, camState);

  const params = new URLSearchParams(window.location.search);
  const storage = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  const savedName = (() => {
    try {
      return storage?.getItem('orbit-name');
    } catch {
      return null;
    }
  })();
  const name = (params.get('name') || savedName || `Tamu-${Math.floor(Math.random() * 900 + 100)}`).replace(/[<>]/g, '').slice(0, 24);
  const avatarConfig = loadConfig(storage); // avatar yang sama dengan yang dibuat di aula
  const avatar = createAvatar({ config: avatarConfig, name });
  scene.add(avatar);
  const me = { x: world.spawn.x, z: world.spawn.z };
  const spawn = world.constrain(me);
  me.x = spawn.x;
  me.z = spawn.z;
  camera.position.set(me.x, 14, me.z + 11);

  let multiplayer = null;
  let netStatus = 'Menyambung…'; // alasan ditampilkan bila gagal terhubung
  startMultiplayer({ scene, search: window.location.search, name, world: 'villa', onError: (m) => { netStatus = `Offline · ${m}`; } })
    .then((session) => {
      multiplayer = session;
      if (!session && netStatus === 'Menyambung…') netStatus = 'Offline';
      session?.net.setAvatar?.(toWire(avatarConfig));
    })
    .catch((error) => console.warn('[multiplayer]', error));

  const drawMap = createMinimap();
  let last = performance.now();
  let facing = 0;
  let walkClock = 0;
  let placeId = '';

  function frame(time) {
    requestAnimationFrame(frame);
    const delta = Math.min((time - last) / 1000, 0.05);
    last = time;

    const input = readInput();
    const moving = input.x !== 0 || input.z !== 0;
    if (moving) {
      const next = world.move(me, input.x * PLAYER_SPEED * delta, input.z * PLAYER_SPEED * delta);
      me.x = next.x;
      me.z = next.z;
      facing = Math.atan2(-input.x, -input.z);
      walkClock += delta;
    }

    if (multiplayer) {
      multiplayer.sendInput(input.x, input.z, facing, time, null, { x: me.x, z: me.z });
      const mine = multiplayer.net.players.find((p) => p.id === multiplayer.net.id);
      if (mine && Math.hypot(mine.x - me.x, mine.z - me.z) > SNAP_DISTANCE) {
        me.x = mine.x;
        me.z = mine.z;
      }
      multiplayer.view.update(delta);
    }

    avatar.position.set(me.x, moving ? Math.abs(Math.sin(walkClock * 12)) * 0.08 : 0, me.z);
    avatar.rotation.y = facing;

    const fit = Math.min(1.9, Math.max(1, 1.45 / camera.aspect)) * camState.zoom;
    const desired = new THREE.Vector3(me.x + 1.5 * fit, 15 * fit, me.z + 11.5 * fit);
    camera.position.lerp(desired, 1 - Math.exp(-5 * delta));
    camera.lookAt(me.x, 0.8, me.z);
    built.update(me.x, me.z, delta);
    renderer.render(scene, camera);

    const place = roomAt(me.x, me.z);
    if (place.id !== placeId) {
      placeId = place.id;
      $('place').textContent = place.name;
    }
    const others = multiplayer ? multiplayer.net.players.filter((p) => p.id !== multiplayer.net.id) : [];
    drawMap(me, others);
    $('online').textContent = multiplayer ? `Online: ${others.length + 1}` : netStatus;
  }
  requestAnimationFrame(frame);

  window.__villa = {
    state: () => ({ x: me.x, z: me.z, place: roomAt(me.x, me.z), online: !!multiplayer, others: multiplayer ? multiplayer.view.count : 0 }),
    // hanya untuk pengujian; dalam mode multiplayer server tetap otoritatif dan akan mengoreksi posisi
    teleport: (x, z) => {
      const p = world.constrain({ x, z });
      me.x = p.x;
      me.z = p.z;
    },
  };
}

start().catch((error) => {
  console.error('[villa]', error);
  showError('Terjadi kesalahan saat memulai.', String(error?.stack ?? error));
});
