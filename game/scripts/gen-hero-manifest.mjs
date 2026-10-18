// Membuat public/models/horor/heroes.json dari berkas .glb di folder itu.
// Dijalankan otomatis oleh predev dan prebuild, jadi menambah hero cukup dengan mengunggah berkas .glb.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { heroesFromFiles } from '../src/horor/horor-heroes.js';

const dir = fileURLToPath(new URL('../public/models/horor/', import.meta.url));
mkdirSync(dir, { recursive: true });
const heroes = heroesFromFiles(readdirSync(dir));
writeFileSync(`${dir}heroes.json`, `${JSON.stringify(heroes, null, 2)}\n`);
console.log(`[heroes] ${heroes.length} hero: ${heroes.map((h) => h.id).join(', ') || '-'}`);
