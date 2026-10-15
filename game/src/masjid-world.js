// Renderer Masjid Agung NIKORA. Semua benda berulang (dinding, tiang, kubah, pohon, perabot) digambar dengan
// InstancedMesh supaya seluruh kompleks hanya butuh belasan draw call dan tetap ringan di HP.
import * as THREE from 'three';
import { BOUNDS, CENTRAL_DOME, GATE_TOWERS, HALL_H, MINARETS, PROP_SPECS, ROOMS } from './masjid-layout.js';

const CREAM = '#efe6d0';
const GOLD = '#d8b04a';
const TEAL = '#2f8f86';
const FLOOR_COLORS = { hall: '#cdbf9f', women: '#cdbf9f', study: '#b9a07a', library: '#8a6a45', museum: '#d6d2c8', wudhu: '#9cc7d4', akad: '#efe6d2', walimah: '#f1e3d8' };
const PROP_LOOK = {
  pier: '#e8dcc0', minbar: '#6b4a2b', shelf: '#6b4a2b', glass: '#b8d4e0', rehal: '#8a5a2f', bench: '#d9d2c3',
  table: '#f4efe6', akadtable: '#f7f1e3', pelaminan: GOLD, row: '#7a2f3a',
};

const tmp = new THREE.Object3D();
const tint = new THREE.Color();

