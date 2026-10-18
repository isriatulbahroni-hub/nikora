// Klip animasi tambahan untuk avatar manusia (Mixamo), dimuat SESUAI KEBUTUHAN: tiap klip satu berkas JSON di
// public/anims/extra/<id>.json (dibuat oleh tools/build-extra-anims.mjs). Berkas yang belum ada tidak merusak apa pun:
// avatar tetap memakai animasi lama sampai klipnya berhasil dimuat.
const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

/** id klip -> berputar terus (true) atau diputar sekali lalu menahan pose akhir (false). */
export const EXTRA_CLIPS = Object.freeze({
  // sosial dan emosi
  wave: true, wave2: false, greet: false, clap: true, laugh: true, cry: true, sad: true, sad2: true, cheer: true, cheer2: true,
  // bicara dan hormat
  talk1: true, talk2: true, talk3: true, pray: false, pray2: false,
  // joget
  macarena: true, hiphop1: true, hiphop2: true, hiphop3: true, hiphop4: true, hiphop5: true, hiphop6: true, hiphop7: true, hiphop8: true, hiphop9: true, hiphop10: true,
  // duduk dan transisi
  sit_idle: true, sit_clap: true, sit_clap2: true, sit_laugh: true, sit_cheer1: true, sit_cheer2: true, sit_cheer3: true, sit_cheer4: true,
  sit_down: false, stand_up: false, standup_clap: false, standup_clap2: false, standup_cheer: false,
  // gerak
  walk_back: true, strafe_l: true, strafe_r: true, turn_l: false, turn_r: false, jump: false,
});

const cache = new Map();

/** Muat klip netral `id`. Null bila id tak dikenal atau berkas belum ada; tidak melempar dan tidak mengulang fetch. */
export function loadExtraNeutral(id) {
  if (!Object.hasOwn(EXTRA_CLIPS, id)) return Promise.resolve(null);
  if (!cache.has(id)) {
    cache.set(id, fetch(`${BASE}anims/extra/${id}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return cache.get(id);
}

/** `spec` boleh satu id atau daftar id (dipilih acak). */
export function pickClip(spec, rnd = Math.random) {
  if (Array.isArray(spec)) return spec.length ? spec[Math.floor(rnd() * spec.length)] : null;
  return spec ?? null;
}
