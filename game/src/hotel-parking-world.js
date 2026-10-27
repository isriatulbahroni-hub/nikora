// Gambar 3D parkir NIKORA Grand Hotel (THREE). Data dan tata letak ada di hotel-parking.js.
// Semuanya InstancedMesh murah: aspal, garis slot, lampu slot (hijau/merah/biru/emas), jalur tanaman + pohon + lampu taman, papan zona,
// ~200 mobil tamu yang sedang parkir, parkir motor berkanopi, pengisi daya blok D, dan paviliun kaca "Royal Garage" dengan panggung putar.
// Bugatti pemilik TIDAK digambar di sini: ia mobil armada (vehicle-fleet.js, BUGATTI_SPOT) yang diparkir di panggung OWNER-00.
import * as THREE from 'three';
import {
  GUEST_ENTRY_LANE, GUEST_FLANK, GUEST_LINK, GUEST_LINK_W, GUEST_NW, OWNER_GARAGE, OWNER_LANE, OWNER_TURNTABLE, STAFF_BIKES, STAFF_BIKES_CANOPY,
  bikeSlots, guestOccupied, guestSlots, guestStats, occupancy, ownerSlots, parkedGuestCars, slotLightColor,
} from './hotel-parking.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const GOLD = 0xc9a24b;
const CREAM = 0xf1e9d6;
const BLUE = 0x3b82f6;
const EV_CYAN = 0x39d0ff;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
const rectBox = (r, y, h, extra = {}) => ({ x: (r[0] + r[2]) / 2, y, z: (r[1] + r[3]) / 2, sx: r[2] - r[0], sy: h, sz: r[3] - r[1], ...extra });
const grow = (r, d) => [r[0] - d, r[1] - d, r[2] + d, r[3] + d];

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

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
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

