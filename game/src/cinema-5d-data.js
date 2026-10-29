// Bioskop 5D (hotel lantai 3, "Mini Cinema" di sayap barat). Mesin adegan: data murni + matematika (tanpa THREE, DOM, atau jaringan).
//
// Satu film = satu adegan (scene) berisi daftar cue per saluran efek. Cue berarti: "pada detik t, saluran ch bergerak ke nilai
// `to` selama `dur` detik" (kurva halus). Cue boleh merambat sebagai gelombang dari layar ke belakang (`wave`, meter per detik):
// kursi depan merasakannya lebih dulu, seperti pola gelombang di bioskop 4D. Konsepnya ditulis ulang sendiri; tidak ada kode luar yang disalin.
//
// Saluran: rumble (gemuruh suara/getaran 0..1), wind (angin dari layar 0..1), shake (guncangan kamera 0..1), tilt (kemiringan
// horizon, derajat), mist (percikan/kabut air di layar 0..1), water (tinggi air di lantai, meter), dim (ruangan menggelap 0..1),
// flash (kilatan petir / kejutan 0..1, dibatasi 3 kali per detik), whisper (bisikan dari belakang 0..1), chair (kursi kosong bergeser 0..1).
// Peragaan 3D, suara, dan getaran HP membaca nilai-nilai ini; modul ini sengaja tidak tahu cara menampilkannya.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (u) => {
  const x = clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Tinggi air maksimum (m). Langit-langit lantai 3 hanya 3,9 m, jadi air cukup sampai sekitar dada. */
export const WATER_MAX = 1.6;
export const TILT_MAX = 15; // derajat
export const SHAKE_MAX = 0.04; // simpangan kamera maksimum (m)
export const RUMBLE_MIN = 0.08; // di bawah ini HP tidak bergetar
/** Kedalaman ruang bioskop dari layar ke dinding belakang (m); dipakai untuk memastikan gelombang selesai sebelum adegan berakhir. */
export const MAX_SEAT_DISTANCE = 70;

export const RANGE = Object.freeze({
  rumble: Object.freeze([0, 1]),
  wind: Object.freeze([0, 1]),
  shake: Object.freeze([0, 1]),
  mist: Object.freeze([0, 1]),
  tilt: Object.freeze([-TILT_MAX, TILT_MAX]),
  water: Object.freeze([0, WATER_MAX]),
  dim: Object.freeze([0, 1]),
  flash: Object.freeze([0, 1]),
  whisper: Object.freeze([0, 1]),
  chair: Object.freeze([0, 1]),
});
export const CHANNEL_IDS = Object.freeze(Object.keys(RANGE));

// ---------------------------------------------------------------- adegan
/** Adegan demo: ombak tsunami raksasa mendekat ke pantai (durasi 52 detik, termasuk gelombang ke kursi paling belakang). */
export const TSUNAMI = Object.freeze({
  id: 'tsunami',
  title: 'Tsunami',
  duration: 52,
  cues: Object.freeze([
    // gemuruh makin keras, memuncak saat air menerjang (detik 26), lalu surut
    { ch: 'rumble', t: 0, to: 0.3, dur: 20 },
    { ch: 'rumble', t: 20, to: 0.7, dur: 6 },
    { ch: 'rumble', t: 26, to: 1, dur: 2 },
    { ch: 'rumble', t: 34, to: 0.2, dur: 8 },
    { ch: 'rumble', t: 42, to: 0, dur: 6 },
    // angin bertiup dari depan (arah layar)
    { ch: 'wind', t: 12, to: 0.5, dur: 8 },
    { ch: 'wind', t: 26, to: 0.9, dur: 3 },
    { ch: 'wind', t: 34, to: 0, dur: 8 },
    // kursi bergetar, lalu mengguncang keras saat air menerjang
    { ch: 'shake', t: 18, to: 0.3, dur: 6 },
    { ch: 'shake', t: 24, to: 0.85, dur: 2 },
    { ch: 'shake', t: 32, to: 0, dur: 6 },
    // kursi miring saat air menerjang, lalu menyeimbang
    { ch: 'tilt', t: 25, to: 12, dur: 1.5 },
    { ch: 'tilt', t: 27, to: 4, dur: 4 },
    { ch: 'tilt', t: 33, to: 0, dur: 4 },
    // kabut air menyapu dari depan ke belakang
    { ch: 'mist', t: 26, to: 0.8, dur: 1, wave: 8 },
    { ch: 'mist', t: 33, to: 0, dur: 5, wave: 8 },
    // air naik dari lantai, lalu surut (juga merambat dari depan ke belakang)
    { ch: 'water', t: 26, to: 1.4, dur: 6, wave: 8 },
    { ch: 'water', t: 34, to: 0, dur: 8, wave: 8 },
  ]),
});

