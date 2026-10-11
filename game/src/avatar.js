import * as THREE from 'three';

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
  sprite.scale.set(2, 0.5, 1);
  sprite.position.y = 2.05;
  return sprite;
}

/** Avatar sederhana: badan, kepala, wajah, penanda arah hadap (-z), dan nama opsional. */
export function createAvatar({ color = 0x70c7a2, skin = 0xf1e3d3, name = null } = {}) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 5, 12), bodyMaterial);
  body.position.y = 0.75;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 }));
  head.position.y = 1.37;
  head.castShadow = true;
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.12), new THREE.MeshStandardMaterial({ color: 0x26332d, roughness: 0.74 }));
  face.position.set(0, 1.39, -0.255);
  const markerMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 4), markerMaterial);
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(0, 0.83, -0.48);
  group.add(body, head, face, marker);
  // Lengan: pivot di bahu, lengan menggantung ke bawah (-y); rotation.x = +90° mengarahkannya ke depan (-z).
  const armMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const arms = {};
  for (const [side, sx] of [['l', -0.42], ['r', 0.42]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, 1.08, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.46, 4, 8), armMaterial);
    arm.position.y = -0.3;
    arm.castShadow = true;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 }));
    hand.position.y = -0.6;
    pivot.add(arm, hand);
    group.add(pivot);
    arms[side] = pivot;
  }
  group.userData.arms = arms;
  group.userData.tint = [bodyMaterial, markerMaterial, armMaterial];
  group.userData.body = body;
  if (name) {
    const label = makeLabel(name);
    if (label) {
      group.add(label);
      group.userData.label = label;
    }
  }
  return group;
}

/** Ganti warna badan avatar (badan, penanda arah, lengan) tanpa membuat ulang model. */
export function setAvatarColor(group, color) {
  for (const m of group.userData?.tint ?? []) m.color.set(color);
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
  const arms = group.userData?.arms;
  if (!arms) return;
  const k = 1 - Math.exp(-14 * Math.max(0, delta));
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
  } else if (act === 'bow') {
    lean = 0.55;
  } else if (act === 'clap') {
    const c = Math.abs(Math.sin(t * 14));
    r = { x: 1.2, z: -0.35 + c * 0.3 };
    l = { x: 1.2, z: 0.35 - c * 0.3 };
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
