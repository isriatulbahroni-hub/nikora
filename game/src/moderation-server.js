// Penegakan moderasi di server: strike per perangkat per acara, ban, dan kick dari LiveKit.
// Tanpa MODERATION_SECRET fitur ini mati total (tidak mengubah perilaku apa pun).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { actionFor, BAN_MESSAGE, BLOCK_MESSAGE, findProfanity, MAX_WARNINGS, warningMessage } from './moderation.js';

export const MODERATION_SECRET_VAR = 'MODERATION_SECRET';
const MIN_SECRET_LENGTH = 16;
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

const clean = (raw) => (typeof raw === 'string' ? raw.trim().replace(/^(['"])(.*)\1$/, '$2').trim() : '');

export function moderationSecret(env) {
  const secret = clean(env?.[MODERATION_SECRET_VAR]);
  return secret.length >= MIN_SECRET_LENGTH ? secret : '';
}

/** Id perangkat dibuat browser (acak). Server tidak menyimpan nilai aslinya, hanya HMAC-nya. */
export const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
export const hashDevice = (secret, deviceId) => createHmac('sha256', secret).update(`dev:${deviceId}`).digest('base64url').slice(0, 32);

const sign = (secret, body) => createHmac('sha256', secret).update(`mod:${body}`).digest('base64url');

/** Token moderasi: klaim { id, room, ev, dh, exp } bertanda tangan, supaya klien tidak bisa melapor atas nama orang lain. */
export function signModToken(secret, claims) {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${sign(secret, body)}`;
}

export function verifyModToken(secret, token, nowMs = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const given = Buffer.from(parts[1]);
  const expected = Buffer.from(sign(secret, parts[0]));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  } catch {
    return null;
  }
  const ok = claims && typeof claims === 'object' && typeof claims.exp === 'number' && claims.exp >= nowMs
    && ['id', 'room', 'ev', 'dh'].every((k) => typeof claims[k] === 'string' && claims[k]);
  return ok ? claims : null;
}

export const newModToken = (secret, { id, room, ev, dh, nm }, nowMs = Date.now()) => signModToken(secret, { id, room, ev, dh, ...(nm ? { nm: String(nm).slice(0, 24) } : {}), exp: nowMs + TOKEN_TTL_MS });

/** Pengaturan moderasi per acara (diatur pemilik): tingkat, kata yang diizinkan, kata tambahan. */
export const WORD = /^[a-z0-9]{2,24}$/;
export function cleanSettings(raw) {
  const list = (v) => [...new Set((Array.isArray(v) ? v : []).map((w) => String(w).toLowerCase().trim()).filter((w) => WORD.test(w)))].slice(0, 50);
  return { level: raw?.level === 'ketat' ? 'ketat' : 'normal', allow: list(raw?.allow), extra: list(raw?.extra) };
}

/** Penyimpanan di memori (uji/pengembangan). Tidak bertahan antar pemanggilan serverless. */
export function memoryStore() {
  const rows = new Map();
  const settings = new Map();
  const key = (e, d) => `${e}|${d}`;
  return {
    async isBanned(e, d) { return rows.get(key(e, d))?.banned === true; },
    async addStrike(e, d, max, name) {
      const r = rows.get(key(e, d)) ?? { event: e, device_hash: d, strikes: 0, banned: false };
      r.strikes += 1;
      if (name) r.last_name = name;
      if (r.strikes > max) r.banned = true;
      rows.set(key(e, d), r);
      return { strikes: r.strikes, banned: r.banned };
    },
    async listViolators(e) { return [...rows.values()].filter((r) => r.event === e).map((r) => ({ device_hash: r.device_hash, last_name: r.last_name ?? null, strikes: r.strikes, banned: r.banned })); },
    async unban(e, d) { const r = rows.get(key(e, d)); if (!r) return false; r.banned = false; r.strikes = 0; return true; },
    async getSettings(e) { return settings.get(e) ?? null; },
    async setSettings(e, cfg) { settings.set(e, cleanSettings(cfg)); return settings.get(e); },
  };
}

/** Penyimpanan Supabase (REST + fungsi moderation_strike, lihat migrasi). Butuh service role: hanya di server. */
export function supabaseStore({ url, key, fetchImpl = (...a) => globalThis.fetch(...a) }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  return {
    async isBanned(e, d) {
      const res = await fetchImpl(`${base}/guest_moderation?event=eq.${encodeURIComponent(e)}&device_hash=eq.${encodeURIComponent(d)}&select=banned&limit=1`, { headers });
      if (!res.ok) throw new Error(`moderasi HTTP ${res.status}`);
      const rows = await res.json();
      return Array.isArray(rows) && rows[0]?.banned === true;
    },
    async addStrike(e, d, max, name) {
      const res = await fetchImpl(`${base}/rpc/moderation_strike`, { method: 'POST', headers, body: JSON.stringify({ p_event: e, p_device: d, p_max: max, p_name: name ?? null }) });
      if (!res.ok) throw new Error(`moderasi HTTP ${res.status}`);
      const rows = await res.json();
      const row = Array.isArray(rows) ? rows[0] : rows;
      return { strikes: Number(row?.out_strikes) || 0, banned: row?.out_banned === true };
    },
    async listViolators(e) {
      const res = await fetchImpl(`${base}/guest_moderation?event=eq.${encodeURIComponent(e)}&strikes=gt.0&select=device_hash,last_name,strikes,banned,banned_at,updated_at&order=updated_at.desc&limit=100`, { headers });
      if (!res.ok) throw new Error(`moderasi HTTP ${res.status}`);
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    },
    async unban(e, d) {
      const res = await fetchImpl(`${base}/guest_moderation?event=eq.${encodeURIComponent(e)}&device_hash=eq.${encodeURIComponent(d)}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ banned: false, strikes: 0, banned_at: null, reason: null, updated_at: new Date().toISOString() }) });
      if (!res.ok) throw new Error(`moderasi HTTP ${res.status}`);
      const rows = await res.json();
      return Array.isArray(rows) && rows.length > 0;
    },
    async getSettings(e) {
      const res = await fetchImpl(`${base}/moderation_settings?event=eq.${encodeURIComponent(e)}&select=level,allow,extra&limit=1`, { headers });
      if (!res.ok) throw new Error(`moderasi HTTP ${res.status}`);
      const rows = await res.json();
      return Array.isArray(rows) && rows[0] ? cleanSettings(rows[0]) : null;
    },
    async setSettings(e, cfg) {
      const clean = cleanSettings(cfg);
      const res = await fetchImpl(`${base}/moderation_settings?on_conflict=event`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ event: e, ...clean, updated_at: new Date().toISOString() }) });
      if (!res.ok) throw new Error(`moderasi HTTP ${res.status}`);
      return clean;
    },
  };
}

