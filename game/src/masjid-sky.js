import * as THREE from 'three';
import { blendSky, createPhaseTracker, skyModeFromSearch, zoneFromSearch } from './day-night.js';
import { createNightDecor } from './night-sky.js';

// Langit Masjid Agung NIKORA yang berganti otomatis mengikuti jam asli (siang, senja, malam), lengkap dengan bintang dan bulan.
// ?sky=auto|day|sunset|night|cycle dan ?tz=WIB|WITA|WIT mengatur mode dan zona waktu.
// Warna dalam sRGB 0..1; keadaan siang sama persis dengan nilai tetap sebelumnya.
const FRAMES = Object.freeze({
  day: { bg: [0.663, 0.831, 0.933], fog: [0.812, 0.894, 0.949], hemiSky: [0.902, 0.945, 1], hemiGround: [0.561, 0.494, 0.369], sunColor: [1, 0.941, 0.824], hemiI: 1.0, sunI: 1.7, sunPos: [-180, 300, 140], exposure: 1 },
  sunset: { bg: [0.95, 0.62, 0.42], fog: [0.93, 0.66, 0.5], hemiSky: [1, 0.8, 0.62], hemiGround: [0.4, 0.33, 0.3], sunColor: [1, 0.68, 0.38], hemiI: 0.8, sunI: 1.3, sunPos: [-300, 90, 120], exposure: 1 },
  night: { bg: [0.03, 0.05, 0.14], fog: [0.05, 0.08, 0.18], hemiSky: [0.32, 0.4, 0.68], hemiGround: [0.08, 0.1, 0.16], sunColor: [0.66, 0.76, 1], hemiI: 0.62, sunI: 0.85, sunPos: [150, 260, -120], exposure: 1.15 },
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Mengatur latar, kabut, cahaya langit, matahari/bulan, bintang, dan paparan. Mengembalikan atmosfer { hemiI, sunI, night }
 * yang dipakai dunia untuk menghitung cahaya di dalam ruangan.
 */
export function createMasjidSky({ scene, hemi, sun, renderer, search = '' }) {
  const tracker = createPhaseTracker({ mode: skyModeFromSearch(search), zone: zoneFromSearch(search) });
  const baseExposure = renderer?.toneMappingExposure ?? 1;
  const decor = createNightDecor({ radius: 1200, stars: 900, moonRadius: 34, seed: 2026 });
  scene.add(decor.group);
  // Bulan dilukis rendah di timur laut (sekitar 14° di atas cakrawala, 40° dari utara) supaya terlihat dari taman tanpa menengadah
  // dan pantulannya jatuh di kolam; arah cahaya malam tetap dari FRAMES.night.sunPos (lebih tinggi) agar tanah cukup terang.
  const moonDir = new THREE.Vector3(260, 100, -310).normalize();
  const atm = { hemiI: FRAMES.day.hemiI, sunI: FRAMES.day.sunI, night: 0 };
  const SRGB = THREE.SRGBColorSpace;

  const apply = (phase) => {
    const s = blendSky(FRAMES, phase);
    scene.background.setRGB(s.bg[0], s.bg[1], s.bg[2], SRGB);
    scene.fog.color.setRGB(s.fog[0], s.fog[1], s.fog[2], SRGB);
    hemi.color.setRGB(s.hemiSky[0], s.hemiSky[1], s.hemiSky[2], SRGB);
    hemi.groundColor.setRGB(s.hemiGround[0], s.hemiGround[1], s.hemiGround[2], SRGB);
    sun.color.setRGB(s.sunColor[0], s.sunColor[1], s.sunColor[2], SRGB);
    sun.position.set(s.sunPos[0], s.sunPos[1], s.sunPos[2]);
    if (renderer) renderer.toneMappingExposure = baseExposure * s.exposure;
    atm.hemiI = s.hemiI;
    atm.sunI = s.sunI;
    atm.night = Math.max(0, phase);
    decor.setNight(clamp((phase - 0.3) / 0.6, 0, 1), moonDir);
  };
  tracker.tick(performance.now());
  apply(tracker.phase);

  return {
    atm,
    moonDir,
    /** Memusatkan bintang dan bulan pada pemain supaya tidak bergeser saat berjalan ke tepi kompleks. */
    follow: (x, z) => decor.follow(x, z),
    phase: () => tracker.phase,
    setMode: (mode) => tracker.setMode(mode),
    /** Dipanggil tiap frame: bergerak halus menuju fase target dan menerapkan atmosfer hanya saat nilainya berubah. */
    update(perfMs = performance.now()) {
      if (tracker.tick(perfMs)) apply(tracker.phase);
      decor.twinkle(perfMs / 1000);
      return atm;
    },
  };
}
