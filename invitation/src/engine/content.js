import { cleanText, formatDate, mergeTokens } from './config.js';

/**
 * Isi adegan: semua teks dari editor (scene.config / invitations.extra) disaring di sini,
 * lalu dipasangkan dengan teks bawaan per jenis acara. Adegan hanya merender hasilnya.
 */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Hanya tautan https yang diterima (peta, foto). Selain itu null. */
export function safeUrl(v, max = 600) {
  if (typeof v !== 'string' || v.length > max) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

export function sceneCfg(view, kind) {
  const sc = (view.scenes || []).find((s) => s.kind === kind);
  const c = sc && sc.config;
  return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
}

export const sceneTokens = (view, kind) => mergeTokens(view.theme.tokens, sceneCfg(view, kind).tokens);

const extraOf = (view) => (view.extra && typeof view.extra === 'object' ? view.extra : {});

/* ---------- teks bawaan per jenis acara ---------- */

const BASE = {
  coverEyebrow: 'Undangan', coverCta: 'Lihat Undangan', coverTagline: null,
  suratEyebrow: 'Sebuah Surat untuk Anda', suratGreeting: 'Dengan hormat,', suratClose: 'Hormat kami,', suratCta: 'Lanjut',
  suratBody: ['Kami mengundang Anda untuk hadir dan berbagi hari istimewa ini bersama kami.'],
  storyEyebrow: 'Kisah', storyTitle: 'Perjalanan Kami', storyCta: 'Lanjut',
  detailEyebrow: 'Catat Tanggalnya', detailTitle: 'Detail Acara', defaultEvent: 'Acara', detailCta: 'Lanjut',
  galleryEyebrow: 'Momen', galleryTitle: 'Galeri', galleryCta: 'Lanjut',
  closingEyebrow: 'Sampai Jumpa', closingTitle: 'Terima Kasih', closingSign: 'Salam hangat,', closingCta: 'Selesai',
  closingBody: 'Kehadiran dan doa Anda adalah hadiah terindah bagi kami. Sampai bertemu di hari istimewa ini.',
};

const BY_TYPE = {
  pernikahan: {
    coverEyebrow: 'The Wedding of', coverTagline: 'Kami akan menikah',
    suratBody: [
      'Tiada yang lebih membahagiakan bagi kami selain berbagi hari istimewa ini bersama orang-orang tercinta.',
      'Dengan segala kerendahan hati, kami mengundang Bapak/Ibu/Saudara/i untuk hadir dan memberikan doa restu pada pernikahan {nama}.',
    ],
    storyEyebrow: 'Perjalanan Cinta', storyTitle: 'Kisah Kami',
    detailTitle: 'Akad & Resepsi', defaultEvent: 'Pernikahan',
    galleryEyebrow: 'Potret Kami', galleryTitle: 'Galeri Kenangan',
    closingBody: 'Merupakan kehormatan dan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir dan memberikan doa restu. Atas kehadiran dan doa yang tulus, kami ucapkan terima kasih.',
  },
  khitanan: {
    coverEyebrow: 'Syukuran Khitanan', coverTagline: 'Menjadi anak yang kuat dan saleh',
    suratEyebrow: 'Undangan Syukuran',
    suratBody: [
      'Dengan memohon rahmat dan ridha Allah SWT, kami mengundang Bapak/Ibu/Saudara/i untuk hadir pada syukuran khitanan putra kami tercinta.',
      'Semoga {nama} tumbuh menjadi anak yang saleh, kuat, dan berbakti kepada orang tua.',
    ],
    storyEyebrow: 'Tumbuh Bersama', storyTitle: 'Perjalanan Ananda',
    detailTitle: 'Waktu & Tempat', defaultEvent: 'Syukuran Khitanan',
    galleryEyebrow: 'Kenangan', galleryTitle: 'Potret Ananda',
    closingBody: 'Doa dan kehadiran Bapak/Ibu/Saudara/i sangat berarti bagi ananda dan keluarga. Semoga Allah membalas dengan kebaikan.',
  },
  tazkirah: {
    coverEyebrow: 'Majelis Tazkirah', coverTagline: 'Menyejukkan hati, menambah ilmu',
    suratEyebrow: 'Undangan Majelis',
    suratBody: [
      'Marilah kita hadir dalam majelis ilmu dan zikir, menyirami hati dengan nasihat yang menenangkan.',
      'Kami mengundang Bapak/Ibu/Saudara/i untuk menghadiri {nama}. Bawalah keluarga dan sahabat.',
    ],
    storyEyebrow: 'Tentang Majelis', storyTitle: 'Rangkaian Acara',
    detailTitle: 'Waktu & Tempat', defaultEvent: 'Tazkirah',
    galleryEyebrow: 'Dokumentasi', galleryTitle: 'Majelis Sebelumnya',
    closingBody: 'Semoga majelis ini menjadi sebab turunnya rahmat dan ketenangan bagi kita semua. Terima kasih atas kehadiran dan doanya.',
  },
  tarannum: {
    coverEyebrow: 'Malam Tarannum', coverTagline: 'Lantunan ayat yang menyentuh hati',
    suratBody: [
      'Mari menyimak lantunan ayat suci dengan seni tarannum yang indah dan menenangkan.',
      'Kami mengundang Bapak/Ibu/Saudara/i untuk hadir dalam {nama}.',
    ],
    storyEyebrow: 'Susunan Acara', storyTitle: 'Para Qari dan Qariah',
    detailTitle: 'Waktu & Tempat', defaultEvent: 'Tarannum',
    galleryEyebrow: 'Dokumentasi', galleryTitle: 'Momen Tarannum',
    closingBody: 'Semoga lantunan ayat yang kita dengarkan menjadi cahaya bagi hati. Terima kasih telah hadir.',
  },
  ulang_tahun: {
    coverEyebrow: 'Pesta Ulang Tahun', coverTagline: 'Ayo rayakan bersama!',
    suratEyebrow: 'Ada Kabar Seru!', suratGreeting: 'Halo, sahabat!', suratClose: 'Sampai ketemu,',
    suratBody: [
      'Ada pesta seru menantimu! Akan ada kue, permainan, tawa, dan banyak kejutan.',
      'Datang ya ke ulang tahun {nama}. Pestanya nggak akan seru tanpamu!',
    ],
    storyEyebrow: 'Cerita Kecil', storyTitle: 'Perjalanan Setahun',
    detailEyebrow: 'Jangan Telat!', detailTitle: 'Kapan & Di Mana', defaultEvent: 'Pesta Ulang Tahun',
    galleryEyebrow: 'Foto-foto', galleryTitle: 'Momen Seru',
    closingTitle: 'Sampai Ketemu di Pesta!', closingBody: 'Siapkan senyum terbaikmu. Terima kasih sudah mau datang dan meramaikan hari spesial ini!',
    closingSign: 'Peluk hangat,', closingCta: 'Siap!',
  },
  karaoke: {
    coverEyebrow: 'Malam Karaoke', coverTagline: 'Siapkan suara terbaikmu',
    suratEyebrow: 'Panggung Menunggumu', suratGreeting: 'Halo, calon bintang!', suratClose: 'Sampai di panggung,',
    suratBody: [
      'Satu mikrofon, banyak lagu, dan teman-teman yang siap bernyanyi bersama.',
      'Datanglah ke {nama} dan pilih lagu favoritmu.',
    ],
    storyEyebrow: 'Malam Itu', storyTitle: 'Susunan Acara',
    detailTitle: 'Jadwal & Lokasi', defaultEvent: 'Karaoke',
    galleryEyebrow: 'Sorotan', galleryTitle: 'Momen di Panggung',
    closingTitle: 'Sampai di Panggung!', closingBody: 'Terima kasih sudah ikut bernyanyi. Suaramu membuat malam ini hidup.', closingSign: 'Salam musik,', closingCta: 'Siap!',
  },
  komunitas: {
    coverEyebrow: 'Undangan Acara', coverTagline: 'Berkumpul, berbagi, bertumbuh',
    suratBody: [
      'Kami mengundang Anda untuk berkumpul, berbagi cerita, dan bertumbuh bersama komunitas.',
      'Kehadiran Anda akan membuat {nama} lebih berarti.',
    ],
    storyEyebrow: 'Tentang Kami', storyTitle: 'Perjalanan Komunitas',
    detailTitle: 'Waktu & Tempat', defaultEvent: 'Pertemuan',
    galleryEyebrow: 'Dokumentasi', galleryTitle: 'Momen Bersama',
    closingBody: 'Terima kasih sudah menjadi bagian dari komunitas ini. Sampai bertemu di acara.',
  },
};

const SALAM = {
  suratGreeting: 'Assalamu’alaikum Warahmatullahi Wabarakatuh',
  suratClose: 'Wassalamu’alaikum Warahmatullahi Wabarakatuh,',
};

export const isIslamic = (view) =>
  view.theme.id.includes('islami') || ['khitanan', 'tazkirah', 'tarannum'].includes(view.eventType);

export function copyFor(view) {
  return { ...BASE, ...(BY_TYPE[view.eventType] || {}), ...(isIslamic(view) ? SALAM : {}) };
}

const fill = (s, view) =>
  String(s).replaceAll('{nama}', view.title).replaceAll('{tanggal}', view.dateText || 'hari yang telah ditentukan');

/** Teks dari config bila ada dan bersih, kalau tidak teks bawaan. */
function text(view, cfg, copy, key, max, cfgKey = key) {
  const own = cleanText(cfg[cfgKey], max);
  if (own) return own;
  const fallback = copy[key];
  return fallback == null ? null : fill(fallback, view);
}

/* ---------- surat ---------- */
export function suratContent(view) {
  const cfg = sceneCfg(view, 'surat');
  const copy = copyFor(view);
  const own = (Array.isArray(cfg.paragraphs) ? cfg.paragraphs : []).map((p) => cleanText(p, 400)).filter(Boolean).slice(0, 5);
  return {
    eyebrow: text(view, cfg, copy, 'suratEyebrow', 60, 'eyebrow'),
    greeting: text(view, cfg, copy, 'suratGreeting', 90, 'greeting'),
    toPrefix: cleanText(cfg.toPrefix, 40) || view.theme.copy.toPrefix,
    recipient: view.recipient,
    paragraphs: own.length ? own : copy.suratBody.map((p) => fill(p, view)),
    hosts: cleanText(cfg.hosts, 160) || cleanText(extraOf(view).hosts, 160),
    close: text(view, cfg, copy, 'suratClose', 90, 'close'),
    signature: cleanText(cfg.signature, 80) || view.title,
    cta: text(view, cfg, copy, 'suratCta', 30, 'cta'),
  };
}

/* ---------- cover ---------- */
export function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function countdownParts(target, now = Date.now()) {
  const diff = target.getTime() - now;
  if (diff <= 0) return null;
  const s = Math.floor(diff / 1000);
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

export function coverContent(view) {
  const cfg = sceneCfg(view, 'cover');
  const copy = copyFor(view);
  const names = view.title.split(/\s*&\s*/).map((n) => n.trim()).filter(Boolean);
  return {
    eyebrow: text(view, cfg, copy, 'coverEyebrow', 60, 'eyebrow'),
    names: names.length >= 2 ? [names[0], names[1]] : [view.title],
    tagline: text(view, cfg, copy, 'coverTagline', 120, 'tagline'),
    dateText: view.dateText,
    target: cfg.countdown === false ? null : parseDate(view.eventDate),
    cta: text(view, cfg, copy, 'coverCta', 40, 'cta'),
  };
}

/* ---------- kisah ---------- */
export function storyContent(view) {
  const cfg = sceneCfg(view, 'kisah');
  const copy = copyFor(view);
  const items = (Array.isArray(cfg.items) ? cfg.items : []).slice(0, 50).map((it) => {
    const o = it && typeof it === 'object' ? it : {};
    return { when: cleanText(o.when, 40), title: cleanText(o.title, 80), text: cleanText(o.text, 400) };
  }).filter((it) => it.title || it.text);
  return {
    eyebrow: text(view, cfg, copy, 'storyEyebrow', 60, 'eyebrow'),
    title: text(view, cfg, copy, 'storyTitle', 80, 'title'),
    cta: text(view, cfg, copy, 'storyCta', 30, 'cta'),
    items: items.slice(0, 8),
  };
}

/* ---------- detail acara ---------- */
const TZ_ABBR = { 'Asia/Jakarta': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Jayapura': 'WIT', 'Asia/Kuala_Lumpur': 'MYT', 'Asia/Singapore': 'SGT', 'Asia/Riyadh': 'AST' };

export function timeText(date, tz) {
  const zone = cleanText(tz, 40) || 'Asia/Jakarta';
  const opts = { hour: '2-digit', minute: '2-digit', hour12: false };
  let t;
  try { t = date.toLocaleTimeString('id-ID', { ...opts, timeZone: zone }); } catch { t = date.toLocaleTimeString('id-ID', { ...opts, timeZone: 'Asia/Jakarta' }); }
  return `${t.replace(':', '.')} ${TZ_ABBR[zone] || ''}`.trim();
}

function normalizeEvent(e, view, copy, tz) {
  const o = e && typeof e === 'object' ? e : {};
  const start = parseDate(o.start);
  const venue = cleanText(o.venue, 100);
  const own = cleanText(o.time, 40);
  if (!start && !venue && !own) return null;
  return {
    label: cleanText(o.label, 60) || copy.defaultEvent,
    start,
    dateText: start ? formatDate(start.toISOString(), tz) : null,
    timeText: own || (start ? timeText(start, tz) : null),
    venue,
    address: cleanText(o.address, 200),
    mapUrl: safeUrl(o.mapUrl),
    note: cleanText(o.note, 200),
    duration: clamp(Number(o.duration) || 120, 15, 720),
  };
}

export function detailContent(view) {
  const cfg = sceneCfg(view, 'detail');
  const extra = extraOf(view);
  const copy = copyFor(view);
  const tz = view.tz || extra.tz;
  const raw = Array.isArray(cfg.events) ? cfg.events : Array.isArray(extra.events) ? extra.events : [];
  let events = raw.slice(0, 30).map((e) => normalizeEvent(e, view, copy, tz)).filter(Boolean).slice(0, 6);
  if (!events.length && parseDate(view.eventDate)) {
    const v = extra.venue && typeof extra.venue === 'object' ? extra.venue : {};
    events = [normalizeEvent({ start: view.eventDate, venue: v.name, address: v.address, mapUrl: v.mapUrl }, view, copy, tz)].filter(Boolean);
  }
  return {
    eyebrow: text(view, cfg, copy, 'detailEyebrow', 60, 'eyebrow'),
    title: text(view, cfg, copy, 'detailTitle', 80, 'title'),
    cta: text(view, cfg, copy, 'detailCta', 30, 'cta'),
    dressCode: cleanText(cfg.dressCode, 120) || cleanText(extra.dressCode, 120),
    notes: (Array.isArray(cfg.notes) ? cfg.notes : []).map((n) => cleanText(n, 200)).filter(Boolean).slice(0, 4),
    events,
  };
}

const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Berkas kalender (.ics) satu acara. null bila acara tak punya tanggal. */
export function icsFor(ev, view, index = 0, now = new Date()) {
  if (!ev || !ev.start) return null;
  const end = new Date(ev.start.getTime() + ev.duration * 60000);
  const where = [ev.venue, ev.address].filter(Boolean).join(', ');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ORBIT//Undangan//ID', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${(view.slug || 'undangan')}-${index}@orbit`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(ev.start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(`${ev.label} ${view.title}`)}`,
    where ? `LOCATION:${icsEscape(where)}` : null,
    ev.note ? `DESCRIPTION:${icsEscape(ev.note)}` : null,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}

/* ---------- galeri ---------- */
export function galleryContent(view) {
  const cfg = sceneCfg(view, 'galeri');
  const copy = copyFor(view);
  const images = (Array.isArray(cfg.images) ? cfg.images : []).slice(0, 60).map((it, i) => {
    const o = it && typeof it === 'object' ? it : {};
    const src = safeUrl(o.src, 1000);
    if (!src && o.placeholder !== true) return null;
    return { src, placeholder: !src, alt: cleanText(o.alt, 120) || cleanText(o.caption, 120) || `Foto ${i + 1}`, caption: cleanText(o.caption, 120) };
  }).filter(Boolean);
  return {
    eyebrow: text(view, cfg, copy, 'galleryEyebrow', 60, 'eyebrow'),
    title: text(view, cfg, copy, 'galleryTitle', 80, 'title'),
    cta: text(view, cfg, copy, 'galleryCta', 30, 'cta'),
    images: images.slice(0, 12),
  };
}

/* ---------- penutup ---------- */
export function closingContent(view) {
  const cfg = sceneCfg(view, 'penutup');
  const copy = copyFor(view);
  return {
    eyebrow: text(view, cfg, copy, 'closingEyebrow', 60, 'eyebrow'),
    title: text(view, cfg, copy, 'closingTitle', 80, 'title'),
    body: text(view, cfg, copy, 'closingBody', 500, 'body'),
    sign: text(view, cfg, copy, 'closingSign', 60, 'sign'),
    signature: cleanText(cfg.signature, 80) || view.title,
    hosts: cleanText(cfg.hosts, 160) || cleanText(extraOf(view).hosts, 160),
    cta: text(view, cfg, copy, 'closingCta', 30, 'cta'),
  };
}
