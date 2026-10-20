// Kartu check-in di sisi klien LiveKit. Dipasang ke LiveKitNet (lihat konstruktornya), tanpa mengubah alur lainnya:
//  * kode kartu diambil dari ?card=... (tautan dari pemilik acara) atau dari penyimpanan perangkat untuk acara ini;
//  * kode dikirim ke /api/token, yang memeriksanya di server; hasil sah masuk ke metadata token (bertanda tangan server);
//  * net.hasCard(id) memberi tahu apakah suatu peserta boleh check-in kamar: diri sendiri dari hasil server, peserta lain
//    dari metadata tokennya (tidak bisa dipalsukan lewat pesan data).
// Bila server tidak mewajibkan kartu (CHECKIN_CARD_REQUIRED tidak dipasang), hasCard selalu true dan perilaku lama tidak berubah.

export const CARD_STORE_PREFIX = 'orbit-card:';

/** Kode kartu: 12 heksadesimal (sama dengan database dan server). Pemisah dan huruf kecil diterima; selain itu ''. */
export function normalizeCode(value) {
  if (typeof value !== 'string' || value.length > 24) return '';
  const code = value.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return /^[0-9A-F]{12}$/.test(code) ? code : '';
}

/** Kartu dari metadata peserta (diisi server). null bila tidak ada. */
export function cardOf(participant) {
  try {
    const card = JSON.parse(participant?.metadata || 'null')?.card;
    if (!card || typeof card !== 'object') return null;
    return { room: typeof card.rm === 'string' ? card.rm.slice(0, 40) : '' };
  } catch {
    return null;
  }
}

const safeStorage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Kode awal: ?card= menang atas yang tersimpan; yang tersimpan hanya berlaku untuk acara yang sama. */
export function cardFromContext({ search = '', storage = null, event = null } = {}) {
  const fromUrl = normalizeCode(new URLSearchParams(search).get('card'));
  if (fromUrl) return fromUrl;
  if (!event || !storage) return '';
  try {
    return normalizeCode(storage.getItem(`${CARD_STORE_PREFIX}${event}`));
  } catch {
    return '';
  }
}

export function attachCard(net, { search = globalThis.location?.search ?? '', storage = safeStorage() } = {}) {
  net.card = cardFromContext({ search, storage, event: net.event });
  net.cardRequired = false; // diketahui dari jawaban server saat masuk
  net.cardState = null; // { ok, room?, until?, reason? } bila kode dikirim

  // Sisipkan kode ke permintaan token dan baca jawabannya. Dibungkus di fetch supaya alur masuk/masuk-ulang yang ada tidak berubah.
  const base = net.fetch;
  net.fetch = async (url, init) => {
    if (url !== net.tokenUrl) return base(url, init);
    let next = init;
    try {
      const body = JSON.parse(init?.body ?? '{}');
      if (net.card) body.card = net.card;
      next = { ...init, body: JSON.stringify(body) };
    } catch {
      /* badan bukan JSON: kirim apa adanya */
    }
    const res = await base(url, next);
    return {
      ok: res.ok,
      status: res.status,
      json: async () => {
        const data = await res.json();
        net.cardRequired = Boolean(data && data.cardRequired);
        net.cardState = data && data.card && typeof data.card === 'object' ? { ok: data.card.ok === true, room: typeof data.card.room === 'string' ? data.card.room.slice(0, 40) : '', until: data.card.until ?? null, reason: data.card.reason ?? null } : null;
        return data;
      },
    };
  };

  /** Boleh check-in kamar? Tanpa kewajiban kartu: semua boleh. Diri sendiri dari jawaban server; peserta lain dari metadata tokennya. */
  net.hasCard = (id) => {
    if (!net.cardRequired) return true;
    if (id === net.id) return net.cardState?.ok === true;
    return Boolean(cardOf(net.room?.remoteParticipants?.get(id)));
  };

  /**
   * Pakai kode baru: simpan, lalu putus sambungan. LiveKitNet otomatis masuk lagi dengan token baru yang memuat hasil pemeriksaan kartu.
   * Mengembalikan false bila format kode salah (tidak ada yang berubah).
   */
  net.applyCard = (value) => {
    const code = normalizeCode(value);
    if (!code) return false;
    net.card = code;
    try {
      if (net.event && storage) storage.setItem(`${CARD_STORE_PREFIX}${net.event}`, code);
    } catch {
      /* penyimpanan diblokir: kode tetap dipakai selama halaman terbuka */
    }
    net.room?.disconnect();
    return true;
  };
  return net;
}
