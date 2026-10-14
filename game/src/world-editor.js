// Mesin editor dunia (Fase 9.1). Murni logika, tanpa DOM/THREE: dipakai UI editor dan dites tanpa browser.
// Setiap perubahan menghasilkan snapshot proyek baru (proyek kecil, maks. 400 objek), sehingga undo/redo sederhana dan
// tidak mungkin meninggalkan keadaan setengah jalan. Operasi menolak (bukan diam-diam memotong) bila melanggar batas.
import {
  CATALOG, LIMITS, SKIES, areaBounds, footprint, isType, newProject, normRot, snap, validateProject, weightOf, TEMPLATES,
} from './world-project.js';

/** Galat yang boleh dimuat apa adanya agar kreator bisa memperbaikinya di editor. Selain ini = berkas rusak. */
const RECOVERABLE = new Set(['spawn_luar', 'spawn_terhalang', 'spawn_terkurung', 'anggaran', 'di_luar', 'nama']);

const ok = (extra = {}) => ({ ok: true, ...extra });
const no = (reason, message) => ({ ok: false, reason, message });

/** Buka proyek dari sumber tidak tepercaya untuk diedit. Mengembalikan { ok, project, errors }. */
export function openProject(raw) {
  const r = validateProject(raw);
  if (r.ok) return { ok: true, project: r.project, errors: [] };
  const fatal = r.errors.filter((e) => !RECOVERABLE.has(e.code));
  if (fatal.length || !r.sanitized) return { ok: false, project: null, errors: r.errors };
  return { ok: true, project: r.sanitized, errors: r.errors };
}

