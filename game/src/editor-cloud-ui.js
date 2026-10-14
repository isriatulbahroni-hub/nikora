// UI akun untuk Studio Dunia (Fase 9.2/9.3). Semua teks dari server dipasang lewat textContent (tidak pernah innerHTML).
// Penegakan izin ada di database; UI ini hanya menampilkan tombol yang relevan dan menerjemahkan galat.
import { validateProject } from './world-project.js';

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid);
  return e;
}
const fmt = (iso) => { try { return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };
const AUDIT = { simpan_versi: 'Simpan versi', ajukan: 'Diajukan', batal_ajukan: 'Pengajuan dibatalkan', setujui: 'Disetujui', tolak: 'Ditolak', tarik: 'Ditarik pemilik', tarik_moderator: 'Ditarik moderator' };

export function initCloudUi({ editor, cloud, panel, button, reviewbar, toast, onChange = () => {} }) {
  let tab = 'mine';
  let linked = null; // { id, name } proyek akun yang sedang diedit
  let reviewing = null; // { id, version, kind, name }
  let backup = null;
  let expanded = null; // { id, what: 'versi' | 'audit' }
  let note = '';
  let moderator = false;

  const api = {
    get reviewing() { return reviewing; },
    get linked() { return linked; },
    unlink() { linked = null; onChange(); },
  };
  const say = (m) => { note = m || ''; const el = panel.querySelector('small.msg'); if (el) el.textContent = note; };

  /** Jalankan aksi async; galat tampil sebagai pesan, bukan crash. */
  async function run(fn, { rerender = true } = {}) {
    say(''); // kosongkan dulu; pesan yang diatur fn (mis. alasan belum bisa diajukan) harus tetap tampil setelah selesai
    try { await fn(); } catch (e) { say(e.message || 'Gagal.'); }
    if (rerender && panel.classList.contains('show') && !reviewing) await render();
  }

  button.addEventListener('click', async () => {
    panel.classList.toggle('show');
    if (panel.classList.contains('show')) await render();
  });

  function loginView() {
    const email = h('input', { type: 'email', autocomplete: 'email', 'aria-label': 'Email', placeholder: 'Email' });
    const pass = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Kata sandi', placeholder: 'Kata sandi' });
    let signup = false;
    const go = h('button', { class: 'btn', type: 'button', text: 'Masuk' });
    const sw = h('button', { class: 'btn mini', type: 'button', text: 'Belum punya akun? Daftar' });
    sw.addEventListener('click', () => { signup = !signup; go.textContent = signup ? 'Daftar' : 'Masuk'; sw.textContent = signup ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'; });
    // Tanpa render ulang saat gagal: isian email/kata sandi yang sudah diketik jangan terhapus. Render hanya setelah berhasil masuk.
    go.addEventListener('click', async () => {
      await run(async () => {
        if (signup) {
          const r = await cloud.signUp(email.value, pass.value);
          if (r.needsConfirm) { say('Akun dibuat. Cek email untuk konfirmasi, lalu masuk.'); return; }
        } else await cloud.signIn(email.value, pass.value);
        moderator = await cloud.canModerate();
        onChange();
      }, { rerender: false });
      if (cloud.session()) await render();
    });
    return [h('h3', { text: 'Masuk ke akun' }), h('p', { class: 'hint', text: 'Akun dipakai untuk menyimpan versi dunia dan mengajukannya terbit.' }), email, pass, h('div', { class: 'row' }, go, sw)];
  }

  async function saveToAccount() {
    const project = editor.project;
    if (!linked) {
      const p = await cloud.createProject(project.name, project.template);
      linked = { id: p.id, name: p.name };
    }
    const v = await cloud.saveVersion(linked.id, project);
    editor.markSaved();
    onChange();
    toast(`Versi ${v} tersimpan di akun`);
  }

  async function openFromAccount(p) {
    if (!p.latest) { say('Proyek ini belum punya versi.'); return; }
    if (editor.dirty && !confirm('Ada perubahan yang belum disimpan. Ganti dengan versi dari akun?')) return;
    const data = await cloud.loadVersion(p.id, p.latest);
    const r = editor.load(data);
    if (!r.ok) throw new Error(`Versi tidak bisa dibuka: ${r.errors[0]?.msg ?? 'rusak'}`);
    linked = { id: p.id, name: p.name };
    panel.classList.remove('show');
    onChange();
    toast(`Dibuka: ${p.name} (v${p.latest})`);
  }

  async function submitVersion(p, version) {
    const data = await cloud.loadVersion(p.id, version);
    const check = validateProject(data); // UI memeriksa dulu; moderator dan server memvalidasi ulang
    if (!check.ok) { say(`Versi ${version} belum bisa diajukan (${check.errors.length} galat): ${check.errors[0].msg}`); return; }
    await cloud.submit(p.id, version);
    toast(`Versi ${version} diajukan untuk ditinjau`);
  }

  function projectRow(p) {
    const open = expanded?.id === p.id ? expanded.what : null;
    const row = h('div', { class: 'proj', 'data-project': p.id },
      h('div', { class: 'row' }, h('strong', { class: 'grow', text: p.name }), h('span', { class: 'st', text: `${p.label} · v${p.latest}` })),
      h('div', { class: 'row' },
        h('button', { class: 'btn mini', type: 'button', text: 'Buka', onclick: () => run(() => openFromAccount(p), { rerender: false }) }),
        h('button', { class: 'btn mini', type: 'button', 'data-act': 'versi', text: 'Versi', onclick: () => { expanded = open === 'versi' ? null : { id: p.id, what: 'versi' }; render(); } }),
        h('button', { class: 'btn mini', type: 'button', text: 'Riwayat', onclick: () => { expanded = open === 'audit' ? null : { id: p.id, what: 'audit' }; render(); } }),
        p.pending != null && h('button', { class: 'btn mini', type: 'button', text: 'Batal ajukan', onclick: () => run(() => cloud.withdraw(p.id)) }),
        p.live != null && h('button', { class: 'btn mini danger', type: 'button', text: 'Tarik', onclick: () => run(async () => { if (confirm('Tarik dunia ini dari publik?')) await cloud.unpublish(p.id); }) })),
      p.rejected && h('div', { class: 'st', text: `Ditolak: ${p.rejected.reason}` }),
      p.takedown && h('div', { class: 'st', text: `Ditarik moderator: ${p.takedown.reason}` }));
    if (open) row.append(h('div', { 'data-detail': open, text: 'Memuat…' }));
    return row;
  }

  async function fillDetail(p, box, what) {
    box.textContent = '';
    if (what === 'versi') {
      const versions = await cloud.listVersions(p.id);
      for (const v of versions) {
        box.append(h('div', { class: 'row' },
          h('span', { class: 'grow', text: `v${v.version} · ${fmt(v.created_at)}${v.note ? ` · ${v.note}` : ''}${v.version === p.live ? ' · TERBIT' : ''}${v.version === p.pending ? ' · DITINJAU' : ''}` }),
          h('button', { class: 'btn mini', type: 'button', text: 'Muat', onclick: () => run(async () => {
            if (editor.dirty && !confirm('Ada perubahan yang belum disimpan. Ganti dengan versi ini?')) return;
            const r = editor.load(await cloud.loadVersion(p.id, v.version));
            if (!r.ok) throw new Error(`Versi tidak bisa dibuka: ${r.errors[0]?.msg ?? 'rusak'}`);
            linked = { id: p.id, name: p.name };
            panel.classList.remove('show');
            onChange();
            toast(`Dimuat: v${v.version}`);
          }, { rerender: false }) }),
          h('button', { class: 'btn mini', type: 'button', 'data-submit': v.version, text: 'Ajukan', disabled: p.pending != null || v.version === p.live || (p.live != null && v.version < p.live), onclick: () => run(() => submitVersion(p, v.version)) })));
      }
      if (!versions.length) box.append(h('div', { class: 'st', text: 'Belum ada versi.' }));
    } else {
      const log = await cloud.audit(p.id);
      for (const a of log) box.append(h('div', { class: 'st', text: `${fmt(a.created_at)} · ${AUDIT[a.action] ?? a.action}${a.detail?.version ? ` v${a.detail.version}` : ''}${a.detail?.alasan ? ` — ${a.detail.alasan}` : ''}` }));
      if (!log.length) box.append(h('div', { class: 'st', text: 'Belum ada riwayat.' }));
    }
  }

  async function mineView() {
    const projects = await cloud.listProjects();
    const mine = projects.filter((p) => p.ownerId === cloud.userId());
    const kids = [
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', id: 'cloudSave', text: linked ? `Simpan versi baru ke "${linked.name}"` : 'Simpan dunia ini ke akun', onclick: () => run(saveToAccount) })),
      h('h3', { text: 'Dunia saya' }),
      ...mine.map(projectRow),
      !mine.length && h('p', { class: 'hint', text: 'Belum ada dunia di akun. Simpan dunia yang sedang dibuka untuk memulai.' }),
    ];
    return kids;
  }

  async function reviewView() {
    const [pending, live] = await Promise.all([cloud.pendingReviews(), cloud.liveWorlds()]);
    const row = (p, kind) => h('div', { class: 'proj', 'data-review': kind },
      h('div', { class: 'row' }, h('strong', { class: 'grow', text: p.name }), h('span', { class: 'st', text: kind === 'pending' ? `Diajukan v${p.pending}` : `Terbit v${p.live}` })),
      h('div', { class: 'row' }, h('span', { class: 'st', text: `Pemilik ${p.ownerId.slice(0, 8)}` }),
        h('button', { class: 'btn mini', type: 'button', text: 'Tinjau', onclick: () => run(() => enterReview(p, kind), { rerender: false }) })));
    return [
      h('h3', { text: `Menunggu tinjauan (${pending.length})` }), ...pending.map((p) => row(p, 'pending')), !pending.length && h('p', { class: 'hint', text: 'Tidak ada pengajuan.' }),
      h('h3', { text: `Dunia terbit (${live.length})` }), ...live.map((p) => row(p, 'live')), !live.length && h('p', { class: 'hint', text: 'Belum ada dunia terbit.' }),
    ];
  }

  let rendering = Promise.resolve();
  function render() {
    rendering = rendering.then(doRender, doRender);
    return rendering;
  }
  async function doRender() {
    const msg = h('small', { class: 'msg', role: 'status', text: note });
    if (!cloud.session()) { panel.replaceChildren(...loginView(), msg); return; }
    try {
      moderator = await cloud.canModerate();
      const head = h('div', { class: 'row' }, h('span', { class: 'grow st', text: cloud.email() ?? '' }),
        h('button', { class: 'btn mini', type: 'button', id: 'cloudOut', text: 'Keluar', onclick: () => { cloud.signOut(); moderator = false; tab = 'mine'; onChange(); render(); } }));
      const tabs = moderator ? h('div', { class: 'tabs' },
        h('button', { class: 'btn mini', type: 'button', id: 'tabMine', 'aria-pressed': String(tab === 'mine'), text: 'Dunia saya', onclick: () => { tab = 'mine'; render(); } }),
        h('button', { class: 'btn mini', type: 'button', id: 'tabReview', 'aria-pressed': String(tab === 'review'), text: 'Tinjau', onclick: () => { tab = 'review'; render(); } })) : null;
      const body = tab === 'review' && moderator ? await reviewView() : await mineView();
      panel.replaceChildren(...[head, tabs, ...body, msg].filter(Boolean)); // filter: replaceChildren(null) menulis teks "null"
      if (expanded) {
        const projects = await cloud.listProjects();
        const p = projects.find((x) => x.id === expanded.id);
        const box = panel.querySelector(`[data-project="${expanded.id}"] [data-detail]`);
        if (p && box) await fillDetail(p, box, expanded.what);
      }
    } catch (e) {
      if (/masuk|Sesi/.test(e.message)) { panel.replaceChildren(...loginView(), h('small', { class: 'msg', text: e.message })); return; }
      panel.replaceChildren(h('p', { text: e.message }), h('button', { class: 'btn', type: 'button', text: 'Coba lagi', onclick: render }));
    }
  }

  // ---------------------------------------------------------------- mode tinjau (moderator)
  async function enterReview(p, kind) {
    const version = kind === 'pending' ? p.pending : p.live;
    const data = await cloud.loadVersion(p.id, version);
    // Tandai mode tinjau SEBELUM memuat: perubahan dari load() tidak boleh sampai ke draf lokal (simpan-otomatis memeriksa ini).
    backup = { project: editor.project, linked };
    reviewing = { id: p.id, version, kind, name: p.name };
    const r = editor.load(data);
    if (!r.ok) {
      backup = null;
      reviewing = null;
      throw new Error(`Versi tidak bisa dibuka: ${r.errors[0]?.msg ?? 'rusak'}`);
    }
    linked = null;
    panel.classList.remove('show');
    document.body.classList.add('review');
    renderReviewBar();
    onChange();
  }

  function renderReviewBar() {
    const r = editor.issues();
    const decide = (approve) => run(async () => {
      let reason = null;
      if (!approve) {
        reason = prompt('Alasan penolakan (wajib, minimal 3 karakter):');
        if (reason == null) return;
      }
      if (approve && !r.ok) { throw new Error('Tidak bisa disetujui: dunia masih punya galat.'); }
      await cloud.decide(reviewing.id, reviewing.version, approve, reason);
      toast(approve ? 'Dunia disetujui dan terbit' : 'Dunia ditolak');
      exitReview();
    }, { rerender: false });
    const takedown = () => run(async () => {
      const reason = prompt('Alasan penarikan paksa (wajib, minimal 3 karakter):');
      if (reason == null) return;
      await cloud.takedown(reviewing.id, reason);
      toast('Dunia ditarik dari publik');
      exitReview();
    }, { rerender: false });
    reviewbar.replaceChildren(
      h('strong', { class: 'grow', text: `Tinjau: ${reviewing.name} · v${reviewing.version} (${reviewing.kind === 'pending' ? 'diajukan' : 'terbit'})` }),
      h('span', { class: 'grow', text: r.errors.length ? `${r.errors.length} galat: ${r.errors[0].msg}` : r.warnings.length ? `${r.warnings.length} peringatan, tanpa galat` : 'Tanpa galat atau peringatan.' }),
      reviewing.kind === 'pending' && h('button', { class: 'btn', type: 'button', id: 'rvApprove', text: 'Setujui', disabled: !r.ok, onclick: () => decide(true) }),
      reviewing.kind === 'pending' && h('button', { class: 'btn danger', type: 'button', id: 'rvReject', text: 'Tolak…', onclick: () => decide(false) }),
      reviewing.kind === 'live' && h('button', { class: 'btn danger', type: 'button', id: 'rvTakedown', text: 'Tarik paksa…', onclick: takedown }),
      h('button', { class: 'btn', type: 'button', id: 'rvExit', text: 'Keluar tinjau', onclick: () => exitReview() }));
  }

  function exitReview() {
    if (!reviewing) return;
    editor.load(backup.project);
    linked = backup.linked;
    backup = null;
    reviewing = null;
    document.body.classList.remove('review');
    reviewbar.replaceChildren();
    onChange();
    if (cloud.session()) { tab = 'review'; panel.classList.add('show'); render(); }
  }

  return api;
}
