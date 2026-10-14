import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { COUNTRYSIDE, DOOR_HEIGHT, HALL_SEATING, HALL_WALL_HEIGHT, LEVEL_HEIGHT, ROOFS, STAIRS, WALL_HEIGHT, WALL_THICKNESS, hallChairPositions, levelY } from './villa-layout.js';

import {
  PALM_BEND, bedGeometries, broadleafTreeGeometry, carGeometries, chairGeometry, frondGeometry, lanternPostGeometry,
  loungerGeometry, merge, palmTrunkGeometry, part, potPlantGeometry, shrubGeometry,
} from './villa-props.js';
import {
  asphaltTexture, frondTexture, grassTexture, marbleTexture, parquetTexture, plasterTexture, poolTileTexture, rng, roofTileTexture,
  rugTexture, stoneTexture, waterNormalTexture,
} from './villa-textures.js';

const SUN_DIR = new THREE.Vector3(22, 42, 16).normalize();
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
}

function instanced(geometry, material, items, { castShadow = true, receiveShadow = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  mesh.count = items.length;
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y ?? 0, it.z);
    dummy.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
    dummy.rotation.set(0, it.ry ?? 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (it.color !== undefined) mesh.setColorAt(i, tint.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function block(w, h, d, material, x, y, z, parent, { cast = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Bidang datar [x1,z1,x2,z2] di ketinggian y; `tile` = ukuran (m) satu pengulangan tekstur. */
function flat(rect, material, y, parent, tile) {
  const [x1, z1, x2, z2] = rect;
  const w = x2 - x1;
  const h = z2 - z1;
  const g = new THREE.PlaneGeometry(w, h);
  if (tile) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  }
  const m = new THREE.Mesh(g, material);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Bidang tegak lurus: w x h di titik (x,y,z), menghadap arah ry. */
function wallPlane(w, h, tile, material, x, y, z, ry, parent) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  parent.add(m);
}

function leafDepthMaterial(map) {
  return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.45 });
}

// ------------------------------------------------------------------ dinding
// Warna dinding per jenis ruangan (hangat dan berbeda, bukan putih polos).
const WALL_TINTS = {
  hall: 0xe3d3b4, suite: 0xd6bf9d, lobby: 0xdfcdae, spa: 0xc9d6c9, bridal: 0xe6cfc6, restaurant: 0xe0c59d,
  kitchen: 0xd9dfdc, guest: 0xe5d6bb, corridor: 0xd6c9b0, stair: 0xd2c6b0, lounge: 0xdccdb0, library: 0xcdb999,
  terrace: 0xdccdb0, grounds: 0xddcdaf,
};
const SILL = 0.95; // tinggi ambang jendela
const HEAD = 2.3; // tinggi kepala jendela
const WINDOW_W = 1.5;

/**
 * Dinding utuh (opak): kotak padat dengan bukaan jendela pada dinding luar, plint batu, plint kayu, dan lis atas.
 * Warna per ruangan; tidak ada perubahan tinggi berdasarkan kamera.
 */
function buildWalls(walls, rooms, doors, parent, mats) {
  const inRooms = (x, z) => rooms.find((r) => {
    const q = r.kind === 'stair' && r.landing && !r.rect ? r.landing : r.rect;
    return x > q[0] && x < q[2] && z > q[1] && z < q[3];
  });
  const solid = [];
  const plinth = [];
  const skirting = [];
  const cornice = [];
  const frames = [];
  const glass = [];
  const T = WALL_THICKNESS;
  const piece = (w, c0, c1, y0, y1, color) => {
    if (c1 - c0 < 1e-3 || y1 - y0 < 1e-3) return;
    const mid = (c0 + c1) / 2;
    const len = c1 - c0;
    solid.push(w.orient === 'h' ? { x: mid, y: y0, z: w.coord, sx: len, sy: y1 - y0, sz: T, color } : { x: w.coord, y: y0, z: mid, sx: T, sy: y1 - y0, sz: len, color });
  };
  for (const w of walls) {
    if (w.dup) continue;
    const h = w.h ?? WALL_HEIGHT;
    const mid = (w.a + w.b) / 2;
    const p1 = w.orient === 'h' ? [mid, w.coord - 0.5] : [w.coord - 0.5, mid];
    const p2 = w.orient === 'h' ? [mid, w.coord + 0.5] : [w.coord + 0.5, mid];
    const r1 = inRooms(...p1);
    const r2 = inRooms(...p2);
    const exterior = !r1 || !r2;
    const color = WALL_TINTS[(r1 ?? r2)?.kind ?? 'grounds'] ?? WALL_TINTS.grounds;
    const len = w.b - w.a;
    // jendela hanya di dinding luar yang cukup panjang
    const n = exterior && len >= 3.4 ? Math.floor((len - 1.4) / 3.2) : 0;
    const centers = Array.from({ length: n }, (_, i) => w.a + (len * (i + 0.5)) / n);
    const rows = h > 4 ? [[SILL, HEAD], [4.2, 5.9]] : [[SILL, HEAD]];
    if (!n) {
      piece(w, w.a, w.b, 0, h, color);
    } else {
      let cursor = w.a;
      for (const c of centers) {
        piece(w, cursor, c - WINDOW_W / 2, 0, h, color);
        cursor = c + WINDOW_W / 2;
      }
      piece(w, cursor, w.b, 0, h, color);
      for (const c of centers) {
        let y = 0;
        for (const [sill, head] of rows) {
          piece(w, c - WINDOW_W / 2, c + WINDOW_W / 2, y, sill, color);
          y = head;
          const cx = w.orient === 'h' ? c : w.coord;
          const cz = w.orient === 'h' ? w.coord : c;
          const ry = w.orient === 'h' ? 0 : Math.PI / 2;
          const wh = head - sill;
          glass.push({ x: cx, y: sill, z: cz, ry, sx: WINDOW_W, sy: wh, sz: 0.03 });
          // rangka kayu: 4 sisi + kayu tengah
          frames.push({ x: cx, y: sill - 0.04, z: cz, ry, sx: WINDOW_W + 0.12, sy: 0.08, sz: T + 0.08 });
          frames.push({ x: cx, y: head - 0.04, z: cz, ry, sx: WINDOW_W + 0.12, sy: 0.08, sz: T + 0.08 });
          for (const side of [-1, 1]) {
            const off = (side * (WINDOW_W + 0.04)) / 2;
            frames.push({ x: cx + (w.orient === 'h' ? off : 0), y: sill, z: cz + (w.orient === 'h' ? 0 : off), ry, sx: 0.08, sy: wh, sz: T + 0.08 });
          }
          frames.push({ x: cx, y: sill, z: cz, ry, sx: 0.05, sy: wh, sz: T + 0.04 });
          frames.push({ x: cx, y: sill + wh / 2 - 0.025, z: cz, ry, sx: WINDOW_W, sy: 0.05, sz: T + 0.04 });
        }
        piece(w, c - WINDOW_W / 2, c + WINDOW_W / 2, y, h, color);
      }
    }
    // plint batu di luar, plint kayu di dalam, lis atas
    const a = w.a;
    const b = w.b;
    const add = (list, y, sy, grow, col) => {
      const m = (a + b) / 2;
      list.push(w.orient === 'h' ? { x: m, y, z: w.coord, sx: b - a, sy, sz: T + grow, color: col } : { x: w.coord, y, z: m, sx: T + grow, sy, sz: b - a, color: col });
    };
    if (exterior) add(plinth, 0, 0.6, 0.06, 0xffffff);
    else add(skirting, 0, 0.14, 0.04, 0xffffff);
    add(cornice, h - 0.12, 0.12, 0.1, 0xffffff);
  }
  // ambang di atas pintu + rangka kayu pintu
  for (const d of doors) {
    const h = d.tall ? HALL_WALL_HEIGHT : WALL_HEIGHT;
    const color = WALL_TINTS[(inRooms(d.x, d.z) ?? inRooms(d.orient === 'h' ? d.x : d.x + 0.3, d.orient === 'h' ? d.z + 0.3 : d.z))?.kind ?? 'grounds'] ?? WALL_TINTS.grounds;
    const lin = d.orient === 'h' ? { x: d.x, y: DOOR_HEIGHT, z: d.z, sx: d.width, sy: h - DOOR_HEIGHT, sz: T, color } : { x: d.x, y: DOOR_HEIGHT, z: d.z, sx: T, sy: h - DOOR_HEIGHT, sz: d.width, color };
    solid.push(lin);
    const along = d.orient === 'h' ? 'x' : 'z';
    for (const side of [-1, 1]) {
      const off = (side * (d.width + 0.08)) / 2;
      frames.push({ x: d.x + (along === 'x' ? off : 0), y: 0, z: d.z + (along === 'z' ? off : 0), sx: d.orient === 'h' ? 0.1 : T + 0.08, sy: DOOR_HEIGHT, sz: d.orient === 'h' ? T + 0.08 : 0.1 });
    }
    frames.push(d.orient === 'h' ? { x: d.x, y: DOOR_HEIGHT - 0.1, z: d.z, sx: d.width + 0.2, sy: 0.1, sz: T + 0.08 } : { x: d.x, y: DOOR_HEIGHT - 0.1, z: d.z, sx: T + 0.08, sy: 0.1, sz: d.width + 0.2 });
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  parent.add(instanced(geo, mats.plaster, solid));
  parent.add(instanced(geo, mats.plinth, plinth, { castShadow: false }));
  parent.add(instanced(geo, mats.skirting, skirting, { castShadow: false }));
  parent.add(instanced(geo, mats.cornice, cornice));
  parent.add(instanced(geo, mats.wood, frames, { castShadow: false }));
  parent.add(instanced(geo, mats.glass, glass, { castShadow: false, receiveShadow: false }));
}

/** Daun pintu yang membuka halus saat ada avatar mendekat (satu daun untuk pintu sempit, dua daun untuk pintu lebar). */
function buildDoorLeaves(doors, level, parent, mats) {
  const doorsOut = [];
  const leafGeo = new THREE.BoxGeometry(1, DOOR_HEIGHT - 0.06, 0.06);
  leafGeo.translate(0.5, (DOOR_HEIGHT - 0.06) / 2 + 0.02, 0);
  for (const d of doors) {
    const along = d.orient === 'h' ? [d.width, 0.03, 0.55] : [0.55, 0.03, d.width];
    block(along[0], along[1], along[2], mats.brass, d.x, 0.04, d.z, parent, { cast: false });
    if (d.width > 3.2) continue; // gerbang lebar dibiarkan terbuka
    const double = d.width > 2.0;
    const leaves = [];
    const make = (hingeAlong, dirSign, openDir) => {
      const lw = (double ? d.width / 2 : d.width) - 0.08;
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(leafGeo, mats.door);
      mesh.scale.x = lw;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pivot.add(mesh);
      const handle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mats.brass);
      handle.position.set(lw - 0.12, 1.05, 0.05);
      pivot.add(handle);
      if (d.orient === 'h') pivot.position.set(d.x + hingeAlong, 0.02, d.z);
      else pivot.position.set(d.x, 0.02, d.z + hingeAlong);
      const closed = d.orient === 'h' ? (dirSign > 0 ? 0 : Math.PI) : dirSign > 0 ? -Math.PI / 2 : Math.PI / 2;
      pivot.rotation.y = closed;
      parent.add(pivot);
      leaves.push({ pivot, closed, openDir });
    };
    const half = d.width / 2 - 0.04;
    if (double) {
      make(-half, +1, +1);
      make(+half, -1, -1);
    } else {
      make(-half, +1, +1);
    }
    doorsOut.push({ x: d.x, z: d.z, y: levelY(level), leaves, open: 0 });
  }
  return (actors, delta, cam) => {
    for (const door of doorsOut) {
      let near = false;
      for (const a of actors) {
        if (Math.abs((a.y ?? 0) - door.y) < 1.8 && Math.hypot(a.x - door.x, a.z - door.z) < 2.4) {
          near = true;
          break;
        }
      }
      door.open += ((near ? 1 : 0) - door.open) * (1 - Math.exp(-7 * delta));
      const angle = door.open * 1.75;
      // daun pintu yang terlalu dekat kamera disembunyikan agar tidak menutupi layar (kamera di ambang pintu)
      const hide = cam && Math.abs(cam.y - door.y - 1.2) < 2.5 && Math.hypot(cam.x - door.x, cam.z - door.z) < 1.6;
      for (const l of door.leaves) {
        l.pivot.visible = !hide;
        // pintu 'h': +angle memutar ke utara; pintu 'v': +angle memutar ke timur (dua daun bercermin)
        const horizontal = Math.abs(l.closed) < 0.01 || Math.abs(Math.abs(l.closed) - Math.PI) < 0.01;
        if (horizontal) l.pivot.rotation.y = l.closed + (Math.abs(l.closed) < 0.01 ? angle : -angle);
        else l.pivot.rotation.y = l.closed + (l.closed < 0 ? angle : -angle);
      }
    }
  };
}

/** Atap: pelana (aula) atau limasan, ditambah langit-langit rata di bawahnya. Koordinat dunia. */
function roofGeometry(r) {
  const [rx0, rz0, rx1, rz1] = r.rect;
  const o = r.overhang;
  const x0 = rx0 - o;
  const x1 = rx1 + o;
  const z0 = rz0 - o;
  const z1 = rz1 + o;
  const w = x1 - x0;
  const d = z1 - z0;
  const top = r.base + r.rise;
  const zc = (z0 + z1) / 2;
  const xc = (x0 + x1) / 2;
  const tris = []; // [ [x,y,z,u,v] x3 ]
  const quad = (p, q, rr, s) => {
    tris.push([p, q, rr], [p, rr, s]);
  };
  const v = (x, y, z) => [x, y, z, x / 2.2, z / 2.2];
  if (r.kind === 'gable') {
    quad(v(x0, r.base, z1), v(x1, r.base, z1), v(x1, top, zc), v(x0, top, zc));
    quad(v(x1, r.base, z0), v(x0, r.base, z0), v(x0, top, zc), v(x1, top, zc));
  } else {
    const m = Math.min(w, d) / 2;
    if (w >= d) {
      quad(v(x0, r.base, z1), v(x1, r.base, z1), v(x1 - m, top, zc), v(x0 + m, top, zc));
      quad(v(x1, r.base, z0), v(x0, r.base, z0), v(x0 + m, top, zc), v(x1 - m, top, zc));
      tris.push([v(x0, r.base, z0), v(x0, r.base, z1), v(x0 + m, top, zc)]);
      tris.push([v(x1, r.base, z1), v(x1, r.base, z0), v(x1 - m, top, zc)]);
    } else {
      quad(v(x1, r.base, z1), v(x1, r.base, z0), v(xc, top, z0 + m), v(xc, top, z1 - m));
      quad(v(x0, r.base, z0), v(x0, r.base, z1), v(xc, top, z1 - m), v(xc, top, z0 + m));
      tris.push([v(x0, r.base, z1), v(x1, r.base, z1), v(xc, top, z1 - m)]);
      tris.push([v(x1, r.base, z0), v(x0, r.base, z0), v(xc, top, z0 + m)]);
    }
  }
  const positions = [];
  const uvs = [];
  for (const t of tris) for (const p of t) { positions.push(p[0], p[1], p[2]); uvs.push(p[3], p[4]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

function buildRoofs(parent, mats) {
  for (const r of ROOFS) {
    const roof = new THREE.Mesh(roofGeometry(r), mats.roof);
    roof.castShadow = true;
    roof.receiveShadow = true;
    parent.add(roof);
    const [x0, z0, x1, z1] = r.rect;
    // langit-langit rata menghadap ke bawah, lengkap dengan balok melintang
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 0.3, z1 - z0 + 0.3), mats.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set((x0 + x1) / 2, r.base - 0.02, (z0 + z1) / 2);
    ceiling.receiveShadow = true;
    parent.add(ceiling);
    if (r.kind === 'gable') {
      // dinding segitiga di ujung pelana (warna plester)
      const zc = (z0 + z1) / 2;
      for (const x of [r.rect[0], r.rect[2]]) {
        const g = new THREE.BufferGeometry();
        const hz = (z1 - z0) / 2;
        g.setAttribute('position', new THREE.Float32BufferAttribute([x, r.base, z0, x, r.base, z1, x, r.base + r.rise, zc].map((n, i) => n), 3));
        g.setIndex(x === r.rect[0] ? [0, 2, 1] : [0, 1, 2]);
        g.computeVertexNormals();
        const tri = new THREE.Mesh(g, mats.plasterFlat);
        tri.castShadow = true;
        parent.add(tri);
        void hz;
      }
      // balok kayu melintang di langit-langit aula
      const beams = [];
      for (let x = x0 + 2; x < x1 - 1; x += 3.5) beams.push({ x, y: r.base - 0.3, z: (z0 + z1) / 2, sx: 0.28, sy: 0.3, sz: z1 - z0 });
      const unit = new THREE.BoxGeometry(1, 1, 1);
      unit.translate(0, 0.5, 0);
      parent.add(instanced(unit, mats.beam, beams, { castShadow: false }));
    }
  }
}

/** Lampu gantung kristal di aula: cincin emas + bohlam menyala. */
function buildChandeliers(parent, mats) {
  const rings = [];
  const bulbs = [];
  for (const z of [-8, -12, -16]) {
    rings.push({ x: 0, y: HALL_WALL_HEIGHT - 1.6, z });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      bulbs.push({ x: Math.cos(a) * 0.85, y: HALL_WALL_HEIGHT - 1.55, z: z + Math.sin(a) * 0.85, s: 1 });
    }
  }
  const ring = new THREE.TorusGeometry(0.85, 0.04, 8, 28).rotateX(Math.PI / 2);
  parent.add(instanced(ring, mats.gold, rings, { castShadow: false }));
  parent.add(instanced(new THREE.SphereGeometry(0.1, 10, 8), mats.lampGlow, bulbs, { castShadow: false }));
  const rod = new THREE.CylinderGeometry(0.015, 0.015, 1.6, 6);
  parent.add(instanced(rod, mats.gold, rings.map((r) => ({ ...r, y: HALL_WALL_HEIGHT - 0.8 })), { castShadow: false }));
}

/** Pemetaan tekstur di ruang dunia (triplanar sederhana) agar tekstur tidak melar pada kotak yang diskalakan. */
function worldPlanarUV(material, scale) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWorldUvScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vec4 wpos = vec4(transformed, 1.0);
  vec3 wnor = objectNormal;
  #ifdef USE_INSTANCING
    wpos = instanceMatrix * wpos;
    wnor = mat3(instanceMatrix) * wnor;
  #endif
  vWPos = (modelMatrix * wpos).xyz;
  vWNor = normalize(mat3(modelMatrix) * wnor);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;\nuniform float uWorldUvScale;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec3 an = abs(normalize(vWNor));
  vec2 wuv = an.x > an.z ? vWPos.zy : vWPos.xy;
  if (an.y > max(an.x, an.z)) wuv = vWPos.xz;
  diffuseColor *= texture2D(map, wuv * uWorldUvScale);
#endif`);
  };
  material.needsUpdate = true;
}

function buildPerimeter(world, parent, mats, rand) {
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const h = 1.35;
  const gate = 3.2;
  const half = (maxX - minX) / 2;
  const segs = [
    [maxX - minX, 0.5, 0, minZ, 0], [0.5, maxZ - minZ, minX, (minZ + maxZ) / 2, 1], [0.5, maxZ - minZ, maxX, (minZ + maxZ) / 2, 1],
    [half - gate, 0.5, -(gate + (half - gate) / 2), maxZ, 0], [half - gate, 0.5, gate + (half - gate) / 2, maxZ, 0],
  ];
  for (const [w, d, x, z] of segs) {
    block(w, h, d, mats.plasterOuter, x, h / 2, z, parent);
    block(w + 0.14, 0.12, d + 0.14, mats.stoneCap, x, h + 0.06, z, parent);
  }
  const lamps = [];
  const pillar = (x, z) => {
    block(0.8, 1.9, 0.8, mats.plasterOuter, x, 0.95, z, parent);
    block(0.95, 0.12, 0.95, mats.stoneCap, x, 1.96, z, parent);
    lamps.push({ x, y: 2.3, z });
  };
  for (let x = minX + 7; x < maxX - 6; x += 7) {
    if (Math.abs(x) > gate + 1.5) pillar(x, maxZ);
    pillar(x, minZ);
  }
  for (let z = minZ + 7; z < maxZ - 6; z += 7) {
    pillar(minX, z);
    pillar(maxX, z);
  }
  for (const sx of [-gate, gate]) {
    block(0.9, 2.4, 0.9, mats.plasterOuter, sx, 1.2, maxZ, parent);
    block(1.05, 0.14, 1.05, mats.stoneCap, sx, 2.47, maxZ, parent);
    lamps.push({ x: sx, y: 2.8, z: maxZ });
  }
  parent.add(instanced(new THREE.SphereGeometry(0.17, 10, 8), mats.lampGlow, lamps.map((l) => ({ ...l })), { castShadow: false }));
  return rand;
}

// -------------------------------------------------------------------- aula
function buildHall(parent, mats, rand) {
  const z1 = -20; // dinding utara aula
  // karpet lorong + garis emas
  flat([-1.5, -19.6, 1.5, -3], mats.runner, 0.04, parent);
  for (const x of [-1.42, 1.42]) flat([x - 0.04, -19.6, x + 0.04, -3], mats.gold, 0.045, parent);

  // pelaminan: panggung kayu, tangga, sofa, gapura bunga
  block(10, 0.15, 3.6, mats.stageBody, 0, 0.075, z1 + 2.3, parent);
  flat([-5, z1 + 0.5, 5, z1 + 4.1], mats.stageTop, 0.153, parent, 2);
  block(3.2, 0.09, 0.5, mats.stageBody, 0, 0.045, z1 + 4.35, parent);
  const sofa = merge([
    part(new THREE.BoxGeometry(4, 0.4, 0.95), '#a8303f', { y: 0.35 }),
    part(new THREE.BoxGeometry(4, 0.8, 0.28), '#a8303f', { y: 0.75, z: -0.34 }),
    part(new THREE.BoxGeometry(0.3, 0.6, 0.95), '#962a38', { x: -1.85, y: 0.5 }),
    part(new THREE.BoxGeometry(0.3, 0.6, 0.95), '#962a38', { x: 1.85, y: 0.5 }),
    ...[-1.8, 1.8].map((x) => part(new THREE.BoxGeometry(0.1, 0.16, 0.1), '#d4a84b', { x, y: 0.08, z: 0.35 })),
  ]);
  parent.add(instanced(sofa, mats.vertex(0.8), [{ x: 0, y: 0.15, z: z1 + 1.35 }]));
  const arch = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 8, 40, Math.PI), mats.white);
  arch.position.set(0, 0.15, z1 + 3.9);
  arch.castShadow = true;
  parent.add(arch);
  for (const x of [-2.6, 2.6]) block(0.24, 0.2, 0.24, mats.gold, x, 0.25, z1 + 3.9, parent);
  const flowers = [];
  const leaves = [];
  for (let i = 0; i <= 44; i++) {
    const a = (i / 44) * Math.PI;
    const r = 2.6 + (rand() - 0.5) * 0.3;
    const p = { x: Math.cos(a) * r, y: 0.15 + Math.sin(a) * r, z: z1 + 3.9 + (rand() - 0.5) * 0.3 };
    leaves.push({ ...p, s: 0.22 + rand() * 0.12, color: rand() < 0.5 ? 0x3f7d36 : 0x56934a });
    flowers.push({ ...p, y: p.y + 0.05, z: p.z + 0.12, s: 0.12 + rand() * 0.08, color: [0xf6a5b8, 0xffffff, 0xf9d2c4, 0xe58fa8][i % 4] });
  }
  parent.add(instanced(new THREE.IcosahedronGeometry(1, 1), mats.leaf, leaves));
  parent.add(instanced(new THREE.IcosahedronGeometry(1, 1), mats.petal, flowers));

  // dinding hijau + gorden di belakang pelaminan
  const wall = [];
  const bloom = [];
  for (let i = 0; i < 230; i++) {
    const p = { x: -3.1 + rand() * 6.2, y: 0.4 + rand() * 2.0, z: z1 + 0.28 + rand() * 0.1 };
    wall.push({ ...p, s: 0.2 + rand() * 0.14, color: [0x2f6a30, 0x3f7d36, 0x4d8c3d][i % 3] });
    if (i % 4 === 0) bloom.push({ ...p, z: p.z + 0.1, s: 0.1 + rand() * 0.06, color: [0xffffff, 0xf6a5b8, 0xf9d2c4][i % 3] });
  }
  parent.add(instanced(new THREE.IcosahedronGeometry(1, 1), mats.leaf, wall, { castShadow: false }));
  parent.add(instanced(new THREE.IcosahedronGeometry(1, 1), mats.petal, bloom, { castShadow: false }));
  for (const sx of [-1, 1]) {
    const g = new THREE.PlaneGeometry(2.4, 2.4, 40, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 11) * 0.08);
    g.computeVertexNormals();
    const curtain = new THREE.Mesh(g, mats.curtain);
    curtain.position.set(sx * 4.3, 1.35, z1 + 0.3);
    curtain.castShadow = true;
    parent.add(curtain);
  }

  // kursi tamu (hadap panggung, -z)
  const { z0, z1: zEnd, rowStep } = HALL_SEATING;
  const seats = hallChairPositions().map((c) => ({ ...c, ry: Math.PI }));
  const rows = [];
  for (let z = z0; z <= zEnd + 1e-6; z += rowStep) rows.push(z);
  parent.add(instanced(chairGeometry(), mats.vertex(0.55), seats));

  // lampion lantai + standing flower di sepanjang lorong
  const lanterns = [];
  const stands = [];
  const bouquet = bouquetGeometry(rand);
  rows.forEach((z, i) => {
    lanterns.push({ x: 1.72, y: 0.15, z }, { x: -1.72, y: 0.15, z });
    if (i % 2 === 0) stands.push({ x: 2.0, y: 0.95, z, s: 1.4 }, { x: -2.0, y: 0.95, z, s: 1.4 });
  });
  parent.add(instanced(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), mats.lanternGlow, lanterns, { castShadow: false }));
  parent.add(instanced(bouquet, mats.vertex(0.6), stands));
  parent.add(instanced(new THREE.CylinderGeometry(0.03, 0.05, 0.9, 8), mats.gold, stands.map((s) => ({ ...s, y: 0.45, s: 1 }))));
}