/** Film hantu (60 detik): ruangan makin gelap, bisikan dari belakang, kursi kosong bergeser, dua kali kejutan (detik 31 dan 49). */
export const HANTU = Object.freeze({
  id: 'hantu',
  title: 'Hantu',
  duration: 60,
  cues: Object.freeze([
    { ch: 'dim', t: 0, to: 0.35, dur: 12 },
    { ch: 'dim', t: 12, to: 0.7, dur: 14 },
    { ch: 'dim', t: 30, to: 0.97, dur: 1.5 }, // lampu padam sesaat
    { ch: 'dim', t: 33, to: 0.6, dur: 3 },
    { ch: 'dim', t: 40, to: 0.9, dur: 2 },
    { ch: 'dim', t: 48, to: 0, dur: 8 },
    { ch: 'whisper', t: 10, to: 0.4, dur: 6 },
    { ch: 'whisper', t: 16, to: 0, dur: 3 },
    { ch: 'whisper', t: 24, to: 0.7, dur: 5 },
    { ch: 'whisper', t: 29, to: 0, dur: 2 },
    { ch: 'whisper', t: 38, to: 0.9, dur: 4 },
    { ch: 'whisper', t: 42, to: 0, dur: 4 },
    { ch: 'chair', t: 22, to: 1, dur: 3 }, // kursi kosong bergeser sendiri
    { ch: 'chair', t: 45, to: 0, dur: 3 },
    { ch: 'flash', t: 31, to: 1, dur: 0.08 },
    { ch: 'flash', t: 31.1, to: 0, dur: 0.4 },
    { ch: 'flash', t: 49, to: 1, dur: 0.08 },
    { ch: 'flash', t: 49.1, to: 0, dur: 0.5 },
    { ch: 'shake', t: 31, to: 0.9, dur: 0.1 },
    { ch: 'shake', t: 31.1, to: 0, dur: 1.5 },
    { ch: 'shake', t: 49, to: 0.9, dur: 0.1 },
    { ch: 'shake', t: 49.1, to: 0, dur: 1.2 },
    { ch: 'rumble', t: 0, to: 0.12, dur: 25 }, // dengung rendah yang mencekam
    { ch: 'rumble', t: 25, to: 0.3, dur: 5 },
    { ch: 'rumble', t: 30, to: 0.9, dur: 1 },
    { ch: 'rumble', t: 31, to: 0.1, dur: 3 },
    { ch: 'rumble', t: 34, to: 0, dur: 6 },
    { ch: 'rumble', t: 48, to: 0.8, dur: 0.5 },
    { ch: 'rumble', t: 48.5, to: 0, dur: 3 },
    { ch: 'wind', t: 18, to: 0.2, dur: 10 }, // angin dingin
    { ch: 'wind', t: 28, to: 0, dur: 8 },
  ]),
});

