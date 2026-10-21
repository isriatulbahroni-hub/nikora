// NIKORA Grand Hotel (THREE): menara 1000 lantai, halaman, jalan raya, dan parkir. Geometri dari hotel-layout.js.
// Cangkang menara (pelat, tiang kaca, sabuk Sky Lobby, mahkota) digambar sekali untuk seluruh 1000 lantai dengan InstancedMesh.
// Interior (lantai, dinding, perabot, tempat tidur) hanya dibangun untuk lantai podium dan lantai di sekitar pemain,
// lalu dibuang lagi saat pemain pindah lantai, supaya tetap ringan di HP.
import * as THREE from 'three';
import { DOOR_HEIGHT } from './villa-layout.js';
import { bedGeometries } from './villa-props.js';
import {
  HOTEL_BUILDING, HOTEL_CANOPY, HOTEL_CORE, TOWER_CENTER, TOWER_HALF, TOWER_ZONE_LEVELS, hotelFootprint, towerScaleAt, HOTEL_FORECOURT, HOTEL_FOUNTAIN, HOTEL_LEVEL_COUNT, HOTEL_LEVEL_HEIGHT, HOTEL_PARKING, HOTEL_SITE,
  HOTEL_TOP_LEVEL, HOTEL_TOP_Y, HOTEL_WALL_HEIGHT, LIFTS, PODIUM_LEVELS, ROAD, getHotelWorld, hotelLevelY, isGuestLevel, isSkyLobbyLevel,
} from './hotel-layout.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const GOLD = 0xc9a24b;
const CREAM = 0xf1e9d6;
const INTERIOR_WINDOW = 1; // lantai di atas dan di bawah pemain yang interiornya ikut dibangun (selain podium)
const FLOOR_COLORS = { lobby: 0xe9e2d2, restaurant: 0xc7b394, kitchen: 0xbcc2c5, hall: 0xd2b27a, bridal: 0xeed9d4, meeting: 0x9aa3ad, spa: 0xd9d0bf, pool: 0x4aa7c9, gym: 0x4b4f55, shop: 0xded6c6, prayer: 0x2e6b4f, kids: 0xf0c75e, cinema: 0x3a1f2e, games: 0x2b2f4a, library: 0x7a5a3c, guest: 0xb89a72, lounge: 0xa98e6a, suite: 0xcdb28a, terrace: 0xc9bda3, core: 0xd9d3c4 };
const PROP_LOOK = { desk: [1.8, 1.1, 0.5, 0x6b4a2f], table: [0.85, 0.8, 0.85, 0xd8c8a8], counter: [1.2, 0.95, 0.5, 0xe8e2d6], sofa: [1.1, 0.8, 0.5, 0x23395b], tub: [1.5, 0.6, 1.0, 0xf4f4f0], lounger: [0.33, 0.45, 0.95, 0xf2f0ea] };