/** null bila Supabase/service role belum dikonfigurasi (strike tidak bisa disimpan). */
export function storeFromEnv(env = process.env, fetchImpl) {
  const url = clean(env?.SUPABASE_URL) || clean(env?.VITE_SUPABASE_URL);
  const key = clean(env?.SUPABASE_SERVICE_ROLE_KEY);
  return url && key ? supabaseStore({ url, key, ...(fetchImpl ? { fetchImpl } : {}) }) : null;
}

/**
 * Tangani laporan pesan dari klien: { modToken, text }. Mengembalikan { status, json } untuk fungsi serverless.
 * remove(room, identity) dipanggil saat tamu harus dikeluarkan dari ruang LiveKit.
 * Server menilai ulang teksnya sendiri; klien tidak bisa memicu strike untuk teks yang bersih.
 */
export async function handleModeration({ body, env = process.env, store, remove, now = Date.now(), fetchImpl } = {}) {
  const secret = moderationSecret(env);
  if (!secret) return { status: 200, json: { ok: true, disabled: true } };
  const claims = verifyModToken(secret, body?.modToken, now);
  if (!claims) return { status: 401, json: { ok: false, error: 'token' } };
  const text = typeof body?.text === 'string' ? body.text.slice(0, 500) : '';
  const envLevel = clean(env.MODERATION_LEVEL) === 'ketat' ? 'ketat' : 'normal';
  const blocked = { status: 200, json: { ok: false, action: 'block', message: BLOCK_MESSAGE } };
  const st = store ?? storeFromEnv(env, fetchImpl);
  let cfg = null;
  try {
    cfg = (await st?.getSettings?.(claims.ev)) ?? null; // pengaturan pemilik acara (gagal dibaca: pakai bawaan)
  } catch (error) {
    console.error('[moderasi] pengaturan', error?.message);
  }
  const flagged = findProfanity(text, { level: cfg?.level ?? envLevel, allow: cfg?.allow ?? [], extra: cfg?.extra ?? [] }).flagged;
  if (!flagged) return { status: 200, json: { ok: true } };
  if (!st) return blocked; // tanpa penyimpanan: pesan tetap ditahan, tetapi tidak ada strike
  let result;
  try {
    result = await st.addStrike(claims.ev, claims.dh, MAX_WARNINGS, claims.nm);
  } catch (error) {
    console.error('[moderasi]', error?.message);
    return blocked;
  }
  const decision = actionFor(result.strikes);
  if (decision.action === 'ban') {
    try {
      await remove?.(claims.room, claims.id);
    } catch (error) {
      console.error('[moderasi] gagal mengeluarkan peserta', error?.message);
    }
    return { status: 200, json: { ok: false, action: 'ban', message: BAN_MESSAGE } };
  }
  return { status: 200, json: { ok: false, action: 'warn', strikes: result.strikes, remaining: decision.remaining, message: warningMessage(result.strikes) } };
}
