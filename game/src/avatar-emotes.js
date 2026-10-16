// Pose tubuh untuk emote (stiker emoji): murni, tanpa THREE/DOM, jadi bisa diuji penuh.
// Lengan memakai 4 sudut (konvensi lengan KANAN; lengan kiri dicerminkan: z dan t dibalik):
//   x = ayun ke depan (rad), z = buka ke samping (+ = menjauhi badan), e = tekuk siku, t = putaran lengan atas (pronasi).
// Susunan sendi di avatar.js: bahu (Euler 'XZY': putar t, lalu z, lalu x) -> siku (rotation.x = e).
// Angka sudut di ARM dihitung dengan solver IK supaya pusat tangan tepat di target T (koordinat badan atas, depan = -z).
export const RIG = Object.freeze({
  shoulderX: 0.24, shoulderY: 1.28, upper: 0.26, fore: 0.27, // panjang lengan atas dan lengan bawah sampai pusat tangan
  neckY: 1.4, headY: 1.55, headR: 0.155, hipY: 0.82,
});

export const ARM = Object.freeze({
  pray: { x: 0.84, z: 0.22, e: 1.89, t: 1.26, T: [0.04, 1.19, -0.22] },
  heartsign: { x: 1.13, z: 0.21, e: 1.82, t: 1.18, T: [0.045, 1.27, -0.26] },
  affection: { x: 0.52, z: -0.02, e: 1.84, t: 0.8, T: [0.05, 1.21, -0.25] },
  clap: { x: 0.96, z: 0.22, e: 1.62, t: 1.2, T: [0.05, 1.19, -0.3] },
  shock: { x: 1.58, z: -0.05, e: 1.72, t: 0.79, T: [0.04, 1.47, -0.21] },
  awe: { x: 1.55, z: -0.05, e: 2.03, t: 0.39, T: [0.14, 1.5, -0.14] },
  touched: { x: 1.44, z: 0.06, e: 1.96, t: 0.8, T: [0.07, 1.43, -0.19] },
  love: { x: 1.62, z: 0.25, e: 2.04, t: 0.84, T: [0.1, 1.45, -0.17] },
  cheer: { x: 2.66, z: -0.05, e: 0.75, t: -0.02, T: [0.22, 1.77, -0.05] },
  great: { x: 1.25, z: 0.59, e: 1.41, t: 1.2, T: [0.2, 1.25, -0.4] },
  hug: { x: 1, z: 0.67, e: 1.31, t: 1.15, T: [0.26, 1.15, -0.4] },
  bow: { x: -0.21, z: -0.19, e: 1.38, t: 0.4, T: [0.08, 0.95, -0.18] },
  calm: { x: 0.63, z: 0.25, e: 1.47, t: 1.59, T: [0.05, 1, -0.2] },
  sad: { x: 0, z: 0.05, e: 1.6, t: 0.79, T: [0.06, 1.02, -0.19] },
  gift: { x: 0.78, z: 0, e: 0.74, t: 0.73, T: [0.12, 1.05, -0.42] },
  flower: { x: 0.71, z: 0.07, e: 1.01, t: 1.18, T: [0.06, 1.02, -0.34] },
  cry: { x: 1.9, z: 0.09, e: 1.49, t: 0.82, T: [0.07, 1.55, -0.225] },
  hip: { x: 0.1, z: 0.99, e: 1.94, t: 1.61, T: [0.24, 0.98, -0.02] },
  wave: { x: 2.75, z: -0.05, e: 0.65, t: -0.34, T: [0.27, 1.78, -0.04] },
  salam: { x: 1.78, z: 0.4, e: 1.59, t: 0.41, T: [0.24, 1.58, -0.22] },
  mouth: { x: 1.6, z: 0.09, e: 1.8, t: 0.8, T: [0.07, 1.47, -0.21] },
  belly: { x: 0.53, z: 0.38, e: 1.65, t: 1.59, T: [0.08, 1, -0.16] },
  thumbs: { x: 1.11, z: 0.43, e: 1.42, t: 0.75, T: [0.2, 1.3, -0.4] },
  handshake: { x: 1, z: 0.12, e: 0.66, t: 1.25, T: [0.14, 1.06, -0.44] },
  point: { x: 1.33, z: -0.05, e: 0.59, t: 0.38, T: [0.16, 1.3, -0.5] },
  selfie: { x: 2.35, z: 0.37, e: 0.73, t: 1.63, T: [0.24, 1.62, -0.36] },
  ring: { x: 1.3, z: 0.18, e: 1.38, t: 0.46, T: [0.18, 1.42, -0.38] },
  ringL: { x: 1.31, z: 0.27, e: 1.7, t: 1.2, T: [0.06, 1.3, -0.3] },
  toast: { x: 1.34, z: 0.2, e: 1.43, t: 0.39, T: [0.2, 1.45, -0.36] },
  dance: { x: 2.48, z: 0.1, e: 0.81, t: 0.02, T: [0.28, 1.75, -0.12] },
  fire: { x: 2.52, z: -0.05, e: 0.73, t: -0.02, T: [0.22, 1.76, -0.12] },
  knee: { x: 0.26, z: 0.13, e: 0.95, t: 0.79, T: [0.14, 0.9, -0.26] },
});
export const REST = Object.freeze({ x: 0, z: -0.08, e: 0.15, t: 0 }); // lengan menggantung santai

