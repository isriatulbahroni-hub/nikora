// Renderer "Taman Perenungan": rumput, jalan batu, dua kolam pantul berpancuran, bangku, lentera, pohon bunga, gazebo, dan petak bunga.
// Benda statis masuk ke batch masjid-world (satu draw call per jenis); yang bergerak hanya air, pancuran, dan cahaya lentera.
// Malam hari air berkilau perak oleh cahaya bulan dan lentera menyala hangat dengan halo lembut.
import * as THREE from 'three';
import { canvasTexture } from './masjid-batch.js';
import { GARDEN } from './masjid-garden-data.js';

const GOLD = '#d8b04a';
const TEAL = '#2f8f86';
const STONE = '#efe6d0';
const PATH = '#e3d6b8';
const WOOD = '#7a5a3a';
const FLOWER_COLORS = ['#e86a8a', '#f6d44c', '#ffffff', '#b58ae8', '#ff9a4a', '#f08ab8'];
const TREE_BLOOM = [['#f2c0d2', '#f7d6e0', '#e8a8c4'], ['#fbf3e6', '#f4e6c8', '#ffffff'], ['#d9b6ec', '#e8d0f4', '#c49ae0']];
const WATER_DAY = new THREE.Color('#2b8fa8');
const WATER_NIGHT = new THREE.Color('#0c2644');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const rippleDraw = (g, w, h) => {
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  let s = 77;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 120; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const len = 6 + rand() * 18;
    g.strokeStyle = `rgba(255,255,255,${0.18 + rand() * 0.5})`;
    g.lineWidth = 1 + rand() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len / 2, y - 2 - rand() * 3, x + len, y);
    g.stroke();
  }
};

function lampHaloTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,214,140,0.95)');
  grad.addColorStop(0.3, 'rgba(255,190,100,0.35)');
  grad.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Menambahkan taman ke batch yang diberikan dan membuat mesh air/sinar. Mengembalikan { update(night, tSeconds) }.
 * night = 0 (siang) .. 1 (malam), sama dengan atm.night dari langit.
 */