/** Bangun seluruh parkir ke dalam `parent` (grup akar hotel). Mengembalikan {root, stats, dispose}. */
export function buildHotelParking(parent) {
  const root = new THREE.Group();
  root.name = 'nikora-parking';
  parent.add(root);
  const planes = [];
  const textures = [];
  const M = {
    asphalt: std(0x1b1d21, { roughness: 0.92 }), marble: std(0x0b0b0e, { roughness: 0.16, metalness: 0.35 }),
    line: std(0xf2f0e4, { roughness: 0.7 }), goldLine: std(GOLD, { roughness: 0.45, metalness: 0.6 }), curb: std(0x8d8f94, { roughness: 0.85 }),
    hedge: std(0x2a5c36), trunk: std(0x6b4a2f), leaf: std(0x2f6f3a),
    gold: std(GOLD, { roughness: 0.35, metalness: 0.75 }), cream: std(CREAM, { roughness: 0.9 }), roof: std(0x1b1b1f, { roughness: 0.5, metalness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd0e6, roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.3, depthWrite: false }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff0c8 }), tint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    body: std(0xffffff, { roughness: 0.3, metalness: 0.15 }), cabin: std(0x10161d, { roughness: 0.15, metalness: 0.3 }), wheel: std(0x0a0a0c, { roughness: 0.9 }), dark: std(0x2a2d33, { roughness: 0.6, metalness: 0.4 }),
  };
  const guest = guestSlots();
  const bikes = bikeSlots();
  const owner = ownerSlots();
  const guestOcc = guestOccupied(); // sama dengan yang dipakai valet (hotel-main.js): slot hijau di layar = slot pilihan valet
  const bikeOcc = occupancy(bikes, 0.55, 11);

  // ---- aspal + lantai marmer Royal Garage
  instancedBoxes(root, [GUEST_NW, GUEST_LINK, GUEST_LINK_W, GUEST_FLANK, GUEST_ENTRY_LANE, STAFF_BIKES, OWNER_LANE].map((r) => rectBox(r, 0.03, 0.06)), M.asphalt, { receive: true });
  const G = OWNER_GARAGE;
  const inlay = [[G[0] + 0.6, G[1] + 0.6, G[2] - 0.6, G[1] + 0.85], [G[0] + 0.6, G[3] - 0.85, G[2] - 0.6, G[3] - 0.6], [G[0] + 0.6, G[1] + 0.6, G[0] + 0.85, G[3] - 0.6], [G[2] - 0.85, G[1] + 0.6, G[2] - 0.6, G[3] - 0.6]];
  instancedBoxes(root, [rectBox(G, 0.06, 0.12)], M.marble, { receive: true });
  instancedBoxes(root, inlay.map((r) => rectBox(r, 0.13, 0.02)), M.goldLine);

  // ---- garis slot (putih untuk tamu dan karyawan, emas untuk pemilik) dan lampu kepala slot
  instancedBoxes(root, [...dividers(guest, 0.12, 0.07), ...dividers(bikes, 0.07, 0.07)], M.line);
  const bays = owner.filter((s) => !s.turntable);
  instancedBoxes(root, bays.flatMap((s) => [-1, 1].map((k) => ({ x: s.x + k * s.w / 2, y: 0.14, z: s.z, sx: 0.1, sy: 0.02, sz: s.d }))), M.goldLine);
  const lights = [];
  const addLight = (s, occ) => {
    const color = slotLightColor(s, occ);
    if (s.turntable) return;
    if (s.axis === 'z') { lights.push({ x: s.x, y: 0.15, z: s.z + s.d / 2 - 0.2, sx: 1.4, sy: 0.03, sz: 0.22, color }); return; }
    const dir = Math.sign(Math.cos(s.heading));
    lights.push({ x: s.x - dir * (s.d / 2 - 0.2), y: 0.075, z: s.z, sx: 0.22, sy: 0.03, sz: s.zone === 'guest' ? 1.4 : 0.4, color });
  };
  guest.forEach((s) => addLight(s, guestOcc.has(s.id)));
  bikes.forEach((s) => addLight(s, bikeOcc.has(s.id)));
  owner.forEach((s) => addLight(s, false));
  instancedBoxes(root, lights, M.tint);

  // ---- jalur tanaman di belakang tiap modul: batas granit, pagar tanaman, pohon, lampu taman emas
  const rows = new Map();
  for (const s of guest) {
    const key = `${s.block}|${s.x.toFixed(2)}`;
    const r = rows.get(key) ?? { s, zmin: Infinity, zmax: -Infinity };
    r.zmin = Math.min(r.zmin, s.z - s.w / 2);
    r.zmax = Math.max(r.zmax, s.z + s.w / 2);
    rows.set(key, r);
  }
  const curbs = [];
  const hedges = [];
  const trunks = [];
  const crowns = [];
  const poles = [];
  const heads = [];
  const tones = [0x2f6f3a, 0x3c8044, 0x27603a];
  for (const r of rows.values()) {
    if (r.s.heading !== Math.PI) continue; // satu jalur per modul, di belakang baris kanan
    const x0 = r.s.x + r.s.d / 2;
    const cx = x0 + 0.7;
    curbs.push(rectBox([x0, r.zmin, x0 + 1.4, r.zmax], 0.09, 0.18));
    hedges.push({ x: cx, y: 0.58, z: (r.zmin + r.zmax) / 2, sx: 0.9, sy: 0.8, sz: r.zmax - r.zmin - 0.4 });
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
  instancedBoxes(root, curbs, M.curb, { receive: true });
  instancedBoxes(root, hedges, M.hedge);
  instancedBoxes(root, trunks, M.trunk, { cast: true });
  instancedBoxes(root, crowns, M.leaf, { cast: true });

  // ---- mobil tamu yang sedang parkir (~40% slot terisi): badan, kabin, empat roda
  const bodies = [];
  const cabins = [];
  const wheels = [];
  for (const c of parkedGuestCars(guestOcc)) {
    const dir = Math.cos(c.heading) > 0 ? 1 : -1;
    bodies.push({ x: c.x, y: 0.62, z: c.z, sx: 4.7, sy: 0.7, sz: 1.95, color: c.color });
    cabins.push({ x: c.x - dir * 0.35, y: 1.25, z: c.z, sx: 2.5, sy: 0.55, sz: 1.75 });
    for (const ax of [-1.4, 1.4]) for (const az of [-0.95, 0.95]) wheels.push({ x: c.x + ax, y: 0.3, z: c.z + az, sx: 0.75, sy: 0.6, sz: 0.28 });
  }
  instancedBoxes(root, bodies, M.body);
  instancedBoxes(root, cabins, M.cabin);
  instancedBoxes(root, wheels, M.wheel);

  // ---- pengisi daya mobil listrik di blok D: satu tiang tiap dua slot
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

  // ---- parkir motor karyawan: kanopi krem berbingkai emas, tiang emas, lampu lorong, motor yang sedang parkir
  const C = STAFF_BIKES_CANOPY;
  instancedBoxes(root, [rectBox(C, 3.4, 0.25)], M.cream, { cast: true });
  instancedBoxes(root, [rectBox(grow(C, 0.15), 3.55, 0.05)], M.gold);
  const bikePillars = [];
  for (const x of [C[0] + 0.3, C[2] - 0.3]) for (let k = 0; k < 5; k++) bikePillars.push({ x, y: 1.7, z: C[1] + 0.3 + k * ((C[3] - C[1] - 0.6) / 4), sx: 0.3, sy: 3.4, sz: 0.3 });
  instancedBoxes(root, bikePillars, M.gold, { cast: true });
  instancedBoxes(root, [113.5, 121.5].map((x) => ({ x, y: 3.25, z: (C[1] + C[3]) / 2, sx: 0.3, sy: 0.05, sz: C[3] - C[1] - 4 })), M.light);
  const bikeColors = [0x222428, 0x3a3d44, 0xb3262c, 0x1f4fa8, 0xe7e7e7];
  instancedBoxes(root, bikes.filter((s) => bikeOcc.has(s.id)).map((s, i) => ({ x: s.x, y: 0.5, z: s.z, sx: 1.7, sy: 0.7, sz: 0.45, color: bikeColors[(i * 7) % bikeColors.length] })), M.body);

  // ---- Royal Garage: atap gelap berbingkai emas, tiang emas, dinding kaca, lampu langit-langit, panggung putar, gerbang pemilik
  instancedBoxes(root, [rectBox(G, 5.4, 0.35)], M.roof, { cast: true });
  instancedBoxes(root, [rectBox(grow(G, 0.2), 5.2, 0.12)], M.gold);
  const garagePillars = [[G[0] + 0.5, G[1] + 0.5], [108, G[1] + 0.5], [128, G[1] + 0.5], [G[2] - 0.5, G[1] + 0.5], [G[0] + 0.5, G[3] - 0.5], [G[2] - 0.5, G[3] - 0.5]];
  instancedBoxes(root, garagePillars.map(([x, z]) => ({ x, y: 2.6, z, sx: 0.6, sy: 5.2, sz: 0.6 })), M.gold, { cast: true });
  const mx = (G[0] + G[2]) / 2;
  const mz = (G[1] + G[3]) / 2;
  instancedBoxes(root, [
    { x: G[0] + 0.1, y: 2.6, z: mz, sx: 0.12, sy: 5, sz: G[3] - G[1] - 1 }, { x: G[2] - 0.1, y: 2.6, z: mz, sx: 0.12, sy: 5, sz: G[3] - G[1] - 1 },
    { x: mx, y: 2.6, z: G[3] - 0.1, sx: G[2] - G[0] - 1, sy: 5, sz: 0.12 },
    { x: 102, y: 2.6, z: G[1] + 0.1, sx: 11, sy: 5, sz: 0.12 }, { x: 134, y: 2.6, z: G[1] + 0.1, sx: 11, sy: 5, sz: 0.12 },
  ], M.glass);
  instancedBoxes(root, [104, 111, 118, 125, 132].map((x) => ({ x, y: 5.2, z: mz, sx: 0.5, sy: 0.05, sz: 34 })), M.light);
  const turntable = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(OWNER_TURNTABLE.r, OWNER_TURNTABLE.r, 0.2, 48), M.gold);
  rim.position.y = 0.22;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(OWNER_TURNTABLE.r - 0.35, OWNER_TURNTABLE.r - 0.35, 0.04, 48), M.marble);
  deck.position.y = 0.33;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.06, 40), M.light);
  turntable.add(rim, deck);
  turntable.position.set(OWNER_TURNTABLE.x, 0, OWNER_TURNTABLE.z);
  pad.position.set(OWNER_TURNTABLE.x, 5.18, OWNER_TURNTABLE.z);
  root.add(turntable, pad);
  planes.push(rim, deck, pad);
  instancedBoxes(root, [
    { x: 147.5, y: 1.7, z: OWNER_LANE[1] + 0.5, sx: 0.6, sy: 3.4, sz: 0.6 }, { x: 147.5, y: 1.7, z: OWNER_LANE[3] - 0.5, sx: 0.6, sy: 3.4, sz: 0.6 },
    { x: 147.5, y: 3.5, z: (OWNER_LANE[1] + OWNER_LANE[3]) / 2, sx: 0.6, sy: 0.4, sz: OWNER_LANE[3] - OWNER_LANE[1] },
  ], M.gold, { cast: true });

  // ---- gerbang tamu (lengkung emas di lajur masuk) dan papan zona
  const archZ = GUEST_ENTRY_LANE[1] + 3;
  const archX = (GUEST_ENTRY_LANE[0] + GUEST_ENTRY_LANE[2]) / 2;
  instancedBoxes(root, [
    { x: GUEST_ENTRY_LANE[0] + 0.6, y: 2.8, z: archZ, sx: 0.7, sy: 5.6, sz: 0.7 }, { x: GUEST_ENTRY_LANE[2] - 0.6, y: 2.8, z: archZ, sx: 0.7, sy: 5.6, sz: 0.7 },
    { x: archX, y: 5.8, z: archZ, sx: GUEST_ENTRY_LANE[2] - GUEST_ENTRY_LANE[0], sy: 0.5, sz: 0.6 },
  ], M.gold, { cast: true });
  const signPoles = [];
  const stats = guestStats(guestOcc);
  const addSign = (x, z, ry, title, sub, accent, { width = 8, y = 4.1, pole = true, off = 0.03 } = {}) => {
    if (pole) signPoles.push({ x, y: (y - 0.6) / 2, z, sx: 0.25, sy: y - 0.6, sz: 0.25 });
    if (typeof document === 'undefined') return; // uji di Node: tanpa kanvas
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
  addSign(archX, archZ, Math.PI, 'PARKIR TAMU', `${stats.total} slot · valet`, GOLD, { width: 9, y: 5.8, pole: false, off: 0.33 });
  addSign(-106.7, 446.6, 0, 'BLOK A', `${stats.blocks.A.total} slot`, GOLD, { width: 6 });
  addSign(-49.7, 446.6, 0, 'BLOK B', `${stats.blocks.B.total} slot`, GOLD, { width: 6 });
  addSign(-106.7, 460.4, Math.PI, 'BLOK C', `${stats.blocks.C.total} slot`, GOLD, { width: 6 });
  addSign(-87.7, 460.4, Math.PI, 'BLOK D · EV', `${stats.blocks.D.total} slot · pengisian daya`, EV_CYAN, { width: 6 });
  addSign(74, 382.5, Math.PI, 'PARKIR KARYAWAN', 'Khusus staf hotel', BLUE, { width: 8 });
  addSign(117.5, 384.5, Math.PI, 'PARKIR MOTOR', 'Karyawan · berkanopi', BLUE, { width: 7 });
  addSign(mx, G[1] - 0.1, Math.PI, 'ROYAL GARAGE', 'Private · Pemilik', 0xe7c76a, { width: 12, y: 5.4, pole: false, off: 0.03 });
  instancedBoxes(root, signPoles, M.gold, { cast: true });
  instancedBoxes(root, poles, M.gold, { cast: true });
  instancedBoxes(root, heads, M.light);

  return {
    root,
    stats,
    dispose: () => {
      root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      for (const p of planes) { p.geometry?.dispose(); if (p.material !== M.gold && p.material !== M.marble && p.material !== M.light) p.material?.dispose(); }
      for (const t of textures) t.dispose();
      parent.remove(root);
    },
  };
}
