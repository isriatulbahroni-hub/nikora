// Gerbang AI (Fase 10.1/10.2), sisi server. Logika dipisah dari api/ai-world.js supaya bisa dites tanpa Vercel.
//
// Alur: metode -> konfigurasi -> autentikasi (token sesi Supabase diperiksa ke Supabase) -> deskripsi -> batas laju ->
// panggil Anthropic -> bentuk ulang + validasi (draftFromModel) -> kirim draf. Rahasia (ANTHROPIC_API_KEY) tidak pernah keluar dari server,
// deskripsi pengguna tidak dicatat di log, dan hasil tidak pernah diterbitkan otomatis.
import { AI_POLICY, sanitizePrompt, buildPayload, extractJson, draftFromModel, createLimiter } from './ai-world.js';

export const DEFAULT_MODEL = 'claude-haiku-5-5'; // murah dan cukup untuk tata letak; ganti lewat AI_WORLD_MODEL
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const RETRYABLE_UPSTREAM = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
const BEARER = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/i;

const int = (v, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };
const out = (status, json, headers) => ({ status, json, headers });

export function createAiWorldHandler({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now, log = console } = {}) {
  const perUser = createLimiter({ max: int(env.AI_WORLD_PER_HOUR, 5), windowMs: 3_600_000, now });
  const perDay = createLimiter({ max: int(env.AI_WORLD_DAILY_CAP, 100), windowMs: 86_400_000, now });

  async function verifyUser(token, url, anon) {
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const user = await res.json().catch(() => null);
    return typeof user?.id === 'string' && user.id ? user.id : null;
  }

  return async function handle({ method, authorization, body } = {}) {
    if (method !== 'POST') return out(405, { error: 'metode' });

    const key = env.ANTHROPIC_API_KEY;
    const supaUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const supaAnon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
    // Tanpa kunci AI atau tanpa Supabase (untuk memastikan siapa pemanggilnya) fitur mati; tidak pernah terbuka untuk anonim.
    if (!key || !supaUrl || !supaAnon || env.AI_WORLD_DISABLED === '1') return out(503, { error: 'ai_off' });

    const m = BEARER.exec(typeof authorization === 'string' ? authorization : '');
    if (!m) return out(401, { error: 'auth' });
    let userId;
    try { userId = await verifyUser(m[1], supaUrl, supaAnon); } catch { return out(502, { error: 'ai_busy', retryable: true }); }
    if (!userId) return out(401, { error: 'auth' });

    const p = sanitizePrompt(body?.prompt);
    if (!p.ok) return out(400, { error: 'prompt', message: p.message });

    const u = perUser.take(userId);
    if (!u.ok) return out(429, { error: 'batas', retryAfterSec: u.retryAfterSec }, { 'Retry-After': String(u.retryAfterSec) });
    const d = perDay.take('global');
    if (!d.ok) return out(429, { error: 'batas', retryAfterSec: d.retryAfterSec }, { 'Retry-After': String(d.retryAfterSec) });

    const model = env.AI_WORLD_MODEL || DEFAULT_MODEL;
    let res;
    try {
      res = await fetchImpl(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(buildPayload({ prompt: p.text, model })),
        signal: AbortSignal.timeout(int(env.AI_WORLD_TIMEOUT_MS, 50_000)),
      });
    } catch {
      log.warn('[ai-world] upstream tidak terjangkau');
      return out(502, { error: 'ai_busy', retryable: true });
    }
    if (!res.ok) {
      const retryable = RETRYABLE_UPSTREAM.has(res.status);
      log.warn(`[ai-world] upstream ${res.status}`);
      return out(502, { error: retryable ? 'ai_busy' : 'ai_config', retryable });
    }
    const data = await res.json().catch(() => null);
    if (data?.stop_reason === 'max_tokens') return out(502, { error: 'terpotong', retryable: true });
    const text = Array.isArray(data?.content) ? data.content.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('') : '';

    const j = extractJson(text);
    const draft = j.ok ? draftFromModel(j.value) : null;
    if (!draft?.ok) {
      log.info('[ai-world] draf ditolak', JSON.stringify({ code: j.ok ? 'validasi' : j.code }));
      const errors = draft ? draft.errors.slice(0, 3).map((e) => e.msg) : [j.message];
      return out(422, { error: 'draf_tidak_valid', retryable: true, errors });
    }

    const usage = { input: Number(data?.usage?.input_tokens) || 0, output: Number(data?.usage?.output_tokens) || 0 };
    log.info('[ai-world] ok', JSON.stringify({ model, props: draft.stats.props, ...usage })); // tanpa deskripsi dan tanpa ID pengguna
    return out(200, {
      project: draft.project,
      warnings: draft.warnings.slice(0, 10).map((w) => w.msg),
      dropped: draft.dropped,
      clamped: draft.clamped,
      stats: draft.stats,
      meta: { model, promptVersion: AI_POLICY.promptVersion, createdAt: new Date(now()).toISOString(), usage },
    });
  };
}
