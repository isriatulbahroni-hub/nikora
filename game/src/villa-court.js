// Mesh lapangan bulu tangkis + kok + raket untuk dunia villa (three.js). Letak/aturan ada di activities/.
import * as THREE from 'three';
import { COURT, PHYSICS } from './activities/badminton.js';
import { VILLA_COURT, createCourtFrame } from './activities/court-frame.js';

const PPM = 60; // piksel tekstur per meter
const SURROUND = 1.0; // pinggiran lapangan di luar garis (m)

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
}

/** Tekstur lantai: garis resmi (ganda + tunggal, servis pendek, servis panjang ganda, garis tengah). */
function courtTexture() {
  const w = COURT.width + SURROUND * 2;
  const l = COURT.length + SURROUND * 2;
  const c = canvas(w * PPM, l * PPM);
  const g = c.getContext('2d');
  g.fillStyle = '#496f55';
  g.fillRect(0, 0, c.width, c.height);
  const px = (x) => (x + w / 2) * PPM;
  const py = (z) => (z + l / 2) * PPM;
  const hw = COURT.width / 2;
  const hl = COURT.length / 2;
  g.fillStyle = '#2f6b4a';
  g.fillRect(px(-hw), py(-hl), COURT.width * PPM, COURT.length * PPM);
  g.strokeStyle = '#f4f1e6';
  g.lineWidth = 3;
  const line = (x1, z1, x2, z2) => { g.beginPath(); g.moveTo(px(x1), py(z1)); g.lineTo(px(x2), py(z2)); g.stroke(); };
  g.strokeRect(px(-hw), py(-hl), COURT.width * PPM, COURT.length * PPM);
  const sw = COURT.singlesWidth / 2;
  line(-sw, -hl, -sw, hl);
  line(sw, -hl, sw, hl);
  for (const z of [-1.98, 1.98]) line(-hw, z, hw, z); // garis servis pendek
  for (const z of [-(hl - 0.76), hl - 0.76]) line(-hw, z, hw, z); // garis servis panjang (ganda)
  line(0, -hl, 0, -1.98);
  line(0, 1.98, 0, hl); // garis tengah
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, width: w, length: l };
}

function netTexture() {
  const c = canvas(256, 64);
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(245,245,240,0.95)';
  g.lineWidth = 2;
  for (let x = 0; x <= 256; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); }
  for (let y = 0; y <= 64; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Membangun lapangan (lantai bergaris, tiang, net) dan menaruhnya di `parent`. Mengembalikan { group, frame }. */
export function buildBadmintonCourt(parent, placement = VILLA_COURT) {
  const frame = createCourtFrame(placement);
  const group = new THREE.Group();
  group.name = 'badminton-court';
  group.position.set(frame.center.x, 0, frame.center.z);
  group.rotation.y = frame.rotationY; // local z -> dunia +x (lihat court-frame.js)

  const { tex, width, length } = courtTexture();
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(width, length), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.022;
  pad.receiveShadow = true;
  group.add(pad);

  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.4 });
  const postGeo = new THREE.CylinderGeometry(0.03, 0.035, 1.55, 10);
  const netHalf = COURT.width / 2 + 0.15;
  for (const sx of [-netHalf, netHalf]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(sx, 0.775, 0);
    post.castShadow = true;
    group.add(post);
  }
  const netHeight = 0.76;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(netHalf * 2, netHeight),
    new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, roughness: 1 }),
  );
  mesh.position.set(0, COURT.netHeight - netHeight / 2, 0);
  mesh.castShadow = true;
  group.add(mesh);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(netHalf * 2, 0.07, 0.025), new THREE.MeshStandardMaterial({ color: 0xfafaf5, roughness: 0.7 }));
  tape.position.set(0, COURT.netHeight - 0.035, 0);
  group.add(tape);

  parent.add(group);
  return { group, frame };
}

/**
 * Kok bulu tangkis: gabus di ujung runcing, bulu mengembang ke belakang. Diperbesar `scale` kali
 * supaya terlihat dari kamera orang ketiga (ukuran asli hanya ±6,5 cm).
 */
export function createShuttleMesh({ scale = 2.5 } = {}) {
  const group = new THREE.Group();
  const cork = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe9d8b4, roughness: 0.6 }));
  cork.position.y = 0.03;
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.062, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xfdfdf8, roughness: 0.8, side: THREE.DoubleSide }));
  skirt.position.y = 0;
  group.add(skirt, cork);
  group.scale.setScalar(scale);
  group.castShadow = true;
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}

/** Raket: pegangan, tangkai, dan kepala oval. Pangkal pegangan = titik genggam (asal grup); raket menjulur ke +y. */
export function createRacketMesh() {
  const group = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.5, metalness: 0.3 });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xc23b3b, roughness: 0.8 }));
  grip.position.y = 0.1;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 6), frame);
  shaft.position.y = 0.32;
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 20), frame);
  head.scale.set(0.8, 1, 1);
  head.position.y = 0.55;
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
  strings.scale.set(0.8, 1, 1);
  strings.position.y = 0.55;
  group.add(grip, shaft, head, strings);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}

const UP = new THREE.Vector3(0, 1, 0);
const dir = new THREE.Vector3();

/** Arahkan kok: gabus (ujung runcing, +y lokal) menghadap arah terbang; saat diam tegak berdiri. */
export function orientShuttle(mesh, velocity) {
  dir.set(velocity.x, velocity.y, velocity.z);
  if (dir.lengthSq() < 1e-6) { mesh.quaternion.identity(); return; }
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
}

/** Tempatkan kok di dunia dari keadaan lokal rally (pos lokal -> dunia via frame). */
export function placeShuttle(mesh, frame, shuttle) {
  const p = frame.toWorld(shuttle.pos);
  mesh.position.set(p.x, p.y, p.z);
  const v = frame.toWorld({ x: shuttle.vel.x, y: shuttle.vel.y, z: shuttle.vel.z });
  // kecepatan adalah vektor, bukan titik: buang offset pusat saat memutar
  orientShuttle(mesh, { x: v.x - frame.center.x, y: v.y, z: v.z - frame.center.z });
}

export const SHUTTLE_REACH = PHYSICS.reach;
