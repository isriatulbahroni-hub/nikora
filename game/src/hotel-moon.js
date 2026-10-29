import * as THREE from 'three';
import {
  MOON, earthshine, libration, moonApparentRadius, moonDirection, moonDiscVisibility, moonExtinction, moonGlowFade, moonGlowK, moonHemiGain, moonHorizonMask, moonLevel,
  moonModeFromSearch, moonSunGain, moonTint, moonUpFactor,
} from './hotel-moon-data.js';
import { clockDate, locationFromSearch, moonEvents, moonState } from './hotel-moon-ephemeris.js';

// Bulan Purnama Agung NIKORA Grand Hotel, sekarang bergerak seperti bulan sungguhan (dimensi keempat: waktu). Bulan digambar LANGSUNG di kubah langit
// (hotel-sky.js) lewat potongan GLSL di bawah, bukan sebagai bola terpisah, sehingga kaca menara ikut memantulkannya.
// Posisi, fase, dan arah sisi terang dihitung tiap frame dari tanggal, jam, dan tempat (hotel-moon-ephemeris.js): terbit di timur, melintas, terbenam di barat,
// rendah = lebih besar, lebih jingga, dan lebih redup. Mode bawaan 'full' = purnama ideal (terbit saat matahari terbenam, terbenam saat matahari terbit);
// ?moon=real = posisi dan fase sungguhan menurut tanggal. ?lat= dan ?lon= mengganti tempat; bawaan kota acuan zona waktu (WIB = Jakarta).
// Isi cakram: dataran gelap, tiga lapis kawah dengan relief mengikuti arah cahaya, kawah Tycho dengan sinar terangnya, goyangan libration, kemiringan menurut
// sudut paralaktik, cahaya bumi di sisi gelap; di sekelilingnya pendar tiga lapis, cincin es 22 derajat berwarna pelangi tipis, dan berkas cahaya radial.

/** Deklarasi uniform untuk fragment shader kubah langit. */
export const MOON_DOME_UNIFORMS = /* glsl */ `
uniform vec3 uMoonDir;
uniform vec3 uMoonX;
uniform vec3 uMoonY;
uniform vec3 uMoonLight;
uniform vec3 uMoonTint;
uniform float uMoonR;
uniform float uMoonVis;
uniform float uMoonGlow;
uniform float uMoonEarth;
uniform vec2 uMoonLib;
uniform float uMoonRoll;
uniform float uMoonRing;
uniform float uMoonTime;
`;

