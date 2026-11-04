import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Penjaga sambungan: modul bioskop 5D tidak boleh digabung tanpa dipanggil siapa pun (seperti hotel-life.js dan hotel-ambience.js dulu).
const src = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('hotel-main.js memasang bioskop 5D, melangkahkannya tiap frame, dan mematikannya sendiri bila galat', () => {
  const hotel = src('./hotel-main.js');
  assert.match(hotel, /from '\.\/cinema-5d-fx\.js'/);
  assert.match(hotel, /createHotelCinema\(\{ scene, renderer,/);
  assert.match(hotel, /cinema\.update\(\{ me, delta,/);
  assert.match(hotel, /active: journey\.state === 'idle' && !riding && !fleet\.mine/, 'efek mati selama lorong perjalanan dan di dalam mobil');
  assert.match(hotel, /bioskop 5D dimatikan karena galat/);
  assert.match(hotel, /cinema: \(\) => cinema\?\.info\(\)/, 'hook pengujian window.__hotel.cinema');
});

test('hotel-furnish.js memakai denah kursi bioskop 5D dan modul efek memakai data murni', () => {
  assert.match(src('./hotel-furnish.js'), /cinemaSeatPlan\(\[L\.x1, L\.z1, L\.x2, L\.z2\]\)/);
  const fx = src('./cinema-5d-fx.js');
  assert.match(fx, /from '\.\/cinema-5d-data\.js'/);
  assert.match(fx, /from '\.\/cinema-5d-sound\.js'/);
  assert.match(fx, /cinemaSeatPlan\(room\.rect\)/);
});
