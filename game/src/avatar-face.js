// Foto wajah -> avatar. Semua diproses di perangkat (tanpa server); hanya thumbnail kecil yang boleh dikirim ke pemain lain.
// Bagian murni (tanpa DOM): sampleSkin, nearestSkinIndex, applyStyle. Bagian DOM: faceCanvasFromImage, thumbnailDataUrl.
import * as THREE from 'three';
import { SKINS } from './avatar-config.js';

export const FACE_STYLES = ['asli', 'royal', 'kartun'];

const median = (arr) => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(a.length / 2)] ?? 0; };

/** Warna kulit dari piksel RGBA gambar wajah yang sudah dipotong: dahi dan kedua pipi, median supaya tahan bayangan/bibir. */
export function sampleSkin(data, width, height) {
  const boxes = [[0.4, 0.2, 0.6, 0.3], [0.22, 0.5, 0.38, 0.65], [0.62, 0.5, 0.78, 0.65]];
  const rs = []; const gs = []; const bs = [];
  for (const [x0, y0, x1, y1] of boxes) {
    for (let y = Math.floor(y0 * height); y < Math.ceil(y1 * height); y += 1) {
      for (let x = Math.floor(x0 * width); x < Math.ceil(x1 * width); x += 1) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 128) continue; // abaikan piksel transparan (di luar oval)
        rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
      }
    }
  }
  return { r: median(rs), g: median(gs), b: median(bs) };
}

/** Indeks SKINS terdekat dengan warna rgb. */
export function nearestSkinIndex({ r, g, b }, skins = SKINS) {
  let best = 0; let bestD = Infinity;
  skins.forEach((s, i) => {
    const dr = r - ((s.hex >> 16) & 255); const dg = g - ((s.hex >> 8) & 255); const db = b - (s.hex & 255);
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db; // bobot kasar mendekati persepsi mata
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

/** Filter gaya, di tempat pada Uint8ClampedArray RGBA. 'asli' tidak mengubah apa pun. */
export function applyStyle(data, style) {
  if (style !== 'royal' && style !== 'kartun') return data;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]; let g = data[i + 1]; let b = data[i + 2];
    if (style === 'royal') { // cahaya studio hangat + kontras lembut
      r = (r - 128) * 1.1 + 128 + 10; g = (g - 128) * 1.1 + 128 + 2; b = (b - 128) * 1.1 + 128 - 14;
    } else { // kartun: warna lebih jenuh lalu dikurangi jumlah tingkatnya
      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      r = l + (r - l) * 1.35; g = l + (g - l) * 1.35; b = l + (b - l) * 1.35;
      const q = (v) => Math.round(Math.min(255, Math.max(0, v)) / 51) * 51;
      r = q(r); g = q(g); b = q(b);
    }
    data[i] = r; data[i + 1] = g; data[i + 2] = b; // Uint8ClampedArray membatasi 0..255
  }
  return data;
}

/** Kotak potong persegi pada gambar w x h. zoom >= 1, offset -1..1 (geser). Murni, bisa diuji tanpa DOM. */
export function cropSquare(w, h, { zoom = 1, offsetX = 0, offsetY = 0 } = {}) {
  const side = Math.min(w, h) / Math.max(1, zoom);
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  return { side, sx: (w - side) / 2 + clamp(offsetX) * ((w - side) / 2), sy: (h - side) / 2 + clamp(offsetY) * ((h - side) / 2) };
}

/** DOM: gambar/File -> canvas wajah persegi dengan tepi lingkaran lembut. zoom >= 1, offset -1..1 (geser). */
export async function faceCanvasFromImage(source, { size = 256, zoom = 1, offsetX = 0, offsetY = 0, style = 'asli' } = {}) {
  const bmp = source instanceof Blob ? await createImageBitmap(source) : source;
  const { side, sx, sy } = cropSquare(bmp.width, bmp.height, { zoom, offsetX, offsetY });
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  applyStyle(img.data, style);
  ctx.putImageData(img, 0, 0);
  ctx.globalCompositeOperation = 'destination-in'; // lingkaran dengan tepi lembut (sama dengan lingkaran di layar potong)
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.4, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/** Warna kulit dari canvas hasil faceCanvasFromImage -> indeks SKINS. */
export function skinIndexFromCanvas(canvas) {
  const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  return nearestSkinIndex(sampleSkin(img.data, img.width, img.height));
}

/** Thumbnail kecil untuk dikirim ke pemain lain (bukan foto asli). */
export function thumbnailDataUrl(canvas, size = 96) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  c.getContext('2d').drawImage(canvas, 0, 0, size, size);
  return c.toDataURL('image/webp', 0.7);
}

const GLASSES_SHIFT = 0.045; // kacamata dimajukan supaya tidak tertutup foto

/** Kacamata dari buildGear(): dua cincin (Torus r=0.075) dan jembatan (Box 0.1 x 0.014). Dikenali dari bentuknya. */
function isGlasses(o) {
  const t = o.geometry?.type; const p = o.geometry?.parameters;
  return (t === 'TorusGeometry' && p?.radius === 0.075) || (t === 'BoxGeometry' && p?.width === 0.1 && p?.height === 0.014);
}

function shiftGlasses(group, forward) {
  group.userData.gear?.traverse((o) => {
    if (!isGlasses(o)) return;
    o.userData.z0 ??= o.position.z;
    o.position.z = forward ? o.userData.z0 - GLASSES_SHIFT : o.userData.z0;
  });
}

/** Tempel foto (canvas/gambar) sebagai wajah di depan kepala; null melepasnya dan memunculkan mata/hidung/mulut lagi.
 *  Panggil ulang setelah setAvatarConfig (rambut/aksesori dibangun ulang) supaya kacamata tetap di depan foto. */
export function applyFacePhoto(group, source) {
  const ud = group.userData;
  if (ud.faceDecal) {
    ud.faceDecal.parent?.remove(ud.faceDecal);
    ud.faceDecal.geometry.dispose(); ud.faceDecal.material.map?.dispose(); ud.faceDecal.material.dispose();
    ud.faceDecal = null;
  }
  const features = ud.face;
  if (!features) return null; // model manusia (Michelle) tidak punya wajah yang bisa diganti
  shiftGlasses(group, Boolean(source));
  if (!source) { features.visible = true; return null; }
  const map = new THREE.CanvasTexture(source);
  map.colorSpace = THREE.SRGBColorSpace;
  // Tambalan bola (r=0.318) di depan kepala (-z), sedikit di depan cangkang rambut (r=0.325, bergeser ke belakang),
  // dari dahi sampai dagu. u=0 di kiri penonton sehingga foto tidak terbalik.
  const geometry = new THREE.SphereGeometry(0.318, 32, 24, (3 * Math.PI) / 2 - 0.7, 1.4, 1.0, 1.4);
  const material = new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const decal = new THREE.Mesh(geometry, material);
  decal.position.set(0, 1.37, 0);
  features.parent.add(decal);
  features.visible = false;
  ud.faceDecal = decal;
  return decal;
}
