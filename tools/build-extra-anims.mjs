// Membangun klip animasi TAMBAHAN (anims/extra/<id>.json) dari animasi Mixamo (FBX "Without Skin").
// Langkah: (1) ubah tiap FBX ke GLB dengan FBX2glTF:  FBX2glTF --binary --input A.fbx --output glb/A
//          (2) node build-extra-anims.mjs <dir-glb> <dir-output>   (output biasanya ../game/public/anims/extra)
// Logika retarget sama dengan build-human-assets.mjs (klip netral relatif pose rest, pinggul relatif tinggi pinggul).
// Tambahan: urutan kuarternion dibuat kontinu, fps turun untuk klip panjang, dan pergeseran pinggul (x/z) dibuang
// untuk klip di tempat ('center') atau klip jalan ('detrend'). Klip transisi duduk/berdiri memakai 'keep'.
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';

const [SRC = 'glb', OUT = '../game/public/anims/extra'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const io = new NodeIO();
const boneKey = (name) => name.replace(/^mixamorig:?/, '');
const FINGER = /(Thumb|Index|Middle|Ring|Pinky)\d/;

function buildTree(doc) {
  const map = new Map();
  for (const n of doc.getRoot().listNodes()) {
    const o = new THREE.Object3D();
    o.name = n.getName();
    o.position.fromArray(n.getTranslation());
    o.quaternion.fromArray(n.getRotation());
    o.scale.fromArray(n.getScale());
    map.set(n, o);
  }
  for (const [n, o] of map) for (const c of n.listChildren()) o.add(map.get(c));
  for (const [, o] of map) if (!o.parent) o.updateMatrixWorld(true);
  return map;
}

async function extractNeutral(file, { fps = 24 } = {}) {
  const doc = await io.read(file);
  const tree = buildTree(doc);
  const byName = new Map([...tree].map(([n, o]) => [n.getName(), { o, n }]));
  const hips = byName.get('mixamorig:Hips').o;
  const hipsWorld = new THREE.Vector3().setFromMatrixPosition(hips.matrixWorld);
  const parentScale = new THREE.Vector3();
  hips.parent.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), parentScale);
  const worldX = (name) => new THREE.Vector3().setFromMatrixPosition(byName.get(name).o.matrixWorld).x;
  const faceFix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), worldX('mixamorig:LeftUpLeg') < worldX('mixamorig:RightUpLeg') ? Math.PI : 0);
  const faceFixInv = faceFix.clone().invert();
  const anim = doc.getRoot().listAnimations()[0];
  const tracks = {};
  let duration = 0;
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode();
    const key = boneKey(node.getName());
    if (FINGER.test(key)) continue;
    const entry = byName.get(node.getName());
    if (!entry) continue;
    const times = ch.getSampler().getInput().getArray();
    const values = ch.getSampler().getOutput().getArray();
    duration = Math.max(duration, times[times.length - 1]);
    const parent = entry.o.parent;
    const P = new THREE.Quaternion();
    parent.getWorldQuaternion(P);
    if (ch.getTargetPath() === 'rotation') {
      tracks[key] ??= {};
      tracks[key].r = { t: [...times], v: [...values] };
      tracks[key].P = P; tracks[key].restLocalInv = entry.o.quaternion.clone().invert(); tracks[key].Pinv = P.clone().invert();
    } else if (ch.getTargetPath() === 'translation' && key === 'Hips') {
      tracks[key] ??= {};
      tracks[key].p = { t: [...times], v: [...values], rest: entry.o.position.clone(), P, scale: parentScale.x };
    }
  }
  const frames = Math.max(2, Math.round(duration * fps) + 1);
  const times = Array.from({ length: frames }, (_, i) => +(Math.min(duration, i / fps)).toFixed(4));
  const neutral = { duration: +duration.toFixed(4), fps, times, bones: {}, hips: null };
  const sample = (tr, t) => {
    const ts = tr.t; let i = 0;
    while (i < ts.length - 2 && ts[i + 1] < t) i += 1;
    const a = ts[i], b = ts[Math.min(i + 1, ts.length - 1)];
    const f = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
    return { i, j: Math.min(i + 1, ts.length - 1), f };
  };
  for (const [key, tr] of Object.entries(tracks)) {
    if (tr.r) {
      const arr = [];
      const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), q = new THREE.Quaternion();
      for (const t of times) {
        const { i, j, f } = sample(tr.r, t);
        qa.fromArray(tr.r.v, i * 4); qb.fromArray(tr.r.v, j * 4); q.copy(qa).slerp(qb, f);
        q.premultiply(tr.P).multiply(tr.restLocalInv).multiply(tr.Pinv);
        q.premultiply(faceFix).multiply(faceFixInv);
        arr.push(q.x, q.y, q.z, q.w);
      }
      neutral.bones[key] = arr;
    }
    if (tr.p) {
      const arr = [];
      const v = new THREE.Vector3(), va = new THREE.Vector3(), vb = new THREE.Vector3();
      for (const t of times) {
        const { i, j, f } = sample(tr.p, t);
        va.fromArray(tr.p.v, i * 3); vb.fromArray(tr.p.v, j * 3); v.copy(va).lerp(vb, f).sub(tr.p.rest);
        v.multiplyScalar(tr.p.scale).applyQuaternion(tr.p.P).applyQuaternion(faceFix).divideScalar(hipsWorld.y);
        arr.push(v.x, v.y, v.z);
      }
      neutral.hips = arr;
    }
  }
  return { neutral, hipsHeight: hipsWorld.y };
}

