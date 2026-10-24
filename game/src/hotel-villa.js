import * as THREE from 'three';
import { BOUNDS, getVillaWorld, roomAt } from './villa-layout.js';
import { buildVillaWorld } from './villa-world.js';
import { buildCameraOccluders } from './villa-camera.js';
import { extraCameraOccluders, inflateBoxes } from './villa-motion.js';

// NIKORA Wedding Villa DI DALAM dunia hotel: satu dunia, satu jalan. Denah villa memakai bingkai koordinat yang sama dengan hotel
// (villa-layout.js: x ke timur, z ke selatan), jadi villa digambar apa adanya di tempatnya (z -26..84), tepat di ujung utara Jalan Raya
// NIKORA. Dari jalan, mobil masuk lewat bukaan gerbang pagar villa; pejalan kaki memakai fisika villa (dinding, pintu, tangga, lantai atas).
// Yang BELUM ikut (masih di halaman villa lengkap, tombol "Buka Villa lengkap"): lift, ruang game, TV kamar, kunci kamar, duduk/tidur,
// layar tancap, bulu tangkis, panel pesta, dan suara dekat.
// Dibuat malas (lazy): villa baru dibangun saat pemain mendekat, supaya hotel tetap cepat dimuat di HP.
const ZONE_MARGIN = 4; // sabuk di luar pagar yang masih memakai fisika villa (agar pagar tidak bisa ditembus dari luar)
const ZONE = Object.freeze({ minX: BOUNDS.minX - ZONE_MARGIN, maxX: BOUNDS.maxX + ZONE_MARGIN, minZ: BOUNDS.minZ - ZONE_MARGIN, maxZ: BOUNDS.maxZ + ZONE_MARGIN });
const CENTER = Object.freeze({ x: 0, z: (BOUNDS.minZ + BOUNDS.maxZ) / 2 });
const LOAD_DISTANCE = 420; // mulai membangun villa saat pemain sedekat ini (m dari pusat villa); jalan villa sepanjang 300 m jadi villa sudah siap saat tiba
const UPDATE_DISTANCE = 170; // pintu geser, air mancur, dan air kolam hanya dianimasikan bila pemain dekat
const CAM_PAD = 0.3;

const inZone = (x, z) => x > ZONE.minX && x < ZONE.maxX && z > ZONE.minZ && z < ZONE.maxZ;
const overlapsZone = (c) => c.maxX > ZONE.minX && c.minX < ZONE.maxX && c.maxZ > ZONE.minZ && c.minZ < ZONE.maxZ;

/** Buang bagian dunia villa yang hanya cocok untuk halaman villa sendiri: tanah tak berujung, bercak rumput, bukit latar, jalan desa, dan semak jalan desa. */
function stripStandaloneParts(root) {
  for (const o of [...root.children]) {
    const g = o.geometry;
    const m = o.material;
    const drop =
      o.isLight ||
      (o.isMesh && !o.isInstancedMesh && g?.type === 'ShapeGeometry') || // tanah luas bergaris kolam
      (o.isMesh && !o.isInstancedMesh && g?.type === 'PlaneGeometry' && Math.abs((g.parameters?.width ?? 0) - 6.4) < 1e-6) || // jalan tanah dari gerbang
      (o.isInstancedMesh && g?.type === 'PlaneGeometry' && m?.isMeshBasicMaterial && m.transparent) || // bercak rumput gelap/terang
      (o.isInstancedMesh && g?.type === 'SphereGeometry' && g.parameters?.widthSegments === 14 && g.parameters?.heightSegments === 8) || // bukit latar
      (o.isInstancedMesh && g?.type === 'IcosahedronGeometry' && m?.roughness === 0.9 && !m.map && o.count > 0 && o.instanceMatrix.array[14] > BOUNDS.maxZ + 4); // semak jalan desa
    if (drop) root.remove(o);
  }
}

