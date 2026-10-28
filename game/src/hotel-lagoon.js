import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createPoolWaterSystem } from './pool-water.js';
import { POOL_DESIGNS } from './pool-water-logic.js';
import {
  CABANAS, CLIFF, CLIFF_TOP, DECK_Y, FALLS, LAGOON_POOL, LAGOON_RECT, LOUNGERS, PALMS, PARASOLS, PIER, PLANTERS, SIGN, cliffBlocks, lagoonRocks,
} from './hotel-lagoon-data.js';

// Taman Air Terjun & Kolam Lagoon NIKORA Grand Hotel (THREE): dek travertin, kolam lagoon (air dari pool-water.js), dermaga kayu, tebing berundak
// dengan satu air terjun besar dan dua kecil, kabut percikan, pelangi tipis di siang hari, kabana, kursi berjemur, palem, dan lampu yang menyala
// otomatis saat senja. Denah dan tabrakan: hotel-lagoon-data.js (dipasang di hotel-layout.js). Suara: hotel-lagoon-sound.js.
// Murah untuk HP: semua benda berulang (kursi, payung, kabana, palem, batu, semak) memakai InstancedMesh, air terjun dan kabut dianimasikan di
// shader (tanpa kerja CPU per frame), dan pantulan hidup kolam hanya dirender saat kamera dekat (?q=low mematikannya). ?lagoon=0 mematikan seluruh taman.

const BOX = new THREE.BoxGeometry(1, 1, 1);
const NIGHT_OFF = new THREE.Color(0x3a3326);
const NIGHT_ON = new THREE.Color(0xffd98a);
const UW_OFF = new THREE.Color(0x4a9aa4);
const UW_ON = new THREE.Color(0xaaffff);

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ---------------------------------------------------------------- geometri bantu: bagian berwarna yang digabung jadi satu geometri
/** Satu bagian: geometri yang diberi warna per titik, digeser/diputar. Dipakai bersama mergeParts. */
function part(geometry, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1)));
  const c = new THREE.Color(color);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}
const boxPart = (w, h, d, color, pos) => part(new THREE.BoxGeometry(w, h, d), color, pos);
const mergeParts = (parts) => {
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
};

