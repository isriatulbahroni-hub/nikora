// Avatar manusia (rig Mixamo): model glTF + animasi netral (diam/jalan/lari/joget) yang di-retarget ke tiap karakter.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HUMAN_ROSTER } from './avatar-roster.js';
import { EXTRA_CLIPS, loadExtraNeutral } from './avatar-extra-anims.js';
import { attachRecolor } from './avatar-recolor.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
export const HUMAN_HEIGHT = 1.75;
// Daftar karakter ada di avatar-roster.js (satu sumber untuk editor, jaringan, dan pemuat model ini).
export const HUMAN_MODELS = HUMAN_ROSTER.map(({ id, name, file }) => ({ id, name, file }));

export const boneKeyOf = (name) => name.replace(/^mixamorig:?/, '');

// ---------- Retarget: klip netral -> klip untuk satu model ----------
/** Ambil nilai rest tiap tulang (rotasi dunia induk, rotasi lokal, posisi) dari scene yang masih pose rest. */
export function readRest(scene) {
  scene.updateMatrixWorld(true);
  const bones = new Map();
  scene.traverse((o) => {
    if (!o.isBone || !/^mixamorig/.test(o.name)) return;
    const P = new THREE.Quaternion();
    if (o.parent) o.parent.getWorldQuaternion(P);
    bones.set(boneKeyOf(o.name), { object: o, name: o.name, P, Pinv: P.clone().invert(), restLocal: o.quaternion.clone(), restPos: o.position.clone() });
  });
  const hips = bones.get('Hips');
  const hipsWorld = new THREE.Vector3().setFromMatrixPosition(hips.object.matrixWorld);
  const parentScale = new THREE.Vector3();
  hips.object.parent.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), parentScale);
  return { bones, hipsHeight: hipsWorld.y, hipsParentScale: parentScale.x };
}

/** q_lokal = P^-1 * q_norm * P * restLocal  (kebalikan dari proses pembuatan pustaka netral). */
export function neutralToLocal(qNorm, bone) {
  return qNorm.clone().premultiply(bone.Pinv).multiply(bone.P).multiply(bone.restLocal);
}

export function buildClip(name, neutral, rest, loop = true) {
  const tracks = [];
  const q = new THREE.Quaternion();
  for (const [key, arr] of Object.entries(neutral.bones)) {
    const bone = rest.bones.get(key);
    if (!bone) continue;
    const values = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i += 4) {
      q.set(arr[i], arr[i + 1], arr[i + 2], arr[i + 3]);
      neutralToLocal(q, bone).toArray(values, i);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, neutral.times, values));
  }
  if (neutral.hips) {
    const hips = rest.bones.get('Hips');
    const values = new Float32Array(neutral.hips.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < values.length; i += 3) {
      v.set(neutral.hips[i], neutral.hips[i + 1], neutral.hips[i + 2]).multiplyScalar(rest.hipsHeight / rest.hipsParentScale);
      v.applyQuaternion(hips.Pinv).add(hips.restPos).toArray(values, i);
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, neutral.times, values));
  }
  const clip = new THREE.AnimationClip(name, neutral.duration, tracks);
  clip.userData = { loop };
  return clip;
}

// ---------- Pose prosedural (aksi tangan, membungkuk, duduk) ----------
const rx = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
const ry = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
const rz = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
const D = Math.PI / 180;
const mul = (...qs) => qs.reduce((a, b) => a.multiply(b), new THREE.Quaternion());

/**
 * Delta (bingkai induk-rest dunia) per tulang untuk satu aksi. Mengembalikan {Kunci: Quaternion}.
 * seated: false | true (kursi biasa: paha mendatar, betis tegak ke lantai) | 'car' (kursi mobil: betis maju ke bawah dasbor).
 */
