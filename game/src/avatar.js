import * as THREE from 'three';
import { CHARACTERS, HAIR_COLORS, OUTFITS, SKINS, sanitizeConfig } from './avatar-config.js';
import { HumanRig, loadHumanModel, neutralToLocal } from './avatar-human.js';
import { auraFor } from './avatar-aura.js';
import { GAIT, gaitPose, labelMetrics, stepGait } from './villa-motion.js';
import { FALL_TOTAL, HEAD_YAW_MAX, LIE_ROLL, createMannersRegistry, fallPose, idleGlance } from './avatar-manners.js';
import { emotePose } from './avatar-emotes.js';

// Proporsi avatar sederhana (meter): tinggi total ±1,72 m, kepala ±1/7,5 tinggi badan, kaki ±47% tinggi.
const HIP_Y = 0.82;
const THIGH = 0.4;
const SHANK = 0.38;
const NECK_Y = 1.4; // pangkal leher = sumbu putar kepala (tengok kiri-kanan, mengangguk)
const HEAD_Y = 1.55;
const HEAD_R = 0.155;
const LABEL_Y = 1.95;
const GEAR_SCALE = HEAD_R / 0.3; // aksesori/rambut dirancang untuk kepala r=0,3 di y=1,37
const GEAR_Y = HEAD_Y - 1.37 * GEAR_SCALE;
const SEAT_HIP = 1.32; // duduk di kursi: paha sedikit miring ke bawah supaya telapak kaki menapak lantai (panggul turun 0,3 m)
const TAU = Math.PI * 2;

/** Nama melayang di atas kepala dimatikan agar layar tidak penuh tulisan; tambahkan ?nama=1 pada alamat untuk menampilkannya. */
function namesVisible() {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('nama') === '1';
  } catch {
    return false;
  }
}

export function makeLabel(text) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = '600 26px sans-serif';
  const w = Math.min(244, Math.ceil(ctx.measureText(text).width) + 30);
  const x = (256 - w) / 2;
  ctx.fillStyle = 'rgba(16,22,20,0.5)';
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, 16, w, 32, 16);
    ctx.fill();
  } else {
    ctx.fillRect(x, 16, w, 32); // browser lama tanpa roundRect
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33, w - 30);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
  sprite.scale.set(0.8, 0.2, 1);
  sprite.position.y = LABEL_Y;
  sprite.renderOrder = 5;
  return sprite;
}

const labelPos = new THREE.Vector3();
/** Ukuran label dijaga tetap di layar (tidak membesar saat kamera dekat); memudar bila terlalu dekat atau jauh. Panggil tiap frame. */
export function updateLabel(group, camera) {
  const label = group.userData?.label;
  if (!label) return;
  label.getWorldPosition(labelPos);
  const { height, opacity } = labelMetrics(labelPos.distanceTo(camera.position), camera.fov);
  label.scale.set(height * 4, height, 1);
  label.material.opacity = opacity;
  label.visible = opacity > 0.02;
}

