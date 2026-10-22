import * as THREE from 'three';
import { ARENA, CITY_HEIGHTS, CITY_TINTS, FIELD, SATELLITES, TILE_HEIGHT, cityBuildings, forestTrees } from './hotel-surroundings-data.js';

// Sekitar NIKORA Grand Hotel (THREE): lima menara satelit kaca, kota mid-rise, arena berkubah + lapangan, dan hutan kota.
// Geometri dari hotel-surroundings-data.js. Semuanya InstancedMesh atau beberapa mesh besar (sekitar 40 draw call).
// Fasad memakai satu tekstur bay bermipmap, bukan batang tipis, supaya tidak berkedip dari jauh (pelajaran hotel-facade.js).
// Hanya tampilan: tidak ada penghalang bagi pemain dan mobil. Jendela menyala di malam hari lewat setNight(0..1).

const SRGB = THREE.SRGBColorSpace;
const SAT_TILE = 8.4; // dua lantai hotel (4,2 m) = satu ulangan tekstur pada menara satelit
const TREE_TONES = [0x2f6f3a, 0x3c8044, 0x27603a, 0x4a8f46, 0x356d3f];

/** Dua kanvas 256 x 128 (4 bay x 2 lantai): fasad siang dan peta jendela menyala (acak, deterministik). */
function facadeCanvases() {
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    return c;
  };
  const day = mk();
  const lit = mk();
  const g = day.getContext('2d');
  const e = lit.getContext('2d');
  g.fillStyle = '#aab7c2'; // rangka dan tiang antar kaca
  g.fillRect(0, 0, 256, 128);
  e.fillStyle = '#000';
  e.fillRect(0, 0, 256, 128);
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let f = 0; f < 2; f++) {
    for (let b = 0; b < 4; b++) {
      const x = b * 64;
      const y = f * 64;
      g.fillStyle = '#cfd6dc'; // pelat lantai
      g.fillRect(x, y + 43, 64, 21);
      const grad = g.createLinearGradient(0, y + 5, 0, y + 41);
      grad.addColorStop(0, '#5b7894');
      grad.addColorStop(1, '#38526b');
      g.fillStyle = grad;
      g.fillRect(x + 5, y + 5, 54, 36);
      if (rnd() < 0.55) {
        e.fillStyle = rnd() < 0.5 ? '#ffd9a0' : '#fff0d0';
        e.fillRect(x + 5, y + 5, 54, 36);
      }
    }
  }
  return { day, lit };
}

/** Kanvas lapangan: garis rumput bergantian dan marka putih (1 m = 10 px). */
function fieldCanvas() {
  const S = 10;
  const c = document.createElement('canvas');
  c.width = FIELD.width * S;
  c.height = FIELD.depth * S;
  const g = c.getContext('2d');
  const stripes = 14;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? '#4f9a4a' : '#58a653';
    g.fillRect((c.width / stripes) * i, 0, c.width / stripes + 1, c.height);
  }
  g.strokeStyle = '#f2f2ea';
  g.lineWidth = 5;
  const inset = 14;
  g.strokeRect(inset, inset, c.width - inset * 2, c.height - inset * 2);
  g.beginPath();
  g.moveTo(c.width / 2, inset);
  g.lineTo(c.width / 2, c.height - inset);
  g.stroke();
  g.beginPath();
  g.arc(c.width / 2, c.height / 2, 9.15 * S, 0, Math.PI * 2);
  g.stroke();
  const box = (depthM, widthM, left) => {
    const bw = depthM * S;
    const bh = widthM * S;
    g.strokeRect(left ? inset : c.width - inset - bw, (c.height - bh) / 2, bw, bh);
  };
  box(16.5, 40.3, true);
  box(16.5, 40.3, false);
  box(5.5, 18.3, true);
  box(5.5, 18.3, false);
  return c;
}

/** Kotak satuan (x, z dalam -0,5..0,5; y dalam 0..1): empat sisi (grup 0, UV 0..1) lalu atap (grup 1). Diskalakan per gedung. */
function towerBoxGeometry() {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const quad = (a, b, c, d, n) => {
    const o = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    for (let i = 0; i < 4; i++) nor.push(...n);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  quad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5], [0, 0, 1]);
  quad([0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5], [0, 0, -1]);
  quad([0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5], [1, 0, 0]);
  quad([-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5], [-1, 0, 0]);
  quad([-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5], [0, 1, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, 24, 0);
  g.addGroup(24, 6, 1);
  return g;
}

/**
 * Bangun semua sekitar hotel ke `scene`. Mengembalikan { root, info(), setNight(k), dispose() }.
 * `low`: mode ringan (?q=low), hanya separuh pohon dan kubah/pohon dengan lebih sedikit segi.
 */
