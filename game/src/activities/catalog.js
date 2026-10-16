// Katalog permainan per lokasi. Satu lokasi punya beberapa zona; tiap zona punya beberapa permainan
// supaya tamu bisa memilih sesuai selera. Zona `quiet` hanya boleh berisi aktivitas bernada `tenang`.
// Semua entri masih berstatus `rencana` sampai logika + dunia 3D-nya dibuat.
import { defineActivity } from './activity.js';

const list = [
  defineActivity({ id: 'bulu-tangkis', label: 'Bulu Tangkis', category: 'olahraga', tone: 'ramai', minPlayers: 2, maxPlayers: 4, physics: true }),
  defineActivity({ id: 'voli', label: 'Bola Voli', category: 'olahraga', tone: 'ramai', minPlayers: 4, maxPlayers: 12, physics: true }),
  defineActivity({ id: 'voli-pantai', label: 'Voli Pantai', category: 'olahraga', tone: 'ramai', minPlayers: 4, maxPlayers: 8, physics: true }),
  defineActivity({ id: 'tenis-meja', label: 'Tenis Meja', category: 'olahraga', tone: 'ramai', minPlayers: 2, maxPlayers: 4, physics: true }),
  defineActivity({ id: 'balap-perahu', label: 'Balap Perahu', category: 'olahraga', tone: 'ramai', minPlayers: 2, maxPlayers: 8, physics: true }),
  defineActivity({ id: 'biliar', label: 'Biliar', category: 'permainan-meja', tone: 'ramai', minPlayers: 2, maxPlayers: 4, physics: true }),
  defineActivity({ id: 'catur', label: 'Catur', category: 'permainan-meja', tone: 'tenang', minPlayers: 2, maxPlayers: 2 }),
  defineActivity({ id: 'panahan', label: 'Panahan', category: 'ketangkasan', tone: 'ramai', minPlayers: 1, maxPlayers: 8, physics: true }),
  defineActivity({ id: 'lempar-cincin', label: 'Lempar Cincin', category: 'ketangkasan', tone: 'ramai', minPlayers: 1, maxPlayers: 6, physics: true }),
  defineActivity({ id: 'tangkap-buket', label: 'Tangkap Buket', category: 'ketangkasan', tone: 'ramai', minPlayers: 2, maxPlayers: 30, physics: true }),
  defineActivity({ id: 'memancing', label: 'Memancing', category: 'santai', tone: 'tenang', minPlayers: 1, maxPlayers: 6, physics: true }),
  defineActivity({ id: 'layang-layang', label: 'Layang-layang', category: 'santai', tone: 'ramai', minPlayers: 1, maxPlayers: 10, physics: true }),
  defineActivity({ id: 'istana-pasir', label: 'Istana Pasir', category: 'kreatif', tone: 'ramai', minPlayers: 1, maxPlayers: 6 }),
  defineActivity({ id: 'dansa', label: 'Dansa', category: 'sosial', tone: 'ramai', minPlayers: 2, maxPlayers: 20 }),
  defineActivity({ id: 'karaoke', label: 'Karaoke', category: 'sosial', tone: 'ramai', minPlayers: 1, maxPlayers: 10 }),
  defineActivity({ id: 'photobooth', label: 'Photobooth', category: 'kenangan', tone: 'ramai', minPlayers: 1, maxPlayers: 8 }),
  defineActivity({ id: 'berburu-harta', label: 'Berburu Harta', category: 'petualangan', tone: 'ramai', minPlayers: 1, maxPlayers: 20 }),
  defineActivity({ id: 'labirin-taman', label: 'Labirin Taman', category: 'petualangan', tone: 'ramai', minPlayers: 1, maxPlayers: 8 }),
  defineActivity({ id: 'kuis-pengantin', label: 'Kuis Seberapa Kenal Pengantin', category: 'kuis', tone: 'ramai', minPlayers: 2, maxPlayers: 50 }),
  // Aktivitas bernada tenang, cocok untuk masjid dan zona yang menjaga kekhusyukan.
  defineActivity({ id: 'kuis-islami', label: 'Kuis Pengetahuan Islam', category: 'kuis', tone: 'tenang', minPlayers: 1, maxPlayers: 50 }),
  defineActivity({ id: 'tantangan-hafalan', label: 'Tantangan Hafalan (sukarela)', category: 'kuis', tone: 'tenang', minPlayers: 1, maxPlayers: 10, voluntary: true }),
  defineActivity({ id: 'jelajah-museum', label: 'Jelajah Museum', category: 'petualangan', tone: 'tenang', minPlayers: 1, maxPlayers: 30 }),
  defineActivity({ id: 'cari-hikmah', label: 'Cari Hikmah di Perpustakaan', category: 'petualangan', tone: 'tenang', minPlayers: 1, maxPlayers: 20 }),
  defineActivity({ id: 'teka-teki-halaman', label: 'Teka-teki Halaman', category: 'kuis', tone: 'tenang', minPlayers: 1, maxPlayers: 10 }),
  defineActivity({ id: 'foto-kenangan', label: 'Foto Kenangan', category: 'kenangan', tone: 'tenang', minPlayers: 1, maxPlayers: 10 }),
];