/** Avatar sederhana: badan, kepala (bisa menoleh), wajah, kaki, lengan bersiku, dan nama opsional. Depan = -z. */
export function createAvatar({ color = 0x70c7a2, skin = 0xf1e3d3, name = null, config = null } = {}) {
  const cfg = config ? sanitizeConfig(config) : null;
  if (cfg) {
    color = OUTFITS[cfg.o].hex;
    skin = SKINS[cfg.s].hex;
  }
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
  const pantsMaterial = new THREE.MeshStandardMaterial({ color: 0x2f3a4d, roughness: 0.7 });
  const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1a1f, roughness: 0.6 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x26332d, roughness: 0.74 });
  const mesh = (geometry, material, x, y, z) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };

  const body = mesh(new THREE.CapsuleGeometry(0.15, 0.24, 5, 12), bodyMaterial, 0, 1.08, 0);
  body.scale.set(1.3, 1, 0.85); // bahu lebih lebar dari dada
  const neck = mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 10), skinMaterial, 0, 1.4, 0);
  const markerMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const marker = mesh(new THREE.SphereGeometry(0.03, 8, 6), markerMaterial, 0, 1.2, -0.125);
  // Kepala di pivot sendiri (di pangkal leher) supaya bisa menoleh ke kiri-kanan dan mengangguk tanpa memutar badan.
  const headPivot = new THREE.Group();
  headPivot.position.set(0, NECK_Y, 0);
  headPivot.rotation.order = 'YXZ'; // menoleh dulu, baru mengangguk
  const head = mesh(new THREE.SphereGeometry(HEAD_R, 18, 14), skinMaterial, 0, HEAD_Y - NECK_Y, 0);
  const face = new THREE.Group(); // mata dikelompokkan agar bisa disembunyikan saat stiker menampilkan ekspresi
  for (const sx of [-0.058, 0.058]) face.add(mesh(new THREE.SphereGeometry(0.017, 8, 6), eyeMaterial, sx, HEAD_Y + 0.015 - NECK_Y, -(HEAD_R - 0.013)));
  headPivot.add(head, face);
  group.add(body, neck, marker, headPivot);
  group.userData.face = face;
  group.userData.headPivot = headPivot;
  group.userData.faceAnchor = { y: HEAD_Y, z: -(HEAD_R + 0.02), size: HEAD_R * 1.5 }; // tempat overlay ekspresi (emoji-sticker-fx.js)

  // Lengan: bahu (pivot) -> lengan atas -> siku (pivot) -> lengan bawah + telapak. Bahu menggantung ke bawah (-y);
  // rotation.x = +90° mengarahkan lengan ke depan (-z). Siku menekuk ke depan dengan rotation.x positif.
  const armMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const arms = {};
  const elbows = {};
  for (const [side, sx] of [['l', -0.24], ['r', 0.24]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, 1.28, 0);
    pivot.rotation.order = 'XZY'; // putar lengan atas (y) dulu, lalu buka ke samping (z), lalu ayun ke depan (x); lihat avatar-emotes.js
    const elbow = new THREE.Group();
    elbow.position.y = -0.27;
    elbow.add(mesh(new THREE.CapsuleGeometry(0.046, 0.13, 4, 8), armMaterial, 0, -0.12, 0), mesh(new THREE.SphereGeometry(0.055, 10, 8), skinMaterial, 0, -0.255, 0));
    pivot.add(mesh(new THREE.CapsuleGeometry(0.05, 0.17, 4, 8), armMaterial, 0, -0.135, 0), elbow);
    group.add(pivot);
    arms[side] = pivot;
    elbows[side] = elbow;
  }

  // Kaki: pinggul (paha) dan lutut (betis + sepatu), rotation.x positif = ayun ke depan (-z).
  const legs = {};
  for (const [side, sx] of [['l', -0.095], ['r', 0.095]]) {
    const hip = new THREE.Group();
    hip.position.set(sx, HIP_Y, 0);
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    // telapak di grup pergelangan sendiri supaya bisa diratakan ke lantai saat betis terlipat (bersila, duduk di atas tumit)
    const ankle = new THREE.Group();
    ankle.position.y = -SHANK;
    ankle.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.26), shoeMaterial, 0, 0, -0.05));
    knee.add(mesh(new THREE.CapsuleGeometry(0.065, 0.26, 4, 8), pantsMaterial, 0, -0.19, 0), ankle);
    hip.add(mesh(new THREE.CapsuleGeometry(0.075, 0.26, 4, 8), pantsMaterial, 0, -0.2, 0), knee);
    group.add(hip);
    legs[side] = { hip, knee, ankle };
  }

  // Badan atas (badan, leher, kepala, lengan) di pivot pinggul supaya bisa membungkuk (hormat, tertawa, sedih) tanpa memutar kaki.
  const upper = new THREE.Group();
  upper.position.set(0, HIP_Y, 0);
  for (const part of [body, neck, marker, headPivot, arms.l, arms.r]) {
    part.position.y -= HIP_Y;
    upper.add(part);
  }
  group.add(upper);
  group.userData.upper = upper;
  group.userData.arms = arms;
  group.userData.elbows = elbows;
  group.userData.legs = legs;
  group.userData.tint = [bodyMaterial, markerMaterial, armMaterial];
  group.userData.skin = skinMaterial;
  group.userData.body = body;
  // Semua bagian tubuh masuk ke satu pivot supaya bisa berputar (gestur 'spin') dan turun-naik saat berjalan.
  const spinPivot = new THREE.Group();
  for (const child of [...group.children]) spinPivot.add(child);
  group.add(spinPivot);
  group.userData.pivot = spinPivot;
  group.userData.parts = [...spinPivot.children]; // bagian avatar sederhana (disembunyikan saat memakai model manusia)
  if (cfg) setAvatarConfig(group, cfg);
  if (name && namesVisible()) {
    const label = makeLabel(name);
    if (label) {
      group.add(label);
      group.userData.label = label;
    }
  }
  return group;
}

/** Ganti warna badan avatar (badan, penanda, lengan) tanpa membuat ulang model. */
export function setAvatarColor(group, color) {
  for (const m of group.userData?.tint ?? []) m.color.set(color);
}

/** Warna konsisten per id pemain: semua perangkat menghitung warna yang sama dari id yang sama. */
export function colorForId(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.55, 0.58).getHex();
}

