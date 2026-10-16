// Panggilan kembali ke acara utama: saat pengantin/pembawa acara tampil, semua permainan yang
// sedang berjalan dijeda dan tamu diajak berkumpul; setelah selesai, permainan dilanjutkan.
import { SESSION_STATES } from './activity.js';

export const RECALL_REASONS = Object.freeze(['pengantin-tampil', 'pembawa-acara', 'doa', 'foto-bersama']);
export const RECALL_STATES = Object.freeze({ idle: 'idle', calling: 'calling', onstage: 'onstage' });

/** `listSessions()` mengembalikan semua sesi aktif di lokasi (satu sumber kebenaran: server). */
export function createRecall({ listSessions }) {
  let state = RECALL_STATES.idle;
  let summon = null;
  let pausedByRecall = [];
  const arrived = new Set();

  const release = () => {
    // Hanya lanjutkan sesi yang dijeda oleh panggilan ini, bukan yang dijeda alasan lain.
    for (const session of pausedByRecall) session.resume();
    pausedByRecall = [];
    arrived.clear();
    summon = null;
    state = RECALL_STATES.idle;
  };

  return {
    get state() { return state; },
    get summon() { return summon; },
    get arrivedCount() { return arrived.size; },
    /** true selama panggilan berlangsung: permainan baru tidak boleh dimulai */
    get blocksStart() { return state !== RECALL_STATES.idle; },

    call({ reason, gatherZone } = {}) {
      if (!RECALL_REASONS.includes(reason)) return { ok: false, reason: 'alasan-tidak-valid' };
      if (typeof gatherZone !== 'string' || !gatherZone) return { ok: false, reason: 'tempat-kumpul-kosong' };
      if (state !== RECALL_STATES.idle) return { ok: false, reason: 'sedang-berlangsung' };
      pausedByRecall = [];
      for (const session of listSessions()) {
        if (session.state === SESSION_STATES.running && session.pause().ok) pausedByRecall.push(session);
      }
      summon = Object.freeze({ reason, gatherZone });
      state = RECALL_STATES.calling;
      return { ok: true, summon, paused: pausedByRecall.length };
    },

    arrive(playerId) {
      if (state === RECALL_STATES.idle) return { ok: false, reason: 'tidak-ada-panggilan' };
      if (typeof playerId !== 'string' || !playerId) return { ok: false, reason: 'pemain-tidak-valid' };
      arrived.add(playerId);
      return { ok: true, arrived: arrived.size };
    },

    begin() {
      if (state !== RECALL_STATES.calling) return { ok: false, reason: 'tidak-ada-panggilan' };
      state = RECALL_STATES.onstage;
      return { ok: true };
    },

    /** Selesai (atau batal): semua kembali bermain. */
    finish() {
      if (state === RECALL_STATES.idle) return { ok: false, reason: 'tidak-ada-panggilan' };
      const resumed = pausedByRecall.length;
      release();
      return { ok: true, resumed };
    },
  };
}
