import * as THREE from 'three';
import { HALL_SEATING, WALL_HEIGHT, WALL_THICKNESS } from './villa-layout.js';

const FLOOR_COLORS = {
  hall: 0xece4d4, lobby: 0xd9cbb0, suite: 0xa9805a, spa: 0xa6cdc8, bridal: 0xecd2da,
  restaurant: 0xbf9f7c, kitchen: 0xc3c8ca, corridor: 0xcdbb9c, guest: 0xd4bc96,
};
const dummy = new THREE.Object3D();

function standard(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.02, ...extra });
}

function instanced(geometry, material, items, { castShadow = true, receiveShadow = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  mesh.count = items.length;
  const color = new THREE.Color();
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y ?? 0, it.z);
    dummy.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    dummy.rotation.set(0, it.ry ?? 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (it.color !== undefined) mesh.setColorAt(i, color.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function box(w, h, d, color, x, y, z, parent, extra) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), standard(color, extra));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function flat(rect, color, y, parent, extra) {
  const [x1, z1, x2, z2] = rect;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), standard(color, extra));
  m.rotation.x = -Math.PI / 2;
  m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function label(text, x, z) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 38px ui-sans-serif, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(20,28,26,0.62)';
  ctx.beginPath();
  ctx.roundRect(8, 12, 496, 72, 24);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 256, 61);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
  sprite.scale.set(5.2, 0.98, 1);
  sprite.position.set(x, WALL_HEIGHT + 0.7, z);
  return sprite;
}

function buildWalls(world, parent) {
  const items = world.walls.map((w) => {
    const len = w.b - w.a;
    return w.orient === 'h'
      ? { x: (w.a + w.b) / 2, z: w.coord, sx: len, sy: WALL_HEIGHT, sz: WALL_THICKNESS }
      : { x: w.coord, z: (w.a + w.b) / 2, sx: WALL_THICKNESS, sy: WALL_HEIGHT, sz: len };
  });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mesh = instanced(geo, standard(0xf6f0e2, { roughness: 0.85 }), items);
  parent.add(mesh);
  // lis bawah gelap supaya dinding terbaca dari atas
  const trim = items.map((i) => ({ ...i, sy: 0.18, sx: i.sx + 0.02, sz: i.sz + 0.02 }));
  parent.add(instanced(geo, standard(0x6b5a48), trim, { castShadow: false }));

  // Dinding yang membentang timur-barat di sisi selatan pemain (antara kamera dan pemain)
  // direndahkan supaya isi ruangan tetap terlihat; dinding lain tetap penuh.
  const heights = items.map(() => WALL_HEIGHT);
  const LOW = 0.45;
  return (px, pz, delta) => {
    let changed = false;
    world.walls.forEach((w, i) => {
      const blocks = w.orient === 'h' && w.coord > pz + 0.4 && w.coord - pz < 10 && px > w.a - 3 && px < w.b + 3;
      const target = blocks ? LOW : WALL_HEIGHT;
      if (Math.abs(heights[i] - target) < 0.002) return;
      heights[i] += (target - heights[i]) * Math.min(1, delta * 9);
      const it = items[i];
      dummy.position.set(it.x, 0, it.z);
      dummy.scale.set(it.sx, heights[i], it.sz);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      changed = true;
    });
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  };
}

function buildPerimeter(world, parent) {
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const h = 1.1;
  const color = 0xcfc6b4;
  const gate = 3.2;
  box(maxX - minX, h, 0.5, color, 0, h / 2, minZ, parent);
  box(0.5, h, maxZ - minZ, color, minX, h / 2, (minZ + maxZ) / 2, parent);
  box(0.5, h, maxZ - minZ, color, maxX, h / 2, (minZ + maxZ) / 2, parent);
  const half = (maxX - minX) / 2;
  box(half - gate, h, 0.5, color, -(gate + (half - gate) / 2), h / 2, maxZ, parent);
  box(half - gate, h, 0.5, color, gate + (half - gate) / 2, h / 2, maxZ, parent);
  for (const sx of [-gate, gate]) box(0.8, 2.2, 0.8, 0xe4dccb, sx, 1.1, maxZ, parent);
}

