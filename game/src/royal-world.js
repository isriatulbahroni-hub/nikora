import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { grassTexture, marbleTexture, parquetTexture, plasterTexture, rng, rugTexture, stoneTexture, waterNormalTexture } from './villa-textures.js';
import { lanternPostGeometry, merge, part, potPlantGeometry, broadleafTreeGeometry } from './villa-props.js';
import { buildFloatingIsland, createIslandMaterials } from './royal-islands.js';
import { altarGlowTexture, inlayTexture, labelSprite, roseWindowTexture, stainedGlassTexture } from './royal-textures.js';
import {
  ALTAR, BOUNDS, BRIDGE, DECOR_ISLANDS, FOUNTAIN, GAME_PADS, GAZEBOS, INLAY, ISLANDS, LAKE, LAKE_LEVEL, OPENINGS, PHOTO_SPOT, PIANO, PORTALS,
  ROOFS, ROOMS, STAGE, TOWERS, WALL_THICKNESS, cathedralChairs, mainHeight, musicChairs, wallHeight,
} from './royal-layout.js';

// Dunia 3D Istana Cinta: istana neo-gotik emas-putih (katedral pelaminan, ruang makan VIP, lounge kaca panorama, aula musik),
// danau kristal dengan Jembatan Cinta yang melengkung, taman sakura, dermaga portal, dan pulau-pulau melayang.
// Semua geometri dibuat dari kode (tanpa aset), memakai instancing agar ringan di ponsel.
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const ico = (detail = 1) => new THREE.IcosahedronGeometry(1, detail);
const std = (o) => new THREE.MeshStandardMaterial(o);
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

function instanced(geometry, material, items, { shadow = true, color = false } = {}) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y ?? 0, it.z);
    dummy.rotation.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
    dummy.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (color) mesh.setColorAt(i, tint.set(it.color ?? '#ffffff'));
  });
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

function tileUV(geometry, ku, kv) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ku, uv.getY(i) * kv);
  return geometry;
}

function gableGeometry(width, rise, length) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(0, rise);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
  g.translate(0, 0, -length / 2);
  return g;
}

const surfaceY = (x, z) => mainHeight(Math.abs(x) <= 3.3 ? Math.max(-3, Math.min(3, x)) : x, z);

// ---- geometri perabot (warna lewat vertex color; rotasi 0 = menghadap utara, sandaran di +z untuk sofa/bangku)
function liteChair(frame = '#d9b25a', cushion = '#f7f1e6') {
  return merge([
    part(box(0.44, 0.05, 0.44), frame, { y: 0.46 }), part(box(0.4, 0.07, 0.4), cushion, { y: 0.52 }),
    part(box(0.44, 0.5, 0.05), frame, { y: 0.75, z: -0.2 }), part(box(0.38, 0.4, 0.03), cushion, { y: 0.76, z: -0.17 }),
    ...[[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]].map(([x, z]) => part(box(0.04, 0.44, 0.04), frame, { x, y: 0.22, z })),
  ]);
}
const tableGeometry = () => merge([
  part(cyl(0.95, 1.0, 0.75, 20), '#fffaf0', { y: 0.375 }), part(cyl(1.0, 1.0, 0.05, 20), '#ffffff', { y: 0.775 }),
  part(cyl(0.07, 0.1, 0.32, 8), '#d9b25a', { y: 0.97 }),
  part(ico(1), '#f7a8bd', { y: 1.2, sx: 0.2, sy: 0.2, sz: 0.2 }), part(ico(1), '#ffffff', { x: 0.14, y: 1.12, sx: 0.14, sy: 0.14, sz: 0.14 }),
  part(ico(1), '#ffd6e0', { x: -0.13, y: 1.14, sx: 0.15, sy: 0.15, sz: 0.15 }),
]);
const sofaGeometry = () => merge([
  part(box(2.2, 0.4, 1.0), '#ffffff', { y: 0.3 }), part(box(1.05, 0.18, 0.8), '#f4f4f4', { x: -0.53, y: 0.59, z: -0.05 }),
  part(box(1.05, 0.18, 0.8), '#f4f4f4', { x: 0.53, y: 0.59, z: -0.05 }), part(box(2.2, 0.55, 0.25), '#ffffff', { y: 0.8, z: 0.4 }),
  part(box(0.2, 0.5, 0.9), '#ffffff', { x: -1.0, y: 0.5 }), part(box(0.2, 0.5, 0.9), '#ffffff', { x: 1.0, y: 0.5 }),
  ...[[-0.95, -0.4], [0.95, -0.4], [-0.95, 0.4], [0.95, 0.4]].map(([x, z]) => part(cyl(0.04, 0.03, 0.14, 6), '#d9b25a', { x, y: 0.07, z })),
]);
const benchGeometry = () => merge([
  part(box(1.8, 0.08, 0.45), '#9a7650', { y: 0.45 }), part(box(1.8, 0.5, 0.06), '#9a7650', { y: 0.75, z: 0.2 }),
  ...[-0.8, 0.8].flatMap((x) => [part(box(0.07, 0.45, 0.4), '#d9b25a', { x, y: 0.22 }), part(box(0.07, 0.55, 0.07), '#d9b25a', { x, y: 0.7, z: 0.2 })]),
]);
const pianoGeometry = () => merge([
  part(box(1.5, 0.3, 2.0), '#16161a', { y: 0.86 }), part(box(1.5, 0.04, 1.7), '#1b1b20', { y: 1.15, z: -0.15, rx: -0.5 }),
  part(box(1.4, 0.08, 0.4), '#f5f1e6', { y: 0.76, z: 1.0 }), part(box(1.4, 0.05, 0.2), '#101010', { y: 0.82, z: 0.85 }),
  ...[[-0.65, -0.85], [0.65, -0.85], [0, 0.8]].map(([x, z]) => part(cyl(0.05, 0.04, 0.72, 8), '#101010', { x, y: 0.36, z })),
  part(box(0.9, 0.1, 0.38), '#2a2018', { y: 0.46, z: 1.4 }), ...[-0.35, 0.35].map((x) => part(box(0.06, 0.45, 0.06), '#2a2018', { x, y: 0.22, z: 1.4 })),
]);
const columnGeometry = () => merge([
  part(cyl(0.38, 0.42, 14, 14), '#f1e8d2', { y: 7 }), part(cyl(0.5, 0.5, 0.35, 14), '#d9b25a', { y: 0.18 }), part(cyl(0.55, 0.5, 0.4, 14), '#d9b25a', { y: 13.8 }),
]);
const towerGeometry = (t) => merge([
  part(cyl(t.r, t.r + 0.1, t.h, 20), '#f0e6cf', { y: t.h / 2 }),
  ...[6, 14, 21].map((y) => part(cyl(t.r + 0.15, t.r + 0.15, 0.3, 20), '#d9b25a', { y })),
  part(new THREE.ConeGeometry(t.r + 0.6, t.cone, 20), '#3d4c70', { y: t.h + t.cone / 2 }),
  part(cyl(0.05, 0.08, 2.6, 6), '#d9b25a', { y: t.h + t.cone + 1.2 }), part(ico(1), '#d9b25a', { y: t.h + t.cone + 0.1, sx: 0.28, sy: 0.28, sz: 0.28 }),
]);
const chandelierGeometries = () => ({
  frame: merge([
    part(new THREE.TorusGeometry(1.1, 0.06, 8, 28), '#d9b25a', { rx: Math.PI / 2 }), part(new THREE.TorusGeometry(0.6, 0.05, 8, 24), '#d9b25a', { rx: Math.PI / 2, y: 0.35 }),
    part(cyl(0.04, 0.04, 2.4, 6), '#d9b25a', { y: 1.2 }),
  ]),
  lights: merge([
    ...Array.from({ length: 10 }, (_, i) => part(ico(1), '#fff2c4', { x: Math.cos((i / 10) * Math.PI * 2) * 1.1, y: 0.12, z: Math.sin((i / 10) * Math.PI * 2) * 1.1, sx: 0.09, sy: 0.14, sz: 0.09 })),
    ...Array.from({ length: 16 }, (_, i) => part(new THREE.OctahedronGeometry(1, 0), '#d6ecff', { x: Math.cos((i / 16) * Math.PI * 2) * 0.9, y: -0.35, z: Math.sin((i / 16) * Math.PI * 2) * 0.9, sx: 0.06, sy: 0.22, sz: 0.06 })),
  ]),
});
function sakuraGeometry() {
  const rand = rng(77);
  const pinks = ['#f4b6c9', '#f7c8d6', '#ee9fb8', '#fbd9e3'];
  const parts = [part(cyl(0.16, 0.26, 2.6, 8), '#5b4332', { y: 1.3 }), part(cyl(0.07, 0.12, 1.6, 6), '#5b4332', { x: 0.5, y: 3, rz: -0.8 }), part(cyl(0.07, 0.12, 1.6, 6), '#5b4332', { x: -0.5, y: 3, rz: 0.8 })];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand();
    const rr = i === 0 ? 0 : 0.9 + rand() * 0.6;
    const s = 1.1 + rand() * 0.55;
    parts.push(part(ico(1), pinks[i % 4], { x: Math.cos(a) * rr, y: 3.2 + rand() * 1.3, z: Math.sin(a) * rr, sx: s, sy: s * 0.82, sz: s }));
  }
  return merge(parts);
}

