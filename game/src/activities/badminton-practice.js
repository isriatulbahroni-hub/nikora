// Mode latihan bulu tangkis: pemain (sisi 'a') melawan bot (sisi 'b'), seluruhnya memakai fisika dan aturan
// di badminton.js. Murni (tanpa DOM/three.js) sehingga bisa dites. Koordinat = lokal lapangan (lihat court-frame.js).
import { COURT, PHYSICS, createMatch, createRally, otherSide, stepShuttle } from './badminton.js';

const SIM_DT = 1 / 120;
const HAND = Object.freeze({ minY: 0.3, maxY: 2.7, horizontal: 1.0 }); // jangkauan pukul (juga untuk bot)
const BOT = Object.freeze({ home: { x: 0, z: 4.6 }, speed: 4.6 });

/** Terbangkan kok (tanpa objek rally) sampai jatuh; mengembalikan titik jatuh dan apakah melewati net. */
export function simulateLanding(start, maxSeconds = 8) {
  let s = { pos: { ...start.pos }, vel: { ...start.vel } };
  let clear = true;
  for (let t = 0; t < maxSeconds; t += SIM_DT) {
    const n = stepShuttle(s, SIM_DT);
    if ((s.pos.z < 0) !== (n.pos.z < 0)) {
      const k = s.pos.z / (s.pos.z - n.pos.z);
      const y = s.pos.y + (n.pos.y - s.pos.y) * k;
      if (y < COURT.netHeight + 0.08) clear = false;
    }
    if (n.pos.y <= 0) return { x: n.pos.x, z: n.pos.z, clear };
    s = n;
  }
  return { x: s.pos.x, z: s.pos.z, clear: false };
}

const MODES = Object.freeze({
  clear: { elevation: 0.9, targetZ: 5.3 },
  drop: { elevation: 0.55, targetZ: 1.7 },
  smash: { elevation: 0.12, targetZ: 3.4 },
});

/**
 * Rencanakan pukulan dari sisi `side` ke `target` (lokal): cari tenaga yang membuat kok jatuh paling dekat
 * dengan target sambil melewati net. Mengembalikan { dir, power, landing } atau null bila tak ada yang melewati net.
 */
export function planShot({ pos, side, target, mode = 'clear' }) {
  const { elevation } = MODES[mode];
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const h = Math.hypot(dx, dz) || 1;
  const dir = { x: dx / h, y: elevation, z: dz / h };
  const n = Math.hypot(dir.x, dir.y, dir.z);
  let best = null;
  for (let power = 0.05; power <= 1.0001; power += 0.025) {
    const speed = PHYSICS.minHitSpeed + (PHYSICS.maxHitSpeed - PHYSICS.minHitSpeed) * power;
    const landing = simulateLanding({ pos, vel: { x: (dir.x / n) * speed, y: (dir.y / n) * speed, z: (dir.z / n) * speed } });
    if (!landing.clear) continue;
    const miss = Math.hypot(landing.x - target.x, landing.z - target.z);
    if (!best || miss < best.miss) best = { dir, power, landing, miss };
  }
  void side;
  return best;
}

/** Pilih jenis pukulan menurut keadaan kok: tinggi = smash, dekat net = drop, selain itu clear. */
export function chooseMode(shuttlePos) {
  if (shuttlePos.y > 1.9 && Math.abs(shuttlePos.z) > 1.8) return 'smash';
  if (Math.abs(shuttlePos.z) < 1.8 && shuttlePos.y < 1.6) return 'drop';
  return 'clear';
}