function buildHall(parent) {
  const z1 = -20; // dinding utara aula
  flat([-1.5, -19.6, 1.5, -3], 0xffffff, 0.035, parent); // karpet lorong
  // pelaminan
  box(10, 0.15, 3.6, 0xd9b873, 0, 0.075, z1 + 2.3, parent);
  box(4, 0.9, 0.9, 0xb23a48, 0, 0.6, z1 + 1.2, parent); // sofa pengantin
  box(0.5, 0.5, 0.5, 0xb23a48, -1.8, 0.4, z1 + 1.2, parent);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.14, 8, 32, Math.PI), standard(0xfff5f0));
  arch.position.set(0, 0.15, z1 + 3.9);
  arch.castShadow = true;
  parent.add(arch);
  const flowers = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI;
    flowers.push({ x: Math.cos(a) * 2.6, y: 0.15 + Math.sin(a) * 2.6, z: z1 + 3.9, sx: 0.28, sy: 0.28, sz: 0.28, color: i % 2 ? 0xf6a5b8 : 0xffffff });
  }
  parent.add(instanced(new THREE.SphereGeometry(1, 10, 8), standard(0xffffff), flowers));

  // kursi tamu
  const { z0, z1: zEnd, rowStep, xInner, xOuter, colStep } = HALL_SEATING;
  const seats = [];
  for (let z = z0; z <= zEnd + 1e-6; z += rowStep) {
    for (let x = xInner; x <= xOuter + 1e-6; x += colStep) {
      seats.push({ x, z }, { x: -x, z });
    }
  }
  const seat = instanced(new THREE.BoxGeometry(0.5, 0.08, 0.5), standard(0xf7f1e6), seats.map((s) => ({ ...s, y: 0.46 })));
  const back = instanced(new THREE.BoxGeometry(0.5, 0.5, 0.06), standard(0xf7f1e6), seats.map((s) => ({ ...s, y: 0.72, z: s.z + 0.22 })));
  const leg = instanced(new THREE.BoxGeometry(0.4, 0.42, 0.4), standard(0xcbbfa8), seats.map((s) => ({ ...s, y: 0.21 })), { castShadow: false });
  parent.add(seat, back, leg);
  // bunga di ujung lorong
  const petals = [];
  for (let z = z0; z <= zEnd + 1e-6; z += rowStep) petals.push({ x: 2.3, y: 0.5, z, sx: 0.16, sy: 0.16, sz: 0.16, color: 0xf6a5b8 }, { x: -2.3, y: 0.5, z, sx: 0.16, sy: 0.16, sz: 0.16, color: 0xf6a5b8 });
  parent.add(instanced(new THREE.SphereGeometry(1, 8, 6), standard(0xffffff), petals, { castShadow: false }));
}

function buildPoolAndGarden(parent) {
  const water = flat([-7, 2, 7, 16], 0x39c3df, 0.05, parent, { roughness: 0.15, metalness: 0.1, emissive: 0x0b6f86, emissiveIntensity: 0.55 });
  water.name = 'pool-water';
  box(14.6, 0.25, 0.3, 0xf3efe6, 0, 0.12, 1.85, parent);
  box(14.6, 0.25, 0.3, 0xf3efe6, 0, 0.12, 16.15, parent);
  box(0.3, 0.25, 14.3, 0xf3efe6, -7.15, 0.12, 9, parent);
  box(0.3, 0.25, 14.3, 0xf3efe6, 7.15, 0.12, 9, parent);
  box(3, 0.22, 14, 0xfaf6ee, 0, 0.11, 9, parent); // jembatan
  for (let z = 3; z <= 15; z += 3) {
    box(0.18, 0.7, 0.18, 0xffffff, -1.4, 0.55, z, parent);
    box(0.18, 0.7, 0.18, 0xffffff, 1.4, 0.55, z, parent);
  }
  // air mancur
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.5, 0.45, 32), standard(0xd9d2c3));
  base.position.set(0, 0.22, 28);
  base.castShadow = true;
  parent.add(base);
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.1, 32), standard(0x39c3df, { emissive: 0x0b6f86, emissiveIntensity: 0.5 }));
  pool.position.set(0, 0.47, 28);
  parent.add(pool);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 1.8, 16), standard(0xe9e3d6));
  column.position.set(0, 1.2, 28);
  column.castShadow = true;
  parent.add(column);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), standard(0xbfeaf5, { emissive: 0x6fc9de, emissiveIntensity: 0.4 }));
  top.position.set(0, 2.2, 28);
  parent.add(top);
}