/** Fungsi GLSL: noise 3D, kawah, cakram bulan, dan moonLayer(col, d, h) yang dipanggil di akhir fragment shader kubah. */
export const MOON_DOME_FUNCS = /* glsl */ `
float mHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float mNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(mHash(i), mHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(mHash(i + vec3(0.0, 1.0, 0.0)), mHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(mHash(i + vec3(0.0, 0.0, 1.0)), mHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(mHash(i + vec3(0.0, 1.0, 1.0)), mHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
float mFbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * mNoise(p);
    p = p * 2.03 + vec3(5.2, 1.3, 8.7);
    a *= 0.5;
  }
  return s;
}
// Kawah sel 3D: tiap sel bisa memuat satu kawah (mangkuk melesak dengan bibir yang naik). Hasilnya tinggi permukaan.
float mCraters(vec3 n, float scale, float density) {
  vec3 p = n * scale;
  vec3 ip = floor(p);
  float h = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      for (int z = -1; z <= 1; z++) {
        vec3 c = ip + vec3(float(x), float(y), float(z));
        if (mHash(c) > density) continue;
        vec3 ctr = c + vec3(mHash(c + 1.7), mHash(c + 5.3), mHash(c + 9.1));
        float r = mix(0.2, 0.48, mHash(c + 13.7));
        float d = length(p - ctr) / r;
        float bowl = max(1.0 - d * d, 0.0);
        float e = (d - 1.0) * 5.0;
        h += -0.75 * bowl + 0.35 * exp(-e * e);
      }
    }
  }
  return h;
}
float mHeight(vec3 sp) {
  float h = mCraters(sp, 6.0, 0.55) + 0.7 * mCraters(sp, 15.0, 0.5) + 0.4 * mCraters(sp, 36.0, 0.45);
  return h * 0.5 + 0.12 * (mFbm(sp * 6.0) - 0.5);
}
// Kemiringan wajah bulan (sudut paralaktik) dan goyangan tepi (libration): memutar titik permukaan.
vec3 mLib(vec3 v) {
  float cz = cos(uMoonRoll);
  float sz = sin(uMoonRoll);
  v = vec3(cz * v.x - sz * v.y, sz * v.x + cz * v.y, v.z);
  float cx = cos(uMoonLib.x);
  float sx = sin(uMoonLib.x);
  v = vec3(cx * v.x + sx * v.z, v.y, -sx * v.x + cx * v.z);
  float cy = cos(uMoonLib.y);
  float sy = sin(uMoonLib.y);
  return vec3(v.x, cy * v.y - sy * v.z, sy * v.y + cy * v.z);
}
// n = normal bola pada cakram dalam bingkai penonton (x kanan, y atas, z ke penonton).
vec3 moonDisc(vec3 n) {
  vec3 sp = mLib(n);
  float big = mFbm(sp * 1.6 + vec3(3.0, 1.0, 7.0)) + (mNoise(sp * 8.0) - 0.5) * 0.09;
  float mare = smoothstep(0.47, 0.56, big);
  vec3 hiC = mix(vec3(0.88, 0.86, 0.80), vec3(0.73, 0.71, 0.67), mNoise(sp * 5.0));
  vec3 loC = vec3(0.34, 0.37, 0.43) * (0.85 + 0.3 * mNoise(sp * 13.0));
  vec3 alb = mix(hiC, loC, mare * 0.88);

  // kawah Tycho: bintik terang dengan sinar yang memancar
  vec3 ty = normalize(vec3(-0.30, -0.62, 0.72));
  float dty = distance(sp, ty);
  vec3 t1 = normalize(cross(ty, vec3(0.0, 0.0, 1.0)));
  vec3 t2 = cross(ty, t1);
  vec3 rel = sp - ty * dot(sp, ty);
  float ang = atan(dot(rel, t2), dot(rel, t1) + 1.0e-6);
  float rays = smoothstep(0.42, 0.85, mNoise(vec3(cos(ang) * 5.0, sin(ang) * 5.0, 2.0))) * exp(-dty * 2.2) * smoothstep(0.07, 0.22, dty);
  float spot = exp(-(dty * 10.0) * (dty * 10.0));
  alb += vec3(0.17, 0.16, 0.14) * (spot * 1.2 + rays * 0.9);

  // relief: tinggi di titik ini dan sedikit ke arah cahaya; lereng yang menghadap cahaya lebih terang
  vec3 L = normalize(uMoonLight);
  float h0 = mHeight(sp);
  vec3 lt = L - n * dot(n, L);
  vec3 n2 = normalize(n + lt * 0.008);
  float h1 = mHeight(mLib(n2));
  float bump = clamp((h0 - h1) * 5.0, -0.35, 0.35);
  alb *= 1.0 + h0 * 0.22; // mangkuk kawah sedikit lebih gelap, bibirnya lebih terang (kawah tetap terlihat saat purnama)

  float mu = max(n.z, 0.03);
  float mu0 = dot(n, L);
  float mu0e = clamp(mu0 + bump, 0.0, 1.0);
  float lit = 2.0 * mu0e / (mu0e + mu + 0.001); // Lommel-Seeliger: purnama datar tanpa gelap di tepi
  vec3 c = alb * lit * 1.45;
  float dark = 1.0 - smoothstep(0.0, 0.3, mu0);
  c += alb * vec3(0.55, 0.68, 1.0) * uMoonEarth * dark * 0.6; // cahaya bumi di sisi gelap
  c *= 0.94 + 0.06 * n.z;
  return c * uMoonTint;
}
// d = arah pandang satuan (dunia), h = tinggi di atas horizon sebenarnya. Mengembalikan warna langit dengan bulan dan pendarnya.
// Pendar memakai uMoonGlow (nol di siang hari), cakram memakai uMoonVis (pucat tapi tampak di siang hari).
vec3 moonLayer(vec3 col, vec3 d, float h) {
  float cosA = dot(d, uMoonDir);
  if (cosA < 0.0 || (uMoonVis < 0.002 && uMoonGlow < 0.002)) return col;
  float hv = smoothstep(-0.03, 0.02, h);
  float k = uMoonGlow * hv;
  float vis = uMoonVis * hv;
  float rr = uMoonR;
  vec2 q = vec2(dot(d, uMoonX), dot(d, uMoonY));
  float ang = acos(clamp(cosA, -1.0, 1.0));

  // pendar tiga lapis: rapat, sedang, lebar
  float glow = exp(-ang / (rr * 2.4)) * 0.7 + exp(-ang / (rr * 9.0)) * 0.18 + 0.04 / (1.0 + (ang / (rr * 26.0)) * (ang / (rr * 26.0)));
  col += uMoonTint * glow * k;

  // cincin es 22 derajat: merah di dalam, biru di luar, sangat tipis
  float ringX = (ang - uMoonRing) / (rr * 1.9);
  float ring = exp(-ringX * ringX);
  vec3 ringCol = mix(vec3(1.0, 0.72, 0.52), vec3(0.58, 0.76, 1.0), smoothstep(-1.0, 1.0, ringX));
  col += ringCol * ring * 0.075 * k;

  // berkas cahaya radial yang berputar pelan
  float az = atan(q.y, q.x + 1.0e-6);
  float shaft = mNoise(vec3(cos(az) * 3.2, sin(az) * 3.2, uMoonTime * 0.03));
  shaft = smoothstep(0.35, 0.9, shaft);
  col += uMoonTint * shaft * shaft * exp(-ang / (rr * 16.0)) * 0.14 * k;

  // cakram
  float r2 = dot(q, q) / (rr * rr);
  if (r2 < 1.0) {
    float r = sqrt(r2);
    vec3 n = vec3(q / rr, sqrt(max(1.0 - r2, 0.0)));
    float edge = 1.0 - smoothstep(0.985, 1.0, r);
    col = mix(col, moonDisc(n), edge * vis);
  }
  return col;
}
`;