function instanced(parent, geometry, material, items, { cast = false, receive = false } = {}) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    q.setFromEuler(e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0, 'YXZ'));
    m.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1));
    mesh.setMatrixAt(i, m);
    if (it.color !== undefined) mesh.setColorAt(i, c.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- shader air terjun, busa, dan kabut
const NOISE_GLSL = /* glsl */ `
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
`;

const FALL_VERT = /* glsl */ `
  uniform float uBulge;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float t = 1.0 - uv.y; // 0 di bibir tebing .. 1 di permukaan kolam
    p.z += uBulge * sqrt(max(t, 0.0)); // air melengkung keluar sebelum mendarat (lintasan parabola)
    p.x += sin(uTime * 1.3 + uv.y * 9.0) * 0.05 * t;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FALL_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uNight;
  uniform float uFlow; // 0 normal .. 1 hujan deras: air lebih cepat dan lebih pekat
  uniform float uWidth;
  uniform float uHeight;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    float t = 1.0 - vUv.y;
    float tt = uTime * (1.0 + 0.35 * uFlow);
    // dua lapis alur vertikal yang bergerak turun (koordinat noise naik terhadap waktu = pola meluncur ke bawah)
    float s1 = vnoise(vec2(vUv.x * uWidth * 2.6, vUv.y * uHeight * 0.32 + tt * 4.2));
    float s2 = vnoise(vec2(vUv.x * uWidth * 6.5 + 7.3, vUv.y * uHeight * 0.85 + tt * 6.8));
    float s = 0.55 * s1 + 0.45 * s2;
    // tepi samping bergerigi (noise), supaya tirai air tidak berujung lurus seperti kertas
    float rag = (vnoise(vec2(vUv.y * uHeight * 0.9 + uTime * 2.0, vUv.x * 3.0)) - 0.5) * 0.14;
    float edge = smoothstep(0.0, 0.1, vUv.x + rag) * smoothstep(1.0, 0.9, vUv.x + rag);
    float lip = 1.0 - smoothstep(0.0, 0.06, t); // busa di bibir tebing
    float base = smoothstep(0.9, 1.0, t); // busa di dasar
    float alpha = (0.34 + 0.6 * s) * (1.0 + 0.18 * uFlow) * edge * (0.55 + 0.45 * smoothstep(0.0, 0.12, t));
    alpha = clamp(alpha + lip * 0.5 + base * 0.45, 0.0, 0.92);
    vec3 water = vec3(0.62, 0.86, 0.9);
    vec3 color = mix(water, vec3(1.0), clamp(0.3 + 0.55 * s + lip + base, 0.0, 1.0));
    color += vec3(0.1, 0.55, 0.6) * uNight * 0.35; // malam: lampu bawah air menyinari air terjun
    gl_FragColor = vec4(color, alpha * edge);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const FOAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FOAM_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uNight;
  uniform vec2 uSize;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float r = length(c * vec2(1.0, 0.92));
    float n = vnoise(vUv * uSize * 1.7 + vec2(uTime * 0.7, -uTime * 0.35));
    float n2 = vnoise(vUv * uSize * 4.0 + vec2(-uTime * 1.1, uTime * 0.6));
    float a = smoothstep(1.0, 0.2, r) * (0.25 + 0.75 * n) * (0.55 + 0.45 * n2);
    a *= 0.72 + 0.28 * sin(uTime * 2.6 + n * 7.0);
    vec3 color = mix(vec3(1.0), vec3(0.7, 0.95, 1.0), uNight * 0.6);
    gl_FragColor = vec4(color, clamp(a, 0.0, 0.85));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const MIST_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixel;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float speed = 0.07 + 0.05 * fract(aSeed * 7.3);
    float ph = fract(uTime * speed + aSeed);
    vec3 p = position;
    p.y += ph * 9.0;
    p.x -= ph * (2.4 + 2.2 * fract(aSeed * 3.1)); // angin menggiring kabut ke barat, ke arah dermaga
    p.z += sin(uTime * 0.6 + aSeed * 20.0) * 1.0 * ph;
    vAlpha = sin(ph * 3.14159) * uOpacity;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = min(uSize * (1.0 + ph * 2.2) * (uPixel / max(-mv.z, 0.1)), 140.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const MIST_FRAG = /* glsl */ `
  precision highp float;
  uniform float uNight;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    vec3 color = mix(vec3(0.93, 0.97, 1.0), vec3(0.5, 0.72, 0.85), uNight);
    gl_FragColor = vec4(color, a * a * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------- pembuat benda
function signTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 300;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#0d2b30';
  g.fillRect(0, 0, 1024, 300);
  g.strokeStyle = '#c9a24b';
  g.lineWidth = 8;
  g.strokeRect(12, 12, 1000, 276);
  g.strokeStyle = '#7ee0e0';
  g.lineWidth = 2;
  g.strokeRect(26, 26, 972, 248);
  g.fillStyle = '#e7c76a';
  g.font = '600 104px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(SIGN.text, 512, 125);
  g.fillStyle = '#bfeff0';
  g.font = '400 52px Georgia, serif';
  g.fillText(SIGN.sub, 512, 220);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function loungerGeometry() {
  const cushion = 0xf2efe6;
  return mergeParts([
    boxPart(0.84, 0.08, 1.95, 0xf7f5ee, { y: 0.3 }), // rangka
    boxPart(0.78, 0.1, 1.15, cushion, { y: 0.39, z: 0.4 }), // alas
    boxPart(0.78, 0.1, 0.8, cushion, { y: 0.62, z: -0.7, rx: 0.75 }), // sandaran
    boxPart(0.7, 0.012, 0.26, 0x1f3a5f, { y: 0.45, z: 0.72 }), // handuk bergaris
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => boxPart(0.06, 0.28, 0.06, 0x8c8c86, { x: sx * 0.36, y: 0.14, z: sz * 0.88 }))),
  ]);
}

function parasolGeometry() {
  return mergeParts([
    part(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 8), 0xf7f5ee, { y: 1.3 }),
    part(new THREE.ConeGeometry(1.75, 0.55, 14), 0xf3e9d2, { y: 2.62 }),
    part(new THREE.SphereGeometry(0.1, 8, 6), 0xc9a24b, { y: 2.93 }),
    part(new THREE.TorusGeometry(1.7, 0.03, 4, 28), 0xc9a24b, { y: 2.37, rx: Math.PI / 2 }), // pinggir emas
  ]);
}

