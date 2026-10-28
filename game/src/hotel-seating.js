// Duduk dan tidur di perabot hotel (data murni, tanpa THREE). Terpisah dari sistem villa (villa-layout.js: spots, spotPose):
// tiap jenis perabot punya ukuran dudukan/kasurnya sendiri, jadi panggul tepat di atas permukaan dan kaki menapak lantai,
// bukan satu "turun 0,3 m" untuk semua.
//
// Kerangka lokal perabot sama dengan hotel-props.js: depan = +z, kanan-kiri = x, kepala tempat tidur di sisi -z.
// Putaran ry (hotel-furnish.js, FACE): titik lokal (lx, lz) -> dunia (x + lx*cos + lz*sin, z - lx*sin + lz*cos).
// Avatar (avatar.js): depan = -z, rotation.y = ry + PI membuat avatar menghadap ke depan perabot.
//
// Titik dibuat per lantai dari levelData.props (lazy, dicache): seribu lantai tidak dihitung sekaligus.
// Id titik = SPOT_BASE + lantai * SPOTS_PER_LEVEL + indeks, bilangan bulat (dikirim lewat kolom `sit` jaringan);
// id kursi mobil hotel < SPOT_BASE.

export const SPOT_BASE = 100_000;
export const SPOTS_PER_LEVEL = 8192; // bioskop lantai podium bisa ribuan kursi
export const LEVEL_COUNT = 1000;
export const LEVEL_HEIGHT = 4.2; // = HOTEL_LEVEL_HEIGHT (hotel-layout.js); dijaga tes

// Ukuran avatar sederhana (avatar.js): pinggul 0,82 m, paha 0,4, betis 0,38, setengah tebal sepatu 0,04, pusat kepala 1,55.
export const AVATAR = Object.freeze({ hipY: 0.82, thigh: 0.4, shank: 0.38, sole: 0.04, headY: 1.55 });

// Semua angka yang mungkin perlu disetel setelah dilihat di layar ada di sini.
export const TUNING = Object.freeze({
  // y asal avatar saat duduk = permukaan - humanSitDrop. Dari kalibrasi villa: permukaan 0,545 -> y -0,3 (rig manusia: tulang pinggul
  // sekitar 9 cm di atas dasar bokong).
  humanSitDrop: 0.845,
  // avatar sederhana: seluruh badan diangkat sekian agar sendi paha tepat di atas permukaan (userData.seatLift di avatar.js)
  simpleLift: 0.1,
  hipRadius: 0.075, // jari-jari paha: sendi paha = permukaan + ini
  lieHalfThick: 0.13, // setengah tebal badan: sumbu badan berbaring = permukaan + ini
  pelvisDepth: 0.17, // pusat panggul ke depan sandaran
  legMin: 0.5,
  legMax: 1.5,
  sitReach: 1.5, // jarak maksimum ke titik duduk (m)
  sleepReach: 2.1, // jarak maksimum ke titik tidur (m): kasur lebar, berdiri di sisinya
  behindTolerance: -0.25, // kursi bersandaran tidak bisa dipakai dari belakangnya
});
const T = TUNING;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;

/** Titik lokal perabot (lx, lz) -> dunia. */
export function toWorld(p, lx, lz) {
  const ry = p.ry ?? 0;
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
}

/** Sudut kaki avatar sederhana supaya telapak menapak lantai bila sendi paha setinggi `top + hipRadius`. */
export function sitLegs(top) {
  const hip = top + T.hipRadius;
  const c = (hip - (AVATAR.shank + AVATAR.sole)) / AVATAR.thigh;
  const theta = clamp(Math.acos(clamp(c, -1, 1)), T.legMin, T.legMax);
  return { hip: theta, knee: -theta, spread: 0.08 };
}

// ---------------------------------------------------------------- katalog
// Ukuran dibaca dari bagian kotak di hotel-props.js (permukaan atas dudukan/kasur, sisi depan sandaran).
const sit = (top, back, xs, extra = {}) => ({ kind: 'sit', top, back, xs, ...extra });
const lie = (top, headLz, xs, half) => ({ kind: 'sleep', top, headLz, xs, half });