/** Gelembung obrolan (sprite) di atas kepala avatar. Teks dipotong dan dibungkus maksimal 3 baris. */
export function makeBubble(text) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = '600 30px sans-serif';
  const lines = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > 440 && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 3);
  if (lines.length > 3) shown[2] = `${shown[2].slice(0, 28)}…`;
  const height = 28 + shown.length * 38;
  const top = 160 - height - 14;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(24, top, 464, height, 22);
    ctx.fill();
  } else {
    ctx.fillRect(24, top, 464, height); // browser lama tanpa roundRect
  }
  ctx.fillStyle = '#1b1620';
  ctx.textAlign = 'center';
  shown.forEach((l, i) => ctx.fillText(l, 256, top + 46 + i * 38));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
  sprite.scale.set(3.2, 1, 1);
  sprite.position.y = 2.95;
  sprite.renderOrder = 10;
  return sprite;
}


const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Status duduk. Penanda eksplisit (userData.seated) menang; bila tidak ada (aula dan Royal hanya menurunkan avatar 0,3 m),
 * panggul yang turun di bawah lantai berarti duduk. Gerak duduk/shalat masjid punya pengendali sendiri, jadi dikecualikan.
 */
function isSeated(group) {
  const ud = group.userData;
  return ud?.seated === true || (ud?.posture?.active !== true && group.position.y < -0.1);
}

/** Sudut siku (rad, menekuk ke depan) per aksi, dan saat duduk tangan bertumpu di paha. */
function elbowTargets(act, seated) {
  if (seated) return { r: 1.22, l: 1.22 };
  if (act === 'handshake') return { r: 0.5, l: 0 };
  if (act === 'wave') return { r: 0.8, l: 0 };
  if (act === 'clap') return { r: 1, l: 1 };
  if (act === 'dance') return { r: 0.6, l: 0.6 };
  return { r: 0, l: 0 };
}

/**
 * Pose berdasarkan aksi. act: null | 'handshake' | 'wave' | 'highfive' | 'bow' | 'clap' | 'walk' | 'fall'.
 * t: waktu (detik). speed: laju nyata avatar (m/s); menentukan ayunan kaki/lengan. Tanpa speed, 'walk' = laju penuh.
 * group.userData.seated = true membuat avatar duduk seperti manusia: punggung tegak, paha hampir mendatar (sedikit miring
 * supaya telapak menapak lantai), betis tegak, lutut sedikit terbuka, tangan bertumpu di paha.
 * group.userData.lie = 'up' | 'left' | 'right' membuat avatar berbaring telentang atau miring (kemiringan badan 90° diatur pemanggil lewat rotation.x).
 * Dipanggil tiap frame; halus karena peluruhan eksponensial. Di atas pose dasar ditambahkan lapisan sopan santun
 * (tengok, hormat, jatuh) dari avatar-manners.js.
 */
export function applyPose(group, act, t, delta = 1 / 60, speed) {
  const ud = group.userData;
  if (ud?.pivot && ud.mLift) ud.pivot.position.y -= ud.mLift; // lapisan frame lalu dilepas dulu supaya tidak menumpuk
  if (ud?.pivot && ud.eDip) {
    ud.pivot.position.y -= ud.eDip;
    ud.eDip = 0;
  }
  applyPoseBase(group, act === 'fall' ? null : act, t, delta, speed);
  applyManners(group, act, t, delta);
  applyEmote(group, act, delta, speed);
}

/**
 * Emote berpose penuh (avatar-emotes.js): userData.emote = { id, t0, dur } (t0 dalam detik, jam performance.now()/1000).
 * Berjalan, duduk, berbaring, jatuh, dan model manusia mengalahkan emote. Dipanggil terakhir, di atas pose dasar dan sopan santun:
 * lengan memakai konvensi lengan kanan (kiri dicerminkan: z dan t dibalik), badan atas membungkuk di pinggul
 * (spine + = condong ke depan = -z), kepala menambah tengok/angguk/miring, dip menurunkan badan (duduk).
 */
