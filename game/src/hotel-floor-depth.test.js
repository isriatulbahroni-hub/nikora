import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Penjaga lantai berkedip: dua permukaan lantai yang hampir sejajar (selisih beberapa milimeter) saling berebut kedalaman di HP
// (presisi depth buffer kasar), tampak sebagai garis abu-abu berkedip di lantai lobi. Satu-satunya penggambar lantai hotel adalah hotel-luxe.js.
const src = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('hotel-world.js tidak menggambar lantai lama di bawah lantai hotel-luxe.js', () => {
  const world = src('./hotel-world.js');
  assert.doesNotMatch(world, /\bfloors\b/, 'array floors lama (lantai y0+0.02 / y0+0.045) tidak boleh kembali');
  assert.doesNotMatch(world, /rectBox\([^)]*y0 \+ 0\.0(2|45)\b/, 'tidak ada kotak lantai setinggi lantai luxe');
  assert.match(world, /buildLuxeLevel\(/, 'lantai tetap digambar hotel-luxe.js');
});

test('hotel-luxe.js: lantai ruang diangkat dari lantai dasar dan lantai dasar didorong ke belakang', () => {
  const luxe = src('./hotel-luxe.js');
  const lift = Number(/const ROOM_FLOOR_LIFT = ([0-9.]+);/.exec(luxe)?.[1]);
  assert.ok(lift >= 0.005, `selisih tinggi lantai ruang terhadap lantai dasar ${lift} m terlalu kecil`);
  assert.match(luxe, /base: true/, 'lantai dasar ditandai');
  assert.match(luxe, /polygonOffset: true/, 'lantai dasar memakai polygonOffset');
  assert.match(luxe, /y0 \+ ROOM_FLOOR_LIFT/, 'lantai ruang memakai ROOM_FLOOR_LIFT');
});
