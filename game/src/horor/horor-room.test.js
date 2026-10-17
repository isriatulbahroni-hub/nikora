import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { B, angDiff, clamp, inRect, mat, mergeMeshes, pushOut, worldUV, TAU } from './horor-core.js';
import { FACE, Room } from './horor-room.js';

test('angDiff: selisih sudut terpendek melewati batas PI', () => {
  assert.ok(Math.abs(angDiff(0.1, TAU - 0.1) - -0.2) < 1e-9);
  assert.ok(Math.abs(angDiff(TAU - 0.1, 0.1) - 0.2) < 1e-9);
  assert.equal(angDiff(1, 1), 0);
});

test('clamp dan inRect', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(inRect(1, 1, [0, 0, 2, 2]), true);
  assert.equal(inRect(2.2, 1, [0, 0, 2, 2]), false);
  assert.equal(inRect(2.2, 1, [0, 0, 2, 2], 0.3), true);
});

test('pushOut: lingkaran didorong keluar dari kotak', () => {
  const box = { x0: 0, z0: 0, x1: 2, z1: 2 };
  const p = { x: 2.1, z: 1 };
  pushOut(p, 0.5, [box]);
  assert.ok(p.x >= 2.5 - 1e-9, `x=${p.x}`);
  assert.equal(p.z, 1);
});

test('pushOut: pusat di dalam kotak keluar lewat sisi terdekat', () => {
  const box = { x0: 0, z0: 0, x1: 4, z1: 4 };
  const p = { x: 3.8, z: 2 };
  pushOut(p, 0.3, [box]);
  assert.ok(p.x >= 4.3 - 1e-9);
});

test('pushOut: filter melewati kotak tertentu (mis. pintu terbuka)', () => {
  const box = { x0: 0, z0: 0, x1: 2, z1: 2, kind: 'door' };
  const p = { x: 1, z: 1 };
  pushOut(p, 0.5, [box], (b) => b.kind !== 'door');
  assert.deepEqual(p, { x: 1, z: 1 });
});

test('worldUV: satu ulangan tekstur = scale meter', () => {
  const geo = worldUV(B(4, 2, 1), 4, 2, 1, 2);
  const uv = geo.attributes.uv;
  // sisi +z (indeks 4..7): lebar 4 m, tinggi 2 m, scale 2 -> u maksimum 2, v maksimum 1
  let maxU = 0;
  let maxV = 0;
  for (let i = 16; i < 20; i++) {
    maxU = Math.max(maxU, uv.getX(i));
    maxV = Math.max(maxV, uv.getY(i));
  }
  assert.ok(Math.abs(maxU - 2) < 1e-9);
  assert.ok(Math.abs(maxV - 1) < 1e-9);
});

test('mat: material yang sama dipakai ulang dari cache', () => {
  assert.equal(mat(0xff0000), mat(0xff0000));
  assert.notEqual(mat(0xff0000), mat(0x00ff00));
});

test('mergeMeshes: mesh bermaterial sama digabung jadi satu', () => {
  const m = mat(0x888888);
  const a = new THREE.Mesh(B(1, 1, 1), m);
  const b = new THREE.Mesh(B(1, 1, 1), m);
  b.position.set(3, 0, 0);
  const other = new THREE.Mesh(B(1, 1, 1), mat(0x112233));
  const out = mergeMeshes([a, b, other]);
  assert.equal(out.length, 2);
  const merged = out.find((o) => o.material === m);
  assert.equal(merged.geometry.attributes.position.count, 2 * 36);
  // mesh kedua digeser ke x = 3, jadi kotak pembatas melebar
  merged.geometry.computeBoundingBox();
  assert.ok(merged.geometry.boundingBox.max.x > 3);
});

test('Room.wall: dinding utuh menambah satu collider; bukaan jendela memecah segmen', () => {
  const r = new Room('uji');
  r.wall('x', 0, 0, 10, 1);
  assert.equal(r.colliders.length, 1);
  assert.deepEqual([r.colliders[0].x0, r.colliders[0].x1, r.colliders[0].kind], [0, 10, 'wall']);
  const jumlahTanpaJendela = r.statics.length;

  const r2 = new Room('uji2');
  r2.wall('x', 0, 0, 10, 1, { win: [{ a: 3, b: 5, y0: 1, y1: 2.2 }] });
  assert.ok(r2.statics.length > jumlahTanpaJendela, 'jendela menambah segmen dinding dan bingkai');
  assert.equal(r2.colliders.length, 1);
});

