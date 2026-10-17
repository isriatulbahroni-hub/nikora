import * as THREE from 'three';
import { cloudTexture } from './royal-textures.js';

// Langit dinamis Istana Cinta: kubah bergradasi (siang biru → senja keemasan → malam bertabur bintang dan galaksi), matahari/bulan,
// awan berwarna mengikuti cahaya, dan "atmosfer" (warna cahaya, kabut, paparan) yang dipakai dunia 3D.
// Masukan tunggal: fase -1..1 (lihat day-night.js): -1 siang, 0 senja, 1 malam. Nilai 0..1 lama (senja → malam) tetap berlaku.
const KEYS = [
  { zenith: [0.17, 0.24, 0.52], mid: [0.78, 0.42, 0.52], horizon: [1.0, 0.66, 0.32], sunColor: [1.0, 0.72, 0.42], sunI: 2.6, dir: [-0.85, 0.16, 0.35], hemiSky: [1.0, 0.82, 0.66], hemiGround: [0.35, 0.3, 0.32], hemiI: 0.8, fog: [0.95, 0.62, 0.45], exposure: 1.0, env: 0.5, stars: 0 },
  { zenith: [0.07, 0.08, 0.26], mid: [0.45, 0.2, 0.42], horizon: [0.9, 0.4, 0.33], sunColor: [0.9, 0.45, 0.4], sunI: 0.9, dir: [-0.9, 0.05, 0.3], hemiSky: [0.5, 0.45, 0.7], hemiGround: [0.2, 0.18, 0.25], hemiI: 0.6, fog: [0.35, 0.2, 0.35], exposure: 0.95, env: 0.3, stars: 0.35 },
  { zenith: [0.01, 0.02, 0.07], mid: [0.03, 0.05, 0.14], horizon: [0.06, 0.09, 0.2], sunColor: [0.55, 0.66, 1.0], sunI: 0.7, dir: [0.35, 0.65, 0.4], hemiSky: [0.25, 0.3, 0.55], hemiGround: [0.08, 0.09, 0.14], hemiI: 0.55, fog: [0.05, 0.07, 0.16], exposure: 1.1, env: 0.16, stars: 1 },
];
// Siang hari (fase -1): langit biru terang, matahari tinggi, tanpa bintang.
const DAY = { zenith: [0.18, 0.42, 0.85], mid: [0.45, 0.68, 0.95], horizon: [0.78, 0.88, 0.97], sunColor: [1.0, 0.96, 0.86], sunI: 3.0, dir: [-0.45, 0.78, 0.25], hemiSky: [0.75, 0.85, 1.0], hemiGround: [0.42, 0.4, 0.36], hemiI: 0.9, fog: [0.72, 0.84, 0.95], exposure: 0.95, env: 0.7, stars: 0 };
const mix = (a, b, t) => (Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * t) : a + (b - a) * t);
const blend = (night) => {
  const first = night <= 0.5;
  const t = first ? night / 0.5 : (night - 0.5) / 0.5;
  const a = first ? KEYS[0] : KEYS[1];
  const b = first ? KEYS[1] : KEYS[2];
  return Object.fromEntries(Object.keys(a).map((k) => [k, mix(a[k], b[k], t)]));
};
const blendDay = (s, day) => (day <= 0 ? s : Object.fromEntries(Object.keys(s).map((k) => [k, mix(s[k], DAY[k], day)])));

