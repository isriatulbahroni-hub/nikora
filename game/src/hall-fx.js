import * as THREE from 'three';
import { POOLS, POOL_FLOOR_Y, WATER_Y, FOUNTAINS } from './hall-layout.js';
import { seeded, transform } from './hall-kit.js';
import { tiled } from './hall-textures.js';

// Efek hidup: langit senja, laut, air kolam, air mancur berpartikel, cahaya lampu, kunang-kunang.
// Semua dihitung di GPU lewat uniform waktu sehingga tidak membebani CPU tiap frame.

/** Arah ke matahari senja: di kanan-depan, rendah di atas laut. */
export const SUN_DIR = new THREE.Vector3(0.78, 0.13, -0.61).normalize();

const SKY_GLSL = /* glsl */ `
vec3 skyColor(vec3 d, vec3 sunDir) {
  float h = d.y;
  vec3 horizon = vec3(1.0, 0.46, 0.20);
  vec3 low = vec3(0.92, 0.20, 0.26);
  vec3 mid = vec3(0.34, 0.15, 0.50);
  vec3 top = vec3(0.035, 0.06, 0.24);
  float t = max(h, 0.0);
  vec3 col = mix(horizon, low, smoothstep(0.0, 0.14, t));
  col = mix(col, mid, smoothstep(0.10, 0.42, t));
  col = mix(col, top, smoothstep(0.32, 0.95, t));
  if (h < 0.0) col = mix(horizon * 0.85, vec3(0.30, 0.16, 0.30), clamp(-h * 3.0, 0.0, 1.0));
  float sd = max(dot(d, sunDir), 0.0);
  col += vec3(1.0, 0.55, 0.22) * pow(sd, 5.0) * 0.55;
  col += vec3(1.0, 0.72, 0.38) * pow(sd, 60.0) * 1.2;
  col += vec3(1.0, 0.95, 0.80) * smoothstep(0.9990, 0.99955, sd) * 6.0;
  return col;
}
`;

/** Langit sederhana tanpa shader piksel: warna per titik (mode ringan). */
export function createSimpleSky(radius = 480) {
  const geo = new THREE.SphereGeometry(radius, 24, 16);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const sm = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < pos.count; i += 1) {
    const h = pos.getY(i) / radius;
    const t = Math.max(h, 0);
    let c = mix([1.0, 0.46, 0.2], [0.92, 0.2, 0.26], sm(0, 0.14, t));
    c = mix(c, [0.34, 0.15, 0.5], sm(0.1, 0.42, t));
    c = mix(c, [0.035, 0.06, 0.24], sm(0.32, 0.95, t));
    if (h < 0) c = mix([0.85, 0.39, 0.17], [0.3, 0.16, 0.3], Math.min(1, -h * 3));
    colors.set(c, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false }));
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

