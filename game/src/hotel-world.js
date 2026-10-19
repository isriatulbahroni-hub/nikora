import * as THREE from 'three';
import { Batch, canvasTexture } from './masjid-batch.js';
import { PROP_SPECS, WALL_THICKNESS, wallToRect } from './villa-layout.js';
import { HOTEL_BUILDING, HOTEL_CAR_SPOTS, HOTEL_FORECOURT, HOTEL_LEVEL_COUNT, HOTEL_LEVEL_HEIGHT, HOTEL_PARKING, HOTEL_SITE, HOTEL_TOP_Y, HOTEL_WALL_HEIGHT, LIFTS, ROAD, hotelLevelY, isGuestLevel } from './hotel-layout.js';
import { CANOPY, CORRIDOR_COLOR, FLOOR_COLORS } from './hotel-places.js';
import { doorTop } from './hotel-camera.js';

// Dunia 3D NIKORA Grand Hotel. Tiap lantai dibangun sekali sebagai satu kelompok (satu panggilan gambar untuk lantai,
// dinding, ambang, dan perabot). Tampilan memakai potongan tampak: hanya lantai sampai lantai pemain yang digambar,
// lantai di atasnya disembunyikan supaya kamera tidak terhalang langit-langit. Dari luar, menara tampak utuh.
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
const SKY = 0xbcd9ee;
const THICK = 0.3; // tebal kulit menara
const CAR_COLORS = [0xc0392b, 0x2c3e50, 0xecf0f1, 0x7f8c8d, 0x2980b9, 0xf1c40f];

