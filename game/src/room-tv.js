// TV di setiap ruangan villa (kecuali lorong, teras, tangga, dan aula yang sudah punya layar tancap).
// Tiap tamu memutar videonya sendiri di TV kamar: tidak terkait layar utama dan tidak terlihat orang lain.
import { parseMediaLink, embedUrl } from './screen/media-resolve.js';
import { levelY } from './villa-layout.js';

const SKIP_KINDS = new Set(['stair', 'terrace', 'corridor', 'hall']);
export const TV_SIZE = Object.freeze({ width: 1.4, height: 0.8, y: 1.6, inset: 0.2, clearance: 0.9 });
export const TV_RANGE = 3.4; // jarak maksimum ke TV (dalam ruangan yang sama) untuk menontonnya

/** Posisi TV: menempel di dinding ruangan yang tidak tertutup pintu, paling jauh dari tempat tidur/sofa. */
export function placeTvs(world) {
  const out = [];
  for (const L of world.levels) {
    const seats = (L.props ?? []).filter((p) => p.type === 'bed' || p.type === 'sofa');
    for (const room of L.rooms) {
      if (SKIP_KINDS.has(room.kind)) continue;
      const [x1, z1, x2, z2] = room.rect;
      const cx = (x1 + x2) / 2;
      const cz = (z1 + z2) / 2;
      const inside = seats.filter((b) => b.x > x1 && b.x < x2 && b.z > z1 && b.z < z2);
      const edges = [
        { orient: 'h', coord: z1, x: cx, z: z1, nx: 0, nz: 1 },
        { orient: 'h', coord: z2, x: cx, z: z2, nx: 0, nz: -1 },
        { orient: 'v', coord: x1, x: x1, z: cz, nx: 1, nz: 0 },
        { orient: 'v', coord: x2, x: x2, z: cz, nx: -1, nz: 0 },
      ];
      let best = null;
      for (const e of edges) {
        const blocked = L.doors.some((d) => d.orient === e.orient
          && Math.abs((e.orient === 'h' ? d.z : d.x) - e.coord) < 1e-6
          && Math.abs(e.orient === 'h' ? d.x - e.x : d.z - e.z) < d.width / 2 + TV_SIZE.clearance);
        if (blocked) continue;
        const score = inside.length ? Math.min(...inside.map((b) => Math.hypot(b.x - e.x, b.z - e.z))) : 100;
        if (!best || score > best.score) best = { ...e, score };
      }
      if (!best) continue;
      out.push({
        id: `tv_${room.id}`, room: room.id, roomName: room.name, level: L.level, rect: room.rect,
        x: best.x + best.nx * TV_SIZE.inset, z: best.z + best.nz * TV_SIZE.inset, y: levelY(L.level) + TV_SIZE.y,
        nx: best.nx, nz: best.nz, rot: Math.atan2(best.nx, best.nz),
      });
    }
  }
  return out;
}

/** TV terdekat yang boleh ditonton: lantai dan ruangan yang sama dengan pemain, dalam jangkauan. */
export function nearestTv(tvs, me, range = TV_RANGE) {
  if (me.stair != null) return null;
  const level = me.level ?? 0;
  let best = null;
  for (const t of tvs) {
    if (t.level !== level) continue;
    const [x1, z1, x2, z2] = t.rect;
    if (me.x < x1 || me.x > x2 || me.z < z1 || me.z > z2) continue;
    const d = Math.hypot(t.x - me.x, t.z - me.z);
    if (d <= range && (!best || d < best.dist)) best = { tv: t, dist: d };
  }
  return best?.tv ?? null;
}

/**
 * Jenis video dari teks yang ditempel tamu:
 * { kind:'embed', provider, src } (YouTube/TikTok, pemutar resmi) | { kind:'video', src } (tautan https langsung .mp4/.webm)
 * | { kind:'unsupported', reason } | { kind:'none' }
 */
export function classifyMedia(input) {
  const text = String(input ?? '').trim();
  if (!text) return { kind: 'none' };
  const link = parseMediaLink(text);
  if (link?.type === 'youtube' || link?.type === 'tiktok') {
    const url = new URL(embedUrl(link));
    url.searchParams.set('controls', '1'); // pemutar pribadi: tamu perlu tombol jeda/geser
    return { kind: 'embed', provider: link.type, src: url.toString() };
  }
  if (link?.type === 'tiktok-short') return { kind: 'unsupported', reason: 'tiktok-short' };
  try {
    const u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (u.protocol === 'https:' && /\.(mp4|webm|ogv|m4v|mov)$/i.test(u.pathname)) return { kind: 'video', src: u.toString() };
  } catch {
    /* bukan tautan */
  }
  return { kind: 'unsupported', reason: 'format' };
}

export const MEDIA_MESSAGES = Object.freeze({
  'tiktok-short': 'Link pendek TikTok belum didukung. Buka videonya lalu salin link panjangnya.',
  format: 'Link tidak dikenali. Pakai link YouTube, TikTok (panjang), atau video .mp4/.webm. Atau pilih video dari HP.',
});
