import * as THREE from 'three';
import { BOUNDS, getMasjidWorld } from './masjid-layout.js';
import { buildMasjidWorld } from './masjid-world.js';
import { inflateBoxes } from './villa-motion.js';

// Masjid Agung NIKORA DI DALAM dunia hotel, di ujung Perjalanan 20 menit (hotel-journey.js): satu halaman, satu dunia, sama seperti villa
// (hotel-villa.js). Masjid dibangun apa adanya (denah masjid-layout.js, renderer masjid-world.js) di dalam grup `root` yang digeser dan
// diputar mengikuti ujung jalan perjalanan (`anchor`). Fisika berjalan di BINGKAI MASJID (koordinat lokal): posisi dunia diputar balik ke
// bingkai masjid, dinding dan pintu masjid dipakai apa adanya, lalu hasilnya diputar ke dunia lagi.
// Antarmukanya sama dengan hotel-villa.js, jadi hotel-main.js memakainya lewat penghubung (hotel-venues.js).
//
// Yang ikut: seluruh kompleks (aula shalat, serambi, sahn, museum, perpustakaan, wudhu, akad, walimah, taman) dan berjalan kaki di dalamnya.
// Yang BELUM ikut (masih di halaman masjid lengkap /masjid.html): etalase museum yang bisa diketuk, duduk bersila dan shalat, tombol Lari,
// karyawan masjid, suara pancuran dan pantulan bulan di kolam taman, serta mobil di dalam kompleks.
export const MASJID_APPROACH = Object.freeze({
  gap: 26, // jarak ujung jalan perjalanan ke pagar selatan (Gerbang Utama) (m); sama dengan titik SPAWN masjid (z = 262)
  pad: 2.4, // lantai masjid lebih tinggi dari ujung jalan (m): di atas bukit-bukit kecil medan
  plazaHalf: 18, // setengah lebar halaman depan (Gerbang Utama selebar 40 m)
  plazaDepth: 32, // panjang halaman depan dari pagar ke arah jalan
});
const GATE_HALF_WIDTH = 20; // bukaan Gerbang Utama: D(0, 240, 'h', 40, 8) di masjid-layout.js
const GATE_OPEN = GATE_HALF_WIDTH - 0.7; // lebar bukaan yang boleh dilewati pejalan kaki
const FENCE_Z = BOUNDS.maxZ; // pagar selatan (sisi jalan)
const ZONE_MARGIN = 4; // sabuk di luar pagar yang masih memakai fisika masjid
const PAD_MARGIN = 6; // lantai masjid meluas sekian meter di luar pagar (kecuali sisi depan)
const CAM_PAD = 0.3;
const OCCLUDER_RADIUS = 70; // penghalang kamera diambil dari sekitar pemain saja (kompleks 600 x 500 m)
const UPDATE_DISTANCE = 450; // taman dianimasikan hanya bila pemain sedekat ini dari pusat kompleks
const CENTER = Object.freeze({ x: (BOUNDS.minX + BOUNDS.maxX) / 2, z: (BOUNDS.minZ + BOUNDS.maxZ) / 2 });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      m.map?.dispose?.();
      m.dispose?.();
    }
    if (o.isInstancedMesh) o.dispose?.();
  });
}

/**
 * Sesuaikan bagian dunia masjid yang hanya cocok untuk halaman masjid sendiri: jalan tanah dari gerbang dibuang (jalan perjalanan yang dipakai),
 * dan tanah 3200 x 3200 m diperkecil menjadi lantai yang dinaikkan (kotak di bingkai masjid) supaya tidak menutupi jalan perjalanan.
 */
function fitStandaloneParts(root) {
  const x0 = BOUNDS.minX - PAD_MARGIN;
  const x1 = BOUNDS.maxX + PAD_MARGIN;
  const z0 = BOUNDS.minZ - PAD_MARGIN;
  const z1 = FENCE_Z + 0.2;
  for (const o of [...root.children]) {
    const g = o.geometry;
    if (!o.isMesh || o.isInstancedMesh || g?.type !== 'PlaneGeometry') continue;
    const { width, height } = g.parameters ?? {};
    if (width === 3200 && height === 3200) {
      o.scale.set((x1 - x0) / 3200, (z1 - z0) / 3200, 1); // bidang rebah: sumbu y lokal = sumbu z dunia
      o.position.set((x0 + x1) / 2, o.position.y, (z0 + z1) / 2);
    } else if (width === 16 && height === 460) {
      root.remove(o); // jalan tanah dari gerbang
      g.dispose();
      o.material?.dispose?.();
    }
  }
}

/** Lereng hijau di sekeliling lantai: menyambung lantai yang dinaikkan ke medan perjalanan. */
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