function bouquetGeometry(rand) {
  const parts = [part(new THREE.CylinderGeometry(0.06, 0.08, 0.2, 10), '#d9d2c3', { y: 0.1 })];
  const colors = ['#f6a5b8', '#ffffff', '#f9d2c4', '#e58fa8', '#fff1b8'];
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.11;
    parts.push(part(new THREE.IcosahedronGeometry(1, 1), colors[i % colors.length], { x: Math.cos(a) * r, y: 0.28 + rand() * 0.08, z: Math.sin(a) * r, sx: 0.075, sy: 0.075, sz: 0.075 }));
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(part(new THREE.IcosahedronGeometry(1, 0), '#3f7d36', { x: Math.cos(a) * 0.12, y: 0.24, z: Math.sin(a) * 0.12, sx: 0.07, sy: 0.04, sz: 0.07 }));
  }
  return merge(parts);
}

// ------------------------------------------------------------ kolam + taman
function buildPoolAndGarden(parent, mats, anim) {
  const depth = -1.1;
  // dasar dan dinding kolam berubin
  flat([-7, 2, 7, 16], mats.poolTile, depth, parent, 2);
  wallPlane(14, 1.1, 2, mats.poolTile, 0, depth / 2, 2, 0, parent);
  wallPlane(14, 1.1, 2, mats.poolTile, 0, depth / 2, 16, Math.PI, parent);
  wallPlane(14, 1.1, 2, mats.poolTile, -7, depth / 2, 9, Math.PI / 2, parent);
  wallPlane(14, 1.1, 2, mats.poolTile, 7, depth / 2, 9, -Math.PI / 2, parent);
  // permukaan air
  const water = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), mats.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.14, 9);
  water.renderOrder = 2;
  water.name = 'pool-water';
  parent.add(water);
  // bibir kolam dari batu
  block(15.2, 0.12, 0.5, mats.limestone, 0, 0.06, 1.75, parent);
  block(15.2, 0.12, 0.5, mats.limestone, 0, 0.06, 16.25, parent);
  block(0.5, 0.12, 14, mats.limestone, -7.25, 0.06, 9, parent);
  block(0.5, 0.12, 14, mats.limestone, 7.25, 0.06, 9, parent);
  // dek di sekeliling
  flat([-9.3, 4, -7.5, 17.6], mats.deck, 0.014, parent, 3);
  flat([7.5, 4, 9.3, 17.6], mats.deck, 0.014, parent, 3);
  flat([-9.3, 16.5, 9.3, 17.6], mats.deck, 0.014, parent, 3);

  // jembatan kayu + pagar
  block(3, 0.22, 14, mats.limestone, 0, 0.11, 9, parent);
  flat([-1.4, 2.2, 1.4, 15.8], mats.bridgeWood, 0.224, parent, 3);
  for (const sx of [-1.4, 1.4]) {
    block(0.07, 0.07, 14, mats.white, sx, 0.98, 9, parent, { cast: false });
    block(0.05, 0.05, 14, mats.white, sx, 0.62, 9, parent, { cast: false });
    for (let z = 2.2; z <= 15.9; z += 1.9) block(0.1, 0.78, 0.1, mats.white, sx, 0.6, z, parent);
  }
  // lounger + payung
  const loungers = [];
  const towels = [];
  const umbrellas = [];
  for (const sx of [-1, 1]) {
    for (const z of [5.2, 6.5, 11.5, 12.8]) {
      loungers.push({ x: sx * 8.35, y: 0.014, z });
      towels.push({ x: sx * 8.35, y: 0.455, z: z + 0.15, sx: 0.5, sy: 0.02, sz: 0.7, color: [0xf6a5b8, 0x6ec6d9, 0xf4d58d, 0xffffff][(z * 3) % 4 | 0] });
    }
    umbrellas.push({ x: sx * 8.6, z: 9 });
  }
  parent.add(instanced(loungerGeometry(), mats.vertex(0.6), loungers));
  parent.add(instanced(new THREE.BoxGeometry(1, 1, 1), mats.towel, towels, { castShadow: false }));
  parent.add(instanced(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 8), mats.gold, umbrellas.map((u) => ({ ...u, y: 1.15 }))));
  parent.add(instanced(new THREE.ConeGeometry(1.5, 0.45, 12, 1, true), mats.umbrella, umbrellas.map((u) => ({ ...u, y: 2.35 }))));

  // air mancur bertingkat
  const stone = mats.limestone;
  const cx = 0;
  const cz = 28;
  const basin = new THREE.LatheGeometry([[0.01, 0], [2.65, 0], [2.65, 0.52], [2.45, 0.56], [2.4, 0.45], [2.25, 0.4], [0.01, 0.4]].map(([x, y]) => new THREE.Vector2(x, y)), 40);
  const basinMesh = new THREE.Mesh(basin, stone);
  basinMesh.position.set(cx, 0, cz);
  basinMesh.castShadow = basinMesh.receiveShadow = true;
  parent.add(basinMesh);
  const lower = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), mats.fountainWater);
  lower.rotation.x = -Math.PI / 2;
  lower.position.set(cx, 0.37, cz);
  parent.add(lower);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.35, 16), stone);
  pillar.position.set(cx, 0.95, cz);
  pillar.castShadow = true;
  parent.add(pillar);
  const bowl = new THREE.LatheGeometry([[0.01, 0], [1.15, 0.12], [1.3, 0.34], [1.18, 0.34], [1.1, 0.22], [0.01, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)), 32);
  const bowlMesh = new THREE.Mesh(bowl, stone);
  bowlMesh.position.set(cx, 1.5, cz);
  bowlMesh.castShadow = true;
  parent.add(bowlMesh);
  const upper = new THREE.Mesh(new THREE.CircleGeometry(1.12, 32), mats.fountainWater);
  upper.rotation.x = -Math.PI / 2;
  upper.position.set(cx, 1.82, cz);
  parent.add(upper);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.16, 0.9, 12), stone);
  spire.position.set(cx, 2.3, cz);
  parent.add(spire);

  // percikan air (titik-titik yang mengikuti lintasan parabola)
  const drops = 140;
  const dropGeo = new THREE.BufferGeometry();
  const dropPos = new Float32Array(drops * 3);
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const params = Array.from({ length: drops }, (_, i) => ({
    angle: (i / drops) * Math.PI * 2 * 7.3,
    speed: 1.3 + ((i * 37) % 10) / 10,
    lift: 2.6 + ((i * 53) % 10) / 12,
    phase: (i % 20) / 20,
  }));
  const drip = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0xeaffff, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }));
  drip.frustumCulled = false;
  parent.add(drip);
  anim.push((time) => {
    params.forEach((p, i) => {
      const t = (time * 0.7 + p.phase) % 1;
      const r = p.speed * t * 1.15;
      const y = 2.75 + p.lift * t - 4.4 * t * t * 1.45;
      const high = i % 3 === 0;
      dropPos[i * 3] = cx + Math.cos(p.angle) * r * (high ? 0.35 : 1);
      dropPos[i * 3 + 1] = Math.max(1.84, y * (high ? 1.0 : 0.62) + (high ? 0 : 0.45));
      dropPos[i * 3 + 2] = cz + Math.sin(p.angle) * r * (high ? 0.35 : 1);
    });
    dropGeo.attributes.position.needsUpdate = true;
  });
}

