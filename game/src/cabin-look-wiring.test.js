import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Penjaga sambungan: cabin-look.js dulu sempat digabung tanpa dipanggil siapa pun, sehingga di game tidak ada yang berubah.
const src = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('hotel-main.js memakai pandangan kabin: modul dipasang, geseran satu jari menoleh, tiap frame dilangkahkan, kamera ikut sudutnya', () => {
  const hotel = src('./hotel-main.js');
  assert.match(hotel, /from '\.\/cabin-look-ui\.js'/);
  assert.match(hotel, /mountCabinLook\(\)/);
  assert.match(hotel, /camInput\.cabinDrag\s*=/);
  assert.match(hotel, /camInput\.cabinDrag\?\.\(dx, dy\)/);
  assert.match(hotel, /cabinLook\.show\(inCabin\)/);
  assert.match(hotel, /cabinLook\.step\(delta, dc\.steer\)/);
  assert.match(hotel, /eyeWorld\(dc, cs, lk\.yaw\)/);
  assert.match(hotel, /Math\.tan\(lk\.pitch\)/);
});

test('cabin-look-ui.js hanya geseran (tanpa tombol) dan memakai logika murni cabin-look.js', () => {
  const ui = src('./cabin-look-ui.js');
  assert.match(ui, /from '\.\/cabin-look\.js'/);
  for (const call of ['createCabinLook', 'peekYaw', 'look.drag(', 'look.snap(', 'look.step(']) assert.ok(ui.includes(call), `${call} dipakai`);
  assert.ok(!ui.includes('createElement'), 'tidak ada tombol atau elemen layar');
});
