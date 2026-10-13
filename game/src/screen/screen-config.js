// Layar acara (video di dinding + tombol 🎬 + sinkron operator) MATI secara bawaan di semua acara.
// Alasan: video yang menyala di aula mengganggu orang yang sedang menonton acara langsung atau film.
// Tuan rumah menyalakannya per acara dengan menambahkan ?layar=1 pada tautan acara. Kodenya tidak dihapus.
export const SCREEN_PARAM = 'layar';
const ON = new Set(['1', 'true', 'ya', 'on']);

export function isScreenEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const value = new URLSearchParams(search).get(SCREEN_PARAM);
  return value !== null && ON.has(value.trim().toLowerCase());
}

/** Objek layar kosong: antarmukanya sama dengan layar asli, tetapi tidak membuat apa pun dan tidak melakukan apa pun. */
export function disabledScreen() {
  return {
    enabled: false,
    mesh: null,
    controller: null,
    attach() {},
    render() {},
    resize() {},
    tick() {},
  };
}
