# Mobil mewah armada hotel

Semua 8 mobil di drop-off/parkir hotel kini memakai empat model mewah yang terinspirasi gambar referensi pemilik
(coupe mewah biru, roadster hitam, hypercar perak-merah, SUV mewah merah). Tiap model ada dua unit; unit kedua memakai cat lain.
Semua bentuk dibuat prosedural (`car-loft.js`, `luxury-cars.js`), tanpa berkas model eksternal, dan **tanpa logo, lambang, atau nama merek asli**.
Mobil sedan lama di parkir villa tidak diubah.

## Kritik desain (dibanding gambar referensi)

| Temuan | Tingkat | Tindak lanjut |
|---|---|---|
| Sedan kotak lama jauh dari siluet mobil mewah (hood panjang, gril kuil, roadster rendah, baji hypercar, SUV tinggi) | 🔴 | Dibentuk ulang: badan "loft" superelips + kabin terbuka berisi jok, setir kanan, dasbor |
| Satu model, satu fisika untuk semua mobil | 🔴 | Fisika, kursi, gigi, RPM, suara per model (`car-models.js`) |
| Detail khas belum ada (gril, lampu, sayap, roda, pelat) | 🟡 | Ada per model; bentuk masih low-poly, bukan salinan presisi |
| Warna cat sama untuk semua | 🟡 | Cat asli per model + cat varian untuk unit kedua |
| Bentuk 3D belum dinilai pemilik di perangkat | 🟡 | Perlu uji di HP; angka `seatLift` dan posisi kursi mudah disetel di `car-models.js` |

## Sistem desain: token dan komponen

Token per model (`car-models.js`): ukuran (`length/width/height/wheelBase/wheelRadius/tireWidth`), performa (`maxSpeed/accel/brake/maxSteer/steerRate`),
kursi (`seats[{fwd,side}]`, `seatLift`), warna (`paint/accent/interior`), mesin (`cylinders/idleRpm/maxRpm/gears/timbre`), pintu (`style/open`).
Warna HUD (`car-hud.js`) mengikuti panel hotel: emas `#c9a24b`, latar `#14110d`, teks `#f1e9d6`, target sentuh 44 px.

| Model | Jenis | Kursi | Maks | Pintu | Timbre mesin |
|---|---|---|---|---|---|
| Royale Sweep | coupe | 2 | 112 km/j | coach (engsel belakang) | halus (V12) |
| Noir Aero | roadster | 2 | 133 km/j | ayun | dalam (W16) |
| Argent Fury | hypercar | 2 | 140 km/j | gunting (naik) | menjerit (V12) |
| Rubis Grand | SUV | 4 | 101 km/j | depan ayun, belakang coach | halus (V12) |

### Komponen: mobil bermodel

| Fitur | Perilaku |
|---|---|
| Roda | Berputar mengikuti kecepatan; roda depan membelok mengikuti setir (mobil pemain lain: diturunkan dari laju yaw) |
| Suspensi | Menunduk saat mengerem, jongkok saat gas, miring saat menikung |
| Pintu | Terbuka 1,6 dtk setiap kursi berganti penghuni (naik atau turun), disertai bunyi pintu |
| Lampu | Depan menyala saat mesin hidup; rem menyala terang saat mengerem; mundur putih saat bergerak mundur |
| Suara | Mesin sintetis mengikuti RPM dan gigi (hanya mobil yang dikemudikan); klakson dua nada (tombol H atau tombol Klakson, tahan); klakson dan pintu pemain lain terdengar menurut jarak |
| HUD | Nama model, km/j, gigi (R/N/1-5), batang RPM (merah mendekati batas), tombol Klakson |
| Jaringan | Klakson disiarkan (`k: 'h'`), diterima hanya dari pemegang kursi pengemudi; selebihnya protokol lama |
| Fisika | Langkah ≤ 1/60 dtk (mobil cepat tidak menembus dinding tipis); kecepatan maks per model berlaku di jalan raya |

Aksesibilitas: tombol Klakson punya `aria-label`, ≥ 44 px, dan alternatif papan ketik (H).

Boleh/jangan: setel model baru lewat satu entri di `CAR_MODELS` + satu fungsi di `luxury-cars.js`; jangan menambah bentuk detail berlapis (anggaran < 14.000 segitiga per mobil, diuji).

## Fisika ban (tahap 1 penggabungan LibreCorsa/ICEsim)

`tyre-model.js` (murni, diuji) membatasi percepatan samping oleh grip ban: grip = mu x g x faktor suhu x permukaan.
Menikung terlalu keras di kecepatan tinggi = understeer + selip (laju terkikis, ban memanas); ban dingin lebih licin;
gas/rem keras mengurangi grip samping (lingkaran gesek); tanah/halaman lebih licin dari aspal. `vehicle.slip` (0..1) dan
`vehicle.tyreTemp` (suhu ban) dipakai suara decit ban (`tyreSound` di `car-audio.js`, hanya mobil yang dikemudikan).
Hambatan udara tidak dihitung sebagai selip. Belum: HUD suhu ban, asap/bekas ban, pindah beban visual dari grip.

## Yang belum
- Tampilan di perangkat nyata belum diuji (CI hanya menguji logika, geometri, dan build). Cek tinggi kepala avatar di mobil rendah.
- Mesin mobil pemain lain tidak disuarakan; lampu sein/hazard belum ada; mobil villa masih sedan lama.
- Jumlah 500 mobil per tempat acara dan kontrol admin tetap di rencana (`HOTEL_RENCANA.md`).
