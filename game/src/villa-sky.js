import * as THREE from 'three';
import { blendSky, createPhaseTracker, skyModeFromSearch, zoneFromSearch } from './day-night.js';
import { createNightDecor } from './night-sky.js';

// Langit dan cahaya NIKORA Villa yang berganti otomatis mengikuti jam asli (siang, senja, malam).
// ?sky=auto|day|sunset|night|cycle dan ?tz=WIB|WITA|WIT mengatur mode dan zona waktu.
// Modul ini TIDAK mengubah villa-world.js: ia mencari langit, matahari, cahaya langit, dan bahan bercahaya di scene yang sudah jadi.
// Warna dalam sRGB 0..1; keadaan siang sama persis dengan nilai tetap sebelumnya.
//   dir    = arah cahaya (matahari, lalu bulan saat malam)    skyDir = posisi matahari pada shader langit (di bawah horizon saat malam)
const FRAMES = Object.freeze({
  day: { dir: [0.44, 0.84, 0.32], skyDir: [0.44, 0.84, 0.32], sunColor: [1, 0.925, 0.796], sunI: 2.7, hemiSky: [0.89, 0.941, 1], hemiGround: [0.525, 0.58, 0.424], hemiI: 0.5, fog: [0.812, 0.878, 0.925], env: 0.5, exposure: 1, turbidity: 2.6, rayleigh: 1.3 },
  sunset: { dir: [0.9, 0.12, 0.35], skyDir: [0.9, 0.035, 0.35], sunColor: [1, 0.62, 0.32], sunI: 2.0, hemiSky: [1, 0.78, 0.62], hemiGround: [0.4, 0.33, 0.3], hemiI: 0.45, fog: [0.93, 0.62, 0.45], env: 0.32, exposure: 1, turbidity: 6, rayleigh: 2.2 },
  night: { dir: [-0.4, 0.7, -0.3], skyDir: [0.9, -0.3, 0.35], sunColor: [0.5, 0.62, 1], sunI: 0.55, hemiSky: [0.3, 0.38, 0.7], hemiGround: [0.07, 0.08, 0.13], hemiI: 0.42, fog: [0.04, 0.06, 0.14], env: 0.1, exposure: 1.2, turbidity: 2.6, rayleigh: 1.0 },
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const WINDOW_GLOW = 0xffd9a0;

/** Mencari bagian dunia yang perlu berubah: shader langit, satu-satunya matahari berbayangan, cahaya langit, lampu, kaca jendela, bercak rumput. */
function locate(scene) {
  const parts = { sky: null, sun: null, hemi: null, lamps: [], glass: [], blotches: [] };
  const seen = new Set();
  scene.traverse((o) => {
    if (!parts.sky && o.material?.uniforms?.sunPosition && o.material.uniforms.turbidity) parts.sky = o;
    if (!parts.sun && o.isDirectionalLight && o.castShadow) parts.sun = o;
    if (!parts.hemi && o.isHemisphereLight) parts.hemi = o;
    for (const m of [].concat(o.material ?? [])) {
      if (seen.has(m)) continue;
      seen.add(m);
      if (m.isMeshPhysicalMaterial && m.transparent && m.side === THREE.DoubleSide && Math.abs(m.opacity - 0.2) < 1e-6) {
        parts.glass.push({ m, base: m.opacity }); // kaca jendela (bening 20%)
      } else if (m.isMeshStandardMaterial && m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0) {
        parts.lamps.push({ m, base: m.emissiveIntensity }); // lampu gantung, lampion, lilin, bohlam pagar
      } else if (m.isMeshBasicMaterial && m.transparent && m.map && m.depthWrite === false) {
        parts.blotches.push({ m, base: m.opacity }); // bercak rumput gelap/terang (tanpa pencahayaan)
      }
    }
  });
  return parts;
}

/** Panggil tepat setelah buildVillaWorld (sebelum layar dan avatar dibuat) dan panggil update() tiap frame SESUDAH built.update(). */
export function createVillaSky({ scene, renderer, search = '' }) {
  const parts = locate(scene);
  const { sky, sun, hemi } = parts;
  const tracker = createPhaseTracker({ mode: skyModeFromSearch(search), zone: zoneFromSearch(search) });
  const baseExposure = renderer?.toneMappingExposure ?? 1;
  const decor = createNightDecor({ radius: 270, stars: 650, moonRadius: 9, seed: 7 }); // di dalam jarak pandang kamera (320)
  scene.add(decor.group);
  const dir = new THREE.Vector3();
  const moonDir = new THREE.Vector3(...FRAMES.night.dir).normalize();
  const SRGB = THREE.SRGBColorSpace;

  const apply = (phase) => {
    const s = blendSky(FRAMES, phase);
    dir.set(s.dir[0], s.dir[1], s.dir[2]).normalize();
    if (sun) {
      sun.color.setRGB(s.sunColor[0], s.sunColor[1], s.sunColor[2], SRGB);
      sun.intensity = s.sunI;
    }
    if (hemi) {
      hemi.color.setRGB(s.hemiSky[0], s.hemiSky[1], s.hemiSky[2], SRGB);
      hemi.groundColor.setRGB(s.hemiGround[0], s.hemiGround[1], s.hemiGround[2], SRGB);
      hemi.intensity = s.hemiI;
    }
    if (scene.fog) scene.fog.color.setRGB(s.fog[0], s.fog[1], s.fog[2], SRGB);
    scene.environmentIntensity = s.env;
    if (renderer) renderer.toneMappingExposure = baseExposure * s.exposure;
    if (sky) {
      const u = sky.material.uniforms;
      u.sunPosition.value.set(s.skyDir[0], s.skyDir[1], s.skyDir[2]);
      u.turbidity.value = s.turbidity;
      u.rayleigh.value = s.rayleigh;
    }
    // lampu menyala bertahap dari sore (fase -0,25) sampai penuh saat malam (fase 0,5); siang hari nyaris padam
    const lampOn = clamp((phase + 0.25) / 0.75, 0, 1);
    for (const { m, base } of parts.lamps) m.emissiveIntensity = base * (0.1 + 0.9 * lampOn) * (1 + 0.25 * lampOn);
    for (const { m, base } of parts.glass) {
      m.emissive.setHex(WINDOW_GLOW); // jendela tampak hangat dari dalam saat malam
      m.emissiveIntensity = 0.5 * lampOn;
      m.opacity = base + 0.25 * lampOn;
    }
    const dark = clamp(phase * 1.2, 0, 1);
    for (const { m, base } of parts.blotches) m.opacity = base * (1 - 0.85 * dark); // bercak rumput tidak boleh menyala di malam hari
    decor.setNight(clamp((phase - 0.3) / 0.6, 0, 1), moonDir);
  };
  tracker.tick(performance.now());
  apply(tracker.phase);

  return {
    phase: () => tracker.phase,
    setMode: (mode) => tracker.setMode(mode),
    info: () => ({
      phase: tracker.phase, mode: tracker.mode, hasSky: !!sky, hasSun: !!sun, hasHemi: !!hemi, lamps: parts.lamps.length, glass: parts.glass.length, blotches: parts.blotches.length,
    }),
    /** px, pz = posisi pemain. Menimpa posisi matahari yang diatur villa-world supaya arah cahaya mengikuti jam. */
    update(px = 0, pz = 0, perfMs = performance.now()) {
      if (tracker.tick(perfMs)) apply(tracker.phase);
      decor.follow(px, pz);
      if (sun) {
        sun.position.set(px + dir.x * 50, dir.y * 50, pz + dir.z * 50);
        sun.target.position.set(px, 0, pz);
        sun.target.updateMatrixWorld();
      }
    },
  };
}
