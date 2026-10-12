import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { boneKeyOf, buildClip, neutralToLocal, proceduralPose, readRest } from './avatar-human.js';

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
