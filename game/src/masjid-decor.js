// Dekorasi ruangan Masjid Agung NIKORA: marmer krem, panel hijau tua berbingkai emas, lengkung runcing, jendela
// berpemandangan, lampu gantung lentera, tanaman, kursi, dan etalase museum, mengikuti gambar rancangan.
// Benda berulang memakai Batch (satu draw call); hiasan dinding berupa bidang bertekstur kanvas.
import * as THREE from 'three';
import { ROOMS } from './masjid-layout.js';
import { ARABIC, HADITH_TAHFIDZ, WUDHU_MOTTO, wallSlots } from './masjid-interiors-data.js';

const GOLD = '#d8b04a';
const WARM = '#ffe3a6';
const GREEN = '#124b43';
const CREAM = '#efe6d2';
const BOOK_COLORS = ['#7a2f3a', '#2f5f7a', '#3a6b4a', '#b8923f', '#5b3f2a', '#8a8a7a', '#a14a2f'];
const room = (id) => ROOMS.find((r) => r.id === id);

const makeRng = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

// ------------------------------------------------------------------ pelukis tekstur (kanvas)
function paint(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Lengkung runcing sama sisi: lebar w, tinggi h, puncak di y. */
function ogive(g, x, y, w, h) {
  const s = y + 0.866 * w;
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, s);
  g.arc(x + w, s, w, Math.PI, (4 * Math.PI) / 3, false);
  g.arc(x, s, w, (5 * Math.PI) / 3, 2 * Math.PI, false);
  g.lineTo(x + w, y + h);
  g.closePath();
}

function archFrame(g, w, h, scheme = 'green') {
  const cream = scheme === 'cream';
  ogive(g, 4, 4, w - 8, h - 8);
  g.fillStyle = GOLD;
  g.fill();
  ogive(g, 16, 16, w - 32, h - 32);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, cream ? '#f6eccf' : '#0b3a35');
  grad.addColorStop(1, cream ? '#e9dcb8' : '#17695f');
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = cream ? '#1f5f56' : 'rgba(232,200,100,.9)';
  g.lineWidth = 3;
  ogive(g, 28, 28, w - 56, h - 56);
  g.stroke();
}

function lattice(g, w, h, step, color) {
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  for (let y = 0; y < h + step; y += step) {
    for (let x = 0; x < w + step; x += step) {
      g.beginPath();
      g.moveTo(x, y - step / 2);
      g.lineTo(x + step / 2, y);
      g.lineTo(x, y + step / 2);
      g.lineTo(x - step / 2, y);
      g.closePath();
      g.stroke();
    }
  }
}

