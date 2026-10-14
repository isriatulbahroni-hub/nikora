// Siklus hidup proyek dunia (Fase 9.2 dan 9.3): peran, versi, pengajuan, moderasi, penarikan, dan jejak audit.
// Ini kebijakan murni yang dites tanpa jaringan. Penegakan sebenarnya ada di database (fungsi dunia_* dengan RLS);
// berkas ini dipakai UI untuk menampilkan tombol yang boleh dan dites agar selaras dengan aturan yang sama.
//
// Prinsip: perubahan di editor tidak langsung mengubah dunia yang sedang terbit. Dunia terbit = satu versi tetap
// (`liveVersion`). Draf baru harus diajukan, ditinjau moderator, lalu disetujui sebelum menggantikannya.

export const MAX_VERSIONS = 100;
export const REASON_MIN = 3;
export const REASON_MAX = 500;

export const ROLES = Object.freeze(['owner', 'editor', 'viewer']);

/** Izin per peran. `moderator` = staf (peran global), bukan anggota proyek. */
export const MATRIX = Object.freeze({
  owner: Object.freeze(['view', 'edit', 'save_version', 'submit', 'withdraw', 'unpublish', 'manage_members', 'view_audit']),
  editor: Object.freeze(['view', 'edit', 'save_version', 'view_audit']),
  viewer: Object.freeze(['view']),
  moderator: Object.freeze(['view', 'approve', 'reject', 'takedown', 'view_audit']),
});

/** Aktor = { id, role: 'owner'|'editor'|'viewer'|null, moderator: boolean }. */
export function can(actor, action) {
  if (!actor || typeof action !== 'string') return false;
  if (actor.role && Object.hasOwn(MATRIX, actor.role) && actor.role !== 'moderator' && MATRIX[actor.role].includes(action)) return true;
  return actor.moderator === true && MATRIX.moderator.includes(action);
}

export const newState = (ownerId) => ({
  ownerId, latest: 0, liveVersion: null, pendingVersion: null, rejected: null, takedown: null,
});

const fail = (error, message) => ({ ok: false, error, message });
const reasonOk = (r) => typeof r === 'string' && r.trim().length >= REASON_MIN && r.trim().length <= REASON_MAX;
const stamp = (at) => (at instanceof Date ? at.toISOString() : String(at));

function entry(action, actor, at, detail = {}) {
  return Object.freeze({ action, actor: actor.id, role: actor.moderator && !actor.role ? 'moderator' : actor.role, at: stamp(at), detail: Object.freeze({ ...detail }) });
}
const done = (state, audit) => ({ ok: true, state: Object.freeze(state), audit });

/** Status yang ditampilkan ke pengguna. Dunia terbit tetap "terbit" walau ada draf baru yang sedang ditinjau. */
export function statusOf(state) {
  const base = { liveVersion: state.liveVersion, pendingVersion: state.pendingVersion };
  if (state.liveVersion != null) return { ...base, status: 'terbit', label: state.pendingVersion != null ? 'Terbit (versi baru sedang ditinjau)' : 'Terbit' };
  if (state.pendingVersion != null) return { ...base, status: 'ditinjau', label: 'Sedang ditinjau' };
  if (state.takedown) return { ...base, status: 'ditarik', label: 'Ditarik moderator' };
  if (state.rejected) return { ...base, status: 'ditolak', label: 'Ditolak, perlu perbaikan' };
  return { ...base, status: 'draf', label: 'Draf' };
}

export function saveVersion(state, { actor, at }) {
  if (!can(actor, 'save_version')) return fail('izin', 'Peran Anda tidak boleh menyimpan versi.');
  if (state.latest >= MAX_VERSIONS) return fail('batas_versi', `Batas ${MAX_VERSIONS} versi tercapai. Hapus versi lama atau hubungi admin.`);
  const version = state.latest + 1;
  const r = done({ ...state, latest: version }, entry('simpan_versi', actor, at, { version }));
  r.version = version;
  return r;
}