export function buildHotelSurroundings(scene, { anisotropy = 8, low = false } = {}) {
  const root = new THREE.Group();
  root.name = 'nikora-surroundings';
  scene.add(root);
  const materials = [];
  const textures = [];
  const glowMaterials = []; // bahan fasad yang jendelanya menyala di malam hari
  const std = (color, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
    materials.push(m);
    return m;
  };
  const decal = (color, map = null) => {
    const m = new THREE.MeshLambertMaterial({ color, map, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    materials.push(m);
    return m;
  };
  const tex = (canvas, rx = 1, ry = 1) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = SRGB;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = anisotropy;
    textures.push(t);
    return t;
  };
  const { day, lit } = facadeCanvases();
  const facade = (rx, ry, o = {}) => {
    const m = std(0xffffff, { map: tex(day, rx, ry), emissiveMap: tex(lit, rx, ry), emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.5, metalness: 0.2, ...o });
    glowMaterials.push(m);
    return m;
  };
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const P = new THREE.Vector3();
  const SC = new THREE.Vector3();
  const COL = new THREE.Color();
  const finish = (mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
    return mesh;
  };

  // ---- kota mid-rise: satu InstancedMesh per tinggi (UV tekstur mengikuti tinggi, jadi jendela tidak melar)
  const city = cityBuildings();
  const towerGeo = towerBoxGeometry();
  const roofMat = std(0x8d9299, { roughness: 0.9 });
  CITY_HEIGHTS.forEach((h, bucket) => {
    const items = city.filter((b) => b.bucket === bucket);
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(towerGeo, [facade(1, h / TILE_HEIGHT), roofMat], items.length);
    items.forEach((b, i) => {
      mesh.setMatrixAt(i, M.compose(P.set(b.x, 0, b.z), Q.identity(), SC.set(b.w, h, b.d)));
      mesh.setColorAt(i, COL.setHex(CITY_TINTS[b.tint]));
    });
    mesh.name = `city-${h}`;
    finish(mesh);
  });

  // ---- menara satelit: silinder 12 sisi meruncing (berfaset), satu ulangan tekstur per sisi, jarum di puncak
  const capMat = std(0xcfd8e0, { roughness: 0.4, metalness: 0.4 });
  const spireGeo = new THREE.ConeGeometry(1, 1, 8);
  const spires = new THREE.InstancedMesh(spireGeo, std(0xe6edf3, { roughness: 0.3, metalness: 0.5 }), SATELLITES.length);
  SATELLITES.forEach((s, i) => {
    const geo = new THREE.CylinderGeometry(s.radius * s.taper, s.radius, s.height, s.sides, 1);
    const mesh = new THREE.Mesh(geo, [facade(s.sides, s.height / SAT_TILE, { color: 0xbfd8ee, flatShading: true, metalness: 0.15, roughness: 0.35 }), capMat, capMat]);
    mesh.position.set(s.x, s.height / 2, s.z);
    mesh.name = s.id;
    root.add(mesh);
    const h = s.height * 0.14;
    spires.setMatrixAt(i, M.compose(P.set(s.x, s.height + h / 2, s.z), Q.identity(), SC.set(s.radius * s.taper * 0.12, h, s.radius * s.taper * 0.12)));
  });
  spires.name = 'satellite-spires';
  finish(spires);

  // ---- arena berkubah: paving, dinding, kubah, dan cincin lampu di tepi atap
  const arena = new THREE.Group();
  arena.name = 'arena';
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(ARENA.plaza, low ? 32 : 56).rotateX(-Math.PI / 2), decal(0xcfc6b2));
  plaza.position.set(ARENA.x, 0.04, ARENA.z);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(ARENA.radius, ARENA.radius + 2, ARENA.wallHeight, low ? 32 : 56), std(0xd7dce2, { roughness: 0.75 }));
  wall.position.set(ARENA.x, ARENA.wallHeight / 2, ARENA.z);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, low ? 32 : 56, low ? 10 : 18, 0, Math.PI * 2, 0, Math.PI / 2), std(0xe9eef4, { roughness: 0.3, metalness: 0.35 }));
  dome.scale.set(ARENA.radius - 2, ARENA.domeHeight, ARENA.radius - 2);
  dome.position.set(ARENA.x, ARENA.wallHeight, ARENA.z);
  const rimMat = std(0xdfe8f2, { emissive: 0xfff0c8, emissiveIntensity: 0, roughness: 0.5 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(ARENA.radius - 0.5, 0.9, 8, low ? 32 : 64).rotateX(Math.PI / 2), rimMat);
  rim.position.set(ARENA.x, ARENA.wallHeight + 0.2, ARENA.z);
  arena.add(plaza, wall, dome, rim);
  root.add(arena);

  // ---- lapangan rumput bergaris
  const fieldTex = tex(fieldCanvas());
  const field = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.width, FIELD.depth).rotateX(-Math.PI / 2), decal(0xffffff, fieldTex));
  field.position.set(FIELD.x, 0.06, FIELD.z);
  field.name = 'field';
  root.add(field);

  // ---- hutan kota: batang dan tajuk, masing-masing satu InstancedMesh
  const all = forestTrees();
  const trees = low ? all.slice(0, Math.ceil(all.length / 2)) : all;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.8, 1, 7).translate(0, 0.5, 0), std(0x6b4a2f), trees.length);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, low ? 0 : 1), std(0xffffff, { roughness: 0.9, flatShading: true }), trees.length);
  trees.forEach((t, i) => {
    trunks.setMatrixAt(i, M.compose(P.set(t.x, 0, t.z), Q.identity(), SC.set(0.7, t.trunk, 0.7)));
    crowns.setMatrixAt(i, M.compose(P.set(t.x, t.trunk + t.crown * 0.7, t.z), Q.identity(), SC.set(t.crown, t.crown * 0.9, t.crown)));
    crowns.setColorAt(i, COL.setHex(TREE_TONES[t.tone]));
  });
  trunks.name = 'forest-trunks';
  crowns.name = 'forest-crowns';
  finish(trunks);
  finish(crowns);

  let night = -1;
  return {
    root,
    info: () => ({ satellites: SATELLITES.length, cityBuildings: city.length, trees: trees.length, meshes: root.children.length, night }),
    /** Jendela kota dan menara satelit menyala (0 = siang, 1 = malam penuh). Murah: tidak berbuat apa-apa bila nilainya tidak berubah. */
    setNight(k) {
      const v = Math.round(Math.min(1, Math.max(0, k)) * 100) / 100;
      if (v === night) return;
      night = v;
      for (const m of glowMaterials) m.emissiveIntensity = v * 0.9;
      rimMat.emissiveIntensity = v * 1.6;
    },
    dispose() {
      scene.remove(root);
      root.traverse((o) => o.geometry?.dispose?.());
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}