function star8(g, cx, cy, r1, r2) {
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const r = i % 2 ? r2 : r1;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

function arabicText(g, text, x, y, size, color, maxWidth) {
  g.font = `bold ${size}px Amiri, 'Noto Naskh Arabic', 'Droid Arabic Naskh', 'Traditional Arabic', serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  try {
    g.direction = 'rtl';
  } catch {
    /* abaikan */
  }
  g.fillText(text, x, y, maxWidth);
}

const bannerTex = (lines, scheme = 'green') => paint(256, 768, (g, w, h) => {
  archFrame(g, w, h, scheme);
  g.save();
  ogive(g, 28, 28, w - 56, h - 56);
  g.clip();
  lattice(g, w, h, 34, scheme === 'cream' ? 'rgba(31,95,86,.2)' : 'rgba(232,200,100,.14)');
  g.restore();
  const top = h * 0.3;
  const step = (h * 0.58) / lines.length;
  lines.forEach((t, i) => arabicText(g, t, w / 2, top + step * (i + 0.5), 76, scheme === 'cream' ? '#1f5f56' : '#e8c862', w - 90));
});

const nicheTex = (text) => paint(512, 768, (g, w, h) => {
  archFrame(g, w, h);
  g.save();
  ogive(g, 28, 28, w - 56, h - 56);
  g.clip();
  lattice(g, w, h, 40, 'rgba(232,200,100,.17)');
  g.restore();
  const cx = w / 2;
  const cy = h * 0.56;
  g.strokeStyle = '#e8c862';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(cx, cy, 150, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, 130, 0, Math.PI * 2);
  g.stroke();
  star8(g, cx, cy, 124, 84);
  g.fillStyle = 'rgba(232,200,100,.16)';
  g.fill();
  g.stroke();
  if (text) arabicText(g, text, cx, cy + 6, 120, '#f0d27a', 220);
});

const skyTex = (w, h) => paint(w, h, (g) => {
  archFrame(g, w, h);
  g.save();
  ogive(g, 22, 22, w - 44, h - 44);
  g.clip();
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#5fb0ea');
  sky.addColorStop(1, '#e1f2fc');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const gy = h * 0.8;
  g.fillStyle = '#f4f1e6';
  for (const [mx, mh] of [[w * 0.28, 0.34], [w * 0.74, 0.3]]) {
    g.fillRect(mx - 9, gy - h * mh, 18, h * mh);
    g.beginPath();
    g.moveTo(mx - 12, gy - h * mh);
    g.lineTo(mx, gy - h * mh - 36);
    g.lineTo(mx + 12, gy - h * mh);
    g.fill();
  }
  g.beginPath();
  g.arc(w * 0.5, gy, 46, Math.PI, 0);
  g.fill();
  g.fillStyle = '#5f9a48';
  g.fillRect(0, gy, w, h - gy);
  g.strokeStyle = '#7a5a3a';
  g.lineWidth = 5;
  for (const px of [w * 0.16, w * 0.86]) {
    g.beginPath();
    g.moveTo(px, gy);
    g.lineTo(px + 6, gy - 80);
    g.stroke();
    g.fillStyle = '#3f8a3a';
    for (let a = 0; a < 6; a++) {
      g.beginPath();
      g.ellipse(px + 6 + Math.cos(a) * 18, gy - 84 + Math.sin(a) * 8, 20, 5, a * 0.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  lattice(g, w, h * 0.45, 30, 'rgba(216,176,74,.55)');
  g.restore();
  g.strokeStyle = GOLD;
  g.lineWidth = 5;
  ogive(g, 22, 22, w - 44, h - 44);
  g.stroke();
});

const astroTex = () => paint(512, 640, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0b3a35');
  grad.addColorStop(1, '#17695f');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = GOLD;
  g.lineWidth = 8;
  g.strokeRect(10, 10, w - 20, h - 20);
  g.lineWidth = 2;
  g.strokeRect(26, 26, w - 52, h - 52);
  const rng = makeRng(11);
  g.fillStyle = 'rgba(240,215,130,.8)';
  for (let i = 0; i < 70; i++) {
    g.beginPath();
    g.arc(40 + rng() * (w - 80), 40 + rng() * (h - 80), 1 + rng() * 2, 0, Math.PI * 2);
    g.fill();
  }
  const cx = w / 2;
  const cy = h * 0.5;
  g.strokeStyle = 'rgba(232,200,100,.9)';
  for (let r = 50; r <= 200; r += 30) {
    g.lineWidth = r % 60 === 20 ? 3 : 1.5;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 1.2;
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 50, cy + Math.sin(a) * 50);
    g.lineTo(cx + Math.cos(a) * 200, cy + Math.sin(a) * 200);
    g.stroke();
  }
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(cx, cy, 200, 70, -0.5, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.ellipse(cx, cy, 200, 70, 0.5, 0, Math.PI * 2);
  g.stroke();
});

const mosqueSketchTex = () => paint(640, 420, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#efe4c8');
  grad.addColorStop(1, '#d9c9a2');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#6b5a42';
  g.lineWidth = 2.5;
  g.fillStyle = 'rgba(107,90,66,.08)';
  const gy = h * 0.8;
  g.beginPath();
  g.moveTo(30, gy);
  g.lineTo(w - 30, gy);
  g.stroke();
  g.strokeRect(150, gy - 120, 340, 120);
  for (let i = 0; i < 7; i++) {
    const ax = 170 + i * 46;
    g.beginPath();
    g.moveTo(ax, gy);
    g.lineTo(ax, gy - 40);
    g.arc(ax + 16, gy - 40, 16, Math.PI, 0);
    g.lineTo(ax + 32, gy);
    g.stroke();
  }
  g.beginPath();
  g.arc(320, gy - 120, 90, Math.PI, 0);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(320, gy - 210);
  g.lineTo(320, gy - 245);
  g.stroke();
  for (const mx of [110, 530]) {
    g.strokeRect(mx - 14, gy - 230, 28, 230);
    g.beginPath();
    g.moveTo(mx - 18, gy - 230);
    g.lineTo(mx, gy - 270);
    g.lineTo(mx + 18, gy - 230);
    g.stroke();
  }
  for (const dx of [-120, 120]) {
    g.beginPath();
    g.arc(320 + dx, gy - 120, 32, Math.PI, 0);
    g.stroke();
  }
  g.strokeStyle = '#7a5a2a';
  g.lineWidth = 10;
  g.strokeRect(5, 5, w - 10, h - 10);
});

const hadithTex = () => paint(512, 640, (g, w, h) => {
  archFrame(g, w, h, 'cream');
  g.strokeStyle = '#6b5a42';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(w / 2, 200, 44, Math.PI, 0);
  g.stroke();
  g.strokeRect(w / 2 - 44, 200, 88, 36);
  for (const mx of [w / 2 - 90, w / 2 + 90]) g.strokeRect(mx - 8, 150, 16, 86);
  g.fillStyle = '#1f4a41';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `italic 600 30px ui-sans-serif, 'Segoe UI', sans-serif`;
  HADITH_TAHFIDZ.lines.forEach((t, i) => g.fillText(t, w / 2, 330 + i * 42, w - 110));
  g.font = `600 24px ui-sans-serif, 'Segoe UI', sans-serif`;
  g.fillText(`(${HADITH_TAHFIDZ.source})`, w / 2, 490);
});

const mottoTex = (lines) => paint(768, 160, (g, w, h) => {
  g.fillStyle = '#0f4a43';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = GOLD;
  g.lineWidth = 6;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.lineWidth = 2;
  g.strokeRect(18, 18, w - 36, h - 36);
  g.fillStyle = '#f0d98c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 44px ui-sans-serif, 'Segoe UI', sans-serif`;
  lines.forEach((t, i) => g.fillText(t, w / 2, h * (0.36 + i * 0.3), w - 80));
});

const panelTex = () => paint(1024, 256, (g, w, h) => {
  g.fillStyle = '#0f4a43';
  g.fillRect(0, 0, w, h);
  lattice(g, w, h, 44, 'rgba(232,200,100,.35)');
  g.strokeStyle = GOLD;
  g.lineWidth = 8;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.lineWidth = 2;
  g.strokeRect(24, 24, w - 48, h - 48);
  for (const cx of [w * 0.25, w * 0.5, w * 0.75]) {
    star8(g, cx, h / 2, 70, 46);
    g.fillStyle = 'rgba(232,200,100,.25)';
    g.fill();
    g.stroke();
  }
});

