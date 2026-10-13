import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { COUNTRYSIDE, HALL_SEATING, LEVEL_HEIGHT, STAIRS, WALL_HEIGHT, WALL_THICKNESS, hallChairPositions, levelY } from './villa-layout.js';
import {
  PALM_BEND, bedGeometries, broadleafTreeGeometry, carGeometries, chairGeometry, frondGeometry, lanternPostGeometry,
  loungerGeometry, merge, palmTrunkGeometry, part, potPlantGeometry, shrubGeometry,
} from './villa-props.js';
import {
  asphaltTexture, frondTexture, grassTexture, marbleTexture, parquetTexture, poolTileTexture, rng, rugTexture,
  stoneTexture, waterNormalTexture,
} from './villa-textures.js';

const SUN_DIR = new THREE.Vector3(22, 42, 16).normalize();
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
}

function instanced(geometry, material, items, { castShadow = true, receiveShadow = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  mesh.count = items.length;
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y ?? 0, it.z);
    dummy.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
    dummy.rotation.set(0, it.ry ?? 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (it.color !== undefined) mesh.setColorAt(i, tint.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function block(w, h, d, material, x, y, z, parent, { cast = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Bidang datar [x1,z1,x2,z2] di ketinggian y; `tile` = ukuran (m) satu pengulangan tekstur. */
function flat(rect, material, y, parent, tile) {
  const [x1, z1, x2, z2] = rect;
  const w = x2 - x1;
  const h = z2 - z1;
  const g = new THREE.PlaneGeometry(w, h);
  if (tile) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  }
  const m = new THREE.Mesh(g, material);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Bidang tegak lurus: w x h di titik (x,y,z), menghadap arah ry. */
function wallPlane(w, h, tile, material, x, y, z, ry, parent) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  parent.add(m);
}

function label(text, x, z) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 38px ui-sans-serif, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(20,28,26,0.5)';
  ctx.beginPath();
  ctx.roundRect(8, 12, 496, 72, 24);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 256, 61);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, opacity: 0.85, depthWrite: false }));
  sprite.scale.set(4.4, 0.83, 1);
  sprite.position.set(x, WALL_HEIGHT + 0.7, z);
  return sprite;
}

function leafDepthMaterial(map) {
  return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.45 });
}

// ------------------------------------------------------------------ dinding
function buildWalls(walls, parent, mats) {
  const items = walls.map((w) => {
    const len = w.b - w.a;
    return w.orient === 'h'
      ? { x: (w.a + w.b) / 2, z: w.coord, sx: len, sy: WALL_HEIGHT, sz: WALL_THICKNESS }
      : { x: w.coord, z: (w.a + w.b) / 2, sx: WALL_THICKNESS, sy: WALL_HEIGHT, sz: len };
  });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mesh = instanced(geo, mats.plaster, items);
  parent.add(mesh);
  parent.add(instanced(geo, mats.skirting, items.map((i) => ({ ...i, sy: 0.16, sx: i.sx + 0.05, sz: i.sz + 0.05 })), { castShadow: false }));
  const cap = instanced(geo, mats.cornice, items.map((i) => ({ ...i, y: WALL_HEIGHT - 0.1, sy: 0.1, sx: i.sx + 0.08, sz: i.sz + 0.08 })));
  parent.add(cap);

  // Dinding timur-barat di selatan pemain (antara kamera dan pemain) direndahkan agar isi ruangan terlihat.
  const heights = items.map(() => WALL_HEIGHT);
  const LOW = 0.45;
  return (px, pz, delta, active = true, camDir = { x: 0, z: 1 }, pitch = 0.9) => {
    let changed = false;
    walls.forEach((w, i) => {
      // titik dinding terdekat dari pemain; dirunduk bila berada di sisi kamera dan cukup dekat
      const cx = w.orient === 'h' ? Math.min(w.b, Math.max(w.a, px)) : w.coord;
      const cz = w.orient === 'h' ? w.coord : Math.min(w.b, Math.max(w.a, pz));
      const vx = cx - px;
      const vz = cz - pz;
      const dist = Math.hypot(vx, vz);
      const blocks = active && pitch < 1.3 && dist < 11 && vx * camDir.x + vz * camDir.z > 0.25 * dist + 0.3;
      const target = blocks ? LOW : WALL_HEIGHT;
      if (Math.abs(heights[i] - target) < 0.002) return;
      heights[i] += (target - heights[i]) * Math.min(1, delta * 9);
      const it = items[i];
      dummy.position.set(it.x, 0, it.z);
      dummy.scale.set(it.sx, heights[i], it.sz);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(it.x, Math.max(0.05, heights[i] - 0.1), it.z);
      dummy.scale.set(it.sx + 0.08, 0.1, it.sz + 0.08);
      dummy.updateMatrix();
      cap.setMatrixAt(i, dummy.matrix);
      changed = true;
    });
    if (changed) {
      mesh.instanceMatrix.needsUpdate = true;
      cap.instanceMatrix.needsUpdate = true;
    }
  };
}

function buildDoors(doors, parent, mats) {
  for (const d of doors) {
    const along = d.orient === 'h' ? [d.width, 0.03, 0.55] : [0.55, 0.03, d.width];
    block(along[0], along[1], along[2], mats.brass, d.x, 0.04, d.z, parent, { cast: false });
  }
}

function buildPerimeter(world, parent, mats, rand) {
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const h = 1.35;
  const gate = 3.2;
  const half = (maxX - minX) / 2;
  const segs = [
    [maxX - minX, 0.5, 0, minZ, 0], [0.5, maxZ - minZ, minX, (minZ + maxZ) / 2, 1], [0.5, maxZ - minZ, maxX, (minZ + maxZ) / 2, 1],
    [half - gate, 0.5, -(gate + (half - gate) / 2), maxZ, 0], [half - gate, 0.5, gate + (half - gate) / 2, maxZ, 0],
  ];
  for (const [w, d, x, z] of segs) {
    block(w, h, d, mats.plasterOuter, x, h / 2, z, parent);
    block(w + 0.14, 0.12, d + 0.14, mats.stoneCap, x, h + 0.06, z, parent);
  }
  const lamps = [];
  const pillar = (x, z) => {
    block(0.8, 1.9, 0.8, mats.plasterOuter, x, 0.95, z, parent);
    block(0.95, 0.12, 0.95, mats.stoneCap, x, 1.96, z, parent);
    lamps.push({ x, y: 2.3, z });
  };
  for (let x = minX + 7; x < maxX - 6; x += 7) {
    if (Math.abs(x) > gate + 1.5) pillar(x, maxZ);
    pillar(x, minZ);
  }
  for (let z = minZ + 7; z < maxZ - 6; z += 7) {
    pillar(minX, z);
    pillar(maxX, z);
  }
  for (const sx of [-gate, gate]) {
    block(0.9, 2.4, 0.9, mats.plasterOuter, sx, 1.2, maxZ, parent);
    block(1.05, 0.14, 1.05, mats.stoneCap, sx, 2.47, maxZ, parent);
    lamps.push({ x: sx, y: 2.8, z: maxZ });
  }
  parent.add(instanced(new THREE.SphereGeometry(0.17, 10, 8), mats.lampGlow, lamps.map((l) => ({ ...l })), { castShadow: false }));
  return rand;
}