export function createRoyalWorld({ scene, renderer, layout, mono = 'N&A' }) {
  const root = new THREE.Group();
  scene.add(root);
  const glow = [];
  const glowing = (mat, base, gain = 1.6) => {
    glow.push({ mat, base, gain });
    mat.emissiveIntensity = base;
    return mat;
  };
  const add = (o) => {
    if (o) root.add(o);
    return o;
  };

  // ---------------------------------------------------------------- lingkungan dan cahaya
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  scene.fog = new THREE.Fog(0xf3a070, 140, 780);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 240 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  const indoorLight = new THREE.PointLight(0xffe4b8, 0, 24, 1.5);
  scene.add(sun, sun.target, hemi, indoorLight);
  let atmosphere = null;

  // ---------------------------------------------------------------- bahan dan tekstur
  const grass = grassTexture();
  grass.repeat.set(1 / 8, 1 / 8);
  const M = {
    cream: std({ map: plasterTexture(), color: 0xf3ead6, roughness: 0.85 }),
    gold: std({ color: 0xd9b25a, metalness: 0.9, roughness: 0.3 }),
    slate: std({ color: 0x3d4c70, roughness: 0.5, metalness: 0.25 }),
    stone: std({ map: stoneTexture({ slabs: 6, base: [214, 205, 186], seed: 5 }), roughness: 0.9 }),
    marble: std({ map: marbleTexture({ checker: true }), roughness: 0.22, metalness: 0.05 }),
    marblePlain: std({ map: marbleTexture({ seed: 43 }), roughness: 0.25 }),
    wood: std({ map: parquetTexture(), roughness: 0.55 }),
    rock: std({ color: 0x77695a, roughness: 1, flatShading: true }),
    grass: std({ map: grass, roughness: 0.95 }),
    vertex: std({ vertexColors: true, roughness: 0.65, metalness: 0.1 }),
    metalVertex: std({ vertexColors: true, roughness: 0.3, metalness: 0.8 }),
    flower: std({ color: 0xffffff, roughness: 0.8 }),
    white: std({ color: 0xfaf5ea, roughness: 0.6 }),
  };
  const rugA = rugTexture('#9c1f3a', '#f0dfb0');
  const rugB = rugTexture('#9c1f3a', '#f0dfb0');
  for (const [r, n] of [[rugA, 5], [rugB, 7]]) {
    r.wrapS = r.wrapT = THREE.RepeatWrapping;
    r.repeat.set(1, n);
    r.needsUpdate = true;
  }
  const islandMats = createIslandMaterials(grass);
  const waterfalls = [islandMats.fall];

  function floor(w, d, cx, cz, y, material, tile = 4) {
    const g = tileUV(new THREE.PlaneGeometry(w, d), w / tile, d / tile);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, material);
    m.position.set(cx, y, cz);
    m.receiveShadow = true;
    return add(m);
  }

  // ---------------------------------------------------------------- dataran utama, tebing, laut
  (function terrain() {
    const s = new THREE.Shape();
    s.moveTo(BOUNDS.minX, -BOUNDS.maxZ);
    s.lineTo(BOUNDS.maxX, -BOUNDS.maxZ);
    s.lineTo(BOUNDS.maxX, -BOUNDS.minZ);
    s.lineTo(BOUNDS.minX, -BOUNDS.minZ);
    s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(LAKE.x1, -LAKE.z2);
    hole.lineTo(LAKE.x2, -LAKE.z2);
    hole.lineTo(LAKE.x2, -LAKE.z1);
    hole.lineTo(LAKE.x1, -LAKE.z1);
    hole.closePath();
    s.holes.push(hole);
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, M.grass);
    m.receiveShadow = true;
    add(m);

    const W = BOUNDS.maxX - BOUNDS.minX;
    const D = BOUNDS.maxZ - BOUNDS.minZ;
    for (const [w, d, x, z] of [[1.5, D, BOUNDS.minX - 0.75, 2], [1.5, D, BOUNDS.maxX + 0.75, 2], [W + 3, 1.5, 0, BOUNDS.minZ - 0.75], [W + 3, 1.5, 0, BOUNDS.maxZ + 0.75]]) {
      const c = new THREE.Mesh(box(w, 9, d), M.rock);
      c.position.set(x, -4.5, z);
      c.receiveShadow = true;
      add(c);
    }
    const rand = rng(404);
    const rocks = [];
    for (let i = 0; i < 160; i++) {
      const side = (rand() * 4) | 0;
      const t = rand();
      const out = 0.5 + rand() * 3;
      const x = side < 2 ? (side === 0 ? BOUNDS.minX - out : BOUNDS.maxX + out) : BOUNDS.minX + t * W;
      const z = side < 2 ? BOUNDS.minZ + t * D : side === 2 ? BOUNDS.minZ - out : BOUNDS.maxZ + out;
      const s2 = 1.2 + rand() * 2.8;
      rocks.push({ x, y: -1 - rand() * 7, z, sx: s2, sy: s2 * 0.8, sz: s2, ry: rand() * 3, color: tint.setHSL(0.08, 0.12, 0.28 + rand() * 0.14).getStyle() });
    }
    add(instanced(ico(1), M.rock, rocks, { color: true }));

    // pagar balustrade di tepi dataran
    const posts = [];
    const rails = [];
    for (let x = BOUNDS.minX; x <= BOUNDS.maxX; x += 2) posts.push({ x, y: 0.45, z: BOUNDS.minZ }, { x, y: 0.45, z: BOUNDS.maxZ });
    for (let z = BOUNDS.minZ; z <= BOUNDS.maxZ; z += 2) posts.push({ x: BOUNDS.minX, y: 0.45, z }, { x: BOUNDS.maxX, y: 0.45, z });
    rails.push({ x: 0, y: 0.95, z: BOUNDS.minZ, sx: W, sy: 0.12, sz: 0.22 }, { x: 0, y: 0.95, z: BOUNDS.maxZ, sx: W, sy: 0.12, sz: 0.22 });
    rails.push({ x: BOUNDS.minX, y: 0.95, z: 2, sx: 0.22, sy: 0.12, sz: D }, { x: BOUNDS.maxX, y: 0.95, z: 2, sx: 0.22, sy: 0.12, sz: D });
    add(instanced(cyl(0.1, 0.12, 0.9, 6), M.cream, posts));
    add(instanced(box(1, 1, 1), M.cream, rails));

    for (const [x, z, ry] of [[-64.9, -30, -Math.PI / 2], [-64.9, 0, -Math.PI / 2], [-64.9, 30, -Math.PI / 2], [64.9, -30, Math.PI / 2], [64.9, 0, Math.PI / 2], [64.9, 30, Math.PI / 2], [-40, 60.9, 0], [40, 60.9, 0]]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(3, 9), islandMats.fall);
      w.position.set(x, -4.5, z);
      w.rotation.y = ry;
      add(w);
    }
  }());

  const seaNormal = waterNormalTexture().clone();
  seaNormal.repeat.set(170, 170);
  seaNormal.needsUpdate = true;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), std({ color: 0x1d6f98, roughness: 0.1, metalness: 0.15, normalMap: seaNormal, normalScale: new THREE.Vector2(0.5, 0.5) }));
  sea.position.y = -9;
  add(sea);

  // ---------------------------------------------------------------- danau kristal dan Jembatan Cinta
  const lakeNormal = waterNormalTexture().clone();
  lakeNormal.repeat.set(10, 6);
  lakeNormal.needsUpdate = true;
  (function lake() {
    const lw = LAKE.x2 - LAKE.x1;
    const ld = LAKE.z2 - LAKE.z1;
    const cz = (LAKE.z1 + LAKE.z2) / 2;
    floor(lw, ld, 0, cz, -2, std({ color: 0x79d3cc, roughness: 0.9 }));
    const water = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld).rotateX(-Math.PI / 2), std({
      color: 0x66dde6, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.74, normalMap: lakeNormal, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.5,
    }));
    water.position.set(0, LAKE_LEVEL, cz);
    add(water);
    for (const [w, d, x, z] of [[lw, 0.3, 0, LAKE.z1], [lw, 0.3, 0, LAKE.z2], [0.3, ld, LAKE.x1, cz], [0.3, ld, LAKE.x2, cz]]) {
      const m = new THREE.Mesh(box(w, 2, d), M.stone);
      m.position.set(x, -1, z);
      add(m);
    }
    const disc = glowing(std({ color: 0x103040, emissive: 0x66ffee, roughness: 0.4 }), 0.12, 6);
    const lamps = [];
    for (let i = 0; i < 16; i++) lamps.push({ x: -24 + (i % 4) * 16 + ((i * 7) % 5), y: -1.95, z: 2 + Math.floor(i / 4) * 8 + ((i * 3) % 4), sx: 1.1, sy: 1, sz: 1.1 });
    add(instanced(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), disc, lamps.filter((l) => Math.abs(l.x) > 4), { shadow: false }));
  }());
  const lanternMat = glowing(std({ color: 0xffd9a0, emissive: 0xffb45c, roughness: 0.5 }), 0.9, 1.4);
  const lanterns = [];
  {
    const rand = rng(515);
    for (let i = 0; i < 40; i++) {
      const x = LAKE.x1 + 2 + rand() * (LAKE.x2 - LAKE.x1 - 4);
      if (Math.abs(x) < 4.5) continue;
      lanterns.push({ x, y: LAKE_LEVEL + 0.15, z: LAKE.z1 + 2 + rand() * (LAKE.z2 - LAKE.z1 - 4), s: 0.22, phase: rand() * 6 });
    }
  }
  const lanternMesh = instanced(ico(1), lanternMat, lanterns, { shadow: false });
  add(lanternMesh);

  (function bridge() {
    const N = 28;
    const L = BRIDGE.z2 - BRIDGE.z1;
    const deck = [];
    const para = [];
    const caps = [];
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const zc = BRIDGE.z1 + t * L;
      const y = BRIDGE.hump * Math.sin(Math.PI * t);
      const ang = -Math.atan(((BRIDGE.hump * Math.PI) / L) * Math.cos(Math.PI * t));
      const seg = (L / N) * 1.05;
      deck.push({ x: 0, y: y - 0.25, z: zc, sx: BRIDGE.halfW * 2, sy: 0.5, sz: seg, rx: ang });
      for (const s of [-1, 1]) {
        para.push({ x: s * (BRIDGE.halfW - 0.13), y: y + 0.475, z: zc, sx: 0.28, sy: 0.95, sz: seg, rx: ang });
        caps.push({ x: s * (BRIDGE.halfW - 0.13), y: y + 0.97, z: zc, sx: 0.4, sy: 0.08, sz: seg, rx: ang });
      }
    }
    add(instanced(box(1, 1, 1), M.marblePlain, deck));
    add(instanced(box(1, 1, 1), M.cream, para));
    add(instanced(box(1, 1, 1), M.gold, caps));
    const piers = [6, 13, 22].flatMap((z) => [-2.2, 2.2].map((x) => ({ x, y: -1, z, sy: 1, sx: 1, sz: 1 })));
    add(instanced(cyl(0.6, 0.7, 1.9, 12), M.stone, piers.map((p) => ({ ...p, y: -0.5 + BRIDGE.hump * 0.4 * 0 - 0.5 }))));
  }());

  // ---------------------------------------------------------------- istana: dinding, jendela, atap
  const wallItems = [];
  const trimItems = [];
  const T = WALL_THICKNESS;
  for (const seg of layout.walls) {
    const h = wallHeight(seg);
    const len = seg.b - seg.a;
    const mid = (seg.a + seg.b) / 2;
    const hz = seg.orient === 'h';
    const cx = hz ? mid : seg.coord;
    const cz = hz ? seg.coord : mid;
    wallItems.push({ x: cx, y: h / 2, z: cz, sx: hz ? len : T, sy: h, sz: hz ? T : len });
    trimItems.push({ x: cx, y: 0.13, z: cz, sx: hz ? len : T + 0.1, sy: 0.26, sz: hz ? T + 0.1 : len });
    trimItems.push({ x: cx, y: h - 0.12, z: cz, sx: hz ? len : T + 0.18, sy: 0.24, sz: hz ? T + 0.18 : len });
  }
  const clearPanes = [];
  const stainedPanes = [];
  const frames = [];
  for (const o of OPENINGS) {
    const hz = o.orient === 'h';
    const c = hz ? o.x : o.z;
    const h = wallHeight({ orient: o.orient, coord: hz ? o.z : o.x, a: c - o.width / 2, b: c + o.width / 2 });
    const piece = (y0, y1) => wallItems.push({ x: hz ? o.x : o.x, y: (y0 + y1) / 2, z: o.z, sx: hz ? o.width : T, sy: y1 - y0, sz: hz ? T : o.width });
    if (h > o.y1) piece(o.y1, h);
    if (o.y0 > 0) piece(0, o.y0);
    const ry = hz ? 0 : Math.PI / 2;
    const at = (lx) => (hz ? { x: o.x + lx, z: o.z } : { x: o.x, z: o.z + lx });
    const bar = (lx, y, w, hh) => frames.push({ ...at(lx), y, ry, sx: w, sy: hh, sz: T + 0.1 });
    const oh = o.y1 - o.y0;
    const mid = (o.y0 + o.y1) / 2;
    bar(0, o.y1, o.width + 0.2, 0.12);
    bar(-o.width / 2, mid, 0.12, oh);
    bar(o.width / 2, mid, 0.12, oh);
    if (o.y0 > 0) bar(0, o.y0, o.width + 0.2, 0.12);
    if (o.glass) {
      bar(0, mid, 0.06, oh);
      bar(0, mid, o.width, 0.06);
      (o.y1 >= 9.5 ? stainedPanes : clearPanes).push({ ...at(0), y: mid, ry, sx: o.width, sy: oh, sz: 1 });
    }
  }
  add(instanced(box(1, 1, 1), M.cream, wallItems));
  add(instanced(box(1, 1, 1), M.gold, trimItems));
  add(instanced(box(1, 1, 1), M.gold, frames));
  const clearGlass = glowing(std({ color: 0xbfe3ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, emissive: 0xffd9a0, side: THREE.DoubleSide, depthWrite: false }), 0.05, 12);
  const stainedMap = stainedGlassTexture();
  const stainedGlass = glowing(std({ map: stainedMap, emissiveMap: stainedMap, emissive: 0xffffff, transparent: true, opacity: 0.94, roughness: 0.2, side: THREE.DoubleSide }), 0.3, 3);
  add(instanced(new THREE.PlaneGeometry(1, 1), clearGlass, clearPanes, { shadow: false }));
  add(instanced(new THREE.PlaneGeometry(1, 1), stainedGlass, stainedPanes, { shadow: false }));

  // atap
  for (const r of ROOFS) {
    const w = r.rect[2] - r.rect[0] + r.overhang * 2;
    const d = r.rect[3] - r.rect[1] + r.overhang * 2;
    const cx = (r.rect[0] + r.rect[2]) / 2;
    const cz = (r.rect[1] + r.rect[3]) / 2;
    if (r.kind === 'flat') {
      const slab = new THREE.Mesh(box(w, r.rise, d), M.cream);
      slab.position.set(cx, r.base + r.rise / 2, cz);
      slab.castShadow = true;
      add(slab);
      const top = new THREE.Mesh(box(w - 0.6, 0.05, d - 0.6), M.slate);
      top.position.set(cx, r.base + r.rise + 0.02, cz);
      add(top);
      const rails = [[0, -d / 2, w, 0.25], [0, d / 2, w, 0.25], [-w / 2, 0, 0.25, d], [w / 2, 0, 0.25, d]].map(([x, z, sx, sz]) => ({ x: cx + x, y: r.base + r.rise + 0.3, z: cz + z, sx, sy: 0.6, sz }));
      add(instanced(box(1, 1, 1), M.cream, rails));
    } else {
      const alongZ = r.kind === 'gable_z';
      const roof = new THREE.Mesh(gableGeometry(alongZ ? w : d, r.rise, alongZ ? d : w), [M.cream, M.slate]);
      roof.position.set(cx, r.base, cz);
      if (!alongZ) roof.rotation.y = Math.PI / 2;
      roof.castShadow = true;
      add(roof);
      const ridge = new THREE.Mesh(cyl(0.14, 0.14, alongZ ? d : w, 8), M.gold);
      ridge.rotation.set(alongZ ? Math.PI / 2 : 0, 0, alongZ ? 0 : Math.PI / 2);
      ridge.position.set(cx, r.base + r.rise, cz);
      add(ridge);
    }
  }
  // menara sudut, puncak, dan hiasan fasad
  for (const t of TOWERS) {
    const m = new THREE.Mesh(towerGeometry(t), M.vertex);
    m.position.set(t.x, 0, t.z);
    m.castShadow = true;
    add(m);
  }
  const slitMat = glowing(std({ color: 0xffe6a8, emissive: 0xffc866, roughness: 0.4 }), 0.25, 5);
  const slits = [];
  for (const t of TOWERS) for (const y of [12, 17]) for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + (y === 17 ? 0.5 : 0);
    slits.push({ x: t.x + Math.cos(a) * (t.r + 0.12), y, z: t.z + Math.sin(a) * (t.r + 0.12), ry: -a + Math.PI / 2, sx: 0.5, sy: 1.5, sz: 0.2 });
  }
  add(instanced(box(1, 1, 1), slitMat, slits, { shadow: false }));
  add(instanced(new THREE.ConeGeometry(0.9, 11, 8), M.gold, [{ x: 0, y: 18.2 + 5.5, z: -35 }]));
  add(instanced(new THREE.ConeGeometry(0.35, 3.2, 6), M.gold, [[-11.6, -49.3], [11.6, -49.3], [-11.6, -20.7], [11.6, -20.7]].map(([x, z]) => ({ x, y: 15.6, z }))));
  {
    const rose = roseWindowTexture();
    const roseMat = glowing(std({ map: rose, emissiveMap: rose, emissive: 0xffffff, roughness: 0.3 }), 0.4, 3);
    const rw = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), roseMat);
    rw.position.set(0, 16.2, -19.17);
    add(rw);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.13, 8, 40), M.gold);
    ring.position.copy(rw.position);
    add(ring);
    const tym = new THREE.Mesh(new THREE.CircleGeometry(3, 28, 0, Math.PI), stainedGlass);
    tym.position.set(0, 6.4, -19.82);
    add(tym);
    for (const [z, rz] of [[-19.8, 0], [-20.2, 0]]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.14, 8, 28, Math.PI), M.gold);
      arch.position.set(0, 6.4, z);
      arch.rotation.z = rz;
      add(arch);
    }
    const sign = labelSprite('Pelaminan Utama', { width: 7 });
    sign.position.set(0, 11.2, -18.4);
    add(sign);
  }

  // ---------------------------------------------------------------- interior
  const chandG = chandelierGeometries();
  const chandFrame = std({ vertexColors: true, metalness: 0.85, roughness: 0.3 });
  const chandLight = glowing(std({ vertexColors: true, emissive: 0xffe2a0, roughness: 0.4 }), 0.7, 1.6);
  const chandItems = [
    ...[-44, -35, -26].map((z) => ({ x: 0, y: 10.8, z, s: 1.5 })), ...[-44, -38, -32, -26].flatMap((z) => [-22.5, -15.5].map((x) => ({ x, y: 7.2, z, s: 1.1 }))),
    ...[-41, -29].map((z) => ({ x: 19, y: 7.2, z, s: 1.2 })), ...[-38, -31].map((z) => ({ x: 42, y: 6.2, z, s: 1.2 })),
  ];
  add(instanced(chandG.frame, chandFrame, chandItems));
  add(instanced(chandG.lights, chandLight, chandItems, { shadow: false }));

  for (const r of ROOMS) {
    const [x1, z1, x2, z2] = r.rect;
    const mat = r.kind === 'cathedral' ? M.marble : r.kind === 'lounge' ? M.marblePlain : M.wood;
    floor(x2 - x1, z2 - z1, (x1 + x2) / 2, (z1 + z2) / 2, 0.02, mat, r.kind === 'cathedral' ? 4 : 5);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1).rotateX(Math.PI / 2), M.cream);
    ceil.position.set((x1 + x2) / 2, r.h, (z1 + z2) / 2);
    add(ceil);
  }
  floor(3.2, 21, 0, -30.5, 0.035, std({ map: rugA, roughness: 0.9 }));
  floor(3.2, 15.8, 0, -11.9, 0.035, std({ map: rugB, roughness: 0.9 }));
  const beams = [-47, -41, -35, -29, -23].map((z) => ({ x: 0, y: 13.8, z, sx: 24, sy: 0.35, sz: 0.5 }));
  beams.push(...[-8, 0, 8].map((x) => ({ x, y: 13.8, z: -35, sx: 0.5, sy: 0.35, sz: 30 })));
  add(instanced(box(1, 1, 1), M.gold, beams));
  add(instanced(columnGeometry(), M.vertex, layout.allProps.filter((p) => p.type === 'column')));

  const chairPlace = (c, rot = 0, y = 0) => ({ x: c.x, y, z: c.z, ry: rot + Math.PI });
  add(instanced(liteChair(), M.vertex, cathedralChairs().map((c) => chairPlace(c))));
  add(instanced(liteChair('#e8e2d2', '#fbfaf5'), M.vertex, layout.spots.filter((s) => s.table).map((s) => chairPlace(s, s.rot))));
  add(instanced(liteChair('#c9b98e', '#7a2236'), M.vertex, musicChairs().map((c) => chairPlace(c))));
  add(instanced(liteChair('#d9b25a', '#8a1f3a'), M.vertex, layout.spots.filter((s) => s.tag === 'altar').map((s) => chairPlace(s, 0, s.y))));
  add(instanced(tableGeometry(), M.vertex, layout.allProps.filter((p) => p.type === 'table')));
  const sofaPalette = ['#2f5d62', '#8a2f3d', '#d8c9a8', '#2c3e66'];
  add(instanced(sofaGeometry(), M.vertex, layout.allProps.filter((p) => p.type === 'sofa').map((p, i) => ({ ...p, color: sofaPalette[i % 4] })), { color: true }));
  add(instanced(merge([part(cyl(0.7, 0.7, 0.05, 20), '#e9f4f8', { y: 0.48 }), part(cyl(0.06, 0.1, 0.46, 8), '#d9b25a', { y: 0.23 })]), M.vertex, layout.allProps.filter((p) => p.type === 'coffee')));
  add(instanced(pianoGeometry(), M.metalVertex, [{ x: PIANO.x, y: STAGE.y, z: PIANO.z }]));

  // pelaminan: panggung bertangga, lengkung emas berhias bunga, kursi pengantin
  (function altar() {
    const cx = (ALTAR.x1 + ALTAR.x2) / 2;
    const w = ALTAR.x2 - ALTAR.x1;
    const plat = new THREE.Mesh(box(w, ALTAR.y, ALTAR.z2 - ALTAR.z1), M.marblePlain);
    plat.position.set(cx, ALTAR.y / 2, (ALTAR.z1 + ALTAR.z2) / 2);
    plat.receiveShadow = true;
    add(plat);
    const steps = [0, 1, 2].map((i) => ({ x: cx, y: (ALTAR.y * (3 - i)) / 6, z: ALTAR.z2 + 0.2 + i * 0.4 - 0.4 + 0.4 - 0.4 * 0 + 0.0 - 0.0 + 0.4 * 0, sx: w, sy: (ALTAR.y * (3 - i)) / 3, sz: 0.4 }));
    steps.forEach((s, i) => { s.z = ALTAR.z2 + 0.2 + i * 0.4; s.y = s.sy / 2; });
    add(instanced(box(1, 1, 1), M.marblePlain, steps.reverse()));
    const baseY = ALTAR.y;
    for (const s of [-4.6, 4.6]) {
      const p = new THREE.Mesh(cyl(0.22, 0.26, 3, 12), M.gold);
      p.position.set(s, baseY + 1.5, -49.55);
      add(p);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.22, 10, 40, Math.PI), M.gold);
    arch.position.set(0, baseY + 3, -49.55);
    add(arch);
    const glowTex = altarGlowTexture();
    const back = new THREE.MeshBasicMaterial({ map: glowTex, side: THREE.DoubleSide });
    const half = new THREE.Mesh(new THREE.CircleGeometry(4.4, 40, 0, Math.PI), back);
    half.position.set(0, baseY + 3, -49.8);
    const lower = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 3), back);
    lower.position.set(0, baseY + 1.5, -49.8);
    add(half);
    add(lower);
    const rand = rng(909);
    const petals = ['#ffffff', '#ffd6e0', '#f7a8bd', '#fff3d6'];
    const flowers = [];
    for (let i = 0; i < 90; i++) {
      const a = (i / 89) * Math.PI;
      const jitter = rand() * 0.4 - 0.2;
      flowers.push({ x: Math.cos(a) * (4.6 + jitter), y: baseY + 3 + Math.sin(a) * (4.6 + jitter), z: -49.3 + rand() * 0.3, s: 0.2 + rand() * 0.2, color: petals[(rand() * 4) | 0] });
    }
    for (let i = 0; i < 60; i++) flowers.push({ x: -5.4 + rand() * 10.8, y: baseY + 0.2 + rand() * 0.6, z: -43.9 - rand() * 0.8, s: 0.2 + rand() * 0.22, color: petals[(rand() * 4) | 0] });
    for (const s of [-4.6, 4.6]) for (let i = 0; i < 24; i++) flowers.push({ x: s + (rand() - 0.5) * 0.9, y: baseY + 0.4 + rand() * 2.8, z: -49.3 + (rand() - 0.5) * 0.8, s: 0.2 + rand() * 0.18, color: petals[(rand() * 4) | 0] });
    add(instanced(ico(1), M.flower, flowers, { color: true }));
  }());

  // lambang inisial N&A yang berdenyut
  const inlayUniforms = { uMap: { value: inlayTexture(mono) }, uPulse: { value: 0 }, uTime: { value: 0 } };
  const inlay = new THREE.Mesh(new THREE.CircleGeometry(INLAY.r, 64).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: inlayUniforms, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform sampler2D uMap; uniform float uPulse; uniform float uTime;
void main(){ vec4 t = texture2D(uMap, vUv); float d = length(vUv - 0.5) * 2.0;
  float wave = sin((d - uTime * 0.8) * 14.0) * 0.5 + 0.5;
  float ring = smoothstep(0.07, 0.0, abs(d - (1.0 - uPulse))) * uPulse;
  vec3 col = t.rgb * (1.0 + 0.3 * wave * uPulse) + vec3(1.0, 0.82, 0.45) * ring * 1.6;
  gl_FragColor = vec4(col, t.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  }));
  inlay.position.set(INLAY.x, 0.045, INLAY.z);
  add(inlay);
  let pulse = 0;
  let standing = false;

  // ---------------------------------------------------------------- aula musik, fotobooth, taman, plaza
  (function music() {
    const st = new THREE.Mesh(box(STAGE.x2 - STAGE.x1, STAGE.y, STAGE.z2 - STAGE.z1), M.wood);
    st.position.set((STAGE.x1 + STAGE.x2) / 2, STAGE.y / 2, (STAGE.z1 + STAGE.z2) / 2);
    st.receiveShadow = true;
    add(st);
    const ramp = new THREE.Mesh(box(STAGE.x2 - STAGE.x1, STAGE.y * 0.5, 0.5), M.wood);
    ramp.position.set((STAGE.x1 + STAGE.x2) / 2, STAGE.y * 0.25, STAGE.z2 + 0.25);
    add(ramp);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), new THREE.MeshBasicMaterial({ color: 0x4a35a0 }));
    screen.position.set(42, 4.2, -45.8);
    add(screen);
    const sign = labelSprite('Live Musik & Hiburan', { width: 8 });
    sign.position.set(42, 7.2, -45.4);
    add(sign);
  }());
  (function photo() {
    const ax = PHOTO_SPOT.x;
    const az = PHOTO_SPOT.z - 4;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.14, 8, 28, Math.PI), M.gold);
    arch.position.set(ax, 4.2, az);
    add(arch);
    add(instanced(cyl(0.28, 0.32, 4.2, 12), M.cream, [-1, 1].map((s) => ({ x: ax + s * 1.8, y: 2.1, z: az }))));
    const rand = rng(31);
    const fl = [];
    for (let i = 0; i < 60; i++) {
      const a = (i / 59) * Math.PI;
      fl.push({ x: ax + Math.cos(a) * 1.8, y: 4.2 + Math.sin(a) * 1.8, z: az + (rand() - 0.5) * 0.3, s: 0.16 + rand() * 0.14, color: ['#ffffff', '#ffd6e0', '#f7a8bd'][(rand() * 3) | 0] });
    }
    add(instanced(ico(1), M.flower, fl, { color: true }));
    const ringMat = glowing(std({ color: 0xffffff, emissive: 0xfff0c8, roughness: 0.4 }), 0.5, 4);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(PHOTO_SPOT.r - 0.2, 0.05, 8, 48).rotateX(Math.PI / 2), ringMat);
    ring.position.set(PHOTO_SPOT.x, 0.06, PHOTO_SPOT.z);
    add(ring);
    const sign = labelSprite('Spot Foto 360°', { width: 5 });
    sign.position.set(ax, 6, az);
    add(sign);
  }());

  floor(60, 16, 0, -12, 0.015, M.stone, 5);
  floor(60, 30, 0, 45, 0.015, M.stone, 5);
  floor(2.8, 76, -32.4, 18, 0.015, M.stone, 3);
  floor(2.8, 76, 32.4, 18, 0.015, M.stone, 3);
  floor(14, 3, 37, -12, 0.015, M.stone, 3);
  floor(3, 22, 42, -15, 0.015, M.stone, 3);
  for (const g of GAZEBOS) {
    const f = new THREE.Mesh(cyl(3.1, 3.2, 0.2, 28), M.stone);
    f.position.set(g.x, 0.1, g.z);
    f.receiveShadow = true;
    add(f);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.slate);
    dome.scale.y = 0.6;
    dome.position.set(g.x, 3.4, g.z);
    dome.castShadow = true;
    add(dome);
    const tip = new THREE.Mesh(cyl(0.04, 0.07, 1.2, 6), M.gold);
    tip.position.set(g.x, 5.6, g.z);
    add(tip);
  }

  // ---------------------------------------------------------------- properti taman (instancing per jenis)
  const props = layout.allProps;
  const at = (p) => ({ x: p.x, y: p.zone === 'main' ? surfaceY(p.x, p.z) : p.y, z: p.z });
  const decorTrees = [];
  {
    const rand = rng(612);
    for (const isl of DECOR_ISLANDS) for (let i = 0; i < 4; i++) {
      const a = rand() * Math.PI * 2;
      const rr = rand() * isl.r * 0.6;
      decorTrees.push({ x: isl.x + Math.cos(a) * rr, y: isl.y, z: isl.z + Math.sin(a) * rr, s: 0.9 + rand() * 0.5 });
    }
  }
  add(instanced(sakuraGeometry(), M.vertex, [...props.filter((p) => p.type === 'sakura').map((p) => ({ ...at(p), s: (p.s ?? 1) * 1.15 })), ...decorTrees]));
  [0, 1, 2].forEach((v) => add(instanced(broadleafTreeGeometry(v), M.vertex, props.filter((p) => p.type === 'tree').filter((_, i) => i % 3 === v).map((p) => ({ ...at(p), s: (p.s ?? 1) * 1.2 })))));
  const lamps = props.filter((p) => p.type === 'lamp').map(at);
  add(instanced(lanternPostGeometry(), M.vertex, lamps));
  const bulbMat = glowing(std({ color: 0xffe9b8, emissive: 0xffd27a, roughness: 0.4 }), 0.6, 4);
  add(instanced(ico(1), bulbMat, lamps.map((l) => ({ x: l.x, y: l.y + 2.25, z: l.z, s: 0.17 })), { shadow: false }));
  add(instanced(benchGeometry(), M.vertex, props.filter((p) => p.type === 'bench').map((p) => ({ ...at(p), ry: p.ry ?? 0 }))));
  add(instanced(merge([part(cyl(0.3, 0.2, 0.7, 12), '#efe6d2', { y: 0.35 }), part(cyl(0.38, 0.3, 0.2, 12), '#d9b25a', { y: 0.8 }), part(ico(1), '#f7a8bd', { y: 1.1, sx: 0.32, sy: 0.28, sz: 0.32 })]), M.vertex, props.filter((p) => p.type === 'urn').map(at)));
  add(instanced(merge([part(cyl(0.16, 0.2, 3.4, 10), '#f3ead6', { y: 1.7 }), part(cyl(0.24, 0.24, 0.18, 10), '#d9b25a', { y: 3.4 })]), M.vertex, props.filter((p) => p.type === 'post').map(at)));
  add(instanced(merge([part(cyl(0.28, 0.32, 4.2, 12), '#f3ead6', { y: 2.1 }), part(cyl(0.38, 0.38, 0.22, 12), '#d9b25a', { y: 4.2 })]), M.vertex, props.filter((p) => p.type === 'pillar' && p.zone !== 'main').map(at)));
  add(instanced(merge([part(cyl(0.05, 0.08, 1.4, 6), '#2b2b2e', { y: 0.7 }), part(cyl(0.12, 0.16, 1.2, 10), '#d9b25a', { y: 1.5, rx: -0.9, z: -0.3 })]), M.vertex, props.filter((p) => p.type === 'telescope').map(at)));
  const pots = [];
  for (let z = -19; z <= -5; z += 2.8) pots.push({ x: -4.2, y: 0, z, s: 1 }, { x: 4.2, y: 0, z, s: 1 });
  add(instanced(potPlantGeometry(), M.vertex, pots));

  // air mancur: bejana bertingkat dengan pancuran yang beranimasi
  const jets = [];
  const jetMat = std({ color: 0xcdeeff, transparent: true, opacity: 0.55, roughness: 0.1, emissive: 0x9fd8ff, emissiveIntensity: 0.15 });
  function fountain(x, z, R) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const basin = new THREE.Mesh(cyl(R, R * 0.94, 0.7, 36), M.stone);
    basin.position.y = 0.35;
    basin.castShadow = true;
    g.add(basin);
    const water = new THREE.Mesh(new THREE.CircleGeometry(R * 0.9, 36).rotateX(-Math.PI / 2), std({ color: 0x66dde6, roughness: 0.05, transparent: true, opacity: 0.8 }));
    water.position.y = 0.62;
    g.add(water);
    const pillar = new THREE.Mesh(cyl(0.28, 0.4, 1.8, 14), M.cream);
    pillar.position.y = 1.3;
    g.add(pillar);
    const bowl = new THREE.Mesh(cyl(R * 0.5, 0.4, 0.3, 24), M.gold);
    bowl.position.y = 2.2;
    g.add(bowl);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const jet = new THREE.Mesh(cyl(0.03, 0.12, 1, 6), jetMat);
      jet.position.set(Math.cos(a) * R * 0.45, 2.6, Math.sin(a) * R * 0.45);
      jet.userData.base = 1.2 + (i % 2) * 0.5;
      g.add(jet);
      jets.push(jet);
    }
    const top = new THREE.Mesh(cyl(0.05, 0.14, 1, 6), jetMat);
    top.position.set(0, 3, 0);
    top.userData.base = 1.8;
    g.add(top);
    jets.push(top);
    add(g);
  }
  fountain(FOUNTAIN.x, FOUNTAIN.z, 3.2);
  fountain(-14, -11, 1.6);
  fountain(14, -11, 1.6);

  // ---------------------------------------------------------------- portal cahaya dan pad permainan
  const beamMat = (color) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    vertexShader: 'varying float vH; void main(){ vH = (position.y + 8.0) / 16.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vH; uniform vec3 uColor; uniform float uTime; void main(){ float a = (1.0 - vH) * 0.5 * (0.75 + 0.25 * sin(uTime * 2.0 + vH * 6.0)); gl_FragColor = vec4(uColor, a); }',
  });
  const portals = PORTALS.map((p) => {
    const y = p.zone === 'main' ? 0 : ISLANDS.find((i) => i.id === p.zone).y;
    const g = new THREE.Group();
    g.position.set(p.x, y, p.z);
    const ringMat = glowing(std({ color: 0xffffff, emissive: p.color, roughness: 0.3 }), 1.1, 1.2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(p.r - 0.1, 0.09, 10, 40).rotateX(Math.PI / 2), ringMat);
    ring.position.y = 0.06;
    g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(p.r - 0.15, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.position.y = 0.05;
    g.add(disc);
    const bm = beamMat(p.color);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(p.r - 0.3, p.r - 0.3, 16, 24, 1, true), bm);
    beam.position.y = 8;
    g.add(beam);
    const label = labelSprite(p.label, { color: p.zone === 'main' ? '#ffe9a8' : '#cfe8ff', width: 5.2 });
    label.position.y = 3.6;
    g.add(label);
    add(g);
    return { ring, disc, bm };
  });
  const pads = GAME_PADS.map((p) => {
    const y = ISLANDS.find((i) => i.id === p.zone).y;
    const color = p.kind === 'firework' ? p.color : 0x7dffb8;
    const g = new THREE.Group();
    g.position.set(p.x, y, p.z);
    const base = new THREE.Mesh(cyl(p.r, p.r, 0.12, 28), glowing(std({ color: 0x101820, emissive: color, roughness: 0.4 }), 0.8, 1.2));
    base.position.y = 0.06;
    g.add(base);
    if (p.kind === 'spring') {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(p.r * 0.55, 0.08, 8, 24).rotateX(Math.PI / 2), M.gold);
      coil.position.y = 0.2;
      g.add(coil);
    }
    const label = labelSprite(p.label, { width: 4 });
    label.position.y = 2.3;
    g.add(label);
    add(g);
    return { base };
  });
  for (const isl of ISLANDS) {
    const label = labelSprite(isl.name, { width: 7 });
    label.position.set(isl.cx, isl.y + 6, isl.cz);
    add(label);
    const g = buildFloatingIsland(isl.r, islandMats, { seed: isl.r * 7, falls: isl.kind !== 'star' });
    g.position.set(isl.cx, isl.y, isl.cz);
    add(g);
    const ringMat = glowing(std({ color: 0xffffff, emissive: 0xfff0c8, roughness: 0.4 }), 0.35, 3);
    const path = new THREE.Mesh(new THREE.RingGeometry(isl.r - 1.8, isl.r - 1.4, 64).rotateX(-Math.PI / 2), ringMat);
    path.position.set(isl.cx, isl.y + 0.04, isl.cz);
    add(path);
  }
  DECOR_ISLANDS.forEach((isl, i) => {
    const g = buildFloatingIsland(isl.r, islandMats, { seed: 100 + i, falls: true });
    g.position.set(isl.x, isl.y, isl.z);
    add(g);
  });

  // ---------------------------------------------------------------- pembaruan per frame
  return {
    root,
    inlay: {
      pulse() { pulse = 1; },
      setStanding(v) { standing = v; },
    },
    /** Menerapkan atmosfer langit (cahaya, kabut, lampu menyala saat malam). */
    setAtmosphere(a) {
      atmosphere = a;
      sun.color.copy(a.sunColor);
      sun.intensity = a.sunIntensity;
      hemi.color.copy(a.hemiSky);
      hemi.groundColor.copy(a.hemiGround);
      hemi.intensity = a.hemiIntensity;
      scene.fog.color.copy(a.fogColor);
      scene.environmentIntensity = a.envIntensity;
      for (const g of glow) g.mat.emissiveIntensity = g.base * (1 + g.gain * a.night);
      for (const w of waterfalls) w.uniforms.uNight.value = a.night;
    },
    update(t, dt, focus, indoor) {
      if (atmosphere) {
        sun.target.position.set(focus.x, focus.y, focus.z);
        sun.position.copy(sun.target.position).addScaledVector(atmosphere.sunDir, 90);
      }
      indoorLight.position.set(focus.x, focus.y + 2.8, focus.z);
      indoorLight.intensity += ((indoor ? 22 : 0) - indoorLight.intensity) * Math.min(1, dt * 4);
      seaNormal.offset.set(t * 0.004, t * 0.003);
      lakeNormal.offset.set(t * 0.012, -t * 0.009);
      for (const w of waterfalls) w.uniforms.uTime.value = t;
      for (const j of jets) {
        const k = j.userData.base * (0.8 + 0.2 * Math.sin(t * 3 + j.position.x * 3));
        j.scale.y = k;
        j.position.y = (j.userData.base > 1.7 ? 3 : 2.2) + k / 2;
      }
      lanterns.forEach((l, i) => {
        dummy.position.set(l.x + Math.sin(t * 0.3 + l.phase) * 0.15, l.y + Math.sin(t * 1.4 + l.phase) * 0.04, l.z + Math.cos(t * 0.25 + l.phase) * 0.15);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(l.s);
        dummy.updateMatrix();
        lanternMesh?.setMatrixAt(i, dummy.matrix);
      });
      if (lanternMesh) lanternMesh.instanceMatrix.needsUpdate = true;
      portals.forEach((p, i) => {
        p.bm.uniforms.uTime.value = t + i;
        p.ring.rotation.y = t * 0.6;
        p.disc.material.opacity = 0.28 + 0.14 * Math.sin(t * 2.4 + i);
      });
      pads.forEach((p, i) => { p.base.scale.y = 1 + 0.25 * Math.sin(t * 3 + i); });
      pulse = standing ? Math.max(pulse, 0.5 + 0.25 * Math.sin(t * 3)) : Math.max(0, pulse - dt * 0.7);
      inlayUniforms.uPulse.value = pulse;
      inlayUniforms.uTime.value = t;
    },
  };
}