function applyEmote(group, act, delta, speed) {
  const ud = group.userData;
  const up = ud?.upper;
  const arms = ud?.arms;
  const elbows = ud?.elbows;
  if (!up || !arms || !elbows || ud.human) return;
  const k = 1 - Math.exp(-14 * Math.max(0, delta));
  for (const side of ['r', 'l']) arms[side].rotation.y = lerp(arms[side].rotation.y, 0, k); // putaran lengan atas kembali saat emote selesai

  const em = ud.emote;
  const dur = em?.dur ?? 2.4;
  const elapsed = em ? clock() - em.t0 : -1;
  const blocked = act === 'walk' || act === 'fall' || (speed ?? 0) > 0.6 || isSeated(group) || typeof ud.lie === 'string' || ud.posture?.active === true || ud.m?.fallStart != null;
  const e = em && !blocked && elapsed >= 0 && elapsed < dur ? emotePose(em.id, elapsed, dur) : null;
  const hp = ud.headPivot;
  if (!e || e.w < 0.001) {
    up.rotation.x = lerp(up.rotation.x, 0, k);
    if (hp) hp.rotation.z = lerp(hp.rotation.z, 0, k);
    return;
  }
  const w = e.w;
  const setArm = (side, a, sgn) => {
    if (!a) return; // lengan dibiarkan mengikuti pose dasar
    arms[side].rotation.x = mix(arms[side].rotation.x, a.x, w);
    arms[side].rotation.z = mix(arms[side].rotation.z, sgn * a.z, w);
    arms[side].rotation.y = mix(arms[side].rotation.y, sgn * a.t, w);
    elbows[side].rotation.x = mix(elbows[side].rotation.x, a.e, w);
    elbows[side].rotation.z = mix(elbows[side].rotation.z, 0, w);
  };
  setArm('r', e.r, 1);
  setArm('l', e.l, -1);
  up.rotation.x = -e.spine * w; // negatif = condong ke depan (-z)
  if (hp) {
    hp.rotation.y += e.headYaw * w; // + = menoleh ke kiri
    hp.rotation.x -= e.headPitch * w; // + = menunduk
    hp.rotation.z = e.headRoll * w; // + = miring ke kiri
  }
  const legs = ud.legs;
  if (e.legs && legs) {
    legs.r.hip.rotation.x = mix(legs.r.hip.rotation.x, e.legs.hipR, w);
    legs.l.hip.rotation.x = mix(legs.l.hip.rotation.x, e.legs.hipL, w);
    legs.r.knee.rotation.x = mix(legs.r.knee.rotation.x, e.legs.kneeR, w);
    legs.l.knee.rotation.x = mix(legs.l.knee.rotation.x, e.legs.kneeL, w);
    legs.r.hip.rotation.z = mix(legs.r.hip.rotation.z, e.legs.spread, w);
    legs.l.hip.rotation.z = mix(legs.l.hip.rotation.z, -e.legs.spread, w);
  }
  const dip = e.dip * w;
  if (ud.pivot && dip) {
    ud.pivot.position.y += dip;
    ud.eDip = dip;
  }
}