export function createHotelVilla({ scene }) {
  const world = getVillaWorld();
  let built = null;
  let failed = false;
  let occluders = [];
  try {
    occluders = inflateBoxes([...buildCameraOccluders(world), ...extraCameraOccluders(world)], CAM_PAD);
  } catch (error) {
    console.warn('[hotel] penghalang kamera villa dilewati', error);
  }
  // Penghalang mobil: pagar, dinding, kolam, dan properti lantai dasar yang berada di zona villa (pohon desa tak digambar, jadi tak ikut).
  const carColliders = world.levels[0].colliders.filter(overlapsZone);

  function load() {
    try {
      const staging = new THREE.Scene(); // langit, kabut, dan cahaya mandiri villa ditampung di sini lalu dibuang; hotel punya langit sendiri
      const noTrees = { ...world, props: world.props.filter((p) => p.type !== 'tree') };
      const b = buildVillaWorld(staging, noTrees, {});
      stripStandaloneParts(b.root);
      scene.add(b.root);
      built = b;
    } catch (error) {
      failed = true;
      console.warn('[hotel] villa tidak dapat dimuat ke dunia hotel', error);
    }
  }

  return {
    zone: ZONE,
    carColliders,
    occluders,
    get loaded() { return !!built; },
    /** Apakah posisi pemain memakai fisika villa (di dalam zona villa, atau sedang di tangga/lantai atas)? Hanya berlaku di lantai dasar hotel. */
    active: (p) => (p.level ?? 0) === 0 && (p.villa != null || inZone(p.x, p.z)),
    near: (p) => (p.level ?? 0) === 0 && p.x > ZONE.minX - 20 && p.x < ZONE.maxX + 20 && p.z > ZONE.minZ - 20 && p.z < ZONE.maxZ + 20,
    /** Jalan kaki dengan fisika villa (lantai, tangga, dinding). Mengubah p.x, p.z, p.y, dan p.villa ({level, stair} atau null di lantai dasar). */
    walk(p, dx, dz) {
      const next = world.move({ x: p.x, z: p.z, level: p.villa?.level ?? 0, stair: p.villa?.stair ?? null, y: p.y }, dx, dz);
      p.x = next.x;
      p.z = next.z;
      p.y = next.y;
      p.villa = next.level === 0 && next.stair === null ? null : { level: next.level, stair: next.stair };
      return next;
    },
    constrain: (p) => world.constrain({ x: p.x, z: p.z }),
    doors: (p) => world.levels[p.villa?.level ?? 0]?.doors ?? [],
    /** Keterangan lokasi di dalam kompleks villa, atau null di luarnya. */
    place(p) {
      if (!this.active(p)) return null;
      const level = p.villa?.level ?? 0;
      if (p.villa?.stair) return { id: `villa-stair@${level}`, name: 'Villa · Tangga', indoor: false };
      const r = roomAt(p.x, p.z, level);
      if (r.kind === 'outside') return null;
      return { id: `villa-${r.id}@${level}`, name: level > 0 ? `Villa · Lantai ${level + 1} · ${r.name}` : `Villa · ${r.name}`, indoor: r.indoor };
    },
    /** Dipanggil tiap bingkai: membangun villa saat pemain mendekat dan menganimasikannya (pintu, air) saat dekat. */
    update({ me, delta, cameraPosition, others = [] }) {
      const d = Math.hypot(me.x - CENTER.x, me.z - CENTER.z);
      if (!built && !failed && d < LOAD_DISTANCE) load();
      if (built && d < UPDATE_DISTANCE) {
        const actors = [{ x: me.x, z: me.z, y: me.y }];
        for (const o of others) actors.push({ x: o.x, z: o.z, y: o.y ?? 0 });
        built.update(me.x, me.z, delta, actors, cameraPosition);
      }
    },
    state: () => ({ loaded: !!built, failed, colliders: carColliders.length }),
  };
}