/** Gempa bumi (40 detik): guncangan membesar tak beraturan, horizon bergoyang kiri-kanan, lampu meredup, lalu mereda. */
export const GEMPA = Object.freeze({
  id: 'gempa',
  title: 'Gempa Bumi',
  duration: 40,
  cues: Object.freeze([
    { ch: 'rumble', t: 0, to: 0.2, dur: 8 },
    { ch: 'rumble', t: 8, to: 0.6, dur: 6 },
    { ch: 'rumble', t: 14, to: 1, dur: 6 },
    { ch: 'rumble', t: 20, to: 0.6, dur: 8 },
    { ch: 'rumble', t: 28, to: 0.2, dur: 6 },
    { ch: 'rumble', t: 34, to: 0, dur: 4 },
    { ch: 'shake', t: 2, to: 0.2, dur: 6 },
    { ch: 'shake', t: 8, to: 0.6, dur: 6 },
    { ch: 'shake', t: 14, to: 1, dur: 4 },
    { ch: 'shake', t: 18, to: 0.7, dur: 8 },
    { ch: 'shake', t: 26, to: 0.3, dur: 6 },
    { ch: 'shake', t: 32, to: 0, dur: 6 },
    { ch: 'tilt', t: 6, to: 3, dur: 1.5 },
    { ch: 'tilt', t: 7.5, to: -4, dur: 1.5 },
    { ch: 'tilt', t: 9, to: 5, dur: 1.5 },
    { ch: 'tilt', t: 10.5, to: -6, dur: 1.5 },
    { ch: 'tilt', t: 12, to: 7, dur: 1.5 },
    { ch: 'tilt', t: 13.5, to: -8, dur: 1.5 },
    { ch: 'tilt', t: 15, to: 6, dur: 2 },
    { ch: 'tilt', t: 17, to: -5, dur: 2 },
    { ch: 'tilt', t: 19, to: 4, dur: 2 },
    { ch: 'tilt', t: 21, to: -3, dur: 2 },
    { ch: 'tilt', t: 23, to: 2, dur: 2 },
    { ch: 'tilt', t: 25, to: 0, dur: 3 },
    { ch: 'dim', t: 12, to: 0.35, dur: 2 },
    { ch: 'dim', t: 14, to: 0.1, dur: 12 },
    { ch: 'dim', t: 30, to: 0, dur: 4 },
  ]),
});

// Petir: kilatan lalu guntur menyusul 1,2-1,5 detik kemudian (cahaya lebih cepat dari suara).
const STRIKES = [8, 16.5, 17.4, 29, 38];
/** Badai petir (48 detik): hujan di kaca, angin kencang, lima sambaran dengan guntur yang menyusul. */
export const BADAI = Object.freeze({
  id: 'badai',
  title: 'Badai Petir',
  duration: 48,
  cues: Object.freeze([
    ...STRIKES.flatMap((s) => [{ ch: 'flash', t: s, to: 1, dur: 0.05 }, { ch: 'flash', t: s + 0.05, to: 0, dur: 0.3 }]),
    { ch: 'rumble', t: 0, to: 0.2, dur: 7 },
    { ch: 'rumble', t: 9.2, to: 0.8, dur: 0.4 },
    { ch: 'rumble', t: 9.6, to: 0.25, dur: 3 },
    { ch: 'rumble', t: 17.7, to: 0.7, dur: 0.4 },
    { ch: 'rumble', t: 18.1, to: 0.3, dur: 0.8 },
    { ch: 'rumble', t: 18.9, to: 0.9, dur: 0.4 },
    { ch: 'rumble', t: 19.3, to: 0.25, dur: 3.5 },
    { ch: 'rumble', t: 30.2, to: 0.85, dur: 0.4 },
    { ch: 'rumble', t: 30.6, to: 0.25, dur: 3 },
    { ch: 'rumble', t: 39.2, to: 1, dur: 0.4 },
    { ch: 'rumble', t: 39.6, to: 0.1, dur: 5 },
    { ch: 'rumble', t: 44.6, to: 0, dur: 3 },
    { ch: 'wind', t: 2, to: 0.4, dur: 8 },
    { ch: 'wind', t: 10, to: 0.6, dur: 10 },
    { ch: 'wind', t: 20, to: 0.8, dur: 10 },
    { ch: 'wind', t: 30, to: 0.6, dur: 10 },
    { ch: 'wind', t: 40, to: 0, dur: 8 },
    { ch: 'mist', t: 4, to: 0.3, dur: 10 },
    { ch: 'mist', t: 14, to: 0.7, dur: 10 },
    { ch: 'mist', t: 24, to: 0.9, dur: 10 },
    { ch: 'mist', t: 34, to: 0.6, dur: 6 },
    { ch: 'mist', t: 40, to: 0, dur: 8 },
    { ch: 'shake', t: 9.2, to: 0.3, dur: 0.3 },
    { ch: 'shake', t: 9.5, to: 0, dur: 1.5 },
    { ch: 'shake', t: 39.2, to: 0.5, dur: 0.3 },
    { ch: 'shake', t: 39.5, to: 0, dur: 1.5 },
    { ch: 'dim', t: 0, to: 0.25, dur: 6 },
    { ch: 'dim', t: 6, to: 0.4, dur: 30 },
    { ch: 'dim', t: 36, to: 0, dur: 10 },
  ]),
});

