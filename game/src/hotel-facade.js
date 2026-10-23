import * as THREE from 'three';
import { facadeLayout, facadeRepeat, facadeSides } from './hotel-facade-data.js';

// Fasad kaca menara (lantai PODIUM sampai atas, di bawah mahkota). Satu tekstur "bay" bermipmap yang diulang, bukan ribuan tiang tipis:
// tiang emas 0,28 m dan pelat tepi 0,24 m lebih kecil dari satu piksel dari jauh, sehingga dulu berkedip, bergelombang (moire), dan
// kadang hilang. Dengan mipmap + anisotropic filtering, jarak jauh merata-ratakan kaca biru dan emas jadi warna yang sama dan stabil,
// sementara dari dekat garis tiang tetap tajam. Sisi depan bidang menghadap keluar, jadi dari dalam gedung orang tetap melihat ke luar.
const SRGB = THREE.SRGBColorSpace;
const GOLD = '#c9a24b';
const GOLD_HI = '#e8cf86';

function paintBay(layout) {
  const { size, finPx, edgePx, paneW, paneH } = layout;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  // kaca: biru tua ke biru kehijauan, sedikit tembus (alfa 0,9) supaya lantai di baliknya samar terlihat
  const glass = g.createLinearGradient(finPx, 0, size, paneH);
  glass.addColorStop(0, 'rgba(22,46,70,0.9)');
  glass.addColorStop(0.55, 'rgba(44,98,128,0.9)');
  glass.addColorStop(1, 'rgba(18,38,60,0.9)');
  g.fillStyle = glass;
  g.fillRect(finPx, 0, paneW, paneH);
  // kilau miring lembut di kaca
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.beginPath();
  g.moveTo(finPx + paneW * 0.2, 0);
  g.lineTo(finPx + paneW * 0.45, 0);
  g.lineTo(finPx + paneW * 0.1, paneH);
  g.lineTo(finPx, paneH);
  g.lineTo(finPx, paneH * 0.6);
  g.closePath();
  g.fill();
  // tiang emas di kiri (dengan garis terang tipis di tepinya), dan pelat tepi emas di bawah
  g.fillStyle = GOLD;
  g.fillRect(0, 0, finPx, size);
  g.fillRect(0, paneH, size, edgePx);
  g.fillStyle = GOLD_HI;
  g.fillRect(Math.floor(finPx * 0.35), 0, Math.max(2, Math.floor(finPx * 0.2)), paneH);
  g.fillRect(finPx, paneH, paneW, Math.max(2, Math.floor(edgePx * 0.25)));
  return c;
}

export function bayTexture(layout, anisotropy, u, v) {
  const t = new THREE.CanvasTexture(paintBay(layout));
  t.colorSpace = SRGB;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = anisotropy; // THREE menjepit ke batas perangkat
  t.repeat.set(u, v);
  return t;
}

/**
 * Menggambar empat sisi fasad dari ketinggian y0 setinggi `height`. B = [minX, minZ, maxX, maxZ] cangkang menara.
 * Mengembalikan grup (sudah ditambahkan ke parent) dan dispose().
 */
export function buildFacade(parent, { B, y0, height, levelHeight, bayWidth = 6, finWidth = 0.28, edgeHeight = 0.24, anisotropy = 8 }) {
  const group = new THREE.Group();
  group.name = 'hotel-facade';
  const layout = facadeLayout({ bayWidth, levelHeight, finWidth, edgeHeight });
  const textures = [];
  const materials = [];
  const geometries = [];
  for (const side of facadeSides(B)) {
    const { u, v } = facadeRepeat(side.length, height, bayWidth, levelHeight);
    const map = bayTexture(layout, anisotropy, u, v);
    const material = new THREE.MeshStandardMaterial({ map, roughness: 0.32, metalness: 0.12, transparent: true, depthWrite: false });
    const geometry = new THREE.PlaneGeometry(side.length, height);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(side.x, y0 + height / 2, side.z);
    mesh.rotation.y = side.ry;
    mesh.name = `hotel-facade-${side.name}`;
    mesh.renderOrder = 1; // digambar sesudah benda tak tembus (pelat, tiang, mobil), jadi kaca tidak menimpa apa pun yang ada di depannya
    group.add(mesh);
    textures.push(map);
    materials.push(material);
    geometries.push(geometry);
  }
  parent.add(group);
  return {
    group,
    dispose() {
      parent.remove(group);
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
    },
  };
}
