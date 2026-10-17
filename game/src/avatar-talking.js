// Avatar manusia yang bisa bicara: TalkingHead (mode avatarOnly) + HeadAudio (mulut mengikuti suara asli).
// Pustaka disematkan oleh workflow "Siapkan aset avatar" ke src/vendor dan public/headaudio.
// Suara dari mikrofon atau suara tamu lain (LiveKit) cukup diberikan lewat listen(stream).
import { DEFAULT_TALKING_AVATAR, VOICE_PARAMS, getTalkingAvatar } from './avatar-talking-config.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

// Satu AudioContext dipakai bersama supaya banyak avatar tidak menghabiskan jatah konteks audio browser.
let sharedCtx = null;
const workletReady = new WeakMap();

function getAudioContext() {
  sharedCtx ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
  return sharedCtx;
}

function ensureWorklet(ctx) {
  if (!workletReady.has(ctx)) {
    const p = ctx.audioWorklet.addModule(`${BASE}headaudio/headworklet.min.mjs`).catch((e) => {
      workletReady.delete(ctx);
      throw e;
    });
    workletReady.set(ctx, p);
  }
  return workletReady.get(ctx);
}

/**
 * Membuat satu avatar manusia bicara dan menaruhnya di scene three.js yang sudah ada.
 * Panggil update(dtMs) tiap frame (milidetik, bukan detik).
 */
export async function createTalkingAvatar({ scene, camera, avatarId = DEFAULT_TALKING_AVATAR, onProgress = null } = {}) {
  const entry = getTalkingAvatar(avatarId);
  if (!entry) throw new Error(`avatar bicara tidak dikenal: ${avatarId}`);
  if (!scene || !camera) throw new Error('scene dan camera wajib diisi');

  const { TalkingHead } = await import('./vendor/talkinghead/talkinghead.mjs');
  const ctx = getAudioContext();
  const head = new TalkingHead(document.createElement('div'), {
    avatarOnly: true,
    avatarOnlyCamera: camera,
    avatarOnlyScene: scene,
    audioCtx: ctx,
    lipsyncModules: ['en'],
    lipsyncLang: 'en',
    modelFPS: 30,
  });
  await head.showAvatar({
    url: `${BASE}${entry.file}`,
    body: entry.body,
    avatarMood: entry.mood,
    lipsyncLang: 'en',
    modelDynamicBones: entry.dynamicBones,
  }, onProgress);

  // HeadAudio dibuat malas: hanya avatar yang benar-benar mendengarkan suara yang membayar biayanya.
  let voicePromise = null;
  const initVoice = async () => {
    const [mod] = await Promise.all([import('./vendor/headaudio/headaudio.min.mjs'), ensureWorklet(ctx)]);
    const HeadAudio = mod.HeadAudio ?? mod.default;
    const node = new HeadAudio(ctx, { processorOptions: {}, parameterData: { ...VOICE_PARAMS } });
    await node.loadModel(`${BASE}headaudio/model-en-mixed.bin`);
    node.onvalue = (key, value) => {
      const target = head.mtAvatar?.[key];
      if (target) Object.assign(target, { newvalue: value, needsUpdate: true });
    };
    return { node, sources: new Set() };
  };

  /** Mulut avatar mengikuti suara dari MediaStream (mikrofon atau trek suara tamu). Mengembalikan fungsi berhenti. */
  async function listen(stream) {
    voicePromise ??= initVoice();
    const voice = await voicePromise;
    if (ctx.state === 'suspended') await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    src.connect(voice.node); // HeadAudio tidak punya keluaran, jadi tidak ada gema.
    voice.sources.add(src);
    return () => {
      src.disconnect();
      voice.sources.delete(src);
    };
  }

  return {
    entry,
    head,
    armature: head.armature,
    listen,
    // HeadAudio di-update di sini (bukan lewat head.opt.update) karena mode avatarOnly memakai loop render milik game.
    update(dtMs) {
      voicePromise?.then((v) => v.node.update(dtMs)).catch(() => {});
      head.animate(dtMs);
    },
    setMood: (mood) => head.setMood(mood),
    gesture: (name, seconds = 3) => head.playGesture(name, seconds),
    lookAtCamera: (ms = 1500) => head.lookAtCamera(ms),
    dispose() {
      voicePromise?.then((v) => {
        for (const s of v.sources) s.disconnect();
        v.node.disconnect();
      }).catch(() => {});
      head.armature?.parent?.remove(head.armature);
      head.stop?.();
    },
  };
}
