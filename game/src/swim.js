// Logika murni berenang di kolam NIKORA (tanpa THREE, diuji dengan `node --test`).
// Satuan meter dan detik; x ke timur, z ke selatan, y ke atas. Berlaku di semua kolam yang terdaftar di SWIM_POOLS (sekarang: Kolam Lagoon).
//
// Mode (status badan di air):
//   null    : di darat (dek, dermaga)
//   wade    : berjalan di air dangkal (kedalaman <= WADE_DEPTH), kaki menapak dasar; lambat
//   tread   : tegak mengayuh di air dalam (diam)
//   crawl   : berenang gaya bebas di permukaan (bergerak)
//   float   : mengapung telentang di permukaan
//   dive    : menyelam (tahan tombol Selam): badan tengkurap turun sampai dekat dasar; lepas = naik lagi
//   bathe   : mandi di air dangkal (menggosok badan), hanya saat diam di air dangkal
// Nama gerak jaringan (kolom pose LiveKit, ^[a-z_]{1,16}$): lihat SWIM_POSE_NAME. wade memakai animasi jalan biasa (tanpa nama).
import { STAND } from './masjid-posture-data.js';
import { LAGOON_POOL, inPoolWater, lagoonFloorY } from './hotel-lagoon-data.js';

export const HIP_REF = 0.82; // tinggi panggul avatar sederhana (m); panggul model manusia dikoreksi di swim-pose.js
export const WADE_DEPTH = 1.05; // air sedalam ini atau kurang: berjalan di air
export const DIVE_CLEARANCE = 0.45; // jarak panggul dari dasar saat menyelam paling dalam
export const SPEED_MUL = Object.freeze({ wade: 0.55, tread: 0, crawl: 0.7, float: 0.25, dive: 0.5, bathe: 0 }); // pengali kecepatan jalan

/** Kolam yang bisa dipakai berenang. contains(x, z) = titik di atas air kolam (bukan dermaga). */
export const SWIM_POOLS = Object.freeze([
  Object.freeze({ id: 'lagoon', waterY: LAGOON_POOL.waterY, contains: inPoolWater, floorAt: lagoonFloorY }),
]);

/** Kolam di (x, z) beserta kedalaman air di titik itu, atau null bila di darat. */
export function poolAt(x, z) {
  for (const pool of SWIM_POOLS) {
    if (!pool.contains(x, z)) continue;
    const floorY = pool.floorAt(x, z);
    return { id: pool.id, waterY: pool.waterY, floorY, depth: pool.waterY - floorY };
  }
  return null;
}

// Nama gerak yang disiarkan ke pemain lain (satu kata per gerak, hanya huruf kecil dan garis bawah).
export const SWIM_POSE_NAME = Object.freeze({ tread: 'tegak_air', crawl: 'renang', float: 'mengapung', dive: 'selam', bathe: 'mandi' });
const NAME_TO_MODE = Object.freeze(Object.fromEntries(Object.entries(SWIM_POSE_NAME).map(([m, n]) => [n, m])));
export const isSwimPose = (name) => typeof name === 'string' && Object.hasOwn(NAME_TO_MODE, name);

/** Tinggi panggul (m, dari permukaan air) menurut mode di air dalam. */
const HIP_BELOW_SURFACE = Object.freeze({ tread: 0.55, crawl: 0.06, float: 0.1 });