// -------------------------------------------------------------------- aula
function buildHall(parent, mats, rand) {
  const z1 = -20; // dinding utara aula
  // karpet lorong + garis emas
  flat([-1.5, -19.6, 1.5, -3], mats.runner, 0.04, parent);
  for (const x of [-1.42, 1.42]) flat([x - 0.04, -19.6, x + 0.04, -3], mats.gold, 0.045, parent);

  // pelaminan: panggung kayu, tangga, sofa, gapura bunga
  block(10, 0.15, 3.6, mats.stageBody, 0, 0.075, z1 + 2.3, parent);
  flat([-5, z1 + 0.5, 5, z1 + 4.1], mats.stageTop, 0.153, parent, 2);
  block(3.2, 0.09, 0.5, mats.stageBody, 0, 0.045, z1 + 4.35, parent);
  const sofa = merge([
    part(new THREE.BoxGeometry(4, 0.4, 0.95), '#a8303f', { y: 0.35 }),
    part(new THREE.BoxGeometry(4, 0.8, 0.28), '#a8303f', { y: 0.75, z: -0.34 }),
    part(new THREE.BoxGeometry(0.3, 0.6, 0.95), '#962a38', { x: -1.85, y: 0.5 }),
    part(new THREE.BoxGeometry(0.3, 0.6, 0.95), '#962a38', { x: 1.85, y: 0.5 }),
    ...[-1.8, 1.8].map((x) => part(new THREE.BoxGeometry(0.1, 0.16, 0.1), '#d4a84b', { x, y: 0.08, z: 0.35 })),
  ]);
  parent.add(instanced(sofa, mats.vertex(0.8), [{ x: 0, y: 0.15, z: z1 + 1.35 }]));
  const arch = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 8, 40, Math.PI), mats.white);
  arch.position.set(0, 0.15, z1 + 3.9);
  arch.castShadow = true;
  parent.add(arch);
  for (const x of [-2.6, 2.6]) block(0.24, 0.2, 0.24, mats.gold, x, 0.25, z1 + 3.9, parent);
  const flowers = [];
  const leaves = [];
  for (let i = 0; i <= 44; i++) {
    const a = (i / 44) * Math.PI;
    const r = 2.6 + (rand() - 0.5) * 0.3;
    const p = { x: Math.cos(a) * r, y: 0.15 + Math.sin(a) * r, z: z1 + 3.9 + (rand() - 0.5) * 0.3 };
    leaves.push({ ...p, s: 0.22 + rand() * 0.12, color: rand() < 0.5 ? 0x3f7d36 : 0x56934a });
    flowers.push({ ...p, y: p.y + 0.05, z: p.z + 0.12, s: 0.12 + rand() * 0.08, color: [0xf6a5b8, 0xffffff, 0xf9d2c4, 0xe58fa8][i % 4] });
  }
  parent.add(instanced(new THREE.IcosahedronGeometry(1, 1), mats.leaf, leaves));
  parent.add(instanced(new THREE.IcosahedronGeometry(1, 1), mats.petal, flowers));

  // dinding hijau + gorden di belakang pelaminan
  const wall = [];
  const bloom = [];
  for (let i = 0; i < 230; i++) {
    const p = { x: -3.1 + rand() * 6.2, y: 0.4 + rand() * 2.0, z: z1 + 0.28 + rand() * 0.1 };
    wall.push({ ...p, s: 0.2 + rand() * 0.14, color: [0x2f6a30, 0x3f7d36, 0x4d8c3d][i % 3] });
    if (i % 4 === 0) bloom.push({ ...p, z: p.z + 0.1, s: 0.1 + rand() * 0.06, color: [0xffffff, 0xf6a5b8, 0xf9d2c4][i % 3] });
  }
  parent.add(instanced(new THREE.IcosahedronGeometry(1, 1), mats.leaf, wall, { castShadow: false }));
  parent.add(instanced(new THREE.IcosahedronGeometry(1, 1), mats.petal, bloom, { castShadow: false }));
  for (const sx of [-1, 1]) {
    const g = new THREE.PlaneGeometry(2.4, 2.4, 40, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 11) * 0.08);
    g.computeVertexNormals();
    const curtain = new THREE.Mesh(g, mats.curtain);
    curtain.position.set(sx * 4.3, 1.35, z1 + 0.3);
    curtain.castShadow = true;
    parent.add(curtain);
  }

  // kursi tamu (hadap panggung, -z)
  const { z0, z1: zEnd, rowStep } = HALL_SEATING;
  const seats = hallChairPositions().map((c) => ({ ...c, ry: Math.PI }));
  const rows = [];
  for (let z = z0; z <= zEnd + 1e-6; z += rowStep) rows.push(z);
  parent.add(instanced(chairGeometry(), mats.vertex(0.55), seats));

  // lampion lantai + standing flower di sepanjang lorong
  const lanterns = [];
  const stands = [];
  const bouquet = bouquetGeometry(rand);
  rows.forEach((z, i) => {
    lanterns.push({ x: 1.72, y: 0.15, z }, { x: -1.72, y: 0.15, z });
    if (i % 2 === 0) stands.push({ x: 2.0, y: 0.95, z, s: 1.4 }, { x: -2.0, y: 0.95, z, s: 1.4 });
  });
  parent.add(instanced(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), mats.lanternGlow, lanterns, { castShadow: false }));
  parent.add(instanced(bouquet, mats.vertex(0.6), stands));
  parent.add(instanced(new THREE.CylinderGeometry(0.03, 0.05, 0.9, 8), mats.gold, stands.map((s) => ({ ...s, y: 0.45, s: 1 }))));
}

function bouquetGeometry(rand) {
  const parts = [part(new THREE.CylinderGeometry(0.06, 0.08, 0.2, 10), '#d9d2c3', { y: 0.1 })];
  const colors = ['#f6a5b8', '#ffffff', '#f9d2c4', '#e58fa8', '#fff1b8'];
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.11;
    parts.push(part(new THREE.IcosahedronGeometry(1, 1), colors[i % colors.length], { x: Math.cos(a) * r, y: 0.28 + rand() * 0.08, z: Math.sin(a) * r, sx: 0.075, sy: 0.075, sz: 0.075 }));
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(part(new THREE.IcosahedronGeometry(1, 0), '#3f7d36', { x: Math.cos(a) * 0.12, y: 0.24, z: Math.sin(a) * 0.12, sx: 0.07, sy: 0.04, sz: 0.07 }));
  }
  return merge(parts);
}