// ----------------------------------------------------------------- tanaman
function buildPalms(world, parent, mats) {
  const palms = world.props.filter((p) => p.type === 'palm');
  const rand = rng(5);
  const heights = palms.map((_, i) => 4.0 + ((i * 7) % 5) * 0.4);
  const turns = palms.map(() => rand() * Math.PI * 2);
  parent.add(instanced(palmTrunkGeometry(), mats.vertex(0.9), palms.map((p, i) => ({ x: p.x, z: p.z, sy: heights[i], ry: turns[i] }))));
  const fronds = [];
  const nuts = [];
  palms.forEach((p, i) => {
    const bend = PALM_BEND * Math.cos(turns[i]);
    const bendZ = -PALM_BEND * Math.sin(turns[i]);
    const top = { x: p.x + bend, y: heights[i], z: p.z + bendZ };
    const count = 11;
    for (let k = 0; k < count; k++) {
      const shade = 0.78 + rand() * 0.4;
      fronds.push({
        x: top.x, y: top.y - 0.05 + (k % 2) * 0.1, z: top.z,
        ry: (k / count) * Math.PI * 2 + rand() * 0.4,
        s: 0.85 + rand() * 0.3,
        color: new THREE.Color(shade * 0.9, shade, shade * 0.85).getHex(),
      });
    }
    for (let k = 0; k < 3; k++) nuts.push({ x: top.x + Math.cos(k * 2.1) * 0.16, y: top.y - 0.18, z: top.z + Math.sin(k * 2.1) * 0.16, s: 0.12 });
  });
  const frondMesh = instanced(frondGeometry(), mats.frond, fronds, { castShadow: true });
  frondMesh.customDepthMaterial = leafDepthMaterial(mats.frond.map);
  parent.add(frondMesh);
  parent.add(instanced(new THREE.IcosahedronGeometry(1, 1), mats.nut, nuts));
}