export function createSky(radius = 480) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uSunDir: { value: SUN_DIR.clone() } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uSunDir;
      ${SKY_GLSL}
      void main() {
        gl_FragColor = vec4(skyColor(normalize(vDir), uSunDir), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

/** Peta lingkungan dari langit senja (satu kali): memberi pantulan hangat pada emas, kaca, air, dan marmer. */
export function createEnvironment(renderer) {
  const envScene = new THREE.Scene();
  envScene.add(createSky(50));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0.02, 0.1, 100);
  pmrem.dispose();
  envScene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return target.texture;
}

/** Laut: pantulan langit + kilau matahari + kabut jarak, tanpa tekstur warna. */
export function createSimpleSea(fog) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshBasicMaterial({ color: 0x4a3f66, fog: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -9;
  mesh.frustumCulled = false;
  void fog;
  return { mesh, material: { uniforms: { uTime: { value: 0 } } } };
}

export function createSea(textures, fog) {
  textures.seaNormal.repeat.set(1, 1);
  const material = new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      uNormal: { value: textures.seaNormal },
      uTime: { value: 0 },
      uSunDir: { value: SUN_DIR.clone() },
      uFogColor: { value: fog.color.clone() },
      uFogNear: { value: fog.near },
      uFogFar: { value: fog.far },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      uniform sampler2D uNormal;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      ${SKY_GLSL}
      void main() {
        vec2 uv = vWorld.xz;
        vec2 n1 = texture2D(uNormal, uv * 0.020 + vec2(uTime * 0.012, uTime * 0.008)).xy * 2.0 - 1.0;
        vec2 n2 = texture2D(uNormal, uv * 0.057 - vec2(uTime * 0.018, -uTime * 0.011)).xy * 2.0 - 1.0;
        float dist = length(vWorld - cameraPosition);
        float calm = mix(0.55, 0.12, smoothstep(40.0, 360.0, dist));
        vec3 N = normalize(vec3((n1.x + n2.x) * calm, 1.0, (n1.y + n2.y) * calm));
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 R = reflect(-V, N);
        R.y = abs(R.y) + 0.002;
        vec3 refl = skyColor(normalize(R), uSunDir);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(V, N), 0.0), 4.0);
        vec3 deep = vec3(0.010, 0.040, 0.075);
        vec3 col = mix(deep, refl, clamp(fres * 1.15 + 0.10, 0.0, 1.0));
        float f = smoothstep(uFogNear, uFogFar, dist);
        col = mix(col, uFogColor, f * 0.9);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -9;
  mesh.frustumCulled = false;
  return { mesh, material };
}

/** Pegunungan jauh, awan senja, lampu kota di seberang laut, dan perahu layar. */
export function createFarScenery(textures, { lite = false } = {}) {
  const group = new THREE.Group();
  const band = (tex, radius, height, y) => {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.BackSide });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 64, 1, true), mat);
    m.position.y = y;
    m.renderOrder = -8;
    m.frustumCulled = false;
    return m;
  };
  const far = band(textures.mountainFar, 430, 70, 8);
  far.rotation.y = 0.6;
  const near = band(textures.mountainNear, 380, 62, 5);
  near.rotation.y = 2.1;
  group.add(far, near);
  if (lite) {
    group.remove(far);
    return group;
  }

  // awan senja berwarna merah muda-jingga
  const r = seeded(404);
  const cloudMat = (tint, opacity) =>
    new THREE.MeshBasicMaterial({ map: textures.cloud, color: tint, transparent: true, opacity, depthWrite: false, fog: false });
  for (let i = 0; i < 20; i += 1) {
    const az = (i / 20) * Math.PI * 2 + r() * 0.3;
    const el = 0.12 + r() * 0.34;
    const dist = 340;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(130 + r() * 90, 38 + r() * 26), cloudMat(i % 3 === 0 ? 0xffb494 : i % 3 === 1 ? 0xff9aa4 : 0xd9a4d8, 0.5 + r() * 0.3));
    mesh.position.set(Math.cos(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.sin(az) * Math.cos(el) * dist);
    mesh.lookAt(0, 0, 0);
    mesh.renderOrder = -7;
    group.add(mesh);
  }

  // lampu kota di seberang laut (sisi kanan)
  const n = 260;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const a = 0.15 + r() * 0.95; // sudut dari +x ke -z
    const dist = 330 + r() * 40;
    pos[i * 3] = Math.cos(a) * dist;
    pos[i * 3 + 1] = -2 + r() * 7;
    pos[i * 3 + 2] = -Math.sin(a) * dist;
  }
  const lights = new THREE.BufferGeometry();
  lights.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const city = new THREE.Points(lights, new THREE.PointsMaterial({ color: 0xffd98a, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false, fog: false, map: textures.glow }));
  city.renderOrder = -6;
  city.frustumCulled = false;
  group.add(city);
  return group;
}