function instancedBoxes(parent, items, material, { cast = false, receive = false } = {}) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(BOX, material, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    q.setFromEuler(e.set(0, it.ry ?? 0, 0));
    m.compose(p.set(it.x, it.y, it.z), q, s.set(it.sx, it.sy, it.sz));
    mesh.setMatrixAt(i, m);
    if (it.color !== undefined) mesh.setColorAt(i, c.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

/** Batang tipis miring (rusuk diagonal): tiap item {x1,y1,z1,x2,y2,z2,t} menjadi kotak setebal t sepanjang garis itu. */
function instancedBars(parent, bars, material) {
  if (!bars.length) return null;
  const mesh = new THREE.InstancedMesh(BOX, material, bars.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const d = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  bars.forEach((b, i) => {
    d.set(b.x2 - b.x1, b.y2 - b.y1, b.z2 - b.z1);
    const len = d.length();
    q.setFromUnitVectors(up, d.normalize());
    mesh.setMatrixAt(i, m.compose(p.set((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, (b.z1 + b.z2) / 2), q, sc.set(b.t, len, b.t)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

// Kulit menara: tiap zona 50 lantai = satu "prisma" yang meruncing (skala bawah -> atas), sisinya menggembung ke luar.
const SHELL_MARGIN = 0.5; // kulit selalu sekian meter di luar tapak lantai
const SHELL_BULGE = 1.2; // gembung maksimum di tengah tiap sisi (sagitta)
const SHELL_COLS = 10; // kolom per sisi
const RIB_THICK = 0.45;
const SPIRE_HEIGHT = 520; // jarum di puncak, di atas helipad (y = 4.200)
const zoneOf = (z) => ({
  z,
  a: Math.max(z * TOWER_ZONE_LEVELS, PODIUM_LEVELS),
  b: (z + 1) * TOWER_ZONE_LEVELS > HOTEL_TOP_LEVEL ? HOTEL_TOP_LEVEL : (z + 1) * TOWER_ZONE_LEVELS,
  sBottom: z === 0 ? 1 : towerScaleAt(z),
  sTop: z === 0 ? 1 : towerScaleAt(z + 1),
});
/** Titik pada sisi `face` (0 utara, 1 timur, 2 selatan, 3 barat) skala `sc`, posisi u (0..1) sepanjang sisi, bergeser `off` ke luar. */
function shellPoint(face, sc, u, off = 0) {
  const hx = TOWER_HALF.x * sc + SHELL_MARGIN;
  const hz = TOWER_HALF.z * sc + SHELL_MARGIN;
  const cx = TOWER_CENTER.x;
  const cz = TOWER_CENTER.z;
  const corners = [[cx - hx, cz - hz], [cx + hx, cz - hz], [cx + hx, cz + hz], [cx - hx, cz + hz]];
  const a = corners[face];
  const b = corners[(face + 1) % 4];
  const n = [[0, -1], [1, 0], [0, 1], [-1, 0]][face];
  const push = SHELL_BULGE * Math.sin(Math.PI * u) + off;
  return { x: a[0] + (b[0] - a[0]) * u + n[0] * push, z: a[1] + (b[1] - a[1]) * u + n[1] * push };
}
function buildShellGeometry(zones) {
  const pos = [];
  const idx = [];
  for (const zn of zones) {
    const yLo = hotelLevelY(zn.a);
    const yHi = hotelLevelY(zn.b);
    for (let face = 0; face < 4; face++) {
      const base = pos.length / 3;
      for (let i = 0; i <= SHELL_COLS; i++) {
        const u = i / SHELL_COLS;
        const lo = shellPoint(face, zn.sBottom, u);
        const hi = shellPoint(face, zn.sTop, u);
        pos.push(lo.x, yLo, lo.z, hi.x, yHi, hi.z);
      }
      for (let i = 0; i < SHELL_COLS; i++) {
        const k = base + i * 2;
        idx.push(k, k + 1, k + 3, k, k + 3, k + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
/** Rusuk diagonal berbentuk X di tiap sisi tiap zona, mengikuti gembung kulit. */
function shellRibs(zones) {
  const bars = [];
  for (const zn of zones) {
    const yLo = hotelLevelY(zn.a);
    const yHi = hotelLevelY(zn.b);
    for (let face = 0; face < 4; face++) {
      for (const flip of [false, true]) {
        let prev = null;
        for (let i = 0; i <= SHELL_COLS; i++) {
          const u = i / SHELL_COLS;
          const v = flip ? 1 - u : u;
          const p = shellPoint(face, zn.sBottom + (zn.sTop - zn.sBottom) * v, u, 0.2);
          const cur = { x: p.x, y: yLo + (yHi - yLo) * v, z: p.z };
          if (prev) bars.push({ x1: prev.x, y1: prev.y, z1: prev.z, x2: cur.x, y2: cur.y, z2: cur.z, t: RIB_THICK });
          prev = cur;
        }
      }
    }
  }
  return bars;
}

const rectBox = (r, y, h, extra = {}) => ({ x: (r[0] + r[2]) / 2, y, z: (r[1] + r[3]) / 2, sx: r[2] - r[0], sy: h, sz: r[3] - r[1], ...extra });
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
const onPerimeter = (w, b) => (w.orient === 'h' ? (w.coord === b[1] || w.coord === b[3]) : (w.coord === b[0] || w.coord === b[2]));

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#14110d';
  g.fillRect(0, 0, 1024, 160);
  g.strokeStyle = '#c9a24b';
  g.lineWidth = 6;
  g.strokeRect(10, 10, 1004, 140);
  g.fillStyle = '#e7c76a';
  g.font = '600 78px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('NIKORA GRAND HOTEL', 512, 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Kotak penghalang kamera untuk satu lantai hotel (dinding, lintel, perabot, pelat atas/bawah). Dihitung sekali per lantai. */
function levelOccluders(world, level) {
  const L = world.levels[level];
  const y0 = hotelLevelY(level);
  const boxes = [];
  const add = (minX, maxX, minY, maxY, minZ, maxZ) => boxes.push({ minX, maxX, minY, maxY, minZ, maxZ });
  for (const c of L.colliders) add(c.minX, c.maxX, y0, y0 + HOTEL_WALL_HEIGHT, c.minZ, c.maxZ);
  for (const d of L.doors) {
    const hw = d.width / 2;
    if (d.orient === 'h') add(d.x - hw, d.x + hw, y0 + DOOR_HEIGHT, y0 + HOTEL_WALL_HEIGHT, d.z - 0.15, d.z + 0.15);
    else add(d.x - 0.15, d.x + 0.15, y0 + DOOR_HEIGHT, y0 + HOTEL_WALL_HEIGHT, d.z - hw, d.z + hw);
  }
  const b = hotelFootprint(level);
  add(b[0], b[2], y0 - 0.4, y0, b[1], b[3]); // lantai
  add(b[0], b[2], y0 + HOTEL_WALL_HEIGHT, y0 + HOTEL_LEVEL_HEIGHT + 0.1, b[1], b[3]); // langit-langit
  add(HOTEL_SITE.minX, HOTEL_SITE.maxX, -6, 0.05, HOTEL_SITE.minZ, HOTEL_SITE.maxZ); // tanah di sekitar hotel (di luar area tanah villa)
  return boxes;
}

export function buildHotelWorld(scene) {
  const world = getHotelWorld();
  const root = new THREE.Group();
  root.name = 'nikora-grand-hotel';
  scene.add(root);
  const B = HOTEL_BUILDING;
  const H = HOTEL_LEVEL_HEIGHT;
  const M = {
    asphalt: std(0x2c2e33, { roughness: 0.95 }), line: std(0xf2f0e4, { roughness: 0.7 }), curb: std(0xcfcfc8), stone: std(0xd9d2c3, { roughness: 0.85 }),
    gold: std(GOLD, { roughness: 0.35, metalness: 0.75 }), wall: std(CREAM, { roughness: 0.9 }), slab: std(0xe3dccb), dark: std(0x1a1b1f),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd0e6, roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.3, depthWrite: false }),
    towerGlass: new THREE.MeshStandardMaterial({ color: 0x2f6fae, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }), rib: std(0xe8eef5, { roughness: 0.35, metalness: 0.6 }),
    floor: std(0xffffff, { roughness: 0.55 }), light: new THREE.MeshBasicMaterial({ color: 0xfff0c8 }), water: std(0x35a7d9, { roughness: 0.1, emissive: 0x0a3550, emissiveIntensity: 0.6 }),
    leaf: std(0x2f6f3a), trunk: std(0x6b4a2f), prop: std(0xffffff, { roughness: 0.7 }), vertex: std(0xffffff, { vertexColors: true, roughness: 0.7 }),
  };

  // ---- jalan raya dari gerbang villa, halaman drop-off, parkir
  const roadLen = ROAD.toZ - ROAD.fromZ;
  const roadMid = (ROAD.fromZ + ROAD.toZ) / 2;
  instancedBoxes(root, [{ x: ROAD.x, y: 0.03, z: roadMid, sx: ROAD.half * 2, sy: 0.06, sz: roadLen }, rectBox(HOTEL_PARKING, 0.03, 0.06)], M.asphalt, { receive: true });
  instancedBoxes(root, [rectBox(HOTEL_FORECOURT, 0.045, 0.09), rectBox([-30, 420, 30, 424], 0.045, 0.09)], M.stone, { receive: true });
  const marks = [];
  for (let z = ROAD.fromZ + 4; z < ROAD.toZ - 4; z += 8) marks.push({ x: ROAD.x, y: 0.07, z, sx: 0.25, sy: 0.02, sz: 3.2 });
  for (const sx of [-1, 1]) marks.push({ x: sx * (ROAD.half - 0.5), y: 0.07, z: roadMid, sx: 0.18, sy: 0.02, sz: roadLen });
  for (let k = 0; k <= 8; k++) marks.push({ x: (HOTEL_PARKING[0] + HOTEL_PARKING[2]) / 2, y: 0.07, z: 386.5 + k * 11, sx: HOTEL_PARKING[2] - HOTEL_PARKING[0] - 2, sy: 0.02, sz: 0.14 });
  instancedBoxes(root, marks, M.line);
  const curbs = [];
  for (const sx of [-1, 1]) curbs.push({ x: sx * (ROAD.half + 0.2), y: 0.1, z: roadMid, sx: 0.4, sy: 0.2, sz: roadLen });
  instancedBoxes(root, curbs, M.curb, { receive: true });
  // tiang lampu sepanjang jalan
  const posts = [];
  const bulbs = [];
  for (let z = ROAD.fromZ + 14; z < ROAD.toZ - 6; z += 30) for (const sx of [-1, 1]) { posts.push({ x: sx * (ROAD.half + 1.4), y: 3.2, z, sx: 0.16, sy: 6.4, sz: 0.16 }); bulbs.push({ x: sx * (ROAD.half + 1.4), y: 6.5, z, sx: 0.5, sy: 0.25, sz: 0.5 }); }
  instancedBoxes(root, posts, M.dark, { cast: true });
  instancedBoxes(root, bulbs, M.light);

  // air mancur
  const fountain = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(HOTEL_FOUNTAIN.r, HOTEL_FOUNTAIN.r + 0.2, 0.6, 28), M.slab);
  basin.position.y = 0.3;
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(HOTEL_FOUNTAIN.r - 0.35, HOTEL_FOUNTAIN.r - 0.35, 0.05, 28), M.water);
  pool.position.y = 0.55;
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, 2.6, 12), M.gold);
  spire.position.y = 1.7;
  fountain.add(basin, pool, spire);
  fountain.position.set(HOTEL_FOUNTAIN.x, 0, HOTEL_FOUNTAIN.z);
  root.add(fountain);

  // kanopi drop-off + papan nama
  const cr = HOTEL_CANOPY.rect;
  instancedBoxes(root, [rectBox(cr, HOTEL_CANOPY.height, 0.4, { color: CREAM }), rectBox([cr[0] - 0.2, cr[1] - 0.2, cr[2] + 0.2, cr[1] + 0.1], HOTEL_CANOPY.height + 0.05, 0.5)], M.prop, { cast: true });
  instancedBoxes(root, HOTEL_CANOPY.pillars.map(([x, z]) => ({ x, y: HOTEL_CANOPY.height / 2, z, sx: 0.9, sy: HOTEL_CANOPY.height, sz: 0.9 })), M.gold, { cast: true });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(30, 4.7), new THREE.MeshBasicMaterial({ map: signTexture() }));
  sign.position.set(0, 12.4, B[1] - 0.4);
  sign.rotation.y = Math.PI; // menghadap utara (ke jalan)
  root.add(sign);

  // taman: pohon di sekeliling tapak (acak deterministik), di luar jalan, halaman, parkir, bangunan
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const trunks = [];
  const crowns = [];
  const clear = (x, z) => !(Math.abs(x) < ROAD.half + 3 && z < HOTEL_FORECOURT[1] + 2) && !(x > HOTEL_FORECOURT[0] - 3 && x < HOTEL_FORECOURT[2] + 3 && z > HOTEL_FORECOURT[1] - 3 && z < B[1] + 4) && !(x > HOTEL_PARKING[0] - 3 && x < HOTEL_PARKING[2] + 3 && z > HOTEL_PARKING[1] - 3 && z < HOTEL_PARKING[3] + 3) && !(x > B[0] - 6 && x < B[2] + 6 && z > B[1] - 3 && z < B[3] + 8);
  for (let i = 0, n = 0; i < 400 && n < 70; i++) {
    const x = HOTEL_SITE.minX + 6 + rand() * (HOTEL_SITE.maxX - HOTEL_SITE.minX - 12);
    const z = HOTEL_SITE.minZ + 10 + rand() * (HOTEL_SITE.maxZ - HOTEL_SITE.minZ - 14);
    if (!clear(x, z)) continue;
    const h = 5 + rand() * 4;
    trunks.push({ x, y: h * 0.3, z, sx: 0.45, sy: h * 0.6, sz: 0.45 });
    crowns.push({ x, y: h * 0.75, z, sx: 3.2 + rand() * 1.4, sy: h * 0.55, sz: 3.2 + rand() * 1.4, color: [0x2f6f3a, 0x3c8044, 0x27603a][n % 3] });
    n++;
  }
  instancedBoxes(root, trunks, M.trunk, { cast: true });
  instancedBoxes(root, crowns, M.leaf, { cast: true });

  // ---- cangkang menara (seluruh 1000 lantai, murah: beberapa InstancedMesh dan satu mesh kaca per menara)
  const slabs = [];
  const edges = [];
  const belts = [];
  const frame = (o, w, y, h) => [rectBox([o[0], o[1], o[2], o[1] + w], y, h), rectBox([o[0], o[3] - w, o[2], o[3]], y, h), rectBox([o[0], o[1] + w, o[0] + w, o[3] - w], y, h), rectBox([o[2] - w, o[1] + w, o[2], o[3] - w], y, h)];
  for (let l = 0; l < HOTEL_LEVEL_COUNT; l++) {
    const y0 = hotelLevelY(l);
    const f = hotelFootprint(l);
    if (l > 0) slabs.push(rectBox(f, y0 - 0.15, 0.3, { color: 0xe3dccb }));
    edges.push(rectBox([f[0] - 0.5, f[1] - 0.5, f[2] + 0.5, f[3] + 0.5], y0 + H - 0.12, 0.24, { color: GOLD })); // list emas di tepi pelat
    if (isSkyLobbyLevel(l)) { // sabuk emas Sky Lobby: bingkai di batas antar zona, menutupi sambungan kulit dan gembungnya
      const sc = towerScaleAt(l / TOWER_ZONE_LEVELS);
      const e = SHELL_MARGIN + SHELL_BULGE + 0.7;
      const o = [-TOWER_HALF.x * sc - e, TOWER_CENTER.z - TOWER_HALF.z * sc - e, TOWER_HALF.x * sc + e, TOWER_CENTER.z + TOWER_HALF.z * sc + e];
      belts.push(...frame(o, 1.6, y0 + 0.2, 1.4));
    }
  }
  const ft = hotelFootprint(HOTEL_TOP_LEVEL);
  slabs.push(rectBox(ft, HOTEL_TOP_Y - 0.15, 0.3, { color: 0xe3dccb }), rectBox([ft[0] - 0.5, ft[1] - 0.5, ft[2] + 0.5, ft[3] + 0.5], HOTEL_TOP_Y + 0.5, 1.0, { color: GOLD }));
  instancedBoxes(root, slabs, M.prop, { cast: true, receive: true });
  instancedBoxes(root, edges, M.prop);
  instancedBoxes(root, belts, M.gold, { cast: true });

  // kulit kaca meruncing dari lantai 5 sampai lantai 999 (podium dan Sky Level digambar per lantai karena punya pintu dan teras)
  const zones = [];
  for (let z = 0; z * TOWER_ZONE_LEVELS <= HOTEL_TOP_LEVEL; z++) { const zn = zoneOf(z); if (zn.b > zn.a) zones.push(zn); }
  const shell = new THREE.Mesh(buildShellGeometry(zones), M.towerGlass);
  shell.name = 'tower-shell';
  root.add(shell);
  instancedBars(root, shellRibs(zones), M.rib);

  // mahkota atap: helipad, empat tiang sudut, dan jarum menara
  const helipad = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.12, 40), std(0x3a3d44));
  helipad.position.set(0, HOTEL_TOP_Y + 1.06, 448);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(9.6, 0.25, 6, 48), std(0xf2c230));
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(helipad.position).setY(HOTEL_TOP_Y + 1.15);
  root.add(helipad, ring);
  instancedBoxes(root, [
    { x: -4, y: HOTEL_TOP_Y + 1.2, z: 448, sx: 0.8, sy: 0.05, sz: 6 }, { x: 4, y: HOTEL_TOP_Y + 1.2, z: 448, sx: 0.8, sy: 0.05, sz: 6 }, { x: 0, y: HOTEL_TOP_Y + 1.2, z: 448, sx: 8, sy: 0.05, sz: 0.8 },
  ], M.line);
  instancedBoxes(root, [
    { x: ft[0] + 3, y: HOTEL_TOP_Y + 12, z: ft[1] + 3, sx: 1.2, sy: 24, sz: 1.2 }, { x: ft[2] - 3, y: HOTEL_TOP_Y + 12, z: ft[1] + 3, sx: 1.2, sy: 24, sz: 1.2 },
    { x: ft[0] + 3, y: HOTEL_TOP_Y + 12, z: ft[3] - 3, sx: 1.2, sy: 24, sz: 1.2 }, { x: ft[2] - 3, y: HOTEL_TOP_Y + 12, z: ft[3] - 3, sx: 1.2, sy: 24, sz: 1.2 },
  ], M.gold, { cast: true });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 1.4, SPIRE_HEIGHT, 10), M.rib);
  mast.position.set(0, HOTEL_TOP_Y + SPIRE_HEIGHT / 2, 434);
  root.add(mast);

  // ---- interior per lantai (dibangun hanya untuk lantai yang dekat pemain)
  const bg = bedGeometries();
  const bedMaterials = [M.vertex, std(0xffffff, { roughness: 0.9 }), new THREE.MeshBasicMaterial({ color: 0xffe2a8 })];
  const bedGeos = [bg.base, bg.duvet, bg.lamps];

  function buildLevel(l) {
    const group = new THREE.Group();
    group.name = `hotel-level-${l}`;
    const L = world.levels[l];
    const y0 = hotelLevelY(l);
    const floors = [];
    const walls = [];
    const glass = [];
    const mullions = [];
    const lintels = [];
    const ceilingLights = [];
    const props = [];
    const beds = [];
    const pools = [];
    const rails = [];
    const liftDoors = [];
    const fp = hotelFootprint(l);
    const perimeterGlass = l < PODIUM_LEVELS || l >= HOTEL_TOP_LEVEL; // di antara itu, dinding kaca tirai cangkang yang dipakai

    floors.push(rectBox(fp, y0 + 0.02, 0.04, { color: isGuestLevel(l) ? 0x6b2330 : 0xe7e0d0 }));
    for (const r of L.rooms) if (r.kind !== 'core') floors.push(rectBox(r.rect, y0 + 0.045, 0.03, { color: FLOOR_COLORS[r.kind] ?? 0xddd5c3 }));
    floors.push(rectBox(HOTEL_CORE, y0 + 0.045, 0.03, { color: FLOOR_COLORS.core }));
    for (const w of L.walls) {
      const len = w.b - w.a;
      const mid = (w.a + w.b) / 2;
      const item = w.orient === 'h' ? { x: mid, z: w.coord, sx: len, sz: 0.3 } : { x: w.coord, z: mid, sx: 0.3, sz: len };
      if (onPerimeter(w, fp)) {
        if (!perimeterGlass) continue;
        glass.push({ ...item, y: y0 + HOTEL_WALL_HEIGHT / 2, sy: HOTEL_WALL_HEIGHT, sz: item.sz * 0.5, sx: item.sx * (w.orient === 'h' ? 1 : 0.5) });
        for (let t = w.a; t <= w.b + 0.01; t += 6) mullions.push(w.orient === 'h' ? { x: t, y: y0 + HOTEL_WALL_HEIGHT / 2, z: w.coord, sx: 0.28, sy: HOTEL_WALL_HEIGHT, sz: 0.4 } : { x: w.coord, y: y0 + HOTEL_WALL_HEIGHT / 2, z: t, sx: 0.4, sy: HOTEL_WALL_HEIGHT, sz: 0.28 });
      } else walls.push({ ...item, y: y0 + HOTEL_WALL_HEIGHT / 2, sy: HOTEL_WALL_HEIGHT });
    }
    for (const d of L.doors) {
      const h = HOTEL_WALL_HEIGHT - DOOR_HEIGHT;
      lintels.push(d.orient === 'h' ? { x: d.x, y: y0 + DOOR_HEIGHT + h / 2, z: d.z, sx: d.width, sy: h, sz: 0.3 } : { x: d.x, y: y0 + DOOR_HEIGHT + h / 2, z: d.z, sx: 0.3, sy: h, sz: d.width });
    }
    // lampu langit-langit: kotak emisif tiap 6 m di ruang publik dan lorong
    const guestRects = isGuestLevel(l) ? L.rooms.filter((r) => r.kind === 'guest').map((r) => r.rect) : [];
    for (let x = fp[0] + 3; x < fp[2]; x += 6) for (let z = fp[1] + 3; z < fp[3]; z += 6) {
      if (guestRects.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3])) continue; // di dalam kamar tidak perlu
      ceilingLights.push({ x, y: y0 + HOTEL_WALL_HEIGHT - 0.04, z, sx: 1.6, sy: 0.06, sz: 1.6 });
    }
    for (const p of L.props) {
      if (p.type === 'bed') {
        const ry = p.z < 430 ? 0 : p.z > 466 ? Math.PI : p.x < 0 ? Math.PI / 2 : -Math.PI / 2;
        beds.push({ x: p.x, y: y0, z: p.z, ry });
        continue;
      }
      const look = PROP_LOOK[p.type];
      if (look) props.push({ x: p.x, y: y0 + look[1] / 2, z: p.z, sx: look[0] * 2, sy: look[1], sz: look[2] * 2, color: look[3] });
    }
    for (const r of L.rooms) {
      if (r.kind === 'pool') pools.push(rectBox([r.rect[0] + 4, r.rect[1] + 4, r.rect[2] - 4, r.rect[3] - 4], y0 + 0.07, 0.04));
      if (r.kind === 'terrace') {
        const e = r.rect;
        const edge = (x1, z1, x2, z2, on) => on && rails.push({ x: (x1 + x2) / 2, y: y0 + 0.6, z: (z1 + z2) / 2, sx: Math.max(0.1, x2 - x1), sy: 1.2, sz: Math.max(0.1, z2 - z1) });
        edge(e[0], e[1], e[2], e[1], e[1] === fp[1]);
        edge(e[0], e[3], e[2], e[3], e[3] === fp[3]);
        edge(e[0], e[1], e[0], e[3], e[0] === fp[0]);
        edge(e[2], e[1], e[2], e[3], e[2] === fp[2]);
        if (r.id === 'infinity_pool') pools.push(rectBox([e[0] + 3, e[1] + 3, e[2] - 3, e[3] - 3], y0 + 0.07, 0.04));
      }
    }
    for (const lift of LIFTS) liftDoors.push({ x: (lift.rect[0] + lift.rect[2]) / 2, y: y0 + 1.5, z: lift.rect[1] + 0.05, sx: 2.6, sy: 3.0, sz: 0.08 });

    instancedBoxes(group, floors, M.floor, { receive: true });
    instancedBoxes(group, walls, M.wall, { cast: true, receive: true });
    instancedBoxes(group, lintels, M.wall, { cast: true });
    instancedBoxes(group, mullions, M.gold, { cast: true });
    instancedBoxes(group, glass, M.glass);
    instancedBoxes(group, rails, M.glass);
    instancedBoxes(group, ceilingLights, M.light);
    instancedBoxes(group, props, M.prop, { cast: false });
    instancedBoxes(group, pools, M.water);
    instancedBoxes(group, liftDoors, M.gold);
    if (beds.length) {
      bedGeos.forEach((geo, k) => {
        const mesh = new THREE.InstancedMesh(geo, bedMaterials[k], beds.length);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const e = new THREE.Euler();
        beds.forEach((b, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.ry, 0)), new THREE.Vector3(1, 1, 1))));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
      });
    }
    return group;
  }

  const groups = new Map();
  let focusLevel = -1;
  const wanted = (level) => {
    const keep = new Set();
    for (let l = 0; l < PODIUM_LEVELS; l++) keep.add(l); // podium (lobi, ballroom, spa, belanja) selalu terlihat dari luar
    for (let l = Math.max(0, level - INTERIOR_WINDOW); l <= Math.min(HOTEL_LEVEL_COUNT - 1, level + INTERIOR_WINDOW); l++) keep.add(l);
    return keep;
  };
  /** Pusatkan interior di sekitar `level`: bangun lantai yang baru dekat, buang yang sudah jauh. */
  function focus(level) {
    const target = Math.min(HOTEL_LEVEL_COUNT - 1, Math.max(0, Math.round(level)));
    if (target === focusLevel) return;
    focusLevel = target;
    const keep = wanted(target);
    for (const [l, group] of groups) {
      if (keep.has(l)) continue;
      root.remove(group);
      group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      groups.delete(l);
    }
    for (const l of keep) {
      if (groups.has(l)) continue;
      const group = buildLevel(l);
      root.add(group);
      groups.set(l, group);
    }
  }
  focus(0);

  const occCache = new Map();
  return {
    root,
    world,
    focus,
    /** Kotak penghalang kamera untuk lantai pemain. Dipanggil tiap frame, sekaligus memusatkan interior di lantai itu. */
    occluders: (level) => {
      focus(level);
      if (!occCache.has(level)) occCache.set(level, levelOccluders(world, level));
      return occCache.get(level);
    },
    builtLevels: () => [...groups.keys()].sort((a, b) => a - b),
    dispose: () => { scene.remove(root); },
  };
}