function cabanaGeometries() {
  const cream = 0xf3e9d2;
  const gold = 0xc9a24b;
  const solid = [
    ...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [
      part(new THREE.CylinderGeometry(0.11, 0.13, 3.1, 8), cream, { x: sx * 2.7, y: 1.55, z: sz * 2.7 }),
      part(new THREE.SphereGeometry(0.17, 8, 6), gold, { x: sx * 2.7, y: 3.12, z: sz * 2.7 }),
    ])),
    boxPart(6.4, 0.16, 6.4, cream, { y: 3.2 }), // atap datar
    boxPart(6.55, 0.07, 6.55, gold, { y: 3.08 }), // pinggir emas di bawah atap
    part(new THREE.ConeGeometry(4.55, 0.95, 4), cream, { y: 3.28 + 0.475, ry: Math.PI / 4 }), // atap limas
    part(new THREE.SphereGeometry(0.16, 8, 6), gold, { y: 4.3 }),
    boxPart(2.7, 0.42, 2.1, 0xf7f5ee, { x: -0.2, y: 0.24 }), // ranjang
    boxPart(2.5, 0.2, 1.9, cream, { x: -0.2, y: 0.55 }), // kasur
    boxPart(0.5, 0.3, 0.45, 0x1f3a5f, { x: -1.15, y: 0.78, z: -0.55 }), // bantal
    boxPart(0.5, 0.3, 0.45, gold, { x: -1.15, y: 0.78, z: 0.05 }),
    boxPart(0.5, 0.3, 0.45, 0xf7f5ee, { x: -1.15, y: 0.78, z: 0.6 }),
    part(new THREE.CylinderGeometry(0.3, 0.26, 0.5, 12), gold, { x: 1.7, y: 0.25, z: -1.5 }), // meja kecil
  ];
  const drapes = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => part(new THREE.PlaneGeometry(1.5, 2.7), 0xffffff, { x: sx * 2.55, y: 1.65, z: sz * 1.9, ry: Math.PI / 2 })));
  const backs = [-1, 1].map((sz) => part(new THREE.PlaneGeometry(2.6, 2.7), 0xffffff, { x: 0, y: 1.65, z: sz * 2.62 }));
  return { solid: mergeParts(solid), drapes: mergeParts([...drapes, ...backs]) };
}

function palmCrownGeometry() {
  const greens = [0x2f7a3e, 0x378a46, 0x2a6e38];
  const parts = [part(new THREE.SphereGeometry(0.28, 8, 6), 0x6b4a2f, { y: 0.05 })];
  for (let i = 0; i < 9; i++) parts.push(part(new THREE.BoxGeometry(0.62, 0.04, 3.5), greens[i % 3], { z: 1.75 }).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.42 + (i % 2) * 0.12, (i * Math.PI * 2) / 9, 0, 'YXZ'))));
  for (let i = 0; i < 5; i++) parts.push(part(new THREE.BoxGeometry(0.5, 0.04, 2.3), greens[(i + 1) % 3], { z: 1.15 }).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.55, (i * Math.PI * 2) / 5 + 0.3, 0, 'YXZ'))));
  return mergeParts(parts);
}

/** Cincin pelangi setengah lingkaran: warna per titik (RGBA), memudar di kedua ujung dan di tepi pita. */
function rainbowGeometry() {
  const inner = 6.6;
  const outer = 9.0;
  const thetaSeg = 72;
  const phiSeg = 7;
  const g = new THREE.RingGeometry(inner, outer, thetaSeg, phiSeg, 0, Math.PI);
  const bands = [0x8f00ff, 0x4b0082, 0x0000ff, 0x00c800, 0xffee00, 0xff7f00, 0xff0000].map((h) => new THREE.Color(h));
  const colors = new Float32Array(g.getAttribute('position').count * 4);
  const tmp = new THREE.Color();
  for (let j = 0; j <= phiSeg; j++) {
    const f = (j / phiSeg) * (bands.length - 1);
    const a = Math.min(bands.length - 2, Math.floor(f));
    tmp.copy(bands[a]).lerp(bands[a + 1], f - a);
    const soft = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0.04, j / phiSeg))), 0.7);
    for (let i = 0; i <= thetaSeg; i++) {
      const k = (j * (thetaSeg + 1) + i) * 4;
      colors[k] = tmp.r;
      colors[k + 1] = tmp.g;
      colors[k + 2] = tmp.b;
      colors[k + 3] = Math.pow(Math.sin((Math.PI * i) / thetaSeg), 0.6) * soft;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return g;
}

// ---------------------------------------------------------------- taman
/**
 * Membangun taman dan memasangnya di `scene`. Mengembalikan { root, update({ time, night, rain, active, level }), setNight(k), info(), dispose() }.
 * `renderer` dan `camera` dipakai sistem air kolam (pool-water.js); `sunDirection` = arah matahari (vektor, tidak perlu satuan).
 */
