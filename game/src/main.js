import * as RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {
  applyDamage,
  clampArenaPosition,
  GAME_RULES,
  getDashDirection,
  getMatchOutcome,
  isAttackReady,
  normalizeMovement,
} from './game-rules.js';
import { startMultiplayer } from './multiplayer-view.js';
import './style.css';

const root = document.querySelector('#game-root');
const ui = {
  playerHealth: document.querySelector('#player-health-label'),
  playerHealthBar: document.querySelector('#player-health-bar'),
  enemyHealth: document.querySelector('#enemy-health-label'),
  enemyHealthBar: document.querySelector('#enemy-health-bar'),
  matchStatus: document.querySelector('#match-status'),
  overlay: document.querySelector('#result-overlay'),
  resultTitle: document.querySelector('#result-title'),
  resultCopy: document.querySelector('#result-copy'),
};

let multiplayer = null; // aktif hanya jika URL memakai ?server=ws://...
const FIXED_STEP = 1 / 60;
const PLAYER_SPEED = 5.2;
const ENEMY_SPEED = 2.9;
const heldKeys = new Set();
const joystick = { x: 0, z: 0 };
const JOY_RADIUS = 52;
const JOY_DEADZONE = 0.14;
const dashButton = document.querySelector('#touch-dash');
const muteButton = document.querySelector('#mute-button');
let nextDashAt = 0;
let dashUntil = 0;
let dashDir = { x: 0, z: -1 };
let dashQueued = false;
let shake = 0;
let ringLife = 0;
let attackRing;
let lastEnemyPos = { x: 0, z: -5.2 };

// ---- Suara sintetis (tanpa file aset) ----
let audioCtx = null;
let muted = false;
function tone(freq, duration, { type = 'square', volume = 0.07, slideTo = null, delay = 0 } = {}) {
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
    /* audio tidak tersedia; game tetap berjalan */
  }
}
const sfx = {
  swing: () => tone(320, 0.09, { type: 'triangle', slideTo: 120 }),
  hit: () => tone(190, 0.13, { slideTo: 60, volume: 0.1 }),
  hurt: () => tone(150, 0.2, { type: 'sawtooth', slideTo: 70 }),
  dash: () => tone(420, 0.12, { type: 'sine', slideTo: 900 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', delay: i * 0.12 })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, { type: 'sawtooth', volume: 0.05, delay: i * 0.14 })),
};
function toggleMute() {
  muted = !muted;
  muteButton.setAttribute('aria-pressed', String(muted));
  muteButton.setAttribute('aria-label', muted ? 'Nyalakan suara' : 'Matikan suara');
  muteButton.textContent = muted ? '×' : '♪';
}

function spawnFloat(text, position, kind) {
  const point = new THREE.Vector3(position.x, 1.9, position.z).project(camera);
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

let renderer;
let scene;
let camera;
let world;
let playerBody;
let enemyBody;
let playerFighter;
let enemyFighter;
let playerHealth = GAME_RULES.maxHealth;
let enemyHealth = GAME_RULES.maxHealth;
let nextPlayerAttackAt = 0;
const attackButton = document.querySelector('#touch-attack');
let nextEnemyAttackAt = 0;
let matchOutcome = 'playing';
let matchStarted = false;
let attackQueued = false;
let facing = { x: 0, z: -1 };
let accumulator = 0;
let priorFrameTime = 0;

function showStartupError(message, detail = '') {
  const box = document.createElement('div');
  box.className = 'render-error';
  const title = document.createElement('strong');
  title.textContent = 'Prototype tidak dapat dimulai.';
  const text = document.createElement('span');
  text.textContent = message;
  box.append(title, text);
  if (detail) {
    const code = document.createElement('code');
    code.textContent = detail;
    box.append(code);
  }
  root.replaceChildren(box);
  ui.matchStatus.textContent = 'ERROR';
}

function hasWebGL2() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

function addStaticBox(position, halfExtents, material, castShadow = true) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setFriction(0.85)
      .setRestitution(0),
    body,
  );

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2),
    material,
  );
  mesh.position.set(position.x, position.y, position.z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addArena() {
  const floorBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.28, 0),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(12, 0.28, 12).setFriction(1), floorBody);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshStandardMaterial({ color: 0x1a2823, roughness: 0.88, metalness: 0.06 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.006;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(24, 24, 0x88ad91, 0x526f62);
  grid.position.y = 0.018;
  grid.material.transparent = true;
  grid.material.opacity = 0.4;
  scene.add(grid);

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x7f9d89,
    roughness: 0.73,
    metalness: 0.12,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2a35a,
    roughness: 0.45,
    metalness: 0.24,
  });

  addStaticBox({ x: 0, y: 0.65, z: -11.65 }, { x: 12, y: 0.65, z: 0.35 }, wallMaterial);
  addStaticBox({ x: 0, y: 0.65, z: 11.65 }, { x: 12, y: 0.65, z: 0.35 }, wallMaterial);
  addStaticBox({ x: -11.65, y: 0.65, z: 0 }, { x: 0.35, y: 0.65, z: 11 }, wallMaterial);
  addStaticBox({ x: 11.65, y: 0.65, z: 0 }, { x: 0.35, y: 0.65, z: 11 }, wallMaterial);

  const obstacleMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d8b70,
    roughness: 0.86,
    metalness: 0.04,
  });
  const obstaclePositions = [
    { x: -4.6, z: -4.2 },
    { x: 4.6, z: -4.2 },
    { x: -4.6, z: 4.2 },
    { x: 4.6, z: 4.2 },
  ];

  for (const position of obstaclePositions) {
    addStaticBox(
      { x: position.x, y: 0.9, z: position.z },
      { x: 0.82, y: 0.9, z: 0.82 },
      obstacleMaterial,
    );

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(1.68, 0.09, 1.68),
      trimMaterial,
    );
    cap.position.set(position.x, 1.86, position.z);
    cap.castShadow = true;
    scene.add(cap);
  }

  const centerMark = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 2.24, 64),
    new THREE.MeshBasicMaterial({ color: 0xd99050, transparent: true, opacity: 0.52, side: THREE.DoubleSide }),
  );
  centerMark.rotation.x = -Math.PI / 2;
  centerMark.position.y = 0.025;
  scene.add(centerMark);
}

