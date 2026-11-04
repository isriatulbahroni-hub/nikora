// Menerapkan gerak renang (swim.js) ke avatar: avatar sederhana dan model manusia lewat jalur yang sama dengan gerak masjid
// (masjid-posture.js). Dipanggil SETELAH applyPose tiap frame, untuk pemain sendiri dan pemain lain (multiplayer-view.js).
// Perpindahan antar gerak dihaluskan dengan campuran dua gerak (bukan menghaluskan sudut), karena sudut kayuhan lengan berputar penuh.
import { POSE_KEYS, STAND } from './masjid-posture-data.js';
import { applyPoseParams, releasePoseParams } from './masjid-posture.js';
import { HIP_REF, isSwimPose, swimParams } from './swim.js';

const BLEND_SECONDS = 0.28;
const SIDED = ['armFwd', 'armHang', 'hipFlex', 'knee'];
const ANGLES = new Set(['armFwdR', 'armFwdL']); // berputar penuh saat gaya bebas: dicampur lewat jalur terpendek
const TAU = Math.PI * 2;

/** Isi semua kunci (termasuk override per sisi) supaya dua gerak bisa dicampur. */
function full(p) {
  const out = { ...p };
  for (const k of SIDED) {
    out[`${k}R`] = p[`${k}R`] ?? p[k];
    out[`${k}L`] = p[`${k}L`] ?? p[k];
  }
  return out;
}
const FULL_KEYS = [...POSE_KEYS, ...SIDED.flatMap((k) => [`${k}R`, `${k}L`])];
const STAND_FULL = Object.freeze(full(STAND));

function mix(a, b, w) {
  const out = {};
  for (const k of FULL_KEYS) {
    let d = b[k] - a[k];
    if (ANGLES.has(k)) d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
    out[k] = a[k] + d * w;
  }
  return out;
}

/**
 * Terapkan gerak `name` (nama jaringan swim.js; null atau nama lain = tidak berenang) pada waktu `t` (detik).
 * Mengembalikan `lift` (m): tambahkan ke avatar.position.y supaya panggul model manusia tepat di tinggi panggul nominal.
 * Bila tidak sedang berenang dan gerak sebelumnya sudah selesai dilepas, tidak menyentuh avatar sama sekali (mengembalikan 0).
 */
export function applySwimPose(avatar, name, t, delta) {
  const st = (avatar.userData.swim ??= { to: null, from: null, w: 1, on: false });
  const want = isSwimPose(name) ? name : null;
  if (want !== st.to) {
    st.from = st.on ? st.to : null; // yang sedang tampil jadi titik awal campuran
    st.to = want;
    st.w = st.from === null && want === null ? 1 : 0;
    if (want !== null) st.on = true;
  }
  if (!st.on) return 0;
  st.w = Math.min(1, st.w + Math.max(0, delta) / BLEND_SECONDS);

  const next = st.to ? full(swimParams(st.to, t)) : STAND_FULL;
  const prev = st.from ? full(swimParams(st.from, t)) : STAND_FULL;
  const p = st.w < 1 ? mix(prev, next, st.w) : next;
  const hipH = applyPoseParams(avatar, p);

  if (st.to === null && st.w >= 1) {
    releasePoseParams(avatar); // kembali berdiri: pivot avatar sederhana tegak; model manusia kembali ke animasi biasa
    st.on = false;
    st.from = null;
    return 0;
  }
  const weight = st.to === null ? 1 - st.w : st.w;
  const lifted = st.to === 'mandi' || (st.to === null && st.from === 'mandi') ? 0 : HIP_REF - hipH; // mandi = berdiri di dasar
  return lifted * weight;
}
