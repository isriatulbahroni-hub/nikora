// Panel "Draf dunia dengan AI" di Studio Dunia (Fase 10.2/10.3). Semua teks dipasang lewat textContent (tidak ada innerHTML),
// karena nama dan peringatan berasal dari keluaran model. Draf TIDAK diterapkan otomatis: kreator melihat ringkasan, lalu memilih.
import { createAiJob } from './ai-world-client.js';
import { AI_POLICY, PROMPT_EXAMPLES } from './ai-world.js';
import { CATALOG, LIMITS } from './world-project.js';

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  Object.assign(n, props);
  n.append(...kids);
  return n;
};

export function initAiUi({ editor, cloud, panel, button, toast, canUse = () => true, onApplied = () => {}, job: injectedJob = null, endpoint, fetchImpl }) {
  let pending = null; // draf dari AI yang belum diterapkan
  let previous = null; // proyek sebelum draf diterapkan, untuk "Kembalikan sebelumnya"
  let busy = false;

  const status = el('div', { className: 'st', textContent: '' });
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const job = injectedJob ?? createAiJob({
    getToken: () => cloud.accessToken(),
    endpoint,
    fetchImpl,
    onState: (s) => {
      if (s.state === 'running') status.textContent = 'AI sedang menyusun draf…';
      else if (s.state === 'retrying') status.textContent = `Mencoba lagi (${s.attempt}/${s.maxAttempts})…`;
    },
  });

  const input = el('textarea', { maxLength: AI_POLICY.promptMax, rows: 4, placeholder: 'Contoh: resepsi taman dengan pelaminan di utara, 8 meja, dan palem di tepi.' });
  input.setAttribute('aria-label', 'Deskripsi dunia');
  const counter = el('small', { className: 'msg' });
  const count = () => { counter.textContent = `${input.value.length}/${AI_POLICY.promptMax}`; };
  input.addEventListener('input', count);

  const examples = el('div', { className: 'row' });
  for (const e of PROMPT_EXAMPLES) {
    examples.append(el('button', { type: 'button', className: 'btn mini', textContent: e.label, onclick: () => { input.value = e.text; count(); } }));
  }

  const makeBtn = el('button', { type: 'button', className: 'btn', textContent: 'Buat draf' });
  const cancelBtn = el('button', { type: 'button', className: 'btn', textContent: 'Batal', hidden: true });
  const restoreBtn = el('button', { type: 'button', className: 'btn', textContent: 'Kembalikan sebelumnya', hidden: true });
  const result = el('div', { className: 'proj' });

  panel.replaceChildren(
    el('h3', { textContent: 'Draf dunia dengan AI' }),
    el('small', { className: 'msg', textContent: 'AI hanya membuat DRAF yang bisa Anda ubah. Hasilnya tidak diterbitkan otomatis; penerbitan tetap lewat ajukan dan tinjauan moderator. Deskripsi dikirim ke penyedia AI untuk diproses.' }),
    examples, input, counter,
    el('div', { className: 'row' }, makeBtn, cancelBtn, restoreBtn),
    status, result,
  );
  count();

  const setBusy = (b) => { busy = b; makeBtn.disabled = b; cancelBtn.hidden = !b; };

  function renderResult() {
    result.replaceChildren();
    if (!pending) return;
    const { project, stats, warnings, dropped, clamped, meta } = pending;
    const byType = new Map();
    for (const p of project.props) byType.set(p.type, (byType.get(p.type) ?? 0) + 1);
    const parts = [...byType].map(([t, n]) => `${n} ${CATALOG[t]?.label ?? t}`);
    const lines = [
      `${project.name} · area ${project.area.halfX * 2}×${project.area.halfZ * 2} m · ${stats.props ?? project.props.length} objek · beban ${stats.weight ?? '?'}/${LIMITS.budget}`,
      parts.join(', ') || 'Belum ada objek.',
    ];
    const lost = Object.values(dropped ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);
    if (lost) lines.push(`${lost} objek dari AI dibuang karena tidak sesuai katalog atau batas.`);
    if (clamped) lines.push(`${clamped} objek digeser masuk ke area dunia.`);
    for (const w of (warnings ?? []).slice(0, 5)) lines.push(`Peringatan: ${w}`);
    if (meta?.model) lines.push(`Dibuat oleh ${meta.model} (templat ${meta.promptVersion}).`);
    for (const l of lines) result.append(el('div', { className: 'st', textContent: l }));
    const apply = el('button', { type: 'button', className: 'btn', textContent: 'Terapkan ke editor' });
    apply.addEventListener('click', applyDraft);
    const discard = el('button', { type: 'button', className: 'btn', textContent: 'Buang' });
    discard.addEventListener('click', () => { pending = null; status.textContent = ''; renderResult(); });
    result.append(el('div', { className: 'row' }, apply, discard));
  }

  function applyDraft() {
    if (!pending) return;
    if (!canUse()) { toast('Selesaikan mode tinjau dulu.'); return; }
    if (editor.project.props.length && !confirm('Ganti seluruh isi dunia dengan draf AI? Riwayat urungkan dikosongkan, tetapi Anda bisa memakai "Kembalikan sebelumnya".')) return;
    const before = structuredClone(editor.project);
    const r = editor.load(pending.project);
    if (!r.ok) { toast(`Draf tidak bisa dibuka: ${r.errors[0]?.msg ?? 'rusak'}`, 4200); return; }
    previous = before;
    pending = null;
    restoreBtn.hidden = false;
    status.textContent = 'Draf diterapkan. Periksa, ubah, lalu simpan.';
    renderResult();
    onApplied();
    panel.classList.remove('show');
    toast('Draf AI diterapkan ke editor', 3000);
  }

  restoreBtn.addEventListener('click', () => {
    if (!previous || !canUse()) return;
    editor.load(previous);
    previous = null;
    restoreBtn.hidden = true;
    status.textContent = 'Isi sebelumnya dikembalikan.';
    onApplied();
  });

  cancelBtn.addEventListener('click', () => job.cancel());

  makeBtn.addEventListener('click', async () => {
    if (busy) return;
    if (!canUse()) { toast('Selesaikan mode tinjau dulu.'); return; }
    pending = null;
    renderResult();
    status.textContent = '';
    setBusy(true);
    const r = await job.run(input.value);
    setBusy(false);
    if (r.state === 'done') {
      pending = r.result;
      status.textContent = 'Draf siap. Periksa ringkasan, lalu terapkan ke editor.';
    } else if (r.state === 'cancelled') {
      status.textContent = 'Dibatalkan.';
    } else {
      const wait = r.error?.retryAfterSec ? ` Coba lagi sekitar ${Math.max(1, Math.ceil(r.error.retryAfterSec / 60))} menit lagi.` : '';
      const detail = r.error?.detail?.length ? ` (${r.error.detail.join('; ')})` : '';
      status.textContent = `${r.error?.message ?? 'Gagal membuat draf.'}${wait}${detail}`;
    }
    renderResult();
  });

  button.addEventListener('click', () => {
    if (!canUse()) { toast('Selesaikan mode tinjau dulu.'); return; }
    const show = !panel.classList.contains('show');
    for (const id of ['cloud', 'issues']) document.getElementById(id)?.classList.remove('show');
    panel.classList.toggle('show', show);
    if (show && !busy && !pending && !cloud.session()) status.textContent = 'Masuk lewat tombol Akun dulu untuk memakai AI.';
  });

  return {
    get pending() { return pending; },
    get busy() { return busy; },
    open() { panel.classList.add('show'); },
    close() { panel.classList.remove('show'); },
  };
}
