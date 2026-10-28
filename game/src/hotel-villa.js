import * as THREE from 'three';
import { BOUNDS, GATE_HALF_WIDTH, getVillaWorld, roomAt } from './villa-layout.js';
import { buildVillaWorld } from './villa-world.js';
import { buildCameraOccluders } from './villa-camera.js';
import { doorAssist, extraCameraOccluders, inflateBoxes } from './villa-motion.js';

// NIKORA Wedding Villa DI DALAM dunia hotel, di ujung Perjalanan 20 menit (hotel-journey.js): satu halaman, satu dunia.
// Villa dibangun apa adanya (denah villa-layout.js) di dalam grup `root` yang digeser dan diputar mengikuti ujung jalan perjalanan
// (`anchor`). Semua fisika berjalan di BINGKAI VILLA (koordinat lokal): posisi dunia diputar balik ke bingkai villa, dinding dan pintu
// villa dipakai apa adanya, lalu hasilnya diputar ke dunia lagi. Jadi villa boleh menghadap arah mana pun tanpa menyentuh denahnya.
// Lantai villa dinaikkan sedikit (VILLA_APPROACH.pad) di atas bukit-bukit kecil perjalanan; halaman depan berupa tanjakan landai
// dari ujung jalan ke pagar. Yang BELUM ikut (masih di halaman villa lengkap, tombol "Buka Villa lengkap"): lift, ruang game, TV kamar,
// kunci kamar, duduk/tidur, layar tancap, bulu tangkis, panel pesta, dan suara dekat.
export const VILLA_APPROACH = Object.freeze({
  gap: 26, // jarak ujung jalan perjalanan ke pagar selatan villa (m)
  pad: 2.4, // lantai villa lebih tinggi dari ujung jalan (m): di atas bukit-bukit kecil medan
  plazaHalf: 9, // setengah lebar halaman depan (m)
  plazaDepth: 32, // panjang halaman depan dari pagar ke arah jalan (m)
});
const ZONE_MARGIN = 4; // sabuk di luar pagar yang masih memakai fisika villa
const UPDATE_DISTANCE = 170; // pintu geser, air mancur, dan air kolam hanya dianimasikan bila pemain dekat
const CAM_PAD = 0.3;
const PAD_MARGIN = 6; // lantai villa meluas sekian meter di luar pagar (kecuali sisi depan)
const GATE_OPEN = GATE_HALF_WIDTH - 0.7; // lebar bukaan gerbang yang boleh dilewati pejalan kaki
const FENCE_Z = BOUNDS.maxZ; // pagar selatan villa (sisi jalan)
const CENTER = Object.freeze({ x: 0, z: (BOUNDS.minZ + BOUNDS.maxZ) / 2 });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Buang bagian dunia villa yang hanya cocok untuk halaman villa sendiri; tanah villa (berlubang kolam) dipertahankan dan dipotong. */
function stripStandaloneParts(root) {
  let ground = null;
  for (const o of [...root.children]) {
    const g = o.geometry;
    const m = o.material;
    if (o.isMesh && !o.isInstancedMesh && g?.type === 'ShapeGeometry') {
      ground = o; // tanah luas bergaris kolam
      continue;
    }
    const drop =
      o.isLight ||
      (o.isMesh && !o.isInstancedMesh && g?.type === 'PlaneGeometry' && Math.abs((g.parameters?.width ?? 0) - 6.4) < 1e-6) || // jalan tanah dari gerbang
      (o.isInstancedMesh && g?.type === 'PlaneGeometry' && m?.isMeshBasicMaterial && m.transparent) || // bercak rumput gelap/terang
      (o.isInstancedMesh && g?.type === 'SphereGeometry' && g.parameters?.widthSegments === 14 && g.parameters?.heightSegments === 8) || // bukit latar
      (o.isInstancedMesh && g?.type === 'IcosahedronGeometry' && m?.roughness === 0.9 && !m.map && o.count > 0 && o.instanceMatrix.array[14] > BOUNDS.maxZ + 4); // semak jalan desa
    if (drop) root.remove(o);
  }
  return ground;
}