/** Jalan tanah dari gerbang dan pepohonan di luar vila (posisi sama dengan penghalang di layout). */
function buildCountryside(world, parent, mats, rand) {
  const trees = world.props.filter((p) => p.type === 'tree');
  const dirt = std(0xb59f7c, { roughness: 1 });
  flat([-COUNTRYSIDE.roadHalf, world.bounds.maxZ + 0.3, COUNTRYSIDE.roadHalf, COUNTRYSIDE.roadLength], dirt, 0.02, parent);
  const trunk = new THREE.CylinderGeometry(0.14, 0.24, 1, 7);
  trunk.translate(0, 0.5, 0);
  parent.add(instanced(trunk, std(0x5b4630, { roughness: 0.95 }), trees.map((t) => ({ x: t.x, z: t.z, sx: t.s, sy: t.s * 3.4, sz: t.s }))));
  const greens = [0x3f7d3c, 0x4f8f45, 0x35703a, 0x5b9a4a];
  const crown = new THREE.IcosahedronGeometry(1, 1);
  parent.add(instanced(crown, std(0xffffff, { roughness: 0.9 }), trees.map((t, i) => ({
    x: t.x, y: t.s * 3.6 + 0.9, z: t.z, sx: t.s * 1.9, sy: t.s * 1.6, sz: t.s * 1.9, ry: rand() * 6.28, color: greens[i % greens.length],
  }))));
  // semak rendah di sepanjang jalan supaya terasa seperti jalan desa
  const bushes = [];
  for (let z = world.bounds.maxZ + 8; z < 150; z += 6 + rand() * 4) {
    for (const side of [-1, 1]) bushes.push({ x: side * (COUNTRYSIDE.roadHalf + 1.2 + rand() * 1.5), z, s: 0.5 + rand() * 0.5, color: greens[Math.floor(rand() * 4)] });
  }
  parent.add(instanced(new THREE.IcosahedronGeometry(1, 1), std(0xffffff, { roughness: 0.9 }), bushes.map((b) => ({ x: b.x, y: b.s * 0.6, z: b.z, sx: b.s * 1.2, sy: b.s, sz: b.s * 1.2, color: b.color }))));
}

