// Bioskop 5D (hotel lantai 3, "Mini Cinema" di sayap barat). Mesin adegan: data murni + matematika (tanpa THREE, DOM, atau jaringan).
//
// Satu film = satu adegan (scene) berisi daftar cue per saluran efek. Cue berarti: "pada detik t, saluran ch bergerak ke nilai
// `to` selama `dur` detik" (kurva halus). Cue boleh merambat sebagai gelombang dari layar ke belakang (`wave`, meter per detik):
// kursi depan merasakannya lebih dulu, seperti pola gelombang di bioskop 4D. Konsepnya ditulis ulang sendiri; tidak ada kode luar yang disalin.
//
// Saluran: rumble (gemuruh suara/getaran 0..1), wind (angin dari layar 0..1), shake (guncangan kamera 0..1), tilt (kemiringan
// horizon, derajat), mist (percikan/kabut air di layar 0..1), water (tinggi air di lantai, meter).
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

export const SCENES = Object.freeze({ [TSUNAMI.id]: TSUNAMI });
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
  for (const [ch, cues] of byChannel) {
    for (let i = 1; i < cues.length; i++) {
      const a = cues[i - 1];
      const b = cues[i];
      if (b.t < a.t + a.dur) errors.push(`saluran ${ch}: cue pada ${b.t} dtk tumpang tindih dengan cue sebelumnya`);
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
// Sebagian orang mudah pusing: kemiringan, guncangan, dan percikan bisa dikurangi atau dimatikan. Suara tetap ada.
export const COMFORT = Object.freeze({
  full: Object.freeze({ rumble: 1, wind: 1, shake: 1, tilt: 1, mist: 1, water: 1 }),
  gentle: Object.freeze({ rumble: 1, wind: 0.7, shake: 0.4, tilt: 0.4, mist: 0.7, water: 1 }),
  calm: Object.freeze({ rumble: 0.6, wind: 0.3, shake: 0, tilt: 0, mist: 0, water: 1 }),
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