const box = (batch, x1, x2, y1, y2, z1, z2, color) => batch.add((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, x2 - x1, y2 - y1, z2 - z1, color);

function solid(parent, material, x1, x2, y1, y2, z1, z2) {
  const m = new THREE.Mesh(UNIT, material);
  m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  m.scale.set(x2 - x1, y2 - y1, z2 - z1);
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------- perabot
function drawProp(b, p, y0) {
  const s = PROP_SPECS[p.type];
  if (!s) return;
  const { hx, hz } = s;
  const x1 = p.x - hx;
  const x2 = p.x + hx;
  const z1 = p.z - hz;
  const z2 = p.z + hz;
  switch (p.type) {
    case 'bed': {
      const north = p.z < (HOTEL_BUILDING[1] + HOTEL_BUILDING[3]) / 2; // kepala tempat tidur ke dinding terdekat (utara/selatan)
      const head = north ? -1 : 1;
      box(b, x1, x2, y0, y0 + 0.45, z1, z2, 0x6b4a2f);
      box(b, x1 + 0.05, x2 - 0.05, y0 + 0.45, y0 + 0.72, z1 + 0.05, z2 - 0.05, 0xf4f1ea);
      const hbZ = head < 0 ? z1 : z2 - 0.12;
      box(b, x1, x2, y0, y0 + 1.2, hbZ, hbZ + 0.12, 0x5a3b24);
      const footZ = p.z - head * hz;
      const zA = footZ;
      const zB = footZ + head * 1.3;
      box(b, x1 + 0.04, x2 - 0.04, y0 + 0.72, y0 + 0.78, Math.min(zA, zB), Math.max(zA, zB), 0x8fa9c8);
      const pz = p.z + head * (hz - 0.4);
      for (const dx of [-0.45, 0.45]) box(b, p.x + dx - 0.3, p.x + dx + 0.3, y0 + 0.72, y0 + 0.82, pz - 0.2, pz + 0.2, 0xffffff);
      break;
    }
    case 'sofa':
      box(b, x1, x2, y0, y0 + 0.45, z1, z2, 0x7d4f45);
      box(b, x1, x2, y0 + 0.45, y0 + 0.95, z2 - 0.14, z2, 0x6a4038);
      box(b, x1, x1 + 0.18, y0 + 0.45, y0 + 0.7, z1, z2 - 0.14, 0x6a4038);
      box(b, x2 - 0.18, x2, y0 + 0.45, y0 + 0.7, z1, z2 - 0.14, 0x6a4038);
      break;
    case 'table':
      box(b, p.x - 0.12, p.x + 0.12, y0, y0 + 0.72, p.z - 0.12, p.z + 0.12, 0x5b4630);
      box(b, x1, x2, y0 + 0.72, y0 + 0.8, z1, z2, 0xdcc8a4);
      break;
    case 'desk':
      box(b, x1, x2, y0, y0 + 1.1, z1, z2, 0x5a3d2b);
      box(b, x1 - 0.05, x2 + 0.05, y0 + 1.1, y0 + 1.16, z1 - 0.05, z2 + 0.05, 0x2b2d31);
      break;
    case 'counter':
      box(b, x1, x2, y0, y0 + 0.95, z1, z2, 0x9097a0);
      box(b, x1, x2, y0 + 0.95, y0 + 1.0, z1, z2, 0x30343a);
      break;
    case 'tub':
      box(b, x1, x2, y0, y0 + 0.8, z1, z2, 0xf0f0f0);
      box(b, x1 + 0.15, x2 - 0.15, y0 + 0.78, y0 + 0.83, z1 + 0.15, z2 - 0.15, 0x6ac4e0);
      break;
    case 'lounger':
      box(b, x1, x2, y0, y0 + 0.35, z1, z2, 0xf2efe6);
      box(b, x1, x2, y0 + 0.35, y0 + 0.6, z1, z1 + 0.35, 0xe6e1d3);
      break;
    default:
      box(b, x1, x2, y0, y0 + 0.8, z1, z2, 0xaaaaaa);
  }
}

// ---------------------------------------------------------------- satu lantai
function buildLevel(level, data, material) {
  const group = new THREE.Group();
  const b = new Batch(UNIT, material);
  const y0 = hotelLevelY(level);
  const [bx1, bz1, bx2, bz2] = HOTEL_BUILDING;
  box(b, bx1, bx2, y0 - 0.41, y0 - 0.01, bz1, bz2, CORRIDOR_COLOR); // pelat dasar (lorong di antara kamar)
  for (const r of data.rooms) {
    const color = r.kind === 'guest' ? (r.no % 2 ? 0xd9c3a0 : 0xcfb892) : FLOOR_COLORS[r.kind] ?? 0xcccccc;
    box(b, r.rect[0], r.rect[2], y0 - 0.4, y0, r.rect[1], r.rect[3], color);
  }
  const wallColor = isGuestLevel(level) ? 0xefe6d6 : 0xf3ecdd;
  for (const w of data.walls) {
    const r = wallToRect(w);
    box(b, r.minX, r.maxX, y0, y0 + HOTEL_WALL_HEIGHT, r.minZ, r.maxZ, wallColor);
  }
  const t = WALL_THICKNESS / 2;
  for (const d of data.doors) {
    const hw = d.width / 2;
    const lo = y0 + doorTop(d);
    const hi = y0 + HOTEL_WALL_HEIGHT;
    if (d.orient === 'h') box(b, d.x - hw, d.x + hw, lo, hi, d.z - t, d.z + t, wallColor);
    else box(b, d.x - t, d.x + t, lo, hi, d.z - hw, d.z + hw, wallColor);
  }
  for (const p of data.props) drawProp(b, p, y0);
  for (const lift of LIFTS) {
    const [lx1, lz1, lx2, lz2] = lift.rect;
    box(b, lx1, lx2, y0, y0 + 0.05, lz1, lz2, 0xd4af37); // lantai kabin
    box(b, lx1, lx1 + 0.1, y0, y0 + 3.2, lz1, lz2, 0xb8c0c8);
    box(b, lx2 - 0.1, lx2, y0, y0 + 3.2, lz1, lz2, 0xb8c0c8);
  }
  for (const r of data.rooms) {
    if (r.id !== 'indoor_pool' && r.id !== 'infinity_pool') continue;
    box(b, r.rect[0] + 2.4, r.rect[2] - 2.4, y0, y0 + 0.04, r.rect[1] + 2.4, r.rect[3] - 2.4, 0xf4f4f4); // bibir kolam
    box(b, r.rect[0] + 3, r.rect[2] - 3, y0, y0 + 0.07, r.rect[1] + 3, r.rect[3] - 3, 0x39c3df); // air
  }
  if (level === HOTEL_LEVEL_COUNT - 1) {
    // pagar teras di tepi bangunan
    box(b, bx1, bx2, y0, y0 + 1.1, bz1, bz1 + 0.2, 0xdad3c4);
    box(b, bx1, bx2, y0, y0 + 1.1, bz2 - 0.2, bz2, 0xdad3c4);
    box(b, bx1, bx1 + 0.2, y0, y0 + 1.1, bz1, bz2, 0xdad3c4);
    box(b, bx2 - 0.2, bx2, y0, y0 + 1.1, bz1, bz2, 0xdad3c4);
  }
  b.build(group);
  return group;
}

// ---------------------------------------------------------------- halaman, jalan, kendaraan, pepohonan
function buildSite(scene, renderer) {
  const lambert = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const flat = (w, d, x, y, z, color) => {
    const m = new THREE.Mesh(PLANE, new THREE.MeshLambertMaterial({ color }));
    m.rotation.x = -Math.PI / 2;
    m.scale.set(w, d, 1);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };
  flat(1600, 1600, 0, -0.32, 300, 0x5f9a4e); // rumput
  flat(HOTEL_SITE.maxX - HOTEL_SITE.minX, HOTEL_SITE.maxZ - HOTEL_SITE.minZ, (HOTEL_SITE.minX + HOTEL_SITE.maxX) / 2, -0.3, (HOTEL_SITE.minZ + HOTEL_SITE.maxZ) / 2, 0xcfc6b2); // paving tapak
  const roadLen = ROAD.toZ - ROAD.fromZ;
  flat(ROAD.half * 2, roadLen, ROAD.x, -0.28, (ROAD.fromZ + ROAD.toZ) / 2, 0x3d4046);
  flat(HOTEL_FORECOURT[2] - HOTEL_FORECOURT[0], HOTEL_FORECOURT[3] - HOTEL_FORECOURT[1], (HOTEL_FORECOURT[0] + HOTEL_FORECOURT[2]) / 2, -0.28, (HOTEL_FORECOURT[1] + HOTEL_FORECOURT[3]) / 2, 0x4a4d54);
  flat(HOTEL_PARKING[2] - HOTEL_PARKING[0], HOTEL_PARKING[3] - HOTEL_PARKING[1], (HOTEL_PARKING[0] + HOTEL_PARKING[2]) / 2, -0.28, (HOTEL_PARKING[1] + HOTEL_PARKING[3]) / 2, 0x41444a);

  const paint = new Batch(UNIT, lambert);
  for (let z = ROAD.fromZ + 4; z < ROAD.toZ - 3; z += 8) paint.add(ROAD.x, -0.25, z, 0.25, 0.02, 3.5, 0xf2f2f2); // marka tengah jalan
  for (const row of [0, 1]) for (let i = 0; i <= 6; i++) paint.add(52 + row * 24, -0.25, 392 + i * 11 - 5.5, 5.5, 0.02, 0.15, 0xf0f0f0); // garis parkir
  paint.build(scene);

  const bodies = new Batch(UNIT, lambert);
  const cabins = new Batch(UNIT, lambert);
  HOTEL_CAR_SPOTS.forEach((s, i) => {
    bodies.add(s.x, 0.55, s.z, 1.9, 0.8, 4.2, CAR_COLORS[i % CAR_COLORS.length], s.heading);
    cabins.add(s.x, 1.15, s.z, 1.6, 0.6, 2.3, 0x1b2733, s.heading);
  });
  bodies.build(scene);
  cabins.build(scene);

  // pohon di sepanjang jalan dan tepi tapak (posisi tetap)
  const spots = [];
  for (let z = 100; z < 360; z += 26) spots.push([-12, z], [12, z]);
  for (let x = -100; x <= 100; x += 25) spots.push([x, 548]);
  for (let z = 380; z < 560; z += 30) spots.push([-104, z], [108, z]);
  const trunks = new Batch(new THREE.CylinderGeometry(0.22, 0.32, 1, 6), lambert);
  const crowns = new Batch(new THREE.IcosahedronGeometry(1, 1), lambert);
  spots.forEach(([x, z], i) => {
    const h = 2.4 + ((i * 37) % 7) * 0.18;
    const r = 1.8 + ((i * 53) % 5) * 0.25;
    trunks.add(x, h / 2, z, 1, h, 1, 0x6b4a2f);
    crowns.add(x, h + r * 0.6, z, r, r * 1.1, r, i % 3 === 0 ? 0x3f8a3a : i % 3 === 1 ? 0x4a9a44 : 0x377a34);
  });
  trunks.build(scene);
  crowns.build(scene);

  // kanopi lobi (tempat turun penumpang)
  const trim = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
  const pillar = new THREE.MeshLambertMaterial({ color: 0xf2eee4 });
  solid(scene, trim, CANOPY.x1, CANOPY.x2, CANOPY.y1, CANOPY.y2, CANOPY.z1, CANOPY.z2);
  solid(scene, new THREE.MeshLambertMaterial({ color: 0xd4af37 }), CANOPY.x1, CANOPY.x2, CANOPY.y1 - 0.15, CANOPY.y1, CANOPY.z1, CANOPY.z1 + 0.2);
  for (const x of [CANOPY.x1 + 1, CANOPY.x2 - 1]) for (const z of [CANOPY.z1 + 1.5, CANOPY.z2 - 1.5]) solid(scene, pillar, x - 0.3, x + 0.3, 0, CANOPY.y1, z - 0.3, z + 0.3);

  // cahaya dan langit
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 260, 950);
  const hemi = new THREE.HemisphereLight(0xdbeaff, 0x7a6b55, 0.9);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.1);
  sun.position.set(150, 260, -120);
  scene.add(hemi, sun);
  return { hemi, sun };
}