const horizontal = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createPractice({ botSkill = 0.8, random = Math.random } = {}) {
  let match = null;
  let rally = null;
  let phase = 'off'; // off | serve | rally | point | over
  let timer = 0;
  let message = '';
  const bot = { x: BOT.home.x, z: BOT.home.z };
  let botPlan = null;

  const newRally = () => {
    rally = createRally();
    phase = 'serve';
    timer = match.server === 'b' ? 1.1 : 0;
    bot.x = BOT.home.x;
    bot.z = BOT.home.z;
    botPlan = null;
    message = match.server === 'a' ? 'Giliranmu servis' : 'Lawan akan servis';
  };

  const err = (amount) => (random() * 2 - 1) * amount;

  const botShot = (shuttle) => {
    const ok = random() < botSkill;
    const mode = chooseMode(shuttle.pos);
    const m = MODES[mode];
    // sasaran di sisi pemain (z negatif); bot yang kurang beruntung membidik buruk
    const target = { x: err(ok ? 2.4 : 4), z: -m.targetZ + err(ok ? 0.6 : 3.6) };
    const shot = planShot({ pos: shuttle.pos, side: 'b', target, mode });
    if (!shot) return null;
    return { dir: shot.dir, power: Math.min(1, Math.max(0.05, shot.power + (ok ? 0 : err(0.45)))) };
  };

  const finishPoint = (winner, why) => {
    const res = match.award(winner);
    const mine = winner === 'a';
    message = `${why} · ${mine ? 'Poin untukmu' : 'Poin untuk lawan'} (${match.score.a}-${match.score.b})`;
    if (res.winner) {
      phase = 'over';
      message = `${res.winner === 'a' ? 'Kamu menang!' : 'Lawan menang'} ${match.score.a}-${match.score.b}`;
    } else {
      phase = 'point';
      timer = 1.8;
    }
    return { type: res.winner ? 'over' : 'point', winner, score: match.score, message };
  };

  const why = (ev) => (ev.netHit ? 'Kok tersangkut di net' : !ev.inBounds ? 'Kok keluar garis' : 'Kok jatuh di lapangan');

  return {
    get phase() { return phase; },
    get active() { return phase !== 'off'; },
    get score() { return match ? match.score : { a: 0, b: 0 }; },
    get server() { return match?.server ?? null; },
    get shuttle() { return rally?.shuttle ?? null; },
    get bot() { return bot; },
    get message() { return message; },
    get matchWinner() { return match?.winner ?? null; },

    start() {
      match = createMatch({ firstServer: 'a' });
      newRally();
    },
    stop() {
      phase = 'off';
      rally = null;
      match = null;
      message = '';
    },

    canServe: () => phase === 'serve' && match?.server === 'a',
    serve({ power = 0.6, aimX = 0 } = {}) {
      if (phase !== 'serve' || match.server !== 'a') return { ok: false, reason: 'bukan-giliranmu' };
      const r = rally.serve('a', { power, aimX });
      if (r.ok) { phase = 'rally'; message = ''; }
      return r;
    },

    /** Kok ada di sisi pemain, dalam jangkauan, dan lawan yang terakhir memukul. */
    canHit(player) {
      if (phase !== 'rally' || !rally.shuttle || rally.lastHitSide === 'a') return false;
      const s = rally.shuttle.pos;
      return s.z < 0 && s.y >= HAND.minY && s.y <= HAND.maxY && horizontal(s, player) <= HAND.horizontal;
    },
    /** aim -1..1 menggeser bidikan ke samping (x lokal). Mengembalikan hasil `swing` + jenis pukulan. */
    hit(player, { aim = 0 } = {}) {
      if (!this.canHit(player)) return { ok: false, reason: 'tidak-bisa-memukul' };
      const s = rally.shuttle.pos;
      const mode = chooseMode({ ...s, z: -s.z }); // cermin: dari sisi a, z negatif = dekat net bila kecil
      const m = MODES[mode];
      // makin jauh dari titik ideal, makin besar kesalahan bidikan
      const sloppy = horizontal(s, player) / HAND.horizontal;
      const target = { x: Math.max(-2.7, Math.min(2.7, aim * 2.6 + err(0.25 + 1.2 * sloppy))), z: m.targetZ + err(0.3 + 0.9 * sloppy) };
      const shot = planShot({ pos: s, side: 'a', target, mode });
      if (!shot) return { ok: false, reason: 'tak-ada-lintasan' };
      const res = rally.swing('a', { racket: { ...s }, dir: shot.dir, power: shot.power });
      return { ...res, mode };
    },

    /** Maju `dt` detik. `player` = posisi lokal pemain. Mengembalikan daftar peristiwa untuk HUD/suara. */
    tick(dt, player) {
      const events = [];
      if (phase === 'off' || phase === 'over') return events;
      if (phase === 'point') {
        timer -= dt;
        if (timer <= 0) newRally();
        return events;
      }
      if (phase === 'serve') {
        if (match.server === 'b') {
          timer -= dt;
          if (timer <= 0) {
            rally.serve('b', { power: 0.55 + err(0.15), aimX: err(0.8) });
            phase = 'rally';
            message = '';
            events.push({ type: 'serve', by: 'b' });
          }
        }
        return events;
      }
      // rally
      const shuttle = rally.shuttle;
      if (shuttle.pos.z > 0 && rally.lastHitSide === 'a') {
        // lawan mengejar titik jatuh yang diperkirakan lalu memukul bila sempat
        if (!botPlan) {
          const landing = simulateLanding({ pos: shuttle.pos, vel: shuttle.vel });
          botPlan = { x: Math.max(-2.9, Math.min(2.9, landing.x)), z: Math.max(0.6, Math.min(6.5, landing.z)) };
        }
        const dx = botPlan.x - bot.x;
        const dz = botPlan.z - bot.z;
        const d = Math.hypot(dx, dz);
        const step = Math.min(d, BOT.speed * botSkill * dt);
        if (d > 1e-6) { bot.x += (dx / d) * step; bot.z += (dz / d) * step; }
        const s = shuttle.pos;
        if (s.z > 0 && s.y >= HAND.minY && s.y <= 2.2 && shuttle.vel.y < 0 && horizontal(s, bot) <= HAND.horizontal * 0.9) {
          const shot = botShot(shuttle);
          if (shot) {
            const res = rally.swing('b', { racket: { ...s }, dir: shot.dir, power: shot.power });
            if (res.ok) { botPlan = null; events.push({ type: 'hit', by: 'b' }); }
          }
        }
      } else if (rally.lastHitSide === 'b') {
        botPlan = null;
        // kembali ke posisi tengah selagi kok di sisi pemain
        const dx = BOT.home.x - bot.x;
        const dz = BOT.home.z - bot.z;
        const d = Math.hypot(dx, dz);
        const step = Math.min(d, BOT.speed * 0.6 * dt);
        if (d > 1e-6) { bot.x += (dx / d) * step; bot.z += (dz / d) * step; }
      }
      void player;
      const ev = rally.step(dt);
      if (ev) events.push(finishPoint(ev.winner, why(ev)));
      return events;
    },
  };
}

export { otherSide };
