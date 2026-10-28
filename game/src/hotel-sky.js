import * as THREE from 'three';
import { DAY_MODES, blendSky, createPhaseTracker, skyModeFromSearch, zoneFromSearch } from './day-night.js';
import { createNightDecor } from './night-sky.js';
import { HOTEL_TOP_Y } from './hotel-layout.js';
import {
  CLOUD_ALTITUDE, FACADE_NAME, FOUNTAIN_LIGHT, GROUND_LAMP_HEIGHT, MAST_TIP, SKY_FRAMES, WINDOW_SIZE, altitudeLevel, beaconLevel, beaconSpots, buildBeltLights,
  buildWindowLights, canopyLights, gateLights, groundLampSpots, helipadLights, horizonDip, lampLevel, nightLevel, sunsetLevel, windowLevel,
} from './hotel-sky-data.js';
import { createTowerGlow } from './hotel-tower-glow.js';

// Langit, cahaya, dan lampu NIKORA Grand Hotel yang berganti otomatis mengikuti jam asli (siang, senja, malam).
// ?sky=auto|day|sunset|night|cycle dan ?tz=WIB|WITA|WIT mengatur mode dan zona waktu (sama dengan villa, masjid, dan aula); tombol N berganti mode.
// Modul ini TIDAK mengubah hotel-world.js: ia menambah kubah langit, hamparan awan, bintang, bulan, dan lapisan lampu sendiri,
// dan hanya mencari bahan lampu jalan raya (nikora-highway), ujung antena/helipad, dan fasad (hotel-facade) yang sudah ada di scene.
// Semua lapisan lampu memakai THREE.Points aditif yang tidak terkena kabut, sehingga jendela dan lampu menara tetap terlihat
// berkilau dari jarak kilometer di malam hari, dan membesar halus saat didekati. Lampu digambar SESUDAH fasad kaca
// (renderOrder 1, hampir buram): tanpa itu fasad menimpa lampu dan jendela tampak redup.
// Keindahan kulit menara (pantulan langit di kaca, rangka menyala, berkas cahaya mahkota) ada di hotel-tower-glow.js dan dipasang dari sini.
// Jendela kamar tamu menyala dari lantai bawah ke atas saat senja (uRise di GLOW_VERT), dengan sebaran acak per kamar.

export const SKY_MODE_LABELS = Object.freeze({ auto: 'otomatis (jam asli)', day: 'siang', sunset: 'senja', night: 'malam', cycle: 'demo satu hari 20 menit' });

const SRGB = THREE.SRGBColorSpace;
const BOX = new THREE.BoxGeometry(1, 1, 1);
const LAMP_HEX = 0xfff0c8; // warna bahan lampu jalan raya dan lampu hotel
const GLOW_ORDER = 10; // sesudah fasad (renderOrder 1)
const POOL_ORDER = 9;

// ---------------------------------------------------------------- kubah langit
// Bola yang selalu mengikuti kamera. z = w memaksa kedalamannya tepat di bidang jauh, jadi tidak pernah terpotong jarak pandang.
const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p;
  gl_Position.z = p.w;
}`;

const NOISE = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < OCT; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}`;