function createFighter({ color, accent, start, kinematic = false }) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.52,
    metalness: 0.08,
    emissive: color,
    emissiveIntensity: 0.035,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: accent,
    roughness: 0.38,
    metalness: 0.12,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x26332d, roughness: 0.74 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 5, 12), bodyMaterial);
  torso.position.y = 0.75;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), accentMaterial);
  head.position.y = 1.37;
  head.castShadow = true;
  group.add(head);

  const face = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.12), darkMaterial);
  face.position.set(0, 1.39, -0.255);
  group.add(face);

  const directionMarker = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.3, 4),
    accentMaterial,
  );
  directionMarker.rotation.x = -Math.PI / 2;
  directionMarker.position.set(0, 0.83, -0.48);
  group.add(directionMarker);

  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.56, 32),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.025;
  group.add(shadowDisc);

  scene.add(group);

  const descriptor = kinematic
    ? RAPIER.RigidBodyDesc.kinematicPositionBased()
    : RAPIER.RigidBodyDesc.dynamic().setLinearDamping(4).lockRotations();
  const body = world.createRigidBody(descriptor.setTranslation(start.x, 0.82, start.z));
  world.createCollider(
    RAPIER.ColliderDesc.capsule(0.42, 0.32)
      .setFriction(0.12)
      .setRestitution(0),
    body,
  );

  return { body, group, bodyMaterial };
}

function createScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121c19);
  scene.fog = new THREE.Fog(0x121c19, 22, 42);

  const canvasSize = root.getBoundingClientRect();
  camera = new THREE.PerspectiveCamera(42, canvasSize.width / canvasSize.height, 0.1, 80);
  camera.position.set(0, 15, 17);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(canvasSize.width, canvasSize.height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.domElement.setAttribute('aria-label', 'Tampilan game arena 3D ORBIT');
  root.append(renderer.domElement);

  const hemisphere = new THREE.HemisphereLight(0xe3f4dd, 0x26332b, 2.05);
  scene.add(hemisphere);

  const keyLight = new THREE.DirectionalLight(0xffe0ad, 3.2);
  keyLight.position.set(-7, 13, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -15;
  keyLight.shadow.camera.right = 15;
  keyLight.shadow.camera.top = 15;
  keyLight.shadow.camera.bottom = -15;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x8fcab2, 1.15);
  fillLight.position.set(8, 7, -8);
  scene.add(fillLight);

  addArena();
}

function createWorld() {
  world = new RAPIER.World({ x: 0, y: -22, z: 0 });
  world.timestep = FIXED_STEP;
  world.integrationParameters.numSolverIterations = 6;
}

