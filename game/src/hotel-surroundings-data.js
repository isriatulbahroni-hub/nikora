// Sekitar NIKORA Grand Hotel: menara satelit, kota mid-rise, arena berkubah dengan lapangan, dan hutan kota.
// Murni data + matematika (tanpa THREE); gambar 3D ada di hotel-surroundings.js. Satuan meter, bingkai koordinat hotel
// (x ke timur, z ke selatan, utara = -z). Semua deterministik (seed tetap) dan berada DI LUAR Lingkar NIKORA, jalan raya, dan
// gerbang, jadi tidak menimpa jalan, tapak hotel, atau halaman drop-off. Hanya tampilan: belum ada penghalang bagi pemain/mobil.
import { GATES, HIGHWAY_HALF, HIGHWAY_SEGMENTS, RING } from './highway.js';
import { TOWER_CENTER } from './hotel-layout.js';

export const TILE_HEIGHT = 7.2; // dua lantai kota (3,6 m) = satu ulangan tekstur jendela
export const CITY_HEIGHTS = Object.freeze([36, 57.6, 79.2, 108, 144, 187.2, 244.8]); // semuanya kelipatan TILE_HEIGHT
export const CITY_TINTS = Object.freeze([0xffffff, 0xe9dcc8, 0xbcd6ea, 0xd2dbe0, 0xd9cbb3, 0xa8c4d8]); // pengali warna fasad per gedung
export const SURROUND_BOUNDS = Object.freeze({ minX: -480, maxX: 480, minZ: 200, maxZ: 880 }); // area kota (gerbang villa di z=100, gerbang aula/royal di x=±520, masjid di z=916)
/** Tepi luar aspal Lingkar NIKORA; seluruh persegi ini (aspal + tapak hotel di dalamnya) tidak boleh ditempati apa pun. */
export const RING_OUTER = Object.freeze([RING.minX - HIGHWAY_HALF, RING.minZ - HIGHWAY_HALF, RING.maxX + HIGHWAY_HALF, RING.maxZ + HIGHWAY_HALF]);
/** Sabuk lapang di luar Lingkar: tanpa gedung kota (hanya pohon), supaya menara tidak terhimpit gedung-gedung yang menempel di tepi jalan. */
export const RING_BUFFER = 75;
/** Tinggi gedung dibatasi menurut jarak dari Lingkar: dekat Lingkar rendah (<= 79,2 m), baru ke luar boleh menjulang. */
export const NEAR_RING_LIMITS = Object.freeze([{ within: 150, maxBucket: 2 }, { within: 260, maxBucket: 4 }]);
/** Jarak (m) dari titik ke persegi luar Lingkar; 0 bila di dalamnya. */
export const ringDistance = (x, z) => Math.hypot(Math.max(RING_OUTER[0] - x, 0, x - RING_OUTER[2]), Math.max(RING_OUTER[1] - z, 0, z - RING_OUTER[3]));

const sat = (id, x, z, radius, height) => Object.freeze({ id, x, z, radius, height, taper: 0.78, sides: 12 });
/**
 * Lima menara satelit kaca berfaset (12 sisi, meruncing): menara pendamping seperti pada gambar acuan (menara utama dikelilingi menara
 * yang sekitar separuh tingginya). Ruang di dalam Lingkar penuh (tapak hotel, parkir, lagoon, Royal Garage), jadi menara berdiri tepat
 * di luar Lingkar, di antara lengan jalan ke aula/royal (z 427..469) dan masjid (x -21..21): dua di sisi timur, satu di barat laut,
 * dua di selatan. Tinggi 1500..2300 m = 35..55% menara utama (4195 m); jarak ke tengah hotel 190..290 m.
 */
export const SATELLITES = Object.freeze([
  sat('sat_barat_laut', -255, 365, 38, 2300),
  sat('sat_timur_laut', 255, 365, 36, 1900),
  sat('sat_tenggara', 255, 545, 38, 2100),
  sat('sat_selatan', 110, 665, 34, 1500),
  sat('sat_barat_daya', -120, 665, 36, 1700),
]);
/** Arena berkubah di barat daya hotel; `plaza` = jari-jari paving di sekelilingnya. */
export const ARENA = Object.freeze({ x: -290, z: 640, radius: 52, wallHeight: 14, domeHeight: 22, plaza: 70 });
/** Lapangan rumput bergaris di antara lengan jalan ke aula dan arena (persegi panjang sejajar sumbu). */
export const FIELD = Object.freeze({ x: -300, z: 528, width: 105, depth: 68 });

const rectOf = (x, z, hw, hd) => [x - hw, z - hd, x + hw, z + hd];
const overlaps = (a, b, m = 0) => a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Zona terlarang: aspal jalan raya (+ ruang bernapas), seluruh Lingkar, gerbang, dan lapangan; lingkaran: satelit dan paving arena.
const BLOCKS = Object.freeze([
  ...HIGHWAY_SEGMENTS.map((s) => ({ rect: s.rect, margin: 16 })),
  { rect: RING_OUTER, margin: 22 },
  ...GATES.map((g) => ({ rect: g.rect, margin: 40 })),
  { rect: rectOf(FIELD.x, FIELD.z, FIELD.width / 2, FIELD.depth / 2), margin: 14 },
]);
const CIRCLES = Object.freeze([...SATELLITES.map((s) => ({ x: s.x, z: s.z, r: s.radius + 26 })), { x: ARENA.x, z: ARENA.z, r: ARENA.plaza + 12 }]);

