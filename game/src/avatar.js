import * as THREE from 'three';
import { CHARACTERS, HAIR_COLORS, OUTFITS, SKINS, sanitizeConfig } from './avatar-config.js';
import { HumanRig, loadHumanModel } from './avatar-human.js';
import { auraFor } from './avatar-aura.js';
import { buildBody, PANTS_SHADE } from './avatar-body.js';

export function makeLabel(text) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 8, 256, 48);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 128, 42);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
  sprite.scale.set(1.0, 0.25, 1);
  sprite.position.y = 2.0;
  return sprite;
}

/** Avatar sederhana berbentuk manusia lengkap (kepala+wajah, badan, tangan, kaki; lihat avatar-body.js), menghadap -z, nama opsional. */
export function createAvatar({ color = 0x70c7a2, skin = 0xf1e3d3, name = null, config = null } = {}) {
  const cfg = config ? sanitizeConfig(config) : null;
  if (cfg) {
    color = OUTFITS[cfg.o].hex;
    skin = SKINS[cfg.s].hex;
  }
  const group = new THREE.Group();
  const rig = buildBody({ color, skin });
  group.add(rig.root);
  Object.assign(group.userData, {
    arms: rig.arms, legs: rig.legs, elbows: rig.elbows, tint: rig.tint, skin: rig.skin, pants: rig.pants, body: rig.torso, face: rig.face,
  });
  // Semua bagian tubuh masuk ke satu pivot supaya bisa berputar (gestur 'spin') tanpa mengganggu arah hadap grup.
  const spinPivot = new THREE.Group();
  for (const child of [...group.children]) spinPivot.add(child);
  group.add(spinPivot);
  group.userData.pivot = spinPivot;
  group.userData.parts = [...spinPivot.children]; // bagian avatar sederhana (disembunyikan saat memakai model manusia)
  if (cfg) setAvatarConfig(group, cfg);
  if (name) {
    const label = makeLabel(name);
    if (label) {
      group.add(label);
      group.userData.label = label;
    }
  }
  return group;
}

/** Ganti warna pakaian avatar (baju dan celana) tanpa membuat ulang model. */
export function setAvatarColor(group, color) {
  for (const m of group.userData?.tint ?? []) m.color.set(color);
  group.userData?.pants?.color.set(color).multiplyScalar(PANTS_SHADE);
}

/** Warna konsisten per id pemain: semua perangkat menghitung warna yang sama dari id yang sama. */
export function colorForId(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.55, 0.58).getHex();
}

/** Gelembung obrolan (sprite) di atas kepala avatar. Teks dipotong dan dibungkus maksimal 3 baris. */
export function makeBubble(text) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = '600 30px sans-serif';
  const lines = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > 440 && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 3);
  if (lines.length > 3) shown[2] = `${shown[2].slice(0, 28)}…`;
  const height = 28 + shown.length * 38;
  const top = 160 - height - 14;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(24, top, 464, height, 22);
    ctx.fill();
  } else {
    ctx.fillRect(24, top, 464, height); // browser lama tanpa roundRect
  }
  ctx.fillStyle = '#1b1620';
  ctx.textAlign = 'center';
  shown.forEach((l, i) => ctx.fillText(l, 256, top + 46 + i * 38));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
  sprite.scale.set(3.2, 1, 1);
  sprite.position.y = 2.95;
  sprite.renderOrder = 10;
  return sprite;
}


const lerp = (a, b, k) => a + (b - a) * k;

/**
 * Pose berdasarkan aksi. act: null | 'handshake' | 'wave' | 'highfive' | 'bow' | 'clap' | 'walk'.
 * t: waktu (detik). Dipanggil tiap frame; halus karena memakai peluruhan eksponensial menuju target.
 */