function buildGreenery(world, parent, mats, rand) {
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const palms = world.props.filter((p) => p.type === 'palm');
  const farFromPalm = (x, z, d = 1.8) => palms.every((p) => Math.hypot(p.x - x, p.z - z) > d);

  // semak sepanjang tembok keliling dan di tepi jalan masuk
  const shrubs = [];
  const add = (x, z, s = 1) => {
    if (farFromPalm(x, z)) shrubs.push({ x, z, s: s * (0.85 + rand() * 0.5), ry: rand() * 6.28 });
  };
  for (let x = minX + 1.4; x <= maxX - 1.4; x += 1.7) {
    add(x, minZ + 1.35);
    if (Math.abs(x) > 4.2) add(x, maxZ - 1.35);
  }
  for (let z = minZ + 3; z <= maxZ - 3; z += 1.7) {
    add(minX + 1.35, z);
    add(maxX - 1.35, z);
  }
  for (let z = 18; z <= 41; z += 2.2) {
    add(-3.5, z, 0.75);
    add(3.5, z, 0.75);
  }
  parent.add(instanced(shrubGeometry(), mats.vertex(0.9), shrubs));

  // bunga kecil di atas semak
  const petals = [];
  const colors = [0xf6a5b8, 0xffffff, 0xf9d2c4, 0xffe27a, 0xd98ae0];
  shrubs.forEach((s, i) => {
    if (i % 2) return;
    for (let k = 0; k < 6; k++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 0.5 * s.s;
      petals.push({ x: s.x + Math.cos(a) * r, y: 0.55 * s.s + rand() * 0.2, z: s.z + Math.sin(a) * r, s: 0.06, color: colors[(i + k) % colors.length] });
    }
  });
  parent.add(instanced(new THREE.IcosahedronGeometry(1, 0), mats.petal, petals, { castShadow: false }));

  // tanaman pot di sudut ruangan
  const spots = [[15, -19], [25, -19], [15, -4.5], [25, -4.5], [-13, -19], [13, -19], [-13, -4.5], [13, -4.5], [-35, 5], [-17, 5], [-35, 19], [-17, 19], [-25, -4.5], [-15, -4.5], [27, -4.5], [37, -4.5]];
  parent.add(instanced(potPlantGeometry(), mats.vertex(0.8), spots.map(([x, z]) => ({ x, z, s: 1, ry: rand() * 6 }))));

  // pohon di luar tembok + bukit jauh agar cakrawala tidak kosong
  const variants = [[], [], []];
  const span = (maxX - minX) + (maxZ - minZ);
  for (let d = 0; d < span * 2; d += 4.4) {
    const t = d % (span * 2);
    const out = 3.5 + rand() * 9;
    let x;
    let z;
    const w = maxX - minX;
    const h = maxZ - minZ;
    if (t < w) { x = minX + t; z = minZ - out; }
    else if (t < w + h) { x = maxX + out; z = minZ + (t - w); }
    else if (t < 2 * w + h) { x = maxX - (t - w - h); z = maxZ + out; }
    else { x = minX - out; z = maxZ - (t - 2 * w - h); }
    if (Math.abs(x) < 6 && z > maxZ) continue; // jangan menutup gerbang
    variants[(rand() * 3) | 0].push({ x, z, s: 0.9 + rand() * 0.8, ry: rand() * 6.28 });
  }
  variants.forEach((items, v) => parent.add(instanced(broadleafTreeGeometry(v), mats.vertex(0.9), items)));
  const hills = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand() * 0.3;
    const r = 115 + rand() * 40;
    hills.push({ x: Math.cos(a) * r, y: -6, z: Math.sin(a) * r + 8, sx: 45 + rand() * 35, sy: 14 + rand() * 12, sz: 45 + rand() * 35, color: 0x6f9b66 });
  }
  const hillMesh = instanced(new THREE.SphereGeometry(1, 14, 8), mats.hill, hills, { castShadow: false, receiveShadow: false });
  parent.add(hillMesh);
  return hillMesh; // bukit latar: ikut bergerak bersama pemain di luar vila supaya tetap di cakrawala
}

