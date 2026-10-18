// TV di setiap ruangan villa (kecuali lorong, teras, tangga, aula yang sudah punya layar tancap, dan ruang game).
// Tiap tamu memutar videonya sendiri di TV kamar: tidak terkait layar utama dan tidak terlihat orang lain.
import { parseMediaLink, embedUrl } from './screen/media-resolve.js';
import { levelY } from './villa-layout.js';
import { EDGE, blockedSpans } from './villa-tv.js';

// Ruang game punya layar permainannya sendiri, jadi tidak diberi TV kamar.
const SKIP_KINDS = new Set(['stair', 'terrace', 'corridor', 'hall', 'game']);
export const TV_SIZE = Object.freeze({ width: 1.4, height: 0.8, y: 1.6, inset: 0.2, clearance: 0.9, frame: 1.5 }); // frame = lebar bingkai (room-tv-view.js)
export const TV_RANGE = 3.4; // jarak maksimum ke TV (dalam ruangan yang sama) untuk menontonnya
export const BEDROOM_TV_RANGE = 25; // kamar tidur: TV bisa ditonton dari mana saja di kamar, termasuk dari tempat tidur (suite sedalam 17 m)
const STEP = 0.05;

/**
 * Posisi TV: menempel di dinding ruangan, di dinding terjauh dari tempat tidur/sofa (kamar tidur: dinding kaki tempat
 * tidur, sehingga bisa ditonton sambil berbaring), digeser dari pintu dan jendela, sedekat mungkin segaris dengan tempat tidur.
 */
export function placeTvs(world) {
  const out = [];
  const half = TV_SIZE.frame / 2;
  for (const L of world.levels) {
    const seats = (L.props ?? []).filter((p) => p.type === 'bed' || p.type === 'sofa');
    for (const room of L.rooms) {
      if (SKIP_KINDS.has(room.kind)) continue;
      const [x1, z1, x2, z2] = room.rect;
      const here = seats.filter((b) => b.x > x1 && b.x < x2 && b.z > z1 && b.z < z2);
      const inside = here.some((b) => b.type === 'bed') ? here.filter((b) => b.type === 'bed') : here; // kamar tidur: TV menghadap tempat tidur, bukan sofa
      const edges = [
        { orient: 'h', coord: z1, nx: 0, nz: 1 },
        { orient: 'h', coord: z2, nx: 0, nz: -1 },
        { orient: 'v', coord: x1, nx: 1, nz: 0 },
        { orient: 'v', coord: x2, nx: -1, nz: 0 },
      ];
      let best = null;
      for (const e of edges) {
        const h = e.orient === 'h';
        const lo = (h ? x1 : z1) + EDGE + half;
        const hi = (h ? x2 : z2) - EDGE - half;
        if (hi < lo) continue;
        const spans = blockedSpans(L, e.orient, e.coord);
        const want = inside.length ? inside.reduce((s, b) => s + (h ? b.x : b.z), 0) / inside.length : (lo + hi) / 2;
        let spot = null;
        for (let t = lo; t <= hi + 1e-9; t += STEP) {
          if (spans.some(([a, b]) => t + half > a && t - half < b)) continue;
          // lampu status pintu ada di sisi positif pintu, jadi sisi negatif sedikit diutamakan
          const cost = Math.abs(t - want) + (t > want ? 0.01 : 0);
          if (!spot || cost < spot.cost - 1e-9) spot = { t, cost };
        }
        if (!spot) continue;
        const x = h ? spot.t : e.coord;
        const z = h ? e.coord : spot.t;
        const score = inside.length ? Math.min(...inside.map((b) => Math.hypot(b.x - x, b.z - z))) : 100 - spot.cost;
        if (!best || score > best.score + 1e-9) best = { ...e, x, z, score };
      }
      if (!best) continue;
      out.push({
        id: `tv_${room.id}`, room: room.id, roomName: room.name, level: L.level, rect: room.rect,
        x: Math.round((best.x + best.nx * TV_SIZE.inset) * 100) / 100, z: Math.round((best.z + best.nz * TV_SIZE.inset) * 100) / 100, y: levelY(L.level) + TV_SIZE.y,
        nx: best.nx, nz: best.nz, rot: Math.atan2(best.nx, best.nz),
        range: here.some((b) => b.type === 'bed') ? BEDROOM_TV_RANGE : TV_RANGE,
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
    if (d <= Math.max(range, t.range ?? 0) && (!best || d < best.dist)) best = { tv: t, dist: d };
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