export function createSwimmer() {
  return { mode: null, active: false, hipY: HIP_REF, dive: 0, bathing: false, floating: false, ripple: 0, ripples: 0 };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (rate, dt) => 1 - Math.exp(-rate * Math.max(0, dt));

/**
 * Satu langkah berenang. `in`: { x, z, groundY (tinggi tanah di darat), moving, dive (tombol Selam ditahan), dt }.
 * Mengubah `st` dan mengembalikan:
 *   active   : true selama pemain di air atau masih naik ke tepi (pemanggil menimpa me.y dengan `y`)
 *   mode     : mode sekarang (null di darat)
 *   y        : tinggi kaki nominal (panggul - HIP_REF); di darat = groundY
 *   pose     : nama gerak jaringan, atau null (berjalan biasa / berdiri)
 *   speedMul : pengali kecepatan jalan
 *   entered / exited : true tepat pada frame masuk / keluar air
 *   splash   : { x, z, strength 0..1 } saat masuk air, atau null
 *   ripple   : true bila saat ini waktunya satu riak baru
 *   depth, waterY : data kolam di titik itu (depth 0 di darat)
 */
export function stepSwimmer(st, { x, z, groundY = 0, moving = false, dive = false, dt = 1 / 60 }) {
  const pool = poolAt(x, z);
  const out = { active: false, mode: null, y: groundY, pose: null, speedMul: 1, entered: false, exited: false, splash: null, ripple: false, depth: 0, waterY: 0 };
  const groundHip = groundY + HIP_REF;

  if (!pool) {
    // di darat: bila baru keluar dari air, naik halus ke tinggi tanah
    st.dive = 0;
    st.bathing = false;
    st.floating = false;
    if (st.mode !== null) {
      st.mode = null;
      out.exited = true;
    }
    if (st.active) {
      st.hipY += (groundHip - st.hipY) * ease(12, dt);
      if (Math.abs(groundHip - st.hipY) < 0.01) {
        st.hipY = groundHip;
        st.active = false;
      }
    } else st.hipY = groundHip;
    out.active = st.active;
    out.y = st.hipY - HIP_REF;
    return out;
  }

  out.depth = pool.depth;
  out.waterY = pool.waterY;
  const wasMode = st.mode;
  let mode;
  if (pool.depth <= WADE_DEPTH) {
    // air dangkal: kaki di dasar; mandi hanya bila diam
    if (moving) st.bathing = false;
    mode = st.bathing ? 'bathe' : 'wade';
    st.floating = false;
    st.dive = Math.max(0, st.dive - 2 * dt);
  } else {
    st.bathing = false;
    if (moving) st.floating = false;
    if (dive) {
      mode = 'dive';
      const max = Math.max(0, pool.depth - DIVE_CLEARANCE - HIP_BELOW_SURFACE.crawl);
      st.dive = clamp(st.dive + 1.25 * dt, 0, max);
    } else {
      st.dive = Math.max(0, st.dive - 1.6 * dt);
      mode = st.dive > 0.12 ? 'dive' : moving ? 'crawl' : st.floating ? 'float' : 'tread'; // naik dulu ke permukaan sebelum berenang biasa
    }
  }

  // tinggi panggul yang dituju
  let target;
  if (mode === 'wade' || mode === 'bathe') target = pool.floorY + HIP_REF;
  else if (mode === 'dive') target = pool.waterY - HIP_BELOW_SURFACE.crawl - st.dive;
  else target = pool.waterY - HIP_BELOW_SURFACE[mode];
  const rate = mode === 'dive' ? 14 : mode === 'wade' || mode === 'bathe' ? 9 : 6;
  st.hipY += (target - st.hipY) * ease(rate, dt);

  if (wasMode === null) {
    out.entered = true;
    // percikan: makin tinggi jatuhnya dan makin cepat, makin besar (berjalan pelan masuk = percikan kecil)
    const drop = Math.max(0, st.hipY - target);
    out.splash = { x, z, strength: clamp(0.25 + drop * 0.5 + (moving ? 0.15 : 0), 0, 1) };
  }
  st.mode = mode;
  st.active = true;

  // riak di permukaan: tiap ~0,45 detik saat bergerak, ~1,2 detik saat diam di air
  st.ripple += dt;
  const every = moving ? 0.45 : 1.2;
  if (mode !== 'dive' && st.ripple >= every) {
    st.ripple = 0;
    out.ripple = true;
  }

  out.active = true;
  out.mode = mode;
  out.y = st.hipY - HIP_REF;
  out.pose = SWIM_POSE_NAME[mode] ?? null;
  out.speedMul = mode === 'wade' ? SPEED_MUL.wade * (0.6 + 0.4 * clamp(1 - pool.depth / WADE_DEPTH, 0, 1)) + 0.1 : SPEED_MUL[mode];
  return out;
}

/** Tombol aksi: mandi (air dangkal, diam) atau mengapung (air dalam, diam). Mengembalikan true bila ada yang berubah. */
export function toggleAction(st, { x, z, moving }) {
  const pool = poolAt(x, z);
  if (!pool || moving) return false;
  if (pool.depth <= WADE_DEPTH) {
    st.bathing = !st.bathing;
    return true;
  }
  st.floating = !st.floating;
  return true;
}

/** Teks tombol aksi saat di air, atau '' bila tidak ada aksi (di darat). */
export function actionLabel(st, { x, z, moving }) {
  const pool = poolAt(x, z);
  if (!pool || moving) return '';
  if (pool.depth <= WADE_DEPTH) return st.bathing ? 'Selesai' : 'Mandi';
  return st.floating ? 'Berenang' : 'Apung';
}

// ---------------------------------------------------------------- parameter gerak (dipakai swim-pose.js)
// Memakai ruang parameter masjid-posture-data.js (sudut dunia: armFwd dari tergantung ke depan, hipFlex dari tegak ke depan) ditambah
// override per sisi armFwdR/L, hipFlexR/L, kneeR/L. t = detik. Semua nilai berhingga dan berulang terhadap waktu.
const TAU = Math.PI * 2;
const pose = (o) => ({ ...STAND, ...o });

/** Parameter gerak renang `name` pada waktu t, atau null bila nama bukan gerak renang. */
export function swimParams(name, t) {
  const mode = NAME_TO_MODE[name];
  if (!mode) return null;
  if (mode === 'crawl') {
    const ph = t * 0.95 * TAU; // satu kayuhan penuh per ~1,05 detik; lengan kanan dan kiri berselisih setengah putaran
    const kick = Math.sin(t * 5 * TAU);
    return pose({
      hipTilt: 1.45, spine: 0.12, headComp: 0.55, headTurn: 0.25 * Math.sin(t * 0.95 * TAU * 0.5),
      armFwdR: 1.57 - (ph % TAU), armFwdL: 1.57 - ((ph + Math.PI) % TAU), armHangR: 1.3, armHangL: 1.3, elbow: 0.5 + 0.4 * Math.max(0, -Math.sin(ph)),
      hipFlexR: -1.35 + 0.28 * kick, hipFlexL: -1.35 - 0.28 * kick, kneeR: 0.3 + 0.25 * Math.max(0, kick), kneeL: 0.3 + 0.25 * Math.max(0, -kick),
    });
  }
  if (mode === 'tread') {
    const ph = t * 1.1 * TAU;
    return pose({
      armHang: 1.0, armFwd: 0.35 + 0.3 * Math.sin(ph * 2), armYaw: -0.3, elbow: 0.9,
      hipFlexR: 0.75 + 0.45 * Math.sin(ph), hipFlexL: 0.75 - 0.45 * Math.sin(ph), kneeR: 1.1 + 0.5 * Math.sin(ph + 0.8), kneeL: 1.1 - 0.5 * Math.sin(ph + 0.8),
      spread: 0.12,
    });
  }
  if (mode === 'float') {
    const bob = Math.sin(t * 0.9 * TAU);
    return pose({
      hipTilt: -1.5, spine: -0.05, headComp: 0.2, armHang: 0.4, armFwd: 0.05 * bob, armYaw: -0.5, hipFlex: 1.45 + 0.05 * bob, spread: 0.25, knee: 0.1,
    });
  }
  if (mode === 'dive') {
    const ph = t * 0.55 * TAU; // gaya dada: tarik, tekuk, lempar
    const pull = 0.5 + 0.5 * Math.sin(ph);
    return pose({
      hipTilt: 1.4, spine: 0.1, headComp: 0.45, armFwd: 1.55 - 1.0 * pull, armHang: 1.1, armYaw: -0.6 * pull, elbow: 1.2 * pull,
      hipFlex: -1.3 + 0.25 * Math.sin(ph + 1.6), knee: 0.5 + 0.8 * (0.5 + 0.5 * Math.sin(ph + 1.6)), spread: 0.18,
    });
  }
  // bathe: menggosok badan, kedua tangan bergantian di depan dada
  const s = Math.sin(t * 1.7 * TAU);
  return pose({
    spine: 0.12, headComp: 0.3, headTurn: 0.25 * Math.sin(t * 0.8 * TAU), hipFlex: 0.1, knee: 0.2,
    armFwdR: 0.95 + 0.25 * s, armFwdL: 0.95 - 0.25 * s, armYaw: 0.7, elbow: 1.9, armHang: 1.3,
  });
}
