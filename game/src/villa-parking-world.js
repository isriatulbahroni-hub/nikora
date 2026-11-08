// Gambar 3D parkir NIKORA Wedding Villa (THREE). Data dan tata letak ada di villa-parking.js.
// Semuanya InstancedMesh murah (belasan draw call untuk 300 slot): aspal, garis slot, lampu LED slot yang menyapu seperti pemindai,
// panah LED penuntun yang berjalan di lajur dan lorong, kanopi panel surya di blok listrik dan parkir karyawan, pengisi daya mobil listrik,
// terminal bus, gerbang lengkung bercahaya, dan papan digital "SISA SLOT" yang menghitung langsung.
// Parkir tamu HIDUP: tiap beberapa detik ada mobil yang datang (valet digital memilih slot kosong terdekat, mobil menyusuri lajur dan lorong lalu
// parkir mundur) atau pergi (maju keluar slot dan kembali ke jalan); lampu slot dan papan ikut berubah.
import * as THREE from 'three';
import {
  BUS_LOT, CANOPIES, CAR_COLORS, GUEST_ENTRY, GUEST_LOT, GUEST_PROMENADE, GUIDE_LANES, PARKING_ROAD, SERVICE_LANE, STAFF_ENTRY, STAFF_LOT, VALET_POINT,
  busBays, guestOccupied, guestSlots, guestStats, mulberry32, parkedBuses, parkedCars, pickParkingEvent, routeFromSlot, routeToSlot, slotLightColor,
  staffOccupied, staffSlots,
} from './villa-parking.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const GOLD = 0xc9a24b;
const CREAM = 0xf1e9d6;
const BLUE = 0x3b82f6;
const AMBER = 0xffb347;
const EV_CYAN = 0x39d0ff;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
const rectBox = (r, y, h, extra = {}) => ({ x: (r[0] + r[2]) / 2, y, z: (r[1] + r[3]) / 2, sx: r[2] - r[0], sy: h, sz: r[3] - r[1], ...extra });
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const hasDom = () => typeof document !== 'undefined';

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