const marbleTex = () => paint(256, 256, (g, w, h) => {
  g.fillStyle = '#f0e8d8';
  g.fillRect(0, 0, w, h);
  const rng = makeRng(5);
  for (let i = 0; i < 18; i++) {
    g.strokeStyle = `rgba(190,170,130,${0.08 + rng() * 0.12})`;
    g.lineWidth = 1 + rng() * 2;
    g.beginPath();
    g.moveTo(rng() * w, 0);
    g.bezierCurveTo(rng() * w, h * 0.3, rng() * w, h * 0.7, rng() * w, h);
    g.stroke();
  }
  g.strokeStyle = 'rgba(160,140,100,.35)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, w, h);
});

// Karpet jalur horizontal (pola berulang sepanjang sumbu x).
const runnerTex = () => paint(512, 128, (g, w, h) => {
  g.fillStyle = '#145a50';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = GOLD;
  g.lineWidth = 6;
  g.strokeRect(-4, 4, w + 8, h - 8);
  g.lineWidth = 2;
  g.strokeRect(-4, 16, w + 8, h - 32);
  for (let x = 0; x < w; x += 128) {
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x + 64, 30);
    g.lineTo(x + 94, 64);
    g.lineTo(x + 64, 98);
    g.lineTo(x + 34, 64);
    g.closePath();
    g.stroke();
    g.fillStyle = GOLD;
    g.beginPath();
    g.arc(x + 64, 64, 5, 0, Math.PI * 2);
    g.fill();
  }
});

const daisTex = () => paint(256, 256, (g, w, h) => {
  g.fillStyle = '#145a50';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = GOLD;
  g.lineWidth = 8;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = '#efe6d2';
  g.fillRect(30, 30, w - 60, h - 60);
  g.strokeStyle = GOLD;
  g.lineWidth = 2;
  g.strokeRect(38, 38, w - 76, h - 76);
});

const hexTex = () => paint(512, 512, (g, w, h) => {
  const hex = (r) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      const px = w / 2 + Math.cos(a) * r;
      const py = h / 2 + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
  };
  hex(240);
  g.strokeStyle = GOLD;
  g.lineWidth = 10;
  g.stroke();
  hex(214);
  g.fillStyle = 'rgba(15,74,67,.9)';
  g.fill();
  hex(190);
  g.strokeStyle = GOLD;
  g.lineWidth = 3;
  g.stroke();
  hex(150);
  g.fillStyle = '#efe6d2';
  g.fill();
  star8(g, w / 2, h / 2, 110, 70);
  g.fillStyle = 'rgba(15,74,67,.9)';
  g.fill();
  g.stroke();
});

const studyCarpetTex = () => paint(512, 640, (g, w, h) => {
  g.fillStyle = '#1c5a47';
  g.fillRect(0, 0, w, h);
  lattice(g, w, h, 64, 'rgba(232,200,100,.16)');
  g.strokeStyle = GOLD;
  g.lineWidth = 10;
  g.strokeRect(10, 10, w - 20, h - 20);
  g.strokeStyle = '#efe6d2';
  g.lineWidth = 3;
  g.strokeRect(26, 26, w - 52, h - 52);
  g.strokeStyle = GOLD;
  g.lineWidth = 2;
  g.strokeRect(40, 40, w - 80, h - 80);
  star8(g, w / 2, h / 2, 120, 76);
  g.fillStyle = 'rgba(232,200,100,.22)';
  g.fill();
  g.lineWidth = 3;
  g.stroke();
  for (const [x, y] of [[90, 90], [w - 90, 90], [90, h - 90], [w - 90, h - 90]]) {
    star8(g, x, y, 34, 22);
    g.stroke();
  }
});

const ceilingTex = () => paint(512, 512, (g, w, h) => {
  const grad = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.7);
  grad.addColorStop(0, '#fff6dc');
  grad.addColorStop(1, '#ead9b0');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c9b27a';
  g.lineWidth = 6;
  g.strokeRect(24, 24, w - 48, h - 48);
  g.strokeStyle = GOLD;
  g.lineWidth = 2;
  g.strokeRect(44, 44, w - 88, h - 88);
  g.beginPath();
  g.arc(w / 2, h / 2, 150, 0, Math.PI * 2);
  g.stroke();
});

const skylightTex = () => paint(512, 512, (g, w, h) => {
  g.fillStyle = '#cfeaf7';
  g.fillRect(0, 0, w, h);
  lattice(g, w, h, 64, 'rgba(216,176,74,.9)');
  star8(g, w / 2, h / 2, 190, 120);
  g.strokeStyle = GOLD;
  g.lineWidth = 5;
  g.stroke();
  g.lineWidth = 14;
  g.strokeRect(7, 7, w - 14, h - 14);
});

const screenTex = () => paint(128, 96, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#2a6db3');
  grad.addColorStop(1, '#0e2e57');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(220,240,255,.85)';
  for (let i = 0; i < 6; i++) g.fillRect(12, 14 + i * 13, i === 0 ? 70 : 104 - (i % 3) * 14, 5);
  g.strokeStyle = '#9fd0ff';
  g.lineWidth = 3;
  g.strokeRect(2, 2, w - 4, h - 4);
});

