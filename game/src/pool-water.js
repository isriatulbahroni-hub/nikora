import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { POOL_CAPTURE_RANGE, designOf, selectCapturePool, underwaterMix } from './pool-water-logic.js';

// Air kolam renang NIKORA. Diadaptasi dari "beautiful-water" (VictorZakharov, lisensi MIT; lihat
// game/THIRD_PARTY_NOTICES.md): tekstur derau deterministik, riak mikro, Fresnel, pantulan matahari GGX, dan
// pantulan scene lewat `Reflector`. Yang TIDAK dibawa: gelombang laut (vertex), buih, kilau, awan, langit
// prosedural, refraksi (Refractor), dan jalur WebGPU. Air dibuat tembus pandang (alpha) supaya dasar kolam terlihat,
// sehingga hanya satu tangkapan scene tambahan (pantulan) per frame, dan itu hanya untuk satu kolam terdekat.
//
// Pemakaian:
//   const water = createPoolWaterSystem({ renderer, scene, camera, sunDirection });
//   water.addPool({ id: 'lt2', x, y, z, width, depth, design: 'azure' });
//   // tiap frame, sesudah kamera diposisikan dan sebelum renderer.render():
//   const { underwater } = water.update(timeSeconds);

const NOISE_TEXTURE_SIZE = 512;
let sharedNoise = null;

