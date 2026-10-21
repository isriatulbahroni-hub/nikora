// Tampilan 3D lift mewah (kabin marmer, cermin, emas, kristal, poros kaca) dan lubang pelat lantai tempat poros menembus.
// Sumber geometri: pratinjau yang disetujui pemilik. Semua ukuran relatif terhadap pusat kabin (LIFT.x, LIFT.z).
//
// Model tampilan: saat tidak ada yang naik, tiap lantai punya kabin yang diam dengan pintu terbuka. Begitu seseorang naik
// (pemain lokal atau pemain lain), kabin-kabin diam disembunyikan dan satu kabin berjalan mengikuti ketinggian penumpang,
// dengan pintu lantai asal/tujuan membuka-menutup sesuai jadwal yang sama dengan server (liftProgress).
// Pergantian kabin diam <-> kabin berjalan harus tak terlihat: pose, tampilan lantai, dan putaran lampu kristal dibuat sama.
import * as THREE from 'three';
import { LEVEL_COUNT, LEVEL_HEIGHT, levelY } from './villa-layout.js';
import { LIFT, liftProgress, liftRider } from './villa-lift.js';

const W = LIFT.half * 2;
const D = W;
const H = LIFT.height;
const OPEN = LIFT.openHalf;
const SHAFT_HALF = (LIFT.shaft.maxX - LIFT.shaft.minX) / 2; // 1,3
const BACK = LIFT.shaft.minZ - LIFT.z; // -1,25
const FRONT = LIFT.shaft.maxZ - LIFT.z; // 1,28
const WALL_Z = FRONT - 0.06; // pusat dinding depan poros (tebal 0,12 m, di depan dinding kabin)
const TOP = LIFT.topY;
const DOOR_H = 2.3;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeMaterials() {
  const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
  const marbleMap = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f3efe6';
    g.fillRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 16; i++) {
      g.strokeStyle = `rgba(120,105,90,${0.07 + rnd() * 0.12})`;
      g.lineWidth = 0.6 + rnd() * 1.8;
      g.beginPath();
      let x = rnd() * w;
      g.moveTo(x, 0);
      for (let y = 32; y <= h; y += 32) {
        x += rnd() * 54 - 27;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.strokeStyle = '#b8902f';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
  });
  const mirrorMap = canvasTex(128, 256, (g, w, h) => {
    const l = g.createLinearGradient(0, 0, w, h);
    l.addColorStop(0, '#eef3f6');
    l.addColorStop(0.45, '#b9c6cc');
    l.addColorStop(0.55, '#f6fafb');
    l.addColorStop(1, '#a8b7bf');
    g.fillStyle = l;
    g.fillRect(0, 0, w, h);
  });
  const panelMap = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#2a1d10';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8c46e';
    g.font = '600 30px Georgia,serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    [3, 2, 1].forEach((n, i) => g.fillText(String(n), 32, 64 + i * 64));
  });
  return {
    marble: std(0xffffff, 0.15, 0.18, { map: marbleMap }),
    mirror: std(0xffffff, 0.85, 0.1, { map: mirrorMap }),
    panel: new THREE.MeshBasicMaterial({ map: panelMap }),
    gold: std(0xc9a24b, 0.95, 0.28),
    walnut: std(0x4b2b18, 0.1, 0.38),
    ivory: std(0xece4d3, 0, 0.65),
    steel: std(0x2a2622, 0.8, 0.4),
    cable: std(0x15110e, 0.6, 0.5),
    leaf: std(0xd9b866, 0.95, 0.3),
    inset: std(0xb78d3a, 0.9, 0.4),
    glow: std(0xffe2b0, 0, 0.5, { emissive: 0xffd08a, emissiveIntensity: 1.5 }),
    crystal: std(0xfff4dc, 0, 0.05, { emissive: 0xfff0cc, emissiveIntensity: 1.2 }),
    glass: std(0xcfeaf0, 0.2, 0.05, { transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  };
}

/** Pintu dua daun yang menyelip ke dinding saat terbuka. edge = batas luar tempat daun bersembunyi (setengah lebar dinding). */
function makeDoors(parent, m, y, z, edge) {
  const leaves = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(0, y, z);
    parent.add(g);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1, DOOR_H, 0.05), m.leaf));
    const inset = new THREE.Mesh(new THREE.BoxGeometry(0.72, DOOR_H - 0.5, 0.02), m.inset);
    inset.position.z = 0.03;
    g.add(inset);
    return { g, s };
  });
  const closedOuter = OPEN + 0.01;
  return (o) => {
    const inner = OPEN * o;
    const outer = closedOuter + (edge - closedOuter) * o;
    const w = outer - inner;
    for (const { g, s } of leaves) {
      g.scale.x = w;
      g.position.x = (s * (inner + outer)) / 2;
    }
  };
}

