import * as THREE from 'three';
import { BEAM, GLASS_REFLECT, beamAngle, beamLevel, envStale, glowPulse, reflectionIntensity, structureGlow } from './hotel-tower-glow-data.js';

// Keindahan tambahan kulit menara siang dan malam. Dipasang oleh hotel-sky.js (createHotelSky) dan TIDAK mengubah hotel-world.js:
// bahan kulit dicari di scene lewat nama grup 'hotel-tower-skin' (hotel-tower-skin.js).
//  1. Kaca memantulkan langit: kubah langit digambar ke peta kubus kecil, diburamkan (PMREM), lalu dipasang sebagai envMap KACA SAJA
//     (bukan scene.environment, jadi pencahayaan benda lain tidak berubah). Dibuat ulang hanya bila fase/ketinggian bergeser (envStale).
//  2. Rangka diagonal, potongan sudut emas, dan mahkota bersinar (emissive) saat senja sampai malam, dengan denyut lembut.
//  3. Dua berkas cahaya berputar dari ujung jarum (kerucut aditif) di malam hari.
// Semua bagian opsional: bila bahan tidak ditemukan atau pembuatan peta pantulan gagal, bagian itu dilewati dan hotel tetap berjalan.

const SKIN = 'hotel-tower-skin';
const GOLD_GLOW = 0xffb347;
const DIAGRID_GLOW = 0xffc861;
const CROWN_GLOW = 0x5fa8d3;

const BEAM_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying float vAlong;
uniform float uLen;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vAlong = position.x / uLen;
  gl_Position = projectionMatrix * mv;
}`;

// Tepi kerucut memudar (normal tegak lurus arah pandang) dan ujung jauh memudar, jadi tampak seperti berkas berkabut.
const BEAM_FRAG = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying float vAlong;
uniform vec3 uColor;
uniform float uOn;
void main() {
  float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
  float a = f * smoothstep(0.0, 0.04, vAlong) * pow(max(1.0 - vAlong, 0.0), 1.5);
  gl_FragColor = vec4(uColor, a * uOn * 0.3);
  #include <colorspace_fragment>
}`;

function makeBeamGeometry() {
  const g = new THREE.ConeGeometry(BEAM.radius, BEAM.length, 20, 1, true); // puncak di +Y, alas di -Y
  g.translate(0, -BEAM.length / 2, 0); // puncak di titik asal, alas di y = -panjang
  g.rotateZ(Math.PI / 2); // memanjang ke arah +X
  return g;
}

/**
 * Mengembalikan { group, update({ phase, time, altitude }), info(), dispose() }. `group` (berkas cahaya) harus ditambahkan ke scene oleh pemanggil.
 * `domeMaterial` = bahan kubah langit hotel-sky.js (dipakai ulang untuk peta pantulan). `time` dalam detik.
 */