const rx = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const app = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);

/** Posisi siku dan pusat tangan lengan KANAN (koordinat badan atas) untuk sudut {x,z,e,t}. */
export function armFK({ x, z, e, t = 0 }) {
  const S = mul(mul(rx(x), rz(z)), ry(t));
  const el = app(S, [0, -RIG.upper, 0]);
  const fore = app(rx(e), [0, -RIG.fore, 0]);
  const hand = app(S, [0, -RIG.upper + fore[1], fore[2]]);
  return { elbow: [RIG.shoulderX + el[0], RIG.shoulderY + el[1], el[2]], hand: [RIG.shoulderX + hand[0], RIG.shoulderY + hand[1], hand[2]] };
}

const bellIn = (v) => { const k = Math.min(1, Math.max(0, v)); return k * k * (3 - 2 * k); };
/** Bobot emote 0..1: naik halus di awal, turun halus di akhir. */
export function emoteWeight(elapsed, dur) {
  return bellIn(elapsed / 0.3) * bellIn((dur - elapsed) / 0.4);
}

const A = (key) => key; // penanda: kunci di ARM
// anim: [kanal, amplitudo, frekuensi Hz, fase rad]. Kanal: rx rz re rt (lengan kanan), lx lz le lt (lengan kiri, tetap konvensi kanan),
// spine (+ membungkuk ke depan), hp (+ menunduk), hy (+ menoleh ke kiri), hr (+ miring ke kiri), dip (naik-turun badan), hipR hipL kneeR kneeL.
const P = Math.PI;
export const POSES = Object.freeze({
  love:      { r: A('love'), l: A('love'), spine: 0.05, head: [0.1, 0, 0.1], anim: [['hr', 0.1, 0.9, 0], ['dip', 0.02, 1.8, 0]] },
  clap:      { r: A('clap'), l: A('clap'), spine: 0.04, head: [0, 0, 0], anim: [['rz', 0.16, 5, 0], ['lz', 0.16, 5, 0], ['rx', 0.06, 5, 0], ['lx', 0.06, 5, 0], ['dip', 0.015, 5, 0]] },
  touched:   { r: A('touched'), l: A('touched'), spine: 0.12, head: [0.2, 0, 0.12], anim: [['hr', 0.04, 0.7, 0], ['dip', 0.01, 1.4, 0]] },
  laugh:     { r: A('mouth'), l: A('belly'), spine: 0.0, head: [-0.12, 0, 0], anim: [['spine', 0.14, 3.2, 0], ['dip', 0.03, 6.4, 0], ['hp', 0.1, 3.2, P]] },
  party:     { r: A('dance'), l: A('dance'), spine: 0, head: [0, 0, 0.05], anim: [['rx', 0.25, 2.5, 0], ['lx', 0.25, 2.5, P], ['dip', 0.04, 5, 0], ['hipR', 0.3, 2.5, 0], ['hipL', 0.3, 2.5, P], ['kneeR', 0.3, 2.5, P / 2], ['kneeL', 0.3, 2.5, -P / 2]] },
  flower:    { r: A('flower'), l: A('flower'), spine: 0.08, head: [0.05, 0, 0.1], anim: [['spine', 0.03, 0.8, 0], ['hr', 0.04, 0.8, 0]] },
  angry:     { r: A('hip'), l: A('hip'), spine: -0.04, head: [0.12, 0, 0], anim: [['hy', 0.08, 7, 0], ['dip', 0.012, 6, 0]] },
  cry:       { r: A('cry'), l: A('cry'), spine: 0.2, head: [0.1, 0, 0], anim: [['spine', 0.04, 5, 0], ['rz', 0.05, 2.5, 0], ['lz', 0.05, 2.5, P], ['dip', 0.01, 5, 0]] },
  pray:      { r: A('pray'), l: A('pray'), spine: 0.1, head: [0.2, 0, 0], anim: [['hp', 0.04, 0.6, 0]] },
  heart:     { r: A('heartsign'), l: A('heartsign'), spine: 0.03, head: [0, 0, 0.08], anim: [['dip', 0.015, 2, 0], ['rx', 0.04, 2, 0], ['lx', 0.04, 2, 0]] },
  fire:      { r: A('fire'), l: A('fire'), spine: -0.06, head: [-0.05, 0, 0], anim: [['rx', 0.25, 3, 0], ['lx', 0.25, 3, P], ['dip', 0.05, 6, 0]] },
  wave:      { r: A('wave'), l: null, spine: 0.02, head: [0, 0, 0.06], anim: [['re', 0.35, 4, 0], ['rz', 0.1, 4, 0]] },
  shock:     { r: A('shock'), l: A('shock'), spine: -0.14, head: [-0.08, 0, 0], anim: [['dip', 0.015, 14, 0]] },
  sad:       { r: A('sad'), l: A('sad'), spine: 0.22, head: [0.35, 0, 0], anim: [['hp', 0.03, 0.5, 0]] },
  thumbs:    { r: A('thumbs'), l: A('hip'), spine: 0, head: [0, 0, 0], anim: [['hp', 0.14, 2.5, 0]] },
  handshake: { r: A('handshake'), l: null, spine: 0.05, head: [0.05, 0, 0], anim: [['re', 0.08, 5, 0], ['rx', 0.08, 5, 0]] },
  dance:     { r: A('dance'), l: A('dance'), spine: 0, head: [0, 0, 0.08], anim: [['rx', 0.35, 2, 0], ['lx', 0.35, 2, P], ['spine', 0.08, 2, 0], ['dip', 0.05, 4, 0], ['hipR', 0.35, 2, 0], ['hipL', 0.35, 2, P], ['kneeR', 0.35, 2, P / 2], ['kneeL', 0.35, 2, -P / 2], ['hr', 0.1, 2, 0]] },
  great:     { r: A('great'), l: A('great'), spine: 0, head: [0, 0, 0], anim: [['dip', 0.04, 3, 0], ['hp', 0.1, 3, 0]] },
  awe:       { r: A('awe'), l: A('awe'), spine: -0.04, head: [0, 0, 0.1], anim: [['hr', 0.04, 1.2, 0], ['dip', 0.02, 2, 0]] },
  cheer:     { r: A('cheer'), l: A('cheer'), spine: -0.08, head: [-0.1, 0, 0], anim: [['dip', 0.08, 3, 0], ['rx', 0.1, 3, 0], ['lx', 0.1, 3, 0]] },
  ring:      { r: A('ring'), l: A('ringL'), spine: 0.05, head: [0.15, 0, 0], anim: [['rt', 0.2, 1.2, 0]] },
  gift:      { r: A('gift'), l: A('gift'), spine: 0.12, head: [0.08, 0, 0], anim: [['spine', 0.03, 1, 0]] },
  toast:     { r: A('toast'), l: A('hip'), spine: 0, head: [0, 0, 0.06], anim: [['re', 0.08, 1.5, 0]] },
  affection: { r: A('affection'), l: A('affection'), spine: 0.04, head: [0.05, 0, 0.15], anim: [['hr', 0.05, 0.8, 0]] },
  bow:       { r: A('bow'), l: A('bow'), spine: 0.75, head: [0, 0, 0], anim: [] },
  calm:      { r: A('calm'), l: A('calm'), spine: 0.03, head: [0.1, 0, 0.05], anim: [['spine', 0.02, 0.4, 0]] },
  hug:       { r: A('hug'), l: A('hug'), spine: 0.15, head: [0, 0, 0.08], anim: [['rz', 0.05, 1, 0], ['lz', 0.05, 1, 0]] },
  salam:     { r: A('salam'), l: null, spine: 0.08, head: [0.1, 0, 0], anim: [['re', 0.12, 2, 0]] },
  sit:       { r: A('knee'), l: A('knee'), spine: 0.2, head: [0, 0, 0], dip: -0.37, legs: 'sit', anim: [['hp', 0.03, 0.5, 0]] },
  point:     { r: A('point'), l: null, spine: 0.05, head: [0, 0.12, 0], anim: [['rx', 0.03, 2, 0]] },
  heartsign: { r: A('heartsign'), l: A('heartsign'), spine: 0, head: [0, 0, 0.1], anim: [['dip', 0.015, 2, 0], ['rx', 0.04, 2, 0], ['lx', 0.04, 2, 0]] },
  selfie:    { r: A('selfie'), l: A('hip'), spine: -0.05, head: [0, 0, 0.15], anim: [['rx', 0.03, 2, 0]] },
});

