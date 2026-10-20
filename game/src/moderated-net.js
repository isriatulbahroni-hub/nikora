// Memasang moderasi pada transport LiveKitNet TANPA mengubah kelasnya, lewat dua titik sambung publik:
//  - net.fetch    : menambahkan id perangkat ke permintaan token, menyimpan modToken, dan menolak tamu yang sudah diblokir;
//  - net.sendChat : pesan bersih langsung terkirim (tanpa jaringan tambahan); pesan berkata kasar tidak pernah dikirim ke ruang,
//                   dan dilaporkan ke /api/moderate untuk dihitung sebagai peringatan (3x) lalu dikeluarkan.
// Catatan: obrolan berjalan lewat data channel antar-klien, jadi klien yang dimodifikasi bisa melewati filter ini.
// Untuk penegakan penuh, pesan harus melewati server (lihat catatan di MODERASI.md).
import { BLOCK_MESSAGE, findProfanity } from './moderation.js';

const STORAGE_KEY = 'nikora.deviceId';

const randomId = () => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
};

const defaultStorage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Id perangkat acak yang bertahan di browser ini (dipakai sebagai dasar ban). */
export function getDeviceId(storage = defaultStorage(), rand = randomId) {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (typeof saved === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
  } catch { /* penyimpanan diblokir: pakai id sementara */ }
  const id = rand();
  try { storage?.setItem(STORAGE_KEY, id); } catch { /* abaikan */ }
  return id;
}

export function attachModeration(net, { endpoint = '/api/moderate', storage, fetchImpl, level = 'normal', onNotice, rand } = {}) {
  const post = fetchImpl ?? ((...a) => globalThis.fetch(...a));
  const deviceId = getDeviceId(storage ?? defaultStorage(), rand);
  let modToken = null;
  let modConfig = null; // { level, allow, extra } dari pemilik acara (lewat token)
  const notice = onNotice ?? ((text) => {
    const msg = { t: 'chat', id: 'sistem', name: 'Sistem', text, ts: Date.now() };
    for (const fn of net.handlers?.chat ?? []) fn(msg);
  });

  const origFetch = net.fetch;
  net.fetch = async (url, init) => {
    if (url !== net.tokenUrl) return origFetch(url, init);
    let body = {};
    try { body = JSON.parse(init?.body ?? '{}'); } catch { /* badan bukan JSON: kirim apa adanya */ }
    const res = await origFetch(url, { ...init, body: JSON.stringify({ ...body, deviceId }) });
    let cred = null;
    try { cred = await res.clone().json(); } catch { /* bukan JSON */ }
    if (cred?.reason === 'banned') {
      if (net.room) net.closing = true; // sedang masuk ulang: hentikan percobaan berikutnya
      throw new Error('Anda dikeluarkan dari acara ini.');
    }
    modToken = typeof cred?.modToken === 'string' ? cred.modToken : null;
    modConfig = cred?.modConfig && typeof cred.modConfig === 'object' ? cred.modConfig : null;
    return res;
  };

  const origSend = net.sendChat.bind(net);
  async function report(text) {
    if (!modToken) return origSend(text); // moderasi server mati (tanpa MODERATION_SECRET): perilaku lama, pesan terkirim
    try {
      const res = await post(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modToken, text }) });
      const verdict = await res.json();
      if (verdict?.ok) return origSend(text); // server menilai pesan ini bersih
      notice(typeof verdict?.message === 'string' ? verdict.message : BLOCK_MESSAGE);
      if (verdict?.action === 'ban') {
        net.closing = true;
        net.close();
      }
    } catch {
      notice(BLOCK_MESSAGE);
    }
  }
  net.sendChat = (text) => {
    if (typeof text !== 'string') return;
    if (!findProfanity(text, { level: modConfig?.level ?? level, allow: modConfig?.allow ?? [], extra: modConfig?.extra ?? [] }).flagged) return origSend(text);
    report(text);
  };

  return {
    deviceId,
    detach() {
      net.fetch = origFetch;
      net.sendChat = origSend;
    },
  };
}