function applyPoseBase(group, act, t, delta, speed) {
  // gestur dari stiker emoji (emoji-sticker-fx.js): berjalan tetap menang, dan tidak dipaksakan saat duduk
  const forced = group.userData?.forcedAct;
  if (forced && act !== 'walk' && !((speed ?? 0) > 0.6) && !isSeated(group) && !(group.position.y < -0.1)) act = forced;
  const spinPivot = group.userData?.pivot;
  if (spinPivot) spinPivot.rotation.y = act === 'spin' ? (t * Math.PI * 2 * 1.25) % (Math.PI * 2) : 0; // putar satu kali tiap ~0,8 detik
  animateAura(group, t);
  const human = group.userData?.human;
  if (human) {
    group.rotation.x = 0; // model manusia tidak memakai condong; kemiringan tidur/jatuh ditambahkan pemanggil sesudahnya
    human.update(act, t, delta, isSeated(group)); // duduk: penanda seated, atau y turun di aula/Royal
    return;
  }
  const arms = group.userData?.arms;
  if (!arms) return;
  const k = 1 - Math.exp(-14 * Math.max(0, delta));
  const seated = isSeated(group);
  const gait = (group.userData.gait ??= { phase: 0, amp: 0 });
  const next = stepGait(gait, seated ? 0 : speed ?? (act === 'walk' ? GAIT.maxSpeed : 0), delta);
  gait.phase = next.phase;
  gait.amp = next.amp;
  const gp = gaitPose(gait.phase, gait.amp);

  let r = { x: 0, z: -0.08 };
  let l = { x: 0, z: 0.08 };
  let lean = 0;
  if (act === 'handshake') {
    r = { x: 1.35 + Math.sin(t * 9) * 0.12, z: -0.12 }; // tangan kanan terulur, naik-turun kecil
    lean = 0.06;
  } else if (act === 'highfive') {
    r = { x: 2.7, z: -0.1 };
  } else if (act === 'wave') {
    r = { x: 2.9, z: -0.45 + Math.sin(t * 12) * 0.35 };
  } else if (act === 'spin') {
    r = { x: 1.5, z: -0.7 };
    l = { x: 1.5, z: 0.7 };
  } else if (act === 'bow') {
    lean = 0.55;
  } else if (act === 'clap') {
    const c = Math.abs(Math.sin(t * 14));
    r = { x: 1.2, z: -0.35 + c * 0.3 };
    l = { x: 1.2, z: 0.35 - c * 0.3 };
  } else if (act === 'dance') {
    const s = Math.sin(t * 8);
    r = { x: 2.6 + s * 0.3, z: -0.4 + s * 0.3 };
    l = { x: 2.6 - s * 0.3, z: 0.4 - s * 0.3 };
    lean = s * 0.12;
  } else if (seated) {
    // duduk tegak: lengan atas turun dekat badan, siku menekuk, telapak bertumpu di atas paha
    r = { x: 0.08, z: -0.18 };
    l = { x: 0.08, z: 0.18 };
    lean = 0;
  } else {
    // jalan / diam: lengan mengayun berlawanan dengan kaki sisi yang sama, mengecil halus saat berhenti
    r = { x: gp.armR, z: -0.08 };
    l = { x: gp.armL, z: 0.08 };
    lean = gp.lean;
  }
  arms.r.rotation.x = lerp(arms.r.rotation.x, r.x, k);
  arms.r.rotation.z = lerp(arms.r.rotation.z, r.z, k);
  arms.l.rotation.x = lerp(arms.l.rotation.x, l.x, k);
  arms.l.rotation.z = lerp(arms.l.rotation.z, l.z, k);
  const elbows = group.userData.elbows;
  if (elbows) {
    const e = elbowTargets(act, seated);
    elbows.r.rotation.x = lerp(elbows.r.rotation.x, e.r, k);
    elbows.l.rotation.x = lerp(elbows.l.rotation.x, e.l, k);
    elbows.r.rotation.z = lerp(elbows.r.rotation.z, 0, k);
    elbows.l.rotation.z = lerp(elbows.l.rotation.z, 0, k);
  }

  const legs = group.userData.legs;
  if (legs) {
    const hipR = seated ? SEAT_HIP : gp.hipR; // duduk: paha hampir mendatar, sedikit miring ke bawah
    const hipL = seated ? SEAT_HIP : gp.hipL;
    const kneeR = seated ? -SEAT_HIP : gp.kneeR; // betis menggantung tegak, telapak rata di lantai
    const kneeL = seated ? -SEAT_HIP : gp.kneeL;
    const spread = seated ? 0.08 : 0; // lutut sedikit terbuka (rotasi z: + = ke luar untuk kaki kanan)
    const lk = seated || gait.amp < 0.02 ? k : 1; // sambil berjalan langsung mengikuti siklus; duduk/berdiri dihaluskan
    legs.r.hip.rotation.x = lerp(legs.r.hip.rotation.x, hipR, lk);
    legs.l.hip.rotation.x = lerp(legs.l.hip.rotation.x, hipL, lk);
    legs.r.hip.rotation.z = lerp(legs.r.hip.rotation.z, spread, k);
    legs.l.hip.rotation.z = lerp(legs.l.hip.rotation.z, -spread, k);
    legs.r.knee.rotation.x = lerp(legs.r.knee.rotation.x, kneeR, lk);
    legs.l.knee.rotation.x = lerp(legs.l.knee.rotation.x, kneeL, lk);
    for (const side of ['r', 'l']) {
      const ankle = legs[side].ankle;
      if (!ankle) continue;
      ankle.rotation.x = lerp(ankle.rotation.x, 0, k);
      ankle.rotation.y = lerp(ankle.rotation.y, 0, k);
    }
  }
  if (spinPivot) spinPivot.position.y = lerp(spinPivot.position.y, seated ? 0 : gp.dip, k);
  group.userData.leanTarget = lean;
  group.userData.leanNow = lerp(group.userData.leanNow ?? 0, lean, k);
  group.rotation.x = group.userData.leanNow;
}

// ---------------------------------------------------------------- lapisan sopan santun
// Dipanggil sesudah pose dasar. Mengatur: kepala menoleh (ke avatar terdekat di depan, atau melirik sesekali saat diam),
// hormat (menunduk sedikit + tangan kanan di dada) saat dua avatar berhadapan dekat, berbaring miring, dan jatuh.
const manners = createMannersRegistry();
let lastMannersStep = -1;
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
const mix = (a, b, w) => a + (b - a) * w;
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const qx = (a) => new THREE.Quaternion().setFromAxisAngle(AX, a);
const qy = (a) => new THREE.Quaternion().setFromAxisAngle(AY, a);
const qz = (a) => new THREE.Quaternion().setFromAxisAngle(AZ, a);
const qmul = (...qs) => qs.reduce((acc, q) => acc.multiply(q), new THREE.Quaternion());

/** Model manusia (rig Mixamo): kepala menoleh/mengangguk, dan saat hormat tulang belakang membungkuk sedikit + tangan kanan ke dada. */
function layerHuman(human, m) {
  const bones = human.model.rest.bones;
  const put = (key, dq, weight = 1) => {
    const info = bones.get(key);
    const bone = human.bones.get(key);
    if (!info || !bone) return;
    const target = neutralToLocal(dq, info);
    if (weight >= 0.999) bone.quaternion.copy(target);
    else bone.quaternion.slerp(target, weight);
  };
  put('Neck', qy(m.yaw * 0.35));
  put('Head', qmul(qx(m.pitch), qy(m.yaw * 0.65)));
  const w = m.w.salute;
  if (w > 0.01) {
    put('Spine', qx(0.09), w);
    put('Spine1', qx(0.09), w);
    put('Spine2', qx(0.07), w);
    put('RightArm', qmul(qy(0.9), qx(-0.5), qz(1.3)), w); // lengan kanan naik ke depan dada
    put('RightForeArm', qy(2.3), w); // siku menekuk, telapak di dada
  }
}