const VERT = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const FRAG = `
varying vec3 vDir;
uniform vec3 uZenith, uMid, uHorizon, uSunDir, uSunColor;
uniform float uStars, uNight, uTime;
float hash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(-0.05, 0.35, h));
  col = mix(col, uZenith, smoothstep(0.25, 0.9, h));
  col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.3, h));
  vec3 sd = normalize(uSunDir);
  float s = max(dot(d, sd), 0.0);
  col += uSunColor * (pow(s, 8.0) * 0.45 + pow(s, 64.0) * 0.9 + pow(s, 900.0) * 3.0) * (1.0 - uNight * 0.9);
  vec3 sp = floor(d * 140.0);
  float star = step(0.9965, hash(sp)) * (0.6 + 0.4 * sin(uTime * 2.0 + hash(sp) * 40.0));
  col += vec3(star) * uStars * smoothstep(0.02, 0.4, h);
  vec3 gn = normalize(vec3(0.3, 0.8, 0.5));
  float band = exp(-pow(dot(d, gn) * 3.2, 2.0));
  float dust = hash(floor(d * 40.0)) * 0.5 + hash(floor(d * 90.0)) * 0.5;
  col += vec3(0.35, 0.3, 0.62) * band * (0.35 + 0.65 * dust) * 0.5 * uStars * smoothstep(0.0, 0.3, h);
  float moon = smoothstep(0.9985, 0.9992, dot(d, sd));
  col = mix(col, vec3(0.92, 0.95, 1.0), moon * uNight);
  gl_FragColor = vec4(col, 1.0);
}`;

export function createSky(scene) {
  const uniforms = {
    uZenith: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
    uStars: { value: 0 }, uNight: { value: 0 }, uTime: { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(450, 32, 16),
    new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }),
  );
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  scene.add(dome);

  const cloudMap = cloudTexture();
  const clouds = new THREE.Group();
  const sprites = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + (i % 3) * 0.2;
    const dist = 250 + (i % 5) * 36;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudMap, transparent: true, depthWrite: false, fog: false, opacity: 0.85 }));
    sprite.position.set(Math.cos(a) * dist, 55 + ((i * 37) % 90), Math.sin(a) * dist);
    sprite.scale.set(150 + (i % 4) * 36, 52 + (i % 3) * 14, 1);
    clouds.add(sprite);
    sprites.push(sprite);
  }
  scene.add(clouds);

  const atm = {
    night: 0, sunDir: new THREE.Vector3(), sunColor: new THREE.Color(), sunIntensity: 1, hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(), hemiIntensity: 1, fogColor: new THREE.Color(), exposure: 1, envIntensity: 0.4, stars: 0,
  };
  const tint = new THREE.Color();

  return {
    dome,
    /** Memperbarui langit dan mengembalikan atmosfer untuk pencahayaan dunia. `phase`: -1 siang, 0 senja, 1 malam. */
    update(phase, camPos, time) {
      const night = Math.max(0, phase); // atm.night tetap 0..1 untuk dunia 3D (lampu dsb.)
      const day = Math.max(0, -phase);
      const s = blendDay(blend(night), day);
      atm.night = night;
      atm.sunDir.set(...s.dir).normalize();
      atm.sunColor.setRGB(...s.sunColor);
      atm.sunIntensity = s.sunI;
      atm.hemiSky.setRGB(...s.hemiSky);
      atm.hemiGround.setRGB(...s.hemiGround);
      atm.hemiIntensity = s.hemiI;
      atm.fogColor.setRGB(...s.fog);
      atm.exposure = s.exposure;
      atm.envIntensity = s.env;
      atm.stars = s.stars;
      uniforms.uZenith.value.setRGB(...s.zenith);
      uniforms.uMid.value.setRGB(...s.mid);
      uniforms.uHorizon.value.setRGB(...s.horizon);
      uniforms.uSunDir.value.copy(atm.sunDir);
      uniforms.uSunColor.value.setRGB(...s.sunColor);
      uniforms.uStars.value = s.stars;
      uniforms.uNight.value = night;
      uniforms.uTime.value = time;
      dome.position.copy(camPos);
      clouds.position.set(camPos.x, 0, camPos.z);
      tint.setRGB(...s.sunColor).lerp(new THREE.Color(1, 1, 1), 0.35).multiplyScalar(1 - night * 0.82);
      for (const sp of sprites) {
        sp.material.color.copy(tint);
        sp.material.opacity = 0.85 - night * 0.45;
      }
      return atm;
    },
  };
}
