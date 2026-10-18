// Hero Mansion Horor: model glTF berangka Mixamo + animasi (diam/lari/mengendap/terkena/mati).
// Pemilihan animasi dibuat murni (heroAnim/resolveClip) supaya bisa diuji tanpa THREE/DOM; bagian THREE hanya di HeroRig.
// Konvensi arah game horor: rot = 0 menghadap +z, maju = (sin rot, cos rot). Model Mixamo menghadap +z, jadi tanpa putaran tambahan.
//
// Berkas model: game/public/models/horor/*.glb. Hero bawaan: hero.glb (klip: Idle, CrouchWalk, Run, WalkTurnLeft, HitReaction, Die).
// Hero lain cukup diunggah ke folder yang sama (daftar & pemilihnya ada di horor-heroes.js); semua hero memakai nama klip yang sama.
// Bila berkasnya belum ada, createHero() memakai tokoh pengganti (kapsul) dengan API yang sama, jadi game tetap jalan.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { clamp } from './horor-core.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
export const HERO_FILE = 'models/horor/hero.glb';
export const HERO_HEIGHT = 1.8;
export const HERO_CLIPS = Object.freeze(['Idle', 'CrouchWalk', 'Run', 'WalkTurnLeft', 'HitReaction', 'Die']);

/** Kecepatan (m/s) yang cocok dengan satu siklus tiap klip pada timeScale 1. Sesuaikan bila kaki terlihat "meluncur". */
export const REF_SPEED = Object.freeze({ Run: 4.0, Walk: 1.4, CrouchWalk: 1.2 });
/** Di bawah ini dianggap diam; di atas WALK_MAX dipakai klip lari. */
export const MOVE_EPS = 0.1;
export const WALK_MAX = 2.0;

const ONE_SHOT = new Set(['HitReaction', 'Die']);

/**
 * Pilih klip dari keadaan hero. state = { speed (m/s), crouch, dead, hurt }.
 * Mengembalikan { clip, loop, timeScale, speed }. Urutan prioritas: mati > terkena > bergerak > diam.
 */
export function heroAnim({ speed = 0, crouch = false, dead = false, hurt = false } = {}) {
  const v = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  if (dead) return { clip: 'Die', loop: false, timeScale: 1, speed: v };
  if (hurt) return { clip: 'HitReaction', loop: false, timeScale: 1, speed: v };
  if (v < MOVE_EPS) return { clip: 'Idle', loop: true, timeScale: 1, speed: v };
  if (crouch) return { clip: 'CrouchWalk', loop: true, timeScale: clamp(v / REF_SPEED.CrouchWalk, 0.5, 1.6), speed: v };
  if (v >= WALK_MAX) return { clip: 'Run', loop: true, timeScale: clamp(v / REF_SPEED.Run, 0.7, 1.5), speed: v };
  return { clip: 'Walk', loop: true, timeScale: clamp(v / REF_SPEED.Walk, 0.6, 1.5), speed: v };
}

/**
 * Sesuaikan rencana dengan klip yang ada di model. Klip "Walk" belum ada di hero.glb: sementara dipakai klip Run
 * yang diperlambat. Begitu klip Walk ditambahkan ke GLB, tidak ada kode yang perlu diubah.
 */
export function resolveClip(plan, available) {
  const has = available instanceof Set ? available : new Set(available);
  if (has.has(plan.clip)) return plan;
  if (plan.clip === 'Walk' && has.has('Run')) {
    return { ...plan, clip: 'Run', timeScale: clamp(plan.speed / REF_SPEED.Run, 0.35, 1) };
  }
  if (plan.clip === 'CrouchWalk' && has.has('Run')) {
    return { ...plan, clip: 'Run', timeScale: clamp(plan.speed / REF_SPEED.Run, 0.3, 0.8) };
  }
  if (has.has('Idle')) return { clip: 'Idle', loop: true, timeScale: 1, speed: plan.speed };
  return null;
}

// ---------- Pemuatan model ----------
const modelPromises = new Map(); // jalur berkas -> Promise; tiap hero dimuat sekali

