// Suara proximity memakai LiveKit (SFU WebRTC). Server game hanya mengeluarkan token;
// volume tiap lawan bicara diatur dari jarak di dunia 3D.
export const VOICE = Object.freeze({ fullRange: 2.5, maxRange: 12 });

/**
 * Aturan untuk acara ramai: hanya tamu yang benar-benar dekat yang terdengar (penuh sampai 1,5 m, hening di 6 m)
 * dan paling banyak 4 pembicara terdekat sekaligus supaya percakapan banyak orang tidak menumpuk.
 * MC dan pembicara panggung dikecualikan: selalu terdengar penuh di mana pun.
 */
export const VOICE_CROWD = Object.freeze({ ranges: Object.freeze({ fullRange: 1.5, maxRange: 6 }), maxListeners: 4 });

/** Volume 0..1 menurut jarak (m): penuh sampai fullRange, turun halus (kurva kuadrat) sampai hening di maxRange. */
export function voiceGain(distance, { fullRange, maxRange } = VOICE) {
  if (!Number.isFinite(distance) || distance >= maxRange) return 0;
  if (distance <= fullRange) return 1;
  const t = (maxRange - distance) / (maxRange - fullRange);
  return t * t;
}

/**
 * Pilih paling banyak `max` pembicara yang terdengar. Aturan:
 *  1. yang sedang (atau baru saja) berbicara didahulukan;
 *  2. sisanya berdasarkan jarak, tetapi yang SUDAH terdengar diberi keunggulan (stickiness) sehingga
 *     pembicara baru harus jauh lebih dekat untuk menggeser, jadi suara tidak putus hanya karena urutan jarak bergeser;
 *  3. batas `max` tetap dijaga agar tidak ramai.
 */
/** Pengali volume obrolan jamaah saat panggung berbicara, dan lama "masih dianggap berbicara" setelah panggung diam. */
export const DUCK_GAIN = 0.3;
export const STAGE_HANGOVER_MS = 1500;

export function selectAudible({ candidates, max, previous = new Set(), lastSpoke = new Map(), now = 0, hangoverMs = 3000, stickiness = 0.75 }) {
  if (!Number.isFinite(max) || candidates.length <= max) return new Set(candidates.map((c) => c.id));
  const ranked = candidates.map((c) => ({
    id: c.id,
    tier: now - (lastSpoke.get(c.id) ?? -Infinity) <= hangoverMs ? 0 : 1,
    eff: c.distance * (previous.has(c.id) ? stickiness : 1),
  }));
  ranked.sort((a, b) => a.tier - b.tier || a.eff - b.eff || (a.id < b.id ? -1 : 1));
  return new Set(ranked.slice(0, max).map((r) => r.id));
}

/** Volume menuju target secara halus (fade ~0,3 dtk pada pembaruan 10x/dtk) agar suara tidak terpotong mendadak. */
export function stepVolume(current, target, rate = 0.5) {
  if (Math.abs(target - current) < 0.02) return target;
  return current + (target - current) * rate;
}

const toast = (doc, text, ms = 3500) => {
  const el = doc.createElement('div');
  el.textContent = text;
  el.style.cssText = 'position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:20;max-width:86vw;padding:9px 16px;border-radius:999px;background:rgba(14,18,24,.82);color:#fff;font:600 13px system-ui,sans-serif;text-align:center;pointer-events:none';
  doc.body.append(el);
  setTimeout(() => el.remove(), ms);
};

export class VoiceChat {
  constructor({ LiveKit, doc = typeof document === 'undefined' ? null : document } = {}) {
    this.LiveKit = LiveKit;
    this.doc = doc;
    this.room = null;
    this.audio = new Map(); // identity -> HTMLAudioElement
    this.micOn = false;
    this.wantMic = false; // pengguna ingin mic menyala (dipakai untuk memulihkan setelah putus)
    this.blocked = false; // browser menahan pemutaran audio sampai ada sentuhan
    this.audible = new Set();
    this.lastSpoke = new Map();
    this.vol = new Map(); // volume terakhir yang kita set per lawan bicara (untuk fade)
    this.hint = null;
    this.onChange = () => {};
    this.onNotice = (text) => this.doc && toast(this.doc, text);
    this._micRetry = 0;
    this.stageQuality = false; // true: mic memakai kualitas tinggi (ustaz/MC/penanya yang dinaikkan ke panggung)
    this._lk = LiveKit ?? null;
  }

