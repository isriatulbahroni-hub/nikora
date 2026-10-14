import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG, LIMITS, TEMPLATE_KEYS, TEMPLATES, FORMAT, VERSION, validateProject, newProject, toWorld, propRect, footprint, weightOf, reachableCells, areaBounds, snap, normRot,
} from './world-project.js';
import { PROP_SPECS, PLAYER_RADIUS } from './villa-layout.js';

const base = (over = {}) => ({ format: FORMAT, version: VERSION, name: 'Uji', area: { halfX: 20, halfZ: 20 }, spawn: { x: 0, z: 10 }, props: [], ...over });
const codes = (r) => r.errors.map((e) => e.code);

test('katalog: ukuran tabrakan objek lama sama persis dengan mesin vila', () => {
  for (const [type, spec] of Object.entries(PROP_SPECS)) {
    if (!CATALOG[type]) continue;
    assert.equal(CATALOG[type].hx, spec.hx, type);
    assert.equal(CATALOG[type].hz, spec.hz, type);
  }
  for (const t of Object.keys(CATALOG)) assert.ok(CATALOG[t].weight > 0 && CATALOG[t].label, t);
});

test('setiap template lolos validasi, di bawah batas, ID unik, titik mulai terjangkau', () => {
  for (const key of TEMPLATE_KEYS) {
    const p = newProject(key);
    const r = validateProject(p);
    assert.equal(r.ok, true, `${key}: ${JSON.stringify(r.errors)}`);
    assert.ok(r.project.props.length <= LIMITS.maxProps, key);
    assert.ok(weightOf(r.project.props) <= LIMITS.budget, key);
    assert.equal(new Set(r.project.props.map((x) => x.id)).size, r.project.props.length, key);
    assert.ok(TEMPLATES[key].label && TEMPLATES[key].description, key);
  }
  assert.equal(newProject('tidak-ada').template, 'kosong');
  assert.equal(newProject('__proto__').template, 'kosong');
});

test('template aula: dinding menahan, pintu selatan terbuka, tidak ada celah sudut', () => {
  const w = toWorld(validateProject(newProject('aula')).project);
  // jalan lurus ke timur dari titik mulai: berhenti di dinding timur (x=20)
  let pos = { ...w.spawn, level: 0 };
  for (let i = 0; i < 200; i++) pos = w.move(pos, 0.5, 0);
  assert.ok(pos.x < 20, `menembus dinding timur: ${pos.x}`);
  // jalan lurus ke selatan lewat pintu (x=0): keluar ruangan melewati z=18
  pos = { ...w.spawn, level: 0 };
  for (let i = 0; i < 200; i++) pos = w.move(pos, 0, 0.5);
  assert.ok(pos.z > 18.5, `pintu selatan tertutup: ${pos.z}`);
  // keempat sudut: tidak bisa menyelinap keluar
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    let p = { x: sx * 19, z: sz * 17, level: 0 };
    for (let i = 0; i < 100; i++) p = w.move(p, sx * 0.5, sz * 0.5);
    if (sz < 0) assert.ok(Math.abs(p.x) < 20 && p.z > -18, `bocor di sudut utara ${sx},${sz}: ${p.x},${p.z}`);
    else assert.ok(Math.abs(p.x) < 20, `bocor di sudut selatan ${sx},${sz}: ${p.x},${p.z}`);
  }
});

test('validasi: bentuk dasar, format, versi, ukuran', () => {
  for (const bad of [null, undefined, 42, 'x', [], true]) assert.equal(validateProject(bad).ok, false);
  assert.ok(codes(validateProject({ ...base(), format: 'lain' })).includes('format'));
  assert.ok(codes(validateProject({ ...base(), version: 2 })).includes('versi'));
  const big = base({ props: [], note: 'x'.repeat(LIMITS.maxBytes) });
  assert.ok(codes(validateProject(big)).includes('ukuran'));
  const cyc = base(); cyc.self = cyc; // melingkar: tidak boleh melempar
  assert.equal(validateProject(cyc).ok, false);
});

test('validasi: nama, area, dan langit', () => {
  assert.ok(codes(validateProject(base({ name: '   ' }))).includes('nama'));
  assert.ok(codes(validateProject(base({ area: { halfX: 5, halfZ: 20 } }))).includes('area'));
  assert.ok(codes(validateProject(base({ area: { halfX: 20, halfZ: 9999 } }))).includes('area'));
  assert.ok(codes(validateProject(base({ area: { halfX: '20', halfZ: 20 } }))).includes('area'));
  const r = validateProject(base({ name: 'A\u0000\n B', sky: 'ungu' }));
  assert.equal(r.ok, true);
  assert.equal(r.project.name, 'A B');
  assert.equal(r.project.sky, 'siang');
  assert.ok(r.warnings.some((w) => w.code === 'langit'));
});

