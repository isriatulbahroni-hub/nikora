// Denah NIKORA Wedding Villa (satuan meter). x ke timur, z ke selatan (utara = -z).
// Modul ini murni data + matematika (tanpa THREE) supaya dipakai bersama oleh
// klien (render, tabrakan) dan server (validasi gerak otoritatif).

export const WALL_THICKNESS = 0.3;
export const WALL_HEIGHT = 2.6;
export const PLAYER_RADIUS = 0.4;
export const BOUNDS = Object.freeze({ minX: -42, maxX: 42, minZ: -26, maxZ: 42 });
export const SPAWN = Object.freeze({ x: 0, z: 37 });
export const SIT_RANGE = 1.9; // jarak maksimum ke kursi/sofa/tempat tidur agar boleh duduk atau tidur
export const SEATED_DROP = -0.3; // avatar duduk sedikit lebih rendah

const GUEST_COLS = [16, 21.5, 27, 32.5, 38];

function guestRooms() {
  const rooms = [];
  let n = 1;
  for (const [z1, z2] of [[4, 12], [14, 22]]) {
    for (let i = 0; i < 4; i++) {
      rooms.push({ id: `guest_${n}`, name: `Guest Room ${n}`, kind: 'guest', rect: [GUEST_COLS[i], z1, GUEST_COLS[i + 1], z2] });
      n++;
    }
  }
  return rooms;
}

export const ROOMS = Object.freeze([
  { id: 'spa', name: 'Spa & Wellness', kind: 'spa', rect: [-38, -20, -26, -3] },
  { id: 'main_suite', name: 'Main Suite', kind: 'suite', rect: [-26, -20, -14, -3] },
  { id: 'wedding_hall', name: 'Wedding Hall (Indoor)', kind: 'hall', rect: [-14, -20, 14, -3] },
  { id: 'lobby', name: 'Lobby / Reception', kind: 'lobby', rect: [14, -20, 26, -3] },
  { id: 'bridal_room', name: 'Bridal Room', kind: 'bridal', rect: [26, -20, 38, -3] },
  { id: 'restaurant', name: 'Restaurant & Cafe', kind: 'restaurant', rect: [-36, 4, -16, 20] },
  { id: 'kitchen', name: 'Kitchen', kind: 'kitchen', rect: [-36, 20, -26, 30] },
  { id: 'corridor', name: 'Guest Corridor', kind: 'corridor', rect: [16, 12, 38, 14] },
  ...guestRooms(),
]);

// Area terbuka (dipakai untuk label lokasi dan lantai paving).
export const ZONES = Object.freeze([
  { id: 'bridge_pool', name: 'Pool & Garden', kind: 'pool', rect: [-7, 2, 7, 16] },
  { id: 'fountain_garden', name: 'Pool & Garden', kind: 'garden', rect: [-12, 16, 12, 42] },
  { id: 'parking', name: 'Parking Area', kind: 'parking', rect: [18, 24, 42, 42] },
  { id: 'courtyard', name: 'Main Courtyard', kind: 'courtyard', rect: [-42, -3, 42, 4] },
]);

// orient 'h': pintu pada dinding yang membentang sepanjang x (di koordinat z).
// orient 'v': pintu pada dinding yang membentang sepanjang z (di koordinat x).
const guestDoorXs = [0, 1, 2, 3].map((i) => (GUEST_COLS[i] + GUEST_COLS[i + 1]) / 2);
export const DOORS = Object.freeze([
  { x: 0, z: -3, orient: 'h', width: 5 }, // pintu utama aula
  { x: 14, z: -11, orient: 'v', width: 3 }, // aula <-> lobby
  { x: -14, z: -11, orient: 'v', width: 3 }, // aula <-> main suite
  { x: 26, z: -11, orient: 'v', width: 3 }, // lobby <-> bridal
  { x: -26, z: -11, orient: 'v', width: 3 }, // main suite <-> spa
  { x: 20, z: -3, orient: 'h', width: 3 }, // lobby ke luar
  { x: 32, z: -3, orient: 'h', width: 3 }, // bridal ke luar
  { x: -20, z: -3, orient: 'h', width: 3 }, // main suite ke luar
  { x: -32, z: -3, orient: 'h', width: 3 }, // spa ke luar
  { x: -16, z: 12, orient: 'v', width: 4 }, // restoran ke taman kolam
  { x: -26, z: 4, orient: 'h', width: 3 }, // restoran ke teras
  { x: -20, z: 20, orient: 'h', width: 3 }, // restoran ke taman selatan
  { x: -31, z: 20, orient: 'h', width: 2.5 }, // restoran <-> dapur
  { x: 16, z: 13, orient: 'v', width: 2 }, // koridor kamar tamu ke luar
  ...guestDoorXs.map((x) => ({ x, z: 12, orient: 'h', width: 1.6 })),
  ...guestDoorXs.map((x) => ({ x, z: 14, orient: 'h', width: 1.6 })),
]);

