import * as THREE from 'three';
import { HALL, POOLS, POOL_FLOOR_Y, WATER_Y, FOUNTAINS, PODS, GAZEBO, GAZEBO_DECK, DAIS, BRIDGES, TABLES, SEATS, PALMS, FLOWER_COLUMNS, GAZEBO_COLUMNS, subtractRects } from './hall-layout.js';
import { Batcher, instanced, seeded, transform, domeProfile, domeRibs } from './hall-kit.js';
import { createHallTextures, tiled } from './hall-textures.js';
import { createSky, createSimpleSky, createSimpleSea, createEnvironment, createSea, createFarScenery, createBoats, createPools, createFountains, createGlowPoints, createFireflies, SUN_DIR } from './hall-fx.js';
import { buildPalace, PALACE_FRONT_Z, ARCH } from './hall-palace.js';

// NIKORA Royal Wedding World: dunia 3D Aula Resepsi. Semua prosedural (tanpa file aset).
// Titik masuk: buildHallWorld({ scene, renderer }) -> { update, screenSpec, setShadows, dispose }

const FOG_COLOR = 0xe6a28e;
let LITE = false; // diatur oleh buildHallWorld (mode ringan)

function makeMaterials(tex) {
  const std = (o, ud = {}) => {
    const m = new THREE.MeshStandardMaterial(o);
    Object.assign(m.userData, ud);
    return m;
  };
  tex.facade.wrapS = tex.facade.wrapT = THREE.RepeatWrapping;
  const out = {
    marble: std({ map: tex.marble, color: 0xe9e6e2, roughness: 0.24, envMapIntensity: 0.55 }, { worldUV: 0.25, cast: false }),
    stone: std({ map: tex.facade, bumpMap: tex.facadeBump, bumpScale: 1.8, roughness: 0.85, color: 0xf3e6cf }, { worldUV: 0.14 }),
    stoneWhite: std({ color: 0xe9e3d8, roughness: 0.6, envMapIntensity: 0.5 }),
    gold: std({ color: 0xdcab4a, metalness: 1, roughness: 0.28, envMapIntensity: 1.3 }),
    domeBlue: std({ color: 0x6a86ad, metalness: 0.85, roughness: 0.28, envMapIntensity: 1.4 }),
    domeTeal: std({ color: 0x4aa39b, metalness: 0.8, roughness: 0.32, envMapIntensity: 1.3 }),
    hallWall: std({ color: 0xf0d4a0, emissive: 0xb87a2c, emissiveIntensity: 0.28, roughness: 0.7 }, { cast: false }),
    windowGlow: new THREE.MeshBasicMaterial({ map: tex.windowGlow, fog: true }),
    cloth: std({ color: 0xfbf8f2, roughness: 0.95 }),
    chairSeat: std({ color: 0xf1e7d4, roughness: 0.8 }),
    plate: std({ color: 0xffffff, roughness: 0.25 }),
    carpet: std({ map: tex.carpet, roughness: 0.95 }, { worldUV: 0.5, cast: false }),
    grass: std({ map: tex.grass, roughness: 1 }, { worldUV: 0.12, cast: false }),
    rock: std({ map: tex.rock, bumpMap: tex.rockBump, bumpScale: 3, roughness: 0.95 }),
    trunk: std({ color: 0x7a5a3a, roughness: 0.95 }),
    leaf: std({ color: 0x3d7a34, roughness: 0.85 }),
    cypress: std({ color: 0x24491f, roughness: 0.9 }),
    sheer: new THREE.MeshStandardMaterial({ map: tex.sheer, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, roughness: 1, color: 0xfff4ee, emissive: 0x553322, emissiveIntensity: 0.25 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 }),
    flower: std({ color: 0xffffff, roughness: 0.75 }, { cast: false }),
    petalLeaf: std({ color: 0x4f8c3c, roughness: 0.8 }, { cast: false }),
    candle: new THREE.MeshBasicMaterial({ color: 0xfff1c9 }),
    frond: new THREE.MeshStandardMaterial({ map: tex.frond, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, color: 0xffffff }),
  };
  out.sheer.userData.cast = false;
  out.glass.userData.cast = false;
  return out;
}

const FLOWER_PALETTE = [0xffffff, 0xfff6ec, 0xffe2e8, 0xffc9d6, 0xf6a9bd, 0xf3e7ff, 0xfffbe6];

/** Perangkat tanpa GPU (render perangkat lunak) atau ?detail=ringan memakai dunia yang lebih ringan. */
export function wantsLiteWorld(renderer) {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('detail');
    if (q === 'ringan') return true;
    if (q === 'tinggi') return false;
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    return /swiftshader|llvmpipe|softpipe|software/i.test(name);
  } catch {
    return false;
  }
}

/** Mode ringan: ganti material PBR dengan Lambert (tanpa pantulan lingkungan, peta tonjolan, atau peta normal). */
function lightenMaterials(root) {
  const cache = new Map();
  const lighter = (m) => {
    if (!m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) return m;
    if (cache.has(m)) return cache.get(m);
    const metal = m.metalness > 0.5;
    const out = new THREE.MeshLambertMaterial({
      color: m.color,
      map: m.map,
      emissive: metal ? m.color.clone().multiplyScalar(0.35) : m.emissive,
      emissiveIntensity: metal ? 1 : m.emissiveIntensity,
      transparent: m.transparent,
      opacity: m.opacity,
      side: m.side,
      alphaTest: m.alphaTest,
      depthWrite: m.depthWrite,
    });
    out.userData = { ...m.userData };
    cache.set(m, out);
    return out;
  };
  root.traverse((o) => {
    if (o.material && !Array.isArray(o.material)) o.material = lighter(o.material);
  });
}