export const SEAT_SPECS = Object.freeze({
  sofa: () => sit(0.6, -0.28, [-0.5, 0.5]), // bantalan atas 0,6; sandaran depan -0,28; dua tempat
  armchair: () => sit(0.6, -0.26, [0]),
  chair: () => sit(0.48, -0.185, [0]),
  stool: () => sit(0.65, null, [0], { lz: 0 }), // tanpa sandaran
  pew: () => sit(0.49, -0.2, [-0.62, 0, 0.62]), // bangku 2 m: tiga orang
  cinema_seat: () => sit(0.53, -0.18, [0]),
  salon_chair: () => sit(0.51, -0.2, [0]),
  sauna_bench: (p) => {
    const w = p.w ?? 6;
    const d = p.d ?? 0.7;
    const n = clamp(Math.floor(w / 0.75), 1, 8);
    return sit(0.48, -d / 2, Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * 0.75)); // punggung ke dinding
  },
  bed: () => lie(0.74, -0.78, [-0.46, 0.46], { hx: 0.95, hz: 1.1 }), // selimut 0,74; kepala di bantal (z -0,78); dua orang, tiap bantal satu
  bed_s: (p) => {
    const w = p.w ?? 1.6;
    return lie(0.67, -0.75, w >= 1.4 ? [-w / 4, w / 4] : [0], { hx: w / 2, hz: 1.1 });
  },
  massage_bed: () => lie(0.5, -0.8, [0], { hx: 0.45, hz: 1.0 }),
  lounger: () => lie(0.36, -0.55, [0], { hx: 0.35, hz: 0.95 }),
});

function sitPose(p, spec, lx, lz, base) {
  const w = toWorld(p, lx, lz);
  return { x: w.x, z: w.z, y: base + spec.top - T.humanSitDrop, rotY: wrap((p.ry ?? 0) + Math.PI), tilt: 0, legs: sitLegs(spec.top), lift: T.simpleLift };
}

function sleepPose(p, spec, lx, base) {
  const feet = toWorld(p, lx, spec.headLz + AVATAR.headY); // asal avatar (telapak) = pusat kepala + 1,55 m ke arah kaki (+z lokal)
  return { x: feet.x, z: feet.z, y: base + spec.top + T.lieHalfThick, rotY: wrap((p.ry ?? 0) + Math.PI), tilt: Math.PI / 2, legs: null, lift: 0 };
}

// Tempat berdiri setelah bangun, berurutan dari yang paling wajar. Duduk: cincin di sekeliling kursi (depan dulu, lalu serong, samping,
// belakang) dengan jari-jari makin lebar, supaya kursi yang terjepit meja kopi atau lemari tetap punya jalan keluar. Tidur: di sisi
// kasur sendiri, ujung kaki, lalu sisi seberang.
const RING_RADII = [0.85, 1.15, 1.5];
const BED_RING = [1.57, -1.57, 0.8, -0.8, 2.3, -2.3, 0, Math.PI, 1.2, -1.2, 1.9, -1.9];
const RING_ANGLES = [0, 0.5, -0.5, 1.0, -1.0, 1.57, -1.57, 2.1, -2.1, 2.6, -2.6, Math.PI]; // rad dari depan perabot (+z lokal)
function exitsOf(p, spec, lx, lz) {
  const out = [];
  if (spec.kind === 'sit') {
    for (const r of RING_RADII) for (const a of RING_ANGLES) out.push(toWorld(p, lx + Math.sin(a) * r, lz + Math.cos(a) * r));
  } else {
    const side = lx < 0 ? -1 : lx > 0 ? 1 : 0;
    const mid = spec.headLz + 0.9;
    const sides = side === 0 ? [-1, 1] : [side, -side];
    for (const s of sides) out.push(toWorld(p, s * (spec.half.hx + 0.5), mid));
    out.push(toWorld(p, lx, spec.half.hz + 0.55));
    for (const s of sides) out.push(toWorld(p, s * (spec.half.hx + 0.9), spec.headLz + 1.6));
    // kamar sempit di lantai atas: cincin lebar di sekeliling tengah badan (pemanggil menolak yang di luar ruang)
    for (const r of [1.3, 1.7, 2.1]) for (const a of BED_RING) out.push(toWorld(p, lx + Math.sin(a) * r, spec.headLz + 0.8 + Math.cos(a) * r));
  }
  return out;
}