// Ukuran setengah (hx, hz) properti yang menghalangi jalan.
export const PROP_SPECS = Object.freeze({
  bed: { hx: 0.95, hz: 1.1 },
  table: { hx: 0.85, hz: 0.85 },
  desk: { hx: 1.8, hz: 0.5 },
  counter: { hx: 1.2, hz: 0.5 },
  tub: { hx: 1.5, hz: 1.0 },
  car: { hx: 0.95, hz: 2.1 },
  palm: { hx: 0.25, hz: 0.25 },
  sofa: { hx: 1.1, hz: 0.5 },
});

function buildProps() {
  const props = [];
  for (const r of ROOMS) {
    if (r.kind !== 'guest') continue;
    const [x1, z1, x2, z2] = r.rect;
    const north = z1 < 10;
    props.push({ type: 'bed', x: (x1 + x2) / 2, z: north ? z1 + 1.5 : z2 - 1.5 });
  }
  props.push({ type: 'bed', x: -20, z: -17.8 }); // main suite
  props.push({ type: 'bed', x: 32, z: -17.8 }); // bridal room
  props.push({ type: 'tub', x: -34, z: -17 }); // spa
  props.push({ type: 'desk', x: 20, z: -17.5 }); // reception
  props.push({ type: 'sofa', x: 17.5, z: -7 }, { type: 'sofa', x: 22.5, z: -7 }); // lobby, menghadap utara
  for (const x of [-32, -20]) for (const z of [8, 16]) props.push({ type: 'table', x, z }); // restoran
  for (const z of [22.5, 26.5]) props.push({ type: 'counter', x: -31, z: z + 0 }, { type: 'counter', x: -28, z: z + 0 }); // dapur
  for (const x of [22, 26, 30, 34]) for (const z of [30, 37]) props.push({ type: 'car', x, z }); // parkir
  const palms = [
    [-10, 6], [-10, 12], [10, 6], [10, 12], [-6, 22], [6, 22], [-6, 34], [6, 34], [-6, 28], [6, 28],
    [-14, 24], [-22, 26], [-30, 34], [-36, 36], [-26, 38], [-18, 33], [-12, 38], [14, 24], [13, 36], [12, 30],
    [-40, -22], [-40, -8], [-40, 10], [-40, 28], [40, -22], [40, -8], [40, 22], [-2.8, 40], [2.8, 40],
  ];
  for (const [x, z] of palms) props.push({ type: 'palm', x, z });
  return props;
}

export const HALL_SEATING = Object.freeze({ z0: -17, z1: -6, rowStep: 1.3, xInner: 2.4, xOuter: 11.2, colStep: 0.9 });

/** Posisi semua kursi tamu di aula pernikahan (dua blok, kiri dan kanan lorong). */
export function hallChairPositions() {
  const { z0, z1, rowStep, xInner, xOuter, colStep } = HALL_SEATING;
  const out = [];
  for (let z = z0; z <= z1 + 1e-6; z += rowStep) {
    for (let x = xInner; x <= xOuter + 1e-6; x += colStep) out.push({ x, z }, { x: -x, z });
  }
  return out;
}