export function createGarden({ root, boxes, cyls, cones, balls, glow, props, renderer }) {
  const { pool, gazebo } = GARDEN;
  const waters = [];
  const jets = [];
  const halos = [];
  let rippleTex = null;
  let waterMat = null;
  let haloMat = null;
  try {
    rippleTex = canvasTexture([128, 128], rippleDraw, renderer, [3, 6]);
    waterMat = new THREE.MeshStandardMaterial({ color: WATER_DAY, roughness: 0.12, metalness: 0.15, emissive: new THREE.Color('#cfe3ff'), emissiveMap: rippleTex, emissiveIntensity: 0 });
    haloMat = new THREE.SpriteMaterial({ map: lampHaloTexture(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  } catch (error) {
    console.warn('[taman] tekstur air/lentera tidak bisa dibuat, memakai bahan polos', error);
    waterMat = new THREE.MeshStandardMaterial({ color: WATER_DAY, roughness: 0.2 });
  }

  // ---------------------------------------------------------------- rumput, jalan batu, petak bunga (per sayap)
  let seed = 20261017;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const treeSpots = props.filter((p) => p.type === 'gtree');
  for (const sx of [-1, 1]) {
    const cx = sx * GARDEN.wingX;
    boxes.add(cx, 0.05, GARDEN.z, GARDEN.wingHalfX * 2, 0.1, GARDEN.z1 - GARDEN.z0, '#5f9a4a'); // rumput
    boxes.add(sx * pool.x, 0.075, GARDEN.z, 28, 0.15, 50, PATH); // pelataran kolam
    const avenueEdge = GARDEN.avenueX;
    const crossLen = pool.x - 9 - avenueEdge;
    boxes.add(sx * (avenueEdge + crossLen / 2), 0.075, GARDEN.z, crossLen, 0.15, 5, PATH); // jalan setapak dari jalan tengah
    boxes.add(sx * (gazebo.x - 3), 0.075, GARDEN.z, 14, 0.15, 5, PATH); // ke gazebo

    // kolam: bibir batu + air (mesh terpisah) + pancuran kecil bertingkat
    boxes.add(sx * pool.x, 0.3, GARDEN.z, pool.hx * 2, 0.6, pool.hz * 2, STONE);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(pool.waterHx * 2, pool.waterHz * 2), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(sx * pool.x, 0.62, GARDEN.z);
    root.add(water);
    waters.push(water);
    const fx = sx * pool.x;
    cyls.add(fx, 0.85, GARDEN.z, 1.8, 0.5, 1.8, STONE);
    cyls.add(fx, 1.5, GARDEN.z, 0.5, 1.7, 0.5, GOLD);
    balls.add(fx, 2.5, GARDEN.z, 0.6, 0.6, 0.6, GOLD);
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.32, 3.4, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#cdeeff', transparent: true, opacity: 0.4, depthWrite: false }));
    jet.position.set(fx, 2.3, GARDEN.z);
    root.add(jet);
    jets.push(jet);

    // petak bunga di tepi sayap, menghindari pohon, jalan setapak, dan gazebo
    const edge = (x, z) => {
      if (treeSpots.some((t) => Math.hypot(t.x - x, t.z - z) < 2.6)) return;
      if (Math.abs(z - GARDEN.z) < 3.6 && Math.abs(x) < 46) return;
      if (Math.hypot(x - sx * gazebo.x, z - GARDEN.z) < 6.2) return;
      const color = FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)];
      const r = 0.4 + rand() * 0.3;
      balls.add(x + (rand() - 0.5) * 0.5, 0.35 + r * 0.4, z + (rand() - 0.5) * 0.5, r, r * 0.8, r, color);
      if (rand() < 0.4) balls.add(x + 0.3, 0.3, z - 0.3, 0.55, 0.4, 0.55, '#3f8a3a'); // daun
    };
    for (let x = cx - GARDEN.wingHalfX + 2.5; x <= cx + GARDEN.wingHalfX - 2.5; x += 1.7) {
      edge(x, GARDEN.z0 + 2.4);
      edge(x, GARDEN.z1 - 2.4);
    }
    for (let z = GARDEN.z0 + 4.2; z <= GARDEN.z1 - 4.2; z += 1.7) {
      edge(cx - sx * (GARDEN.wingHalfX - 2.4), z); // sisi dekat jalan tengah
      edge(cx + sx * (GARDEN.wingHalfX - 2.4), z); // sisi luar
    }

    // gazebo: alas, atap kerucut hijau-toska, mahkota emas, meja dan lentera gantung (tiang = prop bertabrakan)
    const gx = sx * gazebo.x;
    cyls.add(gx, 0.2, GARDEN.z, 5.4, 0.4, 5.4, STONE);
    cones.add(gx, 5 + 1.5, GARDEN.z, gazebo.roofR, 3, gazebo.roofR, TEAL);
    cyls.add(gx, 5.05, GARDEN.z, gazebo.roofR - 0.3, 0.3, gazebo.roofR - 0.3, GOLD);
    balls.add(gx, 8.3, GARDEN.z, 0.38, 0.38, 0.38, GOLD);
    cyls.add(gx, 0.65, GARDEN.z, 0.9, 0.5, 0.9, '#8a5a2f');
    glow.add(gx, 4.4, GARDEN.z, 0.35, 0.45, 0.35, '#ffd98a');
    if (haloMat) {
      const h = new THREE.Sprite(haloMat);
      h.position.set(gx, 4.4, GARDEN.z);
      h.scale.setScalar(8);
      root.add(h);
      halos.push(h);
    }
  }

  // ---------------------------------------------------------------- properti (bangku, lentera, pohon, tiang gazebo)
  for (const p of props) {
    if (p.type === 'gbench' || p.type === 'gbenchv') {
      const v = p.type === 'gbenchv';
      const along = 4.4;
      const f = p.face;
      if (v) {
        boxes.add(p.x, 0.5, p.z, 1.1, 0.12, along, WOOD);
        boxes.add(p.x - f * 0.5, 1.0, p.z, 0.12, 0.8, along, WOOD);
        for (const o of [-1.9, 1.9]) boxes.add(p.x, 0.25, p.z + o, 1, 0.5, 0.2, '#3a3a3a');
      } else {
        boxes.add(p.x, 0.5, p.z, along, 0.12, 1.1, WOOD);
        boxes.add(p.x, 1.0, p.z - f * 0.5, along, 0.8, 0.12, WOOD);
        for (const o of [-1.9, 1.9]) boxes.add(p.x + o, 0.25, p.z, 0.2, 0.5, 1, '#3a3a3a');
      }
    } else if (p.type === 'glamp') {
      cyls.add(p.x, 0.15, p.z, 0.3, 0.3, 0.3, '#3b3b3b');
      cyls.add(p.x, 1.6, p.z, 0.12, 3.2, 0.12, '#3b3b3b');
      glow.add(p.x, 3.5, p.z, 0.42, 0.5, 0.42, '#ffd98a');
      cones.add(p.x, 4.1, p.z, 0.5, 0.4, 0.5, GOLD);
      if (haloMat) {
        const h = new THREE.Sprite(haloMat);
        h.position.set(p.x, 3.5, p.z);
        h.scale.setScalar(7);
        root.add(h);
        halos.push(h);
      }
    } else if (p.type === 'gtree') {
      const [a, b, c] = TREE_BLOOM[p.variant ?? 0];
      cyls.add(p.x, 1.6, p.z, 0.28, 3.2, 0.28, '#6b4a2b');
      balls.add(p.x, 4.2, p.z, 2.2, 1.7, 2.2, a);
      balls.add(p.x + 1, 3.7, p.z + 0.5, 1.5, 1.2, 1.5, b);
      balls.add(p.x - 0.9, 3.8, p.z - 0.6, 1.5, 1.3, 1.5, c);
    } else if (p.type === 'gpost') {
      cyls.add(p.x, 2.5, p.z, 0.3, 5, 0.3, STONE);
      cyls.add(p.x, 0.3, p.z, 0.5, 0.6, 0.5, GOLD);
      cyls.add(p.x, 4.85, p.z, 0.45, 0.3, 0.45, GOLD);
    }
  }

  return {
    update(night, t) {
      const k = clamp((night - 0.3) / 0.6, 0, 1); // sama dengan tingkat malam bulan
      waterMat.color.copy(WATER_DAY).lerp(WATER_NIGHT, k);
      waterMat.emissiveIntensity = 0.9 * k; // air berkilau perak oleh cahaya bulan
      if (rippleTex) {
        rippleTex.offset.x = (t * 0.006) % 1;
        rippleTex.offset.y = (t * 0.01) % 1;
      }
      if (haloMat) haloMat.opacity = 0.85 * k;
      const pulse = 1 + 0.08 * Math.sin(t * 3.1);
      for (const j of jets) j.scale.set(1, pulse, 1);
    },
  };
}