// ------------------------------------------------------------ kolam + taman
function buildPoolAndGarden(parent, mats, anim) {
  const depth = -1.1;
  // dasar dan dinding kolam berubin
  flat([-7, 2, 7, 16], mats.poolTile, depth, parent, 2);
  wallPlane(14, 1.1, 2, mats.poolTile, 0, depth / 2, 2, 0, parent);
  wallPlane(14, 1.1, 2, mats.poolTile, 0, depth / 2, 16, Math.PI, parent);
  wallPlane(14, 1.1, 2, mats.poolTile, -7, depth / 2, 9, Math.PI / 2, parent);
  wallPlane(14, 1.1, 2, mats.poolTile, 7, depth / 2, 9, -Math.PI / 2, parent);
  // permukaan air
  const water = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), mats.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.14, 9);
  water.renderOrder = 2;
  water.name = 'pool-water';
  parent.add(water);
  // bibir kolam dari batu
  block(15.2, 0.12, 0.5, mats.limestone, 0, 0.06, 1.75, parent);
  block(15.2, 0.12, 0.5, mats.limestone, 0, 0.06, 16.25, parent);
  block(0.5, 0.12, 14, mats.limestone, -7.25, 0.06, 9, parent);
  block(0.5, 0.12, 14, mats.limestone, 7.25, 0.06, 9, parent);
  // dek di sekeliling
  flat([-9.3, 4, -7.5, 17.6], mats.deck, 0.014, parent, 3);
  flat([7.5, 4, 9.3, 17.6], mats.deck, 0.014, parent, 3);
  flat([-9.3, 16.5, 9.3, 17.6], mats.deck, 0.014, parent, 3);

  // jembatan kayu + pagar
  block(3, 0.22, 14, mats.limestone, 0, 0.11, 9, parent);
  flat([-1.4, 2.2, 1.4, 15.8], mats.bridgeWood, 0.224, parent, 3);
  for (const sx of [-1.4, 1.4]) {
    block(0.07, 0.07, 14, mats.white, sx, 0.98, 9, parent, { cast: false });
    block(0.05, 0.05, 14, mats.white, sx, 0.62, 9, parent, { cast: false });
    for (let z = 2.2; z <= 15.9; z += 1.9) block(0.1, 0.78, 0.1, mats.white, sx, 0.6, z, parent);
  }
  // lounger + payung
  const loungers = [];
  const towels = [];
  const umbrellas = [];
  for (const sx of [-1, 1]) {
    for (const z of [5.2, 6.5, 11.5, 12.8]) {
      loungers.push({ x: sx * 8.35, y: 0.014, z });
      towels.push({ x: sx * 8.35, y: 0.455, z: z + 0.15, sx: 0.5, sy: 0.02, sz: 0.7, color: [0xf6a5b8, 0x6ec6d9, 0xf4d58d, 0xffffff][(z * 3) % 4 | 0] });
    }
    umbrellas.push({ x: sx * 8.6, z: 9 });
  }
  parent.add(instanced(loungerGeometry(), mats.vertex(0.6), loungers));
  parent.add(instanced(new THREE.BoxGeometry(1, 1, 1), mats.towel, towels, { castShadow: false }));
  parent.add(instanced(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 8), mats.gold, umbrellas.map((u) => ({ ...u, y: 1.15 }))));
  parent.add(instanced(new THREE.ConeGeometry(1.5, 0.45, 12, 1, true), mats.umbrella, umbrellas.map((u) => ({ ...u, y: 2.35 }))));

  // air mancur bertingkat
  const stone = mats.limestone;
  const cx = 0;
  const cz = 28;
  const basin = new THREE.LatheGeometry([[0.01, 0], [2.65, 0], [2.65, 0.52], [2.45, 0.56], [2.4, 0.45], [2.25, 0.4], [0.01, 0.4]].map(([x, y]) => new THREE.Vector2(x, y)), 40);
  const basinMesh = new THREE.Mesh(basin, stone);
  basinMesh.position.set(cx, 0, cz);
  basinMesh.castShadow = basinMesh.receiveShadow = true;
  parent.add(basinMesh);
  const lower = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), mats.fountainWater);
  lower.rotation.x = -Math.PI / 2;
  lower.position.set(cx, 0.37, cz);
  parent.add(lower);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.35, 16), stone);
  pillar.position.set(cx, 0.95, cz);
  pillar.castShadow = true;
  parent.add(pillar);
  const bowl = new THREE.LatheGeometry([[0.01, 0], [1.15, 0.12], [1.3, 0.34], [1.18, 0.34], [1.1, 0.22], [0.01, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)), 32);
  const bowlMesh = new THREE.Mesh(bowl, stone);
  bowlMesh.position.set(cx, 1.5, cz);
  bowlMesh.castShadow = true;
  parent.add(bowlMesh);
  const upper = new THREE.Mesh(new THREE.CircleGeometry(1.12, 32), mats.fountainWater);
  upper.rotation.x = -Math.PI / 2;
  upper.position.set(cx, 1.82, cz);
  parent.add(upper);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.16, 0.9, 12), stone);
  spire.position.set(cx, 2.3, cz);
  parent.add(spire);

  // percikan air (titik-titik yang mengikuti lintasan parabola)
  const drops = 140;
  const dropGeo = new THREE.BufferGeometry();
  const dropPos = new Float32Array(drops * 3);
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const params = Array.from({ length: drops }, (_, i) => ({
    angle: (i / drops) * Math.PI * 2 * 7.3,
    speed: 1.3 + ((i * 37) % 10) / 10,
    lift: 2.6 + ((i * 53) % 10) / 12,
    phase: (i % 20) / 20,
  }));
  const drip = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0xeaffff, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }));
  drip.frustumCulled = false;
  parent.add(drip);
  anim.push((time) => {
    params.forEach((p, i) => {
      const t = (time * 0.7 + p.phase) % 1;
      const r = p.speed * t * 1.15;
      const y = 2.75 + p.lift * t - 4.4 * t * t * 1.45;
      const high = i % 3 === 0;
      dropPos[i * 3] = cx + Math.cos(p.angle) * r * (high ? 0.35 : 1);
      dropPos[i * 3 + 1] = Math.max(1.84, y * (high ? 1.0 : 0.62) + (high ? 0 : 0.45));
      dropPos[i * 3 + 2] = cz + Math.sin(p.angle) * r * (high ? 0.35 : 1);
    });
    dropGeo.attributes.position.needsUpdate = true;
  });
}

// ----------------------------------------------------------------- tanaman
function buildPalms(world, parent, mats) {
  const palms = world.props.filter((p) => p.type === 'palm');
  const rand = rng(5);
  const heights = palms.map((_, i) => 4.0 + ((i * 7) % 5) * 0.4);
  const turns = palms.map(() => rand() * Math.PI * 2);
  parent.add(instanced(palmTrunkGeometry(), mats.vertex(0.9), palms.map((p, i) => ({ x: p.x, z: p.z, sy: heights[i], ry: turns[i] }))));
  const fronds = [];
  const nuts = [];
  palms.forEach((p, i) => {
    const bend = PALM_BEND * Math.cos(turns[i]);
    const bendZ = -PALM_BEND * Math.sin(turns[i]);
    const top = { x: p.x + bend, y: heights[i], z: p.z + bendZ };
    const count = 11;
    for (let k = 0; k < count; k++) {
      const shade = 0.78 + rand() * 0.4;
      fronds.push({
        x: top.x, y: top.y - 0.05 + (k % 2) * 0.1, z: top.z,
        ry: (k / count) * Math.PI * 2 + rand() * 0.4,
        s: 0.85 + rand() * 0.3,
        color: new THREE.Color(shade * 0.9, shade, shade * 0.85).getHex(),
      });
    }
    for (let k = 0; k < 3; k++) nuts.push({ x: top.x + Math.cos(k * 2.1) * 0.16, y: top.y - 0.18, z: top.z + Math.sin(k * 2.1) * 0.16, s: 0.12 });
  });
  const frondMesh = instanced(frondGeometry(), mats.frond, fronds, { castShadow: true });
  frondMesh.customDepthMaterial = leafDepthMaterial(mats.frond.map);
  parent.add(frondMesh);
  parent.add(instanced(new THREE.IcosahedronGeometry(1, 1), mats.nut, nuts));
}