function makeCab(m) {
  const g = new THREE.Group();
  const box = (w, h, d, mat, x, y, z) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  box(W, 0.04, D, m.marble, 0, 0.02, 0);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 48), m.gold);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.045;
  g.add(ring);
  box(W, H, 0.05, m.mirror, 0, H / 2, -D / 2 + 0.025);
  for (const s of [-1, 1]) {
    box(0.05, H, D, m.walnut, s * (W / 2 - 0.025), H / 2, 0);
    for (const z of [-0.75, -0.25, 0.25]) box(0.02, H - 0.5, 0.04, m.gold, s * (W / 2 - 0.05), H / 2, z);
    box(0.03, 0.12, D - 0.1, m.gold, s * (W / 2 - 0.05), 0.1, 0);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, D - 0.5, 12), m.gold);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(s * (W / 2 - 0.12), 0.95, 0);
    g.add(rail);
    box(W / 2 - OPEN, H, 0.12, m.walnut, s * (OPEN + (W / 2 - OPEN) / 2), H / 2, D / 2);
    box(0.04, DOOR_H, 0.13, m.gold, s * (OPEN + 0.02), 1.19, D / 2);
  }
  const backRail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, W - 0.4, 12), m.gold);
  backRail.rotation.z = Math.PI / 2;
  backRail.position.set(0, 0.95, -D / 2 + 0.12);
  g.add(backRail);
  box(W, H - DOOR_H, 0.12, m.walnut, 0, DOOR_H + (H - DOOR_H) / 2, D / 2);
  box(W, 0.04, 0.14, m.gold, 0, DOOR_H + 0.01, D / 2);
  // langit-langit: panel cahaya, cincin emas, lampu kristal
  box(W, 0.08, D, m.ivory, 0, H, 0);
  box(1.5, 0.02, 1.5, m.glow, 0, H - 0.05, 0);
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.025, 8, 48), m.gold);
  torus.rotation.x = Math.PI / 2;
  torus.position.y = H - 0.06;
  g.add(torus);
  const chandelier = new THREE.Group();
  chandelier.position.y = H - 0.12;
  g.add(chandelier);
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 6, 32), m.gold);
  crown.rotation.x = Math.PI / 2;
  chandelier.add(crown);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), m.crystal);
    gem.position.set(Math.cos(a) * 0.3, -0.1 - (i % 2) * 0.07, Math.sin(a) * 0.3);
    chandelier.add(gem);
  }
  const center = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), m.crystal);
  center.position.y = -0.24;
  chandelier.add(center);
  // cangkang luar: atap, dasar, dan tepi emas
  box(W + 0.2, 0.12, D + 0.2, m.steel, 0, H + 0.06, 0);
  box(W + 0.24, 0.03, D + 0.24, m.gold, 0, H + 0.125, 0);
  box(W + 0.1, 0.14, D + 0.1, m.steel, 0, -0.07, 0);
  const setDoor = makeDoors(g, m, 0.04 + DOOR_H / 2, D / 2 - 0.02, W / 2);
  // panel tombol (kanan) dengan cincin yang menyala untuk lantai tujuan
  box(0.03, 0.9, 0.26, m.gold, W / 2 - 0.04, 1.2, 0.6);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.8), m.panel);
  plate.rotation.y = -Math.PI / 2;
  plate.position.set(W / 2 - 0.058, 1.2, 0.6);
  g.add(plate);
  const rings = [0, 1, 2].map((i) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9a24b, metalness: 0.9, roughness: 0.3, emissive: 0x000000 });
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.009, 8, 24), mat);
    r.rotation.y = Math.PI / 2;
    r.position.set(W / 2 - 0.062, 1.0 + i * 0.2, 0.6);
    g.add(r);
    return mat;
  });
  // penunjuk lantai di atas pintu (sisi dalam)
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: tex }));
  display.rotation.y = Math.PI;
  display.position.set(0, DOOR_H + 0.15, D / 2 - 0.07);
  g.add(display);
  let shown = '';
  return {
    group: g,
    setDoor,
    chandelier,
    setLit(level) {
      rings.forEach((mat, i) => {
        const on = i === level;
        mat.emissive.setHex(on ? 0xffa530 : 0x000000);
        mat.emissiveIntensity = on ? 1.6 : 0;
      });
    },
    setDisplay(n, arrow = '') {
      const key = `${n}|${arrow}`;
      if (key === shown) return;
      shown = key;
      ctx.fillStyle = '#120d09';
      ctx.fillRect(0, 0, 256, 96);
      ctx.fillStyle = '#ffcf6a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 66px Georgia,serif';
      ctx.fillText(String(n), 128, 50);
      ctx.font = '36px sans-serif';
      ctx.fillText(arrow, 44, 50);
      ctx.fillText(arrow, 212, 50);
      tex.needsUpdate = true;
    },
  };
}