const circleHitsRect = (c, r, m) => {
  const nx = clamp(c.x, r[0], r[2]);
  const nz = clamp(c.z, r[1], r[3]);
  return Math.hypot(c.x - nx, c.z - nz) < c.r + m;
};

/** Apakah persegi [minX, minZ, maxX, maxZ] bebas dari jalan, Lingkar, gerbang, lapangan, satelit, dan arena (ditambah `extra` meter). */
export function isClear(rect, extra = 0) {
  if (BLOCKS.some((b) => overlaps(rect, b.rect, b.margin + extra))) return false;
  return !CIRCLES.some((c) => circleHitsRect(c, rect, extra));
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

const CELL = 40; // sel kota; gedung 16..28 m dengan geseran ±4 m sehingga antar gedung selalu ada celah >= 4 m
let cityCache = null;
/**
 * Gedung kota: {x, z, w, d, bucket, height, tint}. Tinggi naik ke arah menara hotel (36 m di pinggir kota), tetapi tidak menempel di Lingkar:
 * dalam RING_BUFFER (75 m) dari Lingkar tidak ada gedung, dan sampai 150 m dari Lingkar gedung dibatasi <= 79,2 m (NEAR_RING_LIMITS),
 * jadi menara tetap terlihat dari jalan. Sel yang menimpa jalan, Lingkar, gerbang, satelit, arena, atau lapangan dilewati; 16% sel sengaja
 * kosong (taman), dan makin dekat Lingkar makin banyak yang kosong (sampai 50%).
 */
export function cityBuildings() {
  if (cityCache) return cityCache;
  const rand = mulberry32(2026);
  const out = [];
  for (let gz = SURROUND_BOUNDS.minZ; gz < SURROUND_BOUNDS.maxZ; gz += CELL) {
    for (let gx = SURROUND_BOUNDS.minX; gx < SURROUND_BOUNDS.maxX; gx += CELL) {
      // semua angka acak diambil dulu supaya urutan deretnya tetap walau sebuah sel dilewati
      const w = 16 + rand() * 12;
      const d = 16 + rand() * 12;
      const jx = (rand() - 0.5) * 8;
      const jz = (rand() - 0.5) * 8;
      const pickEmpty = rand();
      const pickH = rand();
      const pickTint = rand();
      const x = gx + CELL / 2 + jx;
      const z = gz + CELL / 2 + jz;
      const rect = rectOf(x, z, w / 2, d / 2);
      const dRing = ringDistance(x, z);
      const emptyP = 0.16 + 0.34 * clamp(1 - (dRing - RING_BUFFER) / 125, 0, 1);
      if (pickEmpty < emptyP || overlaps(rect, RING_OUTER, RING_BUFFER) || !isClear(rect)) continue;
      const near = clamp(1 - (Math.hypot(x - TOWER_CENTER.x, z - TOWER_CENTER.z) - 200) / 400, 0, 1);
      const maxBucket = NEAR_RING_LIMITS.find((l) => dRing < l.within)?.maxBucket ?? CITY_HEIGHTS.length - 1;
      const bucket = clamp(Math.round(near * 4 + pickH * 2.2), 0, maxBucket);
      out.push(Object.freeze({ x, z, w, d, bucket, height: CITY_HEIGHTS[bucket], tint: Math.floor(pickTint * CITY_TINTS.length) }));
    }
  }
  cityCache = Object.freeze(out);
  return cityCache;
}

/**
 * Saklar gedung kota mid-rise. Dimatikan (false) atas permintaan pemilik: gedung-gedung itu dinilai jelek dan merusak pandangan ke menara.
 * Generator `cityBuildings()` di atas sengaja dibiarkan utuh; ubah ke true untuk memunculkan kota itu lagi (gambar dan penghalang tabrakan ikut kembali).
 */
export const CITY_ENABLED = false;
/** Gedung kota yang benar-benar dipakai (digambar dan jadi penghalang): kosong selama CITY_ENABLED = false. */
export const visibleCityBuildings = () => (CITY_ENABLED ? cityBuildings() : Object.freeze([]));

const NEAR_BOX = Object.freeze({ minX: -360, maxX: 360, minZ: 190, maxZ: 760 }); // pita pohon rapat di sekitar Lingkar
const FAR_BOX = Object.freeze({ minX: -540, maxX: 540, minZ: 150, maxZ: 900 });
let forestCache = null;
/** Pohon hutan kota: {x, z, trunk, crown, tone}. Hanya di sela jalan, gedung, satelit, arena, dan lapangan; yang dekat Lingkar didahulukan. */
export function forestTrees() {
  if (forestCache) return forestCache;
  const rand = mulberry32(77);
  const buildings = cityBuildings().map((b) => rectOf(b.x, b.z, b.w / 2, b.d / 2));
  const out = [];
  const scatter = (box, want) => {
    let n = 0;
    for (let i = 0; i < want * 14 && n < want; i++) {
      const x = box.minX + rand() * (box.maxX - box.minX);
      const z = box.minZ + rand() * (box.maxZ - box.minZ);
      const crown = 3 + rand() * 2.4;
      const trunk = 2.2 + rand() * 1.6;
      const tone = Math.floor(rand() * 5);
      const foot = rectOf(x, z, crown, crown);
      if (!isClear(foot, 4) || buildings.some((b) => overlaps(b, foot, 3))) continue;
      out.push(Object.freeze({ x, z, trunk, crown, tone }));
      n++;
    }
  };
  scatter(NEAR_BOX, 260);
  scatter(FAR_BOX, 320);
  forestCache = Object.freeze(out);
  return forestCache;
}
