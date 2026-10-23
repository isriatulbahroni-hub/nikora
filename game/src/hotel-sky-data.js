// Data dan hitungan murni (tanpa THREE) untuk langit, cahaya, dan lampu NIKORA Grand Hotel. Dipakai hotel-sky.js dan bisa diuji.
// Fase langit (day-night.js): -1 = siang penuh, 0 = senja keemasan, +1 = malam penuh.
import { GATES, HIGHWAY_HALF, leftOf } from './highway.js';
import {
  HOTEL_BUILDING, HOTEL_CANOPY, HOTEL_FOUNTAIN, HOTEL_LEVEL_COUNT, HOTEL_LEVEL_HEIGHT, HOTEL_TOP_LEVEL, HOTEL_TOP_Y, PODIUM_LEVELS, TOWER_HALF,
  hotelFootprint, hotelLevelY, isGuestLevel, isSkyLobbyLevel,
} from './hotel-layout.js';
import { crownSpec } from './hotel-tower-shape.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------- token langit (sRGB 0..1)
// dir = arah cahaya (matahari, lalu bulan saat malam)  skyDir = posisi matahari pada kubah langit (di bawah horizon saat malam)
// fog = warna kabut SEKALIGUS warna horizon kubah, supaya tanah yang memudar di kejauhan menyatu mulus dengan langit.
// zenith/mid = warna puncak langit dan langit tengah. fogNear/fogFar luas supaya menara 4,2 km terlihat dari jauh.
export const SKY_FRAMES = Object.freeze({
  day: {
    dir: [0.44, 0.84, 0.32], skyDir: [0.44, 0.84, 0.32], sunColor: [1, 0.925, 0.796], sunI: 1.3, hemiSky: [0.86, 0.92, 1], hemiGround: [0.48, 0.42, 0.33], hemiI: 1.0,
    fog: [0.78, 0.88, 0.96], fogNear: 420, fogFar: 3400, exposure: 1, zenith: [0.1, 0.33, 0.74], mid: [0.3, 0.58, 0.92],
    cloudLit: [1, 1, 1], cloudShade: [0.62, 0.7, 0.8], cloudCover: 0.5,
  },
  sunset: {
    dir: [0.9, 0.12, 0.35], skyDir: [0.9, 0.035, 0.35], sunColor: [1, 0.62, 0.32], sunI: 1.0, hemiSky: [1, 0.78, 0.62], hemiGround: [0.4, 0.33, 0.3], hemiI: 0.9,
    fog: [0.93, 0.62, 0.45], fogNear: 300, fogFar: 3000, exposure: 1, zenith: [0.13, 0.19, 0.46], mid: [0.72, 0.4, 0.46],
    cloudLit: [1, 0.7, 0.45], cloudShade: [0.42, 0.3, 0.42], cloudCover: 0.62,
  },
  night: {
    dir: [-0.4, 0.7, -0.3], skyDir: [0.9, -0.3, 0.35], sunColor: [0.5, 0.62, 1], sunI: 0.45, hemiSky: [0.3, 0.38, 0.7], hemiGround: [0.07, 0.08, 0.13], hemiI: 0.55,
    fog: [0.035, 0.055, 0.13], fogNear: 240, fogFar: 2800, exposure: 1.15, zenith: [0.004, 0.01, 0.05], mid: [0.018, 0.036, 0.115],
    cloudLit: [0.42, 0.5, 0.72], cloudShade: [0.05, 0.07, 0.15], cloudCover: 0.46,
  },
});

// ---------------------------------------------------------------- tingkat menyala menurut fase (0..1)
/** Lampu jalan, lampu hias, dan lampu taman: menyala bertahap dari sore (fase -0,25) sampai penuh saat malam (fase 0,5). */
export const lampLevel = (phase) => clamp((phase + 0.25) / 0.75, 0, 1);
/** Jendela kamar: mulai menyala sesudah senja (fase 0,05), hampir semua lantai terisi saat malam (fase 0,8). */
export const windowLevel = (phase) => clamp((phase - 0.05) / 0.75, 0, 1);
/** Bintang dan bulan. */
export const nightLevel = (phase) => clamp((phase - 0.3) / 0.6, 0, 1);
/** Kekuatan pita senja di horizon: puncak tepat saat senja. */
export const sunsetLevel = (phase) => clamp(1 - Math.abs(phase), 0, 1);
/** Lampu peringatan penerbangan: pelan di siang hari, penuh di malam hari. */
export const beaconLevel = (phase) => 0.4 + 0.6 * lampLevel(phase);