export function buildHallWorld({ scene, renderer, lite = wantsLiteWorld(renderer) }) {
  const root = new THREE.Group();
  scene.add(root);
  const tex = createHallTextures();
  const mats = makeMaterials(tex);
  const r = seeded(2026);
  const glow = [];
  const flowers = [];
  const leaves = [];
  const sparkle = (list, x, y, z, size = 0.5, color = 0xffd9a0, flicker = 0) => list.push({ x, y, z, size, color, flicker });

  // ---- Langit, kabut, cahaya ----
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, 95, 430);
  LITE = lite;
  Batcher.detail = lite ? 0.55 : 1;
  const sky = lite ? createSimpleSky(480) : createSky(480);
  root.add(sky);
  if (!lite) {
    scene.environment = createEnvironment(renderer);
    scene.environmentIntensity = 0.55;
  }
  const sea = lite ? createSimpleSea(scene.fog) : createSea(tex, scene.fog);
  root.add(sea.mesh);
  root.add(createFarScenery(tex, { lite }));
  const boats = createBoats();
  if (!lite) root.add(boats.group);

  const hemi = new THREE.HemisphereLight(0xffe0cc, 0x5a6a96, lite ? 1.0 : 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9d5c, 2.6);
  sun.castShadow = !lite;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 5, far: 170 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x9aa0ff, 0.35);
  fill.position.set(-30, 40, 40);
  scene.add(fill);

  const points = [
    [0xffc890, 160, 46, 0, 9, -19],
    [0xffc890, 80, 26, 0, 5, 6],
    [0xffc890, 90, 30, -22, 5.6, -3],
    [0xffc890, 60, 26, 22, 5, -4],
    [0x58dcff, 38, 14, -11.4, 1.6, -9.2],
    [0x58dcff, 38, 14, 11.4, 1.6, -9.2],
  ].filter(() => !lite).map(([color, intensity, dist, x, y, z]) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, y, z);
    scene.add(l);
    return l;
  });

  // ---- Tanah ----
  const ground = new Batcher();
  const flat = (mat, x0, x1, z0, z1, y = 0) => {
    ground.geometry(mat, new THREE.PlaneGeometry(x1 - x0, z1 - z0), (x0 + x1) / 2, y, (z0 + z1) / 2, 0, -Math.PI / 2);
  };
  // plaza marmer: dasar utama berlubang kolam
  for (const p of subtractRects({ x0: -29, x1: 30, z0: PALACE_FRONT_Z, z1: 24 }, POOLS)) flat(mats.marble, p.x0, p.x1, p.z0, p.z1);
  flat(mats.marble, -62, -29, PALACE_FRONT_Z, -10);
  flat(mats.marble, 30, 62, PALACE_FRONT_Z, -10);
  flat(mats.marble, -4.4, 4.4, 24, 220);
  flat(mats.grass, -300, -4.4, 24, 300, -0.05);
  flat(mats.grass, 4.4, 30, 24, 300, -0.05);
  flat(mats.grass, -300, 300, -300, PALACE_FRONT_Z, -0.05);
  flat(mats.grass, -300, -62, PALACE_FRONT_Z, 24, -0.05);
  flat(mats.grass, 62, 300, PALACE_FRONT_Z, -10, -0.05);
  // dinding penahan di sisi laut (kanan) dan depan
  ground.slab(mats.stone, 1.6, 9.2, 330, 30.8, -9, -80);
  ground.slab(mats.stone, 1.6, 9.2, 40, 61.2, -9, -30);
  ground.slab(mats.stone, 32, 9.2, 1.6, 46, -9, -10);
  // jalur emas di tepi jalur marmer + medali
  for (const x of [-4.45, 4.45]) ground.slab(mats.gold, 0.08, 0.04, HALL.bounds.maxZ - HALL.stage.frontZ, x, 0, (HALL.bounds.maxZ + HALL.stage.frontZ) / 2);
  for (const x of [-4.1, 4.1]) ground.slab(mats.gold, 0.04, 0.035, HALL.bounds.maxZ - HALL.stage.frontZ, x, 0, (HALL.bounds.maxZ + HALL.stage.frontZ) / 2);
  // tepi kolam (coping): bibir marmer yang menonjol
  for (const p of POOLS) {
    const w = p.x1 - p.x0;
    const d = p.z1 - p.z0;
    const cx = (p.x0 + p.x1) / 2;
    const cz = (p.z0 + p.z1) / 2;
    for (const [bw, bd, x, z] of [[w + 0.9, 0.45, cx, p.z0 - 0.22], [w + 0.9, 0.45, cx, p.z1 + 0.22], [0.45, d, p.x0 - 0.22, cz], [0.45, d, p.x1 + 0.22, cz]]) {
      ground.slab(mats.stoneWhite, bw, 0.16, bd, x, -0.1, z);
    }
    ground.slab(mats.gold, w + 0.2, 0.02, 0.06, cx, 0.05, p.z0 - 0.02);
  }
  ground.build(root);

  const medalMat = new THREE.MeshStandardMaterial({ map: tex.medallion, transparent: true, roughness: 0.3, metalness: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, envMapIntensity: 1 });
  for (const [z, s] of [[9.8, 6.6], [-2.0, 8.4], [-13.2, 7.6]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), medalMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.025, z);
    m.receiveShadow = true;
    root.add(m);
  }

  // ---- Kolam, jembatan, pulau ----
  const pools = createPools(tex, { lite });
  root.add(pools.group);
  const decks = new Batcher();
  const deckBox = (x0, x1, z0, z1, mat = mats.marble, withTrim = true) => {
    decks.slab(mat, x1 - x0, 0.4, z1 - z0, (x0 + x1) / 2, -0.37, (z0 + z1) / 2);
    if (withTrim) decks.slab(mats.gold, x1 - x0 + 0.04, 0.03, z1 - z0 + 0.04, (x0 + x1) / 2, -0.07, (z0 + z1) / 2);
  };
  for (const b of BRIDGES) {
    deckBox(b.x0, b.x1, b.z0, b.z1, mats.marble, false);
    // pagar jembatan: tiang dan pegangan
    const horizontal = b.x1 - b.x0 > b.z1 - b.z0;
    const len = horizontal ? b.x1 - b.x0 : b.z1 - b.z0;
    const n = Math.max(2, Math.round(len / 1.0));
    for (const side of [0, 1]) {
      const fixed = horizontal ? (side ? b.z1 - 0.06 : b.z0 + 0.06) : (side ? b.x1 - 0.06 : b.x0 + 0.06);
      for (let i = 0; i <= n; i += 1) {
        const t = (horizontal ? b.x0 : b.z0) + (len * i) / n;
        const x = horizontal ? t : fixed;
        const z = horizontal ? fixed : t;
        decks.slab(mats.stoneWhite, 0.1, 0.8, 0.1, x, 0, z);
        if (i % 2 === 0) sparkle(glow, x, 0.95, z, 0.45, 0xffd9a0, 0.2);
      }
      if (horizontal) decks.slab(mats.gold, len, 0.06, 0.08, (b.x0 + b.x1) / 2, 0.82, fixed);
      else decks.slab(mats.gold, 0.08, 0.06, len, fixed, 0.82, (b.z0 + b.z1) / 2);
    }
    // tiang penyangga di dalam air
    for (let i = 0; i <= n; i += 2) {
      const t = (horizontal ? b.x0 : b.z0) + (len * i) / n;
      decks.cyl(mats.stoneWhite, 0.22, 0.26, 0.9, horizontal ? t : (b.x0 + b.x1) / 2, POOL_FLOOR_Y, horizontal ? (b.z0 + b.z1) / 2 : t, 10);
    }
  }
  for (const pod of PODS) {
    deckBox(pod.x - pod.half, pod.x + pod.half, pod.z - pod.half, pod.z + pod.half);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      decks.cyl(mats.stoneWhite, 0.3, 0.34, 0.95, pod.x + sx * (pod.half - 0.4), POOL_FLOOR_Y, pod.z + sz * (pod.half - 0.4), 10);
    }
    // cincin emas di sekeliling meja pulau
    decks.add(new THREE.RingGeometry(1.95, 2.0, 48), mats.gold, transform(pod.x, 0.045, pod.z, -Math.PI / 2));
    canopy(decks, mats, glow, flowers, leaves, r, pod);
  }
  deckBox(GAZEBO_DECK.x0, GAZEBO_DECK.x1, GAZEBO_DECK.z0, GAZEBO_DECK.z1);
  decks.cyl(mats.stoneWhite, 0.3, 0.34, 0.95, GAZEBO.x + 3.8, POOL_FLOOR_Y, GAZEBO.z + 3.4, 10);
  decks.cyl(mats.stoneWhite, 0.3, 0.34, 0.95, GAZEBO.x + 3.8, POOL_FLOOR_Y, GAZEBO.z - 3.4, 10);
  decks.build(root);

  // ---- Air mancur ----
  const fountains = createFountains(tex, { lite });
  root.add(fountains.group);

  // ---- Istana + pelaminan ----
  buildPalace(root, mats, glow);
  buildStage(root, mats, tex, glow, flowers, leaves, r);

  // ---- Gazebo kaca, panggung bundar, gapura, tiang bunga ----
  buildGazebo(root, mats, glow, flowers, leaves, r);
  buildDais(root, mats, glow, flowers, leaves, r);
  buildEntrance(root, mats, glow, flowers, leaves, r);
  const poles = new Batcher();
  for (const c of FLOWER_COLUMNS) {
    poles.cyl(mats.stoneWhite, 0.3, 0.34, 0.55, c.x, 0, c.z, 14);
    poles.cyl(mats.gold, 0.34, 0.34, 0.08, c.x, 0.55, c.z, 14);
    poles.cyl(mats.stoneWhite, 0.1, 0.13, 2.0, c.x, 0.6, c.z, 10);
    poles.sphere(mats.stoneWhite, 0.28, c.x, 2.7, c.z, 1, 0.8, 1);
    cluster(flowers, leaves, r, c.x, 2.85, c.z, 0.46, 34, 0.85);
    sparkle(glow, c.x, 3.3, c.z, 0.9, 0xffd9a0, 0.15);
    sparkle(glow, c.x, 1.7, c.z, 0.35, 0xffe0a8, 0.1);
  }
  // tiang lentera bergaya emas di sudut plaza
  for (const [x, z] of [[-19.9, 8.9], [19.9, 8.9], [-4.9, 8.9], [4.9, 8.9], [-19.9, -13.2], [19.9, -13.2], [-4.9, -15.0], [4.9, -15.0]]) lantern(poles, mats, glow, x, z);
  poles.build(root);

  // ---- Meja dan kursi ----
  buildTables(root, mats, glow, flowers, leaves, r);

  // ---- Balustrade, taman, pohon ----
  buildGardens(root, mats, tex, glow, flowers, leaves, r);
  buildCliff(root, mats, tex, glow, flowers, leaves, r);

  // bunga dan daun dalam dua InstancedMesh
  root.add(instanced(new THREE.SphereGeometry(0.075, 5, 3), mats.flower, flowers.filter((_, i) => !LITE || i % 2 === 0).map((f) => ({ ...f, s: (f.s ?? 1) * (LITE ? 1.35 : 1), color: f.color ?? FLOWER_PALETTE[Math.floor(r() * FLOWER_PALETTE.length)] })), { castShadow: false }));
  root.add(instanced(new THREE.SphereGeometry(0.09, 5, 4), mats.petalLeaf, leaves.map((l) => ({ ...l, color: [0x3c7a35, 0x4f8c3c, 0x2f6a2d][Math.floor(r() * 3)] })), { castShadow: false }));

  // untaian lampu melintang di atas taman
  stringLights(root, glow, r);

  // lampu bawah air dan lilin
  for (const p of POOLS) for (let i = 0; i < 18; i += 1) sparkle(glow, p.x0 + 0.6 + r() * (p.x1 - p.x0 - 1.2), POOL_FLOOR_Y + 0.15, p.z0 + 0.6 + r() * (p.z1 - p.z0 - 1.2), 1.6, 0x58dcff, 0.1);
  for (const f of FOUNTAINS) sparkle(glow, f.x, 0.5, f.z, 5.0, 0x58dcff, 0.05);

  const glowPoints = createGlowPoints(lite ? glow.filter((g) => g.size >= 1.4) : glow, tex);
  root.add(glowPoints.points);
  const fireflies = createFireflies(tex, { count: lite ? 0 : 140 });
  if (!lite) root.add(fireflies.points);

  if (lite) {
    scene.environment = null;
    lightenMaterials(root);
  }

  const screenSpec = { x: 0, y: 3.9, z: PALACE_FRONT_Z - ARCH.depth + 0.5, width: 8, height: 4.5 };

  const sunOffset = SUN_DIR.clone().multiplyScalar(90);
  return {
    screenSpec,
    update(now, focus, camera) {
      sun.target.position.set(Math.round(focus.x), 0, Math.round(focus.z));
      sun.position.copy(sun.target.position).add(sunOffset);
      sky.position.copy(camera.position);
      sea.material.uniforms.uTime.value = now;
      pools.update(now);
      fountains.update(now, camera, renderer);
      glowPoints.update(now, camera, renderer);
      fireflies.update(now, camera, renderer);
      boats.update(now);
      tex.waterfall.offset.y = (-now * 0.55) % 1;
    },
    lite,
    setShadows(on) {
      sun.castShadow = on && !lite;
    },
    lights: points,
    dispose() {
      scene.remove(root, hemi, sun, sun.target, fill, ...points);
    },
  };
}