// Titik duduk/tidur. id = indeks di larik ini (sama di klien dan server).
// rot mengikuti avatar: 0 = menghadap utara (-z). Untuk 'sleep', rot = arah kepala.
function buildSpots(props) {
  const spots = [];
  for (const c of hallChairPositions()) spots.push({ kind: 'sit', x: c.x, z: c.z, rot: 0 });
  for (const t of props.filter((p) => p.type === 'table')) {
    for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) {
      spots.push({ kind: 'sit', x: t.x + dx, z: t.z + dz, rot: Math.atan2(dx, dz) }); // menghadap meja
    }
  }
  for (const s of props.filter((p) => p.type === 'sofa')) {
    spots.push({ kind: 'sit', x: s.x - 0.55, z: s.z, rot: 0 }, { kind: 'sit', x: s.x + 0.55, z: s.z, rot: 0 });
  }
  for (const b of props.filter((p) => p.type === 'bed')) {
    spots.push({ kind: 'sleep', x: b.x, z: b.z, rot: b.z < 10 ? 0 : Math.PI }); // kepala di sisi papan kepala
  }
  return spots.map((s, id) => ({ id, ...s }));
}

/** Posisi/arah avatar saat memakai titik duduk atau tidur (tidur = berbaring telentang). */
export function spotPose(spot) {
  if (spot.kind === 'sleep') {
    return { x: spot.x + 0.83 * Math.sin(spot.rot), z: spot.z + 0.83 * Math.cos(spot.rot), y: 0.9, rotY: spot.rot, tilt: -Math.PI / 2 };
  }
  return { x: spot.x, z: spot.z, y: SEATED_DROP, rotY: spot.rot, tilt: 0 };
}

export function findNearestSpot(pos, spots, occupied = new Set(), range = SIT_RANGE) {
  let best = null;
  let bestDistance = range;
  for (const s of spots) {
    if (occupied.has(s.id)) continue;
    const d = Math.hypot(s.x - pos.x, s.z - pos.z);
    if (d <= bestDistance) {
      best = s;
      bestDistance = d;
    }
  }
  return best;
}

function splitEdge(orient, coord, lo, hi) {
  const half = WALL_THICKNESS / 2;
  const gaps = DOORS.filter((d) => d.orient === orient && Math.abs((orient === 'h' ? d.z : d.x) - coord) < 1e-6)
    .map((d) => {
      const c = orient === 'h' ? d.x : d.z;
      return [c - d.width / 2, c + d.width / 2];
    })
    .filter((g) => g[1] > lo && g[0] < hi)
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  let cursor = lo;
  for (const g of gaps) {
    if (g[0] > cursor + 1e-6) out.push({ orient, coord, a: cursor - (cursor === lo ? half : 0), b: g[0] });
    cursor = Math.max(cursor, g[1]);
  }
  if (hi > cursor + 1e-6) out.push({ orient, coord, a: cursor - (cursor === lo ? half : 0), b: hi + half });
  return out;
}

