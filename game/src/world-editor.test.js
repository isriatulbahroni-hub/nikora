import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, openProject } from './world-editor.js';
import { newProject, LIMITS, validateProject, CATALOG } from './world-project.js';

const fresh = (t = 'kosong') => createEditor(newProject(t));

test('buka proyek: rusak ditolak, masalah yang bisa diperbaiki tetap boleh dibuka', () => {
  assert.equal(openProject({ format: 'lain' }).ok, false);
  assert.equal(openProject('x').ok, false);
  const blocked = newProject('kosong');
  blocked.props.push({ id: 'a', type: 'table', x: 0, z: 22 }); // menutup titik mulai
  const r = openProject(blocked);
  assert.equal(r.ok, true);
  assert.ok(r.errors.some((e) => e.code === 'spawn_terhalang'));
  assert.throws(() => createEditor({ format: 'lain' }), /tidak dapat dibuka/);
  const bad = newProject('kosong');
  bad.props.push({ id: 'a', type: 'rumah', x: 0, z: 0 });
  assert.equal(openProject(bad).ok, false);
});

test('tempatkan objek: snap ke grid, dijepit di dalam area, terpilih, valid', () => {
  const e = fresh();
  const r = e.place('table', 3.27, -4.9);
  assert.equal(r.ok, true);
  assert.deepEqual(e.getProp(r.id), { id: r.id, type: 'table', x: 3.5, z: -5, rot: 0 });
  assert.equal(e.selection, r.id);
  const edge = e.place('stage', 999, -999); // jejak stage 3 x 1,5 dijepit
  assert.deepEqual([e.getProp(edge.id).x, e.getProp(edge.id).z], [27, -28.5]);
  assert.equal(e.issues().ok, true);
  assert.equal(e.place('rumah', 0, 0).reason, 'jenis');
  assert.equal(e.place('table', NaN, 0).reason, 'posisi');
});

test('batas: jumlah objek dan anggaran beban ditolak dengan pesan, bukan dipotong diam-diam', () => {
  const e = createEditor({ ...newProject('kosong'), area: { halfX: 120, halfZ: 120 } });
  let n = 0;
  while (e.place('wall', (n % 100) - 50, Math.floor(n / 100) * 3 - 100).ok) n++;
  assert.equal(n, LIMITS.maxProps);
  assert.equal(e.place('wall', 0, 0).reason, 'jumlah');
  const h = createEditor({ ...newProject('kosong'), area: { halfX: 120, halfZ: 120 } });
  let cars = 0;
  while (h.place('car', (cars % 40) * 4 - 80, Math.floor(cars / 40) * 6 - 100).ok) cars++;
  assert.equal(cars, Math.floor(LIMITS.budget / CATALOG.car.weight));
  assert.equal(h.place('car', 0, 0).reason, 'anggaran');
  assert.ok(h.usage.weight <= LIMITS.budget);
});

test('pindah, putar (dijepit ulang), duplikat, hapus', () => {
  const e = fresh();
  const { id } = e.place('wall', 0, 0);
  assert.deepEqual(e.move(id, 1.2, 1.3), { ok: true, changed: true });
  assert.deepEqual([e.getProp(id).x, e.getProp(id).z], [1, 1.5]);
  assert.equal(e.move(id, 1.1, 1.4).changed, false, 'tidak ada perubahan = tidak ada langkah undo');
  const w = e.place('wall', 29.5, 0); // rapat ke tepi timur
  e.rotate(w.id);
  assert.equal(e.getProp(w.id).rot, 1);
  assert.ok(e.getProp(w.id).x + 0.15 <= 30, 'setelah diputar tetap di dalam area');
  const d = e.duplicate(id);
  assert.notEqual(d.id, id);
  assert.equal(e.getProp(d.id).type, 'wall');
  assert.equal(e.remove(id).ok, true);
  assert.equal(e.getProp(id), null);
  assert.equal(e.remove(id).reason, 'tidak_ada');
  assert.equal(e.rotate('zzz').reason, 'tidak_ada');
});

test('undo/redo: urutan benar, redo hilang setelah aksi baru, seleksi mengikuti', () => {
  const e = fresh();
  const a = e.place('table', 0, 0).id;
  const b = e.place('sofa', 6, 0).id;
  e.remove(a);
  assert.equal(e.project.props.length, 1);
  assert.equal(e.undo(), true);
  assert.equal(e.project.props.length, 2);
  assert.equal(e.undo(), true);
  assert.deepEqual(e.project.props.map((p) => p.id), [a]);
  assert.equal(e.selection, null, 'objek terpilih sudah tidak ada setelah undo');
  assert.equal(e.redo(), true);
  assert.equal(e.getProp(b).type, 'sofa');
  e.place('bed', -6, 0);
  assert.equal(e.canRedo, false);
  while (e.undo());
  assert.equal(e.project.props.length, 0);
  assert.equal(e.undo(), false);
  while (e.redo());
  assert.deepEqual(e.project.props.map((p) => p.type), ['table', 'sofa', 'bed'], 'redo penuh memulihkan semua objek sesuai urutan');
});

