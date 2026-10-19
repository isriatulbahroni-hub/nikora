// Moderasi obrolan ("CCTV"): deteksi kata kasar bahasa Indonesia/Melayu + kebijakan peringatan.
// Murni (tanpa jaringan), jalan di browser maupun server. Penegakan (strike, ban, kick) ada di moderation-server.js.

/** Tiga peringatan; pelanggaran berikutnya (ke-4) mengeluarkan tamu dan memblokir masuk lagi ke acara itu. */
export const MAX_WARNINGS = 3;

// Kata berat (dihitung pelanggaran pada tingkat 'normal' dan 'ketat').
const SEVERE = [
  'anjing', 'anjink', 'anjg', 'ajg', 'bangsat', 'bgst', 'bajingan', 'brengsek', 'keparat', 'kontol', 'kntl',
  'memek', 'pepek', 'ngentot', 'entot', 'jancuk', 'jancok', 'asu', 'tai', 'babi', 'bangke', 'lonte', 'sundal',
  'pukimak', 'kimak',
];
// Kata ringan (hanya dihitung pada tingkat 'ketat').
const MILD = ['goblok', 'tolol', 'bego', 'dungu', 'kampret', 'sialan', 'sinting', 'idiot', 'bodoh'];

// Akhiran yang lazim menempel pada kata pendek ("asunya", "babimu"); kata pendek tidak boleh dicocokkan sebagai awalan bebas.
const SUFFIXES = ['nya', 'mu', 'ku', 'lah', 'kah', 'an', 'in', 'e', 'ya'];

// Pengganti angka/simbol yang sering dipakai untuk mengelabui filter ("4njing", "b4bi", "b@ngsat").
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' };

const collapse = (w) => w.replace(/(.)\1+/g, '$1'); // "anjiiiing" -> "anjing"

/** Pecah teks menjadi kata-kata ternormalisasi. Huruf tunggal berurutan digabung ("a n j i n g", "a.n.j.i.n.g"). */
export function tokens(text) {
  const base = String(text ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  let s = '';
  for (const ch of base) s += LEET[ch] ?? ch;
  const out = [];
  let run = '';
  for (const t of s.split(/[^a-z]+/).filter(Boolean)) {
    if (t.length === 1) {
      run += t;
    } else {
      if (run) { out.push(run); run = ''; }
      out.push(t);
    }
  }
  if (run) out.push(run);
  return out.map(collapse);
}

function matches(token, word) {
  if (token === word) return true;
  if (!token.startsWith(word)) return false;
  if (word.length >= 5) return true; // "anjingnya", "ngentotin"
  return SUFFIXES.includes(token.slice(word.length));
}

const prep = (list, severity) => list.map((w) => [collapse(w), severity]);
const BASE_SEVERE = prep(SEVERE, 'berat');
const BASE_MILD = prep(MILD, 'ringan');

/**
 * Cari kata kasar. level: 'normal' (kata berat saja) | 'ketat' (ditambah kata ringan).
 * allow: kata yang dikecualikan pemilik acara (mis. nama orang); extra: kata tambahan pemilik acara.
 */
export function findProfanity(text, { level = 'normal', allow = [], extra = [] } = {}) {
  const words = [...BASE_SEVERE, ...(level === 'ketat' ? BASE_MILD : []), ...prep(extra.map((w) => String(w).toLowerCase()), 'berat')];
  const allowSet = new Set(allow.map((a) => collapse(String(a).toLowerCase())));
  const hits = [];
  for (const token of tokens(text)) {
    if (allowSet.has(token)) continue;
    const hit = words.find(([w]) => matches(token, w));
    if (hit) hits.push({ word: hit[0], severity: hit[1] });
  }
  return { flagged: hits.length > 0, hits };
}

/** Tindakan setelah pelanggaran ke-`strikes` (sudah termasuk pelanggaran ini). */
export function actionFor(strikes, max = MAX_WARNINGS) {
  if (strikes <= max) return { action: 'warn', strikes, remaining: Math.max(0, max - strikes) };
  return { action: 'ban', strikes, remaining: 0 };
}

export const warningMessage = (strikes, max = MAX_WARNINGS) =>
  `Peringatan ${strikes}/${max}: harap jaga tutur kata. Pelanggaran setelah peringatan ke-${max} akan mengeluarkan Anda dari acara ini.`;

export const BAN_MESSAGE = 'Anda dikeluarkan dari acara ini karena berulang kali berkata kasar.';
export const BLOCK_MESSAGE = 'Pesan ditahan: mengandung kata kasar.';
