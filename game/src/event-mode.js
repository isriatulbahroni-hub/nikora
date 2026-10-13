// Mode acara: perilaku suara menyesuaikan jenis acara. Pemilik undangan bisa menimpa lewat invitations.extra.mode.
// "duck" = pengali volume obrolan jamaah saat panggung (ustaz/MC) berbicara (1 = tidak dikecilkan).
export const MODES = Object.freeze({
  umum: { label: 'Umum', duck: 0.3 }, // pernikahan, ulang tahun, dll.: MC jelas, tamu tetap bisa ngobrol
  kajian: { label: 'Kajian', duck: 0.2 }, // tazkirah/tarannum: fokus ke ustaz, jamaah masih bisa berbisik
  pesta: { label: 'Pesta', duck: 1 }, // karaoke/komunitas: semua bebas, tanpa pengecilan
});

const BY_TYPE = { tazkirah: 'kajian', tarannum: 'kajian', karaoke: 'pesta', komunitas: 'pesta' };

export function modeFor(eventType, override) {
  const id = Object.hasOwn(MODES, override) ? override : (BY_TYPE[eventType] ?? 'umum');
  return { id, ...MODES[id] };
}
