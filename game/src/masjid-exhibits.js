// Info museum: tiap etalase di Museum Peradaban Islam memuat satu kisah. Murni data agar mudah diuji.
export const EXHIBITS = Object.freeze([
  { id: 'astrolab', title: 'Astrolab', era: 'Abad ke-8 sampai ke-10 M', text: 'Astrolab dipakai untuk mengukur ketinggian matahari dan bintang. Para astronom Muslim menyempurnakannya untuk menentukan waktu shalat, arah kiblat, dan letak lintang sebuah kota.' },
  { id: 'mushaf', title: 'Mushaf Utsmani', era: 'Sekitar tahun 650-an M', text: "Pada masa Khalifah Utsman bin Affan, Al-Qur'an disalin menjadi mushaf yang seragam. Salinannya dikirim ke beberapa kota besar agar bacaan umat tetap terjaga." },
  { id: 'khawarizmi', title: 'Aljabar dan Algoritma', era: 'Abad ke-9 M', text: 'Muhammad bin Musa al-Khawarizmi menulis buku tentang cara menyelesaikan persamaan; kata "aljabar" berasal dari judulnya. Namanya yang dilatinkan juga menjadi asal kata "algoritma".' },
  { id: 'ibnusina', title: 'Kitab Kedokteran Ibnu Sina', era: '980-1037 M', text: 'Ibnu Sina menulis Al-Qanun fi ath-Thibb, ensiklopedia kedokteran yang dipelajari di dunia Islam dan Eropa selama berabad-abad.' },
  { id: 'haytham', title: 'Optik Ibnu al-Haytham', era: 'Sekitar 965-1040 M', text: 'Ibnu al-Haytham menjelaskan bahwa kita melihat karena cahaya dari benda masuk ke mata. Dalam Kitab al-Manazhir, ia juga menekankan percobaan untuk menguji dugaan.' },
  { id: 'idrisi', title: 'Peta Al-Idrisi', era: '1154 M', text: 'Al-Idrisi menyusun peta dunia dan buku geografi atas permintaan Raja Roger II di Sisilia. Karya itu dikenal sebagai Tabula Rogeriana.' },
  { id: 'kaligrafi', title: 'Seni Kaligrafi', era: 'Sejak abad ke-7 M', text: 'Huruf Arab ditulis dengan pena buluh (kalam). Gaya seperti naskhi dan tsuluts dipakai untuk menyalin mushaf dan menghiasi masjid.' },
  { id: 'baitulhikmah', title: 'Baitul Hikmah', era: 'Abad ke-9 M', text: 'Di Baghdad pada masa Abbasiyah, para penerjemah dan ilmuwan menerjemahkan karya Yunani, Persia, dan India ke bahasa Arab, lalu mengembangkannya.' },
  { id: 'qarawiyyin', title: 'Al-Qarawiyyin', era: '859 M', text: 'Fatima al-Fihri mendirikan masjid dan lembaga belajar Al-Qarawiyyin di Fes, Maroko. Lembaga itu diakui sebagai salah satu yang tertua dan masih berjalan.' },
  { id: 'jazari', title: 'Mesin Al-Jazari', era: '1206 M', text: 'Al-Jazari menulis buku tentang mesin cerdas, berisi jam air, pompa, dan perangkat otomatis lengkap dengan gambar rancangannya.' },
  { id: 'khaldun', title: 'Muqaddimah', era: '1377 M', text: 'Ibnu Khaldun menulis Muqaddimah, pengantar sejarah yang membahas bagaimana masyarakat, ekonomi, dan kekuasaan tumbuh dan berubah.' },
  { id: 'pasai', title: 'Samudra Pasai', era: 'Abad ke-13 M', text: 'Islam masuk ke Nusantara lewat pelayaran dan perdagangan. Kesultanan Samudra Pasai di pesisir utara Sumatra menjadi salah satu kerajaan Islam paling awal di wilayah ini.' },
]);

export const exhibitById = (id) => EXHIBITS.find((e) => e.id === id) ?? null;

/** Etalase terdekat dalam jarak `range` meter dari (x, z), atau null. `spots`: [{ x, z, id }]. */
export function nearestExhibit(spots, x, z, range = 4.5) {
  let best = null;
  let bestDistance = range;
  for (const s of spots) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d <= bestDistance) {
      best = s;
      bestDistance = d;
    }
  }
  return best;
}
