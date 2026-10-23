#!/usr/bin/env node
// Menyalin model GLB yang dipakai nikora dari klon lokal pedrosoandre/carros ke game/public/cars/, beserta credits.json
// (pembuat, tautan karya asli, lisensi tiap model: wajib ditampilkan karena lisensinya CC BY).
// Pakai: node scripts/copy-car-models.mjs [folder carros (bawaan ../../carros)] [folder tujuan (bawaan public/cars)]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLB_CARS, SHARE_ALIKE_FILES, glbCreditId } from '../src/glb-car-catalog.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(process.argv[2] ?? join(here, '../../../carros'));
const out = resolve(process.argv[3] ?? join(here, '../public/cars'));

if (!existsSync(join(src, 'assets'))) {
  console.error(`Folder carros tidak ditemukan: ${src}\nKlon dulu repo pedrosoandre/carros, lalu jalankan: node scripts/copy-car-models.mjs <folder carros>`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const files = [...new Set(Object.values(GLB_CARS).map((e) => e.file))];
const missing = [];
for (const f of files) {
  if (SHARE_ALIKE_FILES.includes(f)) console.warn(`PERINGATAN: ${f} berlisensi CC BY-SA`);
  const from = join(src, 'assets', f);
  if (!existsSync(from)) { missing.push(f); continue; }
  copyFileSync(from, join(out, f));
  console.log(`salin ${f}`);
}

// kredit: cars.json di carros (array, atau objek dengan properti `cars`)
const raw = JSON.parse(readFileSync(join(src, 'cars.json'), 'utf8'));
const list = Array.isArray(raw) ? raw : raw.cars ?? [];
const ids = new Set(Object.keys(GLB_CARS).map(glbCreditId));
const credits = list.filter((c) => ids.has(c.id)).map(({ id, brand, model, credit }) => ({ id, brand, model, credit }));
writeFileSync(join(out, 'credits.json'), `${JSON.stringify(credits, null, 2)}\n`);
console.log(`kredit: ${credits.length} dari ${ids.size} model -> ${join(out, 'credits.json')}`);
if (credits.length < ids.size) console.warn('PERINGATAN: ada model yang tidak ditemukan di cars.json, periksa id-nya.');
if (missing.length) {
  console.error(`Berkas tidak ditemukan di carros/assets: ${missing.join(', ')}`);
  process.exit(1);
}
