import { randomUUID } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';

export const VOICE_ROOM = 'orbit-hall';

export function cleanName(raw) {
  if (typeof raw !== 'string') return 'Tamu';
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24) || 'Tamu';
}

/** Terbitkan identitas + token LiveKit untuk satu tamu. { enabled:false } bila LiveKit belum dikonfigurasi. */
export async function issueToken({ env = process.env, name } = {}) {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = env;
  if (!url || !key || !secret) return { enabled: false };
  const id = randomUUID().slice(0, 8);
  const at = new AccessToken(key, secret, { identity: id, name: cleanName(name), ttl: '2h' });
  at.addGrant({ roomJoin: true, room: VOICE_ROOM, canPublish: true, canPublishData: true, canSubscribe: true });
  return { enabled: true, url, token: await at.toJwt(), id };
}
