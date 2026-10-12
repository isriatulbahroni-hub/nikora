import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DESIGNS } from './designs.js';
import { buildEnvelope } from './envelope3d.js';
import { glowSprite } from './textures.js';

export const DUR = 4.2, N = DESIGNS.length, OUTRO = 3.0, ZS = 60;
export const TOTAL = N * DUR + OUTRO;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const rng = (seed) => { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
const V = (a) => new THREE.Vector3(...a);

/* kunci kamera per amplop: [waktu, posisi relatif, titik pandang relatif] */
export const CAM = [
  [0.0, [-6, 16, 42], [0, 0, 0]],
  [1.0, [-3, 13, 34], [0, 0, 0]],
  [1.6, [0.8, 7.5, 19], [0, 0.5, 1]],
  [2.3, [2, 10, 23], [0, 2, -2]],
  [3.1, [0, 8, 34], [0, 6, -2.5]],
  [3.55, [0, 8, 31], [0, 6, -2.5]],
  [3.95, [0, 6.4, -1.8], [0, 6.4, -14]],
];
export const centerOf = (k) => new THREE.Vector3(0, 0, -k * ZS);

function buildKeys() {
  const keys = [];
  for (let k = 0; k < N; k++) for (const [t, p, l] of CAM) keys.push({ t: k * DUR + t, p: centerOf(k).add(V(p)), l: centerOf(k).add(V(l)) });
  const c = centerOf(N - 1);
  keys.push({ t: N * DUR + 1.3, p: c.clone().add(V([0, 9, -62])), l: c.clone().add(V([0, 9, -200])) });
  keys.push({ t: TOTAL, p: c.clone().add(V([0, 13, -132])), l: c.clone().add(V([0, 14, -260])) });
  return keys;
}
export function hermite(keys, t, field, out) {
  let i = 0; while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1], dt = b.t - a.t, s = clamp((t - a.t) / dt);
  const tan = (j) => { const p = keys[Math.max(0, j - 1)], n = keys[Math.min(keys.length - 1, j + 1)]; return n[field].clone().sub(p[field]).divideScalar(Math.max(1e-6, n.t - p.t)); };
  const ma = tan(i).multiplyScalar(dt), mb = tan(i + 1).multiplyScalar(dt);
  const s2 = s * s, s3 = s2 * s;
  return out.copy(a[field]).multiplyScalar(2 * s3 - 3 * s2 + 1).addScaledVector(ma, s3 - 2 * s2 + s).addScaledVector(b[field], -2 * s3 + 3 * s2).addScaledVector(mb, s3 - s2);
}

/* partikel kedalaman (bokeh emas melayang) */
export function makeBokeh(tex, n = 1700, zRange = 620) {
  const R = rng(11), pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    pos.set([(R() - .5) * 100, R() * 36 + .3, 50 - R() * zRange], i * 3);
    seed.set([R(), 0.35 + R() * .9, 0.35 + R() * 1.9, .12 + R() * .4], i * 4);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uTex: { value: tex }, uScale: { value: 1000 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 aSeed; uniform float uTime; uniform float uScale; varying float vA;
      void main(){ vec3 p=position; p.y=mod(position.y+uTime*aSeed.y,36.0)+0.3; p.x+=sin(uTime*0.4+aSeed.x*6.283)*aSeed.z*0.9;
        vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=min(240.0,aSeed.z*uScale/max(0.1,-mv.z));
        vA=aSeed.w*smoothstep(0.0,14.0,-mv.z)*(1.0-smoothstep(160.0,330.0,-mv.z)); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA; void main(){ vec4 t=texture2D(uTex,gl_PointCoord); gl_FragColor=vec4(vec3(1.0,0.82,0.5)*t.rgb,t.a*vA); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; return pts;
}

/* percikan: dua letusan per amplop (segel pecah, surat naik) */
function makeBursts(tex) {
  const list = [];
  DESIGNS.forEach((d, i) => [[1.6, 'seal', 60], [2.55, 'letter', 70]].forEach(([dt, where, n], k) => {
    const r = rng(500 + i * 9 + k), ps = [];
    for (let j = 0; j < n; j++) { const th = r() * 6.283, ph = Math.acos(2 * r() - 1) , sp = (where === 'seal' ? 6 : 9) + r() * 16; ps.push({ v: new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.abs(Math.cos(ph)) * .9 + .15, Math.sin(ph) * Math.sin(th)).multiplyScalar(sp), life: .9 + r() * 1.1, size: .5 + r() * 1.1, c: r() < .6 ? 0 : r() < .6 ? 1 : 2 }); }
    list.push({ t0: i * DUR + dt, where, ps, glow: new THREE.Color(d.glow), env: i });
  }));
  const total = list.reduce((a, b) => a + b.ps.length, 0);
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 3), siz = new Float32Array(total), alp = new Float32Array(total);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1)); g.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uScale: { value: 1000 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=min(160.0,aSize*uScale/max(0.1,-mv.z)); vC=aColor; vA=aAlpha; }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA; void main(){ vec4 t=texture2D(uTex,gl_PointCoord); gl_FragColor=vec4(vC*t.rgb*1.6,t.a*vA); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false;
  return { pts, list, update(t, envs) {
    let o = 0;
    for (const b of list) {
      const lt = t - b.t0, origin = (b.where === 'seal' ? envs[b.env].sealWorld.clone() : new THREE.Vector3(0, 6, -2.5)).add(centerOf(b.env));
      for (const p of b.ps) {
        const a = lt < 0 || lt > p.life ? 0 : 1 - lt / p.life, drag = Math.exp(-1.8 * Math.max(0, lt));
        const d = (1 - drag) / 1.8; pos[o * 3] = origin.x + p.v.x * d; pos[o * 3 + 1] = origin.y + p.v.y * d - 3.2 * lt * lt; pos[o * 3 + 2] = origin.z + p.v.z * d;
        const c = p.c === 0 ? [1, .86, .55] : p.c === 1 ? [1, 1, 1] : [b.glow.r, b.glow.g, b.glow.b];
        col[o * 3] = c[0]; col[o * 3 + 1] = c[1]; col[o * 3 + 2] = c[2]; siz[o] = p.size * (.5 + .5 * a); alp[o] = a; o++;
      }
    }
    g.attributes.position.needsUpdate = g.attributes.aColor.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = true;
  } };
}