test('gesture: satu seretan = satu langkah undo; undo dikunci selama menyeret', () => {
  const e = fresh();
  const { id } = e.place('table', 0, 0);
  e.beginGesture();
  for (let i = 1; i <= 25; i++) e.move(id, i * 0.5, 0);
  assert.equal(e.canUndo, false);
  e.endGesture();
  assert.equal(e.getProp(id).x, 12.5);
  e.undo();
  assert.equal(e.getProp(id).x, 0, 'seluruh seretan dibatalkan sekaligus');
  e.undo();
  assert.equal(e.getProp(id), null);
  e.beginGesture(); e.endGesture(); // gesture kosong tidak menambah riwayat
  assert.equal(e.canUndo, false);
});

test('riwayat dibatasi', () => {
  const e = createEditor(newProject('kosong'), { maxHistory: 5 });
  for (let i = 0; i < 20; i++) e.place('wall', (i % 10) * 4 - 18, Math.floor(i / 10) * 3);
  let steps = 0;
  while (e.undo()) steps++;
  assert.equal(steps, 5);
});

test('dirty: kembali ke keadaan tersimpan lewat undo = tidak kotor', () => {
  const e = fresh();
  assert.equal(e.dirty, false);
  e.place('table', 0, 0);
  assert.equal(e.dirty, true);
  e.markSaved();
  assert.equal(e.dirty, false);
  e.place('sofa', 6, 0);
  assert.equal(e.dirty, true);
  e.undo();
  assert.equal(e.dirty, false);
});

test('ID tidak bentrok setelah template + undo (penghitung tidak turun)', () => {
  const e = fresh();
  for (let i = 0; i < 9; i++) e.place('wall', i * 4 - 16, 0);
  e.applyTemplate('kosong'); // 0 objek
  e.undo(); // kembali ke 9 objek o1..o9
  const r = e.place('wall', 0, 10);
  const ids = e.project.props.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, `ID ganda: ${ids}`);
  assert.equal(r.ok, true);
});

test('template, ukuran area, spawn, nama, langit', () => {
  const e = fresh();
  e.rename('  Taman   Rani\n& Dimas ');
  assert.equal(e.project.name, 'Taman Rani & Dimas');
  assert.equal(e.rename('   ').reason, 'nama');
  assert.equal(e.applyTemplate('taman').ok, true);
  assert.equal(e.project.name, 'Taman Rani & Dimas', 'nama dipertahankan');
  assert.ok(e.project.props.length > 10);
  assert.equal(e.applyTemplate('../x').reason, 'template');
  assert.equal(e.resizeArea(5, 30).reason, 'area');
  assert.equal(e.resizeArea(20, 20).reason, 'objek_di_luar');
  assert.equal(e.resizeArea(60, 60).ok, true);
  assert.equal(e.setSky('malam').ok, true);
  assert.equal(e.setSky('ungu').reason, 'langit');
  assert.deepEqual(e.setSpawn(1.26, 99), { ok: true, changed: true });
  assert.deepEqual(e.project.spawn, { x: 1.5, z: 59.5 });
  e.undo(); e.undo(); e.undo(); e.undo();
  assert.equal(e.project.area.halfX, 30);
});

test('masalah terdeteksi: titik mulai tertutup bisa dikenali dan diperbaiki', () => {
  const e = fresh();
  assert.equal(e.issues().ok, true);
  const { id } = e.place('table', 0, 22);
  assert.ok(e.issues().errors.some((x) => x.code === 'spawn_terhalang'));
  e.move(id, 0, 0);
  assert.equal(e.issues().ok, true);
  assert.equal(e.issues(), e.issues(), 'hasil di-cache per snapshot');
});

test('subscribe: dipanggil saat berubah, berhenti setelah unsubscribe', () => {
  const e = fresh();
  let n = 0;
  const off = e.subscribe(() => { n++; });
  e.place('table', 0, 0);
  const after = n;
  assert.ok(after >= 1);
  off();
  e.place('sofa', 6, 0);
  assert.equal(n, after);
});

test('load: dokumen lain, riwayat dikosongkan, hasil save-load identik', () => {
  const a = fresh('aula');
  a.place('table', 0, 5);
  const json = JSON.parse(JSON.stringify(a.project));
  const b = fresh();
  b.place('wall', 0, 0);
  assert.equal(b.load(json).ok, true);
  assert.equal(b.canUndo, false);
  assert.equal(b.dirty, false);
  assert.deepEqual(b.project, a.project);
  assert.equal(validateProject(b.project).ok, true);
  assert.equal(b.load({ format: 'x' }).ok, false);
  assert.deepEqual(b.project, a.project, 'gagal memuat tidak merusak proyek yang sedang dibuka');
});
