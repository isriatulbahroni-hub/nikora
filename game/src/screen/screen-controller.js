import { SCREEN, applyMessage, emptyScreen, positionAt, prune } from './screen-state.js';
import { embedUrl, parseMediaLink } from './media-resolve.js';

const YT_ORIGIN = 'https://www.youtube-nocookie.com';
const MAX_FILE = 2 * 1024 ** 3;

/**
 * Pengendali Layar Tancap. Memegang state bersama (operator, sumber, posisi), mengirim lewat net.sendScreen,
 * dan memutar: YouTube/TikTok di panel embed resmi; video dari HP dan siaran kamera langsung di layar 3D lewat LiveKit.
 */
export function createScreenController({ net, mesh, doc = document, now = () => Date.now(), fetchImpl, nameOf = (id) => id, onChange = () => {}, storage }) {
  let state = emptyScreen();
  let lastSync = 0;
  let status = '';
  let local = null; // { video, stream, stop, url, kind } milik operator (file/live)
  let ytTime = null;
  let ytReady = false;
  let embedKey = '';
  const media = new Map(); // track -> elemen yang sudah di-attach
  const selfId = () => net.id;
  const present = () => new Set(net.players.map((p) => p.id));
  const isOp = () => state.op === selfId();
  const saved = Number(storage?.getItem?.('orbit-screen-vol'));
  let volume = Number.isFinite(saved) && storage?.getItem?.('orbit-screen-vol') !== null ? Math.min(1, Math.max(0, saved)) : 0.8;
  let muted = false;

  // ---------- panel embed (YouTube/TikTok) ----------
  const embed = doc.createElement('div');
  embed.className = 'screen-embed';
  embed.hidden = true;
  const frame = doc.createElement('iframe');
  frame.className = 'screen-embed-frame';
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.title = 'Video layar acara';
  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'screen-embed-close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Sembunyikan video');
  closeBtn.addEventListener('click', () => { embed.hidden = true; });
  embed.append(frame, closeBtn);
  doc.body.append(embed);

  const ytCmd = (func, args = []) => frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), YT_ORIGIN);
  const onMessage = (event) => {
    if (event.origin !== YT_ORIGIN || event.source !== frame.contentWindow) return;
    let data;
    try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
    if (data?.event === 'onReady' || data?.event === 'initialDelivery') ytReady = true;
    const t = data?.info?.currentTime;
    if (Number.isFinite(t)) ytTime = t;
  };
  doc.defaultView?.addEventListener('message', onMessage);
  frame.addEventListener('load', () => {
    if (state.src?.type !== 'youtube') return;
    frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YT_ORIGIN);
    ytReady = true;
    applyVolume();
    followYouTube(true);
  });

  const set = (next) => {
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    render();
    onChange(state);
  };
  const act = (msg) => {
    set(applyMessage(state, selfId(), msg, present(), now()));
    net.sendScreen?.(msg);
  };

  // ---------- memutar sesuai state ----------
  function applyVolume() {
    const v = muted ? 0 : volume;
    if (state.src?.type === 'youtube' && ytReady) {
      ytCmd(v === 0 ? 'mute' : 'unMute');
      ytCmd('setVolume', [Math.round(v * 100)]);
    }
    for (const el of media.values()) if (el.tagName === 'AUDIO') el.volume = v;
  }

  function followYouTube(force = false) {
    if (state.src?.type !== 'youtube' || !ytReady) return;
    const target = positionAt(state, now());
    if (state.st === 'playing') {
      if (force || ytTime === null || Math.abs(ytTime - target) > SCREEN.driftSec) ytCmd('seekTo', [target, true]);
      ytCmd('playVideo');
    } else if (state.st === 'paused') {
      ytCmd('seekTo', [state.pos, true]);
      ytCmd('pauseVideo');
    }
  }

  function showEmbed() {
    const url = embedUrl(state.src);
    const key = state.src ? `${state.src.type}:${state.src.id}:${state.src.start ?? 0}` : '';
    if (!url) { embed.hidden = true; frame.src = 'about:blank'; embedKey = ''; return; }
    if (key !== embedKey) {
      embedKey = key;
      ytReady = false;
      ytTime = null;
      frame.src = url;
    }
    embed.hidden = false;
  }

  function trackEl(track, tag) {
    let el = media.get(track);
    if (!el) {
      el = track.attach();
      if (tag === 'VIDEO') { el.muted = true; el.playsInline = true; el.autoplay = true; }
      if (tag === 'AUDIO') { el.style.display = 'none'; doc.body.append(el); }
      media.set(track, el);
    }
    return el;
  }

  function releaseMedia(keep = new Set()) {
    for (const [track, el] of media) {
      if (keep.has(track)) continue;
      try { track.detach(el); } catch { /* sudah lepas */ }
      el.remove();
      media.delete(track);
    }
  }

  function render() {
    const src = state.src;
    if (!src || state.st === 'idle') {
      showEmbedOff();
      releaseMedia();
      mesh.showIdle(state.op ? { title: 'LAYAR ACARA', sub: `${nameOf(state.op)} sedang menyiapkan` } : { title: 'LAYAR ACARA', sub: 'Belum ada yang memutar' });
      return;
    }
    if (src.type === 'youtube' || src.type === 'tiktok') {
      releaseMedia();
      showEmbed();
      mesh.showIdle({ title: src.type === 'youtube' ? 'YouTube' : 'TikTok', sub: 'Sedang diputar di panel video' });
      if (src.type === 'youtube') followYouTube();
      return;
    }
    showEmbedOff();
    if (isOp() && local?.video) {
      mesh.showVideo(local.video);
      releaseMedia();
      return;
    }
    const tracks = net.screenTracks?.get(state.op) ?? {};
    const keep = new Set([tracks.video, tracks.audio].filter(Boolean));
    releaseMedia(keep);
    if (tracks.video) mesh.showVideo(trackEl(tracks.video, 'VIDEO'));
    else mesh.showIdle({ title: src.type === 'live' ? 'SIARAN LANGSUNG' : (src.name || 'Video'), sub: 'Menyambung…' });
    if (tracks.audio) trackEl(tracks.audio, 'AUDIO');
    applyVolume();
  }
  function showEmbedOff() {
    if (embedKey) { embed.hidden = true; frame.src = 'about:blank'; embedKey = ''; }
  }

  net.on('screen', ({ from, msg }) => set(applyMessage(state, from, msg, present(), now())));
  net.on('left', () => set(prune(state, present())));
  net.on('screen-track', () => render());

  // ---------- operator ----------
  async function stopLocal() {
    if (!local) return;
    try { await local.stop?.(); } catch { /* sudah berhenti */ }
    local.stream?.getTracks().forEach((t) => t.stop());
    local.video?.pause?.();
    if (local.url) URL.revokeObjectURL(local.url);
    local = null;
    mesh.clearVideo();
  }

  const guard = (fn) => async (...a) => {
    status = '';
    try { await fn(...a); } catch (e) { status = e?.userMessage ?? 'Gagal. Coba lagi.'; if (!e?.userMessage) console.warn('[screen]', e); }
    onChange(state);
  };
  const userError = (m) => Object.assign(new Error(m), { userMessage: m });

  const api = {
    get state() { return state; },
    get status() { return status; },
    get isOperator() { return isOp(); },
    get volume() { return muted ? 0 : volume; },
    get muted() { return muted; },
    get localKind() { return local?.kind ?? null; },
    get embedHidden() { return embed.hidden; },
    showEmbedAgain() { if (embedKey) embed.hidden = false; },
    claim: () => act({ k: 'claim' }),
    async release() { await stopLocal(); act({ k: 'release' }); },

    /** Link YouTube/TikTok. */
    loadLink: guard(async (text) => {
      if (!isOp()) throw userError('Hanya operator layar yang bisa memutar video.');
      let src = parseMediaLink(text);
      if (!src) throw userError('Link belum dikenali. Gunakan link YouTube atau TikTok.');
      if (src.type === 'tiktok-short') {
        const res = await (fetchImpl ?? ((...a) => globalThis.fetch(...a)))(`/api/video-meta?url=${encodeURIComponent(src.url)}`);
        if (!res.ok) throw userError('Link TikTok pendek tidak bisa dibuka. Tempel link panjangnya.');
        src = await res.json();
      }
      await stopLocal();
      act({ k: 'load', src });
    }),

    /** Video dari HP/komputer operator: diputar lokal lalu disiarkan sebagai track LiveKit ke semua orang. */
    pickFile: guard(async (file) => {
      if (!isOp()) throw userError('Hanya operator layar yang bisa memutar video.');
      if (!file || !String(file.type).startsWith('video/')) throw userError('Pilih file video.');
      if (file.size > MAX_FILE) throw userError('File terlalu besar (maksimal 2 GB).');
      await stopLocal();
      const url = URL.createObjectURL(file);
      const video = doc.createElement('video');
      video.src = url;
      video.playsInline = true;
      video.controls = false;
      await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = () => rej(userError('Video tidak bisa dibuka.')); });
      const stream = video.captureStream?.() ?? video.mozCaptureStream?.();
      if (!stream) { URL.revokeObjectURL(url); throw userError('Browser ini belum bisa menyiarkan video dari perangkat (misalnya iPhone). Pakai link YouTube/TikTok, atau Android/komputer.'); }
      await video.play();
      const stop = await net.publishStream(stream);
      video.onended = () => api.stop();
      local = { video, stream: null, stop, url, kind: 'file' };
      act({ k: 'load', src: { type: 'file', name: file.name || 'Video' } });
    }),

    /** Siaran langsung dari kamera + mikrofon perangkat operator. */
    goLive: guard(async (facing = 'user') => {
      if (!isOp()) throw userError('Hanya operator layar yang bisa menyiarkan.');
      if (!navigator.mediaDevices?.getUserMedia) throw userError('Kamera tidak tersedia di browser ini.');
      await stopLocal();
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        throw userError('Izin kamera/mikrofon ditolak. Izinkan di pengaturan browser.');
      }
      const video = doc.createElement('video');
      video.srcObject = stream;
      video.muted = true; // pratinjau lokal tanpa gema
      video.playsInline = true;
      await video.play();
      const stop = await net.publishStream(stream);
      local = { video, stream, stop, url: null, kind: 'live', facing };
      act({ k: 'load', src: { type: 'live' } });
    }),
    flipCamera() { return api.goLive(local?.facing === 'environment' ? 'user' : 'environment'); },

    pause() {
      if (!isOp() || state.st !== 'playing') return;
      if (local?.video && local.kind === 'file') local.video.pause();
      act({ k: 'pause', pos: local?.video ? local.video.currentTime : positionAt(state, now()) });
    },
    resume() {
      if (!isOp() || state.st !== 'paused') return;
      if (local?.video && local.kind === 'file') local.video.play();
      act({ k: 'play', pos: local?.video ? local.video.currentTime : state.pos });
    },
    async stop() { await stopLocal(); if (isOp()) act({ k: 'stop' }); },

    setVolume(v) { volume = Math.min(1, Math.max(0, Number(v) || 0)); muted = false; storage?.setItem?.('orbit-screen-vol', String(volume)); applyVolume(); onChange(state); },
    toggleMute() { muted = !muted; applyVolume(); onChange(state); },

    /** Panggil ~2x per detik. */
    tick() {
      set(prune(state, present()));
      const t = now();
      if (isOp() && t - lastSync >= SCREEN.syncMs) {
        lastSync = t;
        const pos = local?.video && local.kind === 'file' ? local.video.currentTime : positionAt(state, t);
        net.sendScreen?.({ k: 'sync', src: state.src, st: state.st, pos });
      }
      if (!isOp()) followYouTube();
    },
    dispose() {
      doc.defaultView?.removeEventListener('message', onMessage);
      releaseMedia();
      embed.remove();
      stopLocal();
    },
  };
  return api;
}