// ---------------------------------------------------------------------------------------------
function cluster(flowers, leaves, r, cx, cy, cz, radius, count, flatten = 1) {
  for (let i = 0; i < count; i += 1) {
    const a = r() * Math.PI * 2;
    const b = Math.acos(2 * r() - 1);
    const rr = radius * Math.cbrt(r());
    flowers.push({ x: cx + Math.sin(b) * Math.cos(a) * rr, y: cy + Math.cos(b) * rr * flatten, z: cz + Math.sin(b) * Math.sin(a) * rr, s: 0.8 + r() * 1.1 });
  }
  for (let i = 0; i < Math.ceil(count / 3); i += 1) {
    const a = r() * Math.PI * 2;
    const rr = radius * (0.7 + r() * 0.4);
    leaves.push({ x: cx + Math.cos(a) * rr, y: cy - radius * 0.25 + r() * radius * 0.5, z: cz + Math.sin(a) * rr, sx: 1.2, sy: 0.55, sz: 1.2, ry: a });
  }
}

function lantern(b, mats, glow, x, z) {
  b.cyl(mats.gold, 0.1, 0.16, 3.4, x, 0, z, 8);
  b.cyl(mats.gold, 0.2, 0.2, 0.12, x, 0, z, 10);
  b.box(mats.gold, 0.44, 0.06, 0.44, x, 3.5, z);
  b.cyl(mats.candle, 0.16, 0.16, 0.5, x, 3.52, z, 8);
  b.cyl(mats.gold, 0.02, 0.28, 0.3, x, 4.02, z, 4);
  glow.push({ x, y: 3.75, z, size: 1.6, color: 0xffd08a, flicker: 0.12 });
}