/** Dinding depan poros di tiap lantai: sisi bukaan, ambang, bingkai emas, penunjuk lantai, dan pintu lantai. */
function makeLanding(parent, m, level) {
  const g = new THREE.Group();
  g.position.y = levelY(level);
  parent.add(g);
  const box = (w, h, d, mat, x, y, z) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const sideW = SHAFT_HALF - OPEN;
  for (const s of [-1, 1]) {
    box(sideW, LEVEL_HEIGHT, 0.12, m.ivory, s * (OPEN + sideW / 2), LEVEL_HEIGHT / 2, WALL_Z);
    box(0.04, LEVEL_HEIGHT, 0.14, m.gold, s * (SHAFT_HALF - 0.02), LEVEL_HEIGHT / 2, WALL_Z);
    box(0.05, DOOR_H, 0.14, m.gold, s * (OPEN + 0.025), DOOR_H / 2, WALL_Z);
  }
  box(OPEN * 2, LEVEL_HEIGHT - DOOR_H, 0.12, m.ivory, 0, DOOR_H + (LEVEL_HEIGHT - DOOR_H) / 2, WALL_Z);
  box(OPEN * 2 + 0.1, 0.06, 0.14, m.gold, 0, DOOR_H + 0.03, WALL_Z);
  box(0.5, 0.24, 0.03, m.steel, 0, DOOR_H + 0.55, WALL_Z + 0.075);
  const sign = canvasTex(256, 110, (c, w, h) => {
    c.fillStyle = '#120d09';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffcf6a';
    c.font = '600 52px Georgia,serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(`Lantai ${level + 1}`, 128, 58);
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.18), new THREE.MeshBasicMaterial({ map: sign }));
  plate.position.set(0, DOOR_H + 0.55, WALL_Z + 0.092);
  g.add(plate);
  const setDoor = makeDoors(g, m, DOOR_H / 2 + 0.02, WALL_Z - 0.04, SHAFT_HALF);
  return { group: g, setDoor };
}

