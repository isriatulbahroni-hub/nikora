// Data murni untuk dekorasi dan antarmuka ruangan Masjid Agung NIKORA (tanpa THREE, mudah diuji).
import { DOORS } from './masjid-layout.js';

// Tulisan Arab pada panel dinding: potongan ayat dan hadits pendek, ditulis bertumpuk per kata seperti pada rancangan.
export const ARABIC = Object.freeze({
  allah: 'الله',
  quran: 'القرآن',
  iqra: Object.freeze(['اقرأ', 'باسم', 'ربك']), // Al-'Alaq: 1
  rattil: Object.freeze(['ورتل', 'القرآن', 'ترتيلا']), // Al-Muzzammil: 4
  marriage: Object.freeze(['وجعل', 'بينكم', 'مودة', 'ورحمة']), // Ar-Rum: 21
  taharah: Object.freeze(['الطهور', 'شطر', 'الإيمان']), // HR. Muslim
});

// Surat Al-Fatihah (7 ayat) untuk kartu "Baca Qur'an" di Ruang Tahfidz. Mohon diperiksa ahli sebelum dipublikasikan.
export const FATIHAH = Object.freeze([
  'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ',
  'الرَّحْمَٰنِ الرَّحِيمِ',
  'مَالِكِ يَوْمِ الدِّينِ',
  'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
  'اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ',
  'صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ',
]);

export const HADITH_TAHFIDZ = Object.freeze({
  lines: Object.freeze(['“Sebaik-baik kalian adalah', 'yang belajar Al-Qur’an dan', 'mengajarkannya.”']),
  source: 'HR. Bukhari',
});

export const WUDHU_MOTTO = Object.freeze({
  putra: Object.freeze(['Bersihkan diri,', 'suci hati, dekat dengan Allah']),
  putri: Object.freeze(['Menjaga kesucian,', 'meraih keberkahan']),
});

// Tombol aksi yang muncul di sudut kanan bawah sesuai jenis ruangan (kind dari world.roomAt).
export const ROOM_ACTIONS = Object.freeze({
  study: Object.freeze([
    Object.freeze({ id: 'quran', label: `Baca Qur'an`, icon: '📖' }),
    Object.freeze({ id: 'belajar', label: 'Belajar', icon: '🧎' }),
  ]),
});

/**
 * Titik-titik di sepanjang dinding ruangan untuk menempel dekorasi selebar `w`, menghindari pintu.
 * side: 'n' | 's' | 'e' | 'w'. Mengembalikan koordinat tengah (x untuk n/s, z untuk e/w).
 */
export function wallSlots(r, side, w, gap = 5.8, margin = 4, avoid = 2) {
  const [x1, z1, x2, z2] = r.rect;
  const horizontal = side === 'n' || side === 's';
  const lo = (horizontal ? x1 : z1) + margin + w / 2;
  const hi = (horizontal ? x2 : z2) - margin - w / 2;
  const coord = side === 'n' ? z1 : side === 's' ? z2 : side === 'w' ? x1 : x2;
  const spans = DOORS.filter((d) => (horizontal ? d.orient === 'h' && Math.abs(d.z - coord) < 1e-6 : d.orient === 'v' && Math.abs(d.x - coord) < 1e-6)).map((d) => {
    const c = horizontal ? d.x : d.z;
    return [c - d.width / 2 - avoid, c + d.width / 2 + avoid];
  });
  const out = [];
  for (let c = lo; c <= hi + 1e-6; c += w + gap) {
    if (!spans.some(([a, b]) => c + w / 2 > a && c - w / 2 < b)) out.push(c);
  }
  return out;
}