/** Jalan tanah dari gerbang dan pepohonan di luar vila (posisi sama dengan penghalang di layout). */
function buildCountryside(world, parent, mats, rand) {
  const trees = world.props.filter((p) => p.type === 'tree');
  const dirt = std(0xb59f7c, { roughness: 1 });
  flat([-COUNTRYSIDE.roadHalf, world.bounds.maxZ + 0.3, COUNTRYSIDE.roadHalf, COUNTRYSIDE.roadLength], dirt, 0.02, parent);
  const trunk = new THREE.CylinderGeometry(0.14, 0.24, 1, 7);
  trunk.translate(0, 0.5, 0);
  parent.add(instanced(trunk, std(0x5b4630, { roughness: 0.95 }), trees.map((t) => ({ x: t.x, z: t.z, sx: t.s, sy: t.s * 3.4, sz: t.s }))));
  const greens = [0x3f7d3c, 0x4f8f45, 0x35703a, 0x5b9a4a];
  const crown = new THREE.IcosahedronGeometry(1, 1);
  parent.add(instanced(crown, std(0xffffff, { roughness: 0.9 }), trees.map((t, i) => ({
    x: t.x, y: t.s * 3.6 + 0.9, z: t.z, sx: t.s * 1.9, sy: t.s * 1.6, sz: t.s * 1.9, ry: rand() * 6.28, color: greens[i % greens.length],
  }))));
  // semak rendah di sepanjang jalan supaya terasa seperti jalan desa
  const bushes = [];
  for (let z = world.bounds.maxZ + 8; z < 150; z += 6 + rand() * 4) {
    for (const side of [-1, 1]) bushes.push({ x: side * (COUNTRYSIDE.roadHalf + 1.2 + rand() * 1.5), z, s: 0.5 + rand() * 0.5, color: greens[Math.floor(rand() * 4)] });
  }
  parent.add(instanced(new THREE.IcosahedronGeometry(1, 1), std(0xffffff, { roughness: 0.9 }), bushes.map((b) => ({ x: b.x, y: b.s * 0.6, z: b.z, sx: b.s * 1.2, sy: b.s, sz: b.s * 1.2, color: b.color }))));
}

function buildGreenery(world, parent, mats, rand) {
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const palms = world.props.filter((p) => p.type === 'palm');
  const farFromPalm = (x, z, d = 1.8) => palms.every((p) => Math.hypot(p.x - x, p.z - z) > d);

  // semak sepanjang tembok keliling dan di tepi jalan masuk
  const shrubs = [];
  const add = (x, z, s = 1) => {
    if (farFromPalm(x, z)) shrubs.push({ x, z, s: s * (0.85 + rand() * 0.5), ry: rand() * 6.28 });
  };
  for (let x = minX + 1.4; x <= maxX - 1.4; x += 1.7) {
    add(x, minZ + 1.35);
    if (Math.abs(x) > 4.2) add(x, maxZ - 1.35);
  }
  for (let z = minZ + 3; z <= maxZ - 3; z += 1.7) {
    add(minX + 1.35, z);
    add(maxX - 1.35, z);
  }
  for (let z = 18; z <= 41; z += 2.2) {
    add(-3.5, z, 0.75);
    add(3.5, z, 0.75);
  }
  parent.add(instanced(shrubGeometry(), mats.vertex(0.9), shrubs));

  // bunga kecil di atas semak
  const petals = [];
  const colors = [0xf6a5b8, 0xffffff, 0xf9d2c4, 0xffe27a, 0xd98ae0];
  shrubs.forEach((s, i) => {
    if (i % 2) return;
    for (let k = 0; k < 6; k++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 0.5 * s.s;
      petals.push({ x: s.x + Math.cos(a) * r, y: 0.55 * s.s + rand() * 0.2, z: s.z + Math.sin(a) * r, s: 0.06, color: colors[(i + k) % colors.length] });
    }
  });
  parent.add(instanced(new THREE.IcosahedronGeometry(1, 0), mats.petal, petals, { castShadow: false }));

  // tanaman pot di sudut ruangan
  const spots = [[15, -19], [25, -19], [15, -4.5], [25, -4.5], [-13, -19], [13, -19], [-13, -4.5], [13, -4.5], [-35, 5], [-17, 5], [-35, 19], [-17, 19], [-25, -4.5], [-15, -4.5], [27, -4.5], [37, -4.5]];
  parent.add(instanced(potPlantGeometry(), mats.vertex(0.8), spots.map(([x, z]) => ({ x, z, s: 1, ry: rand() * 6 }))));

  // pohon di luar tembok + bukit jauh agar cakrawala tidak kosong
  const variants = [[], [], []];
  const span = (maxX - minX) + (maxZ - minZ);
  for (let d = 0; d < span * 2; d += 4.4) {
    const t = d % (span * 2);
    const out = 3.5 + rand() * 9;
    let x;
    let z;
    const w = maxX - minX;
    const h = maxZ - minZ;
    if (t < w) { x = minX + t; z = minZ - out; }
    else if (t < w + h) { x = maxX + out; z = minZ + (t - w); }
    else if (t < 2 * w + h) { x = maxX - (t - w - h); z = maxZ + out; }
    else { x = minX - out; z = maxZ - (t - 2 * w - h); }
    if (Math.abs(x) < 6 && z > maxZ) continue; // jangan menutup gerbang
    variants[(rand() * 3) | 0].push({ x, z, s: 0.9 + rand() * 0.8, ry: rand() * 6.28 });
  }
  variants.forEach((items, v) => parent.add(instanced(broadleafTreeGeometry(v), mats.vertex(0.9), items)));
  const hills = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand() * 0.3;
    const r = 115 + rand() * 40;
    hills.push({ x: Math.cos(a) * r, y: -6, z: Math.sin(a) * r + 8, sx: 45 + rand() * 35, sy: 14 + rand() * 12, sz: 45 + rand() * 35, color: 0x6f9b66 });
  }
  const hillMesh = instanced(new THREE.SphereGeometry(1, 14, 8), mats.hill, hills, { castShadow: false, receiveShadow: false });
  parent.add(hillMesh);
  return hillMesh; // bukit latar: ikut bergerak bersama pemain di luar vila supaya tetap di cakrawala
}

