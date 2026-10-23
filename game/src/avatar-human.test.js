import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HumanRig, SEAT_CLIP_LIFT, boneKeyOf, buildClip, neutralToLocal, proceduralPose, readRest } from './avatar-human.js';

/** Rig mini: Hips(rotasi rest -90 derajat X) -> Spine -> LeftArm (rest berotasi), dibungkus 'Character' berskala 0.01. */
function miniRig() {
  const root = new THREE.Group();
  const character = new THREE.Group();
  character.scale.setScalar(0.01);
  const mk = (name, pos, q) => { const b = new THREE.Bone(); b.name = name; b.position.set(...pos); if (q) b.quaternion.copy(q); return b; };
  const hips = mk('mixamorigHips', [0, 100, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
  const spine = mk('mixamorigSpine', [0, 10, 0], null);
  const arm = mk('mixamorigLeftArm', [5, 10, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.3));
  hips.add(spine); spine.add(arm); character.add(hips); root.add(character);
  return root;
}

test('boneKeyOf menghapus awalan mixamorig', () => {
  assert.equal(boneKeyOf('mixamorigLeftArm'), 'LeftArm');
  assert.equal(boneKeyOf('mixamorig:Hips'), 'Hips');
});

test('retarget: delta netral identitas menghasilkan pose rest, dan delta dipetakan konsisten', () => {
  const rest = readRest(miniRig());
  const arm = rest.bones.get('LeftArm');
  const idLocal = neutralToLocal(new THREE.Quaternion(), arm);
  assert.ok(idLocal.angleTo(arm.restLocal) < 1e-6);
  // Rotasi dunia hasil = delta dunia * rest dunia (bila induk di pose rest).
  const delta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.0);
  const local = neutralToLocal(delta, arm);
  const worldNow = arm.P.clone().multiply(local);
  const worldRest = arm.P.clone().multiply(arm.restLocal);
  const expected = delta.clone().multiply(worldRest);
  assert.ok(worldNow.angleTo(expected) < 1e-6);
});

test('buildClip: membuat track rotasi per tulang dan track posisi pinggul berskala tinggi pinggul', () => {
  const rest = readRest(miniRig());
  const neutral = {
    duration: 1, fps: 2, times: [0, 0.5, 1],
    bones: { Hips: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], LeftArm: [0, 0, 0, 1, 0, 0, 0.1, 0.995, 0, 0, 0, 1], TidakAda: [0, 0, 0, 1] },
    hips: [0, 0, 0, 0, 0.1, 0, 0, 0, 0],
  };
  const clip = buildClip('uji', neutral, rest);
  const names = clip.tracks.map((t) => t.name).sort();
  assert.deepEqual(names, ['mixamorigHips.position', 'mixamorigHips.quaternion', 'mixamorigLeftArm.quaternion']);
  const pos = clip.tracks.find((t) => t.name === 'mixamorigHips.position').values;
  assert.ok(Math.abs(pos[1] - pos[4]) > 0, 'ada gerak naik');
  assert.ok(Number.isFinite(pos[4]) && Math.abs(pos[4] - pos[1]) < 20, 'skala masuk akal (cm, bukan meter)');
});

test('proceduralPose: duduk menekuk kaki, aksi tangan menyentuh tulang yang benar, aksi tak dikenal kosong', () => {
  assert.deepEqual(Object.keys(proceduralPose(null, 0, true)).sort(), ['LeftLeg', 'LeftUpLeg', 'RightLeg', 'RightUpLeg']);
  assert.ok('RightArm' in proceduralPose('wave', 0.2, false));
  assert.ok('LeftArm' in proceduralPose('clap', 0.2, false) && 'RightArm' in proceduralPose('clap', 0.2, false));
  assert.ok('Spine' in proceduralPose('bow', 0, false));
  assert.deepEqual(proceduralPose('ngawur', 0, false), {});
});

test('HumanRig: model dihadapkan ke -Z (depan game), bukan +Z bawaan Mixamo', () => {
  const holder = new THREE.Group();
  holder.add(miniRig());
  const rest = readRest(holder);
  const rig = new HumanRig({ holder, rest, clips: {} });
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.root.quaternion); // +Z model -> arah dunia
  assert.ok(forward.z < -0.99, `depan model harus -Z, dapat z=${forward.z}`);
});

/** Rig dengan klip kosong bernama seperti klip asli, cukup untuk menguji pemilihan klip duduk. */
function seatRig(withSit = true) {
  const holder = new THREE.Group();
  holder.add(miniRig());
  const rest = readRest(holder);
  const mk = (name, duration, loop) => {
    const c = new THREE.AnimationClip(name, duration, []);
    c.userData = { loop };
    return c;
  };
  const clips = { idle: mk('idle', 1, true), walk: mk('walk', 1, true) };
  if (withSit) Object.assign(clips, { sit_idle: mk('sit_idle', 2, true), sit_down: mk('sit_down', 1, false), stand_up: mk('stand_up', 1, false) });
  return new HumanRig({ holder, rest, clips });
}
const step = (rig, act, seated, seconds) => {
  for (let i = 0; i < Math.round(seconds / 0.016); i += 1) rig.update(act, i * 0.016, 0.016, seated);
};

test('HumanRig duduk: sit_down sekali, lalu sit_idle, lalu stand_up, lalu kembali idle', () => {
  const rig = seatRig();
  step(rig, null, false, 0.1);
  assert.equal(rig.current, 'idle');
  step(rig, null, true, 0.1);
  assert.equal(rig.current, 'sit_down');
  step(rig, null, true, 1.2);
  assert.equal(rig.current, 'sit_idle');
  step(rig, null, false, 0.1);
  assert.equal(rig.current, 'stand_up');
  step(rig, null, false, 1.2);
  assert.equal(rig.current, 'idle');
});

test('HumanRig duduk: avatar yang baru muncul sudah duduk langsung sit_idle tanpa transisi', () => {
  const rig = seatRig();
  step(rig, null, true, 0.1);
  assert.equal(rig.current, 'sit_idle');
});

test('HumanRig duduk: berjalan sesudah bangun memotong stand_up', () => {
  const rig = seatRig();
  step(rig, null, true, 0.1);
  step(rig, 'walk', false, 0.1);
  assert.equal(rig.current, 'walk');
});

test('HumanRig duduk: tanpa klip duduk memakai perilaku lama (idle + paha prosedural)', () => {
  const rig = seatRig(false);
  step(rig, null, true, 0.1);
  assert.equal(rig.current, 'idle');
  assert.equal(rig.root.position.y, 0, 'tanpa klip duduk tidak ada imbangan');
});

test('HumanRig duduk: imbangan 0,3 m tetap di lantai bawah, lantai atas, dan panggung; dilepas saat berdiri', () => {
  // y grup avatar duduk bergantung tempatnya (-0,3 di lantai dasar, 3,1 di lantai 2 vila, 0,24 di altar), imbangannya sama
  for (const groupY of [-0.3, 3.1, 0.24, 23.7]) {
    const rig = seatRig();
    const group = new THREE.Group();
    group.userData.config = {};
    group.position.y = groupY;
    group.add(rig.root);
    step(rig, null, true, 0.1);
    assert.ok(Math.abs(rig.root.position.y - SEAT_CLIP_LIFT) < 1e-9, `y grup ${groupY}: imbangan ${rig.root.position.y}`);
    step(rig, null, false, 0.1);
    assert.equal(rig.root.position.y, 0);
  }
});