test('Room.wall sumbu z memakai collider vertikal', () => {
  const r = new Room('uji');
  r.wall('z', 5, 0, 8, -1);
  const c = r.colliders[0];
  assert.ok(c.x0 < 5 && c.x1 > 5);
  assert.deepEqual([c.z0, c.z1], [0, 8]);
});

test('Room.door: spawn, arah hadap, dan zona pemicu sesuai sisi dalam', () => {
  const r = new Room('uji');
  const d = r.door({ id: 'a', wall: 'x', at: 0, pos: 4, inner: 1 });
  assert.deepEqual(d.spawn, { x: 4, z: 1, rot: FACE.S });
  assert.equal(d.face, FACE.N);
  assert.ok(d.rect[1] === 0 && d.rect[3] > 0.5);

  const d2 = r.door({ id: 'b', wall: 'z', at: 10, pos: 2, inner: -1 });
  assert.deepEqual(d2.spawn, { x: 9, z: 2, rot: FACE.W });
  assert.equal(d2.face, FACE.E);
  assert.equal(r.doors.length, 2);
});

test('Room.door shutter: collider aktif saat turun, hilang saat dinaikkan, kembali saat diturunkan', () => {
  const r = new Room('uji');
  r.door({ id: 'g', wall: 'x', at: 0, pos: 4, inner: 1, shutter: true });
  const n = r.colliders.length;
  const s = r.shutters.g;
  assert.ok(s.c.x1 < 9999);
  r.setShutter('g', false);
  assert.equal(s.c.x0, 9999);
  assert.equal(s.mesh.visible, false);
  r.setShutter('g', true);
  assert.ok(s.c.x1 < 9999);
  assert.equal(s.mesh.visible, true);
  assert.equal(r.colliders.length, n);
  r.setShutter('tidak-ada', false); // tidak boleh melempar galat
});

test('Room.setShutter dengan animasi: naik bertahap lalu tersembunyi', () => {
  const r = new Room('uji');
  r.door({ id: 'g', wall: 'x', at: 0, pos: 0, inner: 1, shutter: true });
  r.setShutter('g', false, true);
  const s = r.shutters.g;
  assert.equal(s.rising, true);
  for (let i = 0; i < 400 && s.rising; i++) r.updateShutters(0.016);
  assert.equal(s.rising, false);
  assert.equal(s.mesh.visible, false);
});

test('Room.box solid: collider menyesuaikan rotasi 90 derajat', () => {
  const r = new Room('uji');
  r.box(2, 1, 0.5, mat(0x123456), 5, 0, 5, { solid: true, ry: Math.PI / 2 });
  const c = r.colliders[0];
  assert.ok(Math.abs(c.x1 - c.x0 - 0.5) < 1e-9);
  assert.ok(Math.abs(c.z1 - c.z0 - 2) < 1e-9);
});

test('Room.finalize menggabungkan mesh statis dan mengosongkan daftarnya', () => {
  const r = new Room('uji');
  const m = mat(0x778899);
  r.box(1, 1, 1, m, 0, 0, 0);
  r.box(1, 1, 1, m, 3, 0, 0);
  r.finalize();
  assert.equal(r.statics.length, 0);
  assert.equal(r.scene.children.filter((c) => c.isMesh).length, 1);
});

test('Room.tickFlickers mengubah intensitas lampu berkedip, lampu tetap tidak berubah', () => {
  const r = new Room('uji');
  const tetap = r.point(0xffffff, 1, 10, 0, 2, 0);
  const kedip = r.point(0xffffff, 1, 10, 1, 2, 0, 'dying');
  const awalTetap = tetap.intensity;
  const awalKedip = kedip.intensity;
  let berubah = false;
  for (let t = 0; t < 2; t += 0.013) {
    r.tickFlickers(t);
    if (kedip.intensity !== awalKedip) berubah = true;
    assert.equal(tetap.intensity, awalTetap);
    assert.ok(kedip.intensity <= awalKedip + 1e-9);
  }
  assert.ok(berubah);
});

test('Room.dispose tidak melempar galat dan mengosongkan scene', () => {
  const r = new Room('uji');
  r.box(1, 1, 1, mat(0x010101), 0, 0, 0, { dyn: true });
  r.dispose();
  assert.equal(r.scene.children.length, 0);
});
