// Pose duduk di kursi mobil untuk avatar sederhana dan avatar manusia (rig Mixamo): kaki ke depan di bawah dasbor, punggung bersandar
// sebesar seatFit (car-seating.js) dan kepala diimbangi supaya tetap menatap ke depan, sehingga kepala tidak menembus atap.
//
// Dipanggil SESUDAH applyPose di tiap frame, oleh pemain lokal (hotel-main.js) dan pemain lain (multiplayer-view.js). Pemanggil juga mengisi
// group.userData.seated = true dan group.userData.seatKind = 'car' SEBELUM applyPose (avatar-human.js memakainya untuk kaki manusia).
import * as THREE from 'three';
import { neutralToLocal } from './avatar-human.js';

// Kaki avatar sederhana: paha hampir mendatar, betis maju ke bawah dasbor (kursi biasa membuat betis tegak ke lantai dan kaki menjuntai di bawah pintu).
export const SIMPLE_LEGS = Object.freeze({ hip: 1.45, spread: 0.06, knee: -0.5 });
export const HEAD_LEVEL = 0.85; // bagian sandaran yang diimbangi kepala (sisanya menengadah sedikit, seperti pengemudi sungguhan)
const SPINE = ['Spine', 'Spine1', 'Spine2'];
const NECK_SHARE = 0.3; // bagian imbangan kepala yang ditanggung leher (sisanya kepala)
const AXIS_X = new THREE.Vector3(1, 0, 0);
const rx = (a) => new THREE.Quaternion().setFromAxisAngle(AXIS_X, a);

/** Avatar sederhana: kaki ke depan, badan atas (punggung, lengan, kepala) condong ke belakang pada pinggul, kepala menunduk mengimbangi. */
function reclineSimple(ud, angle) {
  if (ud.legs) {
    for (const [side, spread] of [['r', SIMPLE_LEGS.spread], ['l', -SIMPLE_LEGS.spread]]) {
      const leg = ud.legs[side];
      if (!leg) continue;
      leg.hip.rotation.x = SIMPLE_LEGS.hip;
      leg.hip.rotation.z = spread;
      leg.knee.rotation.x = SIMPLE_LEGS.knee;
    }
  }
  if (ud.upper) ud.upper.rotation.x = angle; // + = condong ke belakang (+z; depan avatar = -z)
  if (ud.headPivot) ud.headPivot.rotation.x -= angle * HEAD_LEVEL; // applyPose menulis ulang sudut kepala tiap frame, jadi ini tidak menumpuk
}

/**
 * Avatar manusia: tiga ruas tulang belakang bersandar (nilai mutlak, tidak menumpuk antar frame), leher dan kepala diimbangi di atas
 * sudut tengok/angguk yang baru ditulis applyPose. Kaki sudah diatur avatar-human.js (seatKind 'car').
 * Sumbu rx di bingkai netral: positif = condong ke depan (seperti 'bow' di avatar-human.js), jadi bersandar = negatif.
 */
function reclineHuman(human, angle) {
  const rest = human.model?.rest?.bones;
  const bones = human.bones;
  if (!rest || !bones) return;
  for (const key of SPINE) {
    const info = rest.get(key);
    const bone = bones.get(key);
    if (info && bone) bone.quaternion.copy(neutralToLocal(rx(-angle / SPINE.length), info));
  }
  const level = angle * HEAD_LEVEL;
  for (const [key, share] of [['Neck', NECK_SHARE], ['Head', 1 - NECK_SHARE]]) {
    const info = rest.get(key);
    const bone = bones.get(key);
    if (!info || !bone) continue;
    bone.quaternion.premultiply(info.Pinv.clone().multiply(rx(level * share)).multiply(info.P));
  }
}

/**
 * Terapkan pose duduk mobil ke avatar `group`. fit = { simple, human } (sudut sandaran dari Fleet.seatPose().fit).
 * Avatar manusia yang sudah dimuat memakai fit.human, selain itu (termasuk saat model manusia masih memuat) fit.simple.
 * Mengembalikan true bila diterapkan.
 */
export function applyCarSeat(group, fit) {
  const ud = group?.userData;
  if (!ud || !fit) return false;
  const human = ud.human ?? null;
  const angle = human ? fit.human : fit.simple;
  if (!Number.isFinite(angle)) return false;
  if (human) reclineHuman(human, angle);
  else reclineSimple(ud, angle);
  return true;
}