function chairParts(b, mats, x, z, rot) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const part = (mat, w, h, d, lx, y, lz) => {
    const [px, pz] = at(lx, lz);
    b.box(mat, w, h, d, px, y, pz, rot);
  };
  part(mats.chairSeat, 0.48, 0.08, 0.46, 0, 0.46, 0);
  for (const [lx, lz] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) part(mats.gold, 0.035, 0.44, 0.035, lx, 0.22, lz);
  for (const lx of [-0.2, 0.2]) part(mats.gold, 0.035, 0.56, 0.035, lx, 0.78, 0.21);
  part(mats.gold, 0.44, 0.05, 0.04, 0, 1.04, 0.21);
  part(mats.gold, 0.4, 0.04, 0.03, 0, 0.74, 0.21);
  part(mats.gold, 0.03, 0.3, 0.03, 0, 0.88, 0.21);
}

function buildTables(parent, mats, glow, flowers, leaves, r) {
  const b = new Batcher();
  for (const t of TABLES) {
    b.cyl(mats.cloth, 1.05, 1.2, 0.76, t.x, 0, t.z, 28);
    b.cyl(mats.gold, 1.08, 1.08, 0.04, t.x, 0.74, t.z, 28);
    b.cyl(mats.cloth, 1.12, 1.12, 0.03, t.x, 0.76, t.z, 28);
    for (let i = 0; i < HALL.seatsPerTable; i += 1) {
      const a = (i / HALL.seatsPerTable) * Math.PI * 2 + 0.4;
      b.cyl(mats.gold, 0.2, 0.2, 0.012, t.x + Math.cos(a) * 0.72, 0.79, t.z + Math.sin(a) * 0.72, 16);
      b.cyl(mats.plate, 0.16, 0.14, 0.02, t.x + Math.cos(a) * 0.72, 0.8, t.z + Math.sin(a) * 0.72, 16);
      b.cyl(mats.plate, 0.035, 0.035, 0.15, t.x + Math.cos(a + 0.35) * 0.8, 0.79, t.z + Math.sin(a + 0.35) * 0.8, 8);
    }
    // vas emas, bunga, dua lilin
    b.cyl(mats.gold, 0.1, 0.16, 0.34, t.x, 0.79, t.z, 12);
    b.cyl(mats.gold, 0.03, 0.03, 0.4, t.x, 1.1, t.z, 6);
    cluster(flowers, leaves, r, t.x, 1.42, t.z, 0.26, 30, 0.9);
    for (const sgn of [-1, 1]) {
      b.cyl(mats.gold, 0.03, 0.05, 0.1, t.x + sgn * 0.45, 0.79, t.z + 0.1, 8);
      b.cyl(mats.candle, 0.022, 0.022, 0.32, t.x + sgn * 0.45, 0.89, t.z + 0.1, 6);
      glow.push({ x: t.x + sgn * 0.45, y: 1.27, z: t.z + 0.1, size: 0.55, color: 0xffcf85, flicker: 0.35 });
    }
  }
  for (const s of SEATS) chairParts(b, mats, s.x, s.z, s.rot);
  // payung krem di meja teras tepi
  for (const t of TABLES.slice(9, 13)) {
    b.cyl(mats.gold, 0.035, 0.035, 2.8, t.x, 0.8, t.z, 6);
  }
  b.build(parent);
  const umbrella = new THREE.ConeGeometry(2.4, 0.7, 16, 1, true);
  const um = new THREE.MeshStandardMaterial({ color: 0xfaf0dc, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.4 });
  parent.add(instanced(umbrella, um, TABLES.slice(9, 13).map((t) => ({ x: t.x, y: 3.45, z: t.z })), { castShadow: true }));
  for (const t of TABLES.slice(9, 13)) glow.push({ x: t.x, y: 3.05, z: t.z, size: 2.0, color: 0xffcf85, flicker: 0.05 });
}