export const SCENES = Object.freeze({ [TSUNAMI.id]: TSUNAMI, [HANTU.id]: HANTU, [GEMPA.id]: GEMPA, [BADAI.id]: BADAI });

// ---------------------------------------------------------------- jadwal tayang
// Semua tamu memakai jam yang sama (epoch), jadi tayangan serentak tanpa jaringan: satu slot 90 detik, adegan bergilir.
// Adegan terpanjang 60 detik, jadi ada jeda minimal 30 detik antar tayangan.
export const SHOW_ORDER = Object.freeze(['tsunami', 'hantu', 'gempa', 'badai']);
export const SHOW_SLOT_SECONDS = 90;

/** Tayangan pada waktu `nowMs` (ms epoch): adegan, detik ke berapa, sedang tayang atau jeda, dan hitung mundur ke slot berikutnya. */
export function showAt(nowMs, { order = SHOW_ORDER, slot = SHOW_SLOT_SECONDS, scenes = SCENES } = {}) {
  const sec = Number.isFinite(nowMs) ? nowMs / 1000 : 0;
  const index = Math.floor(sec / slot);
  const t = sec - index * slot;
  const n = order.length;
  const id = order[((index % n) + n) % n];
  const scene = scenes[id];
  return { index, id, scene, t, playing: t < scene.duration, nextId: order[(((index + 1) % n) + n) % n], nextIn: slot - t };
}
export const getScene = (id) => SCENES[id] ?? null;

