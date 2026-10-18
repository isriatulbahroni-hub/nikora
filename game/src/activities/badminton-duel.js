// Pertandingan bulu tangkis manusia lawan manusia (dua pemain sungguhan). Murni (tanpa DOM/three.js/jaringan):
// satu "tuan rumah" menjalankan `createDuel`, menyiarkan `snapshot()`, dan semua klien membacanya lewat
// `createDuelMirror`. Koordinat = lokal lapangan (lihat court-frame.js): net di z = 0, sisi 'a' z < 0, 'b' z > 0.
import { createMatch, createRally, otherSide, stepShuttle } from './badminton.js';
import { HAND, MODES, chooseMode, planShot } from './shot-planner.js';

const horizontal = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r3 = (n) => Math.round(n * 1000) / 1000;
const r2 = (n) => Math.round(n * 100) / 100;

/** Bisakah pemain di sisi `side` memukul sekarang? Murni; dipakai tuan rumah (otoritatif) dan klien (tombol/pukulan menunggu). */
export function canHitState({ phase, lastHitSide, shuttle, side, player }) {
  if (phase !== 'rally' || !shuttle || !player || lastHitSide === side) return false;
  const s = shuttle.pos;
  const onMyHalf = side === 'a' ? s.z < 0 : s.z > 0;
  return onMyHalf && s.y >= HAND.minY && s.y <= HAND.maxY && horizontal(s, player) <= HAND.horizontal;
}

export function createDuel({ random = Math.random } = {}) {
  const ids = { a: null, b: null };
  let match = null;
  let rally = null;
  let phase = 'lobby'; // lobby | serve | rally | point | over
  let timer = 0;
  let winnerSide = null;
  let lastPoint = null; // { n, w, y } : nomor poin, pemenang, alasan (net | out | in | fault)
  let pointNo = 0;
  let seq = 0;

  const err = (amount) => (random() * 2 - 1) * amount;
  const sideOf = (id) => (ids.a === id ? 'a' : ids.b === id ? 'b' : null);

  const newRally = () => {
    rally = createRally();
    phase = 'serve';
  };

  const award = (winner, why) => {
    const res = match.award(winner);
    lastPoint = { n: ++pointNo, w: winner, y: why };
    if (res.winner) {
      phase = 'over';
      winnerSide = res.winner;
    } else {
      phase = 'point';
      timer = 1.8;
    }
    return { type: res.winner ? 'over' : 'point', winner, why, score: match.score };
  };

  return {
    get phase() { return phase; },
    get ids() { return { ...ids }; },
    get score() { return match ? match.score : { a: 0, b: 0 }; },
    get server() { return match?.server ?? null; },
    get winnerSide() { return winnerSide; },
    get shuttle() { return rally?.shuttle ?? null; },
    get lastHitSide() { return rally?.lastHitSide ?? null; },
    sideOf,

    join(id) {
      if (typeof id !== 'string' || !id) return { ok: false, reason: 'pemain-tidak-valid' };
      const existing = sideOf(id);
      if (existing) return { ok: true, side: existing };
      if (phase === 'over') return { ok: false, reason: 'selesai' };
      const side = !ids.a ? 'a' : !ids.b ? 'b' : null;
      if (!side) return { ok: false, reason: 'penuh' };
      ids[side] = id;
      if (ids.a && ids.b && phase === 'lobby') {
        match = createMatch({ firstServer: 'a' });
        newRally();
      }
      return { ok: true, side };
    },

    /** Keluar di tengah pertandingan = kalah (WO); lawan yang tersisa menang. */
    leave(id) {
      const side = sideOf(id);
      if (!side) return { ok: false, reason: 'bukan-peserta' };
      ids[side] = null;
      let forfeit = false;
      if (phase !== 'lobby' && phase !== 'over') {
        phase = 'over';
        winnerSide = otherSide(side);
        forfeit = true;
      }
      if (phase === 'lobby') match = null;
      return { ok: true, forfeit, empty: !ids.a && !ids.b };
    },

    canServe: (id) => phase === 'serve' && !!match && ids[match.server] === id,
    serve(id, { power = 0.62, aimX = 0 } = {}) {
      if (!(phase === 'serve' && match && ids[match.server] === id)) return { ok: false, reason: 'bukan-giliranmu' };
      const res = rally.serve(match.server, { power, aimX });
      if (res.ok) phase = 'rally';
      return res;
    },

    canHit(id, player) {
      const side = sideOf(id);
      return !!side && canHitState({ phase, lastHitSide: rally?.lastHitSide ?? null, shuttle: rally?.shuttle ?? null, side, player });
    },

    /** `aim` -1..1 menggeser bidikan ke samping (x lokal). Jenis pukulan dipilih dari keadaan kok. */
    hit(id, player, { aim = 0 } = {}) {
      if (!this.canHit(id, player)) return { ok: false, reason: 'tidak-bisa-memukul' };
      const side = sideOf(id);
      const mirror = side === 'b';
      const s = rally.shuttle.pos;
      const from = mirror ? { x: s.x, y: s.y, z: -s.z } : { x: s.x, y: s.y, z: s.z }; // semua dihitung dari sudut pandang sisi 'a'
      const mode = chooseMode(from);
      const sloppy = horizontal(s, player) / HAND.horizontal; // makin jauh dari titik ideal, makin meleset
      const safeAim = Number.isFinite(aim) ? Math.max(-1, Math.min(1, aim)) : 0;
      const target = { x: Math.max(-2.7, Math.min(2.7, safeAim * 2.6 + err(0.25 + 1.2 * sloppy))), z: MODES[mode].targetZ + err(0.3 + 0.9 * sloppy) };
      const shot = planShot({ pos: from, side: 'a', target, mode });
      if (!shot) return { ok: false, reason: 'tak-ada-lintasan' };
      const dir = mirror ? { x: shot.dir.x, y: shot.dir.y, z: -shot.dir.z } : shot.dir;
      const res = rally.swing(side, { racket: { ...s }, dir, power: shot.power });
      return { ...res, mode };
    },

    /** Maju `dt` detik. Mengembalikan peristiwa: { type: 'point' | 'over', winner, why, score }. */
    tick(dt) {
      if (phase === 'point') {
        timer -= dt;
        if (timer <= 0) newRally();
        return [];
      }
      if (phase !== 'rally') return [];
      const ev = rally.step(dt);
      if (!ev) return [];
      return [award(ev.winner, ev.netHit ? 'net' : ev.inBounds ? 'in' : 'out')];
    },

    snapshot() {
      const sh = rally?.shuttle;
      return {
        ph: phase,
        a: ids.a,
        b: ids.b,
        sc: [this.score.a, this.score.b],
        sv: match?.server ?? null,
        lh: rally?.lastHitSide ?? null,
        lp: lastPoint ? [lastPoint.n, lastPoint.w, lastPoint.y] : null,
        w: winnerSide,
        sh: sh ? [r3(sh.pos.x), r3(sh.pos.y), r3(sh.pos.z), r2(sh.vel.x), r2(sh.vel.y), r2(sh.vel.z)] : null,
        q: ++seq,
      };
    },
  };
}