// id: [berkas, kelas, loop, kategori]
// kelas: 'center' (buang offset x/z), 'detrend' (buang pergeseran maju + offset), 'keep' (apa adanya)
const C = {
  wave: ['Waving', 'center', true, 'sosial'],
  wave2: ['Waving_Gesture', 'keep', false, 'sosial'],
  greet: ['Standing_Greeting', 'keep', false, 'sosial'],
  clap: ['Clapping', 'center', true, 'sosial'],
  laugh: ['Laughing', 'center', true, 'emosi'],
  cry: ['Crying', 'center', true, 'emosi'],
  sad: ['Sad_Idle', 'center', true, 'emosi'],
  sad2: ['Sad_Idle__1_', 'center', true, 'emosi'],
  cheer: ['Cheering__1_', 'center', true, 'pesta'],
  cheer2: ['Cheering', 'center', true, 'pesta'],
  talk1: ['Talking', 'center', true, 'bicara'],
  talk2: ['Talking__1_', 'center', true, 'bicara'],
  talk3: ['Talking__2_', 'center', true, 'bicara'],
  pray: ['Praying', 'keep', false, 'hormat'],
  pray2: ['Praying__1_', 'keep', false, 'hormat'],
  macarena: ['Macarena_Dance', 'center', true, 'joget'],
  sit_idle: ['Sitting', 'center', true, 'duduk'],
  sit_clap: ['Sitting_Clap', 'center', true, 'duduk'],
  sit_laugh: ['Sitting_Laughing', 'center', true, 'duduk'],
  sit_cheer1: ['Cheering_While_Sitting', 'center', true, 'duduk'],
  sit_cheer2: ['Cheering_While_Sitting__1_', 'center', true, 'duduk'],
  sit_cheer3: ['Cheering_While_Sitting__2_', 'center', true, 'duduk'],
  sit_cheer4: ['Cheering_While_Sitting__3_', 'center', true, 'duduk'],
  sit_clap2: ['Clapping__1_', 'center', true, 'duduk'],
  sit_down: ['Stand_To_Sit', 'keep', false, 'duduk'],
  stand_up: ['Sit_To_Stand', 'keep', false, 'duduk'],
  standup_clap: ['Standing_Clap', 'keep', false, 'duduk'],
  standup_clap2: ['Standing_Clap__1_', 'keep', false, 'duduk'],
  standup_cheer: ['Standing_Cheering', 'keep', false, 'duduk'],
  walk_back: ['Walking_Backwards', 'detrend', true, 'gerak'],
  strafe_l: ['Left_Strafe_Walking', 'detrend', true, 'gerak'],
  strafe_r: ['Right_Strafe_Walk', 'detrend', true, 'gerak'],
  turn_l: ['Left_Turn', 'keep', false, 'gerak'],
  turn_r: ['Right_Turn', 'keep', false, 'gerak'],
  jump: ['Jumping', 'keep', false, 'gerak'],
};
const hh = ['Hip_Hop_Dancing', ...Array.from({ length: 9 }, (_, i) => `Hip_Hop_Dancing__${i + 1}_`)];
hh.forEach((f, i) => { C[`hiphop${i + 1}`] = [f, 'center', true, 'joget']; });

const r3 = (x) => Math.round(x * 1000) / 1000;
function fixHemisphere(arr) {
  for (let i = 4; i < arr.length; i += 4) {
    const d = arr[i] * arr[i - 4] + arr[i + 1] * arr[i - 3] + arr[i + 2] * arr[i - 2] + arr[i + 3] * arr[i - 1];
    if (d < 0) for (let k = 0; k < 4; k++) arr[i + k] = -arr[i + k];
  }
}
const manifest = {};
for (const [id, [file, cls, loop, cat]] of Object.entries(C)) {
  // durasi dulu untuk memilih fps
  const probe = await extractNeutral(`${SRC}/${file}.glb`, { fps: 24 });
  const d = probe.neutral.duration;
  const fps = d < 3 ? 24 : d > 12 ? 15 : 20;
  const { neutral } = fps === 24 ? probe : await extractNeutral(`${SRC}/${file}.glb`, { fps });
  const n = neutral.times.length;
  const h = neutral.hips;
  if (h && cls !== 'keep') {
    for (const axis of [0, 2]) {
      const first = h[axis], last = h[(n - 1) * 3 + axis];
      if (cls === 'detrend') for (let i = 0; i < n; i++) h[i * 3 + axis] -= (last - first) * (i / (n - 1));
      let mean = 0; for (let i = 0; i < n; i++) mean += h[i * 3 + axis]; mean /= n;
      for (let i = 0; i < n; i++) h[i * 3 + axis] -= mean;
    }
  }
  for (const arr of Object.values(neutral.bones)) fixHemisphere(arr);
  const out = {
    duration: neutral.duration, fps, times: neutral.times.map((t) => +t.toFixed(3)),
    bones: Object.fromEntries(Object.entries(neutral.bones).map(([k, a]) => [k, a.map(r3)])),
    hips: h ? h.map(r3) : null,
  };
  writeFileSync(`${OUT}/${id}.json`, JSON.stringify(out));
  manifest[id] = { loop, duration: +neutral.duration.toFixed(2), cat, kb: Math.round(statSync(`${OUT}/${id}.json`).size / 1024) };
}
writeFileSync(`${OUT}/index.json`, JSON.stringify(manifest));
const tot = Object.values(manifest).reduce((s, m) => s + m.kb, 0);
console.log(Object.keys(manifest).length, 'klip, total', tot, 'KB; terbesar:', Object.entries(manifest).sort((a, b) => b[1].kb - a[1].kb).slice(0, 4).map(([k, m]) => `${k} ${m.kb}KB`).join(', '));