export function createHotelLagoon({ scene, renderer, camera, sunDirection = new THREE.Vector3(150, 260, -120), low = false, search = '' } = {}) {
  if (new URLSearchParams(search).get('lagoon') === '0') return { root: null, update() { return { underwater: 0, activePoolId: null }; }, setNight() {}, info: () => ({ on: false }), dispose() {} };

  const root = new THREE.Group();
  root.name = 'nikora-lagoon';
  scene.add(root);
  const disposables = [];
  const keep = (x) => {
    disposables.push(x);
    return x;
  };
  const M = {
    deck: keep(std(0xe8dfca, { roughness: 0.9 })), coping: keep(std(0xf4efe2, { roughness: 0.7 })), gold: keep(std(0xc9a24b, { roughness: 0.35, metalness: 0.75 })),
    teak: keep(std(0x7a5232, { roughness: 0.8 })), teakDark: keep(std(0x4a301d, { roughness: 0.9 })), cream: keep(std(0xf3e9d2)), path: keep(std(0xd3c5a5, { roughness: 0.9 })),
    soil: keep(std(0x4a3626)), vertex: keep(std(0xffffff, { vertexColors: true, roughness: 0.8 })),
    leaf: keep(std(0xffffff, { vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })),
    rock: keep(std(0xffffff, { roughness: 1, flatShading: true })), trunk: keep(std(0x8b6a45, { roughness: 0.95 })),
    drape: keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })),
    lamp: keep(new THREE.MeshBasicMaterial({ color: NIGHT_OFF.clone() })),
    uwLight: keep(new THREE.MeshBasicMaterial({ color: UW_OFF.clone() })),
    creek: keep(std(0x7ee0e0, { roughness: 0.15, transparent: true, opacity: 0.85, emissive: 0x0a4a55, emissiveIntensity: 0.5 })),
  };
  const look = POOL_DESIGNS[LAGOON_POOL.design];
  M.tile = keep(std(look.tile, { roughness: 0.6, side: THREE.DoubleSide, emissive: 0x2ad4d0, emissiveIntensity: 0.04 }));

  const [lx0, lz0, lx1, lz1] = LAGOON_RECT;
  const [px0, pz0, px1, pz1] = LAGOON_POOL.rect;

  // ---- dek travertin dengan lubang kolam (bentuk di bidang XY; setelah rotateX(-90°) y bentuk menjadi -z)
  const deckShape = new THREE.Shape();
  deckShape.moveTo(lx0, -lz0);
  deckShape.lineTo(lx1, -lz0);
  deckShape.lineTo(lx1, -lz1);
  deckShape.lineTo(lx0, -lz1);
  deckShape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(px0, -pz0);
  hole.lineTo(px0, -pz1);
  hole.lineTo(px1, -pz1);
  hole.lineTo(px1, -pz0);
  hole.closePath();
  deckShape.holes.push(hole);
  const deckGeo = keep(new THREE.ShapeGeometry(deckShape));
  deckGeo.rotateX(-Math.PI / 2);
  const deck = new THREE.Mesh(deckGeo, M.deck);
  deck.position.y = DECK_Y;
  deck.receiveShadow = true;
  root.add(deck);

  // jalan setapak berlis emas dari tepi barat ke dermaga
  const pathItems = [
    { x: (lx0 + px0) / 2, y: DECK_Y + 0.006, z: (PIER.z0 + PIER.z1) / 2, sx: px0 - lx0, sy: 0.012, sz: PIER.z1 - PIER.z0 },
  ];
  instanced(root, BOX, M.path, pathItems, { receive: true });
  instanced(root, BOX, M.gold, [PIER.z0, PIER.z1].map((z) => ({ x: (lx0 + px0) / 2, y: DECK_Y + 0.012, z: z + (z === PIER.z0 ? 0.05 : -0.05), sx: px0 - lx0, sy: 0.012, sz: 0.1 })));

  // ---- cekungan kolam: dasar, dinding, tepi yang sedikit lebih tinggi dari dek, dan bagian dangkal
  const floorY = LAGOON_POOL.floorY;
  const basin = new THREE.Group();
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(px1 - px0, pz1 - pz0)), M.tile);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(LAGOON_POOL.x, floorY, LAGOON_POOL.z);
  basin.add(floor);
  const wallH = DECK_Y - floorY;
  const walls = [
    [px1 - px0, LAGOON_POOL.x, pz0, 0], [px1 - px0, LAGOON_POOL.x, pz1, 0], // utara, selatan
    [pz1 - pz0, px0, LAGOON_POOL.z, Math.PI / 2], // barat (timur = tebing)
  ];
  for (const [w, x, z, ry] of walls) {
    const wall = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, wallH)), M.tile);
    wall.position.set(x, floorY + wallH / 2, z);
    wall.rotation.y = ry;
    basin.add(wall);
  }
  const shelves = [[px0, 514, px0 + 10, 531], [px0, 539, px0 + 10, 556]]; // "tanning ledge"
  instanced(basin, BOX, M.tile, shelves.map((r) => ({ x: (r[0] + r[2]) / 2, y: (floorY + LAGOON_POOL.shelfY) / 2, z: (r[1] + r[3]) / 2, sx: r[2] - r[0], sy: LAGOON_POOL.shelfY - floorY, sz: r[3] - r[1] })));
  root.add(basin);
  const coping = [
    [px0 - 0.8, pz0 - 0.8, px1, pz0], [px0 - 0.8, pz1, px1, pz1 + 0.8], [px0 - 0.8, pz0, px0, pz1],
  ];
  instanced(root, BOX, M.coping, coping.map((r) => ({ x: (r[0] + r[2]) / 2, y: DECK_Y + 0.04, z: (r[1] + r[3]) / 2, sx: r[2] - r[0], sy: 0.12, sz: r[3] - r[1] })), { receive: true });
  instanced(root, BOX, M.gold, coping.map((r) => ({ x: (r[0] + r[2]) / 2, y: DECK_Y + 0.105, z: (r[1] + r[3]) / 2, sx: r[2] - r[0] - (r[2] - r[0] > r[3] - r[1] ? 0 : 0.7), sy: 0.02, sz: r[3] - r[1] - (r[2] - r[0] > r[3] - r[1] ? 0.7 : 0) })));

  // lampu bawah air di dinding barat, utara, dan selatan (menyala saat senja)
  const uw = [];
  for (let z = 517; z <= 553; z += 4.5) uw.push({ x: px0 + 0.07, y: -0.9, z, sx: 0.1, sy: 0.22, sz: 0.5 });
  for (let x = 107; x <= 133; x += 5.2) uw.push({ x, y: -0.9, z: pz0 + 0.07, sx: 0.5, sy: 0.22, sz: 0.1 }, { x, y: -0.9, z: pz1 - 0.07, sx: 0.5, sy: 0.22, sz: 0.1 });
  instanced(root, BOX, M.uwLight, uw);

  // ---- air kolam (shader pool-water.js) + satu pantulan hidup saat kamera dekat
  const water = createPoolWaterSystem({
    renderer, scene, camera, sunDirection,
    captureResolution: low ? 256 : 384,
    captureEvery: low ? 3 : 2,
    captureRange: low ? 0 : 44, // 0 = tanpa pantulan hidup (tanpa render scene tambahan); air memantulkan gradasi langit
  });
  water.addPool({ id: 'lagoon', x: LAGOON_POOL.x, y: LAGOON_POOL.waterY, z: LAGOON_POOL.z, width: LAGOON_POOL.width, depth: LAGOON_POOL.depth, design: LAGOON_POOL.design });

  // ---- tebing, batu, dan aliran sungai di puncaknya
  const cliff = cliffBlocks();
  instanced(root, BOX, M.rock, cliff.map((b) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: (b.minZ + b.maxZ) / 2, sx: b.maxX - b.minX, sy: b.maxY - b.minY, sz: b.maxZ - b.minZ, color: b.color })), { cast: true, receive: true });
  const rocks = lagoonRocks();
  const rockGeo = keep(new THREE.IcosahedronGeometry(1, 1));
  instanced(root, rockGeo, M.rock, rocks.map((r) => ({ ...r })), { cast: true, receive: true });
  const main = FALLS[0];
  instanced(root, BOX, M.creek, [{ x: (CLIFF.faceX + CLIFF.backX) / 2 + 0.1, y: CLIFF_TOP + 0.05, z: main.z, sx: CLIFF.backX - CLIFF.faceX - 0.2, sy: 0.08, sz: main.width - 0.4 }]);

  // semak di puncak tebing
  const rnd = mulberry32(99);
  const crownBushes = [];
  for (const [z0, z1, h] of CLIFF.profile) for (let k = 0; k < 3; k++) crownBushes.push({ x: CLIFF.faceX + 2.5 + rnd() * 6.5, y: h + 0.25, z: z0 + 0.6 + rnd() * (z1 - z0 - 1.2), sx: 0.8 + rnd() * 0.6, sy: 0.55 + rnd() * 0.3, sz: 0.8 + rnd() * 0.6, color: [0x2f6f3a, 0x3c8044, 0x27603a][k % 3] });
  const bushGeo = keep(new THREE.IcosahedronGeometry(1, 1));
  const bushMat = keep(std(0xffffff, { roughness: 0.9, flatShading: true }));
  instanced(root, bushGeo, bushMat, crownBushes);

  // ---- air terjun: tirai air (shader), busa di dasar, kabut percikan
  const shared = { uTime: { value: 0 }, uNight: { value: 0 }, uFlow: { value: 0 } };
  const fallMeshes = [];
  const foamMeshes = [];
  for (const f of FALLS) {
    const height = f.top - f.bottom;
    const geo = keep(new THREE.PlaneGeometry(f.width, height, 8, 48));
    const mat = keep(new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uNight: shared.uNight, uFlow: shared.uFlow, uBulge: { value: f.bulge }, uWidth: { value: f.width }, uHeight: { value: height } },
      vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(f.x + 0.03, (f.top + f.bottom) / 2, f.z);
    mesh.rotation.y = -Math.PI / 2; // bidang menghadap barat; lebar sejajar sumbu z
    mesh.renderOrder = 7;
    mesh.name = `lagoon-fall-${f.id}`;
    mesh.frustumCulled = false; // lengkungan digeser di vertex shader
    root.add(mesh);
    fallMeshes.push(mesh);

    const fw = f.width + 3.4;
    const fd = f.id === 'main' ? 5.6 : 3;
    const foamGeo = keep(new THREE.PlaneGeometry(fw, fd));
    foamGeo.rotateX(-Math.PI / 2);
    const foamMat = keep(new THREE.ShaderMaterial({ uniforms: { uTime: shared.uTime, uNight: shared.uNight, uSize: { value: new THREE.Vector2(fd, fw) } }, vertexShader: FOAM_VERT, fragmentShader: FOAM_FRAG, transparent: true, depthWrite: false }));
    const foam = new THREE.Mesh(foamGeo, foamMat);
    foam.rotation.y = Math.PI / 2; // lebar busa sejajar sumbu z
    foam.position.set(f.landX - fd * 0.1, LAGOON_POOL.waterY + 0.02, f.z);
    foam.renderOrder = 6;
    root.add(foam);
    foamMeshes.push(foam);
  }

  // kabut percikan (satu Points; naik, melebar, dan memudar di shader)
  const mistCount = low ? 40 : 120;
  const mistPos = new Float32Array(mistCount * 3);
  const mistSeed = new Float32Array(mistCount);
  const mr = mulberry32(7);
  for (let i = 0; i < mistCount; i++) {
    const f = i % 5 === 4 ? FALLS[1 + ((i >> 2) % 2)] : main; // sebagian kecil dari air terjun kecil
    mistPos[i * 3] = f.landX + (mr() - 0.4) * 1.6;
    mistPos[i * 3 + 1] = LAGOON_POOL.waterY + mr() * 0.6;
    mistPos[i * 3 + 2] = f.z + (mr() - 0.5) * f.width;
    mistSeed[i] = mr();
  }
  const mistGeo = keep(new THREE.BufferGeometry());
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  mistGeo.setAttribute('aSeed', new THREE.BufferAttribute(mistSeed, 1));
  const mistUniforms = { uTime: shared.uTime, uNight: shared.uNight, uSize: { value: 2.2 }, uPixel: { value: 400 }, uOpacity: { value: 0.42 } };
  const mist = new THREE.Points(mistGeo, keep(new THREE.ShaderMaterial({ uniforms: mistUniforms, vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false })));
  mist.frustumCulled = false;
  mist.renderOrder = 8;
  root.add(mist);

  // pelangi tipis di kabut air terjun utama (hanya siang yang cerah)
  const rainbowMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const rainbow = new THREE.Mesh(keep(rainbowGeometry()), rainbowMat);
  rainbow.rotation.y = -Math.PI / 2;
  rainbow.position.set(main.landX + 0.4, LAGOON_POOL.waterY + 0.2, main.z);
  rainbow.renderOrder = 9;
  rainbow.visible = false;
  rainbow.frustumCulled = false;
  root.add(rainbow);

  // ---- dermaga kayu: lantai, garis papan, tiang pancang, pagar, dan lentera
  const pw = PIER.x1 - PIER.x0;
  const pd = PIER.z1 - PIER.z0;
  const px = (PIER.x0 + PIER.x1) / 2;
  const pz = (PIER.z0 + PIER.z1) / 2;
  const plat = PIER.platform;
  const slabs = [
    { x: px, y: PIER.top - 0.09, z: pz, sx: pw, sy: 0.18, sz: pd },
    { x: (plat[0] + plat[2]) / 2, y: PIER.top - 0.09, z: (plat[1] + plat[3]) / 2, sx: plat[2] - plat[0], sy: 0.18, sz: plat[3] - plat[1] },
  ];
  instanced(root, BOX, M.teak, slabs, { receive: true });
  const planks = [];
  for (let x = PIER.x0 + 0.5; x < PIER.x1; x += 0.5) planks.push({ x, y: PIER.top + 0.002, z: pz, sx: 0.035, sy: 0.006, sz: x > plat[0] ? plat[3] - plat[1] : pd });
  instanced(root, BOX, M.teakDark, planks);
  const piles = [];
  for (let x = PIER.x0 + 3; x < PIER.x1; x += 5) for (const z of [PIER.z0 + 0.2, PIER.z1 - 0.2]) piles.push({ x, y: (floorY + PIER.top) / 2 - 0.1, z, sx: 0.28, sy: PIER.top - floorY, sz: 0.28 });
  for (const x of [plat[0] + 0.3, plat[2] - 0.3]) for (const z of [plat[1] + 0.3, plat[3] - 0.3]) piles.push({ x, y: (floorY + PIER.top) / 2 - 0.1, z, sx: 0.32, sy: PIER.top - floorY, sz: 0.32 });
  instanced(root, BOX, M.teakDark, piles);
  const railLines = [
    [PIER.x0, PIER.z0 + 0.06, plat[0], PIER.z0 + 0.06], [PIER.x0, PIER.z1 - 0.06, plat[0], PIER.z1 - 0.06],
    [plat[0], plat[1] + 0.06, plat[2], plat[1] + 0.06], [plat[0], plat[3] - 0.06, plat[2], plat[3] - 0.06], [plat[2] - 0.06, plat[1], plat[2] - 0.06, plat[3]],
  ];
  const railBoxes = [];
  const posts = [];
  const lampItems = [];
  railLines.forEach(([x1, z1, x2, z2], li) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const alongX = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    railBoxes.push({ x: cx, y: PIER.top + 0.95, z: cz, sx: alongX ? len : 0.08, sy: 0.06, sz: alongX ? 0.08 : len });
    railBoxes.push({ x: cx, y: PIER.top + 0.45, z: cz, sx: alongX ? len : 0.04, sy: 0.04, sz: alongX ? 0.04 : len });
    const n = Math.max(1, Math.round(len / 3.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      posts.push({ x, y: PIER.top + 0.5, z, sx: 0.12, sy: 1.0, sz: 0.12 });
      if (i % 2 === 0 && li < 2) lampItems.push({ x, y: PIER.top + 1.18, z });
    }
  });
  instanced(root, BOX, M.cream, posts, { cast: true });
  instanced(root, BOX, M.gold, railBoxes);
  const orb = keep(new THREE.SphereGeometry(0.13, 10, 8));
  instanced(root, orb, M.lamp, lampItems);

  // ---- kursi berjemur, payung, kabana
  const loungerGeo = keep(loungerGeometry());
  instanced(root, loungerGeo, M.vertex, LOUNGERS.map((l) => ({ x: l.x, y: DECK_Y, z: l.z, ry: l.axis === 'x' ? Math.PI / 2 : 0 })), { cast: true });
  const parasolGeo = keep(parasolGeometry());
  instanced(root, parasolGeo, M.vertex, PARASOLS.map((p) => ({ x: p.x, y: DECK_Y, z: p.z })), { cast: true });
  const cab = cabanaGeometries();
  keep(cab.solid);
  keep(cab.drapes);
  instanced(root, cab.solid, M.vertex, CABANAS.map((c) => ({ x: c.x, y: DECK_Y, z: c.z })), { cast: true, receive: true });
  instanced(root, cab.drapes, M.drape, CABANAS.map((c) => ({ x: c.x, y: DECK_Y, z: c.z })));
  instanced(root, orb, M.lamp, CABANAS.map((c) => ({ x: c.x, y: DECK_Y + 2.7, z: c.z, sx: 1.4, sy: 1.4, sz: 1.4 })));

  // ---- palem, jalur tanam, semak berbunga
  const trunkGeo = keep(new THREE.CylinderGeometry(0.2, 0.34, 1, 8).translate(0, 0.5, 0));
  const crownGeo = keep(palmCrownGeometry());
  const trunks = [];
  const crowns = [];
  for (const p of PALMS) {
    const topX = p.x - Math.sin(p.lean) * p.h;
    const topY = DECK_Y + Math.cos(p.lean) * p.h;
    trunks.push({ x: p.x, y: DECK_Y, z: p.z, sy: p.h, rz: p.lean });
    crowns.push({ x: topX, y: topY, z: p.z, ry: p.turn, sx: 1.15, sy: 1.15, sz: 1.15 });
  }
  instanced(root, trunkGeo, M.trunk, trunks, { cast: true });
  instanced(root, crownGeo, M.leaf, crowns, { cast: true });
  const beds = PLANTERS.map((r) => ({ x: (r[0] + r[2]) / 2, y: DECK_Y + 0.25, z: (r[1] + r[3]) / 2, sx: r[2] - r[0], sy: 0.5, sz: r[3] - r[1] }));
  instanced(root, BOX, M.soil, beds, { receive: true });
  instanced(root, BOX, M.coping, beds.map((b) => ({ ...b, y: DECK_Y + 0.52, sy: 0.04, sz: b.sz + 0.2, sx: b.sx + 0.2 })));
  const shrubs = [];
  const flowers = [];
  const sr = mulberry32(31);
  const bloom = [0xffffff, 0xff8fb1, 0xff6f61, 0xffd54a, 0xb48bff];
  for (const r of PLANTERS) {
    const zc = (r[1] + r[3]) / 2;
    for (let x = r[0] + 1; x < r[2] - 0.5; x += 1.5) {
      if (PALMS.some((p) => Math.abs(p.x - x) < 0.9 && Math.abs(p.z - zc) < 1.6)) continue;
      const s = 0.55 + sr() * 0.4;
      shrubs.push({ x: x + (sr() - 0.5) * 0.4, y: DECK_Y + 0.55, z: zc + (sr() - 0.5) * 0.3, sx: s, sy: s * 0.8, sz: s, color: [0x2f6f3a, 0x3c8044, 0x27603a][Math.floor(sr() * 3)] });
      for (let k = 0; k < 2; k++) flowers.push({ x: x + (sr() - 0.5) * 0.9, y: DECK_Y + 0.55 + s * 0.8 + 0.02, z: zc + (sr() - 0.5) * 0.7, sx: 0.12, sy: 0.12, sz: 0.12, color: bloom[Math.floor(sr() * bloom.length)] });
    }
  }
  instanced(root, bushGeo, bushMat, shrubs);
  const flowerGeo = keep(new THREE.IcosahedronGeometry(1, 0));
  instanced(root, flowerGeo, keep(std(0xffffff, { roughness: 0.7, flatShading: true })), flowers);

  // ---- papan nama di pintu masuk barat
  const tex = signTexture();
  if (tex) {
    keep(tex);
    const board = new THREE.Mesh(keep(new THREE.PlaneGeometry(SIGN.width, SIGN.width * (300 / 1024))), keep(new THREE.MeshBasicMaterial({ map: tex })));
    board.position.set(SIGN.x + 0.08, 2.3, SIGN.z);
    board.rotation.y = -Math.PI / 2;
    root.add(board);
  }
  instanced(root, BOX, M.cream, [-1.6, 1.6].map((dz) => ({ x: SIGN.x, y: DECK_Y + 1.35, z: SIGN.z + dz, sx: 0.22, sy: 2.7, sz: 0.22 })), { cast: true });
  instanced(root, BOX, M.gold, [{ x: SIGN.x, y: DECK_Y + 2.72, z: SIGN.z, sx: 0.3, sy: 0.1, sz: SIGN.width + 0.5 }, { x: SIGN.x - 0.05, y: DECK_Y + 1.58, z: SIGN.z, sx: 0.1, sy: 0.08, sz: SIGN.width + 0.1 }]);

  // ---------------------------------------------------------------- siklus hidup
  let nightK = -1;
  function setNight(k) {
    const n = clamp01(k);
    if (Math.abs(n - nightK) < 0.005) return;
    nightK = n;
    shared.uNight.value = n;
    M.lamp.color.lerpColors(NIGHT_OFF, NIGHT_ON, n);
    M.uwLight.color.lerpColors(UW_OFF, UW_ON, n);
    M.tile.emissiveIntensity = 0.04 + 0.5 * n;
    M.creek.emissiveIntensity = 0.5 + 0.6 * n;
  }
  setNight(0);

  let last = { underwater: 0, activePoolId: null };
  return {
    root,
    /** Panggil tiap frame sesudah kamera diposisikan dan sebelum renderer.render(). active = false selama perjalanan (dunia lain). */
    update({ time = 0, night = 0, rain = 0, active = true } = {}) {
      root.visible = active;
      for (const p of water.pools) p.mesh.visible = active;
      if (!active) return last;
      shared.uTime.value = time;
      mistUniforms.uPixel.value = ((renderer?.domElement?.height ?? 800) || 800) * 0.5;
      const flow = clamp01(rain);
      shared.uFlow.value = flow; // hujan: air terjun lebih deras dan kabut lebih tebal
      mistUniforms.uOpacity.value = 0.42 * (1 - 0.35 * clamp01(night)) * (1 + 0.5 * flow);
      mistUniforms.uSize.value = 2.2 * (1 + 0.25 * flow);
      setNight(night);
      const sunny = (1 - clamp01(night * 1.6)) * (1 - clamp01(rain * 2.5));
      rainbowMat.opacity = 0.3 * sunny;
      rainbow.visible = sunny > 0.02;
      last = water.update(time);
      return last;
    },
    setNight,
    info: () => ({ on: true, night: nightK, pools: water.pools.map((p) => p.id), activePoolId: water.activePoolId, falls: FALLS.map((f) => f.id), rainbow: rainbow.visible, flow: shared.uFlow.value, mist: mistCount, children: root.children.length }),
    dispose() {
      water.dispose();
      scene.remove(root);
      root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      for (const d of disposables) d.dispose?.();
    },
  };
}