export function createTowerGlow({ scene, renderer, domeMaterial, low = false, motion = 1 }) {
  const skin = scene.getObjectByName(SKIN);
  const part = (name) => skin?.getObjectByName(name)?.material ?? null;
  const glass = part('skin-glass');
  const group = new THREE.Group();
  group.name = 'hotel-tower-glow';

  // ---- 2. bagian yang bersinar: [bahan, kekuatan maksimum]
  const fixtures = [];
  const corners = part('skin-corners');
  if (corners) {
    corners.emissive.set(GOLD_GLOW);
    corners.emissiveIntensity = 0;
    corners.needsUpdate = true;
    fixtures.push([corners, 0.9]);
  }
  for (let i = 0; i < 4; i++) {
    const m = part(`skin-diagrid-${i}`);
    if (!m || !m.map) continue;
    m.emissiveMap = m.map; // garis emas bertekstur transparan: hanya garisnya yang menyala
    m.emissive.set(DIAGRID_GLOW);
    m.emissiveIntensity = 0;
    m.needsUpdate = true;
    fixtures.push([m, 1.1]);
  }
  const crownGlass = part('crown-glass');
  if (crownGlass) {
    crownGlass.emissive.set(CROWN_GLOW);
    crownGlass.emissiveIntensity = 0;
    crownGlass.needsUpdate = true;
    fixtures.push([crownGlass, 0.5]);
  }
  const crownCap = part('crown-cap');
  if (crownCap) {
    crownCap.emissive.set(GOLD_GLOW);
    crownCap.emissiveIntensity = 0;
    crownCap.needsUpdate = true;
    fixtures.push([crownCap, 0.9]);
  }

  // ---- 3. berkas cahaya dari ujung jarum
  const beams = [];
  let beamMat = null;
  const needle = skin?.getObjectByName('crown-needle');
  if (needle) {
    const tip = needle.getWorldPosition(new THREE.Vector3());
    tip.y += (needle.geometry.parameters?.height ?? 0) / 2;
    beamMat = new THREE.ShaderMaterial({
      uniforms: { uLen: { value: BEAM.length }, uColor: { value: new THREE.Color(0xfff2c8) }, uOn: { value: 0 } },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const geometry = makeBeamGeometry();
    const count = low ? 1 : BEAM.count;
    for (let i = 0; i < count; i++) {
      const pivot = new THREE.Group();
      pivot.position.copy(tip);
      const beam = new THREE.Mesh(geometry, beamMat);
      beam.rotation.z = -BEAM.tilt; // condong sedikit ke bawah
      beam.frustumCulled = false;
      beam.renderOrder = 11; // sesudah lapisan titik cahaya (renderOrder 10)
      pivot.add(beam);
      pivot.userData.offset = (i * Math.PI * 2) / count;
      group.add(pivot);
      beams.push(pivot);
    }
  }
  group.visible = false;

  // ---- 1. pantulan langit di kaca
  let env = null;
  if (glass && domeMaterial) {
    try {
      const envScene = new THREE.Scene();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 16), domeMaterial);
      dome.frustumCulled = false;
      envScene.add(dome);
      const cube = new THREE.WebGLCubeRenderTarget(low ? 32 : 64, { type: THREE.HalfFloatType });
      env = { scene: envScene, dome, cube, cam: new THREE.CubeCamera(0.1, 1000, cube), pmrem: new THREE.PMREMGenerator(renderer), rt: null, last: null, applied: false, broken: false };
    } catch (err) {
      console.warn('[hotel] pantulan langit di kaca tidak tersedia', err);
      env = null;
    }
  }

  function capture(phase, altitude, time) {
    try {
      env.cam.update(renderer, env.scene);
      const rt = env.pmrem.fromCubemap(env.cube.texture);
      glass.envMap = rt.texture;
      if (!env.applied) {
        glass.metalness = GLASS_REFLECT.metalness;
        glass.roughness = GLASS_REFLECT.roughness;
        glass.needsUpdate = true; // envMap baru ditambahkan: bahan perlu dikompilasi ulang sekali
        env.applied = true;
      }
      env.rt?.dispose();
      env.rt = rt;
      env.last = { phase, altitude, time };
    } catch (err) {
      env.broken = true;
      console.warn('[hotel] pembuatan peta pantulan gagal, pantulan dimatikan', err);
    }
  }

  return {
    group,
    /** Panggil tiap frame sebelum render. */
    update({ phase, time, altitude }) {
      const glow = structureGlow(phase) * glowPulse(time, motion);
      for (const [m, gain] of fixtures) m.emissiveIntensity = glow * gain;
      if (beamMat) {
        const on = beamLevel(phase);
        beamMat.uniforms.uOn.value = on;
        group.visible = on > 0.003;
        const a = beamAngle(time * motion);
        for (const pivot of beams) pivot.rotation.y = a + pivot.userData.offset;
      }
      if (env && !env.broken) {
        if (envStale({ phase, altitude, last: env.last, now: time })) capture(phase, altitude, time);
        if (env.applied) glass.envMapIntensity = reflectionIntensity(phase);
      }
    },
    info: () => ({ glowParts: fixtures.length, beams: beams.length, reflection: !!env && env.applied && !env.broken }),
    dispose() {
      if (env) {
        if (glass && env.applied) {
          glass.envMap = null;
          glass.needsUpdate = true;
        }
        env.rt?.dispose();
        env.cube.dispose();
        env.pmrem.dispose();
        env.dome.geometry.dispose(); // bahan kubah milik hotel-sky.js, jangan dibuang di sini
        env = null;
      }
      group.removeFromParent();
      group.traverse((o) => o.geometry?.dispose?.());
      beamMat?.dispose();
    },
  };
}