function canopy(b, mats, glow, flowers, leaves, r, pod) {
  const h = pod.half - 0.5;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = pod.x + sx * h;
    const z = pod.z + sz * h;
    b.cyl(mats.gold, 0.06, 0.08, 3.6, x, 0.0, z, 8);
    b.cyl(mats.gold, 0.14, 0.14, 0.16, x, 0.0, z, 10);
    cluster(flowers, leaves, r, x, 3.6, z, 0.3, 16, 0.8);
  }
  b.add(new THREE.TorusGeometry(h * Math.SQRT2, 0.05, 6, 40), mats.gold, transform(pod.x, 3.6, pod.z, Math.PI / 2));
  b.add(new THREE.CylinderGeometry(h * 1.22, h * 1.22, 2.4, 24, 1, true), mats.sheer, transform(pod.x, 2.4, pod.z));
  glow.push({ x: pod.x, y: 3.5, z: pod.z, size: 3.0, color: 0xffcf85, flicker: 0.05 });
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    glow.push({ x: pod.x + Math.cos(a) * h * 1.4, y: 3.55, z: pod.z + Math.sin(a) * h * 1.4, size: 0.5, color: 0xffe0a8, flicker: 0.2 });
  }
}

function buildStage(parent, mats, tex, glow, flowers, leaves, r) {
  const b = new Batcher();
  const S = HALL.stage;
  const w = S.halfWidth * 2;
  const d = S.frontZ - S.backZ;
  const cz = (S.frontZ + S.backZ) / 2;
  for (const [inset, h] of [[0, 0.2], [0.45, 0.38], [0.9, S.height]]) b.slab(mats.marble, w - inset * 2, h, d - inset, 0, 0, cz - inset / 2);
  for (const [inset, h] of [[0, 0.2], [0.45, 0.38], [0.9, S.height]]) b.slab(mats.gold, w - inset * 2 + 0.04, 0.025, d - inset + 0.04, 0, h, cz - inset / 2);
  b.slab(mats.carpet, 3.2, 0.02, d - 1.6, 0, S.height, cz - 0.4);
  // sofa pelaminan
  for (const x of [-1.2, 1.2]) {
    b.slab(mats.chairSeat, 1.8, 0.5, 0.9, x, S.height, -22.9);
    b.slab(mats.chairSeat, 1.8, 1.1, 0.25, x, S.height + 0.2, -23.4);
    b.slab(mats.gold, 1.9, 0.12, 0.98, x, S.height, -22.9);
    for (const sx of [-0.95, 0.95]) b.slab(mats.chairSeat, 0.2, 0.7, 0.9, x + sx, S.height, -22.9);
  }
  // gapura lengkung bunga di atas sofa
  b.add(new THREE.TorusGeometry(3.6, 0.13, 8, 40, Math.PI), mats.gold, transform(0, S.height, -23.9));
  b.cyl(mats.gold, 0.13, 0.17, 0.2, -3.6, S.height, -23.9, 10);
  b.cyl(mats.gold, 0.13, 0.17, 0.2, 3.6, S.height, -23.9, 10);
  for (let i = 0; i <= 40; i += 1) {
    const a = (i / 40) * Math.PI;
    const x = Math.cos(a) * 3.6;
    const y = S.height + Math.sin(a) * 3.6;
    cluster(flowers, leaves, r, x, y, -23.9, 0.28, 4, 1);
    if (i % 4 === 0) glow.push({ x, y, z: -23.7, size: 0.7, color: 0xffd9a0, flicker: 0.15 });
  }
  for (const sx of [-1, 1]) {
    cluster(flowers, leaves, r, sx * 4.4, 1.5, -18.6, 0.8, 70, 1.2);
    cluster(flowers, leaves, r, sx * 4.4, 0.9, -18.6, 0.6, 40, 1);
    b.cyl(mats.gold, 0.35, 0.45, 0.8, sx * 4.4, S.height, -18.6, 14);
    glow.push({ x: sx * 4.4, y: 2.1, z: -18.6, size: 1.6, color: 0xffd9a0, flicker: 0.1 });
  }
  b.build(parent);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshStandardMaterial({ map: tex.medallion, transparent: true, depthWrite: false, roughness: 0.3, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, S.height + 0.03, -20.7);
  parent.add(m);
}

function buildGazebo(parent, mats, glow, flowers, leaves, r) {
  const b = new Batcher();
  const { x, z, radius, columnRing } = GAZEBO;
  const topY = 5.0;
  for (const c of GAZEBO_COLUMNS) {
    b.cyl(mats.gold, 0.34, 0.38, 0.2, c.x, 0, c.z, 12);
    b.cyl(mats.stoneWhite, 0.2, 0.26, topY - 0.3, c.x, 0.2, c.z, 14);
    b.cyl(mats.gold, 0.32, 0.22, 0.3, c.x, topY - 0.3, c.z, 12);
    cluster(flowers, leaves, r, c.x, 1.3, c.z, 0.35, 16, 1);
  }
  for (const [y, tube] of [[topY, 0.2], [topY + 0.45, 0.1]]) b.add(new THREE.TorusGeometry(columnRing, tube, 8, 64), mats.gold, transform(x, y, z, Math.PI / 2));
  b.add(new THREE.TorusGeometry(columnRing, 0.12, 8, 64), mats.gold, transform(x, 0.18, z, Math.PI / 2));
  // kubah kaca berusuk emas
  const cap = new THREE.SphereGeometry(radius, 40, 14, 0, Math.PI * 2, 0, Math.PI * 0.3);
  b.add(cap, mats.glass, transform(x, topY + 0.4 - radius * Math.cos(Math.PI * 0.3), z));
  const rise = radius * (1 - Math.cos(Math.PI * 0.3));
  const centerY = topY + 0.4 - radius * Math.cos(Math.PI * 0.3);
  for (let k = 0; k < 14; k += 1) {
    const rib = new THREE.TorusGeometry(radius + 0.03, 0.05, 5, 24, Math.PI * 0.3);
    rib.rotateZ(Math.PI * 0.2);
    b.geometry(mats.gold, rib, x, centerY, z, (k / 14) * Math.PI * 2);
  }
  b.cyl(mats.gold, 0.5, 0.7, 0.3, x, topY + 0.4 + rise - 0.1, z, 14);
  b.sphere(mats.gold, 0.3, x, topY + 0.4 + rise + 0.35, z);
  b.cyl(mats.gold, 0.03, 0.1, 1.6, x, topY + 0.4 + rise + 0.4, z, 6);
  // tirai bunga menjuntai dan lampu
  for (let i = 0; i < 40; i += 1) {
    const a = (i / 40) * Math.PI * 2;
    const cx = x + Math.cos(a) * columnRing;
    const cz = z + Math.sin(a) * columnRing;
    cluster(flowers, leaves, r, cx, topY - 0.35 - r() * 0.25, cz, 0.22, 4, 0.9);
    glow.push({ x: cx, y: topY - 0.45, z: cz, size: 0.5, color: 0xffe0a8, flicker: 0.2 });
  }
  // lampu gantung
  for (const [dx, dz] of [[-2.1, 0], [2.1, 0]]) {
    b.lathe(mats.gold, [[0.02, 0], [0.5, 0.15], [0.4, 0.5], [0.08, 0.7]], x + dx, topY - 1.5, z + dz, 20);
    b.cyl(mats.gold, 0.02, 0.02, 1.3, x + dx, topY - 0.8, z + dz, 4);
    glow.push({ x: x + dx, y: topY - 1.2, z: z + dz, size: 3.4, color: 0xffd08a, flicker: 0.06 });
  }
  b.build(parent);
}

function buildDais(parent, mats, glow, flowers, leaves, r) {
  const b = new Batcher();
  const { x, z, r: R } = DAIS;
  b.cyl(mats.marble, R + 0.9, R + 1.0, 0.18, x, 0, z, 56);
  b.cyl(mats.marble, R + 0.45, R + 0.5, 0.4, x, 0.0, z, 56);
  b.cyl(mats.marble, R, R + 0.05, 0.6, x, 0.0, z, 56);
  b.cyl(mats.gold, R + 0.02, R + 0.02, 0.06, x, 0.6, z, 56);
  b.cyl(mats.carpet, R - 0.5, R - 0.5, 0.02, x, 0.6, z, 48);
  // tiang bergorden putih, cincin emas, tirai
  const n = 8;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const px = x + Math.cos(a) * (R - 0.7);
    const pz = z + Math.sin(a) * (R - 0.7);
    b.cyl(mats.gold, 0.1, 0.13, 4.2, px, 0.6, pz, 8);
    cluster(flowers, leaves, r, px, 1.0, pz, 0.5, 26, 1.1);
    glow.push({ x: px, y: 4.9, z: pz, size: 0.9, color: 0xffd9a0, flicker: 0.1 });
  }
  b.add(new THREE.TorusGeometry(R - 0.7, 0.07, 6, 56), mats.gold, transform(x, 4.8, z, Math.PI / 2));
  b.add(new THREE.CylinderGeometry(R - 0.65, R - 0.65, 3.8, 32, 1, true), mats.sheer, transform(x, 2.9, z));
  b.add(new THREE.ConeGeometry(R - 0.5, 0.9, 32, 1, true), mats.sheer, transform(x, 5.25, z));
  // sofa lingkar putih di tengah dan karangan bunga
  b.lathe(mats.chairSeat, [[0.8, 0], [1.6, 0], [1.6, 0.5], [0.8, 0.5]], x, 0.62, z, 32);
  b.cyl(mats.gold, 0.6, 0.7, 0.4, x, 0.62, z, 16);
  cluster(flowers, leaves, r, x, 1.45, z, 0.7, 60, 1);
  glow.push({ x, y: 2.0, z, size: 3.6, color: 0xffcf85, flicker: 0.05 });
  b.build(parent);
}

