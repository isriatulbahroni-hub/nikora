// Tata letak "NIKORA Royal Wedding World" (Aula Resepsi): dipakai bersama oleh klien (render) dan server (validasi).
// Murni logika (tanpa THREE) agar server bisa mengimpornya. Semua ukuran dalam meter; sumbu -z = ke arah istana.
//
//   z = -25  ┌──────────── istana + gerbang agung (layar acara di dalam gerbang) ────────────┐
//            │   meja terasa       ┌── pelaminan ──┐       meja terasa                      │
//   z = -12  │  gazebo kaca   ┌────┴ kolam kiri ┬ kolam kanan ┬────┐   panggung bundar      │
//            │  (jembatan)    │  air mancur     │ jalur marmer │    │   (pulau santai)      │
//   z =  +8  │                └──── pulau santai ──────────────────┘                        │
//   z = +12  └──────────────────── lorong masuk, gapura bunga ───────────────────────────┘

export const HALL = Object.freeze({
  tableRadius: 1.05,
  seatRadius: 1.75,
  seatsPerTable: 6,
  playerRadius: 0.35,
  seatedDrop: -0.3, // avatar duduk sedikit lebih rendah
  sitRange: 1.7, // jarak maksimum pemain ke kursi agar boleh duduk
  stage: Object.freeze({ halfWidth: 5.2, frontZ: -17.6, backZ: -25.2, height: 0.55 }), // pelaminan di depan gerbang istana
  bounds: Object.freeze({ minX: -28.5, maxX: 28.5, minZ: -25.2, maxZ: 12.5 }),
  promenadeHalfWidth: 4.4, // jalur marmer utama
});

/** Persegi sumbu-sejajar { x0, x1, z0, z1 }. */
const rect = (x0, x1, z0, z1) => Object.freeze({ x0, x1, z0, z1 });
const around = (x, z, half) => rect(x - half, x + half, z - half, z + half);

// ---- Kolam, air mancur, jembatan, pulau, gazebo ----
export const POOLS = Object.freeze([
  Object.freeze({ id: 'L', ...rect(-19, -4.9, -12.5, 8.0) }),
  Object.freeze({ id: 'R', ...rect(4.9, 19, -12.5, 8.0) }),
]);
export const POOL_FLOOR_Y = -1.05;
export const WATER_Y = -0.3;
export const FOUNTAINS = Object.freeze([
  Object.freeze({ x: -11.4, z: -9.2, r: 2.8 }),
  Object.freeze({ x: 11.4, z: -9.2, r: 2.8 }),
]);

// pulau santai: dek persegi (setengah sisi 2.7) dengan satu meja bundar di tengah
const POD_HALF = 2.7;
export const PODS = Object.freeze([
  Object.freeze({ id: 'PL1', x: -10.4, z: 4.6, half: POD_HALF }),
  Object.freeze({ id: 'PR1', x: 10.4, z: 4.6, half: POD_HALF }),
  Object.freeze({ id: 'PR2', x: 13.4, z: -3.1, half: POD_HALF }),
]);

export const GAZEBO = Object.freeze({
  x: -22,
  z: -3,
  radius: 6.0, // jari-jari kubah kaca
  columnRing: 5.4,
  columns: 10,
  columnPhase: Math.PI / 10, // celah di timur (jembatan) dan barat (daratan)
});

export const DAIS = Object.freeze({ x: 23.9, z: -4.0, r: 4.4 }); // panggung bundar bergorden di teras kanan

// jembatan (dek berjalan di atas air), semuanya sejajar sumbu
export const BRIDGES = Object.freeze([
  Object.freeze({ id: 'B-gazebo', ...rect(-17.8, -4.9, -4.2, -1.8) }),
  Object.freeze({ id: 'B-PL1', ...rect(-7.7, -4.9, 2.2, 4.6) }),
  Object.freeze({ id: 'B-PR1', ...rect(4.9, 7.7, 2.2, 4.6) }),
  Object.freeze({ id: 'B-PR1-PR2', ...rect(11.0, 12.8, -0.4, 1.9) }),
]);
export const GAZEBO_DECK = rect(-26.2, -17.8, -7.2, 1.2);
export const POD_DECKS = Object.freeze(PODS.map((p) => around(p.x, p.z, p.half)));
export const DECKS = Object.freeze([...BRIDGES, GAZEBO_DECK, ...POD_DECKS]);

