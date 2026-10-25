// Memasang gerak pada model GLB mobil dari NAMA node/bahan (THREE). Driver Blender hilang saat ekspor, jadi geraknya dihitung ulang di sini
// dengan rumus yang sama dengan driver di file Blender (CAR_CTRL):
//   pintu  : node DOOR_L / DOOR_R (engsel di tepi depan). Putar X lokal sebesar open_angle_deg (68) lalu condong keluar sebesar lean_deg (28)
//            pada sumbu Y Blender; Y Blender = -Z glTF, jadi condongnya memutar sumbu Z dengan tanda terbalik.
//   atap   : node ROOF. Naik lift_z (0,085 m) pada sepertiga pertama gerak, lalu bergeser ke belakang slide_y (0,42 m) (Y Blender = -Z glTF).
//   lampu  : bahan SIG_L_0..2 / SIG_R_0..2 (sein, menyapu 3 lensa lalu padam, siklus 1 detik), Headlight LED, Reverse Lamp: yang diubah emissive-nya.
// Nilai bawaan boleh ditimpa lewat node.userData (custom property Blender yang ikut terekspor): open_angle_deg, lean_deg, arah_lean, lift_z, slide_y.
// Pose bawaan berkas harus POSE TERTUTUP (CAR_CTRL: door_L = door_R = roof = 0 saat ekspor).
import * as THREE from 'three';

const DOOR_NAME = /^(?:door|pintu)[_ .-]?(l|r|left|right|kiri|kanan)(?:\.?\d+)?$/i;
const ROOF_NAME = /^(?:roof|atap)(?:\.?\d+)?$/i;
const SIG_MAT = /^SIG_([LR])_(\d)/i;
const HEAD_MAT = /^headlight[_ ]?led/i;
const REV_MAT = /^reverse[_ ]?lamp/i;

export const DOOR_OPEN_DEG = 68;
export const DOOR_LEAN_DEG = 28;
export const ROOF_LIFT = 0.085;
export const ROOF_SLIDE = 0.42;
const DOOR_RATE = 4; // 1/detik: pintu menghampiri tujuannya secara eksponensial
const ROOF_SPEED = 0.4; // bagian/detik: atap bergerak lurus (2,5 detik penuh)
const DEG = Math.PI / 180;
const SIG_OFF = 0.3;
const SIG_ON = 3;
const HEAD_ON = 2.5;
const REV_ON = 2.5;
// Warna emissive cadangan bila ekspor menghasilkan emissive hitam (kekuatan emission 0 saat ekspor menghapus warnanya).
const SIG_COLOR = 0xff9a1a;
const HEAD_COLOR = 0xfff1cf;
const REV_COLOR = 0xffffff;

const AX = new THREE.Vector3(1, 0, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const qx = new THREE.Quaternion();
const qz = new THREE.Quaternion();
const asArray = (m) => (Array.isArray(m) ? m : [m]);
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) !== 0 ? Number(v) : d);

/** Lensa sein ke-`index` (0..2) menyala pada waktu `time` (detik): menyapu 0, 4, 8 dari 30 bingkai, semua padam di bingkai 20 (sama dengan driver SIG_*). */
export function signalLit(index, time) {
  const phase = (((time % 1) + 1) % 1) * 30;
  return phase >= 4 * index && phase < 20;
}

/** Cari bagian bergerak di pohon model. Mengembalikan rig (daftar kosong bila tidak ada yang dikenali: model tetap tampil seperti biasa). */
export function rigParts(root) {
  const rig = { doors: [], roofs: [], signals: [], heads: [], reverses: [] };
  const seen = new Set();
  const lamp = (m, color, off) => {
    if (!m.emissive) return false;
    if (m.emissive.getHex() === 0) m.emissive.setHex(color);
    m.emissiveIntensity = off;
    return true;
  };
  root.traverse((o) => {
    const name = o.name || '';
    const dm = DOOR_NAME.exec(name);
    if (dm) {
      const side = /^(l|left|kiri)$/i.test(dm[1]) ? 1 : -1; // + = kiri mobil (+x)
      const ud = o.userData ?? {};
      rig.doors.push({
        node: o,
        side,
        rest: o.quaternion.clone(),
        open: num(ud.open_angle_deg, DOOR_OPEN_DEG) * DEG,
        lean: num(ud.lean_deg, DOOR_LEAN_DEG) * DEG,
        leanSign: num(ud.arah_lean, side),
        amount: 0,
      });
    } else if (ROOF_NAME.test(name)) {
      const ud = o.userData ?? {};
      rig.roofs.push({ node: o, rest: o.position.clone(), lift: num(ud.lift_z, ROOF_LIFT), slide: num(ud.slide_y, ROOF_SLIDE), amount: 0 });
    }
    if (!o.isMesh) return;
    for (const m of asArray(o.material)) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      const mn = m.name || '';
      const sm = SIG_MAT.exec(mn);
      if (sm) {
        if (lamp(m, SIG_COLOR, SIG_OFF)) rig.signals.push({ m, side: sm[1].toUpperCase() === 'L' ? 1 : -1, index: Number(sm[2]) });
      } else if (HEAD_MAT.test(mn)) {
        if (lamp(m, HEAD_COLOR, 0)) rig.heads.push(m);
      } else if (REV_MAT.test(mn)) {
        if (lamp(m, REV_COLOR, 0)) rig.reverses.push(m);
      }
    }
  });
  return rig;
}

const approach = (cur, target, rate, dt) => {
  const n = cur + (target - cur) * (1 - Math.exp(-rate * dt));
  return Math.abs(target - n) < 0.002 ? target : n;
};
const moveToward = (cur, target, step) => (Math.abs(target - cur) <= step ? target : cur + Math.sign(target - cur) * step);

/**
 * Terapkan keadaan ke rig satu frame. t = { doorL, doorR, roof, lights, hazard, indicator (-1 kiri, 0, +1 kanan), reverse }, dt detik, time = jam animasi (detik).
 */
export function applyParts(rig, t, dt, time) {
  const step = Math.max(0, dt);
  for (const d of rig.doors) {
    d.amount = approach(d.amount, (d.side > 0 ? t.doorL : t.doorR) ? 1 : 0, DOOR_RATE, step);
    qx.setFromAxisAngle(AX, d.open * d.amount);
    qz.setFromAxisAngle(AZ, -d.lean * d.leanSign * d.amount);
    d.node.quaternion.copy(d.rest).multiply(qz).multiply(qx);
  }
  for (const r of rig.roofs) {
    r.amount = moveToward(r.amount, t.roof ? 1 : 0, ROOF_SPEED * step);
    const a = r.amount;
    r.node.position.set(r.rest.x, r.rest.y + r.lift * (a > 1 / 3 ? 1 : a * 3), r.rest.z - r.slide * Math.max(a * 1.5 - 0.5, 0));
  }
  const left = t.hazard || t.indicator < 0;
  const right = t.hazard || t.indicator > 0;
  for (const s of rig.signals) s.m.emissiveIntensity = (s.side > 0 ? left : right) && signalLit(s.index, time) ? SIG_ON : SIG_OFF;
  for (const m of rig.heads) m.emissiveIntensity = t.lights ? HEAD_ON : 0;
  for (const m of rig.reverses) m.emissiveIntensity = t.reverse ? REV_ON : 0;
}