// ------------------------------------------------------------ properti ruang
function buildProps(propList, parent, mats, rand) {
  const by = (t) => propList.filter((p) => p.type === t);

  // tempat tidur lengkap dengan karpet
  const beds = by('bed');
  const bg = bedGeometries();
  const bedItems = beds.map((b) => ({ x: b.x, z: b.z, ry: b.z < 10 ? 0 : Math.PI }));
  const duvetColors = [0xe8d9c4, 0xc9d6df, 0xe9c9cf, 0xd8e0c9, 0xf1e6d0];
  parent.add(instanced(bg.base, mats.vertex(0.65), bedItems));
  parent.add(instanced(bg.duvet, std(0xffffff, { roughness: 0.95 }), bedItems.map((b, i) => ({ ...b, color: duvetColors[i % duvetColors.length] }))));
  parent.add(instanced(bg.lamps, mats.lanternGlow, bedItems, { castShadow: false }));
  const rugColors = [['#8c2f39', '#e8d9b0'], ['#2f4f6f', '#e8e0cc'], ['#6e3b52', '#ead7c0']];
  beds.forEach((b, i) => {
    const [main, accent] = rugColors[i % rugColors.length];
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.1), new THREE.MeshStandardMaterial({ map: rugTexture(main, accent), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(b.x, 0.045, b.z + (b.z < 10 ? 0.45 : -0.45));
    rug.receiveShadow = true;
    parent.add(rug);
  });

  // sofa lobi (menghadap utara, bisa diduduki)
  const sofaGeo = merge([
    part(new THREE.BoxGeometry(2.2, 0.4, 1.0), '#7b2d3b', { y: 0.35 }),
    part(new THREE.BoxGeometry(2.2, 0.62, 0.22), '#682433', { y: 0.7, z: 0.4 }),
    part(new THREE.BoxGeometry(0.24, 0.55, 1.0), '#682433', { x: -1.0, y: 0.5 }),
    part(new THREE.BoxGeometry(0.24, 0.55, 1.0), '#682433', { x: 1.0, y: 0.5 }),
    part(new THREE.BoxGeometry(1.5, 0.1, 0.8), '#8d3748', { y: 0.58, z: -0.02 }),
    ...[-0.95, 0.95].flatMap((x) => [-0.4, 0.4].map((z) => part(new THREE.BoxGeometry(0.08, 0.14, 0.08), '#d4a84b', { x, y: 0.07, z }))),
  ]);
  parent.add(instanced(sofaGeo, mats.vertex(0.85), by('sofa').map((f) => ({ x: f.x, z: f.z }))));

  // meja resepsionis + karpet lobi
  by('desk').forEach((d) => {
    parent.add(instanced(merge([
      part(new THREE.BoxGeometry(3.6, 1.0, 1.0), '#5a3d28', { y: 0.5 }),
      part(new THREE.BoxGeometry(3.85, 0.07, 1.2), '#f1ece2', { y: 1.04 }),
      part(new THREE.BoxGeometry(3.0, 0.06, 0.03), '#d4a84b', { y: 0.72, z: 0.51 }),
      part(new THREE.BoxGeometry(3.0, 0.06, 0.03), '#d4a84b', { y: 0.72, z: -0.51 }),
    ]), mats.vertex(0.5), [{ x: d.x, z: d.z }]));
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.8), new THREE.MeshStandardMaterial({ map: rugTexture('#223b3a', '#e8d9b0'), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(d.x, 0.045, d.z + 3);
    rug.receiveShadow = true;
    parent.add(rug);
  });

  // spa: bak mandi oval di atas podium batu, lilin
  by('tub').forEach((t) => {
    block(3.5, 0.14, 2.5, mats.limestone, t.x, 0.07, t.z, parent);
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.9, 0.6, 40), mats.ceramic);
    tub.scale.set(1.5, 1, 0.98);
    tub.position.set(t.x, 0.44, t.z);
    tub.castShadow = true;
    parent.add(tub);
    const surf = new THREE.Mesh(new THREE.CircleGeometry(0.93, 40), mats.fountainWater);
    surf.scale.set(1.5, 0.98, 1);
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(t.x, 0.7, t.z);
    parent.add(surf);
    const candles = [];
    for (let i = 0; i < 7; i++) candles.push({ x: t.x - 1.4 + i * 0.47, y: 0.2, z: t.z + 1.12 });
    parent.add(instanced(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8), mats.lanternGlow, candles, { castShadow: false }));
  });

  // dapur: konter baja
  const counters = by('counter');
  const counterGeo = merge([
    part(new THREE.BoxGeometry(2.4, 0.9, 1), '#aeb4b6', { y: 0.45 }),
    part(new THREE.BoxGeometry(2.5, 0.06, 1.1), '#d6dadb', { y: 0.93 }),
    ...[-0.8, 0, 0.8].flatMap((x) => [0.505, -0.505].map((z) => part(new THREE.BoxGeometry(0.7, 0.62, 0.02), '#8f969a', { x, y: 0.46, z }))),
  ]);
  parent.add(instanced(counterGeo, std(0xffffff, { roughness: 0.38, metalness: 0.55, vertexColors: true }), counters.map((c) => ({ x: c.x, z: c.z }))));

  // restoran: meja bertaplak, kursi kayu, bunga + lilin
  const tables = by('table');
  parent.add(instanced(new THREE.CylinderGeometry(0.88, 0.95, 0.74, 28), mats.cloth, tables.map((t) => ({ x: t.x, y: 0.37, z: t.z }))));
  parent.add(instanced(new THREE.CylinderGeometry(1.0, 1.0, 0.03, 28), mats.cloth, tables.map((t) => ({ x: t.x, y: 0.755, z: t.z }))));
  parent.add(instanced(bouquetGeometry(rand), mats.vertex(0.6), tables.map((t) => ({ x: t.x, y: 0.77, z: t.z, s: 1.1 }))));
  parent.add(instanced(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8), mats.lanternGlow, tables.map((t) => ({ x: t.x + 0.4, y: 0.82, z: t.z })), { castShadow: false }));
  const chairs = tables.flatMap((t) => [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].map(([dx, dz]) => ({ x: t.x + dx, z: t.z + dz, ry: Math.atan2(-dx, -dz) })));
  parent.add(instanced(chairGeometry({ frame: '#6b4f35', cushion: '#d8c5a6' }), mats.vertex(0.6), chairs));

  // lounger teras
  parent.add(instanced(loungerGeometry(), mats.vertex(0.6), by('lounger').map((l) => ({ x: l.x, z: l.z }))));

  // mobil + marka parkir
  const cars = by('car');
  if (cars.length) {
  const cg = carGeometries();
  const palette = [0x1f2a36, 0xf2f2f0, 0x8e1b1b, 0x3a3f46, 0x274a7c, 0xb9bcc0, 0x1a1a1a, 0xe9e1cf];
  const placed = cars.map((c, i) => ({ x: c.x, z: c.z, ry: i % 2 ? Math.PI : 0 }));
  parent.add(instanced(cg.body, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }), placed.map((c, i) => ({ ...c, color: palette[i % palette.length] }))));
  parent.add(instanced(cg.details, mats.vertex(0.35, { metalness: 0.2 }), placed));
  parent.add(instanced(cg.lights, new THREE.MeshBasicMaterial({ vertexColors: true }), placed, { castShadow: false }));
  const lines = [];
  for (const z of [30, 37]) for (const x of [20, 24, 28, 32, 36]) lines.push({ x, y: 0.03, z, sx: 0.12, sy: 0.02, sz: 6 });
  parent.add(instanced(new THREE.BoxGeometry(1, 1, 1), mats.paint, lines, { castShadow: false }));
  }
}

// ------------------------------------------------------------------ lantai atas
/** Lantai dan pelat beton untuk tiap ruangan (bordes untuk menara tangga). */
function buildFloors(rooms, level, parent, mats, floors) {
  for (const r of rooms) {
    const rect = r.kind === 'stair' ? (level === 0 ? r.rect : r.landing) : r.rect;
    if (!rect) continue;
    const [material, tile] = floors[r.kind] ?? floors.corridor;
    flat(rect, material, 0.03, parent, tile);
    if (level > 0) block(rect[2] - rect[0], 0.4, rect[3] - rect[1], mats.slab, (rect[0] + rect[2]) / 2, -0.2, (rect[1] + rect[3]) / 2, parent, { cast: false });
  }
}