// ---- Meja dan kursi ----
const TABLE_POINTS = [
  [-24.1, -3.0], [-19.9, -3.0], // 0-1 gazebo kaca
  [PODS[0].x, PODS[0].z], [PODS[1].x, PODS[1].z], [PODS[2].x, PODS[2].z], // 2-4 pulau santai
  [-10.8, -19.8], [10.8, -19.8], [-17.0, -19.8], [17.0, -19.8], // 5-8 teras depan istana
  [23.4, 6.2], [23.4, -12.6], [-23.4, 6.2], [-23.4, -13.0], // 9-12 teras tepi
  [-7.4, 10.4], [7.4, 10.4], // 13-14 meja sambutan di plaza depan (dekat pintu masuk, tidak dekat titik spawn)
];
export const TABLES = Object.freeze(TABLE_POINTS.map(([x, z], id) => Object.freeze({ id, x, z })));

/** Arah hadap (rotasi Y) untuk melihat ke vektor (dx, dz); rot 0 = menghadap -z. */
export function facingAngle(dx, dz) {
  return Math.atan2(-dx, -dz);
}

export const SEATS = Object.freeze(
  TABLES.flatMap((table) =>
    Array.from({ length: HALL.seatsPerTable }, (_, i) => {
      const angle = (i / HALL.seatsPerTable) * Math.PI * 2;
      const x = table.x + Math.cos(angle) * HALL.seatRadius;
      const z = table.z + Math.sin(angle) * HALL.seatRadius;
      return Object.freeze({
        id: table.id * HALL.seatsPerTable + i,
        table: table.id,
        x,
        z,
        rot: facingAngle(table.x - x, table.z - z),
      });
    }),
  ),
);

// ---- Penghalang ----
/** Kurangi `holes` dari `base`: hasilnya daftar persegi yang tidak tumpang tindih (untuk kolam berjembatan). */
export function subtractRects(base, holes) {
  const clampX = (v) => Math.min(base.x1, Math.max(base.x0, v));
  const clampZ = (v) => Math.min(base.z1, Math.max(base.z0, v));
  const xs = [...new Set([base.x0, base.x1, ...holes.flatMap((h) => [clampX(h.x0), clampX(h.x1)])])].sort((a, b) => a - b);
  const zs = [...new Set([base.z0, base.z1, ...holes.flatMap((h) => [clampZ(h.z0), clampZ(h.z1)])])].sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j < zs.length - 1; j += 1) {
    let run = null;
    for (let i = 0; i < xs.length - 1; i += 1) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cz = (zs[j] + zs[j + 1]) / 2;
      const inHole = holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1);
      if (inHole) {
        if (run) out.push(run);
        run = null;
      } else if (run) {
        run = rect(run.x0, xs[i + 1], run.z0, run.z1);
      } else {
        run = rect(xs[i], xs[i + 1], zs[j], zs[j + 1]);
      }
    }
    if (run) out.push(run);
  }
  return out;
}

// tiang bunga di tepi jalur marmer (dilewati di mulut jembatan)
const bridgeMouths = BRIDGES.filter((b) => b.x0 === -4.9 || b.x1 === 4.9 || b.x0 === 4.9 || b.x1 === -4.9);
export const FLOWER_COLUMNS = Object.freeze(
  [-1, 1].flatMap((side) =>
    Array.from({ length: 10 }, (_, k) => 10.5 - k * 3)
      .filter((z) => !bridgeMouths.some((b) => (side < 0 ? b.x1 === -4.9 : b.x0 === 4.9) && z > b.z0 - 0.55 && z < b.z1 + 0.55))
      .map((z) => Object.freeze({ x: side * 4.65, z })),
  ),
);

// pohon palem, sipres, dan tanaman pot yang menghalangi jalan (pohon di luar batas hanya dekor di hall-world.js)
export const PALMS = Object.freeze([
  [-27.2, 10.2], [-27.2, 3.4], [-27.4, -8.6], [-27.2, -16.4], [-27.2, -23.2],
  [27.2, 10.2], [27.2, 4.0], [27.4, -9.6], [27.2, -16.8], [27.2, -23.0],
  [-19.8, 11.0], [19.8, 11.0], [-15.0, 11.2], [15.0, 11.2],
  [-6.2, -22.8], [6.2, -22.8], [-13.4, -23.4], [13.4, -23.4], [-21.4, -23.6], [21.4, -23.6],
  [-20.4, -12.8], [20.4, -12.8], [-20.6, 7.8], [20.6, 7.8],
].map(([x, z]) => Object.freeze({ x, z, r: 0.32 })));

