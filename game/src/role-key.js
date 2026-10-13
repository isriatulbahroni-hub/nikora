// Kunci peran (pemilik acara / MC) dibawa lewat ?key=... pada tautan privat. Disimpan untuk sesi tab ini saja dan
// dihapus dari URL supaya tidak ikut tersalin, terbagikan, atau muncul di tangkapan layar. Server yang memeriksa keabsahannya.
const FORMAT = /^(owner|mc)-[A-Za-z0-9_-]{24}$/;
const STORE = 'orbit-role-key';

export function takeRoleKey({ search = '', storage = null, replaceSearch = () => {} } = {}) {
  const params = new URLSearchParams(search);
  const fromUrl = params.get('key');
  const read = () => {
    try {
      return storage?.getItem(STORE) ?? '';
    } catch {
      return '';
    }
  };
  if (fromUrl !== null) {
    params.delete('key');
    const rest = params.toString();
    replaceSearch(rest ? `?${rest}` : '');
    if (FORMAT.test(fromUrl)) {
      try {
        storage?.setItem(STORE, fromUrl);
      } catch {
        /* penyimpanan tidak tersedia: kunci hanya berlaku untuk muatan halaman ini */
      }
      return fromUrl;
    }
    return read(); // kunci salah format diabaikan
  }
  const stored = read();
  return FORMAT.test(stored) ? stored : '';
}