function buildEntrance(parent, mats, glow, flowers, leaves, r) {
  const b = new Batcher();
  const z = 10.6;
  for (const sx of [-1, 1]) {
    const x = sx * 3.0;
    b.cyl(mats.gold, 0.5, 0.55, 0.3, x, 0, z, 16);
    b.cyl(mats.stoneWhite, 0.32, 0.4, 3.5, x, 0.3, z, 16);
    b.cyl(mats.gold, 0.45, 0.4, 0.3, x, 3.7, z, 16);
    b.add(new THREE.CylinderGeometry(0.62, 0.78, 3.4, 14, 1, true), mats.sheer, transform(x, 1.95, z));
    cluster(flowers, leaves, r, x, 4.2, z, 0.6, 56, 0.9);
    cluster(flowers, leaves, r, x, 0.6, z, 0.55, 40, 0.9);
    glow.push({ x, y: 4.6, z, size: 1.4, color: 0xffd9a0, flicker: 0.1 });
  }
  // lengkung bunga yang menyambung
  const arc = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-3.0, 4.1, z), new THREE.Vector3(0, 6.7, z), new THREE.Vector3(3.0, 4.1, z));
  b.add(new THREE.TubeGeometry(arc, 24, 0.09, 6, false), mats.gold, null);
  for (let i = 0; i <= 54; i += 1) {
    const p = arc.getPoint(i / 54);
    cluster(flowers, leaves, r, p.x, p.y, p.z, 0.3, 6, 1);
    if (i % 3 === 0) glow.push({ x: p.x, y: p.y - 0.25, z: p.z, size: 0.55, color: 0xffe0a8, flicker: 0.25 });
  }
  b.build(parent);
}