test('validasi: objek berbahaya atau rusak ditolak', () => {
  const one = (p) => validateProject(base({ props: [p] }));
  for (const type of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'rumah', '', 5, null]) {
    assert.ok(codes(one({ id: 'a', type, x: 0, z: 0 })).includes('jenis'), String(type));
  }
  for (const [x, z] of [[NaN, 0], [Infinity, 0], ['3', 0], [0, null], [undefined, 1]]) {
    assert.ok(codes(one({ id: 'a', type: 'table', x, z })).includes('posisi'), `${x},${z}`);
  }
  assert.ok(codes(one({ id: 'a', type: 'table', x: 0, z: 0, rot: 1.5 })).includes('putar'));
  assert.ok(codes(one({ id: '../x', type: 'table', x: 0, z: 0 })).includes('id'));
  assert.ok(codes(one({ id: 'a'.repeat(41), type: 'table', x: 0, z: 0 })).includes('id'));
  assert.ok(codes(one('teks')).includes('objek'));
  assert.ok(codes(validateProject(base({ props: [{ id: 'a', type: 'table', x: 0, z: 0 }, { id: 'a', type: 'sofa', x: 5, z: 0 }] }))).includes('id_ganda'));
  assert.ok(codes(one({ id: 'a', type: 'palm', x: 19.9, z: 0 })).includes('di_luar'));
  assert.ok(codes(validateProject(base({ props: 'bukan-larik' }))).includes('props'));
});

test('validasi: batas jumlah dan anggaran beban', () => {
  const many = Array.from({ length: LIMITS.maxProps + 1 }, (_, i) => ({ id: `o${i}`, type: 'tree', x: 0, z: 0 }));
  assert.ok(codes(validateProject(base({ props: many }))).includes('jumlah'));
  const heavy = Array.from({ length: 260 }, (_, i) => ({ id: `c${i}`, type: 'car', x: (i % 16) * 2 - 15, z: Math.floor(i / 16) - 8 })); // 260*6 = 1560
  const r = validateProject(base({ area: { halfX: 40, halfZ: 40 }, props: heavy }));
  assert.ok(codes(r).includes('anggaran'), JSON.stringify(codes(r)));
});

test('validasi: titik mulai harus di dalam, tidak tertutup, tidak terkurung', () => {
  assert.ok(codes(validateProject(base({ spawn: { x: 99, z: 0 } }))).includes('spawn_luar'));
  assert.ok(codes(validateProject(base({ spawn: undefined }))).includes('spawn'));
  assert.ok(codes(validateProject(base({ spawn: { x: 0, z: 0 }, props: [{ id: 'a', type: 'table', x: 0, z: 0 }] }))).includes('spawn_terhalang'));
  const ring = [[-3, 0, 1], [3, 0, 1], [0, -3, 0], [0, 3, 0]].map(([x, z, rot], i) => ({ id: `w${i}`, type: 'wall', x, z, rot }));
  assert.ok(codes(validateProject(base({ spawn: { x: 0, z: 0 }, props: ring }))).includes('spawn_terkurung'));
});

test('validasi: tumpang tindih hanya peringatan; dinding bersambung tidak diperingatkan', () => {
  const r = validateProject(base({ props: [{ id: 'a', type: 'table', x: 0, z: 0 }, { id: 'b', type: 'table', x: 0.5, z: 0 }], spawn: { x: 10, z: 10 } }));
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.code === 'tumpang_tindih'));
  const walls = validateProject(base({ props: [{ id: 'a', type: 'wall', x: 0, z: 0 }, { id: 'b', type: 'wall', x: 4, z: 0 }], spawn: { x: 10, z: 10 } }));
  assert.equal(walls.warnings.length, 0);
});

test('keluaran dibersihkan: kolom asing dibuang, angka dibulatkan, tanpa berbagi referensi', () => {
  const input = base({ evil: { x: 1 }, props: [{ id: 'a', type: 'table', x: 1.23456, z: 2.98765, rot: 5, hack: 'x' }] });
  const r = validateProject(input);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.project).sort(), ['area', 'format', 'name', 'props', 'sky', 'spawn', 'template', 'version']);
  assert.deepEqual(r.project.props[0], { id: 'a', type: 'table', x: 1.23, z: 2.99, rot: 1 });
  r.project.props[0].x = 99;
  assert.equal(input.props[0].x, 1.23456);
  assert.equal(({}).evil, undefined);
});

