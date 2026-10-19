// Klien tipis untuk fungsi server /api/admin/accounts. Hanya membawa token sesi; kunci service role tidak pernah ada di browser.

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa huruf/angka yang mirip (l, I, 1, O, 0)

/** Kata sandi acak yang mudah diketik ulang. Memakai crypto bila ada; tanpa itu menolak daripada menebak lemah. */
export function randomPassword(length = 12, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== 'function') throw new Error('Peramban ini tidak bisa membuat kata sandi acak. Ketik manual.');
  const limit = 256 - (256 % ALPHABET.length); // buang nilai yang membuat sebaran miring
  let out = '';
  while (out.length < length) {
    const buf = cryptoImpl.getRandomValues(new Uint8Array(length * 2));
    for (const b of buf) {
      if (b < limit && out.length < length) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

export function createAdminApi({ client, fetchImpl = globalThis.fetch, endpoint = '/api/admin/accounts' }) {
  async function call(method, body) {
    const token = await client.accessToken();
    const res = await fetchImpl(endpoint, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data && data.message) || `Permintaan gagal (${res.status}).`);
    return data;
  }
  return {
    list: () => call('GET'),
    create: ({ email, password, makeAdmin = false }) => call('POST', { email, password, makeAdmin }),
    setActive: (id, active) => call('PATCH', { id, active }),
    setPassword: (id, password) => call('PATCH', { id, password }),
  };
}