// ---------------------------------------------------------------- ketinggian
export const EARTH_RADIUS = 6371000;
/** Sudut (radian) horizon turun di bawah garis mata pada ketinggian y meter. Di puncak menara (4,2 km) sekitar 2 derajat. */
export const horizonDip = (y) => Math.acos(EARTH_RADIUS / (EARTH_RADIUS + Math.max(0, y)));
/** 0 di tanah, 1 di puncak menara. */
export const altitudeLevel = (y) => clamp(y / HOTEL_TOP_Y, 0, 1);
/** Tinggi hamparan awan (m): di antara Sky Lobby 12 dan 13; menara menembusnya dan lantai atas berada di atas awan. */
export const CLOUD_ALTITUDE = 2300;

// ---------------------------------------------------------------- bentuk cangkang
/** Nama grup fasad kaca bertekstur di scene (hotel-facade.js). Selama ada, kulit luar menara berupa kotak penuh, tidak meruncing. */
export const FACADE_NAME = 'hotel-facade';
/**
 * Tapak tempat jendela dan sabuk lampu ditaruh. 'taper' = tapak tiap lantai (ikut meruncing, untuk kulit meruncing).
 * 'box' = kotak bangunan penuh untuk lantai yang tertutup fasad (lantai 4 sampai di bawah Sky Level), karena fasad bertekstur
 * menempel di kotak itu dan hampir buram; lampu yang diletakkan di dalamnya tertutup.
 */
export function shellFootprint(level, shell = 'taper') {
  if (shell === 'box' && level >= PODIUM_LEVELS && level < HOTEL_TOP_LEVEL) return HOTEL_BUILDING;
  return hotelFootprint(level);
}

// ---------------------------------------------------------------- jendela menara
// Satu titik cahaya per kamar (utara/selatan 26 per sisi, barat/timur 12 per sisi = GUESTS_PER_LEVEL). Jumlah ini harus sama
// dengan NS_ROOMS dan WE_ROOMS di hotel-layout.js; tes hotel-sky-data.test.js menjaganya.
export const WINDOW_FACES = Object.freeze({ ns: 26, we: 12 });
export const WINDOW_SIZE = 2.4; // m
const WING = 10; // lebar sayap barat/timur (sama dengan hotel-layout.js)
const WINDOW_OFFSET = 0.3; // tepat di luar tepi pelat
const WINDOW_HEIGHT = 2; // di atas lantai

/** 0 = lantai kamar tamu (menyala acak), 1 = lantai publik (podium, Sky Lobby, suite, Sky Level: menyala semua). */
export const windowKindOf = (level) => (isGuestLevel(level) ? 0 : 1);

/**
 * Posisi semua jendela 1000 lantai mengikuti tapak tiap lantai (lihat shellFootprint untuk dua bentuk cangkang).
 * kinds: 0 = kamar tamu, 1 = lantai publik, 2 = kamar tamu dengan cahaya televisi (kelap-kelip kebiruan, 8%).
 */
export function buildWindowLights({ shell = 'taper' } = {}) {
  const { ns, we } = WINDOW_FACES;
  const perLevel = 2 * ns + 2 * we;
  const total = HOTEL_LEVEL_COUNT * perLevel;
  const positions = new Float32Array(total * 3);
  const seeds = new Float32Array(total);
  const kinds = new Float32Array(total);
  let s = 20261022;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  let n = 0;
  const put = (x, y, z, kind) => {
    positions[n * 3] = x;
    positions[n * 3 + 1] = y;
    positions[n * 3 + 2] = z;
    seeds[n] = rand();
    kinds[n] = kind === 0 && rand() < 0.08 ? 2 : kind;
    n++;
  };
  for (let l = 0; l < HOTEL_LEVEL_COUNT; l++) {
    const fp = shellFootprint(l, shell);
    const y = hotelLevelY(l) + WINDOW_HEIGHT;
    const kind = windowKindOf(l);
    const w = fp[2] - fp[0];
    const scaleZ = (fp[3] - fp[1]) / (2 * TOWER_HALF.z);
    for (let i = 0; i < ns; i++) {
      const x = fp[0] + ((i + 0.5) * w) / ns;
      put(x, y, fp[1] - WINDOW_OFFSET, kind);
      put(x, y, fp[3] + WINDOW_OFFSET, kind);
    }
    const z0 = fp[1] + WING * scaleZ;
    const z1 = fp[3] - WING * scaleZ;
    for (let j = 0; j < we; j++) {
      const z = z0 + ((j + 0.5) * (z1 - z0)) / we;
      put(fp[0] - WINDOW_OFFSET, y, z, kind);
      put(fp[2] + WINDOW_OFFSET, y, z, kind);
    }
  }
  return { count: n, perLevel, positions, seeds, kinds };
}