/** Semua titik duduk/tidur satu perabot (id diisi pemanggil). */
export function spotsOfProp(p, level = p.level ?? 0) {
  const make = SEAT_SPECS[p.type];
  if (!make) return [];
  const spec = make(p);
  const base = level * LEVEL_HEIGHT;
  const fwd = { fx: Math.sin(p.ry ?? 0), fz: Math.cos(p.ry ?? 0) };
  return spec.xs.map((lx) => {
    if (spec.kind === 'sit') {
      const lz = spec.back == null ? spec.lz ?? 0 : spec.back + T.pelvisDepth;
      const pose = sitPose(p, spec, lx, lz, base);
      return { kind: 'sit', type: p.type, room: p.room ?? null, level, x: pose.x, z: pose.z, reach: T.sitReach, hasBack: spec.back != null, ...fwd, pose: Object.freeze(pose), exits: exitsOf(p, spec, lx, lz) };
    }
    const mid = toWorld(p, lx, spec.headLz + 0.8);
    const pose = sleepPose(p, spec, lx, base);
    return { kind: 'sleep', type: p.type, room: p.room ?? null, level, x: mid.x, z: mid.z, reach: T.sleepReach, hasBack: false, ...fwd, pose: Object.freeze(pose), exits: exitsOf(p, spec, lx, spec.headLz) };
  });
}

// ---------------------------------------------------------------- per lantai
const cache = new WeakMap();

/** { list, byRoom }: titik satu lantai (levelData dari getHotelWorld().levels[i]); indeks di list = bagian akhir id. */
export function spotsOfLevel(levelData) {
  let hit = cache.get(levelData);
  if (hit) return hit;
  const level = levelData.level ?? 0;
  const list = [];
  const byRoom = new Map();
  for (const p of levelData.props ?? []) {
    for (const s of spotsOfProp(p, level)) {
      if (list.length >= SPOTS_PER_LEVEL) break;
      const spot = Object.freeze({ ...s, id: SPOT_BASE + level * SPOTS_PER_LEVEL + list.length });
      list.push(spot);
      const key = spot.room ?? '';
      if (!byRoom.has(key)) byRoom.set(key, []);
      byRoom.get(key).push(spot);
    }
  }
  hit = Object.freeze({ list, byRoom });
  cache.set(levelData, hit);
  return hit;
}

/** Titik di satu ruang (daftar kosong bila tidak ada). */
export function spotsInRoom(levelData, roomId) {
  return spotsOfLevel(levelData).byRoom.get(roomId ?? '') ?? [];
}

export const isSpotId = (id) => Number.isInteger(id) && id >= SPOT_BASE;

/** Titik dari id jaringan; levelOf(level) = levelData lantai itu (getHotelWorld().levels[level]). */
export function spotById(id, levelOf) {
  if (!isSpotId(id)) return null;
  const n = id - SPOT_BASE;
  const level = Math.floor(n / SPOTS_PER_LEVEL);
  if (level >= LEVEL_COUNT) return null;
  const data = levelOf(level);
  return data ? spotsOfLevel(data).list[n % SPOTS_PER_LEVEL] ?? null : null;
}

export const poseOfSpot = (spot) => spot.pose;
export const seatLabel = (spot) => (spot.kind === 'sleep' ? 'Tidur' : 'Duduk');

/**
 * Titik terdekat yang kosong dan boleh dipakai: lantai dan ruang yang sama (dinding tidak ditembus), dalam jangkauan,
 * dan kursi bersandaran tidak dipakai dari belakangnya. pos = { x, z, level, room }.
 */
export function findNearestSpot(pos, spots, occupied = new Set()) {
  let best = null;
  let bestD = Infinity;
  for (const s of spots) {
    if (occupied.has(s.id) || s.level !== pos.level) continue;
    if (pos.room != null && s.room !== pos.room) continue;
    const dx = pos.x - s.x;
    const dz = pos.z - s.z;
    const d = Math.hypot(dx, dz);
    if (d > s.reach) continue;
    if (s.hasBack && d > 1e-6 && (dx * s.fx + dz * s.fz) / d < T.behindTolerance) continue;
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** Tempat berdiri setelah bangun: kandidat pertama yang boleh diinjak (canStand(x, z)); bila semua penuh, yang pertama. */
export function standPoint(spot, canStand) {
  for (const e of spot.exits) if (canStand(e.x, e.z)) return e;
  return spot.exits[0];
}
