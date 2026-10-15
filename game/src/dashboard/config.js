// Tautan ke aplikasi lain. Bisa diganti lewat variabel build VITE_* tanpa mengubah kode.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
export const STUDIO_URL = env.VITE_STUDIO_URL || 'https://nikora-undangan.vercel.app/studio';
export const INVITATION_URL = (env.VITE_INVITATION_URL || 'https://nikora-undangan.vercel.app').replace(/\/+$/, '');
export const invitationLink = (slug) => `${INVITATION_URL}/?slug=${encodeURIComponent(slug)}`;

export const NAV = Object.freeze([
  { id: 'ringkasan', label: 'Ringkasan', icon: 'home' },
  { id: 'acara', label: 'Acara & Undangan', icon: 'calendar' },
  { id: 'dunia', label: 'Dunia 3D', icon: 'globe' },
  { id: 'pengguna', label: 'Pengguna', icon: 'users' },
  { id: 'admin', label: 'Admin & Peran', icon: 'shield' },
  { id: 'tautan', label: 'Tautan Pemilik/MC', icon: 'link' },
  { id: 'template', label: 'Template & Aset', icon: 'image', soon: true },
  { id: 'pembayaran', label: 'Pembayaran', icon: 'card', soon: true },
  { id: 'laporan', label: 'Laporan', icon: 'chart', soon: true },
  { id: 'pengaturan', label: 'Pengaturan', icon: 'settings' },
]);

export const SOON = Object.freeze({
  template: { title: 'Template & Aset', text: 'Pengelolaan tema, foto, dan aset 3D per acara.', need: 'Butuh penyimpanan aset (mis. Supabase Storage) dan tabel tema. Belum dibuat.' },
  pembayaran: { title: 'Pembayaran', text: 'Paket, tagihan, dan riwayat transaksi pelanggan.', need: 'Butuh penyedia pembayaran dan tabel transaksi. Belum dibuat, jadi tidak ada angka yang ditampilkan.' },
  laporan: { title: 'Laporan', text: 'Rekap bulanan: acara, tamu, kehadiran, dan penggunaan.', need: 'Butuh penyimpanan riwayat metrik. Saat ini grafik live hanya mencatat selama dasbor terbuka.' },
});