const podCorners = PODS.flatMap((p) =>
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: p.x + sx * (p.half - 0.5), z: p.z + sz * (p.half - 0.5), r: 0.34 })),
);
const gazeboColumns = Array.from({ length: GAZEBO.columns }, (_, i) => {
  const a = GAZEBO.columnPhase + (i / GAZEBO.columns) * Math.PI * 2;
  return { x: GAZEBO.x + Math.cos(a) * GAZEBO.columnRing, z: GAZEBO.z + Math.sin(a) * GAZEBO.columnRing, r: 0.32 };
});
export const GAZEBO_COLUMNS = Object.freeze(gazeboColumns.map((c) => Object.freeze(c)));
const entranceArch = [-3.0, 3.0].map((x) => ({ x, z: 10.6, r: 0.5 }));

const CIRCLES = Object.freeze([
  ...TABLES.map((t) => ({ x: t.x, z: t.z, r: HALL.tableRadius })),
  ...PALMS,
  ...FLOWER_COLUMNS.map((c) => ({ x: c.x, z: c.z, r: 0.3 })),
  ...podCorners,
  ...gazeboColumns,
  ...entranceArch,
  { x: DAIS.x, z: DAIS.z, r: DAIS.r },
]);

export const POOL_OBSTACLES = Object.freeze(POOLS.flatMap((pool) => subtractRects(pool, DECKS)));
const RECTS = Object.freeze([
  ...POOL_OBSTACLES,
  rect(-HALL.stage.halfWidth, HALL.stage.halfWidth, HALL.bounds.minZ - 10, HALL.stage.frontZ), // pelaminan
]);

export const OBSTACLE_CIRCLES = CIRCLES;
export const OBSTACLE_RECTS = RECTS;

function pushFromCircle(p, c, radius) {
  const min = c.r + radius;
  const dx = p.x - c.x;
  const dz = p.z - c.z;
  const d = Math.hypot(dx, dz);
  if (d >= min) return;
  if (d === 0) p.x = c.x + min;
  else {
    p.x = c.x + (dx / d) * min;
    p.z = c.z + (dz / d) * min;
  }
}

function pushFromRect(p, r, radius) {
  const qx = Math.min(r.x1, Math.max(r.x0, p.x));
  const qz = Math.min(r.z1, Math.max(r.z0, p.z));
  const dx = p.x - qx;
  const dz = p.z - qz;
  const d = Math.hypot(dx, dz);
  if (d > 0) {
    if (d >= radius) return;
    p.x = qx + (dx / d) * radius;
    p.z = qz + (dz / d) * radius;
    return;
  }
  // titik di dalam persegi: keluar lewat sisi terdekat
  const toLeft = p.x - r.x0;
  const toRight = r.x1 - p.x;
  const toTop = p.z - r.z0;
  const toBottom = r.z1 - p.z;
  const min = Math.min(toLeft, toRight, toTop, toBottom);
  if (min === toLeft) p.x = r.x0 - radius;
  else if (min === toRight) p.x = r.x1 + radius;
  else if (min === toTop) p.z = r.z0 - radius;
  else p.z = r.z1 + radius;
}

const clampToBounds = ({ x, z }) => ({
  x: Math.max(HALL.bounds.minX, Math.min(HALL.bounds.maxX, x)),
  z: Math.max(HALL.bounds.minZ, Math.min(HALL.bounds.maxZ, z)),
});

/** Dorong posisi keluar dari meja, pohon, kolam, dan pelaminan, lalu batasi di dalam dunia. */
export function resolveCollisions(position, radius = HALL.playerRadius) {
  let p = clampToBounds({ x: Number.isFinite(position.x) ? position.x : 0, z: Number.isFinite(position.z) ? position.z : 0 });
  for (let pass = 0; pass < 4; pass += 1) {
    for (const c of CIRCLES) pushFromCircle(p, c, radius);
    for (const r of RECTS) pushFromRect(p, r, radius);
    p = clampToBounds(p);
  }
  return p;
}

/** Apakah titik bisa diinjak (tidak ada penghalang)? */
export function isWalkable(x, z, radius = HALL.playerRadius) {
  const out = resolveCollisions({ x, z }, radius);
  return Math.hypot(out.x - x, out.z - z) < 1e-6;
}

/** Kursi kosong terdekat dalam jangkauan, atau null. `occupied` = Set id kursi. */
export function findNearestSeat(position, occupied = new Set(), range = HALL.sitRange) {
  let best = null;
  let bestDistance = range;
  for (const seat of SEATS) {
    if (occupied.has(seat.id)) continue;
    const distance = Math.hypot(seat.x - position.x, seat.z - position.z);
    if (distance <= bestDistance) {
      best = seat;
      bestDistance = distance;
    }
  }
  return best;
}