function applyManners(group, act, t, delta) {
  const ud = group.userData;
  if (!ud) return;
  const m = (ud.m ??= { yaw: 0, pitch: 0, roll: 0, lift: 0, spd: 0, has: false, px: 0, pz: 0, fallStart: null, seed: Math.random() * TAU, w: { salute: 0, lie: 0, fall: 0 } });
  if (group.rotation.order !== 'YXZ') group.rotation.order = 'YXZ'; // miring (tidur/jatuh) dalam bingkai avatar, lalu arah hadap
  const dt = Math.max(delta, 1e-3);
  const k = 1 - Math.exp(-14 * Math.max(0, delta));
  const now = clock();

  // laju nyata (m/s) dari perpindahan posisi, dihaluskan
  const px = group.position.x;
  const pz = group.position.z;
  if (m.has) m.spd += (Math.hypot(px - m.px, pz - m.pz) / dt - m.spd) * (1 - Math.exp(-8 * dt));
  m.px = px;
  m.pz = pz;
  m.has = true;

  // jatuh: dimulai saat act 'fall' pertama kali terlihat (lokal maupun dari pemain lain), lalu berjalan sendiri sampai bangun
  if (act === 'fall' && m.fallStart === null) m.fallStart = t;
  let fall = null;
  if (m.fallStart !== null) {
    const e = t - m.fallStart;
    if (e >= FALL_TOTAL && act !== 'fall') m.fallStart = null;
    else fall = fallPose(clamp(e, 0, FALL_TOTAL));
  }
  const falling = fall !== null && fall.w > 0.001;
  const posture = ud.posture?.active === true; // gerak shalat/duduk bersila di masjid memakai pengendali sendiri
  const lying = typeof ud.lie === 'string';
  const seated = isSeated(group);
  const busy = act != null || seated || lying || posture || fall !== null;

  manners.touch(group.uuid, { x: px, z: pz, y: group.position.y, rot: group.rotation.y, busy, speed: m.spd }, now);
  if (now - lastMannersStep > 0.012 || now < lastMannersStep) {
    manners.step(now);
    lastMannersStep = now;
  }
  const gw = busy ? 0 : manners.greeting(group.uuid, now);

  // kepala: menengok avatar terdekat di depan; saat diam melirik sesekali; saat tidur/jatuh lurus
  const look = manners.look(group.uuid);
  let yawT = 0;
  if (!lying && !falling) {
    if (posture) yawT = ud.posture?.cur?.headTurn ?? 0; // salam ke kanan/kiri
    else if (look) yawT = clamp(look.rel, -HEAD_YAW_MAX, HEAD_YAW_MAX);
    else if (m.spd < 0.6) yawT = idleGlance(t, m.seed);
  }
  const pitchT = lying || falling ? 0 : 0.34 * gw; // mengangguk saat memberi hormat
  const kh = 1 - Math.exp(-7 * Math.max(0, delta));
  m.yaw += (yawT - m.yaw) * kh;
  m.pitch += (pitchT - m.pitch) * kh;

  // bobot lapisan (dihaluskan)
  const wantSalute = gw > 0 && !posture && !lying && !falling && !seated;
  m.w.salute = lerp(m.w.salute, wantSalute ? gw : 0, k);
  m.w.lie = lerp(m.w.lie, lying ? 1 : 0, k);
  m.w.fall = falling ? fall.w : 0;
  m.roll = lerp(m.roll, lying ? LIE_ROLL[ud.lie] ?? 0 : 0, k);
  m.lift = falling ? fall.lift : 0;

  const pivot = ud.pivot;
  if (pivot) {
    pivot.rotation.y += m.roll; // berbaring miring: badan berputar pada sumbu panjangnya
    pivot.position.y += m.lift; // saat jatuh badan diangkat setebal badan supaya tidak menembus lantai
  }
  ud.mLift = m.lift;
  group.rotation.x += (falling ? fall.tilt : 0) - 0.16 * m.w.salute; // jatuh ke belakang; hormat = condong sedikit ke depan

  const human = ud.human;
  if (human) {
    if (!posture) layerHuman(human, m);
    return;
  }
  const hp = ud.headPivot;
  if (hp) {
    hp.rotation.y = m.yaw;
    hp.rotation.x = -m.pitch; // negatif = menunduk
  }
  const arms = ud.arms;
  const elbows = ud.elbows;
  const legs = ud.legs;
  if (!arms || !elbows) return;
  const ws = m.w.salute;
  if (ws > 0.001) {
    // tangan kanan di dada: bahu sedikit ke depan-luar, siku menekuk dalam dan menyilang ke tengah (sudut dihitung dari kinematika lengan)
    arms.r.rotation.x = mix(arms.r.rotation.x, 0.3, ws);
    arms.r.rotation.z = mix(arms.r.rotation.z, 0.2, ws);
    elbows.r.rotation.x = mix(elbows.r.rotation.x, 2.4, ws);
    elbows.r.rotation.z = mix(elbows.r.rotation.z, -0.9, ws);
  }
  const wl = m.w.lie;
  if (wl > 0.001 && ud.lie !== 'up') {
    // miring: lutut ditekuk santai, lengan di depan dada
    for (const [side, hip, knee] of [['r', 0.9, -1.3], ['l', 0.6, -1]]) {
      arms[side].rotation.x = mix(arms[side].rotation.x, 1, wl);
      elbows[side].rotation.x = mix(elbows[side].rotation.x, 0.9, wl);
      if (legs) {
        legs[side].hip.rotation.x = mix(legs[side].hip.rotation.x, hip, wl);
        legs[side].knee.rotation.x = mix(legs[side].knee.rotation.x, knee, wl);
      }
    }
  }
  const wf = m.w.fall;
  if (wf > 0.001) {
    // jatuh: tangan dan kaki terentang
    for (const [side, sgn] of [['r', 1], ['l', -1]]) {
      arms[side].rotation.x = mix(arms[side].rotation.x, 0.2, wf);
      arms[side].rotation.z = mix(arms[side].rotation.z, sgn * 1, wf);
      elbows[side].rotation.x = mix(elbows[side].rotation.x, 0.4, wf);
      if (legs) {
        legs[side].hip.rotation.x = mix(legs[side].hip.rotation.x, 0.1, wf);
        legs[side].hip.rotation.z = mix(legs[side].hip.rotation.z, sgn * 0.2, wf);
        legs[side].knee.rotation.x = mix(legs[side].knee.rotation.x, -0.15, wf);
      }
    }
  }
}

