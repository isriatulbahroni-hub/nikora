import * as THREE from 'three';
import { rng } from './villa-textures.js';

// Pulau melayang: cakram berumput di atas, bongkahan batu menggantung di bawah, kristal bercahaya, sulur, dan air terjun.

export function createWaterfallMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
varying vec2 vUv; uniform float uTime; uniform float uNight;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 uv = vec2(vUv.x * (10.0 + fi * 6.0), vUv.y * (3.0 + fi * 1.5) + uTime * (1.2 + fi * 0.45));
    float n = h(floor(uv * vec2(1.0, 2.0)));
    s += smoothstep(0.5, 1.0, n) * (1.0 - abs(fract(uv.x) - 0.5) * 1.6);
  }
  s = clamp(s, 0.0, 1.0);
  float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
  float a = (0.3 + 0.7 * s) * edge * smoothstep(1.0, 0.97, vUv.y) * smoothstep(0.0, 0.35, vUv.y);
  vec3 c = mix(vec3(0.55, 0.82, 0.98), vec3(1.0), s);
  c = c * (1.0 - 0.35 * uNight) + vec3(0.05, 0.1, 0.2) * uNight;
  gl_FragColor = vec4(c, a);
}`,
  });
}

export function createIslandMaterials(grassMap) {
  const top = grassMap.clone();
  top.needsUpdate = true;
  top.repeat.set(5, 5);
  return {
    top: new THREE.MeshStandardMaterial({ map: top, roughness: 0.95 }),
    side: new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 1, flatShading: true }),
    rock: new THREE.MeshStandardMaterial({ color: 0x7a6e60, roughness: 1, flatShading: true }),
    vine: new THREE.MeshStandardMaterial({ color: 0x3f7d36, roughness: 0.9 }),
    crystal: new THREE.MeshStandardMaterial({ color: 0x8fe3ff, emissive: 0x39b6ff, emissiveIntensity: 1.1, roughness: 0.2, metalness: 0.1 }),
    fall: createWaterfallMaterial(),
  };
}

/** Satu pulau; permukaan atas di y=0 lokal, berpusat di (0, 0, 0). */
export function buildFloatingIsland(r, mats, { seed = 1, falls = true } = {}) {
  const rand = rng(seed);
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.96, 1.2, 40, 1), [mats.side, mats.top, mats.rock]);
  body.position.y = -0.6;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const h = r * 1.5;
  const cone = new THREE.ConeGeometry(r * 0.96, h, 28, 7, true);
  cone.rotateX(Math.PI); // ujung runcing menghadap ke bawah
  const pos = cone.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 + 0.16 * Math.sin(x * 1.7 + z * 2.3 + y * 0.9) * Math.cos(z * 1.3 - x * 0.7);
    pos.setXYZ(i, x * k + Math.sin(y * 2.1 + z) * 0.45, y + Math.sin(x * 1.9 + z * 1.1) * 0.35, z * k + Math.cos(y * 1.7 + x) * 0.45);
  }
  cone.computeVertexNormals();
  const under = new THREE.Mesh(cone, mats.rock);
  under.position.y = -1.0 - h / 2;
  under.castShadow = true;
  g.add(under);

  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    const rad = rand() * r * 0.28;
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.45 + rand() * 0.5, 0), mats.crystal);
    c.scale.y = 2.4;
    c.position.set(Math.cos(a) * rad, -h * (0.62 + rand() * 0.2), Math.sin(a) * rad);
    c.rotation.z = (rand() - 0.5) * 0.5;
    g.add(c);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand() * 0.3;
    const len = 2 + rand() * 3.2;
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, len, 5), mats.vine);
    v.position.set(Math.cos(a) * r * 0.86, -1.0 - len / 2, Math.sin(a) * r * 0.86);
    g.add(v);
  }
  if (falls) {
    const a0 = rand() * Math.PI * 2;
    const H = h * 0.95;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2.2, H), mats.fall);
    w.position.set(Math.cos(a0) * r * 0.98, -0.4 - H / 2, Math.sin(a0) * r * 0.98);
    w.rotation.y = Math.PI / 2 - a0;
    g.add(w);
  }
  return g;
}