const srgbToLinear = (hex) => {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
};

/** Uniform bulan untuk bahan kubah langit (dan awan, yang berbagi arah, warna, dan pendar bulan). */
export function createMoonUniforms() {
  return {
    uMoonDir: { value: new THREE.Vector3(...moonDirection()) },
    uMoonX: { value: new THREE.Vector3(1, 0, 0) },
    uMoonY: { value: new THREE.Vector3(0, 1, 0) },
    uMoonLight: { value: new THREE.Vector3(0, 0, 1) },
    uMoonTint: { value: srgbToLinear(0xe6f2ff) },
    uMoonR: { value: Math.sin(MOON.angularRadius) },
    uMoonVis: { value: 0 },
    uMoonGlow: { value: 0 },
    uMoonEarth: { value: 0 },
    uMoonLib: { value: new THREE.Vector2() },
    uMoonRoll: { value: 0 },
    uMoonRing: { value: MOON.ringAngle },
    uMoonTime: { value: 0 },
  };
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const bearingDeg = (azimuth) => (((azimuth * 180) / Math.PI + 180) % 360 + 360) % 360; // arah mata angin dari utara searah jarum jam

/**
 * Mengembalikan { uniforms, mode, location, dirVector, state(), upFactor(), visible(), gains(phase), update({ time, skyMode, phase }), info() }.
 * update dipanggil tiap frame sebelum render: ia menghitung posisi dan fase bulan untuk waktu mode langit saat ini dan menulis semua uniform.
 * dirVector adalah arah bulan yang hidup (dimutakhirkan di tempat): dipakai bintang, tatapan kamera, dan efek 4D.
 */
export function createHotelMoon({ search = '', motion = 1, zone, now = () => Date.now() } = {}) {
  const mode = moonModeFromSearch(search);
  const location = locationFromSearch(search, zone);
  const uniforms = createMoonUniforms();
  const tint = new THREE.Color();
  const dirV = new THREE.Vector3(...moonDirection());
  const target = new THREE.Vector3();
  const sunV = new THREE.Vector3();
  const right = new THREE.Vector3();
  const upV = new THREE.Vector3();
  let state = null;
  let first = true;
  let lastTime = 0;
  let events = null;
  let eventsAt = -Infinity;

  const compute = (skyMode) => moonState({ date: clockDate({ skyMode, now: now(), zone }), lat: location.lat, lon: location.lon, mode });

  const refresh = (time, skyMode, phase) => {
    state = compute(skyMode);
    target.set(state.dir[0], state.dir[1], state.dir[2]);
    const dt = Math.max(0, time - lastTime);
    lastTime = time;
    if (first) {
      dirV.copy(target);
      first = false;
    } else {
      // bulan mengikuti posisi barunya paling cepat followRate rad/detik: pindah mode langit tidak membuatnya melompat
      const angle = Math.acos(Math.min(1, Math.max(-1, dirV.dot(target))));
      const step = MOON.followRate * dt;
      if (angle <= step || angle < 1e-6) dirV.copy(target);
      else {
        dirV.lerp(target, step / angle);
        if (dirV.lengthSq() < 1e-8) dirV.copy(target);
        else dirV.normalize();
      }
    }
    uniforms.uMoonDir.value.copy(dirV);
    right.crossVectors(dirV, WORLD_UP);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0); // bulan tepat di zenit: arah kanan bebas
    right.normalize();
    upV.crossVectors(right, dirV);
    uniforms.uMoonX.value.copy(right);
    uniforms.uMoonY.value.copy(upV);
    // sisi terang cakram: arah matahari dalam bingkai penonton (x kanan, y atas, z ke penonton = -arah bulan)
    sunV.set(state.sunDir[0], state.sunDir[1], state.sunDir[2]);
    const lx = sunV.dot(right);
    const ly = sunV.dot(upV);
    const lz = -sunV.dot(dirV);
    const len = Math.hypot(lx, ly, lz);
    if (len > 1e-6) uniforms.uMoonLight.value.set(lx / len, ly / len, lz / len);
    else uniforms.uMoonLight.value.set(0, 0, 1);
    uniforms.uMoonRoll.value = state.roll;
    const sinAlt = dirV.y;
    const ext = moonExtinction(sinAlt);
    uniforms.uMoonR.value = Math.sin(moonApparentRadius(sinAlt));
    uniforms.uMoonGlow.value = moonGlowK(state.illumination) * moonLevel(phase) * moonGlowFade(sinAlt);
    uniforms.uMoonVis.value = moonDiscVisibility(phase, state.illumination);
    uniforms.uMoonEarth.value = earthshine(state.illumination);
    const [r, g, b] = moonTint(phase, ext.warm, ext.dim);
    tint.setRGB(r, g, b, THREE.SRGBColorSpace);
    uniforms.uMoonTint.value.set(tint.r, tint.g, tint.b);
  };
  refresh(0, 'auto', 1);

  return {
    uniforms,
    mode,
    location,
    dirVector: dirV,
    state: () => state,
    /** 0 di bawah horizon, 1 saat cukup tinggi: pengali cahaya bulan. */
    upFactor: () => moonUpFactor(dirV.y),
    /** Keterlihatan cakram bulan 0..1 saat ini (memperhitungkan fase langit dan horizon). */
    visible: () => uniforms.uMoonVis.value * moonHorizonMask(dirV.y),
    /** Pengali cahaya matahari/bulan dan cahaya langit akibat terang bulan, untuk fase langit tertentu. */
    gains: (phase) => ({ sun: moonSunGain(phase, state.illumination, moonUpFactor(dirV.y)), hemi: moonHemiGain(phase, state.illumination, moonUpFactor(dirV.y)) }),
    update({ time, skyMode = 'auto', phase = 1 }) {
      uniforms.uMoonTime.value = time * motion;
      const [lx, ly] = libration(time, motion);
      uniforms.uMoonLib.value.set(lx, ly);
      refresh(time, skyMode, phase);
    },
    info() {
      const nowMs = now();
      if (nowMs - eventsAt > 600000) {
        eventsAt = nowMs;
        events = moonEvents({ date: nowMs, lat: location.lat, lon: location.lon, mode });
      }
      const iso = (ms) => (ms === null ? null : new Date(ms).toISOString());
      return {
        mode, location, altitudeDeg: (Math.asin(Math.min(1, Math.max(-1, dirV.y))) * 180) / Math.PI, bearingDeg: bearingDeg(state.azimuth),
        illumination: state.illumination, cycle: state.cycle, waxing: state.waxing, visible: this.visible(), rise: iso(events.rise), set: iso(events.set),
      };
    },
  };
}