/** Perahu layar kecil di laut (bergoyang pelan). */
export function createBoats() {
  const group = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.5 });
  const sail = new THREE.MeshStandardMaterial({ color: 0xfff4e4, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x442211, emissiveIntensity: 0.35 });
  const boats = [];
  [[52, -34, 0.4], [78, -18, 2.1], [66, 20, 4.0], [118, -60, 1.1]].forEach(([x, z, ry], i) => {
    const b = new THREE.Group();
    const h = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.9, 1.7), hull);
    h.position.y = 0.45;
    const prow = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.8, 4), hull);
    prow.rotation.z = -Math.PI / 2;
    prow.rotation.y = Math.PI / 4;
    prow.position.set(3.4, 0.45, 0);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.5, 6), hull);
    mast.position.set(0, 4.2, 0);
    const triShape = new THREE.Shape();
    triShape.moveTo(0, 0);
    triShape.lineTo(3.6, 0);
    triShape.lineTo(0, 6.6);
    const s = new THREE.Mesh(new THREE.ShapeGeometry(triShape), sail);
    s.position.set(-1.8, 1.0, 0);
    b.add(h, prow, mast, s);
    b.position.set(x, -8.7, z);
    b.rotation.y = ry;
    b.userData = { base: -8.7, phase: i * 1.7 };
    boats.push(b);
    group.add(b);
  });
  return { group, update: (t) => boats.forEach((b) => {
    b.position.y = b.userData.base + Math.sin(t * 0.9 + b.userData.phase) * 0.12;
    b.rotation.z = Math.sin(t * 0.7 + b.userData.phase) * 0.03;
  }) };
}

// ---- Air kolam ----
/** Dasar kolam bermosaik + kaustik, dinding, dan dua lapis air beriak. Mengembalikan { group, update }. */
export function createPools(textures, { lite = false } = {}) {
  const group = new THREE.Group();
  const causticMats = [];
  const waters = [];
  for (const pool of POOLS) {
    const w = pool.x1 - pool.x0;
    const d = pool.z1 - pool.z0;
    const cx = (pool.x0 + pool.x1) / 2;
    const cz = (pool.z0 + pool.z1) / 2;
    const depth = -POOL_FLOOR_Y;

    const floorTex = tiled(textures.poolTile, w / 2.4, d / 2.4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.5, emissive: 0x137a8c, emissiveIntensity: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, POOL_FLOOR_Y, cz);
    floor.receiveShadow = true;
    group.add(floor);

    // kaustik: dua lapis bergerak berlawanan arah (mode ringan: dilewati)
    for (let k = 0; k < (lite ? 0 : 2); k += 1) {
      const t = tiled(textures.caustics, w / (k ? 3.4 : 2.6), d / (k ? 3.4 : 2.6));
      const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x9fe8f0 });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
      p.rotation.x = -Math.PI / 2;
      p.position.set(cx, POOL_FLOOR_Y + 0.02 + k * 0.01, cz);
      group.add(p);
      causticMats.push({ t, dir: k ? -1 : 1, speed: k ? 0.018 : 0.012 });
    }

    // dinding bagian dalam (menghadap ke dalam kolam)
    const wallTex = (len) => tiled(textures.poolTile, len / 2.4, depth / 2.4);
    for (const [len, x, z, ry] of [[w, cx, pool.z0, 0], [w, cx, pool.z1, Math.PI], [d, pool.x0, cz, Math.PI / 2], [d, pool.x1, cz, -Math.PI / 2]]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, depth), new THREE.MeshStandardMaterial({ map: wallTex(len), roughness: 0.45, emissive: 0x137a8c, emissiveIntensity: 0.6 }));
      wall.position.set(x, POOL_FLOOR_Y + depth / 2, z);
      wall.rotation.y = ry;
      group.add(wall);
    }

    // dua lapis air: warna dasar + riak halus berbeda arah
    const base = new THREE.MeshStandardMaterial({
      color: 0x1c8aa6,
      roughness: 0.06,
      metalness: 0.0,
      transparent: true,
      opacity: 0.86,
      normalMap: tiled(textures.waterNormalA, w / 3.2, d / 3.2),
      normalScale: new THREE.Vector2(0.55, 0.55),
      envMapIntensity: 1.5,
    });
    const top = new THREE.MeshStandardMaterial({
      color: 0xbff4ff,
      roughness: 0.04,
      metalness: 0.0,
      transparent: true,
      opacity: 0.16,
      normalMap: tiled(textures.waterNormalB, w / 1.7, d / 1.7),
      normalScale: new THREE.Vector2(0.45, 0.45),
      envMapIntensity: 1.8,
      depthWrite: false,
    });
    for (const [mat, y] of lite ? [[base, WATER_Y]] : [[base, WATER_Y], [top, WATER_Y + 0.012]]) {
      const surface = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      surface.rotation.x = -Math.PI / 2;
      surface.position.set(cx, y, cz);
      surface.receiveShadow = true;
      group.add(surface);
    }
    waters.push({ base, top });
  }
  return {
    group,
    update(t) {
      for (const c of causticMats) {
        c.t.offset.x = (t * c.speed * c.dir) % 1;
        c.t.offset.y = (t * c.speed * 0.7) % 1;
      }
      for (const w of waters) {
        w.base.normalMap.offset.set((t * 0.011) % 1, (t * 0.007) % 1);
        w.top.normalMap.offset.set((-t * 0.015) % 1, (t * 0.012) % 1);
      }
    },
  };
}