export function buildWallSegments(rooms = ROOMS) {
  const seen = new Set();
  const segments = [];
  const add = (seg) => {
    const key = `${seg.orient}|${seg.coord.toFixed(3)}|${seg.a.toFixed(3)}|${seg.b.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    segments.push(seg);
  };
  for (const { rect: [x1, z1, x2, z2] } of rooms) {
    splitEdge('h', z1, x1, x2).forEach(add);
    splitEdge('h', z2, x1, x2).forEach(add);
    splitEdge('v', x1, z1, z2).forEach(add);
    splitEdge('v', x2, z1, z2).forEach(add);
  }
  return segments;
}

export function wallToRect(seg) {
  const h = WALL_THICKNESS / 2;
  return seg.orient === 'h'
    ? { minX: seg.a, maxX: seg.b, minZ: seg.coord - h, maxZ: seg.coord + h }
    : { minX: seg.coord - h, maxX: seg.coord + h, minZ: seg.a, maxZ: seg.b };
}

export function propToRect(p) {
  const s = PROP_SPECS[p.type];
  return { minX: p.x - s.hx, maxX: p.x + s.hx, minZ: p.z - s.hz, maxZ: p.z + s.hz };
}

// Kolam (dua sisi jembatan) dan air mancur menghalangi jalan.
const FIXED_COLLIDERS = Object.freeze([
  { minX: -7, maxX: -1.5, minZ: 2, maxZ: 16 },
  { minX: 1.5, maxX: 7, minZ: 2, maxZ: 16 },
  { minX: -2.4, maxX: 2.4, minZ: 25.6, maxZ: 30.4 },
]);

export function resolveMove(pos, radius, colliders, bounds = BOUNDS) {
  let x = Math.min(bounds.maxX - radius, Math.max(bounds.minX + radius, pos.x));
  let z = Math.min(bounds.maxZ - radius, Math.max(bounds.minZ + radius, pos.z));
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const c of colliders) {
      const cx = Math.min(c.maxX, Math.max(c.minX, x));
      const cz = Math.min(c.maxZ, Math.max(c.minZ, z));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      moved = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x += (dx / d) * (radius - d);
        z += (dz / d) * (radius - d);
      } else {
        // pusat berada di dalam kotak: dorong keluar lewat sisi terdekat
        const left = x - c.minX;
        const right = c.maxX - x;
        const up = z - c.minZ;
        const down = c.maxZ - z;
        const m = Math.min(left, right, up, down);
        if (m === left) x = c.minX - radius;
        else if (m === right) x = c.maxX + radius;
        else if (m === up) z = c.minZ - radius;
        else z = c.maxZ + radius;
      }
    }
    if (!moved) break;
    x = Math.min(bounds.maxX - radius, Math.max(bounds.minX + radius, x));
    z = Math.min(bounds.maxZ - radius, Math.max(bounds.minZ + radius, z));
  }
  return { x, z };
}

export function moveWithCollisions(pos, dx, dz, radius, colliders, bounds = BOUNDS, maxStep = 0.1) {
  const len = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(len / maxStep));
  let cur = { x: pos.x, z: pos.z };
  for (let i = 0; i < steps; i++) {
    cur = resolveMove({ x: cur.x + dx / steps, z: cur.z + dz / steps }, radius, colliders, bounds);
  }
  return cur;
}

export function isWalkable(x, z, radius, colliders, bounds = BOUNDS) {
  if (x < bounds.minX + radius || x > bounds.maxX - radius || z < bounds.minZ + radius || z > bounds.maxZ - radius) return false;
  for (const c of colliders) {
    const cx = Math.min(c.maxX, Math.max(c.minX, x));
    const cz = Math.min(c.maxZ, Math.max(c.minZ, z));
    if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius - 1e-9) return false;
  }
  return true;
}

const inRect = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];

export function roomAt(x, z) {
  const room = ROOMS.find((r) => inRect(r.rect, x, z));
  if (room) return { id: room.id, name: room.name, kind: room.kind, indoor: true };
  const zone = ZONES.find((r) => inRect(r.rect, x, z));
  if (zone) return { id: zone.id, name: zone.name, kind: zone.kind, indoor: false };
  return { id: 'grounds', name: 'Villa Grounds', kind: 'grounds', indoor: false };
}

let cached = null;
export function getVillaWorld() {
  if (cached) return cached;
  const walls = buildWallSegments();
  const props = buildProps();
  const colliders = [...walls.map(wallToRect), ...props.map(propToRect), ...FIXED_COLLIDERS];
  cached = Object.freeze({
    name: 'nikora-villa',
    bounds: BOUNDS,
    spawn: SPAWN,
    radius: PLAYER_RADIUS,
    rooms: ROOMS,
    zones: ZONES,
    doors: DOORS,
    walls,
    props,
    spots: buildSpots(props),
    sitRange: SIT_RANGE,
    colliders,
    constrain: (pos) => resolveMove(pos, PLAYER_RADIUS, colliders, BOUNDS),
    move: (pos, dx, dz) => moveWithCollisions(pos, dx, dz, PLAYER_RADIUS, colliders, BOUNDS),
  });
  return cached;
}