export function createEditor(initial = newProject('kosong'), { maxHistory = 100 } = {}) {
  const opened = openProject(initial);
  if (!opened.ok) throw new Error(`Proyek tidak dapat dibuka: ${opened.errors[0]?.msg ?? 'rusak'}`);
  let project = opened.project;
  let saved = project;
  let selection = null;
  let past = [];
  let future = [];
  let gestureBefore = null;
  let seq = project.props.reduce((n, p) => Math.max(n, Number(/^o(\d+)$/.exec(p.id)?.[1] ?? 0)), 0);
  let cache = { for: null, result: null };
  const listeners = new Set();

  const emit = () => { for (const fn of listeners) fn(api); };
  const find = (id) => project.props.find((p) => p.id === id);

  /** Ganti proyek. Di luar gesture: simpan langkah undo. Di dalam gesture: hanya tandai, dicatat saat endGesture. */
  function commit(next) {
    if (next === project) return;
    if (gestureBefore === null) {
      past.push(project);
      if (past.length > maxHistory) past.shift();
      future = [];
    }
    project = next;
    if (selection && !find(selection)) selection = null;
    emit();
  }

  /** Jepit pusat objek agar seluruh jejaknya berada di dalam area. */
  function clampInside(type, rot, x, z) {
    const f = footprint(type, rot);
    const b = areaBounds(project.area);
    return {
      x: Math.min(b.maxX - f.hx, Math.max(b.minX + f.hx, snap(x))),
      z: Math.min(b.maxZ - f.hz, Math.max(b.minZ + f.hz, snap(z))),
    };
  }

  const withProps = (props) => ({ ...project, props });

  const api = {
    get project() { return project; },
    get selection() { return selection; },
    get canUndo() { return past.length > 0 && gestureBefore === null; },
    get canRedo() { return future.length > 0 && gestureBefore === null; },
    get dirty() { return project !== saved; },
    get usage() { return { count: project.props.length, maxCount: LIMITS.maxProps, weight: weightOf(project.props), budget: LIMITS.budget }; },
    getProp: (id) => find(id) ?? null,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /** Validasi lengkap (di-cache per snapshot): dipakai panel masalah dan syarat simpan-versi/pengajuan. */
    issues() {
      if (cache.for !== project) cache = { for: project, result: validateProject(project) };
      return cache.result;
    },

    select(id) {
      const next = id && find(id) ? id : null;
      if (next !== selection) { selection = next; emit(); }
      return selection;
    },

    place(type, x, z, rot = 0) {
      if (!isType(type)) return no('jenis', 'Jenis objek tidak ada di katalog.');
      if (project.props.length >= LIMITS.maxProps) return no('jumlah', `Batas ${LIMITS.maxProps} objek tercapai.`);
      if (weightOf(project.props) + CATALOG[type].weight > LIMITS.budget) return no('anggaran', 'Anggaran beban dunia habis. Hapus objek berat dulu.');
      if (!Number.isFinite(x) || !Number.isFinite(z)) return no('posisi', 'Posisi tidak valid.');
      const r = normRot(rot);
      const at = clampInside(type, r, x, z);
      let id;
      do { id = `o${++seq}`; } while (find(id)); // penghitung tidak pernah turun; cek ulang agar ID tak bentrok setelah undo
      commit(withProps([...project.props, { id, type, x: at.x, z: at.z, rot: r }]));
      selection = id;
      emit();
      return ok({ id });
    },

    move(id, x, z) {
      const p = find(id);
      if (!p) return no('tidak_ada', 'Objek tidak ditemukan.');
      if (!Number.isFinite(x) || !Number.isFinite(z)) return no('posisi', 'Posisi tidak valid.');
      const at = clampInside(p.type, p.rot, x, z);
      if (at.x === p.x && at.z === p.z) return ok({ changed: false });
      commit(withProps(project.props.map((q) => (q.id === id ? { ...q, ...at } : q))));
      return ok({ changed: true });
    },

    rotate(id, delta = 1) {
      const p = find(id);
      if (!p) return no('tidak_ada', 'Objek tidak ditemukan.');
      const rot = normRot(p.rot + delta);
      const at = clampInside(p.type, rot, p.x, p.z);
      commit(withProps(project.props.map((q) => (q.id === id ? { ...q, rot, ...at } : q))));
      return ok();
    },

    remove(id) {
      if (!find(id)) return no('tidak_ada', 'Objek tidak ditemukan.');
      commit(withProps(project.props.filter((q) => q.id !== id)));
      return ok();
    },

    duplicate(id) {
      const p = find(id);
      if (!p) return no('tidak_ada', 'Objek tidak ditemukan.');
      return api.place(p.type, p.x + 1, p.z + 1, p.rot);
    },

    setSpawn(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return no('posisi', 'Posisi tidak valid.');
      const b = areaBounds(project.area);
      const at = { x: Math.min(b.maxX - 0.5, Math.max(b.minX + 0.5, snap(x))), z: Math.min(b.maxZ - 0.5, Math.max(b.minZ + 0.5, snap(z))) };
      if (at.x === project.spawn.x && at.z === project.spawn.z) return ok({ changed: false });
      commit({ ...project, spawn: at });
      return ok({ changed: true });
    },

    rename(name) {
      const clean = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.nameMax);
      if (!clean) return no('nama', 'Nama dunia wajib diisi.');
      if (clean !== project.name) commit({ ...project, name: clean });
      return ok();
    },

    setSky(sky) {
      if (!SKIES.includes(sky)) return no('langit', 'Pilihan langit tidak dikenal.');
      if (sky !== project.sky) commit({ ...project, sky });
      return ok();
    },

    /** Ubah ukuran area. Ditolak (tidak memotong objek diam-diam) bila ada objek yang akan keluar area. */
    resizeArea(halfX, halfZ) {
      if (![halfX, halfZ].every((v) => Number.isFinite(v) && v >= LIMITS.halfMin && v <= LIMITS.halfMax)) return no('area', `Ukuran harus ${LIMITS.halfMin}-${LIMITS.halfMax} m.`);
      const area = { halfX: snap(halfX), halfZ: snap(halfZ) };
      const b = areaBounds(area);
      const out = project.props.filter((p) => {
        const f = footprint(p.type, p.rot);
        return p.x - f.hx < b.minX || p.x + f.hx > b.maxX || p.z - f.hz < b.minZ || p.z + f.hz > b.maxZ;
      });
      if (out.length) return no('objek_di_luar', `${out.length} objek akan berada di luar area. Pindahkan atau hapus dulu.`);
      if (Math.abs(project.spawn.x) > b.maxX - 0.5 || Math.abs(project.spawn.z) > b.maxZ - 0.5) return no('spawn_luar', 'Titik mulai akan berada di luar area.');
      commit({ ...project, area });
      return ok();
    },

    /** Ganti seluruh isi dengan template (bisa di-undo). Nama proyek dipertahankan. */
    applyTemplate(key) {
      if (!Object.hasOwn(TEMPLATES, key)) return no('template', 'Template tidak dikenal.');
      const t = TEMPLATES[key].build();
      commit({ ...t, name: project.name });
      seq = Math.max(seq, t.props.length);
      return ok();
    },

    /** Ganti seluruh proyek (buka berkas/versi). Riwayat undo dikosongkan karena ini dokumen lain. */
    load(raw) {
      const r = openProject(raw);
      if (!r.ok) return r;
      project = r.project;
      saved = project;
      selection = null;
      past = [];
      future = [];
      gestureBefore = null;
      seq = project.props.reduce((n, p) => Math.max(n, Number(/^o(\d+)$/.exec(p.id)?.[1] ?? 0)), 0);
      emit();
      return r;
    },

    /** Seretan/gerakan panjang = satu langkah undo. */
    beginGesture() { if (gestureBefore === null) gestureBefore = project; },
    endGesture() {
      if (gestureBefore === null) return;
      const before = gestureBefore;
      gestureBefore = null;
      if (project !== before) {
        past.push(before);
        if (past.length > maxHistory) past.shift();
        future = [];
        emit();
      }
    },

    undo() {
      if (!api.canUndo) return false;
      future.push(project);
      project = past.pop();
      if (selection && !find(selection)) selection = null;
      emit();
      return true;
    },
    redo() {
      if (!api.canRedo) return false;
      past.push(project);
      project = future.pop();
      if (selection && !find(selection)) selection = null;
      emit();
      return true;
    },

    markSaved() { saved = project; emit(); },
  };
  return api;
}