/** Tanjakan paving dari ujung jalan (y = -pad) ke pagar (y = 0), berisi padat ke bawah supaya tidak melayang. */
function rampMesh(zFence, gap, pad, half, color) {
  const zr = zFence + gap;
  const yb = -pad - 4;
  const v = [
    [-half, 0.02, zFence], [half, 0.02, zFence], [half, -pad + 0.02, zr], [-half, -pad + 0.02, zr],
    [-half, yb, zFence], [half, yb, zFence], [half, yb, zr], [-half, yb, zr],
  ];
  const idx = [0, 1, 2, 0, 2, 3, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2, 3, 2, 6, 3, 6, 7];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v.flat(), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}

export function createHotelMasjid({ scene }) {
  const world = getMasjidWorld();
  const root = new THREE.Group(); // bingkai masjid: digeser dan diputar ke ujung jalan perjalanan
  root.visible = false;
  scene.add(root);
  let frame = null; // { ox, oz, psi, y0 }: masjid lokal (x, z) -> dunia = (ox, oz) + putar psi; y dunia = y0 + y lokal
  let built = null;
  let failed = false;
  let animFailed = false;
  let decor = [];

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
  const inCompound = (x, z, m) => x > BOUNDS.minX - m && x < BOUNDS.maxX + m && z > BOUNDS.minZ - m && z < BOUNDS.maxZ + m;
  const inPlaza = (x, z) => Math.abs(x) < MASJID_APPROACH.plazaHalf && z >= FENCE_Z - 2 && z < FENCE_Z + MASJID_APPROACH.plazaDepth;
  const inZone = (x, z) => inCompound(x, z, ZONE_MARGIN) || inPlaza(x, z);
  const rampY = (lz) => frame.y0 - MASJID_APPROACH.pad * (1 - clamp(1 - (lz - FENCE_Z) / MASJID_APPROACH.gap, 0, 1));

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
      const staging = new THREE.Scene(); // langit, kabut, dan cahaya mandiri masjid ditampung di sini lalu dibuang; hotel punya langit sendiri
      const noCountryside = { ...world, props: world.props.filter((p) => p.type !== 'tree') }; // pohon di luar pagar diganti pohon medan perjalanan
      const b = buildMasjidWorld(staging, noCountryside, {});
      fitStandaloneParts(b.root);
      root.add(b.root);
      root.updateMatrixWorld(true);
      built = b;
    } catch (error) {
      failed = true;
      console.warn('[hotel] masjid tidak dapat dimuat ke dunia hotel', error);
    }
  }

  return {
    id: 'masjid',
    fenceZ: FENCE_Z,
    approach: MASJID_APPROACH,
    zone: BOUNDS,
    carColliders: [],
    occluders: [], // diperbarui near() dengan penghalang di sekitar pemain
    get loaded() { return !!built; },
    get anchored() { return !!frame; },
    /** Pasang masjid di ujung jalan perjalanan: f = { ox, oz, psi, y0 } (bingkai masjid -> dunia). Lantai dan tanjakan digambar langsung; masjid dimuat lewat load(). */
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
        rampMesh(FENCE_Z, MASJID_APPROACH.gap, MASJID_APPROACH.pad, MASJID_APPROACH.plazaHalf + 1.5, 0xcdb892),
      ];
      for (const o of decor) root.add(o);
    },
    load,
    /** Bongkar masjid dan lantainya (kembali ke hotel). */
    release() {
      clearDecor();
      if (built) {
        root.remove(built.root);
        disposeTree(built.root);
      }
      built = null;
      failed = false;
      animFailed = false;
      frame = null;
      this.occluders = [];
      root.visible = false;
    },
    /** Apakah posisi pemain memakai fisika masjid (di dalam zona kompleks atau halaman depannya)? Hanya lantai dasar hotel. */
    active(p) {
      if (!frame || (p.level ?? 0) !== 0) return false;
      const l = toLocal(p.x, p.z);
      return inZone(l.x, l.z);
    },
    /** Dekat kompleks (untuk kamera): sekaligus menyegarkan penghalang kamera di sekitar pemain. */
    near(p) {
      if (!frame || (p.level ?? 0) !== 0) return false;
      const l = toLocal(p.x, p.z);
      const ok = inCompound(l.x, l.z, 20) || (Math.abs(l.x) < 40 && l.z >= FENCE_Z - 2 && l.z < FENCE_Z + MASJID_APPROACH.plazaDepth + 20);
      if (ok) this.occluders = inflateBoxes(world.occludersNear(l.x, l.z, OCCLUDER_RADIUS), CAM_PAD);
      return ok;
    },
    /** Titik dunia -> bingkai masjid (y dikurangi tinggi lantai masjid). */
    toLocalPoint(p) {
      const l = toLocal(p.x, p.z);
      return { x: l.x, y: p.y - frame.y0, z: l.z };
    },
    /** Arah hadap dunia -> arah hadap di bingkai masjid. */
    localYaw: (yaw) => yaw - frame.psi,
    /** Jalan kaki. Mengubah p.x, p.z, p.y, dan p.villa (selalu null: masjid hanya satu lantai). */
    walk(p, dx, dz) {
      if (!frame) return null;
      const l = toLocal(p.x, p.z);
      const c = Math.cos(frame.psi);
      const s = Math.sin(frame.psi);
      const d = { x: dx * c - dz * s, z: dx * s + dz * c }; // gerak dunia -> bingkai masjid
      const outside = l.z > FENCE_Z + 0.6 || (Math.abs(l.x) < GATE_OPEN && l.z > FENCE_Z - 2);
      if (outside) {
        let nx = l.x + d.x;
        let nz = l.z + d.z;
        if (nz >= FENCE_Z - 2) {
          if (nz < FENCE_Z + 0.6) nx = clamp(nx, -GATE_OPEN, GATE_OPEN); // di sela pagar hanya lewat bukaan Gerbang Utama
          nx = clamp(nx, -MASJID_APPROACH.plazaHalf + 0.5, MASJID_APPROACH.plazaHalf - 0.5);
          nz = Math.min(nz, FENCE_Z + MASJID_APPROACH.plazaDepth - 0.5);
          const w = toWorld(nx, nz);
          p.x = w.x;
          p.z = w.z;
          p.y = rampY(nz);
          p.villa = null;
          return { x: nx, z: nz };
        }
        // masuk lebih dalam lewat gerbang: fisika masjid mengambil alih
      }
      const next = world.move({ x: l.x, z: l.z }, d.x, d.z);
      // gerbang samping dan belakang pagar tidak untuk keluar: tamu tetap di dalam kompleks (keluar lewat Gerbang Utama)
      const nx = clamp(next.x, BOUNDS.minX + 1, BOUNDS.maxX - 1);
      const nz = Math.max(next.z, BOUNDS.minZ + 1);
      const w = toWorld(nx, nz);
      p.x = w.x;
      p.z = w.z;
      p.y = frame.y0;
      p.villa = null;
      return { x: nx, z: nz };
    },
    /** Titik turun mobil digeser bila mengenai penghalang (p dalam koordinat dunia). */
    constrain(p) {
      const l = toLocal(p.x, p.z);
      if (l.z > FENCE_Z + 0.6) {
        const w = toWorld(clamp(l.x, -MASJID_APPROACH.plazaHalf + 0.5, MASJID_APPROACH.plazaHalf - 0.5), Math.min(l.z, FENCE_Z + MASJID_APPROACH.plazaDepth - 0.5));
        return { x: w.x, z: w.z };
      }
      const c = world.constrain({ x: l.x, z: l.z });
      const w = toWorld(c.x, c.z);
      return { x: w.x, z: w.z };
    },
    /** Bantuan pintu: masjid tidak memakainya (bukaan pintunya lebar), gerakan dikembalikan apa adanya. */
    assist: (p, move) => ({ x: move.x, z: move.z }),
    /** Keterangan lokasi di dalam kompleks masjid, atau null di luarnya. */
    place(p) {
      if (!this.active(p)) return null;
      const l = toLocal(p.x, p.z);
      if (l.z > FENCE_Z + 0.6) return { id: 'masjid-halaman-depan', name: 'Masjid Agung · Halaman Depan', indoor: false };
      const r = world.roomAt(l.x, l.z);
      if (r.kind === 'outside') return null;
      return { id: `masjid-${r.id}`, name: `Masjid Agung · ${r.name}`, indoor: r.indoor };
    },
    /** Dipanggil tiap bingkai: menganimasikan taman (lampu malam, air) saat pemain dekat. Galat sekali = animasi dimatikan, masjid tetap tampil. */
    update({ me }) {
      if (!built || !frame || animFailed) return;
      const l = toLocal(me.x, me.z);
      if (Math.hypot(l.x - CENTER.x, l.z - CENTER.z) >= UPDATE_DISTANCE) return;
      try {
        built.setIndoor(0); // tanpa fokus: langit dan suara air masjid tidak dipakai di sini
      } catch (error) {
        animFailed = true;
        console.warn('[hotel] animasi masjid dimatikan karena galat', error);
      }
    },
    state: () => ({ anchored: !!frame, loaded: !!built, failed, frame }),
  };
}