/** Pagar teras: tiang + dua rel di tepi yang tidak berbatasan dengan ruangan berdinding. */
function buildRailings(rooms, parent, mats) {
  const walled = rooms.filter((r) => r.kind !== 'terrace').map((r) => r.rect);
  const posts = [];
  const top = [];
  const mid = [];
  for (const r of rooms.filter((q) => q.kind === 'terrace')) {
    const [x1, z1, x2, z2] = r.rect;
    for (const [orient, coord, a, b, out] of [['h', z1, x1, x2, -1], ['h', z2, x1, x2, 1], ['v', x1, z1, z2, -1], ['v', x2, z1, z2, 1]]) {
      const n = Math.max(1, Math.round((b - a) / 1.2));
      const seg = (b - a) / n;
      const edge = coord - out * 0.12;
      for (let i = 0; i < n; i++) {
        const c0 = a + seg * i;
        const m = c0 + seg / 2;
        const ox = orient === 'h' ? m : coord + out * 0.35;
        const oz = orient === 'h' ? coord + out * 0.35 : m;
        if (walled.some((w) => ox > w[0] && ox < w[2] && oz > w[1] && oz < w[3])) continue;
        const at = (c) => (orient === 'h' ? { x: c, z: edge } : { x: edge, z: c });
        const mm = at(m);
        top.push({ ...mm, y: 0.97, ry: orient === 'h' ? 0 : Math.PI / 2, sx: seg });
        mid.push({ ...mm, y: 0.5, ry: orient === 'h' ? 0 : Math.PI / 2, sx: seg });
        posts.push(at(c0), at(c0 + seg));
      }
    }
  }
  const postGeo = new THREE.BoxGeometry(0.07, 1, 0.07);
  postGeo.translate(0, 0.5, 0);
  parent.add(instanced(postGeo, mats.white, posts.map((p) => ({ ...p, sy: 1 }))));
  parent.add(instanced(new THREE.BoxGeometry(1, 0.07, 0.09), mats.gold, top));
  parent.add(instanced(new THREE.BoxGeometry(1, 0.03, 0.03), mats.white, mid));
}

/** Lengan tangga beton dengan pegangan tangan. Tinggi relatif terhadap induk (asal induk = lantai asal tangga). */
function buildStairs(flights, parent, mats) {
  const N = 18;
  const blocks = [];
  const treads = [];
  const posts = [];
  const rails = [];
  for (const s of flights) {
    const w = s.x2 - s.x1;
    const cx = (s.x1 + s.x2) / 2;
    const run = Math.abs(s.zBottom - s.zTop);
    const dir = Math.sign(s.zBottom - s.zTop);
    const base = 0;
    const rise = LEVEL_HEIGHT / N;
    const depth = run / N;
    for (let i = 0; i < N; i++) {
      const zc = s.zBottom - dir * (i + 0.5) * depth;
      const topY = base + (i + 1) * rise;
      blocks.push({ x: cx, y: base, z: zc, sx: w, sy: topY - base, sz: depth + 0.01 });
      treads.push({ x: cx, y: topY - 0.05, z: zc, sx: w + 0.02, sy: 0.05, sz: depth + 0.02 });
    }
    for (const x of [s.x1 + 0.07, s.x2 - 0.07]) {
      rails.push({ x, y: base + LEVEL_HEIGHT / 2 + 0.95, z: (s.zBottom + s.zTop) / 2, len: Math.hypot(run, LEVEL_HEIGHT), angle: Math.atan2(LEVEL_HEIGHT, run) * dir });
      for (let i = 1; i < N; i += 4) posts.push({ x, y: base + (i + 1) * rise, z: s.zBottom - dir * (i + 0.5) * depth, sy: 0.95 });
    }
  }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  unit.translate(0, 0.5, 0);
  parent.add(instanced(unit, mats.stairStone, blocks));
  parent.add(instanced(unit, mats.stairTread, treads, { castShadow: false }));
  const postGeo = new THREE.BoxGeometry(0.06, 1, 0.06);
  postGeo.translate(0, 0.5, 0);
  parent.add(instanced(postGeo, mats.white, posts));
  const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1), mats.gold, rails.length);
  rails.forEach((r, i) => {
    dummy.position.set(r.x, r.y, r.z);
    dummy.rotation.set(r.angle, 0, 0);
    dummy.scale.set(1, 1, r.len);
    dummy.updateMatrix();
    railMesh.setMatrixAt(i, dummy.matrix);
  });
  railMesh.castShadow = true;
  parent.add(railMesh);
}

// Tiap bangunan punya grup per lantai atas yang "dilipat" (diskalakan ke lantainya) saat pemain berada di dalamnya.
const BUILDINGS = [
  { id: 'north', rect: [-42, -21, 42, -2], towers: ['tower_w', 'tower_e'] },
  { id: 'guest', rect: [15, 3, 42, 23], towers: ['tower_g'] },
  { id: 'west', rect: [-42, 3, -15, 23], towers: ['tower_r'] },
];
const within = (b, x, z, m = 0) => x > b.rect[0] - m && x < b.rect[2] + m && z > b.rect[1] - m && z < b.rect[3] + m;