const DOME_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform float uDip;
uniform float uSunset;
uniform float uNight;
uniform float uAlt;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y + uDip; // 0 tepat di garis horizon sebenarnya (turun menurut ketinggian)
  float up = max(h, 0.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.34, up));
  float zt = smoothstep(0.22, 0.95, up);
  col = mix(col, uZenith, zt);
  col = mix(col, col * vec3(0.72, 0.8, 1.0), uAlt * zt); // makin tinggi, puncak langit makin pekat
  col = mix(col, uHorizon, 1.0 - smoothstep(-0.3, 0.0, h)); // di bawah horizon: kabut yang menyatu dengan tanah

  // matahari: cakram, pendar rapat, dan pendar lebar yang makin kuat saat senja
  float sd = max(dot(d, uSunDir), 0.0);
  float vis = smoothstep(-0.1, 0.04, uSunDir.y);
  float disc = smoothstep(0.99955, 0.99975, sd);
  col += uSunColor * (disc * 7.0 + pow(sd, 260.0) * 1.4 + pow(sd, 14.0) * (0.18 + 0.5 * uSunset)) * vis;

  // pita senja di horizon, condong ke arah matahari terbenam
  vec2 az = normalize(uSunDir.xz + vec2(1.0e-5));
  vec2 da = normalize(d.xz + vec2(1.0e-5));
  float facing = max(dot(az, da), 0.0);
  float band = exp(-pow(up * 5.0, 2.0)) * pow(facing, 2.5) * uSunset;
  col += (uHorizon * 0.55 + vec3(1.0, 0.42, 0.12) * 0.35) * band;

  // Bima Sakti: pita redup dengan gumpalan, hanya saat malam
  if (uNight > 0.02) {
    vec3 n = normalize(vec3(0.35, 0.6, 0.7));
    vec3 t1 = normalize(cross(n, vec3(0.0, 1.0, 0.0)));
    vec3 t2 = cross(n, t1);
    float v = dot(d, n);
    float band2 = exp(-pow(v * 3.2, 2.0));
    float cl = 0.5 * (fbm(vec2(dot(d, t1), v) * 5.0) + fbm(vec2(dot(d, t2), v) * 5.0 + 10.0));
    float mw = band2 * (0.25 + 1.1 * cl) * smoothstep(-0.05, 0.25, up) * uNight;
    col += vec3(0.55, 0.62, 0.9) * mw * 0.2;
  }

  col += (hash21(gl_FragCoord.xy) - 0.5) / 255.0; // dither: tanpa pita warna pada gradasi
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- hamparan awan
// Satu lapis awan pada CLOUD_ALTITUDE: dari bawah tampak sebagai langit berawan, dari lantai atas menara tampak lautan awan.
const CLOUD_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const CLOUD_FRAG = /* glsl */ `
varying vec3 vWorld;
uniform vec3 uCam;
uniform float uTime;
uniform float uCover;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec2 uSunXZ;
${NOISE}
void main() {
  vec2 p = vWorld.xz * 0.00065 + vec2(uTime * 0.004, uTime * 0.0015);
  float n = fbm(p);
  float dens = smoothstep(1.0 - uCover - 0.04, 1.0 - uCover + 0.22, n);
  if (dens < 0.004) discard;
  float n2 = fbm(p + uSunXZ * 0.035);
  float lit = clamp(0.55 + (n - n2) * 5.0, 0.0, 1.0); // sisi yang menghadap matahari lebih terang
  vec3 col = mix(uShade, uLit, lit);
  float fade = 1.0 - smoothstep(3600.0, 6000.0, length(vWorld - uCam));
  float inside = smoothstep(30.0, 220.0, abs(uCam.y - vWorld.y)); // tidak berkedip saat kamera tepat di lapisan awan
  gl_FragColor = vec4(col, dens * fade * inside * 0.9);
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- titik cahaya (jendela, lampu, suar)
// mode: 0 jendela (menyala bertahap per jendela), 1 mantap, 2 suar berdenyut, 3 untaian berkelip.
// Ukuran titik dihitung dalam meter dunia lalu dijepit ke piksel: jauh = titik kecil yang redup, dekat = membesar lalu memudar
// (di dekat pemain geometri aslinya sudah ada).
// Mode 0: ambang nyala tiap jendela = campuran sebaran acak (aSeed) dan tinggi (position.y / uTopY) menurut uRise (0 = acak murni, 1 = naik rapi
// dari bawah): saat senja lantai bawah menyala lebih dulu dan terang naik pelan ke atas, tetap dengan sedikit sebaran acak per kamar.
const GLOW_VERT = /* glsl */ `
attribute float aSize;
attribute float aSeed;
attribute float aKind;
uniform float uOn;
uniform float uTime;
uniform float uScale;
uniform float uMinPx;
uniform float uMaxPx;
uniform float uNear;
uniform float uMode;
uniform float uMotion;
uniform float uTopY;
uniform float uRise;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vA;
varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-mv.z, 1.0);
  float raw = aSize * uScale / dist;
  gl_PointSize = clamp(raw, uMinPx, uMaxPx);
  gl_Position = projectionMatrix * mv;
  float far = clamp(raw / uMinPx, 0.28, 1.0);
  float near = smoothstep(uNear * 0.35, uNear, dist);
  float on = uOn;
  float b = 1.0;
  vec3 c = mix(uColorA, uColorB, fract(aSeed * 7.7));
  if (uMode < 0.5) {
    float hN = clamp(position.y / uTopY, 0.0, 1.0);
    float thr = mix(aSeed, hN, uRise) * 0.85;
    on = (aKind > 0.5 && aKind < 1.5) ? smoothstep(0.0, 0.2, uOn) : smoothstep(thr, thr + 0.12, uOn * 1.02);
    b = 0.55 + 0.45 * fract(aSeed * 17.3);
    if (aKind > 1.5) {
      c = vec3(0.5, 0.7, 1.0);
      float flick = 0.7 + 0.3 * sin(uTime * 6.0 + aSeed * 90.0) * sin(uTime * 2.3 + aSeed * 31.0);
      b *= mix(0.9, flick, uMotion);
    }
  } else if (uMode > 1.5 && uMode < 2.5) {
    float p = pow(0.5 + 0.5 * sin(uTime * 2.4 + aSeed * 6.2832), 5.0);
    b = mix(0.85, 0.12 + 0.88 * p, uMotion);
  } else if (uMode > 2.5) {
    b = mix(0.9, 0.78 + 0.22 * sin(uTime * 3.1 + aSeed * 40.0), uMotion);
  }
  vA = on * b * far * near;
  vC = c;
  if (vA < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // padam: dibuang sebelum rasterisasi
}`;

const GLOW_FRAG = /* glsl */ `
uniform float uShape;
uniform float uGain;
varying float vA;
varying vec3 vC;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float sq = 1.0 - smoothstep(0.34, 0.5, max(abs(c.x), abs(c.y)));
  float halo = pow(max(1.0 - length(c) * 2.0, 0.0), 2.4);
  float a = mix(sq * 0.85 + halo * 0.3, halo, uShape);
  gl_FragColor = vec4(vC * uGain, a * vA);
  #include <colorspace_fragment>
}`;

const lin = (hex) => {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
};
const seedsOf = (n) => {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = (i * 0.6180339887) % 1;
  return a;
};

function glowPoints({ positions, size, seeds, kinds, mode = 1, shape = 1, colorA, colorB = colorA, gain = 1, near = 20, minPx = 2, maxPx = 40, rise = 0, name }) {
  const count = positions.length / 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(typeof size === 'number' ? new Float32Array(count).fill(size) : size, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds ?? seedsOf(count), 1));
  g.setAttribute('aKind', new THREE.BufferAttribute(kinds ?? new Float32Array(count), 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uOn: { value: 0 }, uTime: { value: 0 }, uScale: { value: 1000 }, uMinPx: { value: minPx }, uMaxPx: { value: maxPx }, uNear: { value: near },
      uMode: { value: mode }, uMotion: { value: 1 }, uShape: { value: shape }, uGain: { value: gain }, uColorA: { value: lin(colorA) }, uColorB: { value: lin(colorB) },
      uTopY: { value: HOTEL_TOP_Y }, uRise: { value: rise },
    },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(g, material);
  points.frustumCulled = false;
  points.renderOrder = GLOW_ORDER;
  points.name = name;
  points.visible = false;
  return points;
}

function poolTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = SRGB;
  return tex;
}

/** Mengumpulkan posisi bohlam jalan raya dan bahan lampunya dari scene (highway-world.js tidak diubah). */
function collectHighwayLamps(scene) {
  const mats = new Map(); // bahan -> warna dasar
  const bulbs = [];
  const caps = [];
  const hw = scene.getObjectByName('nikora-highway');
  if (hw) {
    const m4 = new THREE.Matrix4();
    const v = new THREE.Vector3();
    hw.traverse((o) => {
      const m = o.material;
      if (!o.isInstancedMesh || !m?.isMeshBasicMaterial || m.map || m.color.getHex() !== LAMP_HEX) return;
      if (!mats.has(m)) mats.set(m, m.color.clone());
      o.updateWorldMatrix(true, false);
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m4);
        m4.premultiply(o.matrixWorld);
        v.setFromMatrixPosition(m4);
        (v.y > 20 ? caps : bulbs).push(v.x, v.y, v.z); // bohlam lampu jalan (8,7 m) dan kepala tugu emas (29 m)
      }
    });
  }
  return { mats, bulbs: Float32Array.from(bulbs), caps: Float32Array.from(caps) };
}

/** Mencari ujung antena dan helipad di scene supaya lampu peringatan mengikuti letak aslinya. */
function findCrown(scene) {
  let mast = null;
  let helipad = null;
  scene.traverse((o) => {
    if (!o.isMesh || o.geometry?.type !== 'CylinderGeometry' || o.position.y < HOTEL_TOP_Y) return;
    const p = o.geometry.parameters;
    if (p.height >= 40) mast = { x: o.position.x, y: o.position.y + p.height / 2, z: o.position.z };
    else if (p.radiusTop >= 10) helipad = { x: o.position.x, y: o.position.y, z: o.position.z, r: p.radiusTop };
  });
  return { mast: mast ?? MAST_TIP, helipad: helipad ?? { x: 0, y: HOTEL_TOP_Y + 1.06, z: 448, r: 11 } };
}

/**
 * Panggil sesudah buildHotelWorld dan sesudah kamera dibuat. update(perfMs) dipanggil tiap frame tepat sebelum render;
 * applyLights(indoorK) menggantikan pengaturan intensitas cahaya langit dan matahari (diredam saat di dalam ruangan).
 */
export function createHotelSky({ scene, renderer, camera, lights = {}, search = '', low = false }) {
  const { hemi, sun } = lights;
  const motion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
  const tracker = createPhaseTracker({ mode: skyModeFromSearch(search), zone: zoneFromSearch(search) });
  const baseExposure = renderer.toneMappingExposure;
  const tmp = new THREE.Color();
  const setLin = (target, rgb) => {
    tmp.setRGB(rgb[0], rgb[1], rgb[2], SRGB);
    target.set(tmp.r, tmp.g, tmp.b);
  };
  const root = new THREE.Group();
  root.name = 'nikora-hotel-sky';
  scene.add(root);
  scene.background = null;
  if (!scene.fog) scene.fog = new THREE.Fog(0xc7e0f5, 420, 3400);

  // kubah langit
  const domeU = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uZenith: { value: new THREE.Vector3() }, uMid: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() },
    uSunColor: { value: new THREE.Vector3(1, 1, 1) }, uDip: { value: 0 }, uSunset: { value: 0 }, uNight: { value: 0 }, uAlt: { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(100, 32, 20),
    new THREE.ShaderMaterial({ uniforms: domeU, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, defines: { OCT: low ? 2 : 3 } }),
  );
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  root.add(dome);

  // awan
  const cloudU = {
    uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uCover: { value: 0.5 }, uLit: { value: new THREE.Vector3(1, 1, 1) }, uShade: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uSunXZ: { value: new THREE.Vector2(0.4, 0.3) },
  };
  const cloud = new THREE.Mesh(
    new THREE.PlaneGeometry(14000, 14000).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: cloudU, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, defines: { OCT: low ? 3 : 5 } }),
  );
  cloud.frustumCulled = false;
  cloud.renderOrder = -900;
  cloud.position.y = CLOUD_ALTITUDE;
  root.add(cloud);

  // tanah sampai ke horizon: lantai luas di bawah rumput hotel (tanpa tulis kedalaman, jadi tidak berebut dengan rumput di atasnya)
  const farGround = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5f9a4e, depthWrite: false }));
  farGround.position.set(0, -0.2, 300);
  farGround.renderOrder = -500;
  root.add(farGround);

  // bintang dan bulan
  const decor = createNightDecor({ radius: 3000, stars: 1400, moonRadius: 105, seed: 11 });
  root.add(decor.group);
  const moonDir = new THREE.Vector3(...SKY_FRAMES.night.dir).normalize();

  // bintang jatuh sesekali (tanpa kabut, supaya tetap terlihat di jarak 2,6 km)
  const streak = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xcfe3ff, transparent: true, opacity: 0, depthWrite: false, fog: false }),
  );
  streak.frustumCulled = false;
  streak.visible = false;
  root.add(streak);
  const shot = { t0: -1, next: 8, dur: 1.1, a: new THREE.Vector3(), b: new THREE.Vector3(), head: new THREE.Vector3(), tail: new THREE.Vector3() };
  const SHOT_R = 2600;
  const stepShootingStar = (t, nightK) => {
    if (!motion || nightK < 0.6) {
      streak.visible = false;
      shot.t0 = -1;
      return;
    }
    if (shot.t0 < 0) {
      if (t < shot.next) return;
      const az = Math.random() * Math.PI * 2;
      const el = 0.35 + Math.random() * 0.5;
      shot.a.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      shot.b.set(-shot.a.z, 0, shot.a.x).normalize().multiplyScalar(Math.random() < 0.5 ? -1 : 1).add(new THREE.Vector3(0, -0.45, 0)).normalize();
      shot.t0 = t;
    }
    const p = (t - shot.t0) / shot.dur;
    if (p >= 1) {
      shot.t0 = -1;
      shot.next = t + 14 + Math.random() * 30;
      streak.visible = false;
      return;
    }
    shot.head.copy(shot.a).addScaledVector(shot.b, p * 0.28).normalize().multiplyScalar(SHOT_R);
    shot.tail.copy(shot.a).addScaledVector(shot.b, Math.max(p - 0.22, 0) * 0.28).normalize().multiplyScalar(SHOT_R);
    const pos = streak.geometry.attributes.position;
    pos.setXYZ(0, shot.tail.x, shot.tail.y, shot.tail.z);
    pos.setXYZ(1, shot.head.x, shot.head.y, shot.head.z);
    pos.needsUpdate = true;
    streak.material.opacity = Math.sin(Math.PI * p) * nightK * 0.85;
    streak.position.copy(camera.position);
    streak.visible = true;
  };

  // ---- lampu
  const hw = collectHighwayLamps(scene);
  const crown = findCrown(scene);
  // Selama fasad bertekstur ada, kulit luar menara berupa kotak penuh (tidak meruncing): jendela dan sabuk ditaruh di luar kotak itu.
  const shell = scene.getObjectByName(FACADE_NAME) ? 'box' : 'taper';
  const lampMats = hw.mats;
  const ground = groundLampSpots();
  const groundLampMat = new THREE.MeshBasicMaterial({ color: LAMP_HEX });
  lampMats.set(groundLampMat, groundLampMat.color.clone());
  const poles = new THREE.InstancedMesh(BOX, new THREE.MeshStandardMaterial({ color: 0x1a1b1f, roughness: 0.8 }), ground.length);
  const heads = new THREE.InstancedMesh(BOX, groundLampMat, ground.length);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    ground.forEach((g, i) => {
      poles.setMatrixAt(i, m.compose(p.set(g.x, GROUND_LAMP_HEIGHT / 2, g.z), q, s.set(0.22, GROUND_LAMP_HEIGHT, 0.22)));
      heads.setMatrixAt(i, m.compose(p.set(g.x, GROUND_LAMP_HEIGHT + 0.1, g.z), q, s.set(1.3, 0.18, 0.7)));
    });
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    poles.computeBoundingSphere();
    heads.computeBoundingSphere();
    root.add(poles, heads);
  }

  // kolam cahaya di tanah di bawah setiap lampu
  const poolSpots = [];
  for (let i = 0; i < hw.bulbs.length; i += 3) poolSpots.push(hw.bulbs[i], hw.bulbs[i + 2], 17);
  for (const g of ground) poolSpots.push(g.x, g.z, 15);
  poolSpots.push(FOUNTAIN_LIGHT.x, FOUNTAIN_LIGHT.z, 16, 0, 446, 28); // air mancur dan kanopi drop-off
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, poolSpots.length / 3);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < poolSpots.length / 3; i++) pools.setMatrixAt(i, m.compose(p.set(poolSpots[i * 3], 0.11, poolSpots[i * 3 + 1]), q, s.set(poolSpots[i * 3 + 2], 1, poolSpots[i * 3 + 2])));
    pools.instanceMatrix.needsUpdate = true;
    pools.frustumCulled = false;
    pools.renderOrder = POOL_ORDER;
    pools.visible = false;
    root.add(pools);
  }

  // lapisan titik cahaya
  const layers = [];
  const addLayer = (points, level) => {
    root.add(points);
    layers.push({ points, level });
    return points;
  };
  const win = buildWindowLights({ shell });
  addLayer(glowPoints({ positions: win.positions, size: WINDOW_SIZE, seeds: win.seeds, kinds: win.kinds, mode: 0, shape: 0, colorA: 0xffb866, colorB: 0xffeacc, near: 90, minPx: 1.5, maxPx: 30, rise: 0.6, name: 'sky-windows' }), windowLevel);
  addLayer(glowPoints({ positions: buildBeltLights({ shell }), size: 1.1, mode: 3, shape: 0.35, colorA: 0xffc94d, colorB: 0xffe08a, near: 40, minPx: 2, maxPx: 22, gain: 1.1, name: 'sky-belts' }), lampLevel);
  if (hw.bulbs.length) addLayer(glowPoints({ positions: hw.bulbs, size: 7, shape: 1, colorA: 0xffd9a0, near: 16, minPx: 3, maxPx: 90, gain: 0.9, name: 'sky-street-lamps' }), lampLevel);
  if (hw.caps.length) addLayer(glowPoints({ positions: hw.caps, size: 14, shape: 1, colorA: 0xffe0a0, near: 30, minPx: 4, maxPx: 120, gain: 1.0, name: 'sky-pylons' }), lampLevel);
  addLayer(glowPoints({ positions: Float32Array.from(ground.flatMap((g) => [g.x, GROUND_LAMP_HEIGHT + 0.1, g.z])), size: 8, shape: 1, colorA: 0xffd9a0, near: 14, minPx: 3, maxPx: 80, gain: 0.9, name: 'sky-ground-lamps' }), lampLevel);
  addLayer(glowPoints({ positions: gateLights(), size: 1.8, shape: 0.5, colorA: 0xffc94d, colorB: 0xffe9b0, near: 40, minPx: 2, maxPx: 26, gain: 1.1, name: 'sky-gates' }), lampLevel);
  const canopy = canopyLights();
  const featurePos = Float32Array.from([FOUNTAIN_LIGHT.x, FOUNTAIN_LIGHT.y, FOUNTAIN_LIGHT.z, ...canopy]);
  const featureSize = new Float32Array(featurePos.length / 3).fill(1.8);
  featureSize[0] = 9;
  addLayer(glowPoints({ positions: featurePos, size: featureSize, shape: 0.8, colorA: 0xfff0d0, colorB: 0xffd9a0, near: 20, minPx: 3, maxPx: 90, name: 'sky-fountain-canopy' }), lampLevel);
  const beacons = beaconSpots(crown.mast);
  addLayer(glowPoints({ positions: Float32Array.from(beacons.flat()), size: Float32Array.from([5, 5, 5, 5, 7]), mode: 2, shape: 1, colorA: 0xff2a1c, near: 40, minPx: 3.5, maxPx: 44, gain: 1.4, name: 'sky-beacons' }), beaconLevel);
  addLayer(glowPoints({ positions: helipadLights(crown.helipad, Math.max(1, crown.helipad.r - 1.4), 24), size: 0.9, mode: 1, shape: 0.6, colorA: 0x66ff99, colorB: 0xffffff, near: 24, minPx: 2, maxPx: 20, name: 'sky-helipad' }), lampLevel);

  // kulit menara: pantulan langit di kaca, rangka dan mahkota menyala, berkas cahaya berputar (hotel-tower-glow.js). Gagal = dilewati.
  const towerGlow = createTowerGlow({ scene, renderer, domeMaterial: dome.material, low, motion });
  root.add(towerGlow.group);

  const dir = new THREE.Vector3(0.44, 0.84, 0.32);
  const skyDir = new THREE.Vector3(0.44, 0.84, 0.32);
  const base = { sunI: SKY_FRAMES.day.sunI, hemiI: SKY_FRAMES.day.hemiI };
  const size = new THREE.Vector2();

  const apply = (phase) => {
    const s = blendSky(SKY_FRAMES, phase);
    dir.set(s.dir[0], s.dir[1], s.dir[2]).normalize();
    skyDir.set(s.skyDir[0], s.skyDir[1], s.skyDir[2]).normalize();
    if (sun) sun.color.setRGB(s.sunColor[0], s.sunColor[1], s.sunColor[2], SRGB);
    if (hemi) {
      hemi.color.setRGB(s.hemiSky[0], s.hemiSky[1], s.hemiSky[2], SRGB);
      hemi.groundColor.setRGB(s.hemiGround[0], s.hemiGround[1], s.hemiGround[2], SRGB);
    }
    base.sunI = s.sunI;
    base.hemiI = s.hemiI;
    scene.fog.color.setRGB(s.fog[0], s.fog[1], s.fog[2], SRGB);
    scene.fog.near = s.fogNear;
    scene.fog.far = s.fogFar;
    renderer.toneMappingExposure = baseExposure * s.exposure;

    domeU.uSunDir.value.copy(skyDir);
    setLin(domeU.uZenith.value, s.zenith);
    setLin(domeU.uMid.value, s.mid);
    setLin(domeU.uHorizon.value, s.fog);
    setLin(domeU.uSunColor.value, s.sunColor);
    const night = nightLevel(phase);
    domeU.uSunset.value = sunsetLevel(phase);
    domeU.uNight.value = night;
    setLin(cloudU.uLit.value, s.cloudLit);
    setLin(cloudU.uShade.value, s.cloudShade);
    cloudU.uCover.value = s.cloudCover;
    cloudU.uSunXZ.value.set(skyDir.x, skyDir.z);
    decor.setNight(night, moonDir);

    const lamp = lampLevel(phase);
    for (const [m, baseColor] of lampMats) m.color.copy(baseColor).multiplyScalar(0.3 + 0.7 * lamp); // bohlam hampir padam di siang hari
    poolMat.opacity = 0.5 * lamp;
    pools.visible = lamp > 0.01;
    for (const l of layers) {
      const v = l.level(phase);
      l.points.material.uniforms.uOn.value = v;
      l.points.visible = v > 0.003;
    }
  };
  tracker.tick(performance.now());
  apply(tracker.phase);

  return {
    phase: () => tracker.phase,
    mode: () => tracker.mode,
    setMode: (mode) => tracker.setMode(DAY_MODES.includes(mode) ? mode : 'auto'),
    /** Mode berikutnya dalam urutan auto, day, sunset, night, cycle; mengembalikan nama mode baru. */
    cycleMode() {
      const next = DAY_MODES[(DAY_MODES.indexOf(tracker.mode) + 1) % DAY_MODES.length];
      tracker.setMode(next);
      return next;
    },
    /** Intensitas dasar cahaya langit dan matahari saat ini (sebelum diredam di dalam ruangan). */
    base: () => ({ ...base }),
    applyLights(indoorK = 0) {
      if (hemi) hemi.intensity = base.hemiI * (1 - 0.35 * indoorK);
      if (sun) sun.intensity = base.sunI * (1 - 0.46 * indoorK);
    },
    info: () => ({
      phase: tracker.phase, mode: tracker.mode, shell, windows: win.count, streetLamps: hw.bulbs.length / 3, pylons: hw.caps.length / 3, groundLamps: ground.length,
      lampMaterials: lampMats.size, beacons: beacons.length, mast: crown.mast, helipad: crown.helipad, farClip: camera.far, motion,
      visibleLayers: layers.filter((l) => l.points.visible).map((l) => l.points.name), towerGlow: towerGlow.info(),
    }),
    update(perfMs = performance.now()) {
      const t = perfMs / 1000;
      if (tracker.tick(perfMs)) apply(tracker.phase);
      const cp = camera.position;
      dome.position.copy(cp);
      cloud.position.set(cp.x, CLOUD_ALTITUDE, cp.z);
      decor.group.position.copy(cp);
      if (sun) sun.position.copy(dir).multiplyScalar(300);
      domeU.uAlt.value = altitudeLevel(cp.y);
      domeU.uDip.value = horizonDip(cp.y);
      cloudU.uTime.value = t * motion;
      cloudU.uCam.value.copy(cp);
      renderer.getDrawingBufferSize(size);
      const scale = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      for (const l of layers) {
        if (!l.points.visible) continue;
        const u = l.points.material.uniforms;
        u.uTime.value = t;
        u.uScale.value = scale;
        u.uMotion.value = motion;
      }
      const night = nightLevel(tracker.phase);
      if (motion) decor.twinkle(t);
      stepShootingStar(t, night);
      towerGlow.update({ phase: tracker.phase, time: t, altitude: altitudeLevel(cp.y) });
    },
    dispose() {
      towerGlow.dispose();
      scene.remove(root);
      root.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = [].concat(o.material ?? []);
        for (const m of mats) m.dispose?.();
      });
    },
  };
}