// ------------------------------------------------------------------ perakit dekorasi
export function createInteriors(ctx) {
  const { root, boxes, cyls, cones, balls, domes, glow, glowBox, exhibitHits } = ctx;
  const rng = makeRng(77);
  const cache = {};
  const tx = (key, make) => (cache[key] ??= make());
  const geos = new Map();
  const planeGeo = (w, h) => {
    const k = `${w}x${h}`;
    let g = geos.get(k);
    if (!g) {
      g = new THREE.PlaneGeometry(w, h);
      geos.set(k, g);
    }
    return g;
  };
  const mats = new Map();
  const matFor = (tex, emissive) => {
    const key = `${tex.uuid}|${emissive}`;
    let m = mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: emissive, roughness: 0.8, transparent: true });
      mats.set(key, m);
    }
    return m;
  };
  const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.4, metalness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#cde7ef', roughness: 0.1, transparent: true, opacity: 0.16, depthWrite: false });
  const pageMat = new THREE.MeshStandardMaterial({ color: '#f1e7c6', roughness: 0.9 });
  const coverMat = new THREE.MeshStandardMaterial({ color: '#1d5a40', roughness: 0.8 });
  const vitrineGeo = new THREE.BoxGeometry(2.2, 1.1, 2.2);
  const torusGeo = new THREE.TorusGeometry(0.5, 0.035, 8, 32);
  const pageGeo = new THREE.BoxGeometry(0.55, 0.03, 0.75);

  const addPlane = (tex, w, h, x, y, z, ry = 0, rx = 0, emissive = 0.55) => {
    const m = new THREE.Mesh(planeGeo(w, h), matFor(tex, emissive));
    m.position.set(x, y, z);
    m.rotation.order = 'YXZ';
    m.rotation.y = ry;
    m.rotation.x = rx;
    root.add(m);
    return m;
  };
  /** Hiasan di muka dalam dinding. side: n|s|e|w; along: koordinat sepanjang dinding. */
  const wallPlane = (tex, r, side, along, y, w, h, lift = 0.06, emissive = 0.55) => {
    const [x1, z1, x2, z2] = r.rect;
    const o = r.t / 2 + lift;
    if (side === 'n') return addPlane(tex, w, h, along, y, z1 + o, 0, 0, emissive);
    if (side === 's') return addPlane(tex, w, h, along, y, z2 - o, Math.PI, 0, emissive);
    if (side === 'w') return addPlane(tex, w, h, x1 + o, y, along, Math.PI / 2, 0, emissive);
    return addPlane(tex, w, h, x2 - o, y, along, -Math.PI / 2, 0, emissive);
  };
  const floorStrip = (base, cx, cz, lx, lz, y, repeatX = 1, repeatZ = 1, ry = 0) => {
    const t = base.clone();
    t.needsUpdate = true;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatZ);
    const m = new THREE.Mesh(planeGeo(lx, lz), matFor(t, 0.15));
    m.rotation.order = 'YXZ';
    m.rotation.x = -Math.PI / 2;
    m.rotation.y = ry;
    m.position.set(cx, y, cz);
    root.add(m);
    return m;
  };

  // ---- perabot ----
  const chandelier = (x, top, z, s = 1) => {
    const drop = 3.4 * s;
    const yTier = top - drop;
    cyls.add(x, top - (drop + 1.5 * s) / 2, z, 0.05 * s, drop + 1.5 * s, 0.05 * s, GOLD);
    boxes.add(x, yTier + 0.3 * s, z, 0.5 * s, 0.12 * s, 0.5 * s, GOLD);
    const lantern = (lx, ly, lz, armY, k = 1) => {
      glowBox.add(lx, ly, lz, 0.34 * s * k, 0.72 * s * k, 0.34 * s * k, WARM);
      boxes.add(lx, ly + 0.42 * s * k, lz, 0.46 * s * k, 0.08 * s * k, 0.46 * s * k, GOLD);
      boxes.add(lx, ly - 0.42 * s * k, lz, 0.4 * s * k, 0.07 * s * k, 0.4 * s * k, GOLD);
      const top2 = ly + 0.46 * s * k;
      if (armY > top2) cyls.add(lx, (armY + top2) / 2, lz, 0.02 * s, armY - top2, 0.02 * s, GOLD);
    };
    const ring = (n, radius, armY, ly) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const lx = x + Math.cos(a) * radius;
        const lz = z + Math.sin(a) * radius;
        boxes.add(x + Math.cos(a) * (radius / 2), armY, z + Math.sin(a) * (radius / 2), radius, 0.05 * s, 0.05 * s, GOLD, -a);
        lantern(lx, ly, lz, armY);
      }
    };
    ring(8, 1.7 * s, yTier + 0.3 * s, yTier - 0.7 * s);
    ring(4, 0.8 * s, yTier - 0.6 * s, yTier - 1.5 * s);
    lantern(x, yTier - 1.8 * s, z, 0, 1.4);
  };

  const plant = (x, z, s = 1) => {
    cyls.add(x, 0.45 * s, z, 0.42 * s, 0.9 * s, 0.42 * s, '#12373a');
    cyls.add(x, 0.88 * s, z, 0.45 * s, 0.06 * s, 0.45 * s, GOLD);
    cyls.add(x, 1.4 * s, z, 0.05 * s, 1.0 * s, 0.05 * s, '#6f5a3a');
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t * 0.5;
        balls.add(x + Math.cos(a) * 0.55 * s, (1.75 + t * 0.3) * s, z + Math.sin(a) * 0.55 * s, 0.6 * s, 0.08 * s, 0.18 * s, t ? '#3f8a3a' : '#2f7a3a', -a);
      }
    }
  };

  const chair = (x, z, ry, k = 1, cushion = '#e9dfc8') => {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const put = (lx, lz, y, sx, sy, sz, color) => boxes.add(x + lx * c + lz * s, y, z - lx * s + lz * c, sx, sy, sz, color, ry);
    put(0, 0, 0.48 * k, 0.55 * k, 0.12 * k, 0.55 * k, cushion);
    put(0, 0.25 * k, 0.9 * k, 0.55 * k, 0.7 * k, 0.1 * k, cushion);
    put(0, 0.3 * k, 0.9 * k, 0.62 * k, 0.8 * k, 0.04 * k, '#8a5a2f');
    for (const lx of [-0.24, 0.24]) for (const lz of [-0.24, 0.24]) put(lx * k, lz * k, 0.21 * k, 0.05 * k, 0.42 * k, 0.05 * k, '#8a5a2f');
  };
  const armchair = (x, z, ry) => {
    chair(x, z, ry, 1.45, '#efe6d2');
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    for (const lx of [-0.42, 0.42]) boxes.add(x + lx * c, 0.72, z - lx * s, 0.08, 0.1, 0.8, '#8a5a2f', ry);
  };
  const sofa = (x, z, ry, len) => {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const put = (lx, lz, y, sx, sy, sz, color) => boxes.add(x + lx * c + lz * s, y, z - lx * s + lz * c, sx, sy, sz, color, ry);
    put(0, 0, 0.1, len, 0.14, 0.9, '#8a5a2f');
    put(0, 0, 0.36, len, 0.38, 0.9, '#e8dfc9');
    put(0, -0.35, 0.8, len, 0.7, 0.22, '#e8dfc9');
    for (const k of [-0.3, 0.3]) put(len * k, -0.15, 0.7, 0.8, 0.4, 0.18, '#17695f');
  };
  const bookshelf = (x, z, ry, len = 14, hgt = 4.2) => {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const put = (lx, lz, y, sx, sy, sz, color) => {
      const [wx, wz] = at(lx, lz);
      boxes.add(wx, y, wz, sx, sy, sz, color, ry);
    };
    put(0, 0, hgt / 2, len, hgt, 0.9, '#4a2f1b');
    for (let k = 0; k < 5; k++) {
      const base = 0.35 + k * 0.78;
      put(0, 0.2, base - 0.04, len, 0.08, 1.1, '#8a6a45');
      const [gx, gz] = at(0, 0.45);
      glowBox.add(gx, base + 0.74, gz, len - 0.4, 0.04, 0.04, WARM, ry);
      let lx = -len / 2 + 0.2;
      while (lx < len / 2 - 0.4) {
        const w = Math.min(0.35 + rng() * 0.4, len / 2 - 0.2 - lx);
        const h = 0.5 + rng() * 0.22;
        put(lx + w / 2, 0.36, base + h / 2, w * 0.9, h, 0.5, BOOK_COLORS[Math.floor(rng() * BOOK_COLORS.length)]);
        lx += w;
      }
    }
  };

  // ---- benda koleksi museum ----
  const artifact = (kind, x, z) => {
    const y0 = 0.96;
    if (kind === 'astro') {
      for (const [rx, ry] of [[0, 0], [0, Math.PI / 2], [Math.PI / 2.4, 0]]) {
        const m = new THREE.Mesh(torusGeo, goldMat);
        m.position.set(x, y0 + 0.62, z);
        m.rotation.set(rx, ry, 0);
        root.add(m);
      }
      cyls.add(x, y0 + 0.15, z, 0.06, 0.3, 0.06, GOLD);
      cyls.add(x, y0 + 0.03, z, 0.32, 0.06, 0.32, GOLD);
      balls.add(x, y0 + 0.62, z, 0.09, 0.09, 0.09, '#f2d98a');
    } else if (kind === 'book') {
      boxes.add(x, y0 + 0.12, z, 0.3, 0.24, 0.5, '#5b3a22');
      for (const sgn of [-1, 1]) {
        const page = new THREE.Mesh(pageGeo, pageMat);
        page.position.set(x + sgn * 0.28, y0 + 0.36, z);
        page.rotation.z = sgn * 0.25;
        root.add(page);
        const cover = new THREE.Mesh(pageGeo, coverMat);
        cover.position.set(x + sgn * 0.28, y0 + 0.33, z);
        cover.scale.set(1.06, 1, 1.06);
        cover.rotation.z = sgn * 0.25;
        root.add(cover);
      }
    } else if (kind === 'mosque') {
      boxes.add(x, y0 + 0.05, z, 1.6, 0.1, 1.6, '#e6dcc6');
      boxes.add(x, y0 + 0.35, z, 0.8, 0.5, 0.8, '#f2ead8');
      domes.add(x, y0 + 0.6, z, 0.42, 0.3, 0.42, GOLD);
      for (const sx of [-0.65, 0.65]) {
        cyls.add(x + sx, y0 + 0.5, z + 0.6, 0.07, 0.8, 0.07, '#f2ead8');
        cones.add(x + sx, y0 + 1.0, z + 0.6, 0.1, 0.2, 0.1, GOLD);
      }
    } else if (kind === 'globe') {
      const ring = new THREE.Mesh(torusGeo, goldMat);
      ring.position.set(x, y0 + 0.55, z);
      ring.rotation.set(0.3, 0.6, 0);
      root.add(ring);
      balls.add(x, y0 + 0.55, z, 0.38, 0.38, 0.38, '#2f8f86');
      cyls.add(x, y0 + 0.12, z, 0.07, 0.24, 0.07, GOLD);
      cyls.add(x, y0 + 0.03, z, 0.3, 0.06, 0.3, GOLD);
    } else if (kind === 'clock') {
      cyls.add(x, y0 + 0.35, z, 0.35, 0.7, 0.35, '#b9774a');
      cyls.add(x, y0 + 0.72, z, 0.4, 0.06, 0.4, GOLD);
      balls.add(x, y0 + 0.95, z, 0.2, 0.2, 0.2, GOLD);
      const gear = new THREE.Mesh(torusGeo, goldMat);
      gear.position.set(x, y0 + 0.4, z + 0.36);
      gear.scale.set(0.5, 0.5, 0.5);
      root.add(gear);
    } else {
      boxes.add(x, y0 + 0.08, z, 0.9, 0.16, 0.6, '#efe6d2');
      boxes.add(x, y0 + 0.22, z, 0.8, 0.12, 0.55, '#1d5a40');
      boxes.add(x, y0 + 0.34, z, 0.7, 0.12, 0.5, '#b8923f');
      balls.add(x + 0.5, y0 + 0.2, z - 0.5, 0.16, 0.16, 0.16, GOLD);
    }
  };
  const exhibitKind = { astrolab: 'astro', mushaf: 'book', pasai: 'mosque', qarawiyyin: 'mosque', idrisi: 'globe', jazari: 'clock' };
  const showcase = (p) => {
    const dir = p.z < -80 ? 1 : -1;
    boxes.add(p.x, 0.45, p.z, 2.4, 0.9, 2.4, '#0f3f39');
    boxes.add(p.x, 0.07, p.z, 2.5, 0.12, 2.5, GOLD);
    boxes.add(p.x, 0.93, p.z, 2.5, 0.06, 2.5, GOLD);
    artifact(exhibitKind[p.exhibit] ?? 'books', p.x, p.z);
    const glass = new THREE.Mesh(vitrineGeo, glassMat);
    glass.position.set(p.x, 1.51, p.z);
    root.add(glass);
    addPlane(tx('screen', screenTex), 0.95, 0.6, p.x, 0.78, p.z + dir * 1.3, dir > 0 ? 0 : Math.PI, -0.7, 1);
    if (p.exhibit) {
      glow.add(p.x, 2.45, p.z, 0.22, 0.22, 0.22, '#ffd77a'); // penanda ketuk untuk info
      const hit = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.set(p.x, 1.3, p.z);
      hit.userData.exhibit = p.exhibit;
      exhibitHits.push(hit);
      root.add(hit);
    }
  };

  // ---- kolam dan meja wudhu ----
  const tap = (x, z, dirZ) => {
    cyls.add(x, 1.3, z - dirZ * 0.25, 0.04, 0.6, 0.04, GOLD);
    boxes.add(x, 1.58, z - dirZ * 0.05, 0.06, 0.06, 0.4, GOLD);
  };
  const stool = (x, z) => {
    boxes.add(x, 0.23, z, 0.55, 0.46, 0.55, GREEN);
    boxes.add(x, 0.47, z, 0.6, 0.04, 0.6, GOLD);
  };
  const counter = (p) => {
    const dir = p.z < 55 ? 1 : -1;
    boxes.add(p.x, 0.475, p.z, 20, 0.95, 1.2, CREAM);
    boxes.add(p.x, 0.97, p.z, 20.2, 0.06, 1.3, '#0f4a43');
    boxes.add(p.x, 1.0, p.z + dir * 0.62, 20.2, 0.03, 0.04, GOLD);
    boxes.add(p.x, 1.5, p.z - dir * 0.5, 20, 1.0, 0.2, CREAM);
    for (let i = 0; i < 8; i++) {
      const xx = p.x - 8.75 + i * 2.5;
      boxes.add(xx, 1.0, p.z + dir * 0.1, 0.5, 0.02, 0.4, '#0b2f2b');
      tap(xx, p.z, dir);
      stool(xx, p.z + dir * 2.4);
    }
  };
  const basin = (p) => {
    boxes.add(p.x, 0.45, p.z, 7, 0.9, 16, CREAM);
    boxes.add(p.x, 0.93, p.z, 7.1, 0.08, 16.1, '#0f4a43');
    boxes.add(p.x, 0.945, p.z, 5.6, 0.03, 14.6, GOLD);
    glowBox.add(p.x, 0.975, p.z, 5.4, 0.03, 14.4, '#7fd8d8');
    boxes.add(p.x, 1.5, p.z, 0.9, 3.0, 0.9, '#f3eee2');
    boxes.add(p.x, 2.9, p.z, 1.0, 0.1, 1.0, GOLD);
    for (let i = 0; i < 8; i++) {
      const zz = p.z - 7 + i * 2;
      for (const sx of [-1, 1]) {
        cyls.add(p.x + sx * 3.2, 1.15, zz, 0.05, 0.5, 0.05, GOLD);
        boxes.add(p.x + sx * 2.95, 1.35, zz, 0.35, 0.06, 0.06, GOLD);
        stool(p.x + sx * 4.6, zz);
      }
    }
  };

  // ---- meja bundar walimah, meja akad, meja baca tahfidz ----
  const roundTable = (p) => {
    cyls.add(p.x, 0.78, p.z, 1.2, 0.05, 1.2, '#f7f1e3');
    cyls.add(p.x, 0.38, p.z, 1.15, 0.76, 1.15, '#f1e7d4');
    cyls.add(p.x, 0.76, p.z, 1.22, 0.03, 1.22, GOLD);
    cyls.add(p.x, 0.95, p.z, 0.08, 0.3, 0.08, GOLD);
    balls.add(p.x, 1.2, p.z, 0.28, 0.2, 0.28, '#e9b6c0');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      chair(p.x + Math.cos(a) * 1.75, p.z + Math.sin(a) * 1.75, Math.PI / 2 - a);
    }
  };
  const akadTable = (p) => {
    boxes.add(p.x, 0.45, p.z, 2, 0.9, 6, '#f7f1e3');
    boxes.add(p.x, 0.92, p.z, 2.1, 0.05, 6.1, GOLD);
    balls.add(p.x, 1.1, p.z, 0.28, 0.22, 0.28, '#f0f0e6');
    cyls.add(p.x, 0.98, p.z, 0.1, 0.2, 0.1, GOLD);
    boxes.add(p.x, 0.97, p.z - 1.6, 0.4, 0.03, 0.3, '#1d1d1d');
    boxes.add(p.x, 0.97, p.z + 1.6, 0.4, 0.03, 0.3, '#1d1d1d');
  };
  const desk = (p) => {
    boxes.add(p.x, 0.42, p.z, 6, 0.08, 1.0, '#8a5a2f');
    for (const sx of [-2.7, 2.7]) for (const sz of [-0.4, 0.4]) boxes.add(p.x + sx, 0.19, p.z + sz, 0.1, 0.38, 0.1, '#6b4326');
    for (let k = 0; k < 4; k++) {
      const bx = p.x - 2.25 + k * 1.5;
      boxes.add(bx, 0.52, p.z, 0.62, 0.1, 0.46, '#1d5a40');
      boxes.add(bx, 0.575, p.z, 0.56, 0.03, 0.4, '#efe3b8');
      for (const sz of [-1.15, 1.15]) boxes.add(bx, 0.09, p.z + sz, 0.85, 0.18, 0.8, '#e8dfc9');
    }
  };

  const drawProp = (p) => {
    switch (p.type) {
      case 'row':
        for (let k = -2; k <= 2; k++) chair(p.x, p.z + k * 2, -Math.PI / 2);
        return true;
      case 'akadtable':
        akadTable(p);
        return true;
      case 'armchair':
        armchair(p.x, p.z, Math.PI / 2);
        return true;
      case 'rehal':
        desk(p);
        return true;
      case 'glass':
        showcase(p);
        return true;
      case 'counter':
        counter(p);
        return true;
      case 'basin':
        basin(p);
        return true;
      case 'table':
        roundTable(p);
        return true;
      case 'pelaminan':
        if (p.x < 0) addPlane(tx('panel', panelTex), 18, 4.6, p.x + 1.56, 2.5, p.z, Math.PI / 2);
        return false; // kotak emas bawaan tetap digambar
      default:
        return false;
    }
  };

  // ---- hiasan tingkat ruangan ----
  const skyKey = (name) => (name === 'skyWide' ? tx('skyWide', () => skyTex(256, 320)) : tx('skyTall', () => skyTex(256, 512)));
  const ceilMat = new THREE.MeshBasicMaterial({ transparent: false });
  const common = (r, o = {}) => {
    const [x1, z1, x2, z2] = r.rect;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const w = x2 - x1;
    const d = z2 - z1;
    if (o.floor) floorStrip(tx('marble', marbleTex), cx, cz, w - r.t, d - r.t, 0.1, (w - r.t) / 5, (d - r.t) / 5);
    ceilMat.map = tx('ceiling', ceilingTex);
    const ceil = new THREE.Mesh(planeGeo(w - r.t, d - r.t), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, r.h - 0.03, cz);
    root.add(ceil);
    // lampu sorot tersembunyi (cove) dan lis emas di bawah atap
    const yc = r.h - 0.45;
    const oc = r.t / 2 + 0.2;
    glowBox.add(cx, yc, z1 + oc, w - r.t * 2, 0.1, 0.1, WARM);
    glowBox.add(cx, yc, z2 - oc, w - r.t * 2, 0.1, 0.1, WARM);
    glowBox.add(x1 + oc, yc, cz, 0.1, 0.1, d - r.t * 2, WARM);
    glowBox.add(x2 - oc, yc, cz, 0.1, 0.1, d - r.t * 2, WARM);
    const yk = r.h - 0.75;
    const ok = r.t / 2 + 0.06;
    boxes.add(cx, yk, z1 + ok, w - r.t * 2, 0.14, 0.12, GOLD);
    boxes.add(cx, yk, z2 - ok, w - r.t * 2, 0.14, 0.12, GOLD);
    boxes.add(x1 + ok, yk, cz, 0.12, 0.14, d - r.t * 2, GOLD);
    boxes.add(x2 - ok, yk, cz, 0.12, 0.14, d - r.t * 2, GOLD);
    for (const [x, z, s] of o.chandeliers ?? []) chandelier(x, r.h, z, s);
    if (o.windows) {
      for (const side of o.windows.sides) {
        for (const c of wallSlots(r, side, o.windows.w, 5.8, 4)) wallPlane(skyKey(o.windows.tex), r, side, c, o.windows.y, o.windows.w, o.windows.h);
      }
    }
    for (const [x, z, s] of o.plants ?? []) plant(x, z, s ?? 1);
  };

  const buildRooms = () => {
    // ---------------- Ruang Akad Nikah
    {
      const r = room('akad');
      common(r, {
        floor: true,
        chandeliers: [[110, 190, 1.2], [150, 190, 1.2]],
        windows: { sides: ['n', 's'], w: 4.2, h: 6.8, y: 4.0, tex: 'skyTall' },
        plants: [[172.5, 178.5], [172.5, 201.5], [86, 168], [86, 212], [176, 168], [176, 212]],
      });
      floorStrip(tx('dais', daisTex), 171.2, 190, 17.6, 24, 0.12);
      floorStrip(tx('runner', runnerTex), 123, 190, 74, 5, 0.12, 74 / 5, 1);
      wallPlane(tx('nicheAllah', () => nicheTex(ARABIC.allah)), r, 'e', 190, 4.0, 5.07, 7.6, 0.08);
      for (const dz of [-7.5, 7.5]) wallPlane(tx('bannerMarriage', () => bannerTex(ARABIC.marriage)), r, 'e', 190 + dz, 3.9, 2.3, 7.0, 0.08);
      for (const dz of [-15, 15]) wallPlane(skyKey('skyTall'), r, 'e', 190 + dz, 4.0, 4.2, 6.8);
    }

    // ---------------- Museum Peradaban Islam
    {
      const r = room('museum');
      common(r, {
        floor: true,
        chandeliers: [[-245, -80, 1.1]],
        windows: { sides: ['e'], w: 3.6, h: 6.4, y: 4.6, tex: 'skyTall' },
        plants: [[-284, -114], [-284, -46], [-206, -114], [-206, -46], [-284, -94], [-284, -66]],
      });
      floorStrip(tx('hex', hexTex), -245, -80, 13, 13, 0.12);
      const sky = new THREE.Mesh(planeGeo(24, 24), new THREE.MeshBasicMaterial({ map: tx('skylight', skylightTex) }));
      sky.rotation.x = Math.PI / 2;
      sky.position.set(-245, r.h - 0.05, -80);
      root.add(sky);
      wallPlane(tx('nicheBlank', () => nicheTex('')), r, 'w', -80, 4.6, 5.6, 8.4, 0.08);
      for (const dz of [-17, 17]) wallPlane(skyKey('skyTall'), r, 'w', -80 + dz, 4.6, 3.6, 6.4);
      for (const x of [-268, -222]) {
        wallPlane(tx('astro', astroTex), r, 'n', x, 4.8, 5.2, 6.5, 0.08);
        wallPlane(tx('mosqueSketch', mosqueSketchTex), r, 's', x, 4.8, 9, 5.9, 0.08);
      }
    }

    // ---------------- Ruang Tahfidz
    {
      const r = room('tahfidz');
      common(r, {
        floor: true,
        chandeliers: [[-245, -180, 1.3], [-245, -214, 0.9], [-245, -146, 0.9]],
        windows: { sides: ['e'], w: 4.4, h: 6.6, y: 4.4, tex: 'skyTall' },
        plants: [[-284, -234], [-206, -234], [-284, -126], [-206, -126], [-232, -236], [-258, -236]],
      });
      floorStrip(tx('studyCarpet', studyCarpetTex), -245, -180, 80, 108, 0.13);
      wallPlane(tx('nicheQuran', () => nicheTex(ARABIC.quran)), r, 'n', -245, 4.7, 5.73, 8.6, 0.08);
      wallPlane(tx('bannerIqra', () => bannerTex(ARABIC.iqra)), r, 'n', -255, 4.5, 2.6, 7.8, 0.08);
      wallPlane(tx('bannerRattil', () => bannerTex(ARABIC.rattil)), r, 'n', -235, 4.5, 2.6, 7.8, 0.08);
      for (const c of wallSlots(r, 'w', 4.4, 5.8, 4)) if (c > -190) wallPlane(skyKey('skyTall'), r, 'w', c, 4.4, 4.4, 6.6);
      bookshelf(-289, -205, Math.PI / 2, 14, 4.2);
      wallPlane(tx('hadith', hadithTex), r, 'w', -205, 7.0, 3.9, 4.8, 0.08);
      sofa(-201.4, -150, -Math.PI / 2, 7);
      boxes.add(-245, 0.5, -236.5, 1.4, 1.0, 0.8, '#6b4326');
      boxes.add(-245, 1.02, -236.5, 1.5, 0.05, 0.9, GOLD);
      boxes.add(-245, 1.12, -236.5, 0.8, 0.12, 0.55, '#efe3b8');
    }

    // ---------------- Tempat Wudhu Putra dan Putri
    for (const [id, variant] of [['wudhu_east', 'putra'], ['wudhu_west', 'putri']]) {
      const r = room(id);
      const sign = r.rect[0] > 0 ? 1 : -1;
      const cx = 230 * sign;
      const scheme = variant === 'putra' ? 'green' : 'cream';
      common(r, {
        floor: true,
        chandeliers: [[cx, 38, 0.8], [cx, 72, 0.8]],
        windows: { sides: ['n', 's'], w: 3.8, h: 4.6, y: 3.6, tex: 'skyWide' },
        plants: [[cx - 28, 24], [cx + 28, 24], [cx - 28, 86], [cx + 28, 86], [cx - 28, 44], [cx + 28, 66]],
      });
      floorStrip(tx('runner', runnerTex), cx, 55, 66, 4, 0.12, 66 / 5, 1, Math.PI / 2);
      const motto = tx(`motto-${variant}`, () => mottoTex(WUDHU_MOTTO[variant]));
      for (const side of ['n', 's']) wallPlane(motto, r, side, cx, 5.5, 6.6, 1.4, 0.08);
      for (const side of ['w', 'e']) {
        for (const z of [38, 72]) wallPlane(tx(`taharah-${scheme}`, () => bannerTex(ARABIC.taharah, scheme)), r, side, z, 3.4, 2.4, 5.2, 0.08);
      }
    }

    // ---------------- Gedung Walimah
    {
      const r = room('walimah');
      common(r, {
        floor: true,
        chandeliers: [[-150, 190, 1.1], [-130, 190, 1.1], [-110, 190, 1.1]],
        windows: { sides: ['n', 's'], w: 4.2, h: 6.8, y: 4.0, tex: 'skyTall' },
        plants: [[-176, 170], [-176, 210], [-86, 170], [-86, 210]],
      });
      wallPlane(tx('nicheBlank', () => nicheTex('')), r, 'w', 190, 4.0, 5.07, 7.6, 0.08);
    }

    // ---------------- Perpustakaan dan Ruang Shalat Muslimah
    common(room('library'), {
      chandeliers: [[245, -95, 1], [245, -65, 1]],
      windows: { sides: ['e', 'n'], w: 4.4, h: 6.6, y: 4.4, tex: 'skyTall' },
      plants: [[205, -115], [285, -115], [205, -45], [285, -45]],
    });
    common(room('women_hall'), {
      chandeliers: [[245, -180, 1.3]],
      windows: { sides: ['e', 'n'], w: 4.4, h: 6.6, y: 4.4, tex: 'skyTall' },
      plants: [[205, -235], [285, -235], [205, -125], [285, -125]],
    });
  };

  return { drawProp, buildRooms };
}
