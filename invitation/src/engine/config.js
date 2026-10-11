import { contrast, isHex } from './color.js';
import { EVENT_LABELS, EVENT_TYPES, resolveTheme } from '../themes/index.js';

/** Urutan adegan bawaan; nama harus sama dengan check constraint invitation_scenes.kind. */
export const SCENE_KINDS = [
  'amplop', 'surat', 'cover', 'kisah', 'detail', 'galeri',
  'rsvp', 'bukutamu', 'hadiah', 'hari_acara', 'penutup', 'arsip',
];

export const KIND_LABELS = {
  amplop: 'Amplop', surat: 'Surat', cover: 'Cover', kisah: 'Kisah', detail: 'Detail acara',
  galeri: 'Galeri', rsvp: 'Konfirmasi hadir', bukutamu: 'Buku tamu', hadiah: 'Hadiah',
  hari_acara: 'Hari acara', penutup: 'Penutup', arsip: 'Arsip kenangan',
};

export const COLOR_KEYS = [
  'bg1', 'bg2', 'paper', 'letter', 'ink', 'accent', 'accent2', 'glow', 'stageInk', 'sealFill', 'sealInk',
];

export const defaultScenes = () =>
  SCENE_KINDS.map((kind, position) => ({ kind, position, active: true, config: {} }));

/** Teks aman: hanya string, tanpa karakter kontrol, dibatasi panjangnya. null bila kosong. */
export function cleanText(v, max = 200) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

/**
 * Gabungkan warna dari editor ke warna tema. Hanya hex valid yang diterima, dan
 * pasangan warna yang membuat teks sulit dibaca dikembalikan ke nilai tema.
 */
export function mergeTokens(base, overrides) {
  const out = { ...base };
  if (overrides && typeof overrides === 'object') {
    for (const k of COLOR_KEYS) if (isHex(overrides[k])) out[k] = overrides[k];
  }
  if (contrast(out.ink, out.letter) < 4.5) Object.assign(out, { ink: base.ink, letter: base.letter });
  if (contrast(out.stageInk, out.bg1) < 4.5 || contrast(out.stageInk, out.bg2) < 4.5) {
    Object.assign(out, { stageInk: base.stageInk, bg1: base.bg1, bg2: base.bg2 });
  }
  if (contrast(out.sealInk, out.sealFill) < 3) Object.assign(out, { sealInk: base.sealInk, sealFill: base.sealFill });
  return out;
}

export function titleOf(inv) {
  const extra = inv.extra && typeof inv.extra === 'object' ? inv.extra : {};
  const custom = cleanText(extra.title, 80);
  if (custom) return custom;
  const a = cleanText(inv.groom, 60);
  const b = cleanText(inv.bride, 60);
  if (a && b) return `${a} & ${b}`;
  return a || b || 'Undangan';
}

export function initialsOf(title) {
  const parts = title.split(/\s*&\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}&${parts[1][0]}`.toUpperCase();
  return (title.trim()[0] || '·').toUpperCase();
}

export function formatDate(value, tz) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  try {
    return d.toLocaleDateString('id-ID', { ...opts, timeZone: cleanText(tz, 40) || 'Asia/Jakarta' });
  } catch {
    return d.toLocaleDateString('id-ID', { ...opts, timeZone: 'Asia/Jakarta' });
  }
}

/** Tampilan siap render dari baris database (atau data demo) + query URL. */
export function buildView({ invitation, scenes = [], query = {} }) {
  const inv = invitation || {};
  const eventType = EVENT_TYPES.includes(inv.event_type) ? inv.event_type : 'pernikahan';
  const theme = resolveTheme(query.tema || inv.theme, eventType);
  const extra = inv.extra && typeof inv.extra === 'object' ? inv.extra : {};
  const list = (scenes.length ? scenes : defaultScenes())
    .filter((s) => s && s.active !== false)
    .sort((a, b) => a.position - b.position);
  return {
    slug: inv.slug || null,
    eventType,
    eventLabel: EVENT_LABELS[eventType],
    theme,
    title: titleOf(inv),
    dateText: formatDate(inv.event_date, extra.tz),
    recipient: cleanText(query.to, 60),
    scenes: list,
  };
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Semua teks, warna, dan kecepatan adegan amplop; setiap nilai bisa ditimpa dari config editor. */
export function envelopeSettings(view) {
  const sc = view.scenes.find((s) => s.kind === 'amplop');
  const c = sc && sc.config && typeof sc.config === 'object' ? sc.config : {};
  const t = view.theme;
  const speed = Number(c.speed);
  return {
    tokens: mergeTokens(t.tokens, c.tokens),
    text: {
      hint: cleanText(c.hint, 80) || t.copy.hint,
      tagline: cleanText(c.tagline, 120) || t.copy.tagline,
      toPrefix: cleanText(c.toPrefix, 40) || t.copy.toPrefix,
      lead: cleanText(c.lead, 240) || t.copy.lead,
      openLabel: cleanText(c.openLabel, 40) || t.copy.openLabel,
      skipLabel: cleanText(c.skipLabel, 30) || t.copy.skipLabel,
    },
    sealText: cleanText(c.sealText, 4) || initialsOf(view.title),
    speed: Number.isFinite(speed) && speed > 0 ? clamp(speed, 0.5, 2) : t.motion.speed,
  };
}