export function proceduralPose(act, t, seated) {
  const d = {};
  if (seated === 'car') {
    // Duduk di mobil: paha hampir mendatar dan betis miring ke depan (sekitar 48 derajat dari tegak). Pose kursi biasa membuat telapak
    // menjuntai sampai ke tanah, menembus lantai mobil dan terlihat di bawah pintu.
    d.LeftUpLeg = rx(-86 * D); d.RightUpLeg = rx(-86 * D);
    d.LeftLeg = rx(38 * D); d.RightLeg = rx(38 * D);
  } else if (seated) {
    d.LeftUpLeg = rx(-88 * D); d.RightUpLeg = rx(-88 * D);
    d.LeftLeg = rx(88 * D); d.RightLeg = rx(88 * D);
  }
  switch (act) {
    case 'wave':
      d.RightArm = mul(rz(-75 * D), ry(10 * D));
      d.RightForeArm = rz((-35 + Math.sin(t * 12) * 30) * D);
      break;
    case 'highfive':
      d.RightArm = rz(-150 * D);
      break;
    case 'handshake':
      d.RightArm = mul(ry(75 * D), rz(25 * D));
      d.RightForeArm = ry(-25 * D);
      break;
    case 'clap': {
      const c = Math.abs(Math.sin(t * 14));
      d.RightArm = mul(ry(70 * D), rz(20 * D));
      d.LeftArm = mul(ry(-70 * D), rz(-20 * D));
      d.RightForeArm = ry((-55 + c * 25) * D);
      d.LeftForeArm = ry((55 - c * 25) * D);
      break;
    }
    case 'spin':
      d.RightArm = rz(20 * D); d.LeftArm = rz(-20 * D); // lengan terentang sedikit turun saat berputar
      break;
    case 'bow':
      d.Spine = rx(18 * D); d.Spine1 = rx(22 * D); d.Spine2 = rx(15 * D);
      break;
    default:
  }
  return d;
}

// ---------- Pemuatan model ----------
const modelCache = new Map();
let libraryPromise = null;

export function loadLibrary() {
  libraryPromise ??= fetch(`${BASE}anims/library.json`).then((r) => {
    if (!r.ok) throw new Error(`library ${r.status}`);
    return r.json();
  });
  return libraryPromise;
}

export function loadHumanModel(id) {
  if (!modelCache.has(id)) {
    const entry = HUMAN_MODELS.find((m) => m.id === id);
    if (!entry) return Promise.reject(new Error(`model tidak dikenal: ${id}`));
    const promise = Promise.all([new GLTFLoader().loadAsync(`${BASE}${entry.file}`), loadLibrary()]).then(([gltf, library]) => {
      const scene = gltf.scene;
      const box = new THREE.Box3().setFromObject(scene);
      const scale = HUMAN_HEIGHT / (box.max.y - box.min.y);
      scene.scale.setScalar(scale);
      scene.position.y = -box.min.y * scale;
      const holder = new THREE.Group();
      holder.add(scene);
      scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      const rest = readRest(holder);
      const clips = {};
      for (const [name, neutral] of Object.entries(library)) clips[name] = buildClip(name, neutral, rest);
      return { holder, rest, clips };
    });
    modelCache.set(id, promise);
  }
  return modelCache.get(id);
}

const CLIP_FOR_ACT = { dance: 'samba', walk: 'walk' };
const POSE_ACTS = ['wave', 'highfive', 'handshake', 'clap', 'bow', 'spin'];
/** Aksi tangan yang masih boleh ditumpuk di atas klip duduk (bungkuk dan putar tidak masuk akal saat duduk). */
const SIT_POSE_ACTS = ['wave', 'highfive', 'handshake', 'clap'];
/**
 * Semua tempat acara menurunkan avatar duduk 0,3 m dari permukaan tempat duduknya (SEATED_DROP = -0,3, di setiap lantai,
 * panggung, dan pulau). Klip duduk sudah menurunkan panggul sendiri, jadi penurunan itu diimbangi sebesar ini.
 */
export const SEAT_CLIP_LIFT = 0.3;

/** Pengendali animasi satu karakter manusia. */
export class HumanRig {
  constructor(model) {
    this.model = model;
    this.root = cloneSkinned(model.holder);
    // Model Mixamo menghadap +Z, sedangkan game memakai -Z sebagai depan (gerak, kursi, avatar sederhana).
    this.root.rotation.y = Math.PI;
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    this.loading = new Set();
    this.forcedClip = null; // klip tambahan yang dipaksakan stiker (emoji-sticker-fx.js); hanya berlaku saat diam dan tidak duduk
    this.sit = { seated: null, clip: null, t: 0 }; // status duduk: transisi sit_down/stand_up yang sedang diputar
    this.disposed = false;
    this.recolor = attachRecolor(this.root); // warna jaket/rambut/kulit per bagian bila model punya peta area; selain itu null
    this.recolorKey = null;
    for (const [name, clip] of Object.entries(model.clips)) this.addAction(name, clip);
    this.bones = new Map();
    this.root.traverse((o) => { if (o.isBone && /^mixamorig/.test(o.name)) this.bones.set(boneKeyOf(o.name), o); });
    this.current = null;
    this.play('idle', 0);
  }