export function applyPose(group, act, t, delta = 1 / 60) {
  // gestur dari stiker emoji (emoji-sticker-fx.js): berjalan tetap menang, dan tidak dipaksakan saat duduk
  if (act !== 'walk' && group.userData?.forcedAct && !(group.position.y < -0.1)) act = group.userData.forcedAct;
  const spinPivot = group.userData?.pivot;
  if (spinPivot) spinPivot.rotation.y = act === 'spin' ? (t * Math.PI * 2 * 1.25) % (Math.PI * 2) : 0; // putar satu kali tiap ~0,8 detik
  animateAura(group, t);
  const human = group.userData?.human;
  if (human) {
    human.update(act, t, delta, group.position.y < -0.1); // y turun = duduk di kursi
    return;
  }
  const arms = group.userData?.arms;
  if (!arms) return;
  const k = 1 - Math.exp(-14 * Math.max(0, delta));
  const legs = group.userData?.legs;
  if (legs) {
    const seated = group.position.y < -0.1; // y turun = duduk di kursi
    const sw = act === 'walk' ? Math.sin(t * 9) * 0.65 : act === 'dance' ? Math.sin(t * 8) * 0.3 : 0;
    for (const [side, dir] of [['l', 1], ['r', -1]]) {
      const hip = seated ? 1.5 : sw * dir;
      legs[side].hip.rotation.x = lerp(legs[side].hip.rotation.x, hip, k);
      legs[side].knee.rotation.x = lerp(legs[side].knee.rotation.x, seated ? -1.5 : -Math.max(0, -hip) * 1.1, k);
    }
  }
  let r = { x: 0, z: -0.08 };
  let l = { x: 0, z: 0.08 };
  let lean = 0;
  if (act === 'handshake') {
    r = { x: 1.35 + Math.sin(t * 9) * 0.12, z: -0.12 }; // tangan kanan terulur, naik-turun kecil
    lean = 0.06;
  } else if (act === 'highfive') {
    r = { x: 2.7, z: -0.1 };
  } else if (act === 'wave') {
    r = { x: 2.9, z: -0.45 + Math.sin(t * 12) * 0.35 };
  } else if (act === 'spin') {
    r = { x: 1.5, z: -0.7 };
    l = { x: 1.5, z: 0.7 };
  } else if (act === 'bow') {
    lean = 0.55;
  } else if (act === 'clap') {
    const c = Math.abs(Math.sin(t * 14));
    r = { x: 1.2, z: -0.35 + c * 0.3 };
    l = { x: 1.2, z: 0.35 - c * 0.3 };
  } else if (act === 'dance') {
    const s = Math.sin(t * 8);
    r = { x: 2.6 + s * 0.3, z: -0.4 + s * 0.3 };
    l = { x: 2.6 - s * 0.3, z: 0.4 - s * 0.3 };
    lean = s * 0.12;
  } else if (act === 'walk') {
    const sw = Math.sin(t * 9) * 0.7;
    r = { x: -sw, z: -0.08 };
    l = { x: sw, z: 0.08 };
  }
  arms.r.rotation.x = lerp(arms.r.rotation.x, r.x, k);
  arms.r.rotation.z = lerp(arms.r.rotation.z, r.z, k);
  arms.l.rotation.x = lerp(arms.l.rotation.x, l.x, k);
  arms.l.rotation.z = lerp(arms.l.rotation.z, l.z, k);
  group.userData.leanTarget = lean;
  group.userData.leanNow = lerp(group.userData.leanNow ?? 0, lean, k);
  group.rotation.x = group.userData.leanNow;
}

/** Cincin emas di kaki avatar penanda pembicara di panggung Party Room. */
export function setStageRing(group, on) {
  let ring = group.userData.stageRing;
  if (!ring && on) {
    ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 40),
      new THREE.MeshBasicMaterial({ color: 0xf3d58a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);
    group.userData.stageRing = ring;
  }
  if (ring) ring.visible = on;
}

function buildGear(cfg) {
  const gear = new THREE.Group();
  const hairColor = HAIR_COLORS[cfg.k].hex;
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  const add = (geometry, material, x, y, z, rx = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.castShadow = true;
    gear.add(mesh);
    return mesh;
  };
  const covered = cfg.a === 3 || cfg.a === 4; // kerudung/blangkon menutup rambut
  if (cfg.h > 0 && !covered) {
    const hair = mat(hairColor);
    add(new THREE.SphereGeometry(0.325, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), hair, 0, 1.4, 0.035);
    if (cfg.h === 2) add(new THREE.BoxGeometry(0.52, 0.1, 0.12), hair, 0, 1.59, -0.22);
    if (cfg.h === 3) add(new THREE.BoxGeometry(0.54, 0.6, 0.12), hair, 0, 1.12, 0.25);
    if (cfg.h === 4) {
      add(new THREE.SphereGeometry(0.12, 10, 8), hair, 0, 1.36, 0.38);
      add(new THREE.CapsuleGeometry(0.06, 0.28, 4, 8), hair, 0, 1.1, 0.4);
    }
    if (cfg.h === 5) add(new THREE.SphereGeometry(0.16, 12, 10), hair, 0, 1.73, 0.06);
  }
  if (cfg.a === 1) {
    const frame = mat(0x1b1620, { metalness: 0.3 });
    for (const sx of [-0.1, 0.1]) add(new THREE.TorusGeometry(0.075, 0.016, 8, 18), frame, sx, 1.4, -0.285);
    add(new THREE.BoxGeometry(0.1, 0.014, 0.014), frame, 0, 1.41, -0.287);
  } else if (cfg.a === 2) {
    add(new THREE.CylinderGeometry(0.235, 0.27, 0.17, 20), mat(0x15151a), 0, 1.63, 0.01);
  } else if (cfg.a === 3) {
    const cloth = mat(hairColor, { side: THREE.DoubleSide });
    add(new THREE.SphereGeometry(0.35, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.74), cloth, 0, 1.4, 0.035);
    add(new THREE.CylinderGeometry(0.34, 0.5, 0.34, 20, 1, true), cloth, 0, 1.05, 0.04);
  } else if (cfg.a === 4) {
    const batik = mat(0x6b3f1f);
    add(new THREE.SphereGeometry(0.29, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), batik, 0, 1.45, 0.02);
    add(new THREE.SphereGeometry(0.09, 10, 8), batik, 0, 1.47, 0.3);
  } else if (cfg.a === 5) {
    add(new THREE.CylinderGeometry(0.23, 0.19, 0.15, 5), mat(0xd4a84b, { metalness: 0.5, roughness: 0.35 }), 0, 1.7, 0);
  } else if (cfg.a === 6) {
    const hat = mat(hairColor);
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 24), hat, 0, 1.58, 0);
    add(new THREE.CylinderGeometry(0.25, 0.27, 0.2, 20), hat, 0, 1.69, 0);
  }
  return gear;
}

