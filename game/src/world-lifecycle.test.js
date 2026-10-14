import test from 'node:test';
import assert from 'node:assert/strict';
import {
  can, MATRIX, newState, statusOf, saveVersion, submit, withdraw, approve, reject, unpublish, takedown, appendAudit, MAX_VERSIONS,
} from './world-lifecycle.js';

const owner = { id: 'u-owner', role: 'owner', moderator: false };
const editor = { id: 'u-edit', role: 'editor', moderator: false };
const viewer = { id: 'u-view', role: 'viewer', moderator: false };
const stranger = { id: 'u-x', role: null, moderator: false };
const mod = { id: 'u-mod', role: null, moderator: true };
const ownerMod = { id: 'u-owner', role: 'owner', moderator: true };
const at = '2026-10-13T10:00:00.000Z';
const valid = { ok: true };

/** Jalankan rangkaian langkah dan kembalikan state akhir; gagal bila ada langkah yang ditolak. */
function run(state, ...steps) {
  let s = state;
  for (const [fn, args] of steps) {
    const r = fn(s, { at, ...args });
    assert.equal(r.ok, true, `${fn.name} ditolak: ${r.error}`);
    s = r.state;
  }
  return s;
}
const draft = (n = 1) => run(newState('u-owner'), ...Array.from({ length: n }, () => [saveVersion, { actor: owner }]));

test('matriks izin: tiap peran hanya memegang izin yang semestinya', () => {
  const acts = ['view', 'edit', 'save_version', 'submit', 'withdraw', 'unpublish', 'manage_members', 'view_audit', 'approve', 'reject', 'takedown', 'hapus_semua'];
  const want = {
    owner: ['view', 'edit', 'save_version', 'submit', 'withdraw', 'unpublish', 'manage_members', 'view_audit'],
    editor: ['view', 'edit', 'save_version', 'view_audit'],
    viewer: ['view'],
  };
  for (const [name, actor] of [['owner', owner], ['editor', editor], ['viewer', viewer]]) {
    assert.deepEqual(acts.filter((a) => can(actor, a)), want[name], name);
  }
  assert.deepEqual(acts.filter((a) => can(mod, a)), ['view', 'view_audit', 'approve', 'reject', 'takedown']);
  assert.deepEqual(acts.filter((a) => can(stranger, a)), []);
  assert.equal(can(null, 'view'), false);
  assert.equal(can({ id: 'x', role: 'moderator', moderator: false }, 'approve'), false, 'peran "moderator" bukan peran anggota');
  assert.equal(can({ id: 'x', role: '__proto__', moderator: false }, 'view'), false);
  assert.equal(can(owner, 'approve'), false, 'pemilik tidak bisa menyetujui dunianya sendiri');
  assert.ok(Object.isFrozen(MATRIX) && Object.isFrozen(MATRIX.owner));
});

test('simpan versi: nomor naik; pembaca dan orang luar ditolak; ada batas', () => {
  const r = saveVersion(newState('u-owner'), { actor: editor, at });
  assert.equal(r.ok, true);
  assert.equal(r.version, 1);
  assert.equal(saveVersion(newState('u-owner'), { actor: viewer, at }).error, 'izin');
  assert.equal(saveVersion(newState('u-owner'), { actor: stranger, at }).error, 'izin');
  assert.equal(saveVersion({ ...newState('u-owner'), latest: MAX_VERSIONS }, { actor: owner, at }).error, 'batas_versi');
});

test('alur normal: draf -> ajukan -> setujui -> terbit', () => {
  let s = draft(2);
  assert.equal(statusOf(s).status, 'draf');
  s = run(s, [submit, { actor: owner, version: 2, validation: valid }]);
  assert.equal(statusOf(s).status, 'ditinjau');
  s = run(s, [approve, { actor: mod, version: 2 }]);
  assert.deepEqual([statusOf(s).status, s.liveVersion, s.pendingVersion], ['terbit', 2, null]);
});