  /** Terapkan pilihan warna pemain (userData.config milik grup avatar) bila berubah sejak frame lalu. */
  syncColors() {
    if (!this.recolor) return;
    let g = this.root.parent;
    while (g && !g.userData?.config) g = g.parent;
    const cfg = g?.userData.config;
    if (!cfg) return;
    const key = `${cfg.o}.${cfg.k}.${cfg.s}`;
    if (key === this.recolorKey) return;
    this.recolorKey = key;
    this.recolor.apply(cfg);
  }

  /** 'car' bila grup avatar pembungkus rig ini ditandai userData.seatKind = 'car' (duduk di kursi mobil); selain itu null. */
  seatKind() {
    let g = this.root.parent;
    while (g && !g.userData?.legs) g = g.parent; // grup avatar = yang menyimpan userData.legs (createAvatar)
    return g?.userData.seatKind ?? null;
  }

  addAction(name, clip) {
    const a = this.mixer.clipAction(clip);
    if (clip.userData?.loop === false) {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true; // tahan pose terakhir sampai klip berikutnya
    } else a.setLoop(THREE.LoopRepeat, Infinity);
    this.actions[name] = a;
  }

  /** Klip tambahan (anims/extra). True bila siap diputar; bila belum, memulai pemuatan di latar dan mengembalikan false. */
  extraReady(id) {
    if (this.actions[id]) return true;
    if (!Object.hasOwn(EXTRA_CLIPS, id) || this.loading.has(id)) return false;
    this.loading.add(id); // juga mencegah pemuatan ulang bila berkasnya belum ada
    loadExtraNeutral(id).then((neutral) => {
      if (!neutral || this.disposed) return;
      this.model.clips[id] ??= buildClip(id, neutral, this.model.rest, EXTRA_CLIPS[id]);
      this.addAction(id, this.model.clips[id]);
    });
    return false;
  }

  /**
   * Klip duduk yang harus diputar: 'sit_down' sekali saat baru duduk, 'sit_idle' selama duduk, 'stand_up' sekali saat bangun.
   * Null bila klipnya belum dimuat (avatar memakai pose paha prosedural lama sampai klip siap).
   */
  sitClip(seated, act, delta) {
    const s = this.sit;
    if (seated) {
      this.extraReady('sit_down'); // muat lebih dulu supaya transisi pertama tidak terlewat
      this.extraReady('stand_up');
    }
    if (s.seated === null) s.seated = seated; // avatar yang baru muncul langsung duduk/berdiri tanpa transisi
    else if (seated !== s.seated) {
      s.seated = seated;
      s.clip = null;
      s.t = 0;
      const id = seated ? 'sit_down' : 'stand_up';
      if (this.extraReady(id)) s.clip = id;
    }
    if (s.clip) {
      s.t += delta;
      // sesudah bangun, berjalan langsung memotong transisi
      if (s.t >= this.actions[s.clip].getClip().duration || (!seated && act === 'walk')) s.clip = null;
    }
    if (s.clip) return s.clip;
    return seated && this.extraReady('sit_idle') ? 'sit_idle' : null;
  }

  play(name, fade = 0.25) {
    if (this.current === name || !this.actions[name]) return;
    const next = this.actions[name];
    next.reset().setEffectiveWeight(1).play();
    if (this.current && fade > 0) this.actions[this.current].crossFadeTo(next, fade, false);
    else if (this.current) this.actions[this.current].stop();
    this.current = name;
  }

  update(act, t, delta, seated = false) {
    this.syncColors();
    const seat = seated && this.seatKind() === 'car' ? 'car' : seated; // duduk di mobil: pose kaki khusus (tanpa klip kursi)
    const sitting = seat === 'car' ? null : this.sitClip(seated, act, delta);
    const extra = this.forcedClip && !seated && !sitting && act !== 'walk' && this.extraReady(this.forcedClip) ? this.forcedClip : null;
    // Duduk dengan klip asli: hanya aksi tangan yang ditumpuk, paha tidak dipaksa lagi.
    const wantsPose = sitting ? seated && SIT_POSE_ACTS.includes(act) : seat || (!extra && POSE_ACTS.includes(act));
    this.root.position.y = sitting && seated ? SEAT_CLIP_LIFT : 0;
    this.play(sitting ?? extra ?? CLIP_FOR_ACT[act] ?? 'idle');
    this.mixer.update(delta);
    if (!wantsPose) return;
    const delta3 = proceduralPose(act, t, sitting ? false : seat);
    for (const [key, dq] of Object.entries(delta3)) {
      const info = this.model.rest.bones.get(key);
      const bone = this.bones.get(key);
      if (info && bone) bone.quaternion.copy(neutralToLocal(dq, info));
    }
  }

  dispose() {
    this.disposed = true;
    this.recolor?.dispose();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}