test('ID tanpa nilai dibuatkan; JSON dengan __proto__ tidak mencemari', () => {
  const r = validateProject(JSON.parse('{"format":"orbit.world","version":1,"name":"x","area":{"halfX":20,"halfZ":20},"spawn":{"x":0,"z":10},"props":[{"type":"tree","x":5,"z":5}],"__proto__":{"admin":true}}'));
  assert.equal(r.ok, true);
  assert.equal(r.project.props[0].id, 'o1');
  assert.equal(({}).admin, undefined);
});

test('putaran 90 derajat menukar jejak; snap dan normRot', () => {
  assert.deepEqual(footprint('bed', 0), { hx: 0.95, hz: 1.1 });
  assert.deepEqual(footprint('bed', 1), { hx: 1.1, hz: 0.95 });
  assert.deepEqual(footprint('bed', 5), footprint('bed', 1));
  assert.deepEqual(propRect({ type: 'wall', x: 10, z: 0, rot: 1 }), { minX: 9.85, maxX: 10.15, minZ: -2, maxZ: 2 });
  assert.equal(snap(1.26), 1.5);
  assert.equal(snap(-0.2), -0);
  assert.equal(normRot(-1), 3);
  assert.equal(normRot(4), 0);
});

test('dunia hasil proyek: antarmuka server, tabrakan, titik duduk/tidur', () => {
  const w = toWorld(validateProject(newProject('taman')).project);
  for (const k of ['constrain', 'move', 'spawn', 'spots', 'sitRange', 'bounds', 'limit', 'colliders', 'radius']) assert.ok(k in w, k);
  assert.equal(w.spots.filter((s) => s.kind === 'sit').length, 6 * 4 + 2 * 2);
  assert.ok(w.canStand(0, w.spawn.x, w.spawn.z));
  assert.equal(w.canStand(0, 0, -10), false, 'di dalam meja');
  const c = w.constrain({ x: 500, z: 500 });
  assert.ok(c.x <= w.bounds.maxX - PLAYER_RADIUS + 1e-9 && c.z <= w.bounds.maxZ - PLAYER_RADIUS + 1e-9);
  const bed = toWorld(validateProject(base({ props: [{ id: 'b', type: 'bed', x: 0, z: 0, rot: 2 }, { id: 's', type: 'sofa', x: 8, z: 0, rot: 1 }], spawn: { x: -8, z: 10 } })).project);
  assert.deepEqual(bed.spots.map((s) => s.kind), ['sit', 'sit', 'sleep']);
  assert.ok(Math.abs(bed.spots[0].z - -0.55) < 1e-9 && Math.abs(bed.spots[0].x - 8) < 1e-9, 'sofa diputar: titik duduk searah sumbu z');
  assert.equal(Object.isFrozen(w), true);
});

test('server benar-benar bisa memakai dunia proyek (Room)', async () => {
  const { Room } = await import('../../server/src/room.js');
  const world = toWorld(validateProject(newProject('taman')).project);
  const room = new Room({ world, maxPlayers: 50 });
  for (let i = 0; i < 10; i++) {
    const p = room.addPlayer(`p${i}`, `P${i}`);
    assert.ok(world.canStand(0, p.x, p.z), `spawn ${i} terhalang`);
  }
  const p = room.players.get('p3');
  room.setInput('p3', { x: 1, z: 0, rot: 0, seq: 1 });
  for (let i = 0; i < 600; i++) room.step(0.05);
  assert.ok(world.canStand(0, p.x, p.z), 'berakhir di dalam penghalang');
  assert.ok(p.x <= world.bounds.maxX - PLAYER_RADIUS + 1e-6, 'tidak menembus batas area');
});

test('reachableCells berhenti lebih awal dan menghitung ruang tertutup', () => {
  const b = areaBounds({ halfX: 20, halfZ: 20 });
  assert.equal(reachableCells({ x: 0, z: 0 }, [], b, 50), 50);
  const ring = [[-3, 0, 1], [3, 0, 1], [0, -3, 0], [0, 3, 0]].map(([x, z, rot]) => propRect({ type: 'wall', x, z, rot }));
  assert.ok(reachableCells({ x: 0, z: 0 }, ring, b, 1000) < 100);
});
