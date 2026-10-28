import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Penjaga sambungan: karyawan tempat acara hanya muncul bila halaman dunianya memasang dan memanggil tampilannya tiap frame.
// (Modul hotel-life dulu ada tetapi tidak dipakai siapa pun, jadi tidak ada perubahan di game.)
const WIRED = { villa: 'villa-main.js', masjid: 'masjid-main.js', royal: 'royal-main.js' };

for (const [venue, file] of Object.entries(WIRED)) {
  test(`${file} memasang dan memperbarui karyawan ${venue}`, () => {
    const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.match(src, /from '\.\/venue-staff-view\.js'/, 'impor venue-staff-view');
    assert.match(src, new RegExp(`createVenueStaffView\\(\\{[^}]*venue: '${venue}'`), 'dibuat untuk venue ini');
    assert.match(src, /staffView\.update\(/, 'diperbarui tiap frame');
  });
}