/** Lubangi pelat lantai dan lantai penutupnya di tempat poros menembus (lantai 1 dan 2), agar kabin tidak memotong lantai. */
function carveShaftHoles(root) {
  const hole = [LIFT.shaft.minX, LIFT.shaft.minZ, LIFT.shaft.maxX, LIFT.shaft.maxZ];
  const covers = (r) => r[0] <= hole[0] + 1e-6 && r[2] >= hole[2] - 1e-6 && r[1] <= hole[1] + 1e-6 && r[3] >= hole[3] - 1e-6;
  const slabs = [];
  const floors = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.parent || o.parent === root || o.parent.position.y <= 0) return;
    const g = o.geometry;
    if (g.type === 'BoxGeometry' && g.parameters.height === 0.4 && Math.abs(o.position.y + 0.2) < 1e-6) {
      const { width, depth } = g.parameters;
      const r = [o.position.x - width / 2, o.position.z - depth / 2, o.position.x + width / 2, o.position.z + depth / 2];
      if (covers(r)) slabs.push({ o, r });
    } else if (g.type === 'PlaneGeometry' && Math.abs(o.rotation.x + Math.PI / 2) < 1e-6 && Math.abs(o.position.y - 0.03) < 1e-6) {
      const { width, height } = g.parameters;
      const r = [o.position.x - width / 2, o.position.z - height / 2, o.position.x + width / 2, o.position.z + height / 2];
      if (covers(r)) floors.push({ o, r });
    }
  });
  // sisa persegi di sekeliling lubang: barat, timur, utara, selatan
  const around = (r) => [
    [r[0], r[1], hole[0], r[3]],
    [hole[2], r[1], r[2], r[3]],
    [hole[0], r[1], hole[2], hole[1]],
    [hole[0], hole[3], hole[2], r[3]],
  ].filter(([a, b, c, d]) => c - a > 0.02 && d - b > 0.02);
  for (const { o, r } of slabs) {
    for (const [a, b, c, d] of around(r)) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(c - a, 0.4, d - b), o.material);
      piece.position.set((a + c) / 2, -0.2, (b + d) / 2);
      piece.castShadow = o.castShadow;
      piece.receiveShadow = true;
      o.parent.add(piece);
    }
    o.parent.remove(o);
    o.geometry.dispose();
  }
  for (const { o, r } of floors) {
    const uv = o.geometry.attributes.uv;
    let maxU = 0;
    let maxV = 0;
    for (let i = 0; i < uv.count; i++) {
      maxU = Math.max(maxU, uv.getX(i));
      maxV = Math.max(maxV, uv.getY(i));
    }
    const tileU = (r[2] - r[0]) / (maxU || 1);
    const tileV = (r[3] - r[1]) / (maxV || 1);
    for (const [a, b, c, d] of around(r)) {
      const geo = new THREE.PlaneGeometry(c - a, d - b);
      const pos = geo.attributes.position;
      const pu = geo.attributes.uv;
      const cx = (a + c) / 2;
      const cz = (b + d) / 2;
      for (let i = 0; i < pos.count; i++) pu.setXY(i, (cx + pos.getX(i) - r[0]) / tileU, (r[3] - (cz - pos.getY(i))) / tileV);
      const piece = new THREE.Mesh(geo, o.material);
      piece.rotation.x = -Math.PI / 2;
      piece.position.set(cx, 0.03, cz);
      piece.receiveShadow = true;
      o.parent.add(piece);
    }
    o.parent.remove(o);
    o.geometry.dispose();
  }
  return { slabs: slabs.length, floors: floors.length };
}

/**
 * Membangun lift ke dalam scene. root = grup dunia vila (hasil buildVillaWorld) untuk melubangi pelat lantai.
 * update() dipanggil tiap frame; `idle` bernilai true bila tidak ada yang sedang naik.
 */
