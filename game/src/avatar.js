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
