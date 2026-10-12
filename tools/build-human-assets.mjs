// Membangun aset avatar manusia:
//  1) model karakter (rig Mixamo) dioptimalkan: tanpa animasi, tekstur WebP <= 1024px
//  2) pustaka animasi "netral" (diam, jalan, lari, joget) yang bisa dipakai karakter mana pun dengan rig Mixamo,
//     walau orientasi tulang berbeda (retarget lewat pose-T dunia).
// Pemakaian: node build-human-assets.mjs <dir-sumber> <dir-output-game/public>
//   sumber: Michelle.glb (karakter + SambaDance) dan Soldier.glb (Idle/Walk/Run).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, weld, simplify, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from 'three';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';

const [src = '/tmp/models', out = '../game/public'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const boneKey = (name) => name.replace(/^mixamorig:?/, '');
const FINGER = /(Thumb|Index|Middle|Ring|Pinky)\d/;
const FPS = 24;

/** Bangun pohon THREE.Object3D dari dokumen glTF untuk membaca rotasi/posisi pose-rest dunia. */
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

async function extractClips(file, clipNames) {
  const doc = await io.read(`${src}/${file}`);
  const tree = buildTree(doc);
  const byName = new Map([...tree].map(([n, o]) => [n.getName(), { o, n }]));
  const hips = byName.get('mixamorig:Hips').o;
  const hipsWorld = new THREE.Vector3().setFromMatrixPosition(hips.matrixWorld);
  const parentScale = new THREE.Vector3();
  hips.parent.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), parentScale);
  // Bingkai kanonik: karakter menghadap +Z (sisi kiri di +X). Model yang menghadap -Z diputar 180 derajat.
  const worldX = (name) => new THREE.Vector3().setFromMatrixPosition(byName.get(name).o.matrixWorld).x;
  const faceFix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), worldX('mixamorig:LeftUpLeg') < worldX('mixamorig:RightUpLeg') ? Math.PI : 0);
  const faceFixInv = faceFix.clone().invert();
  const res = {};
  for (const anim of doc.getRoot().listAnimations()) {
    if (!clipNames.includes(anim.getName())) continue;
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
        const restLocalInv = entry.o.quaternion.clone().invert();
        const Pinv = P.clone().invert();
        tracks[key] ??= {};
        tracks[key].r = { t: [...times], v: [...values] };
        tracks[key].P = P; tracks[key].restLocalInv = restLocalInv; tracks[key].Pinv = Pinv;
      } else if (ch.getTargetPath() === 'translation' && key === 'Hips') {
        tracks[key] ??= {};
        tracks[key].p = { t: [...times], v: [...values], rest: entry.o.position.clone(), P, scale: parentScale.x };
      }
    }
    // Resample ke FPS tetap dan konversi ke bentuk netral.
    const frames = Math.max(2, Math.round(duration * FPS) + 1);
    const times = Array.from({ length: frames }, (_, i) => +(Math.min(duration, i / FPS)).toFixed(4));
    const neutral = { duration: +duration.toFixed(4), fps: FPS, times, bones: {}, hips: null };
    const sample = (tr, t, stride) => {
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
          const { i, j, f } = sample(tr.r, t, 4);
          qa.fromArray(tr.r.v, i * 4); qb.fromArray(tr.r.v, j * 4); q.copy(qa).slerp(qb, f);
          // q_norm = P * q * restLocal^-1 * P^-1 (rotasi relatif terhadap rest, dalam bingkai dunia)
          q.premultiply(tr.P).multiply(tr.restLocalInv).multiply(tr.Pinv);
          q.premultiply(faceFix).multiply(faceFixInv); // ke bingkai kanonik
          arr.push(+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4));
        }
        neutral.bones[key] = arr;
      }
      if (tr.p) {
        const arr = [];
        const v = new THREE.Vector3(), va = new THREE.Vector3(), vb = new THREE.Vector3();
        for (const t of times) {
          const { i, j, f } = sample(tr.p, t, 3);
          va.fromArray(tr.p.v, i * 3); vb.fromArray(tr.p.v, j * 3); v.copy(va).lerp(vb, f).sub(tr.p.rest);
          v.multiplyScalar(tr.p.scale).applyQuaternion(tr.p.P).applyQuaternion(faceFix).divideScalar(hipsWorld.y); // dunia, relatif tinggi pinggul
          arr.push(+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4));
        }
        neutral.hips = arr;
      }
    }
    res[anim.getName()] = neutral;
  }
  return { clips: res, hipsHeight: hipsWorld.y };
}

mkdirSync(`${out}/models`, { recursive: true });
mkdirSync(`${out}/anims`, { recursive: true });

// 1) Pustaka animasi
const soldier = await extractClips('Soldier.glb', ['Idle', 'Walk', 'Run']);
const michelle = await extractClips('Michelle.glb', ['SambaDance']);
const library = { idle: soldier.clips.Idle, walk: soldier.clips.Walk, run: soldier.clips.Run, samba: michelle.clips.SambaDance };
writeFileSync(`${out}/anims/library.json`, JSON.stringify(library));
console.log('library.json', (statSync(`${out}/anims/library.json`).size / 1024).toFixed(0), 'KB; tinggi pinggul', soldier.hipsHeight.toFixed(3), michelle.hipsHeight.toFixed(3));

// 2) Model karakter
const doc = await io.read(`${src}/Michelle.glb`);
for (const a of doc.getRoot().listAnimations()) a.dispose();
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.45, error: 0.002 }),
  reorder({ encoder: MeshoptEncoder }),
  prune(),
  dedup(),
  quantize({ quantizeWeight: 12 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
);
await io.write(`${out}/models/michelle.glb`, doc);
console.log('michelle.glb', (statSync(`${out}/models/michelle.glb`).size / 1024).toFixed(0), 'KB');
