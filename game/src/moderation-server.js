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

export const newModToken = (secret, { id, room, ev, dh }, nowMs = Date.now()) => signModToken(secret, { id, room, ev, dh, exp: nowMs + TOKEN_TTL_MS });

/** Penyimpanan di memori (uji/pengembangan). Tidak bertahan antar pemanggilan serverless. */
export function memoryStore() {
  const rows = new Map();
  const key = (e, d) => `${e}|${d}`;
  return {
    async isBanned(e, d) { return rows.get(key(e, d))?.banned === true; },
    async addStrike(e, d, max) {
      const r = rows.get(key(e, d)) ?? { strikes: 0, banned: false };
      r.strikes += 1;
      if (r.strikes > max) r.banned = true;
      rows.set(key(e, d), r);
      return { strikes: r.strikes, banned: r.banned };
    },
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
    async addStrike(e, d, max) {
      const res = await fetchImpl(`${base}/rpc/moderation_strike`, { method: 'POST', headers, body: JSON.stringify({ p_event: e, p_device: d, p_max: max }) });
      if (!res.ok) throw new Error(`moderasi HTTP ${res.status}`);
      const rows = await res.json();
      const row = Array.isArray(rows) ? rows[0] : rows;
      return { strikes: Number(row?.out_strikes) || 0, banned: row?.out_banned === true };
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
  const level = clean(env.MODERATION_LEVEL) === 'ketat' ? 'ketat' : 'normal';
  if (!findProfanity(text, { level }).flagged) return { status: 200, json: { ok: true } };

  const blocked = { status: 200, json: { ok: false, action: 'block', message: BLOCK_MESSAGE } };
  const st = store ?? storeFromEnv(env, fetchImpl);
  if (!st) return blocked; // tanpa penyimpanan: pesan tetap ditahan, tetapi tidak ada strike
  let result;
  try {
    result = await st.addStrike(claims.ev, claims.dh, MAX_WARNINGS);
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