export function buildLiftWorld(scene, world, { root = null } = {}) {
  const m = makeMaterials();
  const group = new THREE.Group();
  group.position.set(LIFT.x, 0, LIFT.z);
  scene.add(group);
  const carved = root ? carveShaftHoles(root) : { slabs: 0, floors: 0 };

  // poros: kolom baja, kaca, pita emas, balok atas, rel pemandu
  const add = (geo, mat, x, y, z) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    group.add(o);
    return o;
  };
  const colGeo = new THREE.BoxGeometry(0.16, TOP, 0.16);
  for (const x of [-SHAFT_HALF, SHAFT_HALF]) for (const z of [BACK, FRONT - 0.08]) add(colGeo, m.steel, x, TOP / 2, z);
  const railGeo = new THREE.BoxGeometry(0.05, TOP - 0.2, 0.1);
  for (const x of [-1.2, 1.2]) add(railGeo, m.steel, x, TOP / 2, 0);
  const depth = FRONT - 0.08 - BACK;
  add(new THREE.PlaneGeometry(SHAFT_HALF * 2, TOP), m.glass, 0, TOP / 2, BACK);
  for (const s of [-1, 1]) {
    const glass = add(new THREE.PlaneGeometry(depth, TOP), m.glass, s * SHAFT_HALF, TOP / 2, BACK + depth / 2);
    glass.rotation.y = Math.PI / 2;
  }
  for (let i = 1; i < LEVEL_COUNT; i++) {
    const y = levelY(i);
    add(new THREE.BoxGeometry(SHAFT_HALF * 2 + 0.06, 0.07, 0.07), m.gold, 0, y, BACK);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.07, 0.07, depth), m.gold, s * SHAFT_HALF, y, BACK + depth / 2);
  }
  add(new THREE.BoxGeometry(SHAFT_HALF * 2 + 0.1, 0.5, depth + 0.1), m.steel, 0, TOP + 0.25, BACK + depth / 2);
  add(new THREE.BoxGeometry(SHAFT_HALF * 2 + 0.14, 0.06, depth + 0.14), m.gold, 0, TOP, BACK + depth / 2);
  const cableGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
  const cables = [-0.4, 0.4].map((x) => add(cableGeo, m.cable, x, 0, 0));

  // dinding depan + pintu lantai (tiap lantai)
  const landings = Array.from({ length: LEVEL_COUNT }, (_, i) => makeLanding(group, m, i));
  // kabin diam di tiap lantai + satu kabin berjalan
  const parked = Array.from({ length: LEVEL_COUNT }, (_, i) => {
    const cab = makeCab(m);
    cab.group.position.y = levelY(i);
    cab.setDoor(1);
    cab.setDisplay(i + 1);
    cab.setLit(i);
    group.add(cab.group);
    return cab;
  });
  const traveler = makeCab(m);
  traveler.group.visible = false;
  group.add(traveler.group);

  // satu lampu untuk kabin yang relevan (jumlah lampu tetap supaya shader tidak dikompilasi ulang)
  const light = new THREE.PointLight(0xffd9a0, 0, 7, 1.6);
  scene.add(light);

  let idle = true;
  let remote = null;
  let spin = 0; // putaran lampu kristal: satu sudut untuk semua kabin, supaya pergantian kabin tidak terlihat meloncat
  let lightK = 0; // kekuatan lampu 0..1 (menyala dan padam halus)
  let lightY = null;
  return {
    group,
    carved,
    get idle() {
      return idle;
    },
    update({ delta = 0.016, me, localRide = null, players = [], selfId = null } = {}) {
      const now = performance.now();
      let ride = null;
      let riderY = null;
      if (localRide) {
        remote = null;
        ride = { from: localRide.spot.level, to: localRide.spot.to, elapsed: localRide.elapsed };
      } else {
        const r = liftRider(world, players, selfId);
        if (r) {
          if (!remote || remote.id !== r.id || remote.sit !== r.sit) remote = { id: r.id, sit: r.sit, t0: now };
          const spot = world.spots[r.sit];
          ride = { from: spot.level, to: spot.to, elapsed: now - remote.t0 };
          riderY = Number.isFinite(r.y) ? r.y : null;
        } else {
          remote = null;
        }
      }
      idle = !ride;
      const st = ride ? liftProgress(ride.from, ride.to, ride.elapsed) : null;
      spin += delta * 0.25;
      for (const p of parked) {
        p.group.visible = idle;
        p.chandelier.rotation.y = spin;
      }
      traveler.group.visible = !idle;
      traveler.chandelier.rotation.y = spin;
      if (st) {
        const y = riderY ?? st.y;
        traveler.group.position.y = y;
        traveler.setDoor(st.door);
        traveler.setLit(ride.to);
        traveler.setDisplay(Math.min(LEVEL_COUNT, Math.max(1, Math.round(y / LEVEL_HEIGHT) + 1)), st.door === 0 ? (st.direction > 0 ? '▲' : '▼') : '');
        const roof = y + H + 0.15;
        for (const c of cables) {
          const len = Math.max(0.1, TOP - roof);
          c.scale.y = len;
          c.position.y = roof + len / 2;
        }
      } else {
        const roof = levelY(0) + H + 0.15;
        for (const c of cables) {
          const len = TOP - roof;
          c.scale.y = len;
          c.position.y = roof + len / 2;
        }
      }
      landings.forEach((l, i) => {
        let open = 1;
        if (st) open = i === ride.from && st.level === ride.from ? st.door : i === ride.to && st.level === ride.to ? st.door : 0;
        l.setDoor(open);
      });
      // lampu kabin: menyala dan padam halus (tanpa loncatan saat pemain melewati jarak tertentu atau pindah lantai),
      // redup bila pemain di luar kabin, dan mengikuti ketinggian kabin persis saat naik
      const near = me && me.stair == null ? Math.max(Math.abs(me.x - LIFT.x), Math.abs(me.z - LIFT.z)) : Infinity;
      let targetK = 0;
      let targetY = null;
      if (st) {
        targetK = 1;
        targetY = (riderY ?? st.y) + 1.9;
      } else if (Number.isFinite(near)) {
        targetK = near <= LIFT.half ? 1 : Math.min(1, Math.max(0, (24 - near) / 10)) * 0.6;
        targetY = levelY(me.level ?? 0) + 1.9;
      }
      const dt = Math.min(delta, 0.1);
      lightK += (targetK - lightK) * (1 - Math.exp(-5 * dt));
      if (targetY !== null) lightY = st || lightY === null ? targetY : lightY + (targetY - lightY) * (1 - Math.exp(-8 * dt));
      light.position.set(LIFT.x, lightY ?? levelY(0) + 1.9, LIFT.z);
      light.intensity = lightK < 0.01 ? 0 : 7 * lightK;
    },
  };
}
