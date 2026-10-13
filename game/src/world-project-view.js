// Tampilan 3D objek katalog proyek dunia (Fase 9). Semua dibuat dari bentuk dasar THREE secara prosedural:
// tidak ada model/tekstur eksternal, jadi tidak ada beban lisensi aset dan ukuran proyek tetap kecil.
import * as THREE from 'three';
import { part, merge } from './villa-props.js';
import { CATALOG, areaBounds, footprint } from './world-project.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 14) => new THREE.CylinderGeometry(rt, rb, h, s);
const ico = (r) => new THREE.IcosahedronGeometry(r, 1);

const BUILDERS = {
  table: () => [part(cyl(0.85, 0.85, 0.06, 22), '#efe4cc', { y: 0.76 }), part(cyl(0.12, 0.18, 0.74, 10), '#8a6a3d', { y: 0.37 }), part(cyl(0.45, 0.5, 0.04, 16), '#8a6a3d', { y: 0.02 })],
  sofa: () => [part(box(2.2, 0.4, 1), '#8a4e3b', { y: 0.3 }), part(box(2.2, 0.55, 0.25), '#743f2f', { y: 0.78, z: -0.38 }), part(box(0.2, 0.5, 1), '#743f2f', { x: -1, y: 0.52 }), part(box(0.2, 0.5, 1), '#743f2f', { x: 1, y: 0.52 })],
  bed: () => [part(box(1.9, 0.4, 2.2), '#f3eee4', { y: 0.3 }), part(box(1.9, 0.95, 0.12), '#8a5a3a', { y: 0.72, z: -1.04 }), part(box(0.7, 0.14, 0.4), '#ffffff', { x: -0.45, y: 0.55, z: -0.8 }), part(box(0.7, 0.14, 0.4), '#ffffff', { x: 0.45, y: 0.55, z: -0.8 })],
  lounger: () => [part(box(0.7, 0.14, 1.9), '#ece5d3', { y: 0.36 }), part(box(0.7, 0.5, 0.12), '#ece5d3', { y: 0.62, z: -0.82, rx: -0.5 }), part(box(0.06, 0.34, 0.06), '#7a6a50', { x: -0.3, y: 0.17, z: 0.8 }), part(box(0.06, 0.34, 0.06), '#7a6a50', { x: 0.3, y: 0.17, z: 0.8 })],
  desk: () => [part(box(3.6, 0.1, 1), '#6d4c31', { y: 0.97 }), part(box(3.6, 0.92, 0.9), '#8b633d', { y: 0.46 })],
  counter: () => [part(box(2.4, 0.95, 1), '#b9a583', { y: 0.475 }), part(box(2.4, 0.06, 1.1), '#4b4033', { y: 0.98 })],
  tub: () => [part(box(3, 0.7, 2), '#e9eef0', { y: 0.35 }), part(box(2.6, 0.05, 1.6), '#8fd0e0', { y: 0.72 })],
  stage: () => [part(box(6, 0.5, 3), '#7b5a3c', { y: 0.25 }), part(box(5.6, 3, 0.15), '#c9a227', { y: 2, z: -1.35 }), part(ico(0.5), '#d94f7a', { x: -2.2, y: 0.8, z: 1 }), part(ico(0.5), '#d94f7a', { x: 2.2, y: 0.8, z: 1 }), part(ico(0.4), '#f6e7a8', { y: 0.7, z: 1.1 })],
  wall: () => [part(box(4, 3, 0.3), '#efe7d6', { y: 1.5 })],
  palm: () => [part(cyl(0.14, 0.22, 4, 8), '#7a5a38', { y: 2 }), part(ico(1.1), '#3f8f4a', { y: 4.4 }), part(ico(1), '#4aa056', { x: 0.7, y: 4.0, z: 0.3 }), part(ico(0.9), '#357d40', { x: -0.7, y: 4.1, z: -0.4 })],
  tree: () => [part(cyl(0.15, 0.24, 2.2, 8), '#6b4a2f', { y: 1.1 }), part(ico(1.5), '#4f9a50', { y: 3.1 }), part(ico(1.05), '#62ad5c', { x: 0.7, y: 2.6, z: 0.3 })],
  car: () => [
    part(box(1.9, 0.7, 4.2), '#b8322a', { y: 0.6 }), part(box(1.7, 0.6, 2.1), '#26323d', { y: 1.2, z: 0.2 }),
    ...[[-0.95, -1.35], [0.95, -1.35], [-0.95, 1.35], [0.95, 1.35]].map(([x, z]) => part(cyl(0.38, 0.38, 0.26, 14), '#1b1b1b', { x, y: 0.38, z, rz: Math.PI / 2 })),
  ],
};