/** Cincin emas di kaki avatar penanda pembicara di panggung Party Room. */
export function setStageRing(group, on) {
  let ring = group.userData.stageRing;
  if (!ring && on) {
    ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 40),
      new THREE.MeshBasicMaterial({ color: 0xf3d58a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);
    group.userData.stageRing = ring;
  }
  if (ring) ring.visible = on;
}

function buildGear(cfg) {
  const gear = new THREE.Group();
  gear.scale.setScalar(GEAR_SCALE); // aksesori dirancang untuk kepala besar; skala ke kepala berproporsi manusia
  gear.position.y = GEAR_Y - NECK_Y; // gear ikut pivot kepala (yang berada di pangkal leher), jadi ikut menoleh
  const hairColor = HAIR_COLORS[cfg.k].hex;
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  const add = (geometry, material, x, y, z, rx = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.castShadow = true;
    gear.add(mesh);
    return mesh;
  };
  const covered = cfg.a === 3 || cfg.a === 4; // kerudung/blangkon menutup rambut
  if (cfg.h > 0 && !covered) {
    const hair = mat(hairColor);
    add(new THREE.SphereGeometry(0.325, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), hair, 0, 1.4, 0.035);
    if (cfg.h === 2) add(new THREE.BoxGeometry(0.52, 0.1, 0.12), hair, 0, 1.59, -0.22);
    if (cfg.h === 3) add(new THREE.BoxGeometry(0.54, 0.6, 0.12), hair, 0, 1.12, 0.25);
    if (cfg.h === 4) {
      add(new THREE.SphereGeometry(0.12, 10, 8), hair, 0, 1.36, 0.38);
      add(new THREE.CapsuleGeometry(0.06, 0.28, 4, 8), hair, 0, 1.1, 0.4);
    }
    if (cfg.h === 5) add(new THREE.SphereGeometry(0.16, 12, 10), hair, 0, 1.73, 0.06);
  }
  if (cfg.a === 1) {
    const frame = mat(0x1b1620, { metalness: 0.3 });
    for (const sx of [-0.1, 0.1]) add(new THREE.TorusGeometry(0.075, 0.016, 8, 18), frame, sx, 1.4, -0.285);
    add(new THREE.BoxGeometry(0.1, 0.014, 0.014), frame, 0, 1.41, -0.287);
  } else if (cfg.a === 2) {
    add(new THREE.CylinderGeometry(0.235, 0.27, 0.17, 20), mat(0x15151a), 0, 1.63, 0.01);
  } else if (cfg.a === 3) {
    const cloth = mat(hairColor, { side: THREE.DoubleSide });
    add(new THREE.SphereGeometry(0.35, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.74), cloth, 0, 1.4, 0.035);
    add(new THREE.CylinderGeometry(0.34, 0.5, 0.34, 20, 1, true), cloth, 0, 1.05, 0.04);
  } else if (cfg.a === 4) {
    const batik = mat(0x6b3f1f);
    add(new THREE.SphereGeometry(0.29, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), batik, 0, 1.45, 0.02);
    add(new THREE.SphereGeometry(0.09, 10, 8), batik, 0, 1.47, 0.3);
  } else if (cfg.a === 5) {
    add(new THREE.CylinderGeometry(0.23, 0.19, 0.15, 5), mat(0xd4a84b, { metalness: 0.5, roughness: 0.35 }), 0, 1.7, 0);
  } else if (cfg.a === 6) {
    const hat = mat(hairColor);
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 24), hat, 0, 1.58, 0);
    add(new THREE.CylinderGeometry(0.25, 0.27, 0.2, 20), hat, 0, 1.69, 0);
  }
  return gear;
}