/** `validation` = hasil validateProject untuk data versi tersebut; pengajuan butuh ok === true. */
export function submit(state, { actor, version, validation, at }) {
  if (!can(actor, 'submit')) return fail('izin', 'Hanya pemilik yang boleh mengajukan dunia.');
  if (!Number.isInteger(version) || version < 1 || version > state.latest) return fail('versi', 'Versi tidak ada.');
  if (!validation || validation.ok !== true) return fail('tidak_valid', 'Dunia masih punya galat. Perbaiki dulu sebelum mengajukan.');
  if (state.pendingVersion != null) return fail('sedang_ditinjau', 'Masih ada versi yang sedang ditinjau.');
  if (version === state.liveVersion) return fail('sudah_terbit', 'Versi ini sudah terbit.');
  if (state.liveVersion != null && version < state.liveVersion) return fail('versi_lama', 'Versi harus lebih baru dari yang terbit. Untuk mundur, simpan versi lama itu sebagai versi baru.');
  if (state.takedown && version <= state.takedown.version) return fail('versi_ditarik', 'Versi ini (atau yang lebih lama) ditarik moderator. Simpan perbaikan sebagai versi baru.');
  if (state.rejected && version <= state.rejected.version) return fail('versi_ditolak', 'Versi ini (atau yang lebih lama) ditolak. Simpan perbaikan sebagai versi baru.');
  return done({ ...state, pendingVersion: version, rejected: null }, entry('ajukan', actor, at, { version }));
}

export function withdraw(state, { actor, at }) {
  if (!can(actor, 'withdraw')) return fail('izin', 'Hanya pemilik yang boleh membatalkan pengajuan.');
  if (state.pendingVersion == null) return fail('tidak_ada_pengajuan', 'Tidak ada pengajuan.');
  return done({ ...state, pendingVersion: null }, entry('batal_ajukan', actor, at, { version: state.pendingVersion }));
}

/** Moderator tidak boleh meninjau proyeknya sendiri (benturan kepentingan). */
function reviewGuard(state, actor, action, version) {
  if (!can(actor, action)) return fail('izin', 'Hanya moderator yang boleh meninjau.');
  if (actor.id === state.ownerId) return fail('benturan', 'Moderator tidak boleh meninjau dunianya sendiri.');
  if (state.pendingVersion == null) return fail('tidak_ada_pengajuan', 'Tidak ada pengajuan untuk ditinjau.');
  if (version !== state.pendingVersion) return fail('versi', 'Versi yang ditinjau bukan versi yang diajukan.');
  return null;
}

export function approve(state, { actor, version, at }) {
  const g = reviewGuard(state, actor, 'approve', version);
  if (g) return g;
  return done({ ...state, liveVersion: version, pendingVersion: null, rejected: null, takedown: null },
    entry('setujui', actor, at, { version, menggantikan: state.liveVersion }));
}

export function reject(state, { actor, version, reason, at }) {
  const g = reviewGuard(state, actor, 'reject', version);
  if (g) return g;
  if (!reasonOk(reason)) return fail('alasan', `Alasan penolakan wajib diisi (${REASON_MIN}-${REASON_MAX} karakter).`);
  const why = reason.trim();
  return done({ ...state, pendingVersion: null, rejected: { version, reason: why, by: actor.id, at: stamp(at) } },
    entry('tolak', actor, at, { version, alasan: why }));
}

/** Pemilik menarik dunianya sendiri dari publik (tanpa alasan wajib). */
export function unpublish(state, { actor, at }) {
  if (!can(actor, 'unpublish')) return fail('izin', 'Hanya pemilik yang boleh menarik dunia.');
  if (state.liveVersion == null) return fail('tidak_terbit', 'Dunia tidak sedang terbit.');
  return done({ ...state, liveVersion: null }, entry('tarik', actor, at, { version: state.liveVersion }));
}

/** Moderator menarik paksa dunia terbit. Alasan wajib dan tercatat; pemilik harus menyimpan versi baru untuk mengajukan lagi. */
export function takedown(state, { actor, reason, at }) {
  if (!can(actor, 'takedown')) return fail('izin', 'Hanya moderator yang boleh menarik paksa.');
  if (state.liveVersion == null) return fail('tidak_terbit', 'Dunia tidak sedang terbit.');
  if (!reasonOk(reason)) return fail('alasan', `Alasan penarikan wajib diisi (${REASON_MIN}-${REASON_MAX} karakter).`);
  const why = reason.trim();
  return done({ ...state, liveVersion: null, takedown: { version: state.liveVersion, reason: why, by: actor.id, at: stamp(at) } },
    entry('tarik_moderator', actor, at, { version: state.liveVersion, alasan: why }));
}

/** Jejak audit hanya bertambah; mengembalikan larik baru yang dibekukan. */
export const appendAudit = (log, e) => Object.freeze([...log, e]);