test('pengajuan: wajib valid, hanya pemilik, versi harus ada, tidak ganda', () => {
  const s = draft(2);
  assert.equal(submit(s, { actor: owner, version: 1, validation: { ok: false }, at }).error, 'tidak_valid');
  assert.equal(submit(s, { actor: owner, version: 1, validation: undefined, at }).error, 'tidak_valid');
  assert.equal(submit(s, { actor: editor, version: 1, validation: valid, at }).error, 'izin');
  assert.equal(submit(s, { actor: owner, version: 9, validation: valid, at }).error, 'versi');
  assert.equal(submit(s, { actor: owner, version: 1.5, validation: valid, at }).error, 'versi');
  const p = run(s, [submit, { actor: owner, version: 1, validation: valid }]);
  assert.equal(submit(p, { actor: owner, version: 2, validation: valid, at }).error, 'sedang_ditinjau');
});

test('tolak: alasan wajib, versi ditolak tak bisa diajukan lagi, versi baru bisa', () => {
  let s = run(draft(1), [submit, { actor: owner, version: 1, validation: valid }]);
  assert.equal(reject(s, { actor: mod, version: 1, reason: '', at }).error, 'alasan');
  assert.equal(reject(s, { actor: mod, version: 1, reason: 'ab', at }).error, 'alasan');
  assert.equal(reject(s, { actor: mod, version: 1, reason: 'x'.repeat(501), at }).error, 'alasan');
  assert.equal(reject(s, { actor: owner, version: 1, reason: 'alasan sah', at }).error, 'izin');
  s = run(s, [reject, { actor: mod, version: 1, reason: '  Ada aset tidak berizin  ' }]);
  assert.equal(statusOf(s).status, 'ditolak');
  assert.equal(s.rejected.reason, 'Ada aset tidak berizin');
  assert.equal(submit(s, { actor: owner, version: 1, validation: valid, at }).error, 'versi_ditolak');
  s = run(s, [saveVersion, { actor: owner }], [submit, { actor: owner, version: 2, validation: valid }]);
  assert.equal(statusOf(s).status, 'ditinjau');
  assert.equal(s.rejected, null, 'penolakan lama dihapus saat mengajukan versi baru');
});

test('moderator tidak boleh meninjau dunianya sendiri; versi salah ditolak', () => {
  const s = run(draft(1), [submit, { actor: owner, version: 1, validation: valid }]);
  assert.equal(approve(s, { actor: ownerMod, version: 1, at }).error, 'benturan');
  assert.equal(reject(s, { actor: ownerMod, version: 1, reason: 'alasan sah', at }).error, 'benturan');
  assert.equal(approve(s, { actor: mod, version: 2, at }).error, 'versi');
  assert.equal(approve(draft(1), { actor: mod, version: 1, at }).error, 'tidak_ada_pengajuan');
  assert.equal(approve(s, { actor: owner, version: 1, at }).error, 'izin');
});

test('dunia terbit tetap terbit saat versi baru ditinjau; disetujui menggantikan, ditolak tidak mengubah', () => {
  let s = run(draft(1), [submit, { actor: owner, version: 1, validation: valid }], [approve, { actor: mod, version: 1 }], [saveVersion, { actor: owner }], [submit, { actor: owner, version: 2, validation: valid }]);
  assert.equal(s.liveVersion, 1, 'versi 1 tetap tayang selama v2 ditinjau');
  assert.equal(statusOf(s).label, 'Terbit (versi baru sedang ditinjau)');
  const rejected = run(s, [reject, { actor: mod, version: 2, reason: 'terlalu berat' }]);
  assert.equal(rejected.liveVersion, 1);
  assert.equal(statusOf(rejected).status, 'terbit');
  s = run(s, [approve, { actor: mod, version: 2 }]);
  assert.equal(s.liveVersion, 2);
  assert.equal(submit(s, { actor: owner, version: 1, validation: valid, at }).error, 'versi_lama', 'mundur = simpan sebagai versi baru');
  assert.equal(submit(s, { actor: owner, version: 2, validation: valid, at }).error, 'sudah_terbit');
});

