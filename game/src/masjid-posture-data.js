// Data dan logika murni gerakan avatar di masjid: duduk bersila dan gerakan shalat. Tanpa THREE supaya mudah diuji.
// Semua sudut dalam radian. Arti tiap parameter:
//  sink     : seberapa jauh panggul turun (0 = berdiri, 1 = panggul di lantai), pecahan dari tinggi panggul berdiri
//  hipTilt  : panggul condong ke depan; spine: total bungkuk tulang belakang ke depan (dibagi rata)
//  headComp : 0..1 seberapa banyak kepala diluruskan melawan bungkuk badan; headTurn: tengok (negatif = kanan, positif = kiri)
//  hipFlex  : paha terangkat ke depan dari posisi tegak; knee: tekuk lutut (betis melipat ke belakang); spread: paha membuka ke luar
//  armFwd   : lengan atas ke depan (negatif = ke belakang); armHang: sudut lengan turun dari T-pose (1,45 = tergantung)
//  armYaw   : lengan menyilang ke tengah (negatif = membuka ke luar); elbow: tekuk siku
export const STAND = Object.freeze({
  sink: 0, hipTilt: 0, spine: 0, headComp: 0, headTurn: 0, hipFlex: 0, knee: 0, spread: 0, armFwd: 0, armHang: 1.45, armYaw: 0, elbow: 0,
});
export const POSE_KEYS = Object.freeze(Object.keys(STAND));

const pose = (o) => Object.freeze({ ...STAND, ...o });
const SIT_HEELS = { sink: 0.76, hipFlex: 1.26, knee: 2.83, armFwd: 0.6, elbow: 0.7 }; // duduk di atas tumit (iftirasy sederhana)

export const POSES = Object.freeze({
  bersila: pose({ sink: 0.88, hipFlex: 1.5, knee: 2.4, spread: 0.75, armFwd: 0.7, armYaw: -0.25, elbow: 0.5 }),
  takbir: pose({ armFwd: 0.35, armHang: 1.35, elbow: 2.4 }),
  qiyam: pose({ armFwd: 0.45, armYaw: 0.7, elbow: 1.9 }), // sedekap
  ruku: pose({ hipTilt: 0.35, spine: 1.05, headComp: 0.45, armFwd: -0.5 }),
  iktidal: pose({}),
  sujud: pose({ sink: 0.42, hipTilt: 0.9, spine: 1.1, hipFlex: 0.3, knee: 1.87, armFwd: 0.9, elbow: 1.0 }),
  duduk: pose(SIT_HEELS),
  salam_kanan: pose({ ...SIT_HEELS, headTurn: -0.9 }),
  salam_kiri: pose({ ...SIT_HEELS, headTurn: 0.9 }),
});

/** Urutan gerakan shalat 2 sampai 4 rakaat. Tiap langkah: { pose, label, rakaat }. */
export function prayerSteps(rakaat = 2) {
  const n = Math.min(4, Math.max(2, Math.round(rakaat) || 2));
  const steps = [{ pose: 'takbir', label: 'Takbiratul ihram', rakaat: 1 }];
  for (let r = 1; r <= n; r++) {
    steps.push({ pose: 'qiyam', label: 'Berdiri (qiyam)', rakaat: r });
    steps.push({ pose: 'ruku', label: 'Rukuk', rakaat: r });
    steps.push({ pose: 'iktidal', label: "I'tidal", rakaat: r });
    steps.push({ pose: 'sujud', label: 'Sujud pertama', rakaat: r });
    steps.push({ pose: 'duduk', label: 'Duduk di antara dua sujud', rakaat: r });
    steps.push({ pose: 'sujud', label: 'Sujud kedua', rakaat: r });
    if (r === 2 && n > 2) steps.push({ pose: 'duduk', label: 'Tahiyat awal', rakaat: r });
  }
  steps.push({ pose: 'duduk', label: 'Tahiyat akhir', rakaat: n });
  steps.push({ pose: 'salam_kanan', label: 'Salam ke kanan', rakaat: n });
  steps.push({ pose: 'salam_kiri', label: 'Salam ke kiri', rakaat: n });
  return steps;
}

/** Geser parameter `cur` ke arah `target` (k = 0..1 per langkah). Mengubah `cur` di tempat. */
export function easeParams(cur, target, k) {
  for (const key of POSE_KEYS) cur[key] += (target[key] - cur[key]) * k;
  return cur;
}

/** True bila semua parameter sudah (hampir) sama dengan berdiri. */
export function isStanding(cur, eps = 0.02) {
  return POSE_KEYS.every((key) => Math.abs(cur[key] - STAND[key]) < eps);
}

/** Pengendali status: berdiri, duduk bersila, atau sedang shalat (maju satu gerakan tiap `next`). */
export function createPostureController() {
  let sitting = false;
  let steps = null;
  let index = 0;
  let total = 2;
  const pose = () => (steps ? steps[index].pose : sitting ? 'bersila' : null);
  return {
    pose,
    active: () => sitting || steps !== null,
    toggleSit() {
      steps = null;
      index = 0;
      sitting = !sitting;
    },
    startPrayer(rakaat = 2) {
      sitting = false;
      steps = prayerSteps(rakaat);
      total = steps[steps.length - 1].rakaat;
      index = 0;
    },
    /** Maju satu gerakan. Mengembalikan true bila shalat masih berlanjut; false bila selesai (avatar kembali berdiri). */
    next() {
      if (!steps) return false;
      if (index >= steps.length - 1) {
        steps = null;
        index = 0;
        return false;
      }
      index += 1;
      return true;
    },
    stop() {
      sitting = false;
      steps = null;
      index = 0;
    },
    state() {
      const s = steps ? steps[index] : null;
      return {
        sitting,
        praying: steps !== null,
        pose: pose(),
        label: s ? `${s.label} · rakaat ${s.rakaat}/${total}` : '',
        last: steps ? index === steps.length - 1 : false,
        step: steps ? index + 1 : 0,
        total: steps ? steps.length : 0,
      };
    },
  };
}
