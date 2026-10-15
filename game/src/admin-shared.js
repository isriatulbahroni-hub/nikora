// Logika murni yang dipakai bersama oleh server (api/admin/stats) dan dasbor (browser). Tanpa dependensi Node/DOM.
const SLUG_ROOM = /^evt-([a-z0-9][a-z0-9-]{1,38}[a-z0-9])-(hall|villa)$/;
export const WORLD_LABELS = Object.freeze({ hall: 'Aula Resepsi', villa: 'NIKORA Wedding Villa' });
export const ROLE_LABELS = Object.freeze({ owner: 'Pemilik acara', mc: 'MC', guest: 'Tamu' });

/** Nama ruang LiveKit -> jenis dan dunia. */
export function parseRoomName(name) {
  if (name === 'orbit-hall') return { kind: 'umum', world: 'hall', slug: null, label: `${WORLD_LABELS.hall} (ruang umum)` };
  if (name === 'nikora-villa') return { kind: 'umum', world: 'villa', slug: null, label: `${WORLD_LABELS.villa} (ruang umum)` };
  const m = SLUG_ROOM.exec(String(name ?? ''));
  if (m) return { kind: 'acara', world: m[2], slug: m[1], label: `Acara ${m[1]} · ${m[2] === 'villa' ? 'Vila' : 'Aula'}` };
  return { kind: 'lainnya', world: null, slug: null, label: String(name ?? '').slice(0, 60) };
}

/** Peran dari metadata peserta (diisi server saat menerbitkan token). Selain owner/mc dianggap tamu. */
export function parseRole(metadata) {
  try {
    const role = JSON.parse(metadata || 'null')?.role;
    return role === 'owner' || role === 'mc' ? role : 'guest';
  } catch {
    return 'guest';
  }
}

/** Dunia bawaan sebuah acara (docs/INTEGRATION.md): pernikahan -> vila, selain itu -> aula; extra.world menang. */
export function worldFor(eventType, extraWorld) {
  if (extraWorld === 'villa' || extraWorld === 'hall') return extraWorld;
  return /nikah|wedding|akad|resepsi/i.test(String(eventType ?? '')) ? 'villa' : 'hall';
}

const dayKey = (ms, tz = 'Asia/Jakarta') => new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

/** Status acara menurut tanggalnya (zona waktu acara, bawaan WIB). */
export function eventStatus(date, nowMs, tz) {
  const t = Date.parse(date ?? '');
  if (!Number.isFinite(t)) return 'tanpa-tanggal';
  const a = dayKey(t, tz);
  const b = dayKey(nowMs, tz);
  if (a === b) return 'berlangsung';
  return a < b ? 'selesai' : 'mendatang';
}

/** Peringatan yang bisa ditindaklanjuti, dihitung dari data statistik. level: error | warn | info. */
export function buildAlerts(stats) {
  const out = [];
  const sys = stats?.system ?? {};
  const rt = sys.realtime;
  if (rt && !rt.configured) out.push({ id: 'livekit-config', level: 'warn', title: 'Suara dan multiplayer belum aktif', detail: 'LIVEKIT_URL, LIVEKIT_API_KEY, atau LIVEKIT_API_SECRET belum terbaca di server. Pasang di Vercel lalu Redeploy.' });
  else if (rt && !rt.ok) out.push({ id: 'livekit-down', level: 'error', title: 'LiveKit tidak merespons', detail: rt.error || 'Server realtime tidak dapat dihubungi.' });
  else if (rt?.ms > 1500) out.push({ id: 'livekit-slow', level: 'warn', title: 'LiveKit lambat', detail: `Waktu respons ${rt.ms} ms.` });
  const db = sys.database;
  if (db && !db.configured) out.push({ id: 'db-config', level: 'warn', title: 'Basis data belum terhubung', detail: 'SUPABASE_URL dan SUPABASE_ANON_KEY belum terbaca di server.' });
  else if (db && !db.ok) out.push({ id: 'db-down', level: 'error', title: 'Basis data tidak merespons', detail: db.error || 'Supabase tidak dapat dihubungi.' });
  else if (db?.ms > 1500) out.push({ id: 'db-slow', level: 'warn', title: 'Basis data lambat', detail: `Waktu respons ${db.ms} ms.` });
  if (stats?.env && !stats.env.roleSecret) out.push({ id: 'role-open', level: 'warn', title: 'Peran pemilik/MC belum dikunci', detail: 'EVENT_ROLE_SECRET kosong atau kurang dari 16 karakter: siapa pun bisa menjadi MC.' });
  if (stats?.events?.configured && stats.events.scope === 'aktif') out.push({ id: 'events-scope', level: 'info', title: 'Hanya undangan aktif yang tampil', detail: 'Pasang SUPABASE_SERVICE_ROLE_KEY (khusus server) untuk melihat juga draf dan undangan nonaktif.' });
  return out;
}

export const countAlerts = (alerts) => alerts.filter((a) => a.level !== 'info').length;
