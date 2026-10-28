// Atap yang menahan hujan (data murni, tanpa THREE, diuji di Node). Dipakai rain-physics.js dan rain-3d.js supaya hujan 3D tidak turun di bawah
// kanopi, parkir motor, Royal Garage, atau podium hotel, tetapi tetap turun di area terbuka.
// Tiap atap = persegi [minX, minZ, maxX, maxZ] + tinggi y (m). Tetes di bawah y di dalam persegi itu terhalang; tetes yang menembus y memercik di atap.
import { HOTEL_BUILDING, HOTEL_CANOPY, HOTEL_FORECOURT, HOTEL_FOUNTAIN } from './hotel-layout.js';
import { OWNER_GARAGE, STAFF_BIKES_CANOPY, STAFF_CARS } from './hotel-parking.js';

export const ROOFS = Object.freeze([
  Object.freeze({ id: 'dropoff', name: 'Kanopi drop-off', rect: HOTEL_CANOPY.rect, y: HOTEL_CANOPY.height, drip: true }),
  Object.freeze({ id: 'motor', name: 'Kanopi parkir motor', rect: STAFF_BIKES_CANOPY, y: 3.4, drip: true }), // atap krem di y 3,4 (hotel-parking-world.js)
  Object.freeze({ id: 'garage', name: 'Royal Garage', rect: OWNER_GARAGE, y: 5.4, drip: false }), // atap gelap di y 5,4
  Object.freeze({ id: 'hotel', name: 'Podium dan menara hotel', rect: HOTEL_BUILDING, y: 400, drip: false }), // setinggi apa pun yang terlihat dari tanah
]);

const inRect = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];

/** Atap terendah di atas titik (x, y, z), atau null bila langit terbuka. */
export function roofOver(x, y, z, roofs = ROOFS) {
  let best = null;
  for (const r of roofs) if (r.y > y && inRect(r.rect, x, z) && (!best || r.y < best.y)) best = r;
  return best;
}

/** Atap tertinggi yang dilewati tetes yang jatuh dari yFrom ke yTo di (x, z), atau null. */
export function roofCrossed(x, z, yFrom, yTo, roofs = ROOFS) {
  let best = null;
  for (const r of roofs) if (yFrom >= r.y && yTo < r.y && inRect(r.rect, x, z) && (!best || r.y > best.y)) best = r;
  return best;
}

/** Titik (x, y, z) berada di bawah atap? */
export const coveredAt = (x, y, z, roofs = ROOFS) => roofOver(x, y, z, roofs) !== null;

/** Tepi atap yang meneteskan air (tirai air): satu segmen per sisi, dengan arah keluar (nx, nz). */
export function eaveEdges(roofs = ROOFS) {
  const out = [];
  for (const r of roofs) {
    if (!r.drip) continue;
    const [x0, z0, x1, z1] = r.rect;
    out.push(
      { roof: r.id, y: r.y, x1: x0, z1: z0, x2: x1, z2: z0, nx: 0, nz: -1 },
      { roof: r.id, y: r.y, x1: x0, z1: z1, x2: x1, z2: z1, nx: 0, nz: 1 },
      { roof: r.id, y: r.y, x1: x0, z1: z0, x2: x0, z2: z1, nx: -1, nz: 0 },
      { roof: r.id, y: r.y, x1: x1, z1: z0, x2: x1, z2: z1, nx: 1, nz: 0 },
    );
  }
  return out;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Genangan di halaman drop-off dan parkir karyawan: deterministik (seed tetap), tidak di bawah atap mana pun dan tidak menimpa air mancur.
 * Mengembalikan [{ x, z, r }].
 */
export function puddleSpots(count = 28, seed = 5) {
  const rnd = mulberry32(seed);
  const areas = [HOTEL_FORECOURT, STAFF_CARS];
  const out = [];
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const a = areas[tries % areas.length];
    const r = 0.7 + rnd() * 1.5;
    const x = a[0] + 2 + rnd() * (a[2] - a[0] - 4);
    const z = a[1] + 2 + rnd() * (a[3] - a[1] - 4);
    if (ROOFS.some((f) => x > f.rect[0] - r && x < f.rect[2] + r && z > f.rect[1] - r && z < f.rect[3] + r)) continue;
    if (Math.hypot(x - HOTEL_FOUNTAIN.x, z - HOTEL_FOUNTAIN.z) < HOTEL_FOUNTAIN.r + r + 1) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 1)) continue;
    out.push({ x, z, r });
  }
  return out;
}
