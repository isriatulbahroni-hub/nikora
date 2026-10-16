// Kerangka aktivitas dunia ORBIT: definisi permainan + sesi bermain (murni, tanpa DOM/three.js,
// jadi bisa dipakai klien dan server serta dites dengan `node --test`).
// Satu aktivitas = satu modul permainan; lokasi hanya menaruh "stasiun" yang menunjuk id aktivitas.

export const CATEGORIES = Object.freeze([
  'olahraga', 'ketangkasan', 'permainan-meja', 'petualangan', 'sosial', 'kreatif', 'kenangan', 'kuis', 'santai',
]);
/** `ramai` = boleh bersuara/berlari; `tenang` = cocok untuk zona yang menjaga ketenangan (mis. masjid). */
export const TONES = Object.freeze(['ramai', 'tenang']);

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function defineActivity(def) {
  const { id, label, category, tone, minPlayers = 1, maxPlayers } = def ?? {};
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error(`id aktivitas tidak valid: ${id}`);
  if (typeof label !== 'string' || !label.trim()) throw new Error(`label aktivitas kosong: ${id}`);
  if (!CATEGORIES.includes(category)) throw new Error(`kategori tidak dikenal (${id}): ${category}`);
  if (!TONES.includes(tone)) throw new Error(`nada tidak dikenal (${id}): ${tone}`);
  if (!Number.isInteger(minPlayers) || minPlayers < 1) throw new Error(`minPlayers tidak valid: ${id}`);
  if (!Number.isInteger(maxPlayers) || maxPlayers < minPlayers) throw new Error(`maxPlayers tidak valid: ${id}`);
  return Object.freeze({
    id,
    label: label.trim(),
    category,
    tone,
    minPlayers,
    maxPlayers,
    /** ikut serta murni sukarela (mis. tantangan hafalan) */
    voluntary: def.voluntary === true,
    /** butuh simulasi fisika sungguhan (bola, panah, dll.), bukan sekadar animasi */
    physics: def.physics === true,
    /** `siap` hanya setelah logika + dunianya benar-benar ada; selain itu masih rencana */
    status: def.status === 'siap' ? 'siap' : 'rencana',
  });
}

export const SESSION_STATES = Object.freeze({ waiting: 'waiting', running: 'running', paused: 'paused', ended: 'ended' });

/** Peringkat kompetisi: skor sama = peringkat sama; urutan masuk jadi pemecah seri tampilan. */
export function rankScores(entries) {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  let rank = 0;
  return sorted.map((entry, i) => {
    if (i === 0 || entry.score !== sorted[i - 1].score) rank = i + 1;
    return { playerId: entry.playerId, score: entry.score, rank };
  });
}

export function createSession(def, { id = def.id } = {}) {
  const players = new Map(); // playerId -> skor
  let state = SESSION_STATES.waiting;
  let ranking = null;

  const finish = () => {
    state = SESSION_STATES.ended;
    ranking = rankScores([...players].map(([playerId, score]) => ({ playerId, score })));
    return ranking;
  };

  return {
    id,
    activity: def.id,
    get state() { return state; },
    get playerIds() { return [...players.keys()]; },
    get ranking() { return ranking; },
    score: (playerId) => players.get(playerId),

    join(playerId) {
      if (typeof playerId !== 'string' || !playerId) return { ok: false, reason: 'pemain-tidak-valid' };
      if (state === SESSION_STATES.ended) return { ok: false, reason: 'selesai' };
      if (players.has(playerId)) return { ok: true, reason: 'sudah-ikut' };
      if (players.size >= def.maxPlayers) return { ok: false, reason: 'penuh' };
      players.set(playerId, 0);
      return { ok: true };
    },

    leave(playerId) {
      if (!players.delete(playerId)) return { ok: false, reason: 'bukan-peserta' };
      // Sesi yang kekurangan pemain tidak dilanjutkan.
      if (state !== SESSION_STATES.ended && state !== SESSION_STATES.waiting && players.size < def.minPlayers) finish();
      return { ok: true };
    },

    start() {
      if (state !== SESSION_STATES.waiting) return { ok: false, reason: 'sudah-dimulai' };
      if (players.size < def.minPlayers) return { ok: false, reason: 'kurang-pemain' };
      state = SESSION_STATES.running;
      return { ok: true };
    },

    addScore(playerId, points) {
      if (state !== SESSION_STATES.running) return { ok: false, reason: 'tidak-berjalan' };
      if (!players.has(playerId)) return { ok: false, reason: 'bukan-peserta' };
      if (!Number.isFinite(points) || points < 0) return { ok: false, reason: 'skor-tidak-valid' };
      players.set(playerId, players.get(playerId) + points);
      return { ok: true };
    },

    pause() {
      if (state !== SESSION_STATES.running) return { ok: false, reason: 'tidak-berjalan' };
      state = SESSION_STATES.paused;
      return { ok: true };
    },

    resume() {
      if (state !== SESSION_STATES.paused) return { ok: false, reason: 'tidak-dijeda' };
      state = SESSION_STATES.running;
      return { ok: true };
    },

    end() {
      if (state === SESSION_STATES.ended) return ranking;
      return finish();
    },
  };
}