function buildGardens(parent, mats, tex, glow, flowers, leaves, r) {
  const b = new Batcher();
  // balustrade putih di tepi laut (kanan), depan istana, dan tepi plaza
  const run = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / 0.7);
    const ang = Math.atan2(x1 - x0, z1 - z0);
    b.box(mats.stoneWhite, 0.22, 0.12, len, (x0 + x1) / 2, 1.02, (z0 + z1) / 2, ang);
    b.box(mats.stoneWhite, 0.2, 0.14, len, (x0 + x1) / 2, 0.14, (z0 + z1) / 2, ang);
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      b.cyl(mats.stoneWhite, 0.05, 0.09, 0.85, x, 0.15, z, 8);
      if (i % 6 === 0) {
        b.slab(mats.stoneWhite, 0.32, 1.1, 0.32, x, 0, z, ang);
        b.sphere(mats.gold, 0.14, x, 1.25, z);
      }
    }
  };
  run(29.6, 24, 29.6, -10);
  run(29.6, -10, 60, -10);
  run(-29, PALACE_FRONT_Z + 0.5, 29, PALACE_FRONT_Z + 0.5);
  // petak bunga di tepi kanan dan belakang
  for (let z = 22; z > -26; z -= 2.6) {
    b.slab(mats.stoneWhite, 1.3, 0.45, 2.2, 29.0, 0, z);
    cluster(flowers, leaves, r, 29.0, 0.7, z, 0.7, 26, 0.5);
  }
  for (let x = -27.5; x <= 27.5; x += 3.4) {
    if (Math.abs(x) < 5.8) continue;
    b.slab(mats.stoneWhite, 2.4, 0.5, 1.0, x, 0, PALACE_FRONT_Z + 1.3);
    cluster(flowers, leaves, r, x, 0.78, PALACE_FRONT_Z + 1.3, 0.8, 30, 0.45);
  }
  b.build(parent);

  // palem: batang + mahkota daun (instans)
  const palmSpots = [...PALMS.map((p) => ({ x: p.x, z: p.z }))];
  for (let z = 30; z < 150; z += 9) palmSpots.push({ x: -7.2, z }, { x: 7.2, z });
  for (let i = 0; i < 40; i += 1) palmSpots.push({ x: -34 - r() * 40, z: -30 + r() * 80 });
  for (let i = 0; i < 26; i += 1) palmSpots.push({ x: -60 + r() * 120, z: -42 - r() * 24 });
  for (let i = 0; i < 18; i += 1) palmSpots.push({ x: -26 - r() * 90, z: 30 + r() * 80 });
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.28, 1, 8, 8);
  const tp = trunkGeo.attributes.position;
  for (let i = 0; i < tp.count; i += 1) tp.setX(i, tp.getX(i) + (tp.getY(i) + 0.5) ** 2 * 0.28);
  trunkGeo.translate(0, 0.5, 0);
  trunkGeo.computeVertexNormals();
  const fronds = [];
  const frondCount = LITE ? 7 : 12;
  for (let k = 0; k < frondCount; k += 1) {
    const f = new THREE.PlaneGeometry(3.6, 1.7, LITE ? 3 : 6, 1);
    const p = f.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const u = (p.getX(i) + 1.8) / 3.6;
      p.setZ(i, -(u ** 2) * 1.5);
      p.setY(i, p.getY(i) * (1 - u * 0.5));
    }
    f.translate(1.8, 0, 0);
    f.rotateX(-0.25 + (k % 3) * 0.28);
    f.rotateY((k / frondCount) * Math.PI * 2 + k * 0.4);
    fronds.push(f);
  }
  const crownGeo = mergeFronds(fronds);
  const items = palmSpots.filter((_, i) => !LITE || i < PALMS.length || i % 2 === 0).map((p) => {
    const s = 0.85 + r() * 0.6;
    return { x: p.x, y: 0, z: p.z, ry: r() * 6.28, sx: s, sy: s * (5.6 + r() * 3.4), sz: s };
  });
  const trunks = instanced(trunkGeo, mats.trunk, items, { castShadow: true });
  parent.add(trunks);
  const crowns = instanced(
    crownGeo,
    mats.frond,
    items.map((it) => ({ x: it.x + 0.28 * it.sx * Math.cos(it.ry), y: it.sy, z: it.z - 0.28 * it.sx * Math.sin(it.ry), ry: it.ry, s: it.sx * 1.05 })),
    { castShadow: true },
  );
  parent.add(crowns);

  // sipres di belakang balustrade istana dan pohon bunga merah muda
  const cyp = new THREE.LatheGeometry([[0.001, 0], [0.55, 0.5], [0.72, 1.8], [0.6, 3.4], [0.34, 5.0], [0.001, 6.2]].map(([a, c]) => new THREE.Vector2(a, c)), 10);
  const cypItems = [];
  for (let x = -27; x <= 27; x += 3.4) if (Math.abs(x) > 6.2) cypItems.push({ x, y: 0, z: PALACE_FRONT_Z - 0.8, s: 0.9 + r() * 0.4, ry: r() * 6 });
  for (const z of [-20, -8, 4, 16]) cypItems.push({ x: 29.6 + 0.0, y: 0, z, s: 0.8 });
  parent.add(instanced(cyp, mats.cypress, cypItems, { castShadow: true }));
  const pink = [];
  for (const [x, z] of [[-26.6, 9], [-26.8, -17.6], [27, -22], [-9, -24.5], [9, -24.5], [-22, -24.2], [22, -24.2]]) {
    for (let i = 0; i < 14; i += 1) pink.push({ x: x + (r() - 0.5) * 1.8, y: 2.0 + r() * 1.6, z: z + (r() - 0.5) * 1.8, s: 0.8 + r() * 0.9, color: [0xf6a9bd, 0xff9ab8, 0xffc4d4, 0xe885a8][i % 4] });
  }
  parent.add(instanced(new THREE.SphereGeometry(0.42, 10, 8), mats.flower, pink, { castShadow: true }));
  const trunkGeo2 = new THREE.CylinderGeometry(0.1, 0.16, 2.6, 6);
  parent.add(instanced(trunkGeo2, mats.trunk, [[-26.6, 9], [-26.8, -17.6], [27, -22], [-9, -24.5], [9, -24.5], [-22, -24.2], [22, -24.2]].map(([x, z]) => ({ x, y: 1.3, z })), { castShadow: true }));
}

