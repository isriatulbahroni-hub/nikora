// Halaman perjalanan menuju tempat acara (prototipe): mobil otomatis menyusuri rute 20+ menit dari gerbang utama NIKORA
// sampai area penurunan tamu. ?venue=villa|hall|royal|masjid  &waktu=siang|senja|malam  &mobil=royale|noir|argent|rubis
// &kecepatan=1..20 (hanya untuk menguji)  &s=jarak awal (m)  &q=ringan (tanpa bayangan).
import * as THREE from 'three';
import { buildLuxuryCar } from './luxury-cars.js';
import { GATE_S, SEGMENTS, frameAt, journeyIds, segmentAt, timeAt, buildJourney } from './journey.js';
import { startState, stepDrive } from './journey-drive.js';
import { FOG_FAR, createJourneyWorld } from './journey-world.js';
import { VENUES } from './venues.js';

const params = new URLSearchParams(location.search);
const venue = journeyIds().includes(params.get('venue')) ? params.get('venue') : 'villa';
const light = params.has('q');
const timeScale = Math.min(20, Math.max(1, Number(params.get('kecepatan')) || 1));
const PRESET = {
  siang: { sky: 0xbcd9ee, sun: 0xfff4e0, sunI: 2.3, hemi: 1.0, sunPos: [120, 200, 80] },
  senja: { sky: 0xf0c394, sun: 0xffb36b, sunI: 2.1, hemi: 0.75, sunPos: [-200, 70, 120] },
  malam: { sky: 0x0e1731, sun: 0x8396c9, sunI: 0.4, hemi: 0.3, sunPos: [90, 160, -60] },
};
const preset = PRESET[params.get('waktu')] ?? PRESET.senja;

const j = buildJourney(venue);
const root = document.getElementById('journey-root');
const renderer = new THREE.WebGLRenderer({ antialias: !light, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, light ? 1 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !light;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(preset.sky);
scene.fog = new THREE.Fog(preset.sky, FOG_FAR * 0.35, FOG_FAR);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, FOG_FAR + 60);
scene.add(new THREE.HemisphereLight(0xdfeaff, 0x4a3b28, preset.hemi));
const sun = new THREE.DirectionalLight(preset.sun, preset.sunI);
sun.castShadow = !light;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 500 });
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

const world = createJourneyWorld(j, { shadows: !light });
scene.add(world.group);

// ---- mobil (geometri prosedural yang sama dengan hotel; kursi/pintu tidak dipakai di sini)
function makeCar(id) {
  const car = buildLuxuryCar(CAR_IDS.includes(id) ? id : 'royale');
  const g = new THREE.Group();
  const add = (geo, mat, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow && !light;
    g.add(m);
    return m;
  };
  add(car.paint, new THREE.MeshPhysicalMaterial({ color: car.model.paint, roughness: 0.2, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide }));
  add(car.trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.55 }));
  add(car.glass, new THREE.MeshPhysicalMaterial({ color: 0x16222c, roughness: 0.04, transparent: true, opacity: 0.4, depthWrite: false }), false);
  add(car.head, new THREE.MeshBasicMaterial({ color: 0xfff2c8 }), false);
  add(car.tail, new THREE.MeshBasicMaterial({ color: 0xb01414 }), false);
  const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.55 });
  for (const w of car.wheels) {
    const pivot = new THREE.Group();
    pivot.position.set(w.x, w.y, w.z);
    pivot.rotation.y = w.side < 0 ? Math.PI : 0;
    pivot.add(new THREE.Mesh(car.wheel, wheelMat));
    g.add(pivot);
  }
  const doorMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 });
  for (const d of car.doors) {
    const pivot = new THREE.Group();
    pivot.position.set(d.pivot.x, d.pivot.y, d.pivot.z);
    pivot.add(new THREE.Mesh(d.geometry, doorMat));
    g.add(pivot);
  }
  return g;
}
const CAR_IDS = ['royale', 'noir', 'argent', 'rubis'];
const carNode = makeCar(params.get('mobil'));
carNode.rotation.order = 'YXZ';
scene.add(carNode);

