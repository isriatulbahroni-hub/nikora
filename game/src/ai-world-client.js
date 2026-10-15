// Pekerjaan AI di sisi klien (Fase 10.2): satu pekerjaan sekali jalan dengan status, percobaan ulang, dan pembatalan.
// Tanpa DOM. Hasil dari server tetap divalidasi ulang di sini (validateProject) sebelum boleh dipakai editor.
import { sanitizePrompt } from './ai-world.js';
import { validateProject } from './world-project.js';

export const MESSAGES = Object.freeze({
  auth: 'Masuk ke akun dulu untuk memakai AI.',
  batas: 'Batas pemakaian AI tercapai. Coba lagi nanti.',
  prompt: 'Deskripsi tidak valid.',
  ai_off: 'Fitur AI sedang tidak aktif.',
  jaringan: 'Tidak bisa terhubung ke server.',
  ai_busy: 'Layanan AI sedang sibuk.',
  ai_config: 'Layanan AI belum dikonfigurasi dengan benar.',
  terpotong: 'Hasil AI terpotong. Coba deskripsi yang lebih singkat.',
  draf_tidak_valid: 'Hasil AI tidak memenuhi aturan dunia.',
  server: 'Terjadi galat di server.',
  sibuk: 'Masih ada permintaan yang berjalan.',
  dibatalkan: 'Dibatalkan.',
});
const RETRYABLE = new Set(['jaringan', 'ai_busy', 'terpotong', 'draf_tidak_valid']);

/** state: idle | running | retrying | done | failed | cancelled */
export function createAiJob({
  getToken, fetchImpl = globalThis.fetch, endpoint = '/api/ai-world', maxAttempts = 2,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onState = () => {},
}) {
  let state = 'idle';
  let ctrl = null;
  const set = (s, extra = {}) => { state = s; onState({ state: s, ...extra }); };

  async function attempt(prompt, signal) {
    let token;
    try { token = await getToken(); } catch { return { ok: false, code: 'auth' }; }
    let res;
    try {
      res = await fetchImpl(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ prompt }), signal });
    } catch (e) {
      return { ok: false, code: signal.aborted ? 'dibatalkan' : 'jaringan' };
    }
    const data = await res.json().catch(() => null);
    if (res.ok) {
      const v = data?.project ? validateProject(data.project) : null;
      if (!v?.ok) return { ok: false, code: 'draf_tidak_valid', detail: v ? v.errors.slice(0, 3).map((e) => e.msg) : undefined };
      return { ok: true, result: { project: v.project, warnings: Array.isArray(data.warnings) ? data.warnings.map(String).slice(0, 10) : [], dropped: data.dropped ?? {}, clamped: data.clamped ?? 0, stats: data.stats ?? {}, meta: data.meta ?? {} } };
    }
    const code = typeof data?.error === 'string' && Object.hasOwn(MESSAGES, data.error) ? data.error : res.status === 401 ? 'auth' : 'server';
    return { ok: false, code, retryAfterSec: data?.retryAfterSec, detail: Array.isArray(data?.errors) ? data.errors.map(String).slice(0, 3) : undefined };
  }

  return {
    get state() { return state; },
    cancel() { if (ctrl) ctrl.abort(); },
    /** Selalu resolve: { state: 'done', result } atau { state: 'failed' | 'cancelled', error: { code, message } }. */
    async run(prompt) {
      if (state === 'running' || state === 'retrying') return { state: 'failed', error: { code: 'sibuk', message: MESSAGES.sibuk }, attempts: 0 };
      const p = sanitizePrompt(prompt);
      if (!p.ok) { set('failed', { error: p.message }); return { state: 'failed', error: { code: 'prompt', message: p.message }, attempts: 0 }; }
      ctrl = new AbortController();
      const { signal } = ctrl;
      let last = null;
      let n = 0;
      while (n < maxAttempts) {
        n++;
        set(n === 1 ? 'running' : 'retrying', { attempt: n, maxAttempts });
        last = await attempt(p.text, signal);
        if (last.ok) { set('done', { attempt: n }); return { state: 'done', result: last.result, attempts: n }; }
        if (signal.aborted || last.code === 'dibatalkan') break;
        if (!RETRYABLE.has(last.code) || n >= maxAttempts) break;
        await sleep(1500 * n);
        if (signal.aborted) break;
      }
      ctrl = null;
      if (signal.aborted || last?.code === 'dibatalkan') { set('cancelled'); return { state: 'cancelled', error: { code: 'dibatalkan', message: MESSAGES.dibatalkan }, attempts: n }; }
      const error = { code: last.code, message: MESSAGES[last.code] ?? MESSAGES.server, retryAfterSec: last.retryAfterSec, detail: last.detail };
      set('failed', { error: error.message });
      return { state: 'failed', error, attempts: n };
    },
  };
}