/** Kumpulan benda berbentuk sama (satu geometri) yang digambar dalam satu draw call, dengan warna per benda. */
class Batch {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.items = [];
  }

  add(x, y, z, sx, sy, sz, color, ry = 0) {
    this.items.push([x, y, z, sx, sy, sz, color, ry]);
  }

  build(parent) {
    if (!this.items.length) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.items.length);
    this.items.forEach(([x, y, z, sx, sy, sz, color, ry], i) => {
      tmp.position.set(x, y, z);
      tmp.rotation.set(0, ry, 0);
      tmp.scale.set(sx, sy, sz);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      mesh.setColorAt(i, tint.set(color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false; // jumlah draw call kecil; hindari bola batas yang salah untuk benda tersebar
    parent.add(mesh);
    return mesh;
  }
}

function canvasTexture(size, draw, renderer, repeat) {
  const [w, h] = size;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  return tex;
}

const pavingDraw = (g) => {
  g.fillStyle = '#dccfb2';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#bfae8a';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 252, 252);
  g.fillStyle = '#cdbd9a';
  g.beginPath();
  g.moveTo(128, 28);
  g.lineTo(228, 128);
  g.lineTo(128, 228);
  g.lineTo(28, 128);
  g.closePath();
  g.fill();
  g.fillStyle = '#dccfb2';
  g.beginPath();
  g.arc(128, 128, 46, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#a8946c';
  g.lineWidth = 3;
  g.stroke();
};

// Sajadah: relung (mihrab) menghadap atas = utara = kiblat.
const carpetDraw = (g, w, h) => {
  g.fillStyle = '#1f5f46';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#d9b45a';
  g.lineWidth = 6;
  g.strokeRect(3, 3, w - 6, h - 6);
  g.strokeStyle = '#e8dcc0';
  g.lineWidth = 2;
  g.strokeRect(12, 12, w - 24, h - 24);
  g.fillStyle = '#14452f';
  g.strokeStyle = '#d9b45a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(34, h - 20);
  g.lineTo(34, 100);
  g.arc(w / 2, 100, 46, Math.PI, 0, false);
  g.lineTo(w - 34, h - 20);
  g.closePath();
  g.fill();
  g.stroke();
};

const domeDraw = (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1f6f68');
  grad.addColorStop(1, '#3aa398');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = GOLD;
  g.fillRect(0, 0, 4, h);
  g.fillRect(w - 4, 0, 4, h);
  g.strokeStyle = 'rgba(232,220,192,.7)';
  g.lineWidth = 2;
  for (let y = 16; y < h; y += 32) {
    g.beginPath();
    g.moveTo(w / 2, y - 8);
    g.lineTo(w / 2 + 8, y);
    g.lineTo(w / 2, y + 8);
    g.lineTo(w / 2 - 8, y);
    g.closePath();
    g.stroke();
  }
};

export function buildMasjidWorld(scene, world, { renderer } = {}) {
  scene.background = new THREE.Color(0xa9d4ee);
  scene.fog = new THREE.Fog(0xcfe4f2, 320, 1500);
  const hemi = new THREE.HemisphereLight(0xe6f1ff, 0x8f7e5e, 1.0);
  const sun = new THREE.DirectionalLight(0xfff0d2, 1.7);
  sun.position.set(-180, 300, 140);
  scene.add(hemi, sun);

  const root = new THREE.Group();
  scene.add(root);

  const lit = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const boxes = new Batch(new THREE.BoxGeometry(1, 1, 1), lit);
  const cyls = new Batch(new THREE.CylinderGeometry(1, 1, 1, 14), lit);
  const cones = new Batch(new THREE.ConeGeometry(1, 1, 14), lit);
  const balls = new Batch(new THREE.SphereGeometry(1, 14, 10), lit);
  const domes = new Batch(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lit);
  const glow = new Batch(new THREE.SphereGeometry(1, 10, 8), glowMat);

  // ---------------------------------------------------------------- tanah, jalan, lantai
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), new THREE.MeshStandardMaterial({ color: 0x6f9a52, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.15;
  root.add(ground);

  const cx = (BOUNDS.minX + BOUNDS.maxX) / 2;
  const cz = (BOUNDS.minZ + BOUNDS.maxZ) / 2;
  const bw = BOUNDS.maxX - BOUNDS.minX;
  const bd = BOUNDS.maxZ - BOUNDS.minZ;
  const paving = new THREE.Mesh(
    new THREE.PlaneGeometry(bw, bd),
    new THREE.MeshStandardMaterial({ map: canvasTexture([256, 256], pavingDraw, renderer, [bw / 8, bd / 8]), roughness: 0.9 }),
  );
  paving.rotation.x = -Math.PI / 2;
  paving.position.set(cx, 0, cz);
  root.add(paving);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(16, 460), new THREE.MeshStandardMaterial({ color: 0xa39679, roughness: 1 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -0.05, BOUNDS.maxZ + 230);
  root.add(road);

  const carpetMat = (w, d) => new THREE.MeshStandardMaterial({ map: canvasTexture([160, 256], carpetDraw, renderer, [w / 1.0, d / 1.6]), roughness: 1 });
  for (const r of ROOMS) {
    const [x1, z1, x2, z2] = r.rect;
    boxes.add((x1 + x2) / 2, 0.04, (z1 + z2) / 2, x2 - x1, 0.08, z2 - z1, FLOOR_COLORS[r.kind] ?? CREAM);
    if (r.kind === 'hall' || r.kind === 'women' || r.kind === 'study') {
      const carpet = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1 - 2, z2 - z1 - 2), carpetMat(x2 - x1 - 2, z2 - z1 - 2));
      carpet.rotation.x = -Math.PI / 2;
      carpet.position.set((x1 + x2) / 2, 0.14, (z1 + z2) / 2);
      root.add(carpet);
    }
  }

  // ---------------------------------------------------------------- dinding, ambang, atap
  const wallColor = (w) => (w.room === 'perimeter' ? '#d9cba8' : CREAM);
  for (const w of world.walls) {
    const len = w.b - w.a;
    const mid = (w.a + w.b) / 2;
    if (w.orient === 'h') boxes.add(mid, w.h / 2, w.coord, len, w.h, w.t, wallColor(w));
    else boxes.add(w.coord, w.h / 2, mid, w.t, w.h, len, wallColor(w));
    if (w.room === 'prayer_hall') {
      // pita kaligrafi emas di sepanjang dinding aula
      if (w.orient === 'h') boxes.add(mid, 20, w.coord, len, 1.4, w.t + 0.2, GOLD);
      else boxes.add(w.coord, 20, mid, w.t + 0.2, 1.4, len, GOLD);
    }
  }
  for (const d of world.lintels) {
    if (d.height >= d.wallH) continue;
    const hh = d.wallH - d.height;
    const y = d.height + hh / 2;
    const color = d.t === 2 ? '#d9cba8' : CREAM; // pagar keliling (tebal 2 m) berwarna batu pasir
    if (d.orient === 'h') boxes.add(d.x, y, d.z, d.width, hh, d.t, color);
    else boxes.add(d.x, y, d.z, d.t, hh, d.width, color);
  }
  for (const s of world.roofs) {
    const [x1, z1, x2, z2] = s.rect;
    boxes.add((x1 + x2) / 2, s.y + s.th / 2, (z1 + z2) / 2, x2 - x1, s.th, z2 - z1, s.y === HALL_H ? '#d8cfb8' : '#cdbf9c');
  }

  // ---------------------------------------------------------------- tiang, pilar, perabot
  for (const p of world.props) {
    const spec = PROP_SPECS[p.type];
    if (p.type === 'column') {
      const h = p.h;
      const r = 0.7;
      cyls.add(p.x, h / 2, p.z, r, h, r, CREAM);
      boxes.add(p.x, 0.25, p.z, 1.8, 0.5, 1.8, '#e0d4b4');
      boxes.add(p.x, h - 0.3, p.z, 2.2, 0.6, 2.2, GOLD);
    } else if (p.type === 'palm') {
      const s = p.s ?? 1;
      cyls.add(p.x, 4 * s, p.z, 0.3, 8 * s, 0.3, '#8b6a45');
      balls.add(p.x, 8.6 * s, p.z, 3.4 * s, 1.5 * s, 3.4 * s, '#3f8a3a');
    } else if (p.type === 'tree') {
      const s = p.s ?? 1;
      cyls.add(p.x, 2 * s, p.z, 0.45 * s, 4 * s, 0.45 * s, '#7a5a3a');
      balls.add(p.x, 5.4 * s, p.z, 3.2 * s, 3.2 * s, 3.2 * s, '#3d7a3a');
    } else if (p.type === 'fountain') {
      cyls.add(p.x, 0.6, p.z, 8.8, 1.2, 8.8, '#e8dcc0');
      glow.add(p.x, 1.3, p.z, 7.6, 0.12, 7.6, '#3fb6d6');
      cyls.add(p.x, 3, p.z, 1.2, 6, 1.2, GOLD);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        cyls.add(p.x + Math.cos(a) * 6.6, 3.9, p.z + Math.sin(a) * 6.6, 0.5, 7.5, 0.5, CREAM);
      }
      domes.add(p.x, 7.6, p.z, 7.6, 0.45 * 7.6, 7.6, GOLD);
    } else {
      boxes.add(p.x, spec.h / 2, p.z, spec.hx * 2, spec.h, spec.hz * 2, PROP_LOOK[p.type] ?? CREAM);
      if (p.type === 'pier') boxes.add(p.x, HALL_H - 2, p.z, spec.hx * 2 + 1, 1.2, spec.hz * 2 + 1, GOLD);
    }
  }

  // ---------------------------------------------------------------- mihrab dan lampu gantung aula
  const north = ROOMS[0].rect[1];
  boxes.add(0, 10, north + 0.9, 16, 20, 0.8, GOLD);
  boxes.add(0, 8, north + 1.0, 11, 16, 0.9, '#2a2f2a');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    glow.add(CENTRAL_DOME.x + Math.cos(a) * 26, 23, CENTRAL_DOME.z + Math.sin(a) * 26, 1.6, 1.6, 1.6, '#ffe2a0');
  }
  glow.add(CENTRAL_DOME.x, 31, CENTRAL_DOME.z, 3.2, 3.2, 3.2, '#ffe2a0');
  for (let x = -147; x <= 147; x += 42) {
    for (let z = -207; z <= -57; z += 50) {
      if (Math.abs(x) < 50 && z > -195 && z < -85) continue;
      glow.add(x, 22, z, 1.3, 1.3, 1.3, '#ffe2a0');
    }
  }

  // ---------------------------------------------------------------- kubah kecil, menara, gerbang
  for (const d of world.domes) domes.add(d.x, d.y, d.z, d.r, d.r * d.sy, d.r, d.tone === 'gold' ? GOLD : '#f2ead8');
  for (const m of MINARETS) {
    boxes.add(m.x, 30, m.z, m.half * 2, 60, m.half * 2, CREAM);
    boxes.add(m.x, 60.5, m.z, m.half * 2 + 1.4, 1, m.half * 2 + 1.4, GOLD);
    cyls.add(m.x, 80, m.z, 3.4, 40, 3.4, CREAM);
    cyls.add(m.x, 100.5, m.z, 4.6, 1.2, 4.6, GOLD);
    cyls.add(m.x, 115, m.z, 2.6, 30, 2.6, CREAM);
    cyls.add(m.x, 130.5, m.z, 3.6, 1.2, 3.6, GOLD);
    cyls.add(m.x, 135, m.z, 1.9, 8, 1.9, CREAM);
    cones.add(m.x, 144, m.z, 3, 12, 3, TEAL);
    balls.add(m.x, 151.5, m.z, 1.2, 1.2, 1.2, GOLD);
  }
  for (const t of GATE_TOWERS) {
    boxes.add(t.x, t.height / 2, t.z, t.hx * 2, t.height, t.hz * 2, '#d9cba8');
    domes.add(t.x, t.height, t.z, Math.max(t.hx, t.hz) * 1.05, Math.max(t.hx, t.hz) * 0.8, Math.max(t.hx, t.hz) * 1.05, GOLD);
  }
  boxes.add(0, 24, BOUNDS.maxZ, 52, 4, 3, '#d9cba8'); // balok di atas gerbang selatan
  boxes.add(BOUNDS.maxX, 24, 60, 3, 4, 26, '#d9cba8');
  boxes.add(BOUNDS.minX, 24, 60, 3, 4, 26, '#d9cba8');

  for (const b of [boxes, cyls, cones, balls, domes, glow]) b.build(root);

  // ---------------------------------------------------------------- kubah utama (bagian dalamnya terlihat dari aula)
  const cd = CENTRAL_DOME;
  const domeTex = canvasTexture([128, 128], domeDraw, renderer, [24, 2]);
  const domeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: domeTex, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }),
  );
  domeMesh.scale.set(cd.radius, cd.radius * cd.squash, cd.radius);
  domeMesh.position.set(cd.x, HALL_H + cd.drumH, cd.z);
  root.add(domeMesh);
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(cd.radius, cd.radius, cd.drumH, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.8, side: THREE.DoubleSide }),
  );
  drum.position.set(cd.x, HALL_H + cd.drumH / 2, cd.z);
  root.add(drum);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(cd.radius, 0.7, 8, 72), new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.5, metalness: 0.2 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(cd.x, HALL_H + cd.drumH, cd.z);
  root.add(ring);
  const top = HALL_H + cd.drumH + cd.radius * cd.squash;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 10), new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.5 }));
  finial.position.set(cd.x, top + 1.5, cd.z);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.1, 12, 12), new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.5 }));
  spire.position.set(cd.x, top + 8, cd.z);
  root.add(finial, spire);

  return {
    root,
    /** k = 0 di luar, 1 di dalam bangunan: dalam ruangan cahaya langit dikurangi (lampu mengikuti pemain dari main). */
    setIndoor(k) {
      hemi.intensity = 1.0 - 0.35 * k;
      sun.intensity = 1.7 - 1.15 * k;
    },
  };
}