function disposeGear(gear) {
  gear.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
}

/** Terapkan konfigurasi pemain (warna pakaian, kulit, rambut, aksesori) ke avatar yang sudah ada. */
export function setAvatarConfig(group, rawConfig) {
  const cfg = sanitizeConfig(rawConfig);
  setAvatarColor(group, OUTFITS[cfg.o].hex);
  group.userData.skin?.color.set(SKINS[cfg.s].hex);
  if (group.userData.gear) {
    group.userData.gear.parent?.remove(group.userData.gear);
    disposeGear(group.userData.gear);
  }
  group.userData.gear = buildGear(cfg);
  group.userData.gear.visible = !CHARACTERS[cfg.m]?.id;
  (group.userData.headPivot ?? group.userData.pivot ?? group).add(group.userData.gear);
  group.userData.config = cfg;
  applyHuman(group, cfg);
}

/** Pasang/lepas model manusia sesuai pilihan karakter. Pemuatan asinkron; avatar sederhana tampil sementara. */
function applyHuman(group, cfg) {
  const id = CHARACTERS[cfg.m]?.id ?? null;
  if (group.userData.humanId === id) return;
  group.userData.humanId = id;
  const old = group.userData.human;
  if (old) {
    old.root.parent?.remove(old.root);
    old.dispose();
    group.userData.human = null;
  }
  const showSimple = (on) => {
    for (const part of group.userData.parts ?? []) part.visible = on;
    if (group.userData.gear) group.userData.gear.visible = on;
  };
  if (!id) {
    showSimple(true);
    return;
  }
  loadHumanModel(id)
    .then((model) => {
      if (group.userData.humanId !== id) return; // sudah ganti pilihan
      const rig = new HumanRig(model);
      (group.userData.pivot ?? group).add(rig.root);
      group.userData.human = rig;
      showSimple(false);
    })
    .catch((error) => console.warn('[avatar] model manusia gagal dimuat, memakai avatar sederhana', error));
}

// ---- Aura: cincin + percikan yang mengorbit; warna dari bagian hari dan nama (lihat avatar-aura.js) ----
let aurasVisible = true;
/** Tampilkan/sembunyikan semua aura (preferensi lokal, juga menghemat tenaga di HP lemah). */
export function setAurasVisible(on) {
  aurasVisible = Boolean(on);
}

/** Pasang aura ke avatar. `spec` dari auraFor(); null melepas aura. */
export function setAvatarAura(group, spec) {
  const old = group.userData.aura;
  if (old) {
    group.remove(old.group);
    old.ring.geometry.dispose(); old.ring.material.dispose();
    old.points.geometry.dispose(); old.points.material.dispose();
    group.userData.aura = null;
  }
  if (!spec) return;
  const color = new THREE.Color().setHSL(spec.hue / 360, spec.sat, spec.light);
  const holder = new THREE.Group();
  holder.position.y = 0.03;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.74, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  const count = Math.max(1, Math.min(24, spec.sparks));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 0.15, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  points.frustumCulled = false;
  holder.add(ring, points);
  group.add(holder);
  group.userData.aura = { group: holder, ring, points, count, speed: spec.speed, phase: spec.phase };
}

export function auraSpecFor(name, part) {
  return auraFor({ name, part });
}

function animateAura(group, t) {
  const aura = group.userData?.aura;
  if (!aura) return;
  aura.group.visible = aurasVisible;
  if (!aurasVisible) return;
  const pos = aura.points.geometry.attributes.position;
  for (let i = 0; i < aura.count; i += 1) {
    const angle = aura.phase + t * aura.speed * 1.2 + (i * Math.PI * 2) / aura.count;
    const radius = 0.66 + 0.08 * Math.sin(t * 1.7 + i);
    const rise = (t * aura.speed * 0.35 + i / aura.count) % 1; // naik pelan lalu muncul lagi di bawah
    pos.setXYZ(i, Math.cos(angle) * radius, 0.1 + rise * 1.75, Math.sin(angle) * radius);
  }
  pos.needsUpdate = true;
  aura.ring.material.opacity = 0.38 + 0.18 * Math.sin(t * 2 + aura.phase);
}