/** Lereng hijau di sekeliling lantai villa: menyambung lantai yang dinaikkan ke medan perjalanan. */
function skirtMesh(x0, x1, z0, z1, run, depth, color) {
  const top = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const bot = [[x0 - run, z0 - run], [x1 + run, z0 - run], [x1 + run, z1 + run], [x0 - run, z1 + run]];
  const pos = [];
  const idx = [];
  for (const [x, z] of top) pos.push(x, -0.02, z);
  for (const [x, z] of bot) pos.push(x, -depth, z);
  for (let i = 0; i < 4; i++) {
    const k = (i + 1) % 4;
    idx.push(i, k, 4 + k, i, 4 + k, 4 + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}

/** Tanjakan paving dari ujung jalan (y = -pad) ke pagar villa (y = 0), berisi padat ke bawah supaya tidak melayang. */
function rampMesh(zFence, gap, pad, half, color) {
  const zr = zFence + gap;
  const yb = -pad - 4;
  const v = [
    [-half, 0.02, zFence], [half, 0.02, zFence], [half, -pad + 0.02, zr], [-half, -pad + 0.02, zr],
    [-half, yb, zFence], [half, yb, zFence], [half, yb, zr], [-half, yb, zr],
  ];
  const pos = v.flat();
  const idx = [0, 1, 2, 0, 2, 3, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2, 3, 2, 6, 3, 6, 7];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}

export function createHotelVilla({ scene }) {
  const world = getVillaWorld();
  const root = new THREE.Group(); // bingkai villa: digeser dan diputar ke ujung jalan perjalanan
  root.visible = false;
  scene.add(root);
  let frame = null; // { ox, oz, psi, y0 }: villa lokal (x, z) -> dunia = (ox, oz) + putar psi; y dunia = y0 + y lokal
  let built = null;
  let failed = false;
  let decor = [];
  let occluders = [];
  try {
    occluders = inflateBoxes([...buildCameraOccluders(world), ...extraCameraOccluders(world)], CAM_PAD);
  } catch (error) {
    console.warn('[hotel] penghalang kamera villa dilewati', error);
  }

  const sc = () => ({ c: Math.cos(frame.psi), s: Math.sin(frame.psi) });
  const toLocal = (x, z) => {
    const { c, s } = sc();
    const dx = x - frame.ox;
    const dz = z - frame.oz;
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  };
  const toWorld = (lx, lz) => {
    const { c, s } = sc();
    return { x: frame.ox + lx * c + lz * s, z: frame.oz - lx * s + lz * c };
  };
  const rotInv = (dx, dz) => {
    const { c, s } = sc();
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  };
  const rotFwd = (dx, dz) => {
    const { c, s } = sc();
    return { x: dx * c + dz * s, z: -dx * s + dz * c };
  };
  const inCompound = (x, z, m) => x > BOUNDS.minX - m && x < BOUNDS.maxX + m && z > BOUNDS.minZ - m && z < BOUNDS.maxZ + m;
  const inPlaza = (x, z) => Math.abs(x) < VILLA_APPROACH.plazaHalf && z >= FENCE_Z - 2 && z < FENCE_Z + VILLA_APPROACH.plazaDepth;
  const inZone = (x, z) => inCompound(x, z, ZONE_MARGIN) || inPlaza(x, z);
  const rampY = (lz) => frame.y0 - VILLA_APPROACH.pad * (1 - clamp(1 - (lz - FENCE_Z) / VILLA_APPROACH.gap, 0, 1));

  function clearDecor() {
    for (const o of decor) {
      root.remove(o);
      o.geometry?.dispose();
      o.material?.dispose();
    }
    decor = [];
  }

  function load() {
    if (!frame || built || failed) return;
    try {
      const staging = new THREE.Scene(); // langit, kabut, dan cahaya mandiri villa ditampung di sini lalu dibuang; hotel punya langit sendiri
      const noTrees = { ...world, props: world.props.filter((p) => p.type !== 'tree') };
      const b = buildVillaWorld(staging, noTrees, {});
      const ground = stripStandaloneParts(b.root);
      root.add(b.root);
      root.updateMatrixWorld(true);
      if (ground?.material) {
        // tanah villa hanya berlaku di dalam lantai yang dinaikkan (kotak di bingkai villa), supaya tidak menutupi jalan perjalanan
        const planes = [
          new THREE.Plane(new THREE.Vector3(1, 0, 0), -(BOUNDS.minX - PAD_MARGIN)),
          new THREE.Plane(new THREE.Vector3(-1, 0, 0), BOUNDS.maxX + PAD_MARGIN),
          new THREE.Plane(new THREE.Vector3(0, 0, 1), -(BOUNDS.minZ - PAD_MARGIN)),
          new THREE.Plane(new THREE.Vector3(0, 0, -1), FENCE_Z + 0.2),
        ].map((p) => p.applyMatrix4(root.matrixWorld));
        for (const m of [].concat(ground.material)) {
          m.clippingPlanes = planes;
          m.needsUpdate = true;
        }
      }
      built = b;
    } catch (error) {
      failed = true;
      console.warn('[hotel] villa tidak dapat dimuat ke dunia hotel', error);
    }
  }

  return {
    zone: BOUNDS,
    carColliders: [],
    occluders,
    get loaded() { return !!built; },
    get anchored() { return !!frame; },
    /** Pasang villa di ujung jalan perjalanan: f = { ox, oz, psi, y0 } (bingkai villa -> dunia). Lantai dan tanjakan digambar langsung; villa dimuat lewat load(). */
    anchor(f) {
      this.release();
      frame = f;
      root.position.set(f.ox, f.y0, f.oz);
      root.rotation.y = f.psi;
      root.visible = true;
      root.updateMatrixWorld(true);
      const x0 = BOUNDS.minX - PAD_MARGIN;
      const x1 = BOUNDS.maxX + PAD_MARGIN;
      const z0 = BOUNDS.minZ - PAD_MARGIN;
      decor = [
        skirtMesh(x0, x1, z0, FENCE_Z + 0.2, 14, 7, 0x5a8a45),
        rampMesh(FENCE_Z, VILLA_APPROACH.gap, VILLA_APPROACH.pad, VILLA_APPROACH.plazaHalf + 1.5, 0xcdb892),
      ];
      for (const o of decor) root.add(o);
    },
    load,
    /** Bongkar villa dan lantainya (kembali ke hotel). */
    release() {
      clearDecor();
      if (built) {
        root.remove(built.root);
        built.root.traverse((o) => {
          o.geometry?.dispose?.();
          if (o.isInstancedMesh) o.dispose();
        });
      }
      built = null;
      failed = false;
      frame = null;
      root.visible = false;
    },
    /** Apakah posisi pemain memakai fisika villa (di dalam zona villa atau halaman depannya, atau di tangga/lantai atas)? Hanya lantai dasar hotel. */
    active: (p) => !!frame && (p.level ?? 0) === 0 && (p.villa != null || inZone(toLocal(p.x, p.z).x, toLocal(p.x, p.z).z)),
    near(p) {
      if (!frame || (p.level ?? 0) !== 0) return false;
      const l = toLocal(p.x, p.z);
      return inCompound(l.x, l.z, 20) || (Math.abs(l.x) < 40 && l.z >= FENCE_Z - 2 && l.z < FENCE_Z + VILLA_APPROACH.plazaDepth + 20);
    },
    /** Titik dunia -> bingkai villa (y dikurangi tinggi lantai villa). */
    toLocalPoint(p) {
      const l = toLocal(p.x, p.z);
      return { x: l.x, y: p.y - frame.y0, z: l.z };
    },
    /** Arah hadap dunia -> arah hadap di bingkai villa. */
    localYaw: (yaw) => yaw - frame.psi,
    /** Jalan kaki. Mengubah p.x, p.z, p.y, dan p.villa ({level, stair} atau null di lantai dasar). */
    walk(p, dx, dz) {
      if (!frame) return null;
      const l = toLocal(p.x, p.z);
      const d = rotInv(dx, dz);
      const lev = p.villa?.level ?? 0;
      const outside = lev === 0 && !p.villa && (l.z > FENCE_Z + 0.6 || (Math.abs(l.x) < GATE_OPEN && l.z > FENCE_Z - 2));
      if (outside) {
        let nx = l.x + d.x;
        let nz = l.z + d.z;
        if (nz < FENCE_Z - 2) {
          // masuk lebih dalam lewat gerbang: fisika villa mengambil alih
        } else {
          if (nz < FENCE_Z + 0.6) nx = clamp(nx, -GATE_OPEN, GATE_OPEN); // di sela pagar hanya lewat bukaan gerbang
          nx = clamp(nx, -VILLA_APPROACH.plazaHalf + 0.5, VILLA_APPROACH.plazaHalf - 0.5);
          nz = Math.min(nz, FENCE_Z + VILLA_APPROACH.plazaDepth - 0.5);
          const w = toWorld(nx, nz);
          p.x = w.x;
          p.z = w.z;
          p.y = rampY(nz);
          p.villa = null;
          return { x: nx, z: nz };
        }
      }
      const next = world.move({ x: l.x, z: l.z, level: lev, stair: p.villa?.stair ?? null, y: p.y - frame.y0 }, d.x, d.z);
      const w = toWorld(next.x, next.z);
      p.x = w.x;
      p.z = w.z;
      p.y = frame.y0 + next.y;
      p.villa = next.level === 0 && next.stair === null ? null : { level: next.level, stair: next.stair };
      return next;
    },
    /** Titik turun mobil digeser bila mengenai penghalang (p dalam koordinat dunia). */
    constrain(p) {
      const l = toLocal(p.x, p.z);
      if (l.z > FENCE_Z + 0.6) {
        const w = toWorld(clamp(l.x, -VILLA_APPROACH.plazaHalf + 0.5, VILLA_APPROACH.plazaHalf - 0.5), Math.min(l.z, FENCE_Z + VILLA_APPROACH.plazaDepth - 0.5));
        return { x: w.x, z: w.z };
      }
      const c = world.constrain({ x: l.x, z: l.z });
      const w = toWorld(c.x, c.z);
      return { x: w.x, z: w.z };
    },
    /** Bantuan pintu: memutar posisi dan gerak ke bingkai villa lalu mengembalikannya ke dunia. */
    assist(p, move) {
      const l = toLocal(p.x, p.z);
      const lev = p.villa?.level ?? 0;
      const out = doorAssist({ x: l.x, z: l.z, level: lev }, rotInv(move.x, move.z), world.levels[lev]?.doors ?? []);
      return rotFwd(out.x, out.z);
    },
    /** Keterangan lokasi di dalam kompleks villa, atau null di luarnya. */
    place(p) {
      if (!this.active(p)) return null;
      const level = p.villa?.level ?? 0;
      if (p.villa?.stair) return { id: `villa-stair@${level}`, name: 'Villa · Tangga', indoor: false };
      const l = toLocal(p.x, p.z);
      if (l.z > FENCE_Z + 0.6) return { id: 'villa-halaman-depan', name: 'Villa · Halaman Depan', indoor: false };
      const r = roomAt(l.x, l.z, level);
      if (r.kind === 'outside') return null;
      return { id: `villa-${r.id}@${level}`, name: level > 0 ? `Villa · Lantai ${level + 1} · ${r.name}` : `Villa · ${r.name}`, indoor: r.indoor };
    },
    /** Dipanggil tiap bingkai: menganimasikan villa (pintu, air) saat pemain dekat. */
    update({ me, delta, cameraPosition, others = [] }) {
      if (!built || !frame) return;
      const l = toLocal(me.x, me.z);
      if (Math.hypot(l.x - CENTER.x, l.z - CENTER.z) >= UPDATE_DISTANCE) return;
      const actors = [{ x: l.x, z: l.z, y: me.y - frame.y0 }];
      for (const o of others) {
        const q = toLocal(o.x, o.z);
        actors.push({ x: q.x, z: q.z, y: (o.y ?? 0) - frame.y0 });
      }
      built.update(l.x, l.z, delta, actors, root.worldToLocal(cameraPosition.clone()));
    },
    state: () => ({ anchored: !!frame, loaded: !!built, failed, frame }),
  };
}