function nextRandom(state) {
  let value = state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function noiseTexture() {
  if (sharedNoise) return sharedNoise;
  const texelCount = NOISE_TEXTURE_SIZE * NOISE_TEXTURE_SIZE;
  const data = new Uint8Array(texelCount * 4);
  let state = 0x9e3779b9;
  for (let index = 0; index < texelCount; index += 1) {
    state = nextRandom(state);
    const offset = index * 4;
    data[offset] = state & 0xff;
    data[offset + 1] = (state >>> 8) & 0xff;
    data[offset + 2] = (state >>> 16) & 0xff;
    data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, NOISE_TEXTURE_SIZE, NOISE_TEXTURE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'Pool deterministic noise';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  sharedNoise = texture;
  return texture;
}

const vertexShader = /* glsl */ `
  precision highp float;
  uniform mat4 uReflectionTextureMatrix;
  varying vec3 vWorldPosition;
  varying vec4 vReflectionCoord;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vReflectionCoord = uReflectionTextureMatrix * worldPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform vec3 uShallowColor;
  uniform vec3 uDeepColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uZenithColor;
  uniform float uBodyOpacity;
  uniform float uRipple;
  uniform float uUnderwater;
  uniform float uCapture;
  uniform sampler2D tReflectionMap;
  uniform sampler2D tNoiseMap;

  varying vec3 vWorldPosition;
  varying vec4 vReflectionCoord;

  const float WATER_PI = 3.141592653589793;
  const float NOISE_TEXTURE_SIZE = ${NOISE_TEXTURE_SIZE.toFixed(1)};

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // Derau nilai halus dari tekstur kisi acak (filter bilinear perangkat keras).
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    vec2 uv = (i + f + 0.5) / NOISE_TEXTURE_SIZE;
    return texture2D(tNoiseMap, uv, -0.65).r;
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      value += amplitude * valueNoise(p);
      p = rotation * p * 2.04 + 9.2;
      amplitude *= 0.5;
    }
    return value;
  }

  float distributionGGX(float alpha, float normalDotHalf) {
    float alphaSquared = alpha * alpha;
    float denominator = normalDotHalf * normalDotHalf * (alphaSquared - 1.0) + 1.0;
    return alphaSquared / max(WATER_PI * denominator * denominator, 0.00001);
  }

  float visibilitySmithGGXCorrelated(float alpha, float normalDotView, float normalDotLight) {
    float alphaSquared = alpha * alpha;
    float viewTerm = normalDotLight * sqrt(alphaSquared + (1.0 - alphaSquared) * normalDotView * normalDotView);
    float lightTerm = normalDotView * sqrt(alphaSquared + (1.0 - alphaSquared) * normalDotLight * normalDotLight);
    return 0.5 / max(viewTerm + lightTerm, 0.00001);
  }

  float fresnelSchlick(float viewDotHalf) {
    const float waterF0 = 0.02037;
    float grazing = pow(1.0 - viewDotHalf, 5.0);
    return waterF0 + (1.0 - waterF0) * grazing;
  }

  void addRipple(vec2 p, vec2 direction, float frequency, float amplitude, float speed, inout vec2 gradient) {
    direction = normalize(direction);
    float phase = dot(p, direction) * frequency + uTime * speed;
    gradient += direction * (amplitude * frequency * cos(phase));
  }

  float microHeight(vec2 p) {
    mat2 turn = mat2(0.78, -0.63, 0.63, 0.78);
    vec2 drift = vec2(uTime * 0.068, -uTime * 0.047);
    float broad = valueNoise(p * 1.65 + drift);
    float middle = valueNoise(turn * p * 3.7 - drift * 1.37 + 13.7);
    float detail = valueNoise(turn * p * 7.9 + drift * 1.74 - 8.4);
    mat2 counterTurn = mat2(0.58, 0.81, -0.81, 0.58);
    float fine = valueNoise(counterTurn * p * 15.8 - drift * 2.1 + 31.6);
    float sparkle = valueNoise(turn * p * 31.0 + drift * 2.8 - 21.9);
    return broad * 0.030 + middle * 0.015 + detail * 0.0065 + fine * 0.0026 + sparkle * 0.0009;
  }

  // Kemiringan permukaan dari riak: jarak pudar disesuaikan ke skala kolam (laut aslinya 20..285 m).
  vec2 microGradient(vec2 p, float distanceToCamera) {
    vec2 warp = vec2(
      fbm(p * 0.16 + vec2(uTime * 0.018, -uTime * 0.011)),
      fbm(p * 0.16 + vec2(17.4, -9.2) + vec2(-uTime * 0.013, uTime * 0.016))
    ) - 0.5;
    p += warp * 1.55;

    vec2 coarseGradient = vec2(0.0);
    vec2 mediumGradient = vec2(0.0);
    vec2 fineGradient = vec2(0.0);
    addRipple(p, vec2(0.86, 0.51), 1.15, 0.0240, -0.78, coarseGradient);
    addRipple(p, vec2(-0.52, 0.85), 1.78, 0.0155, 1.02, coarseGradient);
    addRipple(p, vec2(0.97, -0.24), 2.75, 0.0095, -1.46, mediumGradient);
    addRipple(p, vec2(-0.31, 0.95), 4.65, 0.0053, 1.88, mediumGradient);
    addRipple(p, vec2(0.18, -0.98), 7.9, 0.00225, -2.43, fineGradient);
    addRipple(p, vec2(0.68, 0.73), 13.2, 0.00082, 3.10, fineGradient);

    float coarseFade = 1.0 - smoothstep(60.0, 140.0, distanceToCamera);
    float mediumFade = 1.0 - smoothstep(30.0, 90.0, distanceToCamera);
    float fineDistanceFade = 1.0 - smoothstep(12.0, 45.0, distanceToCamera);
    float footprint = max(length(dFdx(p)), length(dFdy(p)));
    float fineFootprintFade = 1.0 - smoothstep(0.025, 0.19, footprint);
    float epsilon = 0.028;
    vec2 noiseGradient = vec2(
      microHeight(p + vec2(epsilon, 0.0)) - microHeight(p - vec2(epsilon, 0.0)),
      microHeight(p + vec2(0.0, epsilon)) - microHeight(p - vec2(0.0, epsilon))
    ) / (2.0 * epsilon);
    return coarseGradient * coarseFade
      + mediumGradient * mediumFade
      + fineGradient * fineDistanceFade * fineFootprintFade
      + noiseGradient * mediumFade * fineFootprintFade;
  }

  float projectiveValidity(float clipW) {
    return smoothstep(0.02, 0.20, clipW);
  }

  void main() {
    float distanceToCamera = length(cameraPosition - vWorldPosition);
    vec2 gradient = microGradient(vWorldPosition.xz, distanceToCamera) * uRipple;
    vec3 surfaceUp = normalize(vec3(-gradient.x, 1.0, -gradient.y));
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float viewFacing = clamp(abs(dot(surfaceUp, viewDirection)), 0.0, 1.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - viewFacing, 5.0);

    // Pantulan: tangkapan scene (kolam terdekat) bila ada, jika tidak gradasi langit.
    vec3 reflectionDirection = reflect(-viewDirection, surfaceUp);
    reflectionDirection.y = max(reflectionDirection.y, 0.015);
    vec3 skyColor = mix(uHorizonColor, uZenithColor, smoothstep(0.0, 0.8, reflectionDirection.y));
    vec2 reflectionUv = vReflectionCoord.xy / max(vReflectionCoord.w, 0.001);
    reflectionUv += gradient * mix(0.006, 0.014, viewFacing);
    float captureFade = projectiveValidity(vReflectionCoord.w) * uCapture;
    vec3 captured = texture2D(tReflectionMap, clamp(reflectionUv, vec2(0.003), vec2(0.997))).rgb;
    vec3 reflected = mix(skyColor, captured, captureFade);

    // Warna badan air: melihat tegak lurus = dangkal/terang, miring = dalam/gelap.
    float depthNoise = fbm(vWorldPosition.xz * 0.35 + vec2(uTime * 0.02, -uTime * 0.015));
    vec3 body = mix(uDeepColor, uShallowColor, clamp(0.35 + viewFacing * 0.45 + depthNoise * 0.25, 0.0, 1.0));

    // Pantulan matahari (GGX); varians normal layar melebarkan sorot yang lebih kecil dari piksel.
    vec3 halfVector = normalize(viewDirection + uSunDirection);
    float normalDotView = max(dot(surfaceUp, viewDirection), 0.001);
    float normalDotLight = max(dot(surfaceUp, uSunDirection), 0.001);
    float normalDotHalf = max(dot(surfaceUp, halfVector), 0.0);
    float viewDotHalf = max(dot(viewDirection, halfVector), 0.0);
    vec3 normalDx = dFdx(surfaceUp);
    vec3 normalDy = dFdy(surfaceUp);
    float normalVariance = max(dot(normalDx, normalDx), dot(normalDy, normalDy));
    float microfacetAlpha = clamp(0.012 + min(normalVariance * 0.32, 0.055), 0.0012, 0.06);
    float specular = distributionGGX(microfacetAlpha, normalDotHalf)
      * visibilitySmithGGXCorrelated(microfacetAlpha, normalDotView, normalDotLight)
      * fresnelSchlick(viewDotHalf) * normalDotLight;
    specular = specular / (1.0 + specular);

    // Alpha: badan air + pantulan (Fresnel). Warna disusun pra-kali lalu dibagi alpha.
    float surfaceAlpha = uBodyOpacity * (1.0 - fresnel) + fresnel;
    vec3 surfaceColor = (body * uBodyOpacity * (1.0 - fresnel) + reflected * fresnel) / max(surfaceAlpha, 0.001);
    surfaceColor += vec3(1.0, 0.92, 0.78) * specular * 2.0;
    surfaceAlpha = max(surfaceAlpha, clamp(specular * 2.0, 0.0, 1.0));

    // Melihat dari bawah permukaan.
    vec3 underDeep = uDeepColor * 0.25;
    vec3 underLit = mix(uDeepColor, uShallowColor, 0.7) * 0.9;
    vec3 underwaterColor = mix(underDeep, underLit, 0.25 + viewFacing * 0.6);
    underwaterColor = mix(underwaterColor, underDeep, (1.0 - exp(-distanceToCamera * 0.12)) * 0.7);

    vec3 color = mix(surfaceColor, underwaterColor, uUnderwater);
    float alpha = mix(surfaceAlpha, 0.9, uUnderwater);
    color += (hash21(gl_FragCoord.xy + uTime * 17.0) - 0.5) / 420.0;

    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Sistem air kolam: satu Reflector bersama (satu render target) dipindah ke kolam terdekat yang kamera-nya di atas air.
 * Kolam lain memakai gradasi langit sebagai pantulan, jadi biayanya tetap satu tangkapan per frame berapa pun jumlah kolam.
 */
export function createPoolWaterSystem({
  renderer,
  scene,
  camera,
  sunDirection = new THREE.Vector3(0.45, 0.8, -0.35),
  skyHorizon = 0xcfe6f5,
  skyZenith = 0x5b9bd5,
  captureResolution,
  captureEvery = 1,
  captureRange = POOL_CAPTURE_RANGE,
} = {}) {
  const resolution = captureResolution ?? (typeof window !== 'undefined' && window.innerWidth < 720 ? 384 : 512);
  const sun = sunDirection.clone().normalize();
  const noise = noiseTexture();
  const reflector = new Reflector(new THREE.PlaneGeometry(1, 1), { textureWidth: resolution, textureHeight: resolution, clipBias: 0.0025, multisample: 0 });
  reflector.rotation.x = -Math.PI / 2;
  const reflectionTexture = reflector.getRenderTarget().texture;
  const pools = [];
  const inverseWorld = new THREE.Matrix4();
  let frame = 0;
  let activeId = null;

  function addPool({ id, x, y, z, width, depth, design }) {
    const look = designOf(design);
    const uniforms = {
      uTime: { value: 0 },
      uSunDirection: { value: sun },
      uShallowColor: { value: new THREE.Color(look.shallow) },
      uDeepColor: { value: new THREE.Color(look.deep) },
      uHorizonColor: { value: new THREE.Color(skyHorizon) },
      uZenithColor: { value: new THREE.Color(skyZenith) },
      uBodyOpacity: { value: look.opacity },
      uRipple: { value: look.ripple },
      uUnderwater: { value: 0 },
      uCapture: { value: 0 },
      uReflectionTextureMatrix: { value: new THREE.Matrix4() },
      tReflectionMap: { value: reflectionTexture },
      tNoiseMap: { value: noise },
    };
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const geometry = new THREE.PlaneGeometry(width, depth, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 5;
    mesh.name = `pool-water-${id}`;
    scene.add(mesh);
    const pool = { id, x, y, z, width, depth, design, mesh, uniforms };
    pools.push(pool);
    return pool;
  }

  function capture(target) {
    camera.updateMatrixWorld();
    reflector.position.set(target.x, target.y, target.z);
    reflector.updateMatrixWorld(true);
    const visibility = pools.map((p) => p.mesh.visible);
    for (const p of pools) p.mesh.visible = false; // air tidak boleh memantulkan dirinya sendiri
    try {
      reflector.onBeforeRender(renderer, scene, camera);
    } finally {
      pools.forEach((p, i) => {
        p.mesh.visible = visibility[i];
      });
    }
    inverseWorld.copy(reflector.matrixWorld).invert();
    target.uniforms.uReflectionTextureMatrix.value.copy(reflector.material.uniforms.textureMatrix.value).multiply(inverseWorld);
  }

  /** Panggil tiap frame sebelum renderer.render(). `underwater` (0..1) dipakai pemanggil untuk kabut/latar bawah air. */
  function update(timeSeconds) {
    frame += 1;
    const position = camera.position;
    let underwater = 0;
    for (const p of pools) {
      p.uniforms.uTime.value = timeSeconds;
      const mix = underwaterMix(p, position);
      p.uniforms.uUnderwater.value = mix;
      underwater = Math.max(underwater, mix);
    }
    const target = selectCapturePool(pools, position, { range: captureRange });
    const id = target?.id ?? null;
    for (const p of pools) p.uniforms.uCapture.value = p === target ? 1 : 0;
    if (target && (id !== activeId || frame % Math.max(1, captureEvery) === 0)) capture(target);
    activeId = id;
    return { underwater, activePoolId: id };
  }

  function dispose() {
    for (const p of pools) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    pools.length = 0;
    reflector.getRenderTarget().dispose();
    reflector.geometry.dispose();
    reflector.material.dispose();
  }

  return { addPool, update, dispose, pools, get activePoolId() { return activeId; } };
}
