// Menerapkan gerakan duduk/shalat (lihat masjid-posture-data.js) ke avatar. Dipanggil SETELAH applyPose tiap frame.
// Tidak mengubah avatar.js: avatar sederhana diatur lewat sendi yang sudah ada (pivot, paha, lutut, lengan),
// model manusia (rig Mixamo) lewat rotasi tulang yang di-retarget seperti pose prosedural di avatar-human.js.
import * as THREE from 'three';
import { neutralToLocal } from './avatar-human.js';
import { POSES, STAND, easeParams, isStanding } from './masjid-posture-data.js';

const HIP_Y = 0.82; // tinggi panggul avatar sederhana (sama dengan avatar.js)
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const rx = (a) => new THREE.Quaternion().setFromAxisAngle(AX, a);
const ry = (a) => new THREE.Quaternion().setFromAxisAngle(AY, a);
const rz = (a) => new THREE.Quaternion().setFromAxisAngle(AZ, a);
const mul = (...qs) => qs.reduce((acc, q) => acc.multiply(q), new THREE.Quaternion());

/**
 * Model manusia: tiap tulang diberi rotasi (bingkai dunia pose rest, urutan induk lalu anak).
 * Menghadap +Z pada model; lengan kanan menunjuk -X pada T-pose, jadi rz(+) menurunkan lengan kanan.
 */
function applyHuman(rig, p) {
  const B = p.hipTilt + p.spine;
  const set = (key, dq) => {
    const info = rig.model.rest.bones.get(key);
    const bone = rig.bones.get(key);
    if (info && bone) bone.quaternion.copy(neutralToLocal(dq, info));
  };
  set('Hips', rx(p.hipTilt));
  for (const key of ['Spine', 'Spine1', 'Spine2']) set(key, rx(p.spine / 3));
  set('Neck', rx(-p.headComp * B * 0.5));
  set('Head', mul(rx(-p.headComp * B * 0.5), ry(p.headTurn)));
  for (const [side, sgn] of [['Right', 1], ['Left', -1]]) {
    // lengan: turun dari T-pose, ayun ke depan, silang ke tengah; dikurangi bungkuk badan agar tetap menggantung di dunia
    set(`${side}Arm`, mul(rx(-B), ry(sgn * p.armYaw), rx(-p.armFwd), rz(sgn * p.armHang)));
    set(`${side}ForeArm`, ry(sgn * p.elbow));
    // kaki: dikurangi miring panggul agar paha tetap sesuai sudut dunia; paha membuka ke luar lewat putaran vertikal
    set(`${side}UpLeg`, mul(rx(-p.hipTilt), ry(-sgn * p.spread), rx(-p.hipFlex)));
    set(`${side}Leg`, rx(p.knee));
  }
}

/**
 * Avatar sederhana: seluruh badan (termasuk kaki) ada di satu pivot. Bungkuk = memutar pivot di sekitar panggul,
 * lalu paha dan lengan diputar balik sebesar bungkuk itu supaya sudut dunianya tetap sesuai.
 */
function applySimple(avatar, p) {
  const ud = avatar.userData;
  const B = p.hipTilt + p.spine;
  if (ud.pivot) {
    ud.pivot.rotation.x = -B; // negatif = condong ke depan (-z)
    ud.pivot.position.y = HIP_Y * (1 - Math.cos(B)); // putar di sekitar panggul, bukan di kaki
    ud.pivot.position.z = HIP_Y * Math.sin(B);
  }
  for (const [side, sgn] of [['r', 1], ['l', -1]]) {
    const leg = ud.legs?.[side];
    if (leg) {
      leg.hip.rotation.x = p.hipFlex + B;
      leg.hip.rotation.z = sgn * p.spread;
      leg.knee.rotation.x = -p.knee;
    }
    const arm = ud.arms?.[side];
    if (arm) {
      arm.rotation.x = p.armFwd + 0.6 * p.elbow + B; // lengan sederhana tanpa siku: siku dihitung sebagian sebagai ayunan
      arm.rotation.z = -sgn * (0.08 + 0.6 * p.armYaw);
    }
  }
}

function release(avatar) {
  const pivot = avatar.userData.pivot;
  if (pivot) {
    pivot.rotation.x = 0;
    pivot.position.z = 0;
  }
}

/**
 * Terapkan gerakan `poseName` (null = berdiri) dengan perpindahan halus. Mengembalikan pergeseran tinggi avatar
 * (meter, <= 0) yang harus ditambahkan pemanggil ke posisi y. Bila tidak ada gerakan aktif, tidak menyentuh avatar sama sekali.
 */
export function applyPosture(avatar, poseName, delta) {
  const st = (avatar.userData.posture ??= { cur: { ...STAND }, active: false });
  if (!poseName && !st.active) return 0;
  st.active = true;
  easeParams(st.cur, poseName ? POSES[poseName] : STAND, 1 - Math.exp(-7 * Math.max(0, delta)));
  if (!poseName && isStanding(st.cur)) {
    release(avatar);
    st.active = false;
    return 0;
  }
  const human = avatar.userData.human;
  const hipH = human ? human.model.rest.hipsHeight : HIP_Y;
  if (human) applyHuman(human, st.cur);
  else applySimple(avatar, st.cur);
  return -st.cur.sink * hipH;
}
