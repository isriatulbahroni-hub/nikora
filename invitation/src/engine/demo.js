import { getTheme } from '../themes/index.js';
import { defaultScenes } from './config.js';

const DATE = '2026-12-12T10:00:00+08:00';

/** Data contoh agar setiap tema bisa dicoba tanpa database: ?tema=<id> */
export function demoInvitation(themeId) {
  const theme = getTheme(themeId) || getTheme('pernikahan-taman');
  const base = { slug: 'demo', event_type: theme.eventType, theme: theme.id, event_date: DATE };
  switch (theme.eventType) {
    case 'ulang_tahun':
      return { ...base, groom: 'Aira', bride: '', event_date: '2026-12-12T15:00:00+07:00', extra: { title: 'Aira berusia 7 tahun', hosts: 'Ayah Fajar & Bunda Nisa' } };
    case 'khitanan':
      return { ...base, groom: 'Dimas', bride: '', extra: { title: 'Khitanan Dimas', tz: 'Asia/Makassar', hosts: 'Bapak Ahmad & Ibu Siti' } };
    case 'tazkirah':
      return { ...base, groom: 'Tazkirah', bride: '', extra: { title: 'Tazkirah Akbar: Menata Hati', tz: 'Asia/Makassar', hosts: 'Panitia Majelis Al-Ikhlas' } };
    case 'tarannum':
      return { ...base, groom: 'Tarannum', bride: '', extra: { title: 'Malam Tarannum Nusantara', tz: 'Asia/Makassar', hosts: 'Panitia Festival Qur’an' } };
    case 'karaoke':
      return { ...base, groom: 'Karaoke', bride: '', event_date: '2026-12-12T19:30:00+07:00', extra: { title: 'Malam Karaoke Bareng', hosts: 'Tim Kantor Lantai 3' } };
    case 'komunitas':
      return { ...base, groom: 'Komunitas', bride: '', event_date: '2026-12-12T09:00:00+07:00', extra: { title: 'Temu Komunitas Lombok', hosts: 'Pengurus Komunitas' } };
    default:
      return { ...base, groom: 'Dimas', bride: 'Rani', extra: { tz: 'Asia/Makassar', hosts: 'Bapak Ahmad & Ibu Siti · Bapak Hadi & Ibu Lina' } };
  }
}

const GALLERY = [1, 2, 3, 4, 5].map((n) => ({ placeholder: true, caption: `Momen ${n}` }));