function disposeGear(gear) {
  gear.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
}

/** Terapkan konfigurasi pemain (warna pakaian, kulit, rambut, aksesori) ke avatar yang sudah ada. */
export function setAvatarConfig(group, rawConfig) {
  const cfg = sanitizeConfig(rawConfig);
  setAvatarColor(group, OUTFITS[cfg.o].hex);
  group.userData.skin?.color.set(SKINS[cfg.s].hex);
  if (group.userData.gear) {
    group.userData.gear.parent?.remove(group.userData.gear);
    disposeGear(group.userData.gear);
  }
  group.userData.gear = buildGear(cfg);
  group.userData.gear.visible = !CHARACTERS[cfg.m]?.id;
  (group.userData.pivot ?? group).add(group.userData.gear);
  group.userData.config = cfg;
  applyHuman(group, cfg);
}

/** Pasang/lepas model manusia sesuai pilihan karakter. Pemuatan asinkron; avatar sederhana tampil sementara. */
function applyHuman(group, cfg) {
  const id = CHARACTERS[cfg.m]?.id ?? null;
  if (group.userData.humanId === id) return;
  group.userData.humanId = id;
  const old = group.userData.human;
  if (old) {
    old.root.parent?.remove(old.root);
    old.dispose();
    group.userData.human = null;
  }
  const showSimple = (on) => {
    for (const part of group.userData.parts ?? []) part.visible = on;
    if (group.userData.gear) group.userData.gear.visible = on;
  };
  if (!id) {
    showSimple(true);
    return;
  }
  loadHumanModel(id)
    .then((model) => {
      if (group.userData.humanId !== id) return; // sudah ganti pilihan
      const rig = new HumanRig(model);
      (group.userData.pivot ?? group).add(rig.root);
      group.userData.human = rig;
      showSimple(false);
    })
    .catch((error) => console.warn('[avatar] model manusia gagal dimuat, memakai avatar sederhana', error));
}

// ---- Aura: cincin + percikan yang mengorbit; warna dari bagian hari dan nama (lihat avatar-aura.js) ----
let aurasVisible = true;
/** Tampilkan/sembunyikan semua aura (preferensi lokal, juga menghemat tenaga di HP lemah). */
export function setAurasVisible(on) {
  aurasVisible = Boolean(on);
}

/** Pasang aura ke avatar. `spec` dari auraFor(); null melepas aura. */
export function setAvatarAura(group, spec) {
  const old = group.userData.aura;
  if (old) {
    group.remove(old.group);
    old.ring.geometry.dispose(); old.ring.material.dispose();
    old.points.geometry.dispose(); old.points.material.dispose();
    group.userData.aura = null;
  }
  if (!spec) return;
  const color = new THREE.Color().setHSL(spec.hue / 360, spec.sat, spec.light);
  const holder = new THREE.Group();
  holder.position.y = 0.03;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.74, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  const count = Math.max(1, Math.min(24, spec.sparks));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 0.15, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  points.frustumCulled = false;
  holder.add(ring, points);
  group.add(holder);
  group.userData.aura = { group: holder, ring, points, count, speed: spec.speed, phase: spec.phase };
}

export function auraSpecFor(name, part) {
  return auraFor({ name, part });
}

function animateAura(group, t) {
  const aura = group.userData?.aura;
  if (!aura) return;
  aura.group.visible = aurasVisible;
  if (!aurasVisible) return;
  const pos = aura.points.geometry.attributes.position;
  for (let i = 0; i < aura.count; i += 1) {
    const angle = aura.phase + t * aura.speed * 1.2 + (i * Math.PI * 2) / aura.count;
    const radius = 0.66 + 0.08 * Math.sin(t * 1.7 + i);
    const rise = (t * aura.speed * 0.35 + i / aura.count) % 1; // naik pelan lalu muncul lagi di bawah
    pos.setXYZ(i, Math.cos(angle) * radius, 0.1 + rise * 1.75, Math.sin(angle) * radius);
  }
  pos.needsUpdate = true;
  aura.ring.material.opacity = 0.38 + 0.18 * Math.sin(t * 2 + aura.phase);
}