export const ACTIVITIES = Object.freeze(Object.fromEntries(list.map((a) => [a.id, a])));

const zone = (label, quiet, activities) => Object.freeze({ label, quiet, activities: Object.freeze(activities) });
const venue = (zones) => Object.freeze(zones);

/** venueId -> zoneId -> zona. Kunci venue mengikuti `VENUES` (villa, royal, hall) + lokasi yang direncanakan. */
export const CATALOG = Object.freeze({
  villa: venue({
    halaman: zone('Halaman Villa', false, ['bulu-tangkis', 'voli', 'layang-layang', 'panahan']),
    kolam: zone('Area Kolam', false, ['memancing', 'lempar-cincin']),
    'ruang-santai': zone('Ruang Santai', false, ['biliar', 'tenis-meja', 'karaoke', 'catur']),
    teras: zone('Teras', false, ['photobooth', 'tangkap-buket']),
  }),
  royal: venue({
    'taman-istana': zone('Taman Istana', false, ['labirin-taman', 'berburu-harta', 'panahan', 'catur']),
    balairung: zone('Balairung', false, ['dansa', 'kuis-pengantin', 'photobooth', 'tangkap-buket']),
    'halaman-istana': zone('Halaman Istana', false, ['bulu-tangkis', 'layang-layang', 'lempar-cincin']),
  }),
  hall: venue({
    'lantai-aula': zone('Lantai Aula', false, ['dansa', 'kuis-pengantin', 'tangkap-buket', 'karaoke']),
    'sudut-permainan': zone('Sudut Permainan', false, ['lempar-cincin', 'tenis-meja', 'catur', 'biliar']),
    'sudut-foto': zone('Sudut Foto', false, ['photobooth']),
  }),
  masjid: venue({
    'aula-utama': zone('Aula Utama', true, []),
    perpustakaan: zone('Perpustakaan', true, ['cari-hikmah', 'kuis-islami']),
    'ruang-tahfidz': zone('Ruang Tahfidz', true, ['tantangan-hafalan']),
    museum: zone('Museum', true, ['jelajah-museum', 'kuis-islami']),
    halaman: zone('Halaman', true, ['teka-teki-halaman', 'foto-kenangan']),
  }),
  taman: venue({
    'halaman-taman': zone('Halaman Taman', false, ['bulu-tangkis', 'voli', 'layang-layang', 'memancing']),
    jalur: zone('Jalur Jelajah', false, ['berburu-harta', 'labirin-taman']),
    pendopo: zone('Pendopo', false, ['kuis-pengantin', 'catur', 'photobooth']),
  }),
  pantai: venue({
    pesisir: zone('Pesisir', false, ['voli-pantai', 'balap-perahu', 'istana-pasir', 'layang-layang']),
    gazebo: zone('Gazebo', false, ['kuis-pengantin', 'catur', 'photobooth']),
  }),
});

/** Daftar masalah katalog (kosong = valid). Dites otomatis agar katalog tidak rusak diam-diam. */
export function validateCatalog(catalog = CATALOG, activities = ACTIVITIES) {
  const problems = [];
  for (const [venueId, zones] of Object.entries(catalog)) {
    const ids = new Set();
    const categories = new Set();
    for (const [zoneId, z] of Object.entries(zones)) {
      for (const activityId of z.activities) {
        const a = activities[activityId];
        if (!a) { problems.push(`${venueId}/${zoneId}: aktivitas tidak dikenal "${activityId}"`); continue; }
        if (z.quiet && a.tone !== 'tenang') problems.push(`${venueId}/${zoneId}: zona tenang memuat aktivitas ramai "${activityId}"`);
        ids.add(activityId);
        categories.add(a.category);
      }
      if (new Set(z.activities).size !== z.activities.length) problems.push(`${venueId}/${zoneId}: aktivitas ganda`);
    }
    if (ids.size < 4) problems.push(`${venueId}: hanya ${ids.size} permainan (minimal 4)`);
    if (categories.size < 2) problems.push(`${venueId}: hanya ${categories.size} kategori (minimal 2)`);
  }
  return problems;
}

export const zonesOf = (venueId) => CATALOG[venueId] ?? {};

/** Permainan unik di satu lokasi (semua zona). */
export function activitiesFor(venueId) {
  const ids = new Set(Object.values(zonesOf(venueId)).flatMap((z) => z.activities));
  return [...ids].map((id) => ACTIVITIES[id]);
}

export function activitiesIn(venueId, zoneId) {
  return (zonesOf(venueId)[zoneId]?.activities ?? []).map((id) => ACTIVITIES[id]);
}