// ---- HUD
const $ = (id) => document.getElementById(id);
const hud = { seg: $('seg'), part: $('part'), eta: $('eta'), bar: $('bar'), play: $('play'), skip: $('skip'), enter: $('enter'), venue: $('venue'), loading: $('loading') };
hud.venue.textContent = VENUES[venue].label;
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
let paused = false;
hud.play.addEventListener('click', () => {
  paused = !paused;
  hud.play.textContent = paused ? '▶ Lanjut' : '⏸ Jeda';
});
hud.skip.addEventListener('click', () => {
  st.s = Math.max(st.s, j.length - 320);
  st.v = Math.min(st.v, 8);
});
const carry = new URLSearchParams();
for (const k of ['name', 'q']) if (params.get(k)) carry.set(k, params.get(k));
hud.enter.href = `${VENUES[venue].page}${carry.toString() ? `?${carry}` : ''}`;
hud.enter.textContent = `Masuk ke ${VENUES[venue].label}`;

// ---- jalan
const st = startState(Math.max(0, Math.min(j.length - 400, Number(params.get('s')) || 0)));
const LANE = 1.875; // lajur kiri (lalu lintas di sisi kiri seperti jaringan jalan hotel)
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camInit = false;
let last = performance.now();

function place(s) {
  const f = frameAt(j, s);
  const lx = Math.cos(f.heading);
  const lz = -Math.sin(f.heading);
  carNode.position.set(f.x + lx * LANE, f.y + 0.04, f.z + lz * LANE);
  carNode.rotation.set(-f.pitch, f.heading, 0);
  const b = frameAt(j, Math.max(0, s - 11));
  const tx = b.x + Math.cos(b.heading) * 0.8;
  const tz = b.z - Math.sin(b.heading) * 0.8;
  const ty = b.y + 3.4;
  const a = frameAt(j, Math.min(j.length, s + 9));
  const lookX = a.x + Math.cos(a.heading) * LANE;
  const lookZ = a.z - Math.sin(a.heading) * LANE;
  if (!camInit) {
    camPos.set(tx, ty, tz);
    camLook.set(lookX, a.y + 1.2, lookZ);
    camInit = true;
  }
  return { f, tx, ty, tz, lookX, lookZ, ly: a.y + 1.2 };
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) stepDrive(j, st, dt * timeScale);
  const p = place(st.s);
  const k = 1 - Math.exp(-dt * 3.2);
  camPos.lerp(new THREE.Vector3(p.tx, p.ty, p.tz), k);
  camLook.lerp(new THREE.Vector3(p.lookX, p.ly, p.lookZ), 1 - Math.exp(-dt * 4.5));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  sun.position.set(carNode.position.x + preset.sunPos[0], carNode.position.y + preset.sunPos[1], carNode.position.z + preset.sunPos[2]);
  sun.target.position.copy(carNode.position);
  world.ensure(camPos, st.s, 2);
  const seg = segmentAt(j, st.s);
  hud.seg.textContent = seg.name;
  hud.part.textContent = `Bagian ${SEGMENTS.indexOf(seg) + 1}/${SEGMENTS.length}`;
  hud.eta.textContent = st.arrived ? 'Tiba' : `Sisa ± ${fmt(Math.max(0, j.duration - timeAt(j, st.s)))}`;
  hud.bar.style.width = `${(st.s / j.length) * 100}%`;
  hud.enter.hidden = !st.arrived;
  hud.skip.hidden = st.arrived || st.s > j.length - 400;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// muat semua potongan awal sekaligus, lalu mulai
requestAnimationFrame(() => {
  const f = place(st.s);
  world.prime({ x: f.tx, z: f.tz }, st.s);
  hud.loading.hidden = true;
  last = performance.now();
  requestAnimationFrame(frame);
});
void GATE_S;