// ------------------------------------------------------------ properti ruang
function buildProps(propList, parent, mats, rand) {
  const by = (t) => propList.filter((p) => p.type === t);

  // tempat tidur lengkap dengan karpet
  const beds = by('bed');
  const bg = bedGeometries();
  const bedItems = beds.map((b) => ({ x: b.x, z: b.z, ry: b.z < 10 ? 0 : Math.PI }));
  const duvetColors = [0xe8d9c4, 0xc9d6df, 0xe9c9cf, 0xd8e0c9, 0xf1e6d0];
  parent.add(instanced(bg.base, mats.vertex(0.65), bedItems));
  parent.add(instanced(bg.duvet, std(0xffffff, { roughness: 0.95 }), bedItems.map((b, i) => ({ ...b, color: duvetColors[i % duvetColors.length] }))));
  parent.add(instanced(bg.lamps, mats.lanternGlow, bedItems, { castShadow: false }));
  const rugColors = [['#8c2f39', '#e8d9b0'], ['#2f4f6f', '#e8e0cc'], ['#6e3b52', '#ead7c0']];
  beds.forEach((b, i) => {
    const [main, accent] = rugColors[i % rugColors.length];
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.1), new THREE.MeshStandardMaterial({ map: rugTexture(main, accent), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(b.x, 0.045, b.z + (b.z < 10 ? 0.45 : -0.45));
    rug.receiveShadow = true;
    parent.add(rug);
  });

  // sofa lobi (menghadap utara, bisa diduduki)
  const sofaGeo = merge([
    part(new THREE.BoxGeometry(2.2, 0.4, 1.0), '#7b2d3b', { y: 0.35 }),
    part(new THREE.BoxGeometry(2.2, 0.62, 0.22), '#682433', { y: 0.7, z: 0.4 }),
    part(new THREE.BoxGeometry(0.24, 0.55, 1.0), '#682433', { x: -1.0, y: 0.5 }),
    part(new THREE.BoxGeometry(0.24, 0.55, 1.0), '#682433', { x: 1.0, y: 0.5 }),
    part(new THREE.BoxGeometry(1.5, 0.1, 0.8), '#8d3748', { y: 0.58, z: -0.02 }),
    ...[-0.95, 0.95].flatMap((x) => [-0.4, 0.4].map((z) => part(new THREE.BoxGeometry(0.08, 0.14, 0.08), '#d4a84b', { x, y: 0.07, z }))),
  ]);
  parent.add(instanced(sofaGeo, mats.vertex(0.85), by('sofa').map((f) => ({ x: f.x, z: f.z }))));

  // meja resepsionis + karpet lobi
  by('desk').forEach((d) => {
    parent.add(instanced(merge([
      part(new THREE.BoxGeometry(3.6, 1.0, 1.0), '#5a3d28', { y: 0.5 }),
      part(new THREE.BoxGeometry(3.85, 0.07, 1.2), '#f1ece2', { y: 1.04 }),
      part(new THREE.BoxGeometry(3.0, 0.06, 0.03), '#d4a84b', { y: 0.72, z: 0.51 }),
      part(new THREE.BoxGeometry(3.0, 0.06, 0.03), '#d4a84b', { y: 0.72, z: -0.51 }),
    ]), mats.vertex(0.5), [{ x: d.x, z: d.z }]));
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.8), new THREE.MeshStandardMaterial({ map: rugTexture('#223b3a', '#e8d9b0'), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(d.x, 0.045, d.z + 3);
    rug.receiveShadow = true;
    parent.add(rug);
  });

  // spa: bak mandi oval di atas podium batu, lilin
  by('tub').forEach((t) => {
    block(3.5, 0.14, 2.5, mats.limestone, t.x, 0.07, t.z, parent);
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.9, 0.6, 40), mats.ceramic);
    tub.scale.set(1.5, 1, 0.98);
    tub.position.set(t.x, 0.44, t.z);
    tub.castShadow = true;
    parent.add(tub);
    const surf = new THREE.Mesh(new THREE.CircleGeometry(0.93, 40), mats.fountainWater);
    surf.scale.set(1.5, 0.98, 1);
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(t.x, 0.7, t.z);
    parent.add(surf);
    const candles = [];
    for (let i = 0; i < 7; i++) candles.push({ x: t.x - 1.4 + i * 0.47, y: 0.2, z: t.z + 1.12 });
    parent.add(instanced(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8), mats.lanternGlow, candles, { castShadow: false }));
  });

  // dapur: konter baja
  const counters = by('counter');
  const counterGeo = merge([
    part(new THREE.BoxGeometry(2.4, 0.9, 1), '#aeb4b6', { y: 0.45 }),
    part(new THREE.BoxGeometry(2.5, 0.06, 1.1), '#d6dadb', { y: 0.93 }),
    ...[-0.8, 0, 0.8].flatMap((x) => [0.505, -0.505].map((z) => part(new THREE.BoxGeometry(0.7, 0.62, 0.02), '#8f969a', { x, y: 0.46, z }))),
  ]);
  parent.add(instanced(counterGeo, std(0xffffff, { roughness: 0.38, metalness: 0.55, vertexColors: true }), counters.map((c) => ({ x: c.x, z: c.z }))));

  // restoran: meja bertaplak, kursi kayu, bunga + lilin
  const tables = by('table');
  parent.add(instanced(new THREE.CylinderGeometry(0.88, 0.95, 0.74, 28), mats.cloth, tables.map((t) => ({ x: t.x, y: 0.37, z: t.z }))));
  parent.add(instanced(new THREE.CylinderGeometry(1.0, 1.0, 0.03, 28), mats.cloth, tables.map((t) => ({ x: t.x, y: 0.755, z: t.z }))));
  parent.add(instanced(bouquetGeometry(rand), mats.vertex(0.6), tables.map((t) => ({ x: t.x, y: 0.77, z: t.z, s: 1.1 }))));
  parent.add(instanced(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8), mats.lanternGlow, tables.map((t) => ({ x: t.x + 0.4, y: 0.82, z: t.z })), { castShadow: false }));
  const chairs = tables.flatMap((t) => [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].map(([dx, dz]) => ({ x: t.x + dx, z: t.z + dz, ry: Math.atan2(-dx, -dz) })));
  parent.add(instanced(chairGeometry({ frame: '#6b4f35', cushion: '#d8c5a6' }), mats.vertex(0.6), chairs));

  // lounger teras
  parent.add(instanced(loungerGeometry(), mats.vertex(0.6), by('lounger').map((l) => ({ x: l.x, z: l.z }))));

  // mobil + marka parkir
  const cars = by('car');
  if (cars.length) {
  const cg = carGeometries();
  const palette = [0x1f2a36, 0xf2f2f0, 0x8e1b1b, 0x3a3f46, 0x274a7c, 0xb9bcc0, 0x1a1a1a, 0xe9e1cf];
  const placed = cars.map((c, i) => ({ x: c.x, z: c.z, ry: i % 2 ? Math.PI : 0 }));
  parent.add(instanced(cg.body, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }), placed.map((c, i) => ({ ...c, color: palette[i % palette.length] }))));
  parent.add(instanced(cg.details, mats.vertex(0.35, { metalness: 0.2 }), placed));
  parent.add(instanced(cg.lights, new THREE.MeshBasicMaterial({ vertexColors: true }), placed, { castShadow: false }));
  const lines = [];
  for (const z of [30, 37]) for (const x of [20, 24, 28, 32, 36]) lines.push({ x, y: 0.03, z, sx: 0.12, sy: 0.02, sz: 6 });
  parent.add(instanced(new THREE.BoxGeometry(1, 1, 1), mats.paint, lines, { castShadow: false }));
  }
}

// ------------------------------------------------------------------ lantai atas
/** Lantai dan pelat beton untuk tiap ruangan (bordes untuk menara tangga). */
function buildFloors(rooms, level, parent, mats, floors) {
  for (const r of rooms) {
    const rect = r.kind === 'stair' ? (level === 0 ? r.rect : r.landing) : r.rect;
    if (!rect) continue;
    const [material, tile] = floors[r.kind] ?? floors.corridor;
    flat(rect, material, 0.03, parent, tile);
    if (level > 0) block(rect[2] - rect[0], 0.4, rect[3] - rect[1], mats.slab, (rect[0] + rect[2]) / 2, -0.2, (rect[1] + rect[3]) / 2, parent, { cast: false });
  }
}

/** Pagar teras: tiang + dua rel di tepi yang tidak berbatasan dengan ruangan berdinding. */
function buildRailings(rooms, parent, mats) {
  const walled = rooms.filter((r) => r.kind !== 'terrace').map((r) => r.rect);
  const posts = [];
  const top = [];
  const mid = [];
  for (const r of rooms.filter((q) => q.kind === 'terrace')) {
    const [x1, z1, x2, z2] = r.rect;
    for (const [orient, coord, a, b, out] of [['h', z1, x1, x2, -1], ['h', z2, x1, x2, 1], ['v', x1, z1, z2, -1], ['v', x2, z1, z2, 1]]) {
      const n = Math.max(1, Math.round((b - a) / 1.2));
      const seg = (b - a) / n;
      const edge = coord - out * 0.12;
      for (let i = 0; i < n; i++) {
        const c0 = a + seg * i;
        const m = c0 + seg / 2;
        const ox = orient === 'h' ? m : coord + out * 0.35;
        const oz = orient === 'h' ? coord + out * 0.35 : m;
        if (walled.some((w) => ox > w[0] && ox < w[2] && oz > w[1] && oz < w[3])) continue;
        const at = (c) => (orient === 'h' ? { x: c, z: edge } : { x: edge, z: c });
        const mm = at(m);
        top.push({ ...mm, y: 0.97, ry: orient === 'h' ? 0 : Math.PI / 2, sx: seg });
        mid.push({ ...mm, y: 0.5, ry: orient === 'h' ? 0 : Math.PI / 2, sx: seg });
        posts.push(at(c0), at(c0 + seg));
      }
    }
  }
  const postGeo = new THREE.BoxGeometry(0.07, 1, 0.07);
  postGeo.translate(0, 0.5, 0);
  parent.add(instanced(postGeo, mats.white, posts.map((p) => ({ ...p, sy: 1 }))));
  parent.add(instanced(new THREE.BoxGeometry(1, 0.07, 0.09), mats.gold, top));
  parent.add(instanced(new THREE.BoxGeometry(1, 0.03, 0.03), mats.white, mid));
}