export async function createWorld({ width, height, canvas }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = .3;
  scene.background = new THREE.Color(0x05080a); scene.fog = new THREE.Fog(0x05080a, 55, 230);

  const camera = new THREE.PerspectiveCamera(62, width / height, .1, 900);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x0b0a0e, roughness: .2, metalness: .88 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const key = new THREE.SpotLight(0xffe4b8, 2600, 260, .46, .75, 2); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.0004; key.shadow.radius = 4; key.shadow.camera.near = 20; key.shadow.camera.far = 140;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x9fb8ff, .55); rim.position.set(18, 22, -40); scene.add(rim, rim.target);
  scene.add(new THREE.HemisphereLight(0x8a93b8, 0x120e12, .22));
  const sealLight = new THREE.PointLight(0xffd98a, 0, 70, 2); scene.add(sealLight);

  const gtex = glowSprite();
  const envs = DESIGNS.map((d, i) => { const e = buildEnvelope(d, gtex); e.root.position.copy(centerOf(i)); scene.add(e.root); return e; });
  const bokeh = makeBokeh(gtex); scene.add(bokeh);
  const bursts = makeBursts(gtex); scene.add(bursts.pts);
  const scale = height / 2 / Math.tan(THREE.MathUtils.degToRad(31)); bokeh.material.uniforms.uScale.value = scale; bursts.pts.material.uniforms.uScale.value = scale;

  const composer = new EffectComposer(renderer); composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), .42, .55, .92); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const keys = buildKeys(), P = new THREE.Vector3(), L = new THREE.Vector3(), bgA = new THREE.Color(), bgB = new THREE.Color();
  const mid = (d) => new THREE.Color(d.bgTop).lerp(new THREE.Color(d.bgBot), .55);

  function setTime(t) {
    const k = clamp(Math.floor(t / DUR), 0, N - 1), lt = t - k * DUR;
    envs.forEach((e, i) => e.update(clamp(t - i * DUR, 0, DUR + 1)));
    // kamera
    hermite(keys, t, 'p', P); hermite(keys, t, 'l', L);
    const sh = seg(t - k * DUR, 3.55, 3.95) * (1 - seg(t - k * DUR, 3.95, 4.2));
    camera.position.copy(P).add(new THREE.Vector3(Math.sin(t * 1.3) * .08 + Math.sin(t * 37) * .05 * sh, Math.cos(t * 1.1) * .06 + Math.cos(t * 41) * .05 * sh, 0));
    camera.up.set(0, 1, 0); camera.lookAt(L); camera.rotateZ(Math.sin(t * .6) * .018 + sh * Math.sin(t * 29) * .01);
    // lampu mengikuti amplop aktif, bergeser mulus ke berikutnya
    const slide = k < N - 1 ? E_io(seg(lt, 3.6, 4.2)) : 0, c0 = centerOf(k), c1 = centerOf(Math.min(N - 1, k + 1)), c = c0.clone().lerp(c1, slide);
    key.position.set(c.x - 16, 34, c.z + 20); key.target.position.copy(c);
    rim.position.set(c.x + 18, 22, c.z - 40); rim.target.position.copy(c);
    const e = envs[k], gl = e.glowStrength;
    sealLight.position.copy(e.sealWorld).add(centerOf(k)).add(new THREE.Vector3(0, 3, 0)); sealLight.intensity = gl * 110; sealLight.color.set(DESIGNS[k].glow);
    key.intensity = 2600 * (t > N * DUR ? 1 - seg(t, N * DUR, N * DUR + 1.2) : 1);
    // warna latar mengikuti desain
    bgA.copy(mid(DESIGNS[k])); bgB.copy(mid(DESIGNS[Math.min(N - 1, k + 1)])); bgA.lerp(bgB, slide);
    if (t > N * DUR) bgA.lerp(new THREE.Color(0x0d0a1e), seg(t, N * DUR, N * DUR + 1.5));
    scene.background.copy(bgA).multiplyScalar(.55); scene.fog.color.copy(scene.background);
    bokeh.material.uniforms.uTime.value = t;
    bursts.update(t, envs);
    composer.render();
  }
  return { setTime, renderer, camera, composer };
}
const E_io = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