const geoCache = new Map();
export const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 });

function geometryFor(type) {
  let g = geoCache.get(type);
  if (!g) {
    g = merge(BUILDERS[type]());
    g.computeBoundingBox();
    geoCache.set(type, g);
  }
  return g;
}

/** Mesh satu objek katalog. `userData.id` diisi pemanggil. */
export function propMesh(type) {
  const m = new THREE.Mesh(geometryFor(type), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function placeMesh(mesh, prop) {
  mesh.position.set(prop.x, 0, prop.z);
  mesh.rotation.y = (prop.rot * Math.PI) / 2;
  mesh.userData.id = prop.id;
  mesh.userData.type = prop.type;
}

/** Garis jejak tabrakan objek (persegi di tanah): yang dirasakan pemain, bukan hanya yang terlihat. */
export function footprintLine(type, rot, color = 0xffd54a) {
  const f = footprint(type, rot);
  const pts = [[-f.hx, -f.hz], [f.hx, -f.hz], [f.hx, f.hz], [-f.hx, f.hz]].map(([x, z]) => new THREE.Vector3(x, 0.06, z));
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }));
  return line;
}

export const SKY_PRESETS = Object.freeze({
  siang: { bg: '#a9d4ee', ground: '#8fbf7a', ambient: 0.9, sun: 1.1, sunColor: '#fff4dc' },
  senja: { bg: '#f0b585', ground: '#9aa86a', ambient: 0.65, sun: 0.9, sunColor: '#ffb070' },
  malam: { bg: '#15203a', ground: '#41603f', ambient: 0.4, sun: 0.35, sunColor: '#9db4ff' },
});

/** Lantai, grid 2 m, dan garis batas area. */
export function buildGround(area, sky) {
  const g = new THREE.Group();
  const w = area.halfX * 2;
  const d = area.halfZ * 2;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: SKY_PRESETS[sky].ground, roughness: 1 }));
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  plane.userData.ground = true;
  g.add(plane);
  const pts = [];
  for (let x = -area.halfX; x <= area.halfX; x += 2) pts.push(new THREE.Vector3(x, 0.01, -area.halfZ), new THREE.Vector3(x, 0.01, area.halfZ));
  for (let z = -area.halfZ; z <= area.halfZ; z += 2) pts.push(new THREE.Vector3(-area.halfX, 0.01, z), new THREE.Vector3(area.halfX, 0.01, z));
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 })));
  const b = areaBounds(area);
  const edge = [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]].map(([x, z]) => new THREE.Vector3(x, 0.05, z));
  g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(edge), new THREE.LineBasicMaterial({ color: 0xd9433a })));
  return g;
}

export function spawnMarker() {
  const m = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 28), new THREE.MeshBasicMaterial({ color: 0x2e9e6b }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 12), new THREE.MeshBasicMaterial({ color: 0x2e9e6b }));
  cone.position.y = 1.1;
  cone.rotation.x = Math.PI;
  m.add(ring, cone);
  return m;
}

export const labelOf = (type) => CATALOG[type]?.label ?? type;