/** Daftar galat sebuah adegan (kosong = sah). Menjaga cue per saluran urut, tidak tumpang tindih, dan dalam rentang. */
export function validateScene(scene) {
  const errors = [];
  if (!scene || typeof scene.id !== 'string' || !scene.id) return ['adegan tanpa id'];
  if (!(scene.duration > 0)) errors.push('durasi harus > 0');
  if (!Array.isArray(scene.cues)) return [...errors, 'cues harus berupa daftar'];
  const byChannel = new Map();
  scene.cues.forEach((c, i) => {
    const label = `cue ${i} (${c?.ch})`;
    const range = RANGE[c?.ch];
    if (!range) return errors.push(`${label}: saluran tidak dikenal`);
    if (![c.t, c.to, c.dur].every(Number.isFinite)) return errors.push(`${label}: t, to, dur harus angka`);
    if (c.t < 0 || c.dur < 0) errors.push(`${label}: t dan dur tidak boleh negatif`);
    if (c.to < range[0] || c.to > range[1]) errors.push(`${label}: nilai ${c.to} di luar rentang ${range[0]}..${range[1]}`);
    if (c.wave != null && !(c.wave > 0)) errors.push(`${label}: wave harus > 0`);
    const delay = c.wave > 0 ? MAX_SEAT_DISTANCE / c.wave : 0;
    if (c.t + c.dur + delay > scene.duration) errors.push(`${label}: selesai (${(c.t + c.dur + delay).toFixed(1)} dtk) setelah adegan berakhir`);
    if (!byChannel.has(c.ch)) byChannel.set(c.ch, []);
    byChannel.get(c.ch).push(c);
  });
  // keselamatan cahaya berkedip: tidak lebih dari 3 kilatan dalam satu detik
  const rises = (byChannel.get('flash') ?? []).filter((c) => c.to >= 0.5).map((c) => c.t).sort((a, b) => a - b);
  for (let i = 0; i + 3 < rises.length; i++) if (rises[i + 3] - rises[i] < 1) errors.push(`kilatan lebih dari 3 kali per detik sekitar ${rises[i]} dtk`);
  for (const [ch, cues] of byChannel) {
    for (let i = 1; i < cues.length; i++) {
      const a = cues[i - 1];
      const b = cues[i];
      if (b.t < a.t + a.dur - 1e-9) errors.push(`saluran ${ch}: cue pada ${b.t} dtk tumpang tindih dengan cue sebelumnya`);
      if ((a.wave ?? 0) !== (b.wave ?? 0)) errors.push(`saluran ${ch}: wave harus sama untuk semua cue`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------- pembacaan nilai
const cueCache = new WeakMap();
function cuesFor(scene, ch) {
  let perScene = cueCache.get(scene);
  if (!perScene) {
    perScene = new Map();
    cueCache.set(scene, perScene);
  }
  let list = perScene.get(ch);
  if (!list) {
    list = scene.cues.filter((c) => c.ch === ch).sort((a, b) => a.t - b.t);
    perScene.set(ch, list);
  }
  return list;
}

/** Jarak kursi dari layar (m); layar di dinding barat, kursi makin ke timur makin jauh. */
export const seatDistance = (seatX, screenX) => Math.max(0, seatX - screenX);

/** Nilai satu saluran pada detik `time` untuk kursi sejauh `dist` meter dari layar. */
export function channelValue(scene, ch, time, dist = 0) {
  const range = RANGE[ch];
  if (!range || !scene || !Number.isFinite(time)) return 0;
  let prev = 0;
  for (const c of cuesFor(scene, ch)) {
    const start = c.t + (c.wave > 0 ? Math.max(0, dist) / c.wave : 0);
    if (time < start) break;
    const k = c.dur > 0 ? (time - start) / c.dur : 1;
    if (k < 1) return clamp(prev + (c.to - prev) * smooth(k), range[0], range[1]);
    prev = c.to;
  }
  return clamp(prev, range[0], range[1]);
}

// ---------------------------------------------------------------- kenyamanan
// Sebagian orang mudah pusing atau peka terhadap cahaya berkedip: kemiringan, guncangan, percikan, dan kilatan bisa dikurangi atau dimatikan. Suara tetap ada.
export const COMFORT = Object.freeze({
  full: Object.freeze({ rumble: 1, wind: 1, shake: 1, tilt: 1, mist: 1, water: 1, dim: 1, flash: 1, whisper: 1, chair: 1 }),
  gentle: Object.freeze({ rumble: 1, wind: 0.7, shake: 0.4, tilt: 0.4, mist: 0.7, water: 1, dim: 1, flash: 0.5, whisper: 0.8, chair: 1 }),
  calm: Object.freeze({ rumble: 0.6, wind: 0.3, shake: 0, tilt: 0, mist: 0, water: 1, dim: 0.6, flash: 0, whisper: 0.6, chair: 1 }), // tanpa kilatan sama sekali
});

/** Mode kenyamanan: "kurangi gerakan" dari perangkat selalu menang; selain itu ?nyaman=full|gentle|calm (bawaan full). */
export function comfortFromSearch(search = '', reduceMotion = false) {
  if (reduceMotion) return 'calm';
  const v = new URLSearchParams(search).get('nyaman');
  return v === 'calm' || v === 'gentle' ? v : 'full';
}

/** Semua saluran pada detik `time` untuk satu kursi, sudah disesuaikan dengan mode kenyamanan. */
export function sceneAt(scene, time, { dist = 0, comfort = 'full' } = {}) {
  const scale = COMFORT[comfort] ?? COMFORT.full;
  const out = {};
  for (const ch of CHANNEL_IDS) out[ch] = channelValue(scene, ch, time, dist) * scale[ch];
  return out;
}

// ---------------------------------------------------------------- keluaran efek
export const tiltRadians = (deg) => (clamp(deg, -TILT_MAX, TILT_MAX) * Math.PI) / 180;

/** Simpangan kamera (m) akibat guncangan; deterministik terhadap waktu, selalu dalam batas SHAKE_MAX. */
export function shakeOffset(level, time) {
  const a = clamp(Number.isFinite(level) ? level : 0, 0, 1) * SHAKE_MAX;
  const t = Number.isFinite(time) ? time : 0;
  return {
    x: (a * (Math.sin(t * 31.7) + 0.6 * Math.sin(t * 57.3 + 1.3))) / 1.6 + 0, // + 0 mengubah -0 menjadi 0
    y: (a * 0.7 * (Math.sin(t * 37.1 + 0.7) + 0.6 * Math.sin(t * 61.9 + 2.1))) / 1.6 + 0,
  };
}

/** Denyut getaran HP untuk tingkat gemuruh: ms = lama getar, gap = jeda antar denyut (detik); null di bawah ambang. */
export function rumbleBeat(level) {
  if (!(level >= RUMBLE_MIN)) return null;
  const l = Math.min(1, level);
  return { ms: Math.round(10 + 30 * l), gap: 0.55 - 0.4 * l };
}

// ---------------------------------------------------------------- denah kursi
export const SEAT = Object.freeze({ firstRow: 8, rowStep: 1.5, maxRows: 20, step: 0.7, perBlock: 12, aisle: 2.2, maxBlocks: 4, backMargin: 12, sideMargin: 4 });

/**
 * Denah kursi bioskop untuk persegi ruang [x1, z1, x2, z2] (layar di dinding barat, kursi menghadap barat):
 * layar lebar, baris kursi dalam blok dengan lorong, dan satu kursi "hantu" yang sengaja dikosongkan (dipakai adegan hantu).
 * Bagian belakang ruang dibiarkan sebagai foyer (mulai dari `foyerX`). Murni data.
 */
export function cinemaSeatPlan(rect) {
  const [x1, z1, x2, z2] = rect;
  const cz = (z1 + z2) / 2;
  const depth = z2 - z1;
  const blockW = SEAT.perBlock * SEAT.step;
  const blocks = clamp(Math.floor((depth - 2 * SEAT.sideMargin + SEAT.aisle) / (blockW + SEAT.aisle)), 1, SEAT.maxBlocks);
  const totalW = blocks * blockW + (blocks - 1) * SEAT.aisle;
  const rowStart = x1 + SEAT.firstRow;
  const rows = clamp(Math.floor((x2 - SEAT.backMargin - rowStart) / SEAT.rowStep) + 1, 0, SEAT.maxRows);
  const ghostRow = Math.min(8, rows - 1);
  const ghostBlock = Math.max(0, Math.floor(blocks / 2) - 1);
  const ghostCol = SEAT.perBlock - 1; // di sisi lorong tengah
  const seats = [];
  let ghost = null;
  for (let r = 0; r < rows; r++) {
    const x = rowStart + r * SEAT.rowStep;
    for (let b = 0; b < blocks; b++) {
      const zStart = cz - totalW / 2 + b * (blockW + SEAT.aisle);
      for (let c = 0; c < SEAT.perBlock; c++) {
        const z = zStart + SEAT.step / 2 + c * SEAT.step;
        if (r === ghostRow && b === ghostBlock && c === ghostCol) ghost = { x, z, row: r, block: b };
        else seats.push({ x, z, row: r, block: b, col: c });
      }
    }
  }
  return {
    screen: { x: x1 + 0.12, z: cz, w: clamp(depth - 8, 6, 24) },
    seats, ghost, rows, blocks,
    foyerX: rows > 0 ? rowStart + (rows - 1) * SEAT.rowStep + 3 : x1 + SEAT.firstRow,
  };
}