/** Muat satu berkas hero (jalur relatif BASE_URL, bawaan hero.glb) sekali dan di-cache. Ditolak bila berkasnya tidak ada atau rusak. */
export function loadHeroModel(file = HERO_FILE) {
  let promise = modelPromises.get(file);
  if (!promise) {
    promise = new GLTFLoader().loadAsync(`${BASE}${file}`).then((gltf) => {
      const scene = gltf.scene;
      const box = new THREE.Box3().setFromObject(scene);
      const scale = HERO_HEIGHT / (box.max.y - box.min.y);
      scene.scale.setScalar(scale);
      scene.position.y = -box.min.y * scale;
      const holder = new THREE.Group();
      holder.add(scene);
      scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.frustumCulled = false; // mesh berangka: kotak batas dari pose rest tidak ikut animasi
        }
      });
      return { holder, clips: gltf.animations };
    });
    modelPromises.set(file, promise);
    // gagal tidak boleh di-cache: kalau berkas baru diunggah, muat ulang berikutnya harus mencoba lagi
    promise.catch(() => { if (modelPromises.get(file) === promise) modelPromises.delete(file); });
  }
  return promise;
}

/** Pengendali animasi satu hero. root = Group yang ditambahkan ke scene; atur posisi lewat setPose. */
export class HeroRig {
  constructor(model) {
    this.root = cloneSkinned(model.holder);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const clip of model.clips) {
      const a = this.mixer.clipAction(clip);
      if (ONE_SHOT.has(clip.name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      } else {
        a.setLoop(THREE.LoopRepeat, Infinity);
      }
      this.actions[clip.name] = a;
    }
    this.available = new Set(Object.keys(this.actions));
    this.current = null;
    this.hurtLeft = 0; // sisa waktu klip HitReaction yang masih dikunci
    this.dead = false;
    this.placeholder = false;
    this._play({ clip: 'Idle', loop: true, timeScale: 1, speed: 0 }, 0);
  }

  setPose(x, z, rot) {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = rot;
  }

  /** Mulai reaksi terkena serangan (tidak menimpa kematian, dan tidak mengulang selama klipnya masih jalan). */
  hurt() {
    if (this.dead || this.hurtLeft > 0 || !this.actions.HitReaction) return;
    this.hurtLeft = this.actions.HitReaction.getClip().duration;
  }

  /** state = { speed, crouch, dead }. dt dalam detik. */
  update(dt, state = {}) {
    if (state.dead) this.dead = true;
    this.hurtLeft = Math.max(0, this.hurtLeft - dt);
    const plan = heroAnim({ ...state, dead: this.dead, hurt: this.hurtLeft > 0 });
    const use = resolveClip(plan, this.available);
    if (use) this._play(use, use.clip === 'Die' ? 0.1 : use.clip === 'HitReaction' ? 0.05 : 0.2);
    this.mixer.update(dt);
  }

  _play(plan, fade) {
    const next = this.actions[plan.clip];
    if (!next) return;
    if (this.current === plan.clip) {
      next.setEffectiveTimeScale(plan.timeScale);
      return;
    }
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(plan.timeScale).play();
    const prev = this.current ? this.actions[this.current] : null;
    if (prev) (fade > 0 ? prev.crossFadeTo(next, fade, false) : prev.stop());
    this.current = plan.clip;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}

/** Pengganti saat berkas hero belum ada: kapsul gelap dengan API sama, tanpa animasi. */
export class PlaceholderHero {
  constructor() {
    this.root = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, HERO_HEIGHT - 0.56, 4, 10),
      new THREE.MeshLambertMaterial({ color: 0x2a2a33 }),
    );
    body.position.y = HERO_HEIGHT / 2;
    body.castShadow = true;
    this.root.add(body);
    this.placeholder = true;
    this.current = 'Idle';
    this.dead = false;
  }

  setPose(x, z, rot) {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = rot;
  }

  hurt() {}

  update(_dt, state = {}) {
    if (state.dead && !this.dead) {
      this.dead = true;
      this.root.rotation.x = -Math.PI / 2; // roboh telentang
      this.root.position.y = 0.2;
    }
  }

  dispose() {
    this.root.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }
}

/**
 * Buat hero dari satu berkas (jalur relatif BASE_URL; dari pilihan pemain: createHero(heroPath(picker.hero))).
 * Model animasi bila berkasnya termuat, kalau tidak kapsul pengganti. Selalu mengembalikan objek yang bisa dipakai.
 */
export async function createHero(file = HERO_FILE) {
  try {
    return new HeroRig(await loadHeroModel(file));
  } catch {
    return new PlaceholderHero();
  }
}