// ---------------------------------------------------------------- sabuk emas Sky Lobby
export const BELT_STEP = 3; // m antar lampu
/** Untaian lampu emas mengelilingi tiap Sky Lobby (di atas jendela). Larik datar x,y,z. */
export function buildBeltLights({ shell = 'taper' } = {}) {
  const out = [];
  for (let l = 0; l < HOTEL_LEVEL_COUNT; l++) {
    if (!isSkyLobbyLevel(l)) continue;
    const fp = shellFootprint(l, shell);
    const e = 0.9;
    const y = hotelLevelY(l) + HOTEL_LEVEL_HEIGHT - 0.6;
    const x0 = fp[0] - e;
    const x1 = fp[2] + e;
    const z0 = fp[1] - e;
    const z1 = fp[3] + e;
    for (let x = x0; x <= x1 + 1e-6; x += BELT_STEP) out.push(x, y, z0, x, y, z1);
    for (let z = z0 + BELT_STEP; z < z1 - 1e-6; z += BELT_STEP) out.push(x0, y, z, x1, y, z);
  }
  return Float32Array.from(out);
}

// ---------------------------------------------------------------- mahkota atap
const CROWN = crownSpec();
/** Ujung jarum puncak bawaan hotel-tower-view.js (dipakai bila jarum tidak ditemukan di scene). */
export const MAST_TIP = Object.freeze({ x: CROWN.needle.x, y: CROWN.tipY, z: CROWN.needle.z });
/** Lampu peringatan penerbangan: empat sudut cincin tengah mahkota (di atas atap) dan ujung jarum. Larik [x, y, z]. */
export function beaconSpots(tip = MAST_TIP) {
  const ring = CROWN.rings[1];
  const corners = [1, 3, 5, 7].map((i) => [ring.pts[i][0], ring.y + 0.5, ring.pts[i][1]]);
  return [...corners, [tip.x, tip.y, tip.z]];
}
/** Lampu pinggir helipad: `n` titik melingkar. Larik datar x,y,z. */
export function helipadLights(center, radius = 9.6, n = 24) {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out[i * 3] = center.x + Math.cos(a) * radius;
    out[i * 3 + 1] = center.y + 0.25;
    out[i * 3 + 2] = center.z + Math.sin(a) * radius;
  }
  return out;
}

// ---------------------------------------------------------------- lampu halaman
export const GROUND_LAMP_HEIGHT = 7.5;
/** Tiang lampu baru di drop-off dan parkir (jalan raya sudah punya lampu sendiri di highway-world.js). */
export function groundLampSpots() {
  return [[-24, 392], [24, 392], [-24, 418], [24, 418], [64, 398], [64, 424], [64, 450], [92, 398], [92, 424], [92, 450]].map(([x, z]) => ({ x, z }));
}
export const FOUNTAIN_LIGHT = Object.freeze({ x: HOTEL_FOUNTAIN.x, y: 2.9, z: HOTEL_FOUNTAIN.z });
/** Lampu di bawah kanopi drop-off. Larik datar x,y,z. */
export function canopyLights() {
  const r = HOTEL_CANOPY.rect;
  const y = HOTEL_CANOPY.height - 0.4;
  const out = [];
  for (const x of [-12, -6, 0, 6, 12]) for (const z of [r[1] + 4, r[3] - 4]) out.push(x, y, z);
  return Float32Array.from(out);
}
/** Untaian lampu di bawah balok lengkung tiap gerbang tempat acara. Larik datar x,y,z. */
export function gateLights() {
  const T = HIGHWAY_HALF + 2.5;
  const out = [];
  for (const g of GATES) {
    const left = leftOf(g.heading);
    for (let t = -T; t <= T + 1e-6; t += 3) out.push(g.x + left.x * t, 13.6, g.z + left.z * t);
  }
  return Float32Array.from(out);
}