function setupPhysics() {

  playerFighter = createFighter({
    color: 0x70c7a2,
    accent: 0xe3bd79,
    start: { x: 0, z: 5.2 },
  });
  enemyFighter = createFighter({
    color: 0xd97754,
    accent: 0xf0c47d,
    start: { x: 0, z: -5.2 },
    kinematic: true,
  });
  attackRing = new THREE.Mesh(
    new THREE.RingGeometry(GAME_RULES.playerAttackRange - 0.08, GAME_RULES.playerAttackRange, 48),
    new THREE.MeshBasicMaterial({ color: 0xffe3a8, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  attackRing.rotation.x = -Math.PI / 2;
  attackRing.visible = false;
  scene.add(attackRing);
  playerBody = playerFighter.body;
  enemyBody = enemyFighter.body;
}

function getMovementInput() {
  const right = heldKeys.has('KeyD') || heldKeys.has('ArrowRight');
  const left = heldKeys.has('KeyA') || heldKeys.has('ArrowLeft');
  const down = heldKeys.has('KeyS') || heldKeys.has('ArrowDown');
  const up = heldKeys.has('KeyW') || heldKeys.has('ArrowUp');
  const keyboard = normalizeMovement(Number(right) - Number(left), Number(down) - Number(up));
  if (keyboard.x || keyboard.z) return keyboard;
  return normalizeMovement(joystick.x, joystick.z);
}

function updateHealthHud() {
  ui.playerHealth.textContent = String(Math.ceil(playerHealth));
  ui.enemyHealth.textContent = String(Math.ceil(enemyHealth));
  ui.playerHealthBar.style.width = `${playerHealth}%`;
  ui.enemyHealthBar.style.width = `${enemyHealth}%`;
  ui.playerHealthBar.classList.toggle('is-low', playerHealth <= 35);
  ui.enemyHealthBar.classList.toggle('is-low', enemyHealth <= 35);
}

function finishMatch(outcome) {
  if (outcome === 'playing' || matchOutcome !== 'playing') return;
  matchOutcome = outcome;
  if (outcome === 'victory') sfx.win();
  else sfx.lose();
  playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  ui.matchStatus.textContent = outcome === 'victory' ? 'VICTORY' : outcome === 'defeat' ? 'DEFEAT' : 'DRAW';
  ui.resultTitle.textContent = outcome === 'victory' ? 'Victory' : outcome === 'defeat' ? 'Defeated' : 'Draw';
  ui.resultCopy.textContent = outcome === 'victory'
    ? 'Rival tumbang. Arena dikuasai.'
    : outcome === 'defeat'
      ? 'Kamu tumbang. Coba pendekatan lain.'
      : 'Keduanya tumbang. Ulangi pertarungan.';
  ui.overlay.hidden = false;
}

function attemptPlayerAttack(now) {
  if (!attackQueued || matchOutcome !== 'playing') return;
  attackQueued = false;
  matchStarted = true;
  if (!isAttackReady(now, nextPlayerAttackAt)) return;
  nextPlayerAttackAt = now + GAME_RULES.playerAttackCooldown;
  ringLife = 1;
  sfx.swing();

  const playerPosition = playerBody.translation();
  const enemyPosition = enemyBody.translation();
  const dx = enemyPosition.x - playerPosition.x;
  const dz = enemyPosition.z - playerPosition.z;
  const distance = Math.hypot(dx, dz);
  const facingDot = distance > 0 ? (dx * facing.x + dz * facing.z) / distance : 1;

  playerFighter.group.scale.set(1.12, 1.06, 1.12);
  window.setTimeout(() => playerFighter?.group.scale.set(1, 1, 1), 100);

  if (distance <= GAME_RULES.playerAttackRange && facingDot > 0.05) {
    enemyHealth = applyDamage(enemyHealth, GAME_RULES.playerDamage);
    spawnFloat(`-${GAME_RULES.playerDamage}`, enemyPosition, 'is-enemy');
    sfx.hit();
    shake = Math.max(shake, 0.18);
    enemyFighter.bodyMaterial.emissiveIntensity = 0.72;
    window.setTimeout(() => {
      if (enemyFighter) enemyFighter.bodyMaterial.emissiveIntensity = 0.035;
    }, 140);
    updateHealthHud();
    finishMatch(getMatchOutcome(playerHealth, enemyHealth));
  }
}

function attemptDash(now) {
  if (!dashQueued || matchOutcome !== 'playing') return;
  dashQueued = false;
  if (!isAttackReady(now, nextDashAt)) return;
  matchStarted = true;
  nextDashAt = now + GAME_RULES.dashCooldown;
  dashUntil = now + GAME_RULES.dashDuration;
  dashDir = getDashDirection(getMovementInput(), facing);
  facing = { ...dashDir };
  sfx.dash();
}

function updatePlayer(delta, now) {
  const movement = getMovementInput();
  if (movement.x || movement.z) {
    matchStarted = true;
    const magnitude = Math.hypot(movement.x, movement.z);
    facing = { x: movement.x / magnitude, z: movement.z / magnitude };
    playerFighter.group.rotation.y = Math.atan2(-facing.x, -facing.z);
  }

  multiplayer?.sendInput(movement.x, movement.z, playerFighter.group.rotation.y, now * 1000);

  const dashing = now < dashUntil;
  const moveX = dashing ? dashDir.x * GAME_RULES.dashSpeed : movement.x * PLAYER_SPEED;
  const moveZ = dashing ? dashDir.z * GAME_RULES.dashSpeed : movement.z * PLAYER_SPEED;
  const velocity = playerBody.linvel();
  playerBody.setLinvel({
    x: moveX,
    y: velocity.y,
    z: moveZ,
  }, true);

  if (delta <= 0) return;
  const position = playerBody.translation();
  const bounded = clampArenaPosition(position);
  if (bounded.x !== position.x || bounded.z !== position.z) {
    playerBody.setTranslation({ x: bounded.x, y: position.y, z: bounded.z }, true);
  }
}

function updateEnemy(now, delta) {
  const enemyPosition = enemyBody.translation();
  const playerPosition = playerBody.translation();
  const dx = playerPosition.x - enemyPosition.x;
  const dz = playerPosition.z - enemyPosition.z;
  const distance = Math.hypot(dx, dz);
  let nextX = enemyPosition.x;
  let nextZ = enemyPosition.z;

  if (distance > GAME_RULES.enemyAttackRange && distance > 0) {
    matchStarted = true;
    const travel = Math.min(ENEMY_SPEED * delta, distance - GAME_RULES.enemyAttackRange);
    nextX += (dx / distance) * travel;
    nextZ += (dz / distance) * travel;
  }

  enemyBody.setNextKinematicTranslation({ x: nextX, y: enemyPosition.y, z: nextZ });
  if (distance <= GAME_RULES.enemyAttackRange && isAttackReady(now, nextEnemyAttackAt)) {
    nextEnemyAttackAt = now + GAME_RULES.enemyAttackCooldown;
    playerHealth = applyDamage(playerHealth, GAME_RULES.enemyDamage);
    spawnFloat(`-${GAME_RULES.enemyDamage}`, playerPosition, 'is-player');
    sfx.hurt();
    shake = Math.max(shake, 0.3);
    enemyFighter.group.scale.set(1.06, 1.08, 1.06);
    window.setTimeout(() => enemyFighter?.group.scale.set(1, 1, 1), 120);
    updateHealthHud();
    finishMatch(getMatchOutcome(playerHealth, enemyHealth));
  }
}

function updateCamera(delta) {
  const position = playerBody.translation();
  const target = new THREE.Vector3(position.x, 0, position.z);
  const fit = Math.min(1.9, Math.max(1, 1.45 / camera.aspect));
  const desiredPosition = new THREE.Vector3(position.x + 2.8 * fit, 14 * fit, position.z + 13.6 * fit);
  const smoothing = 1 - Math.exp(-4.6 * delta);
  camera.position.lerp(desiredPosition, smoothing);
  camera.lookAt(target);
}

function renderFrame(time) {
  requestAnimationFrame(renderFrame);
  const now = time * 0.001;
  const delta = Math.min((time - priorFrameTime) * 0.001 || 0, 0.05);
  priorFrameTime = time;

  if (matchOutcome === 'playing') {
    if (matchStarted) {
      updatePlayer(delta, now);
      updateEnemy(now, delta);
    }
    attemptDash(now);
    attemptPlayerAttack(now);
    const remaining = Math.max(0, nextPlayerAttackAt - now);
    dashButton.style.setProperty('--cd', `${(Math.max(0, nextDashAt - now) / GAME_RULES.dashCooldown) * 360}deg`);
    attackButton.style.setProperty('--cd', `${(remaining / GAME_RULES.playerAttackCooldown) * 360}deg`);

    accumulator += delta;
    while (accumulator >= FIXED_STEP) {
      world.step();
      accumulator -= FIXED_STEP;
    }

    const playerPosition = playerBody.translation();
    const enemyPosition = enemyBody.translation();
    const playerVelocity = playerBody.linvel();
    const playerBob = Math.hypot(playerVelocity.x, playerVelocity.z) > 0.6 ? Math.abs(Math.sin(now * 13)) * 0.09 : 0;
    const enemyMoved = Math.hypot(enemyPosition.x - lastEnemyPos.x, enemyPosition.z - lastEnemyPos.z) > 0.002;
    const enemyBob = enemyMoved ? Math.abs(Math.sin(now * 11)) * 0.08 : 0;
    lastEnemyPos = { x: enemyPosition.x, z: enemyPosition.z };
    playerFighter.group.position.set(playerPosition.x, playerPosition.y - 0.82 + playerBob, playerPosition.z);
    enemyFighter.group.position.set(enemyPosition.x, enemyPosition.y - 0.82 + enemyBob, enemyPosition.z);
    enemyFighter.group.rotation.y = Math.atan2(-(playerPosition.x - enemyPosition.x), -(playerPosition.z - enemyPosition.z));
    if (attackRing) {
      attackRing.position.set(playerPosition.x, 0.05, playerPosition.z);
      ringLife = Math.max(0, ringLife - delta * 5);
      attackRing.material.opacity = ringLife * 0.7;
      attackRing.visible = ringLife > 0;
    }
    updateCamera(delta);
    ui.matchStatus.textContent = matchStarted ? 'FIGHT' : 'READY';
  }

  multiplayer?.view.update(delta);

  const shakeOffset = new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0);
  shake = Math.max(0, shake - delta * 1.4);
  camera.position.add(shakeOffset);
  renderer.render(scene, camera);
  camera.position.sub(shakeOffset);
}

function restartMatch() {
  playerHealth = GAME_RULES.maxHealth;
  enemyHealth = GAME_RULES.maxHealth;
  nextPlayerAttackAt = 0;
  nextEnemyAttackAt = 0;
  nextDashAt = 0;
  dashUntil = 0;
  dashQueued = false;
  matchOutcome = 'playing';
  matchStarted = false;
  attackQueued = false;
  facing = { x: 0, z: -1 };
  playerBody.setTranslation({ x: 0, y: 0.82, z: 5.2 }, true);
  playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  playerBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  enemyBody.setTranslation({ x: 0, y: 0.82, z: -5.2 }, true);
  enemyBody.setNextKinematicTranslation({ x: 0, y: 0.82, z: -5.2 });
  playerFighter.group.rotation.set(0, 0, 0);
  enemyFighter.group.rotation.set(0, Math.PI, 0);
  ui.overlay.hidden = true;
  ui.matchStatus.textContent = 'READY';
  updateHealthHud();
}

function setupJoystick() {
  const zone = document.querySelector('#joy-zone');
  const base = document.querySelector('#joy-base');
  const knob = document.querySelector('#joy-knob');
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

function setupInput() {
  setupInputMode();
  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    heldKeys.add(event.code);
    if (event.code === 'Space' && !event.repeat) attackQueued = true;
    if (event.code === 'KeyR' && !event.repeat) restartMatch();
    if ((event.code === 'ShiftLeft' || event.code === 'ShiftRight') && !event.repeat) dashQueued = true;
    if (event.code === 'KeyM' && !event.repeat) toggleMute();
  });

  window.addEventListener('keyup', (event) => heldKeys.delete(event.code));
  window.addEventListener('blur', () => {
    heldKeys.clear();
    joystick.x = 0;
    joystick.z = 0;
  });

  setupJoystick();
  attackButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    attackQueued = true;
    navigator.vibrate?.(12);
  });
  document.querySelectorAll('.controls').forEach((el) => el.addEventListener('contextmenu', (e) => e.preventDefault()));
  dashButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    dashQueued = true;
  });
  muteButton.addEventListener('click', toggleMute);
  document.querySelector('#restart-button').addEventListener('click', restartMatch);
  document.querySelector('#play-again-button').addEventListener('click', restartMatch);

  window.addEventListener('resize', () => {
    const size = root.getBoundingClientRect();
    if (size.width === 0 || size.height === 0) return;
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    renderer.setSize(size.width, size.height);
  });
}

async function startGame() {
  let stage = 'webgl-check';
  try {
    if (!hasWebGL2()) {
      showStartupError('Browser ini tidak menyediakan WebGL 2. Aktifkan akselerasi perangkat keras di pengaturan browser, lalu muat ulang.');
      return;
    }
    stage = 'physics-init';
    await RAPIER.init({});
    stage = 'physics-world';
    createWorld();
    stage = 'scene';
    createScene();
    stage = 'physics-setup';
    setupPhysics();
    stage = 'input';
    setupInput();
    updateHealthHud();
    startMultiplayer({ scene, search: window.location.search })
      .then((session) => {
        multiplayer = session;
      })
      .catch((error) => console.warn('[multiplayer]', error));
    requestAnimationFrame(renderFrame);
  } catch (error) {
    console.error(`[startup:${stage}]`, error);
    showStartupError('Terjadi kesalahan saat memulai. Kirim detail di bawah ini ke pengembang.', `${stage}: ${error?.message ?? error}`);
  }
}

startGame();