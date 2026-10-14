// Format proyek dunia buatan kreator (Fase 9). Murni data + matematika, tanpa THREE, supaya dipakai bersama oleh
// editor (klien), pemuat dunia, dan server (validasi ulang: server tidak boleh percaya data dari klien).
//
// Satuan meter. x ke timur, z ke selatan (utara = -z), sama dengan villa-layout.js.
// Hanya objek dari KATALOG yang boleh dipakai; tabrakan memakai ukuran PROP_SPECS yang sama dengan mesin vila,
// jadi apa yang dilihat kreator saat menguji sama dengan yang dirasakan tamu.
import { PROP_SPECS, PLAYER_RADIUS, SIT_RANGE, resolveMove, moveWithCollisions, findNearestSpot } from './villa-layout.js';

export const FORMAT = 'orbit.world';
export const VERSION = 1;

/** Batas keras. Anggaran (budget) adalah perkiraan beban render, bukan hasil pengukuran perangkat nyata. */
export const LIMITS = Object.freeze({
  maxProps: 400,
  budget: 1500, // jumlah bobot semua objek
  maxBytes: 200_000, // ukuran JSON proyek
  nameMax: 60,
  idMax: 40,
  halfMin: 10,
  halfMax: 120,
  minReachableCells: 100, // luas minimal yang bisa dijangkau dari titik mulai (sel 0,5 m)
  maxWarnings: 20,
});

export const GRID = 0.5;
export const SKIES = Object.freeze(['siang', 'senja', 'malam']);

/** Objek yang boleh ditempatkan. `weight` = bobot beban render; `spots` = titik duduk/tidur yang dihasilkan. */
export const CATALOG = Object.freeze({
  table: { label: 'Meja bundar', group: 'Furnitur', weight: 2, ...PROP_SPECS.table },
  sofa: { label: 'Sofa', group: 'Furnitur', weight: 2, ...PROP_SPECS.sofa },
  bed: { label: 'Tempat tidur', group: 'Furnitur', weight: 3, ...PROP_SPECS.bed },
  lounger: { label: 'Kursi santai', group: 'Furnitur', weight: 2, ...PROP_SPECS.lounger },
  desk: { label: 'Meja resepsi', group: 'Furnitur', weight: 2, ...PROP_SPECS.desk },
  counter: { label: 'Counter', group: 'Furnitur', weight: 2, ...PROP_SPECS.counter },
  tub: { label: 'Bak spa', group: 'Furnitur', weight: 3, ...PROP_SPECS.tub },
  stage: { label: 'Pelaminan', group: 'Bangunan', weight: 4, hx: 3, hz: 1.5 },
  wall: { label: 'Dinding', group: 'Bangunan', weight: 1, hx: 2, hz: 0.15 },
  palm: { label: 'Pohon palem', group: 'Taman', weight: 4, ...PROP_SPECS.palm },
  tree: { label: 'Pohon rindang', group: 'Taman', weight: 3, ...PROP_SPECS.tree },
  car: { label: 'Mobil', group: 'Taman', weight: 6, ...PROP_SPECS.car },
});
export const PROP_TYPES = Object.freeze(Object.keys(CATALOG));
export const isType = (t) => typeof t === 'string' && Object.hasOwn(CATALOG, t);

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const round2 = (n) => Math.round(n * 100) / 100;
export const snap = (n, step = GRID) => Math.round(n / step) * step;
export const normRot = (r) => ((Math.round(r) % 4) + 4) % 4;

/** Setengah ukuran jejak objek setelah diputar (rot = jumlah putaran 90 derajat). */
export function footprint(type, rot = 0) {
  const s = CATALOG[type];
  return normRot(rot) % 2 === 0 ? { hx: s.hx, hz: s.hz } : { hx: s.hz, hz: s.hx };
}

export function propRect(p) {
  const f = footprint(p.type, p.rot);
  return { minX: p.x - f.hx, maxX: p.x + f.hx, minZ: p.z - f.hz, maxZ: p.z + f.hz };
}

const overlaps = (a, b, eps = 0.05) => a.minX < b.maxX - eps && a.maxX > b.minX + eps && a.minZ < b.maxZ - eps && a.maxZ > b.minZ + eps;

export const areaBounds = (area) => ({ minX: -area.halfX, maxX: area.halfX, minZ: -area.halfZ, maxZ: area.halfZ });
export const weightOf = (props) => props.reduce((n, p) => n + (CATALOG[p.type]?.weight ?? 0), 0);

// ------------------------------------------------------------------ validasi

const err = (path, code, msg) => ({ path, code, msg });
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isPlain = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

/**
 * Validasi + bersihkan proyek dari sumber yang tidak tepercaya (berkas impor, database, klien).
 * Hasil `project` hanya berisi kolom yang dikenal (kolom asing dibuang), angka dibulatkan, dan tidak berbagi
 * referensi dengan masukan. `errors` memblokir simpan-versi/pengajuan; `warnings` hanya peringatan.
 */
export function validateProject(raw) {
  const errors = [];
  const warnings = [];
  const fail = () => ({ ok: false, errors, warnings, project: null });

  if (!isPlain(raw)) { errors.push(err('', 'bentuk', 'Proyek harus berupa objek.')); return fail(); }
  let bytes;
  try { bytes = JSON.stringify(raw).length; } catch { errors.push(err('', 'bentuk', 'Proyek tidak dapat dibaca.')); return fail(); }
  if (bytes > LIMITS.maxBytes) { errors.push(err('', 'ukuran', `Proyek terlalu besar (${Math.round(bytes / 1000)} KB, batas ${Math.round(LIMITS.maxBytes / 1000)} KB).`)); return fail(); }
  if (raw.format !== FORMAT) errors.push(err('format', 'format', 'Bukan berkas proyek dunia ORBIT.'));
  if (raw.version !== VERSION) errors.push(err('version', 'versi', `Versi format ${String(raw.version)} tidak didukung (didukung: ${VERSION}).`));
  if (errors.length) return fail();

  const name = typeof raw.name === 'string' ? raw.name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.nameMax) : '';
  if (!name) errors.push(err('name', 'nama', 'Nama dunia wajib diisi.'));

  const a = isPlain(raw.area) ? raw.area : {};
  const area = { halfX: round2(Number(a.halfX)), halfZ: round2(Number(a.halfZ)) };
  for (const k of ['halfX', 'halfZ']) {
    if (!isNum(a[k]) || a[k] < LIMITS.halfMin || a[k] > LIMITS.halfMax) errors.push(err(`area.${k}`, 'area', `Setengah ukuran area harus ${LIMITS.halfMin}-${LIMITS.halfMax} m.`));
  }

  const sky = SKIES.includes(raw.sky) ? raw.sky : 'siang';
  if (raw.sky !== undefined && !SKIES.includes(raw.sky)) warnings.push(err('sky', 'langit', 'Pengaturan langit tidak dikenal, dipakai "siang".'));
  const template = typeof raw.template === 'string' && /^[a-z0-9_-]{1,30}$/.test(raw.template) ? raw.template : 'kosong';

  const props = [];
  const list = Array.isArray(raw.props) ? raw.props : null;
  if (!list) errors.push(err('props', 'props', 'Daftar objek tidak ditemukan.'));
  else if (list.length > LIMITS.maxProps) errors.push(err('props', 'jumlah', `Terlalu banyak objek (${list.length}, batas ${LIMITS.maxProps}).`));
  else {
    const ids = new Set();
    const boundsOk = !errors.some((e) => e.code === 'area');
    list.forEach((p, i) => {
      const path = `props[${i}]`;
      if (!isPlain(p)) { errors.push(err(path, 'objek', 'Objek tidak valid.')); return; }
      if (!isType(p.type)) { errors.push(err(`${path}.type`, 'jenis', `Jenis objek tidak ada di katalog: ${String(p.type).slice(0, 30)}.`)); return; }
      if (!isNum(p.x) || !isNum(p.z)) { errors.push(err(path, 'posisi', 'Posisi objek harus angka.')); return; }
      if (p.rot !== undefined && !Number.isInteger(p.rot)) { errors.push(err(`${path}.rot`, 'putar', 'Putaran harus bilangan bulat (kelipatan 90 derajat).')); return; }
      let id = p.id;
      if (id === undefined) id = `o${i + 1}`;
      if (typeof id !== 'string' || !ID_RE.test(id)) { errors.push(err(`${path}.id`, 'id', 'ID objek tidak valid.')); return; }
      if (ids.has(id)) { errors.push(err(`${path}.id`, 'id_ganda', `ID objek ganda: ${id}.`)); return; }
      ids.add(id);
      const prop = { id, type: p.type, x: round2(p.x), z: round2(p.z), rot: normRot(p.rot ?? 0) };
      if (boundsOk) {
        const r = propRect(prop);
        const b = areaBounds(area);
        if (r.minX < b.minX || r.maxX > b.maxX || r.minZ < b.minZ || r.maxZ > b.maxZ) errors.push(err(path, 'di_luar', `${CATALOG[p.type].label} berada di luar area dunia.`));
      }
      props.push(prop);
    });
  }

  const budget = weightOf(props);
  if (budget > LIMITS.budget) errors.push(err('props', 'anggaran', `Beban dunia ${budget} melebihi anggaran ${LIMITS.budget}. Kurangi objek berat (mobil, pohon).`));

  const sp = isPlain(raw.spawn) ? raw.spawn : {};
  const spawn = { x: round2(Number(sp.x)), z: round2(Number(sp.z)) };
  if (!isNum(sp.x) || !isNum(sp.z)) errors.push(err('spawn', 'spawn', 'Titik mulai pemain wajib ada.'));

  const project = { format: FORMAT, version: VERSION, name, template, area, sky, spawn, props };

  if (!errors.some((e) => ['area', 'spawn', 'props', 'jumlah', 'objek', 'jenis', 'posisi', 'id', 'id_ganda'].includes(e.code))) {
    const colliders = props.map(propRect);
    const b = areaBounds(area);
    if (spawn.x < b.minX + PLAYER_RADIUS || spawn.x > b.maxX - PLAYER_RADIUS || spawn.z < b.minZ + PLAYER_RADIUS || spawn.z > b.maxZ - PLAYER_RADIUS) {
      errors.push(err('spawn', 'spawn_luar', 'Titik mulai berada di luar area dunia.'));
    } else if (!walkable(spawn.x, spawn.z, colliders, b)) {
      errors.push(err('spawn', 'spawn_terhalang', 'Titik mulai tertutup objek. Pindahkan objek atau titik mulai.'));
    } else if (reachableCells(spawn, colliders, b, LIMITS.minReachableCells) < LIMITS.minReachableCells) {
      errors.push(err('spawn', 'spawn_terkurung', 'Pemain terkurung di titik mulai. Beri jalan keluar.'));
    }
    for (let i = 0; i < props.length && warnings.length < LIMITS.maxWarnings; i++) {
      for (let j = i + 1; j < props.length && warnings.length < LIMITS.maxWarnings; j++) {
        const ta = props[i].type;
        const tb = props[j].type;
        if (ta === 'wall' && tb === 'wall') continue; // dinding bersambung memang bersentuhan
        if (overlaps(colliders[i], colliders[j])) warnings.push(err(`props[${i}]`, 'tumpang_tindih', `${CATALOG[ta].label} dan ${CATALOG[tb].label} saling menumpuk.`));
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings, project: errors.length === 0 ? project : null, sanitized: project };
}

function walkable(x, z, colliders, bounds) {
  const r = PLAYER_RADIUS;
  if (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r) return false;
  return !colliders.some((c) => x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r);
}

/** Banyak sel (0,5 m) yang bisa dijangkau dari `from`; berhenti lebih awal di `cap` agar murah. */
export function reachableCells(from, colliders, bounds, cap = Infinity) {
  const key = (i, j) => `${i},${j}`;
  const start = [Math.round(from.x / GRID), Math.round(from.z / GRID)];
  const seen = new Set([key(...start)]);
  const queue = [start];
  while (queue.length && seen.size < cap) {
    const [i, j] = queue.shift();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      const k = key(ni, nj);
      if (seen.has(k) || !walkable(ni * GRID, nj * GRID, colliders, bounds)) continue;
      seen.add(k);
      queue.push([ni, nj]);
    }
  }
  return seen.size;
}

// ------------------------------------------------------------------ dunia yang bisa dimainkan

/**
 * Ubah proyek (yang sudah lolos validateProject) menjadi objek dunia dengan antarmuka yang dipakai server
 * (`constrain`, `move`, `spawn`, `spots`, `sitRange`) dan mode uji di editor. Satu lantai, area dibatasi.
 */
export function toWorld(project) {
  const props = project.props.map((p) => ({ ...p, level: 0 }));
  const colliders = props.map(propRect);
  const bounds = areaBounds(project.area);
  const spots = [];
  for (const t of props.filter((p) => p.type === 'table')) {
    for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) spots.push({ kind: 'sit', x: t.x + dx, z: t.z + dz, rot: Math.atan2(dx, dz), level: 0 });
  }
  for (const s of props.filter((p) => p.type === 'sofa')) {
    const along = s.rot % 2 === 0 ? [[-0.55, 0], [0.55, 0]] : [[0, -0.55], [0, 0.55]];
    const rot = (s.rot * Math.PI) / 2;
    for (const [dx, dz] of along) spots.push({ kind: 'sit', x: s.x + dx, z: s.z + dz, rot, level: 0 });
  }
  for (const b of props.filter((p) => p.type === 'bed')) spots.push({ kind: 'sleep', x: b.x, z: b.z, rot: (b.rot * Math.PI) / 2, level: 0 });
  const numbered = spots.map((s, id) => ({ id, ...s }));

  return Object.freeze({
    name: project.name,
    bounds,
    limit: bounds,
    spawn: project.spawn,
    radius: PLAYER_RADIUS,
    props,
    allProps: props,
    colliders,
    spots: numbered,
    sitRange: SIT_RANGE,
    sky: project.sky,
    constrain: (pos) => resolveMove(pos, PLAYER_RADIUS, colliders, bounds),
    move: (pos, dx, dz) => {
      const next = moveWithCollisions(pos, dx, dz, PLAYER_RADIUS, colliders, bounds);
      return { x: next.x, z: next.z, level: 0, stair: null, y: 0 };
    },
    canStand: (_level, x, z) => walkable(x, z, colliders, bounds),
    nearestSpot: (pos, occupied) => findNearestSpot({ ...pos, level: 0 }, numbered, occupied),
  });
}

// ------------------------------------------------------------------ template

function builder(name, template, halfX, halfZ, spawn) {
  const props = [];
  const add = (type, x, z, rot = 0) => { props.push({ id: `o${props.length + 1}`, type, x, z, rot }); };
  const project = () => ({ format: FORMAT, version: VERSION, name, template, area: { halfX, halfZ }, sky: 'siang', spawn, props });
  return { add, project };
}

export const TEMPLATES = Object.freeze({
  kosong: {
    label: 'Lahan kosong',
    description: 'Mulai dari nol: area terbuka tanpa objek.',
    build: () => builder('Dunia baru', 'kosong', 30, 30, { x: 0, z: 22 }).project(),
  },
  taman: {
    label: 'Resepsi taman',
    description: 'Pelaminan di utara, meja tamu, sofa, dan palem di sekeliling.',
    build: () => {
      const b = builder('Resepsi taman', 'taman', 30, 30, { x: 0, z: 24 });
      b.add('stage', 0, -23.5);
      for (const x of [-10, 0, 10]) for (const z of [-10, -2]) b.add('table', x, z);
      b.add('sofa', -14, 8); b.add('sofa', 14, 8);
      for (let x = -26; x <= 26; x += 8) { b.add('palm', x, -27.5); }
      for (let z = -18; z <= 22; z += 8) { b.add('palm', -27.5, z); b.add('palm', 27.5, z); }
      return b.project();
    },
  },
  aula: {
    label: 'Aula tertutup',
    description: 'Ruangan berdinding dengan pintu di selatan, pelaminan, dan meja.',
    build: () => {
      const b = builder('Aula resepsi', 'aula', 24, 20, { x: 0, z: 14 });
      for (let x = -18; x <= 18; x += 4) { b.add('wall', x, -18); if (Math.abs(x) >= 6) b.add('wall', x, 18); } // pintu selatan 8 m
      for (let z = -16; z <= 16; z += 4) { b.add('wall', -20, z, 1); b.add('wall', 20, z, 1); } // menutup sampai sudut (±18 m)
      b.add('stage', 0, -15);
      for (const x of [-9, 0, 9]) for (const z of [-7, 1]) b.add('table', x, z);
      b.add('desk', 14, 13);
      return b.project();
    },
  },
});
export const TEMPLATE_KEYS = Object.freeze(Object.keys(TEMPLATES));
export const newProject = (template = 'kosong') => TEMPLATES[Object.hasOwn(TEMPLATES, template) ? template : 'kosong'].build();