test('batal ajukan dan tarik oleh pemilik', () => {
  let s = run(draft(1), [submit, { actor: owner, version: 1, validation: valid }]);
  assert.equal(withdraw(s, { actor: editor, at }).error, 'izin');
  s = run(s, [withdraw, { actor: owner }]);
  assert.equal(statusOf(s).status, 'draf');
  assert.equal(withdraw(s, { actor: owner, at }).error, 'tidak_ada_pengajuan');
  s = run(s, [submit, { actor: owner, version: 1, validation: valid }], [approve, { actor: mod, version: 1 }]);
  assert.equal(unpublish(s, { actor: editor, at }).error, 'izin');
  assert.equal(unpublish(s, { actor: mod, at }).error, 'izin');
  s = run(s, [unpublish, { actor: owner }]);
  assert.equal(s.liveVersion, null);
  assert.equal(unpublish(s, { actor: owner, at }).error, 'tidak_terbit');
});

test('tarik paksa: alasan wajib dan tercatat; pemilik harus membuat versi baru; perbaikan yang diajukan tidak hilang', () => {
  const live = run(draft(1), [submit, { actor: owner, version: 1, validation: valid }], [approve, { actor: mod, version: 1 }]);
  assert.equal(takedown(live, { actor: mod, reason: '', at }).error, 'alasan');
  assert.equal(takedown(live, { actor: owner, reason: 'alasan sah', at }).error, 'izin');
  assert.equal(takedown(draft(1), { actor: mod, reason: 'alasan sah', at }).error, 'tidak_terbit');
  const down = run(live, [takedown, { actor: mod, reason: 'Konten melanggar kebijakan' }]);
  assert.deepEqual([statusOf(down).status, down.liveVersion], ['ditarik', null]);
  assert.equal(down.takedown.by, 'u-mod');
  assert.equal(submit(down, { actor: owner, version: 1, validation: valid, at }).error, 'versi_ditarik');
  const fixed = run(down, [saveVersion, { actor: owner }], [submit, { actor: owner, version: 2, validation: valid }], [approve, { actor: mod, version: 2 }]);
  assert.deepEqual([statusOf(fixed).status, fixed.takedown], ['terbit', null]);
  const withPending = run(live, [saveVersion, { actor: owner }], [submit, { actor: owner, version: 2, validation: valid }], [takedown, { actor: mod, reason: 'Pelanggaran berat' }]);
  assert.equal(withPending.pendingVersion, 2, 'perbaikan yang sudah diajukan tetap ditinjau');
  assert.equal(statusOf(withPending).status, 'ditinjau');
});

test('jejak audit: setiap tindakan tercatat dengan pelaku, waktu, dan alasan; beku', () => {
  let log = [];
  let s = newState('u-owner');
  const step = (fn, args) => {
    const r = fn(s, { at, ...args });
    assert.equal(r.ok, true, r.error);
    s = r.state;
    log = appendAudit(log, r.audit);
    return r;
  };
  step(saveVersion, { actor: owner });
  step(submit, { actor: owner, version: 1, validation: valid });
  step(approve, { actor: mod, version: 1 });
  step(takedown, { actor: mod, reason: 'Melanggar kebijakan' });
  assert.deepEqual(log.map((e) => e.action), ['simpan_versi', 'ajukan', 'setujui', 'tarik_moderator']);
  assert.deepEqual(log.map((e) => e.actor), ['u-owner', 'u-owner', 'u-mod', 'u-mod']);
  assert.equal(log[3].detail.alasan, 'Melanggar kebijakan');
  assert.equal(log[2].role, 'moderator');
  assert.equal(log[0].at, at);
  assert.ok(Object.isFrozen(log) && Object.isFrozen(log[0]) && Object.isFrozen(log[0].detail) && Object.isFrozen(s));
  assert.throws(() => { 'use strict'; log.push({}); }, TypeError);
});