function mergeFronds(geos) {
  const out = new THREE.BufferGeometry();
  let verts = 0;
  let idx = 0;
  for (const g of geos) {
    verts += g.attributes.position.count;
    idx += g.index.count;
  }
  const pos = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const nor = new Float32Array(verts * 3);
  const index = new Uint32Array(idx);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    nor.set(g.attributes.normal.array, vo * 3);
    for (let i = 0; i < g.index.count; i += 1) index[io + i] = g.index.array[i] + vo;
    vo += g.attributes.position.count;
    io += g.index.count;
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

function buildCliff(parent, mats, tex, glow, flowers, leaves, r) {
  // tebing di kiri dengan air terjun dan papan nama
  const geo = new THREE.PlaneGeometry(70, 28, 70, 28);
  const p = geo.attributes.position;
  const sn = (x, y) => Math.sin(x * 0.37 + y * 0.23) * 0.5 + Math.sin(x * 0.91 - y * 0.57) * 0.3 + Math.sin(x * 2.1 + y * 1.3) * 0.15;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const y = p.getY(i);
    const lift = (y + 14) / 28;
    p.setZ(i, 0.3 + sn(x, y) * 0.7 + (1 - lift) * 0.6);
    p.setX(i, x + sn(y, x) * 0.6);
  }
  geo.computeVertexNormals();
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2);
  const cliff = new THREE.Mesh(geo, mats.rock);
  cliff.rotation.y = Math.PI / 2;
  cliff.position.set(-31.6, 11, 12);
  cliff.castShadow = true;
  cliff.receiveShadow = true;
  parent.add(cliff);
  // dataran atas tebing
  const top = new THREE.Mesh(new THREE.PlaneGeometry(60, 120), new THREE.MeshStandardMaterial({ map: tiled(tex.grass, 10, 20), roughness: 1 }));
  top.rotation.x = -Math.PI / 2;
  top.position.set(-62, 25, 20);
  parent.add(top);
  // air terjun
  const wf = tex.waterfall;
  wf.repeat.set(1, 1);
  const wfMat = new THREE.MeshBasicMaterial({ map: wf, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 24), wfMat);
  fall.rotation.y = Math.PI / 2;
  fall.position.set(-29.4, 12, -4);
  parent.add(fall);
  const fall2 = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 24), wfMat);
  fall2.rotation.y = Math.PI / 2;
  fall2.position.set(-29.4, 12, -9.6);
  parent.add(fall2);
  // kabut air terjun
  glow.push({ x: -28.9, y: 0.6, z: -4, size: 7, color: 0xcdeeff, flicker: 0 }, { x: -28.9, y: 0.6, z: -9.6, size: 5, color: 0xcdeeff, flicker: 0 });
  // aliran di kaki tebing
  const rill = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 40), new THREE.MeshStandardMaterial({ color: 0x3fb4cc, roughness: 0.05, transparent: true, opacity: 0.85, envMapIntensity: 1.4 }));
  rill.rotation.x = -Math.PI / 2;
  rill.position.set(-29.7, -0.25, 4);
  parent.add(rill);
  // papan nama NIKORA di dinding batu
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshStandardMaterial({ map: tex.sign, roughness: 0.7, emissive: 0x332200, emissiveIntensity: 0.2 }));
  sign.rotation.y = Math.PI / 2;
  sign.position.set(-28.95, 4.3, 12.5);
  parent.add(sign);
  const frame = new Batcher();
  frame.box(mats.gold, 0.12, 5.3, 10.3, -29.0, 4.3, 12.5);
  frame.build(parent);
  glow.push({ x: -28.4, y: 7.3, z: 9.0, size: 1.5, color: 0xffd08a }, { x: -28.4, y: 7.3, z: 16, size: 1.5, color: 0xffd08a });
}

function stringLights(parent, glow, r) {
  const mat = new THREE.LineBasicMaterial({ color: 0x4a3a22 });
  for (const z of [9, -1.5, -14.5]) {
    const a = new THREE.Vector3(-29.2, 6.4, z);
    const c = new THREE.Vector3(0, 4.3, z);
    const b = new THREE.Vector3(29.2, 6.4, z);
    const curve = new THREE.QuadraticBezierCurve3(a, c, b);
    const pts = curve.getPoints(80);
    parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    for (let i = 0; i <= 48; i += 1) {
      const p = curve.getPoint(i / 48);
      glow.push({ x: p.x, y: p.y - 0.12, z: p.z, size: 0.5, color: r() > 0.5 ? 0xffe0a8 : 0xffcf85, flicker: 0.3 });
    }
  }
}

export { tiled, domeProfile };
