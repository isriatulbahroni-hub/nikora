import { h } from '../engine/dom.js';
import { icon } from './icons.js';
import { titleOf } from './views.js';
import { fmtDay } from './format.js';

/** Pilih undangan dulu (dipakai Editor/Template/Tamu bila belum ada undangan yang dibuka). */
export function pickerView({ title, lead, items, hrefFor }) {
  return h('div', { class: 'st-page' },
    h('div', { class: 'st-pagehead' }, h('div', {}, h('h1', { text: title }), h('p', { class: 'st-sub', text: lead }))),
    items.length ? h('div', { class: 'st-picklist' }, items.map((i) => h('a', { class: 'st-pick', href: hrefFor(i.slug) },
      h('strong', { text: titleOf(i) }), h('span', { text: fmtDay(i.event_date) || 'Tanggal belum diisi' }), icon('chevron', { size: 18 }))))
      : h('div', { class: 'st-empty' }, icon('mail', { size: 36 }), h('h2', { text: 'Belum ada undangan' }), h('a', { class: 'st-btn st-btn-primary', href: '#/buat' }, 'Buat undangan')));
}

export function settingsView({ email, onSignOut }) {
  return h('div', { class: 'st-page' },
    h('div', { class: 'st-pagehead' }, h('div', {}, h('h1', { text: 'Pengaturan' }), h('p', { class: 'st-sub', text: 'Akun dan keamanan.' }))),
    h('section', { class: 'st-panel st-narrow' },
      h('h2', { class: 'st-h2', text: 'Akun' }),
      h('p', { class: 'st-meta' }, icon('user', { size: 16 }), h('span', { text: email || 'Tidak diketahui' })),
      h('p', { class: 'st-sub', text: 'Keluar menghapus sesi di perangkat ini dan di server. Isian yang belum disimpan akan ditanyakan dulu.' }),
      h('button', { class: 'st-btn st-btn-danger', type: 'button', onclick: onSignOut }, icon('logout', { size: 16 }), h('span', { text: 'Keluar dari Studio' }))));
}

const STEPS = [
  ['layout', 'Pilih template & amplop', 'Menu Template: pilih suasana, amplop, dan segel. Pratinjau memutar dari amplop sampai akhir.'],
  ['pencil', 'Isi undangan', 'Menu Editor: surat, kisah, detail acara (peta dan kalender), galeri foto, hari acara, arsip, penutup.'],
  ['palette', 'Atur tampilan sendiri', 'Tab Tampilan di Editor: warna, font, dan foto sampul. Kontras tulisan dijaga otomatis.'],
  ['qr', 'Bagikan', 'Menu Dashboard, Bagikan: link undangan, QR, dan link pribadi per tamu lewat WhatsApp.'],
  ['users', 'Pantau tamu', 'Menu Tamu: siapa hadir, berhalangan, belum membalas; ekspor CSV dan kirim pengingat.'],
];
const FAQ = [
  ['Bagaimana menghapus undangan?', 'Dashboard, Pilih, centang undangan, ketik HAPUS. Atau di halaman Bagikan, bagian Hapus undangan. Data tamu dan RSVP ikut terhapus dan tidak bisa dikembalikan.'],
  ['Teks tidak terbaca setelah ganti warna?', 'Studio menyesuaikan latar secara otomatis agar tulisan terbaca dan menjelaskan penyesuaiannya di bawah pilihan warna.'],
  ['Apakah foto saya aman?', 'Foto dikecilkan di perangkatmu sebelum diunggah dan lokasi (GPS) dihapus. Foto hanya dipakai di undanganmu.'],
  ['Tamu tidak bisa membuka link?', 'Pastikan status undangan aktif dan link memakai alamat lengkap. Coba buka lewat tab penyamaran untuk meniru tamu.'],
];

export function helpView() {
  return h('div', { class: 'st-page' },
    h('div', { class: 'st-pagehead' }, h('div', {}, h('h1', { text: 'Bantuan' }), h('p', { class: 'st-sub', text: 'Alur dari awal sampai tamu hadir.' }))),
    h('section', { class: 'st-panel' }, h('h2', { class: 'st-h2', text: 'Lima langkah' }),
      h('ol', { class: 'st-steps5' }, STEPS.map(([ic, t, d], i) => h('li', {}, h('span', { class: 'st-stepno' }, icon(ic, { size: 18 })), h('div', {}, h('strong', { text: `${i + 1}. ${t}` }), h('p', { text: d })))))),
    h('section', { class: 'st-panel' }, h('h2', { class: 'st-h2', text: 'Pertanyaan umum' }),
      ...FAQ.map(([q, a]) => h('details', { class: 'st-faq' }, h('summary', { text: q }), h('p', { text: a })))));
}
