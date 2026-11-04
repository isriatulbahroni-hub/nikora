// Tombol dan tombol pintas "Lihat bulan" untuk NIKORA Grand Hotel. Alasannya: kamera orang ketiga hotel mengorbit pemain dan selalu menunduk atau mendatar
// (hotel-main.js: sudut minimum 0,06 rad, bawaan 0,28 rad), jadi bagian atas layar hanya menjangkau sekitar 8 sampai 27 derajat di atas horizon, sedangkan bulan berada
// sekitar 54 derajat di langit. Tanpa jalan untuk menengadah, bulan tidak pernah masuk layar. Menekan tombol Bulan atau B mengarahkan kamera ke bulan dengan halus;
// bila saat itu siang, langit dipindah ke malam sementara (dikembalikan saat selesai). Pergerakan, seret kamera, atau Esc mengakhirinya.
// Fungsi murni diuji di hotel-moon-gaze.test.js; pemasangan ke kamera ada di hotel-sky.js.

export const MOON_GAZE_KEY = 'b';
const CANCEL_KEYS = Object.freeze(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'escape']);

/** Tombol pintas pengalih tatapan ke bulan (huruf B, besar atau kecil). */
export const isGazeToggleKey = (key) => String(key ?? '').toLowerCase() === MOON_GAZE_KEY;
/** Tombol yang mengakhiri tatapan: berjalan (WASD atau panah) dan Esc. */
export const isGazeCancelKey = (key) => CANCEL_KEYS.includes(String(key ?? '').toLowerCase());
/** Pelunak peralihan 0..1 supaya kamera berayun ke bulan dengan awal dan akhir yang lembut. */
export const gazeEase = (k) => {
  const t = Math.min(1, Math.max(0, k));
  return t * t * (3 - 2 * t);
};
/** Bulan belum tampak (siang atau baru terbit): langit perlu dipindah ke malam supaya ada yang dilihat. */
export const needsNight = (moonVisibility) => !(moonVisibility >= 0.3);
/** Ketikan di kolom isian tidak boleh memicu tombol pintas. */
export const isTypingTarget = (target) => !!target?.closest?.('input,textarea,select,[contenteditable="true"]');

/**
 * Memasang tombol Bulan di baris tombol kanan atas (.rbs di hotel.html) dengan gaya tombol yang sudah ada.
 * Tanpa DOM atau tanpa baris itu, tidak berbuat apa-apa (tombol pintas B tetap jalan). Mengembalikan { mounted, setOn(on), dispose() }.
 */
export function mountMoonButton({ onToggle, doc = globalThis.document } = {}) {
  const host = doc?.querySelector?.('.rbs');
  if (!host || !doc.createElement) return { mounted: false, setOn() {}, dispose() {} };
  const button = doc.createElement('button');
  button.id = 'moon-button';
  button.type = 'button';
  button.className = 'rb';
  button.title = 'Lihat bulan (B)';
  button.setAttribute('aria-label', 'Lihat bulan');
  button.setAttribute('aria-pressed', 'false');
  const icon = doc.createElement('span');
  icon.className = 'ic';
  icon.textContent = '\u{1F319}';
  const label = doc.createElement('span');
  label.className = 'lb';
  label.textContent = 'Bulan';
  button.appendChild(icon);
  button.appendChild(label);
  const click = () => onToggle?.();
  button.addEventListener('click', click);
  host.appendChild(button);
  return {
    mounted: true,
    setOn(on) {
      button.setAttribute('aria-pressed', String(!!on));
    },
    dispose() {
      button.removeEventListener('click', click);
      button.remove();
    },
  };
}