const PHASES = ['lobby', 'serve', 'rally', 'point', 'over'];
const idOrNull = (v) => (typeof v === 'string' && v ? v.slice(0, 64) : null);

/** Memeriksa dan merapikan snapshot dari jaringan (tidak dipercaya). Mengembalikan null bila rusak. */
export function parseSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || !PHASES.includes(raw.ph)) return null;
  const sc = Array.isArray(raw.sc) && raw.sc.length === 2 && raw.sc.every((n) => Number.isInteger(n) && n >= 0 && n <= 99) ? raw.sc : null;
  if (!sc || !Number.isInteger(raw.q)) return null;
  let sh = null;
  if (Array.isArray(raw.sh) && raw.sh.length === 6 && raw.sh.every(Number.isFinite)) sh = raw.sh;
  const lp = Array.isArray(raw.lp) && raw.lp.length === 3 && Number.isInteger(raw.lp[0]) && (raw.lp[1] === 'a' || raw.lp[1] === 'b') ? [raw.lp[0], raw.lp[1], String(raw.lp[2]).slice(0, 8)] : null;
  return {
    ph: raw.ph,
    a: idOrNull(raw.a),
    b: idOrNull(raw.b),
    sc,
    sv: raw.sv === 'a' || raw.sv === 'b' ? raw.sv : null,
    lh: raw.lh === 'a' || raw.lh === 'b' ? raw.lh : null,
    lp,
    w: raw.w === 'a' || raw.w === 'b' ? raw.w : null,
    sh,
    q: raw.q,
  };
}

/** Cermin sisi klien: menyimpan snapshot terbaru dan memperkirakan posisi kok di antara dua snapshot. */
export function createDuelMirror() {
  let snap = null;
  let at = 0;
  return {
    get snap() { return snap; },
    reset() { snap = null; at = 0; },
    /** Terima snapshot; yang lebih lama dari yang sudah ada diabaikan. Mengembalikan true bila dipakai. */
    apply(raw, nowMs) {
      const parsed = parseSnapshot(raw);
      if (!parsed) return false;
      if (snap && parsed.q <= snap.q) return false;
      snap = parsed;
      at = nowMs;
      return true;
    },
    ageMs: (nowMs) => (snap ? nowMs - at : Infinity),
    sideOf(id) {
      if (!snap || !id) return null;
      return snap.a === id ? 'a' : snap.b === id ? 'b' : null;
    },
    /** Kok pada waktu `nowMs`: dari snapshot, dimajukan dengan fisika yang sama (maksimal 0,25 dtk). */
    shuttleAt(nowMs) {
      if (!snap?.sh) return null;
      let s = { pos: { x: snap.sh[0], y: snap.sh[1], z: snap.sh[2] }, vel: { x: snap.sh[3], y: snap.sh[4], z: snap.sh[5] } };
      if (snap.ph !== 'rally') return s;
      const dt = Math.min(0.25, Math.max(0, (nowMs - at) / 1000));
      for (let t = 0; t < dt; t += 1 / 120) {
        s = stepShuttle(s, Math.min(1 / 120, dt - t));
        if (s.pos.y <= 0) return { pos: { ...s.pos, y: 0 }, vel: { x: 0, y: 0, z: 0 } };
      }
      return s;
    },
    canHit(selfId, player, nowMs) {
      const side = this.sideOf(selfId);
      if (!side || !snap) return false;
      return canHitState({ phase: snap.ph, lastHitSide: snap.lh, shuttle: this.shuttleAt(nowMs), side, player });
    },
  };
}