  /** Dipanggil dari gestur pengguna (klik tombol mikrofon) agar browser mengizinkan audio & mikrofon. */
  async connect({ url, token }) {
    const LiveKit = this.LiveKit ?? (await import('livekit-client'));
    const room = new LiveKit.Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    await this.attach(room, LiveKit);
    await room.connect(url, token);
    await room.startAudio().catch(() => this.#setBlocked(true));
    return this;
  }

  #addAudio(identity, track) {
    this.#dropAudio(identity); // track baru menggantikan yang lama (mis. perangkat mic diganti) tanpa elemen yatim
    const el = track.attach();
    el.volume = 0; // naik hanya bila lawan bicara dekat
    this.vol.set(identity, 0);
    el.autoplay = true;
    el.playsInline = true;
    this.doc?.body.appendChild(el);
    this.audio.set(identity, el);
    el.play?.()?.catch?.(() => this.#setBlocked(true)); // ponsel menolak putar otomatis sebelum ada sentuhan
  }

  #dropAudio(identity) {
    const el = this.audio.get(identity);
    if (el) el.remove();
    this.audio.delete(identity);
    this.vol.delete(identity);
  }

  #setBlocked(blocked) {
    if (this.blocked === blocked || !this.doc) return;
    this.blocked = blocked;
    if (blocked && !this.hint) {
      const hint = this.doc.createElement('button');
      hint.type = 'button';
      hint.textContent = '🔇 Ketuk untuk menyalakan suara';
      hint.style.cssText = 'position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:20;padding:10px 18px;border:0;border-radius:999px;background:#e9b44c;color:#2a1d14;font:700 14px system-ui,sans-serif';
      hint.addEventListener('click', () => this.resumePlayback());
      this.doc.body.append(hint);
      this.hint = hint;
    } else if (!blocked && this.hint) {
      this.hint.remove();
      this.hint = null;
    }
  }

  /** Coba nyalakan lagi semua audio (setelah sentuhan pengguna, kembali dari tab lain, atau sambungan pulih). */
  async resumePlayback() {
    let stillBlocked = false;
    try { await this.room?.startAudio(); } catch { stillBlocked = true; }
    for (const el of this.audio.values()) {
      if (el.paused) { try { await el.play(); } catch { stillBlocked = true; } }
    }
    if (this.room && this.room.canPlaybackAudio === false) stillBlocked = true;
    this.#setBlocked(stillBlocked);
    return !stillBlocked;
  }

  /** Pasang pendengar audio ke Room yang sudah/akan tersambung (dipakai bersama transport LiveKit). */
  async attach(room, LiveKit = this.LiveKit) {
    LiveKit ??= await import('livekit-client');
    this._lk = LiveKit;
    const { RoomEvent, Track } = LiveKit;
    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      if (track.kind !== Track.Kind.Audio) return;
      if ((pub?.source ?? track.source) === Track.Source.ScreenShareAudio) return; // suara layar diatur Layar Tancap, bukan jarak
      this.#addAudio(participant.identity, track);
    });
    room.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
      if ((pub?.source ?? track.source) === Track.Source.ScreenShareAudio) return;
      track.detach().forEach((el) => el.remove());
      if (track.kind === Track.Kind.Audio) this.audio.delete(participant.identity);
    });
    room.on(RoomEvent.ParticipantDisconnected, (p) => this.#dropAudio(p.identity));
    // Pemutaran ditahan/dilepas browser ponsel.
    if (RoomEvent.AudioPlaybackStatusChanged) room.on(RoomEvent.AudioPlaybackStatusChanged, () => this.#setBlocked(room.canPlaybackAudio === false));
    // Sambungan: kembalikan mic setelah putus lalu tersambung ulang.
    for (const name of [RoomEvent.Reconnected, RoomEvent.Connected]) {
      if (name) room.on(name, () => { this.resumePlayback(); if (this.wantMic) this.#recoverMic(); });
    }
    if (RoomEvent.MediaDevicesError) room.on(RoomEvent.MediaDevicesError, () => this.onNotice('Mikrofon bermasalah. Periksa izin atau perangkat Anda.'));
    if (RoomEvent.LocalTrackUnpublished) {
      room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub?.source === Track.Source.Microphone && this.wantMic && this.micOn) this.#recoverMic();
      });
    }
    // Kembali dari tab/aplikasi lain: ponsel sering menghentikan audio saat di latar.
    const onVisible = () => { if (this.doc?.visibilityState !== 'hidden') this.resumePlayback(); };
    this.doc?.addEventListener('visibilitychange', onVisible);
    this._onVisible = onVisible;
    // Sentuhan pertama membuka kunci audio di ponsel.
    const unlock = () => { if (this.blocked) this.resumePlayback(); };
    this.doc?.addEventListener('pointerdown', unlock);
    this.doc?.addEventListener('touchend', unlock);
    this._unlock = unlock;
    for (const p of room.remoteParticipants?.values?.() ?? []) {
      for (const pub of p.audioTrackPublications?.values?.() ?? []) {
        if (pub.track && pub.source !== Track.Source.ScreenShareAudio && !this.audio.has(p.identity)) this.#addAudio(p.identity, pub.track);
      }
    }
    this.room = room;
    return this;
  }

  /** Panggung: bitrate lebih tinggi, tanpa DTX (awal kata tidak terpotong), dengan data cadangan (RED) untuk sinyal lemah. */
  #micPublishOptions() {
    const preset = this._lk?.AudioPresets?.musicHighQuality;
    return this.stageQuality && preset ? { audioPreset: preset, dtx: false, red: true } : undefined;
  }

  /** Dipanggil saat peran panggung berubah; bila mic sedang menyala, diterbitkan ulang dengan kualitas yang sesuai. */
  async setStageQuality(on) {
    if (this.stageQuality === on) return;
    this.stageQuality = on;
    if (!this.micOn || !this.room) return;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(false);
      await this.room.localParticipant.setMicrophoneEnabled(true, undefined, this.#micPublishOptions());
    } catch { await this.#recoverMic(); }
  }

  async setMic(on) {
    if (!this.room) return false;
    this.wantMic = on;
    this._micRetry = 0;
    await this.room.localParticipant.setMicrophoneEnabled(on, undefined, on ? this.#micPublishOptions() : undefined);
    this.micOn = on;
    if (on) this.#watchMic();
    this.onChange(on);
    return on;
  }

  /** Pantau track mic: bila berhenti sendiri (dicabut/diambil aplikasi lain), pulihkan. */
  #watchMic() {
    const pub = this.room?.localParticipant.getTrackPublication?.('microphone');
    const ms = pub?.track?.mediaStreamTrack;
    if (!ms || ms.__orbitWatched) return;
    ms.__orbitWatched = true;
    ms.addEventListener?.('ended', () => { if (this.wantMic) this.#recoverMic(); });
  }

  async #recoverMic() {
    if (!this.room) return;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        await this.room.localParticipant.setMicrophoneEnabled(true, undefined, this.#micPublishOptions());
        this.micOn = true;
        this.#watchMic();
        this.onChange(true);
        if (attempt > 1) this.onNotice('Mikrofon tersambung kembali.');
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 700 * attempt));
      }
    }
    this.wantMic = false;
    this.micOn = false;
    this.onChange(false);
    this.onNotice('Mikrofon terputus. Tekan 🎙 untuk menyalakan lagi.');
  }

  /** Panggil tiap beberapa frame: self {x,z}, players [{id,x,z,sit}]. Volume berubah halus; empat pembicara paling relevan terdengar. */
  update(self, players, stage = new Set(), { ranges = VOICE, maxListeners = Infinity, canHear = () => true, duck = DUCK_GAIN, selfId } = {}, nowMs = Date.now()) {
    if (selfId !== undefined) this.setStageQuality(stage.has(selfId));
    for (const id of this.speaking()) this.lastSpoke.set(id, nowMs);
    const targets = new Map();
    const candidates = [];
    for (const p of players) {
      if (!this.audio.has(p.id)) continue;
      // Pembicara di panggung terdengar penuh di mana pun; yang lain berdasarkan jarak.
      if (stage.has(p.id)) { targets.set(p.id, 1); continue; }
      const distance = Math.hypot(p.x - self.x, p.z - self.z, ((p.y ?? 0) - (self.y ?? 0)) * 2.5); // beda lantai = jauh
      const gain = canHear(p) ? voiceGain(distance, ranges) : 0;
      if (gain > 0) candidates.push({ id: p.id, gain, distance });
      else targets.set(p.id, 0);
    }
    const audible = selectAudible({ candidates, max: maxListeners, previous: this.audible, lastSpoke: this.lastSpoke, now: nowMs });
    // Saat pembicara panggung (ustaz/MC) berbicara, obrolan jamaah mengecil (tidak dimatikan) supaya panggung tetap jelas
    // sambil jamaah masih bisa berbincang pelan dengan yang di sebelahnya. Pulih setelah panggung diam sebentar.
    const stageTalking = [...stage].some((id) => id !== (selfId ?? self.id) && nowMs - (this.lastSpoke.get(id) ?? -Infinity) <= STAGE_HANGOVER_MS);
    const chatterGain = stageTalking ? duck : 1;
    for (const c of candidates) targets.set(c.id, audible.has(c.id) ? c.gain * chatterGain : 0);
    this.audible = audible;
    for (const [id, target] of targets) {
      const el = this.audio.get(id);
      if (!el) continue;
      const cur = this.vol.get(id);
      const next = stage.has(id) || cur === undefined ? target : Math.min(1, Math.max(0, stepVolume(cur, target)));
      this.vol.set(id, next);
      el.volume = next;
    }
  }

  /** Identitas pemain yang sedang bicara (untuk ikon kecil di atas avatar). */
  speaking() {
    return new Set((this.room?.activeSpeakers ?? []).map((s) => s.identity));
  }

  dispose() {
    this.doc?.removeEventListener('visibilitychange', this._onVisible);
    this.doc?.removeEventListener('pointerdown', this._unlock);
    this.doc?.removeEventListener('touchend', this._unlock);
    this.hint?.remove();
    this.hint = null;
    this.room?.disconnect();
    for (const el of this.audio.values()) el.remove();
    this.audio.clear();
    this.room = null;
  }
}