/** Lengan tangga beton dengan pegangan tangan. Tinggi relatif terhadap induk (asal induk = lantai asal tangga). */
function buildStairs(flights, parent, mats) {
  const N = 18;
  const blocks = [];
  const treads = [];
  const posts = [];
  const rails = [];
  for (const s of flights) {
    const w = s.x2 - s.x1;
    const cx = (s.x1 + s.x2) / 2;
    const run = Math.abs(s.zBottom - s.zTop);
    const dir = Math.sign(s.zBottom - s.zTop);
    const base = 0;
    const rise = LEVEL_HEIGHT / N;
    const depth = run / N;
    for (let i = 0; i < N; i++) {
      const zc = s.zBottom - dir * (i + 0.5) * depth;
      const topY = base + (i + 1) * rise;
      blocks.push({ x: cx, y: base, z: zc, sx: w, sy: topY - base, sz: depth + 0.01 });
      treads.push({ x: cx, y: topY - 0.05, z: zc, sx: w + 0.02, sy: 0.05, sz: depth + 0.02 });
    }
    for (const x of [s.x1 + 0.07, s.x2 - 0.07]) {
      rails.push({ x, y: base + LEVEL_HEIGHT / 2 + 0.95, z: (s.zBottom + s.zTop) / 2, len: Math.hypot(run, LEVEL_HEIGHT), angle: Math.atan2(LEVEL_HEIGHT, run) * dir });
      for (let i = 1; i < N; i += 4) posts.push({ x, y: base + (i + 1) * rise, z: s.zBottom - dir * (i + 0.5) * depth, sy: 0.95 });
    }
  }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  unit.translate(0, 0.5, 0);
  parent.add(instanced(unit, mats.stairStone, blocks));
  parent.add(instanced(unit, mats.stairTread, treads, { castShadow: false }));
  const postGeo = new THREE.BoxGeometry(0.06, 1, 0.06);
  postGeo.translate(0, 0.5, 0);
  parent.add(instanced(postGeo, mats.white, posts));
  const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1), mats.gold, rails.length);
  rails.forEach((r, i) => {
    dummy.position.set(r.x, r.y, r.z);
    dummy.rotation.set(r.angle, 0, 0);
    dummy.scale.set(1, 1, r.len);
    dummy.updateMatrix();
    railMesh.setMatrixAt(i, dummy.matrix);
  });
  railMesh.castShadow = true;
  parent.add(railMesh);
}

const TERRACE_PLANTS = {
  terrace_w: [[-36.5, -18.5], [-15.5, -18.5], [-15.5, -4.5], [-36.5, -4.5]],
  terrace_e: [[15.5, -18.5], [24.5, -18.5], [15.5, -4.5], [24.5, -4.5]],
  sky_garden: [[17, 5.5], [17, 20.5], [37, 20.5], [27, 5.5], [27, 20.5]],
  rooftop: [[-17, 5.5], [-17, 18.5], [-35, 18.5]],
};

