// Lokasi acara yang bisa dipilih pemilik undangan (invitations.extra.world). Menambah lokasi baru
// (hotel, taman, dll.) = satu entri di sini + satu halaman dunia.
export const VENUES = Object.freeze({
  villa: { label: 'NIKORA Wedding Villa', page: 'villa.html' },
  hall: { label: 'Aula Resepsi', page: './' },
});
export const venueLabel = (world) => VENUES[world]?.label ?? VENUES.hall.label;