// ---- Air mancur ----
const G = 9.8;

function jetParticles(list, { count, angle, spread, vy, vh, r0, size, alpha = 1 }, r) {
  const T = (2 * vy) / G;
  for (let i = 0; i < count; i += 1) {
    list.push({
      seed: r(),
      angle: angle + (r() - 0.5) * spread,
      vy: vy * (0.94 + r() * 0.12),
      vh: vh + (r() - 0.5) * Math.abs(vh) * 0.3 + (r() - 0.5) * 0.35,
      r0,
      size: size * (0.7 + r() * 0.7),
      T,
      alpha,
    });
  }
}

/** Air mancur bertingkat: pancuran tengah, cincin tengah, dan cincin tepi yang melengkung ke dalam. */
export function createFountains(textures, { lite = false } = {}) {
  const density = lite ? 0.25 : 1;
  const group = new THREE.Group();
  const r = seeded(808);
  const stone = new THREE.MeshStandardMaterial({ color: 0xf0e9dc, roughness: 0.55, envMapIntensity: 0.8 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8a94a, metalness: 1, roughness: 0.3, envMapIntensity: 1.3 });
  const water = new THREE.MeshStandardMaterial({ color: 0x4cc4d8, roughness: 0.05, transparent: true, opacity: 0.82, normalMap: tiled(textures.waterNormalA, 2, 2), normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.6 });
  const glowRing = new THREE.MeshBasicMaterial({ color: 0x66e8ff, transparent: true, opacity: 0.9, fog: false });
  const ripples = [];
  const uniforms = { uTime: { value: 0 }, uScale: { value: 600 } };
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...uniforms, uMap: { value: textures.drop }, uColor: { value: new THREE.Color(0xeafcff) } },
    vertexShader: /* glsl */ `
      attribute float aSeed; attribute float aAngle; attribute float aVy; attribute float aVh;
      attribute float aR0; attribute float aSize; attribute float aT; attribute float aAlpha;
      uniform float uTime; uniform float uScale;
      varying float vA;
      void main() {
        float ph = fract(uTime / aT + aSeed);
        float s = ph * aT;
        float y = aVy * s - 4.9 * s * s;
        float rr = aR0 + aVh * s;
        vec3 p = position + vec3(cos(aAngle) * rr, max(y, 0.0), sin(aAngle) * rr);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * 1.4 * uScale / -mv.z * (0.75 + 0.5 * ph), 1.5, 30.0);
        vA = aAlpha * smoothstep(0.0, 0.04, ph) * (1.0 - smoothstep(0.82, 1.0, ph)) * 1.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(uColor, t.a * vA);
        #include <colorspace_fragment>
      }`,
  });

  const lights = [];
  for (const f of FOUNTAINS) {
    // wadah batu bertingkat + air bagian dalam
    const baseY = WATER_Y;
    const ringProfile = [[f.r + 0.25, POOL_FLOOR_Y], [f.r + 0.25, 0.46], [f.r + 0.05, 0.62], [f.r - 0.18, 0.62], [f.r - 0.18, 0.28]];
    const ring = new THREE.Mesh(new THREE.LatheGeometry(ringProfile.map(([rr, y]) => new THREE.Vector2(rr, y)), 40), stone);
    ring.position.set(f.x, 0, f.z);
    ring.castShadow = true;
    ring.receiveShadow = true;
    group.add(ring);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(f.r - 0.18, 40), water);
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(f.x, 0.4, f.z);
    group.add(inner);
    const lit = new THREE.Mesh(new THREE.TorusGeometry(f.r + 0.12, 0.05, 8, 48), glowRing);
    lit.rotation.x = Math.PI / 2;
    lit.position.set(f.x, 0.36, f.z);
    group.add(lit);
    const gTorus = new THREE.Mesh(new THREE.TorusGeometry(f.r + 0.02, 0.07, 8, 48), gold);
    gTorus.rotation.x = Math.PI / 2;
    gTorus.position.set(f.x, 0.63, f.z);
    group.add(gTorus);
    // tiang tengah: mangkuk bertingkat
    const pedestal = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0.4], [0.5, 0.42], [0.58, 0.8], [0.32, 1.0], [0.28, 1.5], [1.15, 1.7], [1.35, 1.95], [1.1, 2.0], [0.0, 1.8]].map(([a, b]) => new THREE.Vector2(a, b)), 28), stone);
    pedestal.position.set(f.x, 0, f.z);
    pedestal.castShadow = true;
    group.add(pedestal);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), gold);
    cap.position.set(f.x, 2.0, f.z);
    group.add(cap);

    // partikel pancuran
    const list = [];
    jetParticles(list, { count: Math.round(300 * density), angle: 0, spread: Math.PI * 2, vy: 11.2, vh: 0.0, r0: 0.05, size: 0.20 }, r);
    for (let k = 0; k < 8; k += 1) jetParticles(list, { count: Math.max(2, Math.round(40 * density)), angle: (k / 8) * Math.PI * 2, spread: 0.12, vy: 8.3, vh: 1.9, r0: 0.7, size: 0.16 }, r);
    for (let k = 0; k < 26; k += 1) jetParticles(list, { count: Math.max(1, Math.round(14 * density)), angle: (k / 26) * Math.PI * 2, spread: 0.05, vy: 5.4, vh: -1.35, r0: f.r - 0.25, size: 0.13 }, r);
    const n = list.length;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const attr = (name, fn) => geo.setAttribute(name, new THREE.BufferAttribute(Float32Array.from(list.map(fn)), 1));
    attr('aSeed', (p) => p.seed);
    attr('aAngle', (p) => p.angle);
    attr('aVy', (p) => p.vy);
    attr('aVh', (p) => p.vh);
    attr('aR0', (p) => p.r0);
    attr('aSize', (p) => p.size);
    attr('aT', (p) => p.T);
    attr('aAlpha', (p) => p.alpha);
    const points = new THREE.Points(geo, material);
    points.position.set(f.x, 2.0, f.z);
    points.frustumCulled = false;
    points.renderOrder = 6;
    group.add(points);

    // riak yang melebar di permukaan kolam
    for (let k = 0; k < 3; k += 1) {
      const m = new THREE.MeshBasicMaterial({ map: textures.ripple, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xc8f6ff });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
      p.rotation.x = -Math.PI / 2;
      p.position.set(f.x, baseY + 0.02, f.z);
      group.add(p);
      ripples.push({ mesh: p, phase: k / 3, f });
    }
    // halo cahaya biru di kaki air mancur
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(f.r * 4.2, f.r * 4.2), new THREE.MeshBasicMaterial({ map: textures.glow, color: 0x58dcff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(f.x, baseY + 0.03, f.z);
    group.add(halo);
    lights.push(new THREE.Vector3(f.x, 1.4, f.z));
  }
  return {
    group,
    lightPoints: lights,
    update(t, camera, renderer) {
      uniforms.uTime.value = t;
      material.uniforms.uTime.value = t;
      const h = renderer.domElement.height || 600;
      material.uniforms.uScale.value = (h * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      for (const rp of ripples) {
        const s = (t * 0.28 + rp.phase) % 1;
        const diameter = rp.f.r * 2.1 + s * 9;
        rp.mesh.scale.set(diameter, diameter, 1);
        rp.mesh.material.opacity = Math.sin(Math.min(1, s * 1.6) * Math.PI * 0.5) * (1 - s) * 0.5;
      }
    },
  };
}

// ---- Cahaya (glow) titik: lampu, untaian lampu, lilin ----
/** Semua titik cahaya dunia dalam satu draw call. `items`: [{ x, y, z, size, color, flicker }] */
export function createGlowPoints(items, textures) {
  const n = items.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  const flick = new Float32Array(n);
  const c = new THREE.Color();
  items.forEach((it, i) => {
    pos.set([it.x, it.y, it.z], i * 3);
    c.set(it.color ?? 0xffd9a0);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = it.size ?? 0.5;
    phase[i] = (i * 1.618) % 6.28;
    flick[i] = it.flicker ?? 0;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aFlicker', new THREE.BufferAttribute(flick, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 600 }, uMap: { value: textures.glow }, uIntensity: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aSize; attribute float aPhase; attribute float aFlicker;
      uniform float uTime; uniform float uScale; uniform float uIntensity;
      varying vec3 vC;
      void main() {
        float fl = 1.0 - aFlicker * (0.5 + 0.5 * sin(uTime * 7.0 + aPhase) * sin(uTime * 3.1 + aPhase * 2.0));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uScale / -mv.z, 1.5, 120.0);
        vC = aColor * fl * uIntensity;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying vec3 vC;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(vC * a, a);
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = 7;
  return {
    points,
    update(t, camera, renderer) {
      material.uniforms.uTime.value = t;
      const h = renderer.domElement.height || 600;
      material.uniforms.uScale.value = (h * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    },
    setIntensity(v) {
      material.uniforms.uIntensity.value = v;
    },
  };
}

/** Kunang-kunang yang melayang pelan di taman. */
export function createFireflies(textures, { count = 140, area = { x0: -28, x1: 28, z0: -24, z1: 12 } } = {}) {
  const r = seeded(31337);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    pos.set([area.x0 + r() * (area.x1 - area.x0), 0.6 + r() * 3.4, area.z0 + r() * (area.z1 - area.z0)], i * 3);
    seed[i] = r() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 600 }, uMap: { value: textures.glow } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime; uniform float uScale; varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.31 + aSeed) * 1.6 + sin(uTime * 0.9 + aSeed * 3.0) * 0.3;
        p.y += sin(uTime * 0.47 + aSeed * 1.7) * 0.7;
        p.z += cos(uTime * 0.27 + aSeed * 2.3) * 1.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(0.16 * uScale / -mv.z, 1.5, 22.0);
        vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.7 + aSeed * 5.0));
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying float vA;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vA;
        gl_FragColor = vec4(vec3(1.0, 0.85, 0.42) * a, a);
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = 8;
  return {
    points,
    update(t, camera, renderer) {
      material.uniforms.uTime.value = t;
      const h = renderer.domElement.height || 600;
      material.uniforms.uScale.value = (h * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    },
  };
}

export { transform };