function buildUpperLevel(level, data, group, mats, floors, rand) {
  buildFloors(data.rooms, level, group, mats, floors);
  buildWalls(data.walls, data.rooms, data.doors, group, mats);
  const updateDoors = buildDoorLeaves(data.doors, level, group, mats);
  buildRailings(data.rooms, group, mats);
  buildProps(data.props, group, mats, rand);
  const plants = [];
  for (const r of data.rooms) for (const [x, z] of TERRACE_PLANTS[r.id] ?? []) plants.push({ x, z, ry: rand() * 6 });
  if (plants.length) group.add(instanced(potPlantGeometry(), mats.vertex(0.8), plants));
  for (const r of data.rooms) {
    if (!['lounge', 'library', 'restaurant'].includes(r.kind)) continue;
    const [x1, z1, x2, z2] = r.rect;
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(7, x2 - x1 - 3), Math.min(4.5, z2 - z1 - 4)), new THREE.MeshStandardMaterial({ map: rugTexture('#2f4f6f', '#e8e0cc'), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set((x1 + x2) / 2, 0.045, (z1 + z2) / 2);
    rug.receiveShadow = true;
    group.add(rug);
  }
  return { updateDoors };
}

function buildLanterns(parent, mats) {
  const posts = [];
  for (let z = 19; z <= 40; z += 7) posts.push({ x: -3.4, z }, { x: 3.4, z });
  for (const [x, z] of [[-4.6, 22], [4.6, 22], [-4.6, 34], [4.6, 34]]) posts.push({ x, z });
  parent.add(instanced(lanternPostGeometry(), mats.vertex(0.5, { metalness: 0.4 }), posts));
  parent.add(instanced(new THREE.BoxGeometry(0.22, 0.3, 0.22), mats.lampGlow, posts.map((p) => ({ ...p, y: 2.2 })), { castShadow: false }));
}

function skyAndLight(scene, root, renderer) {
  const sky = new Sky();
  sky.scale.setScalar(380);
  const u = sky.material.uniforms;
  u.turbidity.value = 2.6;
  u.rayleigh.value = 1.3;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(SUN_DIR);
  scene.add(sky);
  scene.fog = new THREE.Fog(0xcfe0ec, 90, 230);
  if (renderer) {
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(900);
    Object.assign(envSky.material.uniforms.turbidity, { value: 2.6 });
    envSky.material.uniforms.rayleigh.value = 1.3;
    envSky.material.uniforms.mieCoefficient.value = 0.004;
    envSky.material.uniforms.mieDirectionalG.value = 0.82;
    envSky.material.uniforms.sunPosition.value.copy(SUN_DIR);
    envScene.add(envSky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0, 0.1, 1200).texture;
    scene.environmentIntensity = 0.5;
    pmrem.dispose();
  }
  root.add(new THREE.HemisphereLight(0xe3f0ff, 0x86946c, 0.5));
  const sun = new THREE.DirectionalLight(0xffeccb, 2.7);
  sun.castShadow = true;
  const lowEnd = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 120 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  root.add(sun, sun.target);
  return { sun, sky };
}

/** Membangun seluruh vila ke dalam scene. Mengembalikan fungsi update (bayangan, air, percikan). */
export function buildVillaWorld(scene, world, { renderer } = {}) {
  const root = new THREE.Group();
  scene.add(root);
  const rand = rng(2026);
  const anim = [];
  const { sun, sky } = skyAndLight(scene, root, renderer);

  const tex = {
    grass: grassTexture(), stone: stoneTexture(), path: stoneTexture({ slabs: 3, base: [188, 176, 156], seed: 22 }),
    limestone: stoneTexture({ slabs: 2, base: [214, 205, 186], seed: 23 }), parquet: parquetTexture(),
    marble: marbleTexture(), checker: marbleTexture({ checker: true }), asphalt: asphaltTexture(),
    poolTile: poolTileTexture(), waterNormal: waterNormalTexture(), frond: frondTexture(),
    plaster: plasterTexture(), roofTile: roofTileTexture(),
  };
  tex.grass.repeat.set(1 / 6, 1 / 6);
  tex.waterNormal.repeat.set(5, 5);
  const waterBase = { transparent: true, opacity: 0.88, roughness: 0.06, metalness: 0, normalMap: tex.waterNormal, normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 0.8, depthWrite: false };
  const vertexMat = (roughness, extra = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness, ...extra });
  const mats = {
    vertex: vertexMat,
    plaster: std(0xffffff, { map: tex.plaster, roughness: 0.93 }), plasterOuter: std(0xd9c7a4, { map: tex.plaster, roughness: 0.95 }),
    plasterFlat: std(0xdccdb0, { roughness: 0.93 }),
    plinth: std(0xa9967a, { roughness: 0.85 }), skirting: std(0x5b4331, { roughness: 0.55 }), cornice: std(0xeadfc9, { roughness: 0.7 }),
    wood: std(0x5a3e29, { roughness: 0.55 }), door: std(0x5e402a, { roughness: 0.5 }), beam: std(0x4f3624, { roughness: 0.6 }),
    ceiling: std(0xeee4cf, { roughness: 0.9 }),
    roof: std(0xffffff, { map: tex.roofTile, roughness: 0.78, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa9cfe2, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0, envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide }),
    stoneCap: std(0xcfc4ad, { roughness: 0.8 }), brass: std(0xb89a62, { roughness: 0.35, metalness: 0.7 }),
    gold: std(0xd4a84b, { roughness: 0.3, metalness: 0.75 }), white: std(0xfaf7f0, { roughness: 0.55 }),
    limestone: std(0xffffff, { map: tex.limestone, roughness: 0.78 }),
    deck: std(0xffffff, { map: tex.path, roughness: 0.82 }),
    bridgeWood: std(0xf0e0c4, { map: tex.parquet, roughness: 0.55 }),
    poolTile: std(0xffffff, { map: tex.poolTile, roughness: 0.35 }),
    water: new THREE.MeshPhysicalMaterial({ color: 0x1596b8, ...waterBase }),
    fountainWater: new THREE.MeshPhysicalMaterial({ color: 0x2aa6c6, ...waterBase, opacity: 0.9 }),
    runner: std(0xfaf6ee, { roughness: 0.96 }),
    stageBody: std(0xcdb48a, { roughness: 0.6 }), stageTop: std(0xe2c9a0, { map: tex.parquet, roughness: 0.45 }),
    leaf: std(0xffffff, { roughness: 0.8 }), petal: std(0xffffff, { roughness: 0.65 }),
    curtain: std(0xf6f0e6, { roughness: 0.92, side: THREE.DoubleSide }),
    lanternGlow: new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffc878, emissiveIntensity: 1.6, roughness: 0.4 }),
    lampGlow: new THREE.MeshStandardMaterial({ color: 0xfff4de, emissive: 0xffd28a, emissiveIntensity: 1.3, roughness: 0.4 }),
    towel: std(0xffffff, { roughness: 0.95 }),
    umbrella: std(0xf4ead2, { roughness: 0.85, side: THREE.DoubleSide }),
    cloth: std(0xfaf6ee, { roughness: 0.95 }), ceramic: std(0xf6f4ee, { roughness: 0.18 }),
    paint: std(0xf5f5f0, { roughness: 0.7 }),
    frond: new THREE.MeshStandardMaterial({ map: tex.frond, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.72 }),
    nut: std(0x4a3a22, { roughness: 0.6 }),
    hill: std(0xffffff, { roughness: 1 }),
    slab: std(0xcbbfa6, { roughness: 0.9 }),
    stairStone: std(0xcdc3ae, { roughness: 0.85 }),
    stairTread: std(0xf2ece0, { roughness: 0.7 }),
  };
  worldPlanarUV(mats.plaster, 1 / 3.2);
  worldPlanarUV(mats.plasterOuter, 1 / 3.2);
  // Kecocokan kolom/hijau: material vertex-color untuk bunga dan daun memakai warna per instance.
  mats.leaf.vertexColors = false;

  // tanah berlubang di kolam
  const shape = new THREE.Shape();
  const R = 720; // dunia terbuka: tanah sampai jauh melewati pagar (pemain boleh keluar gerbang)
  shape.moveTo(-R, -R);
  shape.lineTo(R, -R);
  shape.lineTo(R, R);
  shape.lineTo(-R, R);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-7, -16);
  hole.lineTo(-7, -2);
  hole.lineTo(7, -2);
  hole.lineTo(7, -16);
  hole.closePath();
  shape.holes.push(hole);
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape), std(0xffffff, { map: tex.grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // bercak rumput gelap/terang supaya padang tidak terlihat berulang
  const blotchCanvas = document.createElement('canvas');
  blotchCanvas.width = blotchCanvas.height = 128;
  const bctx = blotchCanvas.getContext('2d');
  const grad = bctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  bctx.fillStyle = grad;
  bctx.fillRect(0, 0, 128, 128);
  const blotchMap = new THREE.CanvasTexture(blotchCanvas);
  for (const [color, opacity, count] of [[0x2d5f2a, 0.28, 46], [0x9bc46a, 0.22, 34]]) {
    const items = Array.from({ length: count }, () => ({ x: (rand() - 0.5) * 190, y: 0.006, z: (rand() - 0.5) * 190, s: 9 + rand() * 22 }));
    const blot = instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blotchMap, color, transparent: true, opacity, depthWrite: false, fog: true }), items, { castShadow: false, receiveShadow: false });
    root.add(blot);
  }

  // paving
  const courtyard = std(0xffffff, { map: tex.stone, roughness: 0.85 });
  const pathMat = std(0xffffff, { map: tex.path, roughness: 0.85 });
  const asphalt = std(0xffffff, { map: tex.asphalt, roughness: 0.95 });
  flat([-42, -3, 42, 2], courtyard, 0.012, root, 4);
  flat([-42, 2, -7.5, 4], courtyard, 0.012, root, 4);
  flat([7.5, 2, 42, 4], courtyard, 0.012, root, 4);
  for (const z of world.zones) if (z.kind === 'parking') flat(z.rect, asphalt, 0.012, root, 4);
  flat([-2.5, 16, 2.5, 42], pathMat, 0.014, root, 3);
  flat([-5, 22, 5, 34], std(0xffffff, { map: tex.limestone, roughness: 0.8 }), 0.016, root, 3);
  for (const sx of [-2.55, 2.55]) block(0.14, 0.09, 26, mats.stoneCap, sx, 0.045, 29, root, { cast: false });
  for (const [w, d, x, z] of [[10.3, 0.14, 0, 22], [10.3, 0.14, 0, 34], [0.14, 12, -5.07, 28], [0.14, 12, 5.07, 28]]) block(w, 0.09, d, mats.stoneCap, x, 0.05, z, root, { cast: false });

  // lantai ruangan menurut jenisnya
  const floors = {
    hall: [std(0xe3dccb, { map: tex.marble, roughness: 0.22 }), 4],
    lobby: [std(0xeee8da, { map: tex.checker, roughness: 0.24 }), 4],
    suite: [std(0xf0d9b8, { map: tex.parquet, roughness: 0.45 }), 2],
    bridal: [std(0xf6e6dc, { map: tex.parquet, roughness: 0.45 }), 2],
    guest: [std(0xe6cfae, { map: tex.parquet, roughness: 0.5 }), 2],
    restaurant: [std(0xc9a37a, { map: tex.parquet, roughness: 0.5 }), 2],
    spa: [std(0xc6e8e3, { map: tex.marble, roughness: 0.24 }), 4],
    kitchen: [std(0xe3eaec, { map: tex.checker, roughness: 0.3 }), 4],
    corridor: [std(0xffffff, { map: tex.stone, roughness: 0.8 }), 4],
    stair: [std(0xe9e1d0, { map: tex.stone, roughness: 0.8 }), 4],
    lounge: [std(0xf3e4cc, { map: tex.parquet, roughness: 0.45 }), 2],
    library: [std(0xb08a62, { map: tex.parquet, roughness: 0.5 }), 2],
    terrace: [std(0xffffff, { map: tex.path, roughness: 0.85 }), 3],
  };
  const groundLevel = world.levels[0];
  buildFloors(groundLevel.rooms, 0, root, mats, floors);

  buildWalls(groundLevel.walls, groundLevel.rooms, groundLevel.doors, root, mats);
  const doorUpdaters = [buildDoorLeaves(groundLevel.doors, 0, root, mats)];
  buildPerimeter(world, root, mats, rand);
  buildHall(root, mats, rand);
  buildPoolAndGarden(root, mats, anim);
  buildPalms(world, root, mats);
  const hillMesh = buildGreenery(world, root, mats, rand);
  buildProps(groundLevel.props, root, mats, rand);
  buildLanterns(root, mats);
  buildCountryside(world, root, mats, rand);
  buildStairs(STAIRS.filter((s) => s.from === 0), root, mats);
  for (let level = 1; level < world.levels.length; level++) {
    const group = new THREE.Group();
    group.position.y = levelY(level);
    root.add(group);
    doorUpdaters.push(buildUpperLevel(level, world.levels[level], group, mats, floors, rand).updateDoors);
    buildStairs(STAIRS.filter((st) => st.from === level), group, mats);
  }
  buildRoofs(root, mats);
  buildChandeliers(root, mats);

  let clock = 0;
  return {
    root,
    /** actors = daftar avatar { x, z, y } (pemain lokal dan pemain lain) yang membuat pintu terbuka bila mendekat. */
    update(px, pz, delta = 0.016, actors = [], cam = null) {
      clock += delta;
      for (const updateDoors of doorUpdaters) updateDoors(actors, delta, cam);
      tex.waterNormal.offset.x += delta * 0.018;
      tex.waterNormal.offset.y += delta * 0.011;
      for (const fn of anim) fn(clock);
      sky.position.set(px, 0, pz); // langit mengikuti pemain agar horizon tidak pernah terkejar
      // bukit latar diam saat pemain di dalam vila, lalu ikut bergerak penuh setelah keluar (tidak pernah bisa dimasuki)
      const follow = Math.min(1, Math.max(0, (Math.hypot(px, pz) - 40) / 25));
      hillMesh.position.set(px * follow, 0, pz * follow);
      sun.position.set(px + SUN_DIR.x * 50, SUN_DIR.y * 50, pz + SUN_DIR.z * 50);
      sun.target.position.set(px, 0, pz);
      sun.target.updateMatrixWorld();
    },
  };
}