// ---------------------------------------------------------------- kulit menara (tampak luar)
function buildShell(renderer) {
  const group = new THREE.Group();
  const [bx1, bz1, bx2, bz2] = HOTEL_BUILDING;
  const H = HOTEL_TOP_Y;
  const skin = new THREE.MeshLambertMaterial({ color: 0xe9e1d3 });
  const roof = new THREE.MeshLambertMaterial({ color: 0xcfc6b6 });
  solid(group, skin, bx1 - THICK, bx1, -0.3, H, bz1 - THICK, bz2 + THICK); // barat
  solid(group, skin, bx2, bx2 + THICK, -0.3, H, bz1 - THICK, bz2 + THICK); // timur
  solid(group, skin, bx1, bx2, -0.3, H, bz2, bz2 + THICK); // selatan
  solid(group, skin, bx1 - THICK, -3, -0.3, H, bz1 - THICK, bz1); // utara kiri pintu utama
  solid(group, skin, 3, bx2 + THICK, -0.3, H, bz1 - THICK, bz1); // utara kanan pintu utama
  solid(group, skin, -3, 3, 5, H, bz1 - THICK, bz1); // di atas pintu utama
  solid(group, roof, bx1 - THICK, bx2 + THICK, H - 0.2, H + 0.3, bz1 - THICK, bz2 + THICK); // atap
  for (const [x1, x2, z1, z2] of [[bx1 - THICK, bx2 + THICK, bz1 - THICK, bz1], [bx1 - THICK, bx2 + THICK, bz2, bz2 + THICK], [bx1 - THICK, bx1, bz1, bz2], [bx2, bx2 + THICK, bz1, bz2]]) {
    solid(group, skin, x1, x2, H + 0.3, H + 1.3, z1, z2); // dinding pembatas atap
  }

  // pita jendela gelap tiap lantai (lantai 2 ke atas; lantai dasar punya kaca lobi di balik pintu)
  const bands = new Batch(UNIT, new THREE.MeshLambertMaterial({ color: 0xffffff }));
  for (let l = 1; l < HOTEL_LEVEL_COUNT; l++) {
    const y1 = l * HOTEL_LEVEL_HEIGHT + 1.2;
    const y2 = y1 + 1.8;
    const o = THICK + 0.04;
    box(bands, bx1 - o, bx2 + o, y1, y2, bz1 - o, bz1 - THICK, 0x23384f);
    box(bands, bx1 - o, bx2 + o, y1, y2, bz2 + THICK, bz2 + o, 0x23384f);
    box(bands, bx1 - o, bx1 - THICK, y1, y2, bz1 - THICK, bz2 + THICK, 0x23384f);
    box(bands, bx2 + THICK, bx2 + o, y1, y2, bz1 - THICK, bz2 + THICK, 0x23384f);
  }
  bands.build(group);

  // helipad dan tiang antena di atap
  const pad = new THREE.Mesh(new THREE.CircleGeometry(8, 40), new THREE.MeshLambertMaterial({ color: 0x2f3338 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, H + 0.32, (bz1 + bz2) / 2);
  group.add(pad);
  const ring = new THREE.Mesh(new THREE.RingGeometry(7.2, 7.8, 40), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, H + 0.34, (bz1 + bz2) / 2);
  group.add(ring);
  const hTex = canvasTexture([128, 128], (ctx, w, h) => {
    ctx.fillStyle = '#f2f2f2';
    ctx.font = `700 ${h * 0.8}px ui-sans-serif, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', w / 2, h / 2 + 4);
  }, renderer);
  const hMark = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: hTex, transparent: true, toneMapped: false }));
  hMark.rotation.x = -Math.PI / 2;
  hMark.scale.set(7, 7, 1);
  hMark.position.set(0, H + 0.36, (bz1 + bz2) / 2);
  group.add(hMark);
  solid(group, new THREE.MeshLambertMaterial({ color: 0xc0392b }), 28, 28.4, H + 0.3, H + 12, 430, 430.4);

  // papan nama di fasad utara
  const sign = canvasTexture([1024, 160], (ctx, w, h) => {
    ctx.fillStyle = '#10192e';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#e9cf85';
    ctx.font = "700 84px Georgia, 'Times New Roman', serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NIKORA GRAND HOTEL', w / 2, h / 2 + 4);
  }, renderer);
  const board = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: sign, toneMapped: false }));
  board.scale.set(30, 4.7, 1);
  board.rotation.y = Math.PI; // menghadap utara (ke arah halaman)
  board.position.set(0, 58.2, bz1 - THICK - 0.08);
  group.add(board);
  return group;
}

// ---------------------------------------------------------------- pintu masuk dunia
export function buildHotelWorld(scene, world, { renderer } = {}) {
  const lights = buildSite(scene, renderer);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const levelGroups = world.levels.map((data, level) => {
    const g = buildLevel(level, data, material);
    scene.add(g);
    return g;
  });
  const shell = buildShell(renderer);
  scene.add(shell);

  // papan nama ruang dan nomor lift di lantai: dibuat sekali saat lantai pertama kali dikunjungi
  const labelMats = new Map();
  const labelMaterial = (text, bg) => {
    const key = `${text}|${bg}`;
    let m = labelMats.get(key);
    if (m) return m;
    const tex = canvasTexture([512, 128], (ctx, w, h) => {
      const r = 28;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.arcTo(w, 0, w, h, r);
      ctx.arcTo(w, h, 0, h, r);
      ctx.arcTo(0, h, 0, 0, r);
      ctx.arcTo(0, 0, w, 0, r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let size = 56;
      const setFont = () => { ctx.font = `700 ${size}px ui-sans-serif, 'Segoe UI', sans-serif`; };
      setFont();
      while (ctx.measureText(text).width > w - 36 && size > 20) {
        size -= 4;
        setFont();
      }
      ctx.fillText(text, w / 2, h / 2 + 2);
    }, renderer);
    m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    labelMats.set(key, m);
    return m;
  };
  const labelGroups = new Array(HOTEL_LEVEL_COUNT).fill(null);
  const makeLabels = (level) => {
    const g = new THREE.Group();
    const y = hotelLevelY(level) + 0.08;
    const put = (text, cx, cz, w, h, bg) => {
      const m = new THREE.Mesh(PLANE, labelMaterial(text, bg));
      m.rotation.x = -Math.PI / 2;
      m.position.set(cx, y, cz);
      m.scale.set(w, h, 1);
      m.renderOrder = 2;
      g.add(m);
    };
    LIFTS.forEach((l, i) => put(`LIFT ${i + 1}`, (l.rect[0] + l.rect[2]) / 2, l.rect[3] + 1.0, 2.6, 0.65, 'rgba(120,90,20,.85)'));
    if (!isGuestLevel(level)) {
      for (const r of world.levels[level].rooms) {
        if (r.kind === 'core') continue;
        const rw = r.rect[2] - r.rect[0];
        const rd = r.rect[3] - r.rect[1];
        const w = Math.min(10, Math.max(5, Math.min(rw, rd) - 2));
        put(r.name, (r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2, w, w / 4, 'rgba(16,26,48,.78)');
      }
    }
    scene.add(g);
    return g;
  };

  let viewKey = '';
  /** level = lantai tertinggi yang digambar; inside = di dalam bangunan (potongan tampak) atau di luar (menara utuh). */
  function setView(level, inside) {
    const key = `${level}|${inside}`;
    if (key === viewKey) return;
    viewKey = key;
    levelGroups.forEach((g, l) => { g.visible = inside ? l <= level : l === 0; });
    shell.visible = !inside;
    const labelLevel = inside || level === 0 ? level : -1;
    if (labelLevel >= 0 && !labelGroups[labelLevel]) labelGroups[labelLevel] = makeLabels(labelLevel);
    labelGroups.forEach((g, l) => { if (g) g.visible = l === labelLevel; });
  }

  /** k = 0 (di luar) .. 1 (di dalam ruangan): cahaya langit diredam halus. */
  function setIndoor(k) {
    lights.hemi.intensity = 0.9 - 0.3 * k;
    lights.sun.intensity = 1.1 - 0.5 * k;
  }

  setView(0, false);
  return { setView, setIndoor, levelGroups, shell };
}
