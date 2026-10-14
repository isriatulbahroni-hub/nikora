// Tabrakan kamera orang ketiga: kamera tidak boleh menembus dinding, lantai, langit-langit, atap, tangga, atau perabot besar.
// Murni matematika (tanpa THREE) supaya mudah diuji.
import { DOOR_HEIGHT, HALL_WALL_HEIGHT, LEVEL_HEIGHT, PROP_SPECS, ROOFS, STAIRS, WALL_HEIGHT, levelY, wallToRect } from './villa-layout.js';

const PROP_HEIGHT = Object.freeze({ bed: 1.2, table: 0.85, desk: 1.1, counter: 0.95, tub: 0.8, car: 1.6, sofa: 0.95, lounger: 0.6 });
const STAIR_STEPS = 18;

/** Kumpulan kotak (AABB) yang menghalangi kamera. */
export function buildCameraOccluders(world) {
  const boxes = [];
  const add = (minX, maxX, minY, maxY, minZ, maxZ) => boxes.push({ minX, maxX, minY, maxY, minZ, maxZ });
  add(-300, 300, -6, 0.05, -300, 300); // tanah: kamera tidak boleh masuk ke bawah tanah
  for (const level of world.levels) {
    const y0 = levelY(level.level);
    for (const w of level.walls) {
      if (w.dup) continue; // dinding duplikat di tepi aula: sudah diwakili dinding aula lantai dasar
      const r = wallToRect(w);
      add(r.minX, r.maxX, y0, y0 + (w.h ?? WALL_HEIGHT), r.minZ, r.maxZ);
    }
    // dinding di atas bukaan pintu (ambang): kamera tidak boleh lewat di atas daun pintu
    for (const d of level.doors) {
      const top = y0 + (d.tall ? HALL_WALL_HEIGHT : WALL_HEIGHT);
      const hw = d.width / 2;
      const t = 0.15;
      if (d.orient === 'h') add(d.x - hw, d.x + hw, y0 + DOOR_HEIGHT, top, d.z - t, d.z + t);
      else add(d.x - t, d.x + t, y0 + DOOR_HEIGHT, top, d.z - hw, d.z + hw);
    }
    for (const p of level.props) {
      const h = PROP_HEIGHT[p.type];
      if (!h) continue;
      const s = PROP_SPECS[p.type];
      add(p.x - s.hx, p.x + s.hx, y0, y0 + h, p.z - s.hz, p.z + s.hz);
    }
    if (level.level > 0) {
      // pelat lantai (juga langit-langit lantai di bawahnya)
      for (const r of level.rooms) {
        const rect = r.kind === 'stair' ? r.landing : r.rect;
        if (rect) add(rect[0], rect[2], y0 - 0.4, y0, rect[1], rect[3]);
      }
    }
  }
  for (const r of ROOFS) add(r.rect[0] - r.overhang, r.rect[2] + r.overhang, r.base, r.base + r.rise, r.rect[1] - r.overhang, r.rect[3] + r.overhang);
  for (const s of STAIRS) {
    const run = Math.abs(s.zBottom - s.zTop);
    const dir = Math.sign(s.zBottom - s.zTop);
    const depth = run / STAIR_STEPS;
    const base = levelY(s.from);
    for (let i = 0; i < STAIR_STEPS; i++) {
      const zc = s.zBottom - dir * (i + 0.5) * depth;
      add(s.x1, s.x2, base, base + ((i + 1) * LEVEL_HEIGHT) / STAIR_STEPS, zc - depth / 2, zc + depth / 2);
    }
  }
  return boxes;
}

/** Jarak sinar (o + t*d) menuju kotak, atau Infinity bila tidak kena / titik awal di dalam kotak. */
export function rayBoxDistance(o, d, b, maxT = Infinity) {
  let tMin = 0;
  let tMax = maxT;
  const axes = [['x', 'minX', 'maxX'], ['y', 'minY', 'maxY'], ['z', 'minZ', 'maxZ']];
  let inside = true;
  for (const [a, lo, hi] of axes) {
    const origin = o[a];
    const dir = d[a];
    if (origin < b[lo] || origin > b[hi]) inside = false;
    if (Math.abs(dir) < 1e-9) {
      if (origin < b[lo] || origin > b[hi]) return Infinity;
      continue;
    }
    let t1 = (b[lo] - origin) / dir;
    let t2 = (b[hi] - origin) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return Infinity;
  }
  if (inside) return Infinity;
  return tMin;
}

/**
 * Jarak kamera dari `origin` ke arah `dir` (vektor satuan), dipendekkan bila terhalang.
 * margin menjaga bidang dekat kamera tidak memotong dinding; minDist mencegah kamera masuk ke kepala avatar.
 */
export function resolveCameraDistance(origin, dir, desired, boxes, { margin = 0.4, minDist = 0.5 } = {}) {
  let hit = desired + margin;
  for (const b of boxes) {
    // penyaringan cepat: kotak harus berada dalam jangkauan sinar
    const ex = dir.x * desired;
    const ey = dir.y * desired;
    const ez = dir.z * desired;
    if (b.maxX < Math.min(origin.x, origin.x + ex) - margin || b.minX > Math.max(origin.x, origin.x + ex) + margin) continue;
    if (b.maxZ < Math.min(origin.z, origin.z + ez) - margin || b.minZ > Math.max(origin.z, origin.z + ez) + margin) continue;
    if (b.maxY < Math.min(origin.y, origin.y + ey) - margin || b.minY > Math.max(origin.y, origin.y + ey) + margin) continue;
    const t = rayBoxDistance(origin, dir, b, hit);
    if (t < hit) hit = t;
  }
  return { dist: Math.max(minDist, Math.min(desired, hit - margin)), blocked: hit - margin < desired };
}
