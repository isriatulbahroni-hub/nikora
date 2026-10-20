// Panel pemilik acara untuk moderasi: daftar pelanggar, buka blokir, dan pengaturan kata per acara.
// Otorisasi memakai kunci pemilik per acara (sama dengan peran 'owner' di token-issuer); MC tidak boleh.
import { cleanSettings, moderationSecret, storeFromEnv } from './moderation-server.js';
import { isEventSlug, roleSecret, verifyRoleKey } from './token-issuer.js';

const HASH = /^[A-Za-z0-9_-]{16,64}$/;

/** body: { event, key, op: 'list' | 'unban' | 'get-settings' | 'set-settings', device?, settings? } -> { status, json } */
export async function handleAdmin({ body, env = process.env, store, fetchImpl } = {}) {
  if (!moderationSecret(env)) return { status: 200, json: { ok: false, disabled: true } };
  const event = body?.event;
  if (!isEventSlug(event)) return { status: 400, json: { ok: false, error: 'event' } };
  const rs = roleSecret(env);
  if (!rs || verifyRoleKey(rs, event, body?.key) !== 'owner') return { status: 403, json: { ok: false, error: 'bukan pemilik acara' } };
  const st = store ?? storeFromEnv(env, fetchImpl);
  if (!st) return { status: 503, json: { ok: false, error: 'penyimpanan belum dikonfigurasi' } };
  try {
    switch (body?.op) {
      case 'list':
        return { status: 200, json: { ok: true, violators: await st.listViolators(event) } };
      case 'unban': {
        if (!HASH.test(body?.device ?? '')) return { status: 400, json: { ok: false, error: 'device' } };
        return { status: 200, json: { ok: true, unbanned: await st.unban(event, body.device) } };
      }
      case 'get-settings':
        return { status: 200, json: { ok: true, settings: (await st.getSettings(event)) ?? cleanSettings({}) } };
      case 'set-settings':
        return { status: 200, json: { ok: true, settings: await st.setSettings(event, body.settings) } };
      default:
        return { status: 400, json: { ok: false, error: 'op' } };
    }
  } catch (error) {
    console.error('[moderasi-admin]', error?.message);
    return { status: 500, json: { ok: false, error: 'gagal' } };
  }
}
