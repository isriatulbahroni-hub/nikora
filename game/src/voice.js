// Suara proximity memakai LiveKit (SFU WebRTC). Server game hanya mengeluarkan token;
// volume tiap lawan bicara diatur dari jarak di dunia 3D.
export const VOICE = Object.freeze({ fullRange: 2.5, maxRange: 12 });

/** Volume 0..1 menurut jarak (m): penuh sampai fullRange, turun halus (kurva kuadrat) sampai hening di maxRange. */
export function voiceGain(distance, { fullRange, maxRange } = VOICE) {
  if (!Number.isFinite(distance) || distance >= maxRange) return 0;
  if (distance <= fullRange) return 1;
  const t = (maxRange - distance) / (maxRange - fullRange);
  return t * t;
}

export class VoiceChat {
  constructor({ LiveKit } = {}) {
    this.LiveKit = LiveKit;
    this.room = null;
    this.audio = new Map(); // identity -> HTMLAudioElement
    this.micOn = false;
    this.onChange = () => {};
  }

  /** Dipanggil dari gestur pengguna (klik tombol mikrofon) agar browser mengizinkan audio & mikrofon. */
  async connect({ url, token }) {
    const LiveKit = this.LiveKit ?? (await import('livekit-client'));
    const room = new LiveKit.Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    await this.attach(room, LiveKit);
    await room.connect(url, token);
    await room.startAudio();
    return this;
  }

  /** Pasang pendengar audio ke Room yang sudah/akan tersambung (dipakai bersama transport LiveKit). */
  async attach(room, LiveKit = this.LiveKit) {
    LiveKit ??= await import('livekit-client');
    const { RoomEvent, Track } = LiveKit;
    room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      el.volume = 0; // naik hanya bila lawan bicara dekat
      document.body.appendChild(el);
      this.audio.set(participant.identity, el);
    });
    room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
      track.detach().forEach((el) => el.remove());
      this.audio.delete(participant.identity);
    });
    room.on(RoomEvent.ParticipantDisconnected, (p) => {
      this.audio.get(p.identity)?.remove();
      this.audio.delete(p.identity);
    });
    for (const p of room.remoteParticipants?.values?.() ?? []) {
      for (const pub of p.audioTrackPublications?.values?.() ?? []) {
        if (pub.track && !this.audio.has(p.identity)) {
          const el = pub.track.attach();
          el.volume = 0;
          document.body.appendChild(el);
          this.audio.set(p.identity, el);
        }
      }
    }
    this.room = room;
    return this;
  }

  async setMic(on) {
    if (!this.room) return false;
    await this.room.localParticipant.setMicrophoneEnabled(on);
    this.micOn = on;
    this.onChange(on);
    return on;
  }

  /** Panggil tiap beberapa frame: self {x,z}, players [{id,x,z,sit}] dari snapshot server. */
  update(self, players) {
    for (const p of players) {
      const el = this.audio.get(p.id);
      if (!el) continue;
      el.volume = voiceGain(Math.hypot(p.x - self.x, p.z - self.z));
    }
  }

  /** Identitas pemain yang sedang bicara (untuk ikon kecil di atas avatar). */
  speaking() {
    return new Set((this.room?.activeSpeakers ?? []).map((s) => s.identity));
  }

  dispose() {
    this.room?.disconnect();
    for (const el of this.audio.values()) el.remove();
    this.audio.clear();
    this.room = null;
  }
}