// ---------------------------------------------------------------- tekstur kanvas (hanya di browser)
function signTexture(title, sub, accent) {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#14110d';
  g.fillRect(0, 0, 768, 128);
  g.strokeStyle = accent;
  g.lineWidth = 5;
  g.strokeRect(6, 6, 756, 116);
  g.fillStyle = accent;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '600 52px Georgia, serif';
  g.fillText(title, 384, sub ? 52 : 64);
  if (sub) {
    g.fillStyle = '#d8cfb8';
    g.font = '400 28px Georgia, serif';
    g.fillText(sub, 384, 98);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Papan digital "SISA SLOT": digambar ulang tiap kali hitungan berubah. */
function boardTexture() {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 256;
  const g = c.getContext('2d');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  let last = '';
  const draw = (free, total, evFree) => {
    const key = `${free}|${total}|${evFree}`;
    if (key === last) return;
    last = key;
    g.fillStyle = '#0b0d12';
    g.fillRect(0, 0, 768, 256);
    g.strokeStyle = hex(GOLD);
    g.lineWidth = 6;
    g.strokeRect(8, 8, 752, 240);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = hex(GOLD);
    g.font = '600 44px Georgia, serif';
    g.fillText('PARKIR TAMU · VALET DIGITAL', 384, 52);
    g.fillStyle = free > 0 ? '#39e07a' : '#ff5a5a';
    g.font = '700 110px "Courier New", monospace';
    g.fillText(free > 0 ? `SISA ${String(free).padStart(3, '0')}` : 'PENUH', 384, 140);
    g.fillStyle = '#d8cfb8';
    g.font = '400 30px Georgia, serif';
    g.fillText(`dari ${total} slot  ·  listrik ${evFree} kosong  ·  karyawan & bus ke timur`, 384, 218);
    t.needsUpdate = true;
  };
  return { texture: t, draw };
}

function solarTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0c1a38';
  g.fillRect(0, 0, 256, 256);
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, 'rgba(70,120,200,0.35)');
  grad.addColorStop(1, 'rgba(10,20,50,0.0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(190,205,230,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke();
  }
  g.strokeStyle = 'rgba(230,236,248,0.85)';
  g.lineWidth = 5;
  g.strokeRect(2, 2, 252, 252);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const ARROW_TILE = 3.2; // panjang satu pengulangan panah (m)
function arrowTexture(color) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = hex(color);
  g.shadowColor = hex(color);
  g.shadowBlur = 10;
  g.beginPath();
  g.moveTo(16, 6); g.lineTo(46, 6); g.lineTo(86, 32); g.lineTo(46, 58); g.lineTo(16, 58); g.lineTo(56, 32);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- himpunan mobil (instancing, satu mesh per bagian)
const CAR_PARTS = [
  { name: 'body', mat: 'body', locals: [{ x: 0, y: 0.62, z: 0, sx: 4.7, sy: 0.7, sz: 1.95 }] },
  { name: 'cabin', mat: 'cabin', locals: [{ x: -0.35, y: 1.25, z: 0, sx: 2.5, sy: 0.55, sz: 1.75 }] },
  { name: 'wheel', mat: 'wheel', locals: [[-1.4, -0.95], [-1.4, 0.95], [1.4, -0.95], [1.4, 0.95]].map(([x, z]) => ({ x, y: 0.3, z, sx: 0.75, sy: 0.6, sz: 0.28 })) },
  { name: 'head', mat: 'head', locals: [0.7, -0.7].map((z) => ({ x: 2.36, y: 0.72, z, sx: 0.06, sy: 0.14, sz: 0.38 })) },
  { name: 'tail', mat: 'tail', locals: [0.7, -0.7].map((z) => ({ x: -2.36, y: 0.72, z, sx: 0.06, sy: 0.14, sz: 0.38 })) },
];

/**
 * Himpunan `capacity` mobil: place(i, x, z, ry, k) menaruh mobil ke-i (hidung mengarah +x lokal, diputar ry), hide(i) menyembunyikan,
 * setColor(i, hex) mengecat badan. flush() wajib dipanggil setelah perubahan.
 */
function makeCarSet(parent, capacity, M, { dynamic = false } = {}) {
  const tmp = new THREE.Matrix4();
  const base = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const ax = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const color = new THREE.Color();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const parts = CAR_PARTS.map((def) => {
    const n = def.locals.length;
    const mesh = new THREE.InstancedMesh(BOX, M[def.mat], capacity * n);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (dynamic) mesh.frustumCulled = false; // posisi berubah dan instance tersembunyi menumpuk di asal: jangan andalkan bola pembatas
    parent.add(mesh);
    const locals = def.locals.map((l) => new THREE.Matrix4().compose(new THREE.Vector3(l.x, l.y, l.z), new THREE.Quaternion(), new THREE.Vector3(l.sx, l.sy, l.sz)));
    return { def, n, mesh, locals };
  });
  const body = parts[0].mesh;
  for (let i = 0; i < capacity; i++) for (const p of parts) for (let j = 0; j < p.n; j++) p.mesh.setMatrixAt(i * p.n + j, zero);
  for (let i = 0; i < capacity; i++) body.setColorAt(i, color.set(0xffffff));
  return {
    parts,
    place(i, x, z, ry, k = 1) {
      base.compose(pos.set(x, 0, z), q.setFromAxisAngle(ax, ry), sc.set(1, k, 1));
      for (const p of parts) for (let j = 0; j < p.n; j++) p.mesh.setMatrixAt(i * p.n + j, tmp.multiplyMatrices(base, p.locals[j]));
    },
    hide(i) {
      for (const p of parts) for (let j = 0; j < p.n; j++) p.mesh.setMatrixAt(i * p.n + j, zero);
    },
    setColor(i, c) { body.setColorAt(i, color.set(c)); },
    flush() {
      for (const p of parts) p.mesh.instanceMatrix.needsUpdate = true;
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
    },
    dispose() { for (const p of parts) p.mesh.dispose(); },
  };
}

const sameRow = (a, b) => !!b && b.x === a.x && b.axis === a.axis && Math.abs(b.z - a.z - a.w) < 1e-6;
/** Garis pembatas slot (tegak lurus lorong) untuk baris-baris slot searah sumbu x. */
function dividers(slots, thick, y) {
  const out = [];
  slots.forEach((s, i) => {
    out.push({ x: s.x, y, z: s.z - s.w / 2, sx: s.d, sy: 0.02, sz: thick });
    if (!sameRow(s, slots[i + 1])) out.push({ x: s.x, y, z: s.z + s.w / 2, sx: s.d, sy: 0.02, sz: thick });
  });
  return out;
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Bangun seluruh parkir ke dalam `parent` (grup akar villa). Mengembalikan {root, stats, update, dispose}. */
export function buildVillaParking(parent, { asphalt = null } = {}) {
  const root = new THREE.Group();
  root.name = 'villa-parking';
  parent.add(root);
  const planes = [];
  const textures = [];
  const M = {
    asphalt: asphalt ?? std(0x1b1d21, { roughness: 0.92 }), promenade: std(0xd9cfba, { roughness: 0.85 }),
    line: std(0xf2f0e4, { roughness: 0.7 }), roadLine: new THREE.MeshBasicMaterial({ color: 0xf2d36b }), curb: std(0x8d8f94, { roughness: 0.85 }),
    hedge: std(0x2a5c36), trunk: std(0x6b4a2f), leaf: std(0x2f6f3a),
    gold: std(GOLD, { roughness: 0.35, metalness: 0.75 }), cream: std(CREAM, { roughness: 0.9 }), dark: std(0x2a2d33, { roughness: 0.6, metalness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd0e6, roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.3, depthWrite: false }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff0c8 }), tint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    body: std(0xffffff, { roughness: 0.3, metalness: 0.15 }), cabin: std(0x10161d, { roughness: 0.15, metalness: 0.3 }), wheel: std(0x0a0a0c, { roughness: 0.9 }),
    head: new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), tail: new THREE.MeshBasicMaterial({ color: 0xff3b3b }),
    frame: std(0xd7dbe2, { roughness: 0.35, metalness: 0.7 }), busGlass: std(0x0f1a26, { roughness: 0.1, metalness: 0.4 }),
  };
  const guest = guestSlots();
  const staff = staffSlots();
  const bays = busBays();
  const guestIndex = new Map(guest.map((s, i) => [s.id, i]));
  const occupied = new Set(guestOccupied()); // salinan hidup: berubah karena mobil datang/pergi (guestOccupied() sendiri tetap awal)
  const arriving = new Set(); // slot yang sedang dituju mobil
  const leaving = new Set(); // slot yang mobilnya sedang keluar

  // ---- aspal, jalur pejalan, marka tengah jalan
  instancedBoxes(root, [PARKING_ROAD, GUEST_ENTRY, GUEST_LOT, STAFF_ENTRY, STAFF_LOT, SERVICE_LANE, BUS_LOT].map((r) => rectBox(r, 0.03, 0.06)), M.asphalt, { receive: true });
  instancedBoxes(root, [rectBox(GUEST_PROMENADE, 0.04, 0.08)], M.promenade, { receive: true });
  const dashes = [];
  for (let z = PARKING_ROAD[1] + 1.5; z < PARKING_ROAD[3] - 2; z += 5) dashes.push({ x: 0, y: 0.065, z, sx: 0.18, sy: 0.01, sz: 2.2 });
  instancedBoxes(root, dashes, M.roadLine);

  // ---- garis slot dan lampu LED kepala slot
  const busLines = bays.map((b) => ({ x: b.x - b.w / 2, y: 0.07, z: b.z, sx: 0.14, sy: 0.02, sz: b.d }));
  const lastBay = bays[bays.length - 1];
  busLines.push({ x: lastBay.x + lastBay.w / 2, y: 0.07, z: lastBay.z, sx: 0.14, sy: 0.02, sz: lastBay.d });
  instancedBoxes(root, [...dividers(guest, 0.12, 0.07), ...dividers(staff, 0.12, 0.07), ...busLines], M.line);

  const lightItem = (s) => {
    if (s.axis === 'z') return { x: s.x, y: 0.075, z: s.z - s.d / 2 + 0.3, sx: 2.4, sy: 0.03, sz: 0.25 };
    const dir = Math.sign(Math.cos(s.heading));
    return { x: s.x - dir * (s.d / 2 - 0.2), y: 0.075, z: s.z, sx: 0.22, sy: 0.03, sz: 1.4 };
  };
  const stateOf = (s) => (arriving.has(s.id) || leaving.has(s.id) ? 2 : occupied.has(s.id) ? 1 : 0);
  const baseColor = (s) => {
    const st = stateOf(s);
    return st === 2 ? AMBER : slotLightColor(s, st === 1);
  };
  const guestLights = instancedBoxes(root, guest.map((s) => ({ ...lightItem(s), color: baseColor(s) })), M.tint);
  const staffOcc = staffOccupied();
  instancedBoxes(root, staff.map((s) => ({ ...lightItem(s), color: slotLightColor(s, staffOcc.has(s.id)) })), M.tint);
  const busOcc = new Set(parkedBuses().map((b) => b.id));
  instancedBoxes(root, bays.map((s) => ({ ...lightItem(s), color: slotLightColor(s, busOcc.has(s.id)) })), M.tint);

  // ---- jalur tanaman di belakang tiap modul: batas granit, pagar tanaman, pohon (kecuali di bawah kanopi), lampu taman
  const covered = (cx) => CANOPIES.some((c) => c.pillarsX.some((p) => Math.abs(p - cx) < 0.05));
  const strips = new Map();
  for (const s of [...guest, ...staff]) {
    if (s.heading !== Math.PI) continue; // satu jalur per modul, di belakang baris kanan
    const key = `${s.block}`;
    const r = strips.get(key) ?? { s, zmin: Infinity, zmax: -Infinity };
    r.zmin = Math.min(r.zmin, s.z - s.w / 2);
    r.zmax = Math.max(r.zmax, s.z + s.w / 2);
    strips.set(key, r);
  }
  const curbs = [];
  const hedges = [];
  const trunks = [];
  const crowns = [];
  const poles = [];
  const heads = [];
  const tones = [0x2f6f3a, 0x3c8044, 0x27603a];
  for (const r of strips.values()) {
    const x0 = r.s.x + r.s.d / 2;
    const cx = x0 + 0.7;
    curbs.push(rectBox([x0, r.zmin, x0 + 1.4, r.zmax], 0.09, 0.18));
    hedges.push({ x: cx, y: 0.58, z: (r.zmin + r.zmax) / 2, sx: 0.9, sy: 0.8, sz: r.zmax - r.zmin - 0.4 });
    if (covered(cx)) continue;
    let k = 0;
    for (let z = r.zmin + 7; z < r.zmax - 3; z += 14, k++) {
      trunks.push({ x: cx, y: 1.6, z, sx: 0.35, sy: 3.2, sz: 0.35 });
      crowns.push({ x: cx, y: 4.3, z, sx: 2.6, sy: 2.4, sz: 2.6, color: tones[k % 3] });
    }
    for (let z = r.zmin + 14; z < r.zmax - 4; z += 28) {
      poles.push({ x: cx, y: 3.25, z, sx: 0.18, sy: 6.5, sz: 0.18 });
      heads.push({ x: cx, y: 6.6, z, sx: 0.9, sy: 0.22, sz: 0.9 });
    }
  }
  // lampu taman di sepanjang jalur pejalan
  for (let z = GUEST_PROMENADE[1] + 9; z < GUEST_PROMENADE[3] - 3; z += 14) {
    poles.push({ x: GUEST_PROMENADE[0] + 0.6, y: 3.25, z, sx: 0.18, sy: 6.5, sz: 0.18 });
    heads.push({ x: GUEST_PROMENADE[0] + 0.6, y: 6.6, z, sx: 0.9, sy: 0.22, sz: 0.9 });
  }
  instancedBoxes(root, curbs, M.curb, { receive: true });
  instancedBoxes(root, hedges, M.hedge);
  instancedBoxes(root, trunks, M.trunk, { cast: true });
  instancedBoxes(root, crowns, M.leaf, { cast: true });

  // ---- mobil tamu (hidup), mobil karyawan (diam), bus (diam)
  const guestCars = makeCarSet(root, guest.length, M, { dynamic: true });
  const palette = mulberry32(7); // urutan undian sama dengan parkedCars(): warna tiap slot tetap
  const slotColor = guest.map(() => CAR_COLORS[Math.floor(palette() * CAR_COLORS.length)]);
  guest.forEach((s, i) => {
    guestCars.setColor(i, slotColor[i]);
    if (occupied.has(s.id)) guestCars.place(i, s.x, s.z, s.heading);
  });
  guestCars.flush();

  const staffList = parkedCars(staff, staffOcc, 13);
  const staffCars = makeCarSet(root, Math.max(1, staffList.length), M);
  staffList.forEach((c, i) => { staffCars.setColor(i, c.color); staffCars.place(i, c.x, c.z, c.heading); });
  staffCars.flush();

  const buses = parkedBuses(busOcc);
  const busBodies = [];
  const busWindows = [];
  const busStripes = [];
  const busWheels = [];
  const busRoofs = [];
  for (const b of buses) {
    // bus memanjang di sumbu z (hidung ke selatan): panjang 12 m searah z
    busBodies.push({ x: b.x, y: 1.9, z: b.z, sx: 2.6, sy: 2.8, sz: 12, color: b.color });
    busWindows.push({ x: b.x, y: 2.6, z: b.z, sx: 2.64, sy: 0.95, sz: 11.2 });
    busStripes.push({ x: b.x, y: 1.25, z: b.z, sx: 2.64, sy: 0.22, sz: 12.02, color: GOLD });
    busRoofs.push({ x: b.x, y: 3.4, z: b.z - 1, sx: 1.6, sy: 0.25, sz: 2.4 });
    for (const dz of [-3.8, 3.6]) for (const dx of [-1.2, 1.2]) busWheels.push({ x: b.x + dx, y: 0.5, z: b.z + dz, sx: 0.4, sy: 1, sz: 1 });
  }
  instancedBoxes(root, busBodies, M.body);
  instancedBoxes(root, busWindows, M.busGlass);
  instancedBoxes(root, busStripes, M.body);
  instancedBoxes(root, busRoofs, M.frame);
  instancedBoxes(root, busWheels, M.wheel);

  // ---- pengisi daya mobil listrik di blok E: satu tiang tiap dua slot, puncak menyala biru muda
  const chargers = [];
  const chargerTops = [];
  for (const s of guest) {
    if (!s.ev || Number(s.id.slice(-3)) % 2 === 0) continue;
    const dir = Math.sign(Math.cos(s.heading));
    const x = s.x - dir * (s.d / 2 - 0.15);
    const z = s.z + s.w / 2;
    chargers.push({ x, y: 0.65, z, sx: 0.3, sy: 1.3, sz: 0.3 });
    chargerTops.push({ x, y: 1.2, z, sx: 0.34, sy: 0.14, sz: 0.34, color: EV_CYAN });
  }
  instancedBoxes(root, chargers, M.dark);
  instancedBoxes(root, chargerTops, M.tint);

  // ---- kanopi panel surya: atap berpanel, bingkai perak, tiang di jalur tanaman, lampu LED di bawah atap
  const solar = hasDom() ? solarTexture() : null;
  if (solar) textures.push(solar);
  for (const c of CANOPIES) {
    const [x0, z0, x1, z1] = c.rect;
    const roofTex = solar ? solar.clone() : null;
    if (roofTex) { roofTex.needsUpdate = true; roofTex.repeat.set((x1 - x0) / 4, (z1 - z0) / 4); textures.push(roofTex); }
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: roofTex, roughness: 0.25, metalness: 0.5 });
    const roof = new THREE.Mesh(BOX, roofMat);
    roof.scale.set(x1 - x0, 0.22, z1 - z0);
    roof.position.set((x0 + x1) / 2, c.height, (z0 + z1) / 2);
    roof.castShadow = true;
    roof.receiveShadow = true;
    root.add(roof);
    planes.push({ material: roofMat, geometry: null });
    instancedBoxes(root, [rectBox([x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1], c.height - 0.16, 0.1)], M.frame);
    const pillars = [];
    for (const px of c.pillarsX) for (let z = z0 + 6; z < z1; z += 14) pillars.push({ x: px, y: c.height / 2, z, sx: 0.35, sy: c.height, sz: 0.35 });
    instancedBoxes(root, pillars, M.frame, { cast: true });
    const bars = [];
    for (let z = z0 + 3.5; z < z1; z += 7) for (const bx of [x0 + (x1 - x0) * 0.3, x0 + (x1 - x0) * 0.7]) bars.push({ x: bx, y: c.height - 0.3, z, sx: 0.2, sy: 0.05, sz: 3.6 });
    instancedBoxes(root, bars, M.light);
  }

  // ---- gerbang lengkung bercahaya di lajur masuk tamu dan papan zona
  const archX = -12;
  const archZ = (GUEST_ENTRY[1] + GUEST_ENTRY[3]) / 2;
  instancedBoxes(root, [
    { x: archX, y: 2.9, z: GUEST_ENTRY[1] + 0.5, sx: 0.7, sy: 5.8, sz: 0.7 }, { x: archX, y: 2.9, z: GUEST_ENTRY[3] - 0.5, sx: 0.7, sy: 5.8, sz: 0.7 },
    { x: archX, y: 5.95, z: archZ, sx: 0.6, sy: 0.5, sz: GUEST_ENTRY[3] - GUEST_ENTRY[1] },
  ], M.gold, { cast: true });
  instancedBoxes(root, [{ x: archX, y: 5.6, z: archZ, sx: 0.5, sy: 0.07, sz: GUEST_ENTRY[3] - GUEST_ENTRY[1] - 1.2 }], M.light);

  const signPoles = [];
  const addSign = (x, z, ry, title, sub, accent, { width = 8, y = 4.1, pole = true, off = 0.03 } = {}) => {
    if (pole) signPoles.push({ x, y: (y - 0.6) / 2, z, sx: 0.25, sy: y - 0.6, sz: 0.25 });
    if (!hasDom()) return; // uji di Node: tanpa kanvas
    const tex = signTexture(title, sub, hex(accent));
    textures.push(tex);
    const geo = new THREE.PlaneGeometry(width, (width * 128) / 768);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const nx = Math.sin(ry);
    const nz = Math.cos(ry);
    const front = new THREE.Mesh(geo, mat);
    front.position.set(x + nx * off, y, z + nz * off);
    front.rotation.y = ry;
    const back = new THREE.Mesh(geo, mat);
    back.position.set(x - nx * off, y, z - nz * off);
    back.rotation.y = ry + Math.PI;
    root.add(front, back);
    planes.push(front, back);
  };
  const stats = guestStats(occupied);
  addSign(archX, archZ, Math.PI / 2, 'NIKORA VILLA · PARKIR TAMU', `${stats.total} slot · valet digital · EV charging`, GOLD, { width: 7, y: 5.95, pole: false, off: 0.33 });
  for (const [block, v] of Object.entries(stats.blocks)) {
    const s = guest.find((g) => g.block === block);
    const stripX = s.x - s.d / 2 + 17.6 + 0.7; // jalur tanaman di belakang baris kanan modul
    addSign(stripX, GUEST_LOT[1] + 0.3, Math.PI, v.ev ? `BLOK ${block} · EV` : `BLOK ${block}`, v.ev ? `${v.total} slot · pengisian daya` : `${v.total} slot`, v.ev ? EV_CYAN : GOLD, { width: 6 });
  }
  addSign(30.3, STAFF_LOT[1] + 0.3, Math.PI, 'PARKIR KARYAWAN', 'Khusus staf villa · berkanopi surya', BLUE, { width: 7 });
  addSign(11.3, BUS_LOT[1] - 0.6, Math.PI, 'TERMINAL BUS', 'Antar-jemput villa ↔ hotel', AMBER, { width: 6 });
  instancedBoxes(root, signPoles, M.gold, { cast: true });
  instancedBoxes(root, poles, M.gold, { cast: true });
  instancedBoxes(root, heads, M.light);

  // ---- papan digital "SISA SLOT" di pinggir jalan (menghadap utara, ke arah mobil yang datang dari gerbang villa)
  let board = null;
  const boardSign = (() => {
    if (!hasDom()) return null;
    board = boardTexture();
    textures.push(board.texture);
    const geo = new THREE.PlaneGeometry(9, 3);
    const mat = new THREE.MeshBasicMaterial({ map: board.texture });
    const bx = -6.8;
    const bz = GUEST_ENTRY[1] - 1.6;
    const front = new THREE.Mesh(geo, mat);
    front.position.set(bx, 5.4, bz - 0.12);
    front.rotation.y = Math.PI;
    const back = new THREE.Mesh(geo, mat);
    back.position.set(bx, 5.4, bz + 0.12);
    root.add(front, back);
    planes.push(front, back);
    instancedBoxes(root, [{ x: bx - 3.6, y: 2.7, z: bz, sx: 0.3, sy: 5.4, sz: 0.3 }, { x: bx + 3.6, y: 2.7, z: bz, sx: 0.3, sy: 5.4, sz: 0.3 }, { x: bx, y: 6.95, z: bz, sx: 9.4, sy: 0.18, sz: 0.4 }], M.gold, { cast: true });
    return { geo, mat };
  })();
  const evSlots = guest.filter((s) => s.ev);
  const drawBoard = () => {
    if (!board) return;
    const unavailable = (s) => occupied.has(s.id) || arriving.has(s.id) || leaving.has(s.id);
    const free = guest.filter((s) => !unavailable(s)).length;
    board.draw(free, guest.length, evSlots.filter((s) => !unavailable(s)).length);
  };
  drawBoard();

  // ---- pos valet di jalur pejalan dan halte antar-jemput
  const vx = -6.6;
  const vz = 118;
  instancedBoxes(root, [
    { x: vx, y: 1.35, z: vz, sx: 3.2, sy: 2.7, sz: 2.6 }, // badan pos
    { x: vx, y: 2.85, z: vz, sx: 3.8, sy: 0.18, sz: 3.2 }, // atap emas
  ], M.cream, { cast: true });
  instancedBoxes(root, [{ x: vx, y: 2.95, z: vz, sx: 4.0, sy: 0.1, sz: 3.4 }], M.gold);
  instancedBoxes(root, [{ x: vx + 1.62, y: 1.5, z: vz, sx: 0.06, sy: 1.5, sz: 2.0 }], M.glass);
  addSign(vx + 1.7, vz, Math.PI / 2, 'VALET', 'dibantu valet digital', GOLD, { width: 2.8, y: 3.7, pole: false, off: 0.03 });
  const sx0 = -6.6;
  const sz0 = 164;
  instancedBoxes(root, [{ x: sx0, y: 2.9, z: sz0, sx: 4.8, sy: 0.18, sz: 2.6 }], M.cream, { cast: true });
  instancedBoxes(root, [{ x: sx0, y: 3.05, z: sz0, sx: 5.0, sy: 0.1, sz: 2.8 }], M.gold);
  instancedBoxes(root, [[-2.2, -1], [2.2, -1], [-2.2, 1], [2.2, 1]].map(([dx, dz]) => ({ x: sx0 + dx, y: 1.45, z: sz0 + dz, sx: 0.14, sy: 2.9, sz: 0.14 })), M.gold, { cast: true });
  instancedBoxes(root, [{ x: sx0, y: 0.5, z: sz0 + 0.9, sx: 3.6, sy: 0.12, sz: 0.5 }], M.dark);

  // ---- panah LED penuntun: texture panah per warna digeser terus di sepanjang lajur dan lorong
  const arrowTextures = new Map();
  if (hasDom()) {
    for (const g of GUIDE_LANES) {
      if (!arrowTextures.has(g.color)) { const t = arrowTexture(g.color); arrowTextures.set(g.color, t); textures.push(t); }
      const tex = arrowTextures.get(g.color);
      const len = g.axis === 'x' ? g.rect[2] - g.rect[0] : g.rect[3] - g.rect[1];
      const geo = new THREE.PlaneGeometry(len, g.wide);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / ARROW_TILE);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      const group = new THREE.Group();
      group.position.set((g.rect[0] + g.rect[2]) / 2, 0.078, (g.rect[1] + g.rect[3]) / 2);
      const dx = g.axis === 'x' ? g.dir : 0;
      const dz = g.axis === 'z' ? g.dir : 0;
      group.rotation.y = Math.atan2(-dz, dx);
      group.add(mesh);
      root.add(group);
      planes.push({ geometry: geo, material: mat });
    }
  }

  // ---- mobil hidup: valet digital menugaskan slot, mobil menyusuri rute, lampu slot dan papan ikut berubah
  const MOVERS = 4;
  const moverMats = [];
  const movers = Array.from({ length: MOVERS }, () => {
    const group = new THREE.Group();
    const bodyMat = std(0xffffff, { roughness: 0.3, metalness: 0.15 });
    moverMats.push(bodyMat);
    const parts = [
      [bodyMat, 0, 0.62, 0, 4.7, 0.7, 1.95], [M.cabin, -0.35, 1.25, 0, 2.5, 0.55, 1.75],
      [M.wheel, -1.4, 0.3, -0.95, 0.75, 0.6, 0.28], [M.wheel, -1.4, 0.3, 0.95, 0.75, 0.6, 0.28], [M.wheel, 1.4, 0.3, -0.95, 0.75, 0.6, 0.28], [M.wheel, 1.4, 0.3, 0.95, 0.75, 0.6, 0.28],
      [M.head, 2.36, 0.72, 0.7, 0.06, 0.14, 0.38], [M.head, 2.36, 0.72, -0.7, 0.06, 0.14, 0.38], [M.tail, -2.36, 0.72, 0.7, 0.06, 0.14, 0.38], [M.tail, -2.36, 0.72, -0.7, 0.06, 0.14, 0.38],
    ];
    for (const [mat, x, y, z, sx, sy, sz] of parts) {
      const mesh = new THREE.Mesh(BOX, mat);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      group.add(mesh);
    }
    group.visible = false;
    root.add(group);
    return { group, bodyMat, active: false, pts: [], seg: 0, along: 0, ry: 0, event: null, color: 0xffffff };
  });
  const CRUISE = 8; // m/s
  const PARKING_SPEED = 3; // m/s untuk ruas parkir mundur
  const ROAD_Z_NORTH = 96; // mobil muncul/menghilang di jalan, tepat di utara parkir

  const startMover = (mv, ev) => {
    const { slot, type } = ev;
    const idx = guestIndex.get(slot.id);
    let pts;
    if (type === 'arrive') {
      pts = [{ x: 0, z: ROAD_Z_NORTH }, { x: 0, z: VALET_POINT.z }, ...routeToSlot(slot)];
      arriving.add(slot.id);
      mv.color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    } else {
      pts = [...routeFromSlot(slot), { x: 0, z: VALET_POINT.z }, { x: 0, z: ROAD_Z_NORTH }];
      leaving.add(slot.id);
      occupied.delete(slot.id);
      mv.color = slotColor[idx];
      guestCars.hide(idx);
      guestCars.flush();
    }
    mv.bodyMat.color.set(mv.color);
    mv.pts = pts;
    mv.seg = 1;
    mv.along = 0;
    mv.event = ev;
    mv.active = true;
    const first = pts[0];
    const nx = pts[1].x - first.x;
    const nz = pts[1].z - first.z;
    mv.ry = Math.atan2(-nz, nx); // hidung searah ruas pertama
    mv.group.position.set(first.x, 0, first.z);
    mv.group.rotation.y = mv.ry;
    mv.group.visible = true;
  };

  const finishMover = (mv) => {
    const { slot, type } = mv.event;
    const idx = guestIndex.get(slot.id);
    if (type === 'arrive') {
      arriving.delete(slot.id);
      occupied.add(slot.id);
      guestCars.setColor(idx, mv.color);
      slotColor[idx] = mv.color;
      guestCars.place(idx, slot.x, slot.z, slot.heading);
      guestCars.flush();
    } else {
      leaving.delete(slot.id);
    }
    mv.active = false;
    mv.event = null;
    mv.group.visible = false;
    drawBoard();
  };

  const stepMover = (mv, delta) => {
    const a = mv.pts[mv.seg - 1];
    const b = mv.pts[mv.seg];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1e-6;
    const last = mv.seg === mv.pts.length - 1;
    const speed = b.reverse ? PARKING_SPEED : last ? CRUISE * 0.6 : CRUISE;
    mv.along = Math.min(len, mv.along + speed * delta);
    const t = mv.along / len;
    mv.group.position.set(a.x + dx * t, 0, a.z + dz * t);
    // hidung searah gerak (atau berlawanan bila ruas ditempuh mundur); berputar halus ke arah itu
    const sgn = b.reverse ? -1 : 1;
    const target = Math.atan2(-(dz / len) * sgn, (dx / len) * sgn);
    mv.ry += wrapAngle(target - mv.ry) * Math.min(1, delta * 9);
    mv.group.rotation.y = mv.ry;
    if (mv.along >= len - 1e-6) {
      if (last) {
        finishMover(mv);
        return;
      }
      mv.seg++;
      mv.along = 0;
    }
  };

  // ---- pembaruan per bingkai: panah, sapuan lampu slot, mobil hidup
  const color = new THREE.Color();
  let clock = 0;
  let lightAcc = 0;
  let eventIn = 1.5;
  const SWEEP_SPEED = 16;
  const sweepSpan = GUEST_LOT[3] - GUEST_LOT[1] + 30;
  const paintLights = () => {
    const waveZ = GUEST_LOT[1] - 15 + ((clock * SWEEP_SPEED) % sweepSpan);
    for (let i = 0; i < guest.length; i++) {
      const s = guest[i];
      const st = stateOf(s);
      const d = (s.z - waveZ) / 5;
      let k = 0.62 + 0.38 * Math.exp(-d * d);
      if (st === 2) k = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(clock * 9 + i)); // slot yang sedang dituju berkedip kuning
      color.set(baseColor(s)).multiplyScalar(k);
      guestLights.setColorAt(i, color);
    }
    guestLights.instanceColor.needsUpdate = true;
  };
  paintLights();

  const update = (delta = 0.016) => {
    clock += delta;
    const step = (delta * 2.6) / ARROW_TILE;
    for (const t of arrowTextures.values()) t.offset.x -= step;
    lightAcc += delta;
    if (lightAcc >= 0.05) { lightAcc = 0; paintLights(); }
    for (const mv of movers) if (mv.active) stepMover(mv, delta);
    eventIn -= delta;
    if (eventIn <= 0) {
      eventIn = 1.6 + Math.random() * 3;
      const mv = movers.find((m) => !m.active);
      if (mv) {
        const ev = pickParkingEvent(occupied, Math.random, { busy: leaving, reserved: arriving });
        if (ev) { startMover(mv, ev); drawBoard(); }
      }
    }
  };

  return {
    root,
    stats,
    update,
    /** Jumlah slot tamu yang kosong saat ini (tidak termasuk yang sedang dituju atau baru ditinggalkan). */
    freeGuestSlots: () => guest.filter((s) => !occupied.has(s.id) && !arriving.has(s.id) && !leaving.has(s.id)).length,
    dispose: () => {
      root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      guestCars.dispose();
      staffCars.dispose();
      for (const p of planes) { p.geometry?.dispose?.(); if (p.material && !Object.values(M).includes(p.material)) p.material.dispose?.(); }
      boardSign?.geo.dispose();
      boardSign?.mat.dispose();
      for (const m of moverMats) m.dispose();
      for (const t of textures) t.dispose();
      parent.remove(root);
    },
  };
}