function splitLevel(data, b) {
  const wallMid = (w) => (w.orient === 'h' ? [(w.a + w.b) / 2, w.coord] : [w.coord, (w.a + w.b) / 2]);
  const roomMid = (r) => [(r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2];
  const ok = ([x, z]) => within(b, x, z);
  return {
    rooms: data.rooms.filter((r) => ok(roomMid(r))),
    walls: data.walls.filter((w) => ok(wallMid(w))),
    doors: data.doors.filter((d) => ok([d.x, d.z])),
    props: data.props.filter((p) => ok([p.x, p.z])),
  };
}

const TERRACE_PLANTS = {
  terrace_w: [[-36.5, -18.5], [-15.5, -18.5], [-15.5, -4.5], [-36.5, -4.5]],
  terrace_e: [[15.5, -18.5], [24.5, -18.5], [15.5, -4.5], [24.5, -4.5]],
  sky_garden: [[17, 5.5], [17, 20.5], [37, 20.5], [27, 5.5], [27, 20.5]],
  rooftop: [[-17, 5.5], [-17, 18.5], [-35, 18.5]],
};

function buildUpperLevel(level, data, group, mats, floors, rand) {
  buildFloors(data.rooms, level, group, mats, floors);
  const updateWalls = buildWalls(data.walls, group, mats);
  buildDoors(data.doors, group, mats);
  buildRailings(data.rooms, group, mats);
  buildProps(data.props, group, mats, rand);
  const plants = [];
  for (const r of data.rooms) for (const [x, z] of TERRACE_PLANTS[r.id] ?? []) plants.push({ x, z, ry: rand() * 6 });
  if (plants.length) group.add(instanced(potPlantGeometry(), mats.vertex(0.8), plants));
  for (const r of data.rooms) {
    if (!['lounge', 'library', 'restaurant'].includes(r.kind)) continue;
    const [x1, z1, x2, z2] = r.rect;
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(7, x2 - x1 - 3), Math.min(4.5, z2 - z1 - 4)), new THREE.MeshStandardMaterial({ map: rugTexture('#2f4f6f', '#e8e0cc'), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set((x1 + x2) / 2, 0.045, (z1 + z2) / 2);
    rug.receiveShadow = true;
    group.add(rug);
  }
  return updateWalls;
}

function buildLanterns(parent, mats) {
  const posts = [];
  for (let z = 19; z <= 40; z += 7) posts.push({ x: -3.4, z }, { x: 3.4, z });
  for (const [x, z] of [[-4.6, 22], [4.6, 22], [-4.6, 34], [4.6, 34]]) posts.push({ x, z });
  parent.add(instanced(lanternPostGeometry(), mats.vertex(0.5, { metalness: 0.4 }), posts));
  parent.add(instanced(new THREE.BoxGeometry(0.22, 0.3, 0.22), mats.lampGlow, posts.map((p) => ({ ...p, y: 2.2 })), { castShadow: false }));
}

function skyAndLight(scene, root, renderer) {
  const sky = new Sky();
  sky.scale.setScalar(380);
  const u = sky.material.uniforms;
  u.turbidity.value = 2.6;
  u.rayleigh.value = 1.3;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(SUN_DIR);
  scene.add(sky);
  scene.fog = new THREE.Fog(0xcfe0ec, 90, 230);
  if (renderer) {
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(900);
    Object.assign(envSky.material.uniforms.turbidity, { value: 2.6 });
    envSky.material.uniforms.rayleigh.value = 1.3;
    envSky.material.uniforms.mieCoefficient.value = 0.004;
    envSky.material.uniforms.mieDirectionalG.value = 0.82;
    envSky.material.uniforms.sunPosition.value.copy(SUN_DIR);
    envScene.add(envSky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0, 0.1, 1200).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }
  root.add(new THREE.HemisphereLight(0xe3f0ff, 0x86946c, 0.55));
  const sun = new THREE.DirectionalLight(0xfff0d6, 3.1);
  sun.castShadow = true;
  const lowEnd = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 120 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  root.add(sun, sun.target);
  return { sun, sky };
}

/** Membangun seluruh vila ke dalam scene. Mengembalikan fungsi update (bayangan, air, percikan). */
export function buildVillaWorld(scene, world, { renderer } = {}) {
  const root = new THREE.Group();
  scene.add(root);
  const rand = rng(2026);
  const anim = [];
  const { sun, sky } = skyAndLight(scene, root, renderer);

  const tex = {
    grass: grassTexture(), stone: stoneTexture(), path: stoneTexture({ slabs: 3, base: [206, 197, 180], seed: 22 }),
    limestone: stoneTexture({ slabs: 2, base: [232, 226, 212], seed: 23 }), parquet: parquetTexture(),
    marble: marbleTexture(), checker: marbleTexture({ checker: true }), asphalt: asphaltTexture(),
    poolTile: poolTileTexture(), waterNormal: waterNormalTexture(), frond: frondTexture(),
  };
  tex.grass.repeat.set(1 / 6, 1 / 6);
  tex.waterNormal.repeat.set(5, 5);
  const waterBase = { transparent: true, opacity: 0.88, roughness: 0.06, metalness: 0, normalMap: tex.waterNormal, normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 0.8, depthWrite: false };
  const vertexMat = (roughness, extra = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness, ...extra });
  const mats = {
    vertex: vertexMat,
    plaster: std(0xf4efe4, { roughness: 0.92 }), plasterOuter: std(0xe9e0cd, { roughness: 0.95 }),
    skirting: std(0xe4dac6, { roughness: 0.6 }), cornice: std(0xfbf7ee, { roughness: 0.7 }),
    stoneCap: std(0xcfc4ad, { roughness: 0.8 }), brass: std(0xb89a62, { roughness: 0.35, metalness: 0.7 }),
    gold: std(0xd4a84b, { roughness: 0.3, metalness: 0.75 }), white: std(0xfaf7f0, { roughness: 0.55 }),
    limestone: std(0xffffff, { map: tex.limestone, roughness: 0.78 }),
    deck: std(0xffffff, { map: tex.path, roughness: 0.82 }),
    bridgeWood: std(0xf0e0c4, { map: tex.parquet, roughness: 0.55 }),
    poolTile: std(0xffffff, { map: tex.poolTile, roughness: 0.35 }),
    water: new THREE.MeshPhysicalMaterial({ color: 0x1596b8, ...waterBase }),
    fountainWater: new THREE.MeshPhysicalMaterial({ color: 0x2aa6c6, ...waterBase, opacity: 0.9 }),
    runner: std(0xfaf6ee, { roughness: 0.96 }),
    stageBody: std(0xcdb48a, { roughness: 0.6 }), stageTop: std(0xe2c9a0, { map: tex.parquet, roughness: 0.45 }),
    leaf: std(0xffffff, { roughness: 0.8 }), petal: std(0xffffff, { roughness: 0.65 }),
    curtain: std(0xf6f0e6, { roughness: 0.92, side: THREE.DoubleSide }),
    lanternGlow: new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffc878, emissiveIntensity: 1.6, roughness: 0.4 }),
    lampGlow: new THREE.MeshStandardMaterial({ color: 0xfff4de, emissive: 0xffd28a, emissiveIntensity: 1.3, roughness: 0.4 }),
    towel: std(0xffffff, { roughness: 0.95 }),
    umbrella: std(0xf4ead2, { roughness: 0.85, side: THREE.DoubleSide }),
    cloth: std(0xfaf6ee, { roughness: 0.95 }), ceramic: std(0xf6f4ee, { roughness: 0.18 }),
    paint: std(0xf5f5f0, { roughness: 0.7 }),
    frond: new THREE.MeshStandardMaterial({ map: tex.frond, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.72 }),
    nut: std(0x4a3a22, { roughness: 0.6 }),
    hill: std(0xffffff, { roughness: 1 }),
    slab: std(0xd9cfbb, { roughness: 0.9 }),
    stairStone: std(0xcdc3ae, { roughness: 0.85 }),
    stairTread: std(0xf2ece0, { roughness: 0.7 }),
  };
  // Kecocokan kolom/hijau: material vertex-color untuk bunga dan daun memakai warna per instance.
  mats.leaf.vertexColors = false;

  // tanah berlubang di kolam
  const shape = new THREE.Shape();
  const R = 720; // dunia terbuka: tanah sampai jauh melewati pagar (pemain boleh keluar gerbang)
  shape.moveTo(-R, -R);
  shape.lineTo(R, -R);
  shape.lineTo(R, R);
  shape.lineTo(-R, R);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-7, -16);
  hole.lineTo(-7, -2);
  hole.lineTo(7, -2);
  hole.lineTo(7, -16);
  hole.closePath();
  shape.holes.push(hole);
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape), std(0xffffff, { map: tex.grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // bercak rumput gelap/terang supaya padang tidak terlihat berulang
  const blotchCanvas = document.createElement('canvas');
  blotchCanvas.width = blotchCanvas.height = 128;
  const bctx = blotchCanvas.getContext('2d');
  const grad = bctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  bctx.fillStyle = grad;
  bctx.fillRect(0, 0, 128, 128);
  const blotchMap = new THREE.CanvasTexture(blotchCanvas);
  for (const [color, opacity, count] of [[0x2d5f2a, 0.28, 46], [0x9bc46a, 0.22, 34]]) {
    const items = Array.from({ length: count }, () => ({ x: (rand() - 0.5) * 190, y: 0.006, z: (rand() - 0.5) * 190, s: 9 + rand() * 22 }));
    const blot = instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blotchMap, color, transparent: true, opacity, depthWrite: false, fog: true }), items, { castShadow: false, receiveShadow: false });
    root.add(blot);
  }

  // paving
  const courtyard = std(0xffffff, { map: tex.stone, roughness: 0.85 });
  const pathMat = std(0xffffff, { map: tex.path, roughness: 0.85 });
  const asphalt = std(0xffffff, { map: tex.asphalt, roughness: 0.95 });
  flat([-42, -3, 42, 2], courtyard, 0.012, root, 4);
  flat([-42, 2, -7.5, 4], courtyard, 0.012, root, 4);
  flat([7.5, 2, 42, 4], courtyard, 0.012, root, 4);
  for (const z of world.zones) if (z.kind === 'parking') flat(z.rect, asphalt, 0.012, root, 4);
  flat([-2.5, 16, 2.5, 42], pathMat, 0.014, root, 3);
  flat([-5, 22, 5, 34], std(0xffffff, { map: tex.limestone, roughness: 0.8 }), 0.016, root, 3);
  for (const sx of [-2.55, 2.55]) block(0.14, 0.09, 26, mats.stoneCap, sx, 0.045, 29, root, { cast: false });
  for (const [w, d, x, z] of [[10.3, 0.14, 0, 22], [10.3, 0.14, 0, 34], [0.14, 12, -5.07, 28], [0.14, 12, 5.07, 28]]) block(w, 0.09, d, mats.stoneCap, x, 0.05, z, root, { cast: false });

  // lantai ruangan menurut jenisnya
  const floors = {
    hall: [std(0xe3dccb, { map: tex.marble, roughness: 0.22 }), 4],
    lobby: [std(0xeee8da, { map: tex.checker, roughness: 0.24 }), 4],
    suite: [std(0xf0d9b8, { map: tex.parquet, roughness: 0.45 }), 2],
    bridal: [std(0xf6e6dc, { map: tex.parquet, roughness: 0.45 }), 2],
    guest: [std(0xe6cfae, { map: tex.parquet, roughness: 0.5 }), 2],
    restaurant: [std(0xc9a37a, { map: tex.parquet, roughness: 0.5 }), 2],
    spa: [std(0xc6e8e3, { map: tex.marble, roughness: 0.24 }), 4],
    kitchen: [std(0xe3eaec, { map: tex.checker, roughness: 0.3 }), 4],
    corridor: [std(0xffffff, { map: tex.stone, roughness: 0.8 }), 4],
    stair: [std(0xe9e1d0, { map: tex.stone, roughness: 0.8 }), 4],
    lounge: [std(0xf3e4cc, { map: tex.parquet, roughness: 0.45 }), 2],
    library: [std(0xb08a62, { map: tex.parquet, roughness: 0.5 }), 2],
    terrace: [std(0xffffff, { map: tex.path, roughness: 0.85 }), 3],
  };
  const groundLevel = world.levels[0];
  buildFloors(groundLevel.rooms, 0, root, mats, floors);

  const updaters = [buildWalls(groundLevel.walls, root, mats)];
  buildDoors(groundLevel.doors, root, mats);
  buildPerimeter(world, root, mats, rand);
  buildHall(root, mats, rand);
  buildPoolAndGarden(root, mats, anim);
  buildPalms(world, root, mats);
  const hillMesh = buildGreenery(world, root, mats, rand);
  buildProps(groundLevel.props, root, mats, rand);
  buildLanterns(root, mats);
  buildCountryside(world, root, mats, rand);
  buildStairs(STAIRS.filter((s) => s.from === 0), root, mats);
  const folds = []; // { level, building, group, scale, updateWalls }
  for (let level = 1; level < world.levels.length; level++) {
    for (const b of BUILDINGS) {
      const data = splitLevel(world.levels[level], b);
      if (!data.rooms.length) continue;
      const group = new THREE.Group();
      group.position.y = levelY(level);
      root.add(group);
      const updateWalls = buildUpperLevel(level, data, group, mats, floors, rand);
      const flights = STAIRS.filter((s) => s.from === level && b.towers.includes(s.tower));
      if (flights.length) buildStairs(flights, group, mats);
      folds.push({ level, building: b, group, scale: 1, updateWalls });
    }
  }
  const buildingAt = (x, z) => BUILDINGS.find((b) => within(b, x, z, 1.5)) ?? null;

  const labels = [];
  for (const r of world.rooms) {
    if (r.kind === 'corridor' || r.kind === 'guest') continue;
    const sprite = label(r.name, (r.rect[0] + r.rect[2]) / 2, r.rect[1] + 1.6);
    if (sprite) {
      root.add(sprite);
      labels.push(sprite);
    }
  }
  for (const [text, x, z] of [['Pool & Garden', -3.5, 7], ['Parking Area', 30, 33], ['Guest Rooms', 27, 13]]) {
    const sprite = label(text, x, z);
    if (sprite) {
      root.add(sprite);
      labels.push(sprite);
    }
  }

  let clock = 0;
  return {
    root,
    /** Apakah lantai `level` di titik (x,z) sedang dilipat (disembunyikan) sehingga isinya tidak terlihat? */
    isHidden(x, z, level) {
      if (level < 1) return false;
      return folds.some((f) => f.level === level && within(f.building, x, z, 0.5) && f.scale < 0.5);
    },
    update(px, pz, delta = 0.016, level = 0, camDir, pitch, y = levelY(level)) {
      clock += delta;
      for (const l of labels) l.visible = level === 0; // label lantai dasar tidak melayang di atas lantai atas
      updaters[0](px, pz, delta, level === 0, camDir, pitch);
      // Lantai di atas pemain dilipat bila pemain berada di dalam bangunannya; bangunan lain tetap utuh dan solid.
      const seen = Math.floor((y + 2.5) / LEVEL_HEIGHT); // lantai berikutnya muncul setelah naik ~0.9 m di tangga
      const k = Math.min(1, delta * 9);
      for (const f of folds) {
        const inside = within(f.building, px, pz, 1.5);
        f.scale += ((inside && f.level > seen ? 0 : 1) - f.scale) * k;
        f.group.scale.y = Math.max(0.001, f.scale);
        f.group.visible = f.scale > 0.02;
        f.updateWalls(px, pz, delta, inside && f.level === level, camDir, pitch);
      }
      tex.waterNormal.offset.x += delta * 0.018;
      tex.waterNormal.offset.y += delta * 0.011;
      for (const fn of anim) fn(clock);
      sky.position.set(px, 0, pz); // langit mengikuti pemain agar horizon tidak pernah terkejar
      // bukit latar diam saat pemain di dalam vila, lalu ikut bergerak penuh setelah keluar (tidak pernah bisa dimasuki)
      const follow = Math.min(1, Math.max(0, (Math.hypot(px, pz) - 40) / 25));
      hillMesh.position.set(px * follow, 0, pz * follow);
      sun.position.set(px + SUN_DIR.x * 50, SUN_DIR.y * 50, pz + SUN_DIR.z * 50);
      sun.target.position.set(px, 0, pz);
      sun.target.updateMatrixWorld();
    },
  };
}
