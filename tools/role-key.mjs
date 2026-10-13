#!/usr/bin/env node
// Membuat kunci pemilik acara / MC untuk satu acara.
//   EVENT_ROLE_SECRET=<rahasia sama dengan di Vercel> node tools/role-key.mjs <slug|-> <owner|mc> [https://situs-kamu.vercel.app/villa.html]
// "-" = ruang umum (tanpa ?e=). Bagikan tautan hasilnya SECARA PRIVAT ke orangnya; jangan ditaruh di undangan umum.
import { deriveRoleKey, isEventSlug, roleSecret, ROLES } from '../game/src/token-issuer.js';

const [, , slugArg, role, base = 'https://<situs-kamu>.vercel.app/villa.html'] = process.argv;
const secret = roleSecret(process.env);
if (!secret) {
  console.error('EVENT_ROLE_SECRET belum diisi atau kurang dari 16 karakter.');
  process.exit(1);
}
if (!slugArg || !ROLES.includes(role)) {
  console.error('Pemakaian: node tools/role-key.mjs <slug|-> <owner|mc> [url-halaman]');
  process.exit(1);
}
const event = slugArg === '-' ? '' : slugArg;
if (event && !isEventSlug(event)) {
  console.error('Slug acara tidak valid (huruf kecil, angka, tanda minus; 3-40 karakter).');
  process.exit(1);
}
const key = deriveRoleKey(secret, event, role);
const query = event ? `?e=${event}&key=${key}` : `?key=${key}`;
console.log(`Kunci ${role}${event ? ` untuk acara ${event}` : ' (ruang umum)'}:\n${key}\n\nTautan:\n${base}${query}`);
