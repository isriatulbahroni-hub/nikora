import * as THREE from 'three';
import { PARTICLE_GLYPHS, STICKERS, motionAt } from './emoji-sticker-system.js';

const DURATION_MS = 2400;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const raf = (fn) => requestAnimationFrame(fn);

// ---------- tekstur bersama (dibuat sekali, tidak dibuang per efek) ----------
const glyphTextures = new Map();
function glyphTexture(glyph) {
  if (glyphTextures.has(glyph)) return glyphTextures.get(glyph);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = '48px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, 32, 35);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  glyphTextures.set(glyph, texture);
  return texture;
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(canvas);
  return glowTex;
}

function spriteOf(map, { color = 0xffffff, additive = false } = {}) {
  const material = new THREE.SpriteMaterial({ map, color, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 10;
  return sprite;
}

// ---------- partikel ----------
const PARTICLES = {
  hearts: { n: 8, size: 0.32, life: 1800, stagger: 220, g: 0, spawn: () => [rnd(-0.3, 0.3), 1.6, rnd(-0.3, 0.1)], vel: () => [rnd(-0.25, 0.25), rnd(0.7, 1.2), 0] },
  tears: { n: 10, size: 0.16, life: 1500, stagger: 160, g: -2.2, floor: 0.05, spawn: () => [pick([-0.1, 0.1]), 1.45, -0.27], vel: () => [rnd(-0.05, 0.05), 0, -0.15] },
  confetti: { n: 18, size: 0.22, life: 2000, stagger: 0, g: -3.2, spawn: () => [0, 1.9, 0], vel: () => [rnd(-1.6, 1.6), rnd(1.4, 2.6), rnd(-1.6, 1.6)] },
  petals: { n: 12, size: 0.24, life: 2200, stagger: 150, g: 0, spawn: () => [rnd(-0.8, 0.8), 3.0, rnd(-0.8, 0.8)], vel: () => [rnd(-0.2, 0.2), -0.5, rnd(-0.2, 0.2)] },
  smoke: { n: 8, size: 0.3, life: 1300, stagger: 140, g: 0, spawn: () => [pick([-0.3, 0.3]), 1.5, 0], vel: () => [rnd(-0.1, 0.1), rnd(0.5, 0.9), 0] },
  sparks: { n: 8, size: 0.18, life: 1100, stagger: 0, g: -1, spawn: () => [0, 1.5, 0], vel: () => [rnd(-1, 1), rnd(0.4, 1.2), rnd(-1, 1)] },
};

/** Partikel sprite di dalam `parent` (grup avatar atau scene). update(ms) mengembalikan false saat semua selesai. */
function createParticles(parent, kind, origin = [0, 0, 0], boost = 1) {
  const cfg = PARTICLES[kind];
  const map = glyphTexture(PARTICLE_GLYPHS[kind]);
  if (!cfg || !map) return null;
  const list = [];
  for (let i = 0; i < Math.round(cfg.n * boost); i += 1) {
    const sprite = spriteOf(map);
    const p0 = cfg.spawn().map((v, j) => v + origin[j]);
    const v = cfg.vel();
    sprite.position.set(...p0);
    sprite.scale.setScalar(cfg.size);
    sprite.visible = false;
    parent.add(sprite);
    list.push({ sprite, p0, v, delay: i * cfg.stagger });
  }
  return {
    update(ms) {
      let alive = false;
      for (const p of list) {
        const age = ms - p.delay;
        if (age < 0) {
          alive = true;
          continue;
        }
        const k = age / cfg.life;
        if (k >= 1) {
          p.sprite.visible = false;
          continue;
        }
        alive = true;
        const t = age / 1000;
        p.sprite.visible = true;
        let y = p.p0[1] + p.v[1] * t + 0.5 * cfg.g * t * t;
        if (cfg.floor !== undefined) y = Math.max(cfg.floor, y);
        p.sprite.position.set(p.p0[0] + p.v[0] * t, y, p.p0[2] + p.v[2] * t);
        p.sprite.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      }
      return alive;
    },
    dispose() {
      for (const p of list) {
        p.sprite.parent?.remove(p.sprite);
        p.sprite.material.dispose(); // tekstur dipakai bersama, jangan dibuang
      }
    },
  };
}

// ---------- ekspresi wajah (avatar sederhana; model manusia tidak punya titik wajah yang diketahui) ----------
function heart(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.5, y - s * 0.2, x - s * 0.6, y - s * 1.2, x, y - s * 0.4);
  g.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.5, y - s * 0.2, x, y + s * 0.9);
  g.fill();
}
function drawFace(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#26332d';
  g.fillStyle = '#26332d';
  g.lineWidth = 7;
  const arc = (x, y, r, a, b) => {
    g.beginPath();
    g.arc(x, y, r, a, b);
    g.stroke();
  };
  const line = (x1, y1, x2, y2, color) => {
    if (color) g.strokeStyle = color;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    g.strokeStyle = '#26332d';
  };
  if (kind === 'laugh') {
    arc(40, 58, 13, Math.PI * 1.1, Math.PI * 1.9);
    arc(88, 58, 13, Math.PI * 1.1, Math.PI * 1.9);
    g.beginPath();
    g.moveTo(32, 78);
    g.quadraticCurveTo(64, 122, 96, 78);
    g.closePath();
    g.fill();
    g.fillStyle = '#e8566b';
    g.beginPath();
    g.ellipse(64, 98, 14, 8, 0, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'love') {
    g.fillStyle = 'rgba(255,90,120,0.55)';
    for (const x of [22, 106]) {
      g.beginPath();
      g.arc(x, 80, 13, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ff2d55';
    heart(g, 40, 56, 14);
    heart(g, 88, 56, 14);
    arc(64, 82, 16, Math.PI * 0.15, Math.PI * 0.85);
  } else if (kind === 'cry') {
    arc(40, 56, 13, Math.PI * 0.1, Math.PI * 0.9);
    arc(88, 56, 13, Math.PI * 0.1, Math.PI * 0.9);
    arc(64, 104, 16, Math.PI * 1.15, Math.PI * 1.85);
    line(40, 70, 36, 116, '#4aa8ff');
    line(88, 70, 92, 116, '#4aa8ff');
  } else if (kind === 'angry') {
    g.fillStyle = 'rgba(255,59,48,0.38)';
    for (const x of [24, 104]) {
      g.beginPath();
      g.arc(x, 82, 15, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#26332d';
    g.lineWidth = 9;
    line(22, 36, 54, 54);
    line(106, 36, 74, 54);
    g.lineWidth = 7;
    for (const x of [42, 86]) {
      g.beginPath();
      g.arc(x, 68, 6, 0, Math.PI * 2);
      g.fill();
    }
    arc(64, 104, 14, Math.PI * 1.15, Math.PI * 1.85);
  } else if (kind === 'touched') {
    for (const x of [40, 88]) {
      g.fillStyle = '#26332d';
      g.beginPath();
      g.arc(x, 58, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x - 4, 53, 4.5, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.moveTo(50, 92);
    g.quadraticCurveTo(64, 82, 78, 92);
    g.stroke();
  } else {
    return null;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeFaceOverlay(group, kind) {
  const pivot = group.userData.pivot;
  if (!kind || !pivot || group.userData.human || typeof document === 'undefined') return null;
  const map = drawFace(kind);
  if (!map) return null;
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), material);
  mesh.position.set(0, 1.38, -0.325); // di depan kotak wajah bawaan (depan di -z)
  mesh.rotation.y = Math.PI;
  pivot.add(mesh);
  const original = group.userData.face ?? group.userData.parts?.[2]; // wajah bawaan (mata, hidung, mulut) disembunyikan selama ekspresi
  if (original) original.visible = false;
  return {
    mesh,
    dispose() {
      mesh.parent?.remove(mesh);
      map.dispose();
      material.dispose();
      mesh.geometry.dispose();
      if (original) original.visible = true;
    },
  };
}

// ---------- suara (disintesis, tanpa berkas audio) ----------
let audioCtx = null;
/** Panggil dari sentuhan/klik pengguna supaya browser mengizinkan suara. */
export function unlockAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

const SOUNDS = {
  pop: [[600, 900, 0, 0.08, 'sine', 0.25]],
  laugh: [[520, 500, 0, 0.09, 'triangle', 0.3], [480, 460, 0.12, 0.09, 'triangle', 0.3], [520, 500, 0.24, 0.09, 'triangle', 0.3], [440, 400, 0.36, 0.14, 'triangle', 0.3]],
  horn: [[392, 392, 0, 0.16, 'sawtooth', 0.14], [523, 523, 0.18, 0.28, 'sawtooth', 0.14]],
  coin: [[988, 988, 0, 0.08, 'sine', 0.25], [1319, 1319, 0.09, 0.2, 'sine', 0.25]],
  sob: [[330, 220, 0, 0.6, 'triangle', 0.25]],
  growl: [[110, 80, 0, 0.45, 'sawtooth', 0.16]],
};

export function playStickerSound(kind, volume = 1) {
  const notes = SOUNDS[kind];
  if (!audioCtx || audioCtx.state !== 'running' || !notes || volume <= 0.02) return;
  const base = audioCtx.currentTime;
  for (const [f0, f1, at, dur, type, gain] of notes) {
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, base + at);
    osc.frequency.linearRampToValueAtTime(f1, base + at + dur);
    amp.gain.setValueAtTime(0.0001, base + at);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * volume), base + at + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, base + at + dur);
    osc.connect(amp).connect(audioCtx.destination);
    osc.start(base + at);
    osc.stop(base + at + dur + 0.02);
  }
}

// ---------- efek stiker pada satu avatar ----------
/**
 * Putar efek lengkap: gerak badan, pendaran cahaya, partikel, ekspresi wajah (avatar sederhana), dan suara.
 * `listener` (avatar sendiri) dipakai agar suara dari avatar jauh lebih pelan.
 */
export function playSticker(group, index, { listener = null } = {}) {
  const spec = STICKERS[index];
  if (!group || !spec || typeof requestAnimationFrame !== 'function' || typeof document === 'undefined') return false;
  group.userData.stickerRun?.cancel();
  const pivot = group.userData.pivot;
  const start = performance.now();

  const glow = spriteOf(glowTexture(), { color: spec.color, additive: true });
  glow.position.set(0, 1.0, 0);
  group.add(glow);
  const particles = createParticles(group, spec.particles);
  const face = makeFaceOverlay(group, spec.face);

  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    if (pivot) {
      pivot.position.y = 0;
      pivot.rotation.x = 0;
      pivot.rotation.z = 0;
      pivot.scale.setScalar(1);
    }
    glow.parent?.remove(glow);
    glow.material.dispose();
    particles?.dispose();
    face?.dispose();
    if (group.userData.stickerRun === run) group.userData.stickerRun = null;
  };
  const run = { cancel: done };
  group.userData.stickerRun = run;

  const dist = listener ? listener.position.distanceTo(group.position) : 0;
  playStickerSound(spec.sound, listener && listener !== group ? Math.max(0, 1 - dist / 24) : 1);

  const step = (now) => {
    if (finished) return;
    const ms = now - start;
    const k = ms / DURATION_MS;
    if (k >= 1) {
      done();
      return;
    }
    if (pivot) {
      const m = motionAt(spec.motion, k);
      pivot.position.y = m.y;
      pivot.rotation.x = m.rx;
      pivot.rotation.z = m.rz;
      pivot.scale.setScalar(m.s);
    }
    const env = k < 0.1 ? k / 0.1 : k > 0.75 ? (1 - k) / 0.25 : 1;
    glow.material.opacity = 0.55 * env * (0.8 + 0.2 * Math.sin(k * 40)); // berdenyut seperti lampu
    glow.scale.setScalar(2.4 + 0.3 * Math.sin(k * 30));
    particles?.update(ms);
    if (face) face.mesh.material.opacity = k < 0.05 ? k / 0.05 : k > 0.85 ? (1 - k) / 0.15 : 1;
    raf(step);
  };
  raf(step);
  return true;
}

// ---------- kombo antar-tamu ----------
/**
 * 'fusion': dua hati terbang ke tengah, jadi hati raksasa, lalu meledak jadi kelopak dan konfeti.
 * 'clash': api dan air bertabrakan di tengah, lalu jadi uap. `a` dan `b` posisi dunia kedua avatar.
 */
export function playCombo(kind, scene, a, b) {
  if (!scene || typeof requestAnimationFrame !== 'function' || typeof document === 'undefined') return false;
  const fusion = kind === 'fusion';
  const glyphs = fusion ? ['❤️', '❤️'] : ['🔥', '💧'];
  const maps = glyphs.map((g) => glyphTexture(g));
  if (maps.some((m) => !m)) return false;
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  mid.y += 2.6;
  const from = [a, b].map((p) => new THREE.Vector3(p.x, p.y + 2.6, p.z));
  const sprites = maps.map((m) => spriteOf(m));
  sprites.forEach((s, i) => {
    s.position.copy(from[i]);
    s.scale.setScalar(0.7);
    scene.add(s);
  });
  const burst = [];
  const start = performance.now();
  const FLY = 700;
  const TOTAL = 2600;
  let burstStarted = false;
  let finished = false;
  const done = () => {
    finished = true;
    for (const s of sprites) {
      s.parent?.remove(s);
      s.material.dispose();
    }
    for (const b2 of burst) b2.dispose();
  };
  playStickerSound(fusion ? 'horn' : 'growl', 1);
  const step = (now) => {
    if (finished) return;
    const ms = now - start;
    if (ms >= TOTAL) {
      done();
      return;
    }
    if (ms < FLY) {
      const e = 1 - (1 - ms / FLY) ** 3;
      sprites.forEach((s, i) => s.position.lerpVectors(from[i], mid, e));
    } else {
      if (!burstStarted) {
        burstStarted = true;
        const origin = [mid.x, mid.y, mid.z];
        for (const kindName of fusion ? ['petals', 'confetti'] : ['smoke', 'sparks']) {
          const p = createParticles(scene, kindName, origin, 1.5);
          if (p) burst.push(p);
        }
        if (fusion) sprites[1].visible = false;
      }
      const grow = Math.min(1, (ms - FLY) / 250);
      sprites[0].position.copy(mid);
      sprites[0].scale.setScalar(0.7 + (fusion ? 1.5 : 0.6) * grow);
      sprites[0].material.opacity = Math.max(0, 1 - (ms - FLY - 400) / 600);
      if (!fusion) {
        sprites[1].position.copy(mid);
        sprites[1].material.opacity = sprites[0].material.opacity;
      }
      for (const p of burst) p.update(ms - FLY);
    }
    raf(step);
  };
  raf(step);
  return true;
}