function buildProps(world, parent) {
  const by = (t) => world.props.filter((p) => p.type === t);
  // tempat tidur
  const beds = by('bed');
  parent.add(instanced(new THREE.BoxGeometry(1.8, 0.5, 2.1), standard(0xf4efe8), beds.map((b) => ({ x: b.x, y: 0.25, z: b.z }))));
  parent.add(instanced(new THREE.BoxGeometry(1.9, 1.0, 0.12), standard(0x7a5538), beds.map((b) => ({ x: b.x, y: 0.5, z: b.z + (b.z < 10 ? -1.08 : 1.08) }))));
  parent.add(instanced(new THREE.BoxGeometry(0.7, 0.14, 0.4), standard(0xffffff), beds.flatMap((b) => {
    const dz = b.z < 10 ? -0.75 : 0.75;
    return [{ x: b.x - 0.45, y: 0.57, z: b.z + dz }, { x: b.x + 0.45, y: 0.57, z: b.z + dz }];
  })));
  parent.add(instanced(new THREE.BoxGeometry(1.8, 0.1, 1.1), standard(0xc9a56a), beds.map((b) => ({ x: b.x, y: 0.55, z: b.z + (b.z < 10 ? 0.45 : -0.45) }))));
  // meja resepsionis, bak mandi spa, meja dapur
  by('desk').forEach((d) => box(3.6, 1.05, 1, 0x7a5538, d.x, 0.52, d.z, parent));
  by('tub').forEach((t) => {
    box(3, 0.7, 2, 0xf4f1ea, t.x, 0.35, t.z, parent);
    box(2.6, 0.06, 1.6, 0x66d3e0, t.x, 0.72, t.z, parent, { emissive: 0x2aa3b8, emissiveIntensity: 0.4 });
  });
  by('counter').forEach((c) => box(2.4, 0.95, 1, 0xaeb4b6, c.x, 0.47, c.z, parent, { metalness: 0.35 }));
  // meja restoran + kursi
  const tables = by('table');
  parent.add(instanced(new THREE.CylinderGeometry(0.8, 0.8, 0.07, 20), standard(0xf7f2e8), tables.map((t) => ({ x: t.x, y: 0.76, z: t.z }))));
  parent.add(instanced(new THREE.CylinderGeometry(0.08, 0.08, 0.74, 8), standard(0x5c4a3a), tables.map((t) => ({ x: t.x, y: 0.37, z: t.z })), { castShadow: false }));
  const chairs = tables.flatMap((t) => [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].map(([dx, dz]) => ({ x: t.x + dx, y: 0.3, z: t.z + dz })));
  parent.add(instanced(new THREE.BoxGeometry(0.45, 0.6, 0.45), standard(0x8a6a4a), chairs));
  // mobil di parkiran
  const palette = [0x1f2a36, 0xf2f2f0, 0x8e1b1b, 0x3a3f46, 0x274a7c, 0xb9bcc0, 0x1a1a1a, 0xe9e1cf];
  const cars = by('car');
  parent.add(instanced(new THREE.BoxGeometry(1.8, 0.7, 4.2), standard(0xffffff, { roughness: 0.35, metalness: 0.4 }), cars.map((c, i) => ({ x: c.x, y: 0.55, z: c.z, color: palette[i % palette.length] }))));
  parent.add(instanced(new THREE.BoxGeometry(1.6, 0.55, 2.2), standard(0x9fb8c6, { roughness: 0.1, metalness: 0.5 }), cars.map((c) => ({ x: c.x, y: 1.1, z: c.z + 0.1 }))));
  // pohon palem
  const palms = by('palm');
  const trunk = new THREE.CylinderGeometry(0.14, 0.22, 1, 8);
  trunk.translate(0, 0.5, 0);
  const heights = palms.map((_, i) => 3.4 + ((i * 7) % 5) * 0.35);
  parent.add(instanced(trunk, standard(0x8a6a45), palms.map((p, i) => ({ x: p.x, z: p.z, sy: heights[i] }))));
  const crown = new THREE.SphereGeometry(1, 10, 8);
  parent.add(instanced(crown, standard(0x2f8a45), palms.map((p, i) => ({ x: p.x, y: heights[i], z: p.z, sx: 1.35, sy: 0.5, sz: 1.35 }))));
}

/** Membangun seluruh vila ke dalam scene. Mengembalikan fungsi update untuk bayangan. */
export function buildVillaWorld(scene, world) {
  const root = new THREE.Group();
  scene.add(root);
  scene.background = new THREE.Color(0xa9d4ee);
  scene.fog = new THREE.Fog(0xa9d4ee, 70, 160);

  root.add(new THREE.HemisphereLight(0xf2f7ff, 0x8a9a70, 1.9));
  const sun = new THREE.DirectionalLight(0xfff3dc, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 120 });
  sun.shadow.bias = -0.0004;
  root.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), standard(0x5a9a4e, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // area paving
  for (const z of world.zones) {
    if (z.kind === 'courtyard') flat(z.rect, 0xd7c9ae, 0.012, root);
    if (z.kind === 'parking') flat(z.rect, 0x41444a, 0.012, root);
  }
  flat([-2.5, 16, 2.5, 42], 0xdcd0b8, 0.014, root); // jalan dari gerbang ke jembatan
  flat([-5, 22, 5, 34], 0xe6dcc6, 0.016, root); // plaza air mancur
  for (const r of world.rooms) flat(r.rect, FLOOR_COLORS[r.kind] ?? 0xdddddd, 0.03, root);

  const updateWalls = buildWalls(world, root);
  buildPerimeter(world, root);
  buildHall(root);
  buildPoolAndGarden(root);
  buildProps(world, root);

  for (const r of world.rooms) {
    if (r.kind === 'corridor' || r.kind === 'guest') continue;
    const sprite = label(r.name, (r.rect[0] + r.rect[2]) / 2, r.rect[1] + 1.6);
    if (sprite) root.add(sprite);
  }
  for (const [text, x, z] of [['Pool & Garden', -3.5, 7], ['Parking Area', 30, 33], ['Guest Rooms', 27, 13]]) {
    const sprite = label(text, x, z);
    if (sprite) root.add(sprite);
  }

  return {
    root,
    update(px, pz, delta = 0.016) {
      updateWalls(px, pz, delta);
      sun.position.set(px + 22, 42, pz + 16);
      sun.target.position.set(px, 0, pz);
      sun.target.updateMatrixWorld();
    },
  };
}
