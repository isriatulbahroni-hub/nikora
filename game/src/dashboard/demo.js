// Data CONTOH untuk meninjau tampilan tanpa server. Selalu diberi label "DATA CONTOH" di antarmuka.
import { buildAlerts } from '../admin-shared.js';

export function demoStats(now = Date.now()) {
  const DAY = 86_400_000;
  const day = (offset) => new Date(now + offset * DAY).toISOString().slice(0, 10);
  const wib = (ms) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
  const items = [
    { slug: 'pernikahan-roni-rina', title: 'Pernikahan Roni & Rina', type: 'pernikahan', world: 'villa', date: day(0), createdAt: new Date(now - 9 * DAY).toISOString() },
    { slug: 'tazkirah-aula-alfalah', title: 'Tazkirah Komunitas', type: 'tazkirah', world: 'hall', date: day(1), createdAt: new Date(now - 6 * DAY).toISOString() },
    { slug: 'villa-garden-royale', title: 'Villa Garden Royale', type: 'pernikahan', world: 'villa', date: day(-2), createdAt: new Date(now - 4 * DAY).toISOString() },
    { slug: 'karaoke-keluarga', title: 'Karaoke Keluarga Besar', type: 'karaoke', world: 'hall', date: day(12), createdAt: new Date(now - 2 * DAY).toISOString() },
    { slug: 'pernikahan-andi-sari', title: 'Pernikahan Andi & Sari', type: 'pernikahan', world: 'villa', date: day(30), createdAt: new Date(now - 1 * DAY).toISOString() },
    { slug: 'ulang-tahun-nara', title: 'Ulang Tahun Nara', type: 'ulang-tahun', world: 'hall', date: null, createdAt: new Date(now - 3 * 3_600_000).toISOString() },
  ].map((e) => ({ ...e, mode: null, theme: null, tz: null }));
  const perDay = {};
  for (const e of items) perDay[wib(Date.parse(e.createdAt))] = (perDay[wib(Date.parse(e.createdAt))] ?? 0) + 1;
  const mk = (name, role, room, world, slug, minAgo) => ({ id: name.toLowerCase().replace(/\W/g, '').slice(0, 8), name, role, room, world, slug, joinedAt: now - minAgo * 60_000 });
  const participants = [
    mk('Roni', 'owner', 'evt-pernikahan-roni-rina-villa', 'villa', 'pernikahan-roni-rina', 42),
    mk('Pak Ahmad', 'mc', 'evt-pernikahan-roni-rina-villa', 'villa', 'pernikahan-roni-rina', 40),
    mk('Dewi', 'guest', 'evt-pernikahan-roni-rina-villa', 'villa', 'pernikahan-roni-rina', 31),
    mk('Budi', 'guest', 'evt-pernikahan-roni-rina-villa', 'villa', 'pernikahan-roni-rina', 12),
    mk('Sari', 'guest', 'nikora-villa', 'villa', null, 7),
    mk('Tamu-381', 'guest', 'orbit-hall', 'hall', null, 3),
  ];
  const rooms = [
    { name: 'evt-pernikahan-roni-rina-villa', kind: 'acara', world: 'villa', slug: 'pernikahan-roni-rina', label: 'Acara pernikahan-roni-rina · Vila', participants: 4, createdAt: now - 45 * 60_000 },
    { name: 'nikora-villa', kind: 'umum', world: 'villa', slug: null, label: 'NIKORA Wedding Villa (ruang umum)', participants: 1, createdAt: now - 20 * 60_000 },
    { name: 'orbit-hall', kind: 'umum', world: 'hall', slug: null, label: 'Aula Resepsi (ruang umum)', participants: 1, createdAt: now - 5 * 60_000 },
  ];
  const stats = {
    demo: true, generatedAt: now, version: 'contoh', region: 'sin1',
    env: { livekit: true, supabase: true, roleSecret: true, serviceKey: false },
    system: { api: { ok: true }, realtime: { configured: true, ok: true, ms: 118, error: null }, database: { configured: true, ok: true, ms: 64, error: null } },
    live: { rooms, participants, totalParticipants: 6 },
    events: { configured: true, scope: 'aktif', total: items.length, items, perDay },
  };
  stats.alerts = buildAlerts(stats);
  return stats;
}

/** Riwayat contoh untuk grafik live (30 menit terakhir, tiap 30 detik). */
export function demoSamples(now = Date.now()) {
  return Array.from({ length: 60 }, (_, i) => {
    const t = now - (59 - i) * 30_000;
    const users = Math.max(0, Math.round(3 + 3 * Math.sin(i / 7) + (i > 40 ? (i - 40) / 4 : 0)));
    return { t, users, rooms: Math.max(1, Math.min(3, Math.ceil(users / 3))) };
  });
}