const SIT_LEGS = Object.freeze({ hipR: 1.5, hipL: 1.5, kneeR: -1.5, kneeL: -1.5, spread: 0.08 });
const NEUTRAL_LEGS = Object.freeze({ hipR: 0, hipL: 0, kneeR: 0.04, kneeL: 0.04, spread: 0 });
const LEG_CHANNELS = ['hipR', 'hipL', 'kneeR', 'kneeL'];

/**
 * Nilai sendi target untuk emote `id` pada detik ke-`elapsed` dari `dur`. Null bila id tak dikenal.
 * Hasil: w (bobot 0..1), r/l = {x,z,e,t} (konvensi lengan kanan) atau null (lengan dibiarkan), spine, headPitch/Yaw/Roll, dip, legs.
 */
export function emotePose(id, elapsed, dur = 2.4) {
  const p = POSES[id];
  if (!p) return null;
  const w = emoteWeight(elapsed, dur);
  const v = { rx: 0, rz: 0, re: 0, rt: 0, lx: 0, lz: 0, le: 0, lt: 0, spine: 0, hp: 0, hy: 0, hr: 0, dip: 0, hipR: 0, hipL: 0, kneeR: 0, kneeL: 0 };
  for (const [ch, amp, f, ph] of p.anim) v[ch] += amp * Math.sin(2 * Math.PI * f * elapsed + ph) * w;
  const arm = (key, pre) => {
    if (!key) return null;
    const a = ARM[key];
    return { x: a.x + v[pre + 'x'], z: a.z + v[pre + 'z'], e: Math.min(2.75, Math.max(0, a.e + v[pre + 'e'])), t: a.t + v[pre + 't'] };
  };
  const usesLegs = p.legs || LEG_CHANNELS.some((c) => v[c] !== 0 || p.anim.some((a) => a[0] === c));
  let legs = null;
  if (usesLegs) {
    const base = p.legs === 'sit' ? SIT_LEGS : NEUTRAL_LEGS;
    legs = { hipR: base.hipR + v.hipR, hipL: base.hipL + v.hipL, kneeR: Math.max(-2.6, base.kneeR + v.kneeR), kneeL: Math.max(-2.6, base.kneeL + v.kneeL), spread: base.spread };
  }
  return {
    w,
    r: arm(p.r, 'r'), l: arm(p.l, 'l'),
    spine: p.spine + v.spine, headPitch: p.head[0] + v.hp, headYaw: p.head[1] + v.hy, headRoll: p.head[2] + v.hr,
    dip: (p.dip ?? 0) + v.dip, legs,
  };
}
