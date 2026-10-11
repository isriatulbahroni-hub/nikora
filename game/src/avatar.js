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
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 4), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(0, 0.83, -0.48);
  group.add(body, head, face, marker);
  if (name) {
    const label = makeLabel(name);
    if (label) {
      group.add(label);
      group.userData.label = label;
    }
  }
  return group;
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