const DEMO_CONFIG = {
  pernikahan: {
    kisah: { items: [
      { when: '2019', title: 'Pertama Bertemu', text: 'Di sebuah acara kampus, dua orang asing berbagi payung saat hujan turun tiba-tiba.' },
      { when: '2022', title: 'Saling Percaya', text: 'Jarak dan waktu menguji kami, dan justru membuat kami semakin yakin.' },
      { when: '2025', title: 'Lamaran', text: 'Dengan restu orang tua, kami memutuskan melangkah ke jenjang yang lebih serius.' },
    ] },
    detail: { events: [
      { label: 'Akad Nikah', start: '2026-12-12T08:00:00+08:00', venue: 'Masjid Agung Praya', address: 'Jl. Jenderal Sudirman, Praya, Lombok Tengah', mapUrl: 'https://maps.google.com/?q=Praya+Lombok+Tengah' },
      { label: 'Resepsi', start: '2026-12-12T11:00:00+08:00', venue: 'Gedung Serbaguna Praya', address: 'Jl. Pejanggik, Praya, Lombok Tengah', note: 'Hidangan makan siang disediakan.' },
    ], dressCode: 'Warna pastel, busana adat dipersilakan' },
  },
  khitanan: {
    kisah: { items: [
      { when: 'Lahir', title: 'Anak yang Dinanti', text: 'Kehadirannya melengkapi keluarga kecil kami.' },
      { when: 'Kini', title: 'Siap Menjadi Ksatria', text: 'Tumbuh sehat, berani, dan rajin mengaji. Hari ini ia mengambil langkah besar.' },
    ] },
    detail: { events: [{ label: 'Syukuran Khitanan', start: DATE, venue: 'Kediaman Keluarga Ahmad', address: 'Jl. Pariwisata No. 12, Praya' }] },
  },
  tazkirah: {
    kisah: { items: [
      { when: '19.30', title: 'Pembukaan & Tilawah', text: 'Dibuka dengan lantunan ayat suci.' },
      { when: '20.00', title: 'Tausiyah', text: 'Menata hati di tengah hiruk pikuk dunia.' },
      { when: '21.15', title: 'Doa & Zikir Bersama', text: 'Ditutup dengan doa dan makan bersama.' },
    ] },
    detail: { events: [{ label: 'Tazkirah', start: '2026-12-12T19:30:00+08:00', venue: 'Masjid Al-Ikhlas', address: 'Jl. Masjid No. 1' }], dressCode: 'Busana muslim sopan' },
  },
  tarannum: {
    kisah: { items: [{ when: 'Sesi 1', title: 'Qari Muda', text: 'Penampilan peserta terbaik tingkat kabupaten.' }, { when: 'Sesi 2', title: 'Qari Nasional', text: 'Lantunan dari tamu kehormatan.' }] },
    detail: { events: [{ label: 'Malam Tarannum', start: '2026-12-12T19:30:00+08:00', venue: 'Islamic Center', address: 'Jl. Raya Mataram' }] },
  },
  ulang_tahun: {
    kisah: { items: [{ when: '1 tahun', title: 'Langkah Pertama', text: 'Jatuh bangun sambil tertawa.' }, { when: '5 tahun', title: 'Masuk TK', text: 'Hari pertama sekolah penuh senyum.' }, { when: '7 tahun', title: 'Sekarang!', text: 'Siap berpesta bersama sahabat.' }] },
    detail: { events: [{ label: 'Pesta Ulang Tahun', start: '2026-12-12T15:00:00+07:00', venue: 'Rumah Aira', address: 'Jl. Melati No. 7' }], dressCode: 'Warna ceria!' },
  },
  karaoke: {
    kisah: { items: [{ when: '19.30', title: 'Pemanasan', text: 'Lagu-lagu ringan untuk membuka suara.' }, { when: '21.00', title: 'Duel Duet', text: 'Pilih pasanganmu dan beradu nilai.' }] },
    detail: { events: [{ label: 'Karaoke', start: '2026-12-12T19:30:00+07:00', venue: 'Ruang Karaoke Lt. 3' }] },
  },
  komunitas: {
    kisah: { items: [{ when: '2021', title: 'Berdiri', text: 'Dimulai dari lima orang dan satu grup chat.' }, { when: '2026', title: 'Kini', text: 'Ratusan anggota dan puluhan kegiatan setiap tahun.' }] },
    detail: { events: [{ label: 'Temu Komunitas', start: '2026-12-12T09:00:00+07:00', venue: 'Taman Kota', address: 'Jl. Bung Karno' }] },
  },
};

/** Isi adegan contoh (kisah, detail, galeri) supaya semua adegan baru terlihat di mode demo. */
export function demoScenes(themeId) {
  const theme = getTheme(themeId) || getTheme('pernikahan-taman');
  const cfg = DEMO_CONFIG[theme.eventType] || DEMO_CONFIG.pernikahan;
  return defaultScenes().map((s) => {
    if (s.kind === 'kisah') return { ...s, config: cfg.kisah };
    if (s.kind === 'detail') return { ...s, config: cfg.detail };
    if (s.kind === 'galeri') return { ...s, config: { images: GALLERY } };
    if (s.kind === 'hari_acara') return { ...s, config: { always: true, rundown: [{ time: '08.00', title: 'Tamu mulai hadir' }, { time: '09.00', title: 'Acara inti' }, { time: '11.00', title: 'Jamuan bersama' }] } };
    if (s.kind === 'arsip') return { ...s, config: { always: true, messages: [{ name: 'Sahabat', text: 'Terima kasih atas undangannya, acaranya indah sekali!' }, { name: 'Tante Rina', text: 'Semoga berkah dan bahagia selalu.' }] } };
    return s;
  });
}
