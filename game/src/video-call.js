// Panggilan video proximity di atas Room LiveKit yang sama dengan posisi, chat, dan suara (tanpa server baru).
//
// Aturan:
//  - Kamera MATI secara bawaan; tamu menyalakannya sendiri lewat tombol 📷.
//  - Yang terlihat: tamu yang kameranya menyala dan berada dalam jangkauan (sama dengan jarak suara), paling banyak
//    `maxTiles` sekaligus (lebih sedikit di HP lemah). Yang tidak terpilih TIDAK diunduh (setSubscribed(false)),
//    jadi di acara ramai bandwidth tetap terkendali. Siapa yang terlihat = siapa yang terdengar.
//  - Tombol 👁/🙈 menyembunyikan SEMUA kotak video (termasuk pratinjau kamera sendiri) dan berhenti mengunduh video
//    tamu lain. Kamera sendiri tetap menyiarkan bila menyala; matikan lewat tombol 📷.
//  - Video kamera diterbitkan dengan nama khusus (CAM_TRACK_NAME) dan source 'unknown', bukan source 'camera',
//    karena LiveKitNet menganggap video ber-source 'camera' sebagai siaran Layar Tancap. Dengan cara ini
//    panggilan video dan Layar Tancap tidak saling menimpa.
import { VOICE, selectAudible } from './voice.js';

export const VIDEO_CALL = Object.freeze({ range: VOICE.maxRange, maxTiles: 6, maxTilesLow: 3, tickMs: 250 });
export const CAM_TRACK_NAME = 'nikora-cam';
const CAM_CAPTURE = Object.freeze({ width: 640, height: 480, frameRate: 24 });
const CAM_ENCODING = Object.freeze({ maxBitrate: 600_000, maxFramerate: 24 });

/** Publikasi video kamera-panggilan milik satu peserta (atau null bila tidak ada). */
export function camPublication(participant) {
  for (const pub of participant?.trackPublications?.values?.() ?? []) {
    if (pub.trackName === CAM_TRACK_NAME && (pub.kind === undefined || pub.kind === 'video')) return pub;
  }
  return null;
}

/**
 * Pilih paling banyak `max` tamu yang videonya ditampilkan. peers: [{id,x,z,y}] (hanya yang kameranya menyala).
 * Hanya yang dalam `range` meter yang masuk; beda lantai dihitung jauh (sama seperti suara). Yang baru bicara
 * didahulukan, yang sudah tampil diberi keunggulan supaya kotak video tidak gonta-ganti.
 */
export function pickVideoPeers({ peers, self, max = VIDEO_CALL.maxTiles, range = VIDEO_CALL.range, previous = new Set(), lastSpoke = new Map(), now = 0 }) {
  const candidates = [];
  for (const p of peers) {
    const distance = Math.hypot(p.x - self.x, p.z - self.z, ((p.y ?? 0) - (self.y ?? 0)) * 2.5);
    if (distance < range) candidates.push({ id: p.id, distance });
  }
  return selectAudible({ candidates, max, previous, lastSpoke, now });
}

const toast = (doc, text, ms = 3500) => {
  const el = doc.createElement('div');
  el.textContent = text;
  el.style.cssText = 'position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:20;max-width:86vw;padding:9px 16px;border-radius:999px;background:rgba(14,18,24,.82);color:#fff;font:600 13px system-ui,sans-serif;text-align:center;pointer-events:none';
  doc.body.append(el);
  setTimeout(() => el.remove(), ms);
};

// Posisi baris video bisa digeser per halaman lewat variabel CSS --vc-top (mis. di vila agar tidak menimpa label tempat).
const CSS = `
.vc-strip{position:fixed;left:8px;top:var(--vc-top,calc(64px + env(safe-area-inset-top)));z-index:15;display:flex;align-items:flex-start;gap:6px;max-width:calc(100vw - 16px);overflow-x:auto;pointer-events:none}
.vc-strip[hidden]{display:none}
.vc-ctls{display:flex;flex-direction:column;gap:6px;pointer-events:auto}
.vc-ctl{width:34px;height:34px;border:0;border-radius:999px;background:rgba(14,18,24,.72);color:#fff;font-size:16px;line-height:1;cursor:pointer}
.vc-ctl[hidden]{display:none}
.vc-tile{position:relative;flex:0 0 auto;width:84px;height:112px;border-radius:14px;overflow:hidden;background:#1d2428;border:2px solid transparent;box-shadow:0 2px 10px rgba(0,0,0,.35);pointer-events:auto}
.vc-tile video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none}
.vc-tile.has-video video{display:block}
.vc-tile.is-self video{transform:scaleX(-1)}
.vc-tile.is-speaking{border-color:#e9b44c}
.vc-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cfd8d4;font:700 28px system-ui,sans-serif}
.vc-tile.has-video .vc-ph{display:none}
.vc-name{position:absolute;left:0;right:0;bottom:0;padding:12px 6px 3px;font:600 11px system-ui,sans-serif;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.7));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vc-toggle{position:fixed;right:10px;top:calc(64px + env(safe-area-inset-top));z-index:15;width:42px;height:42px;border:0;border-radius:999px;background:rgba(14,18,24,.72);color:#fff;font-size:20px;cursor:pointer}
.vc-toggle.is-on,.vc-on-tile.is-on{box-shadow:0 0 0 2px #e25555 inset}
`;

export class VideoCall {
  constructor({ LiveKit, doc = typeof document === 'undefined' ? null : document, nav = typeof navigator === 'undefined' ? null : navigator, maxTiles } = {}) {
    this.LiveKit = LiveKit;
    this._lk = LiveKit ?? null;
    this.doc = doc;
    this.nav = nav;
    const weak = Boolean(nav && ((nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) || (nav.deviceMemory && nav.deviceMemory <= 2)));
    this.maxTiles = maxTiles ?? (weak ? VIDEO_CALL.maxTilesLow : VIDEO_CALL.maxTiles);
    this.room = null;
    this.track = null; // LocalVideoTrack kamera kita
    this.camOn = false;
    this.wantCam = false; // pengguna ingin kamera menyala (dipakai untuk memulihkan setelah putus)
    this.facing = 'user';
    this.viewing = true; // false = semua kotak video disembunyikan dan video orang lain tidak diunduh
    this.recovering = false;
    this.selected = new Set();
    this.lastSpoke = new Map();
    this.lastTick = 0;
    this.tiles = new Map(); // identity -> { el, video, ph, label, track }
    this.selfTile = null;
    this.strip = null;
    this.ctls = null;
    this.toggle = null;
    this.flipBtn = null;
    this.viewBtn = null;
    this.onChange = () => {};
    this.onNotice = (text) => this.doc && toast(this.doc, text);
  }

  async attach(room, LiveKit = this.LiveKit) {
    LiveKit ??= await import('livekit-client');
    this._lk = LiveKit;
    this.room = room;
    const RoomEvent = LiveKit.RoomEvent ?? {};
    // Putus total lalu tersambung lagi: LiveKit menghentikan track lokal, jadi terbitkan ulang bila pengguna masih ingin kamera menyala.
    for (const name of [RoomEvent.Reconnected, RoomEvent.Connected]) {
      if (name) room.on(name, () => { if (this.wantCam) this.#recoverCamera(); });
    }
    // Kembali dari tab/aplikasi lain: ponsel sering mematikan kamera saat di latar.
    this._onVisible = () => {
      if (!this.wantCam || this.doc?.visibilityState === 'hidden') return;
      const ms = this.track?.mediaStreamTrack;
      if (!ms || ms.readyState === 'ended') this.#recoverCamera();
    };
    this.doc?.addEventListener('visibilitychange', this._onVisible);
    return this;
  }

  // ---------- kamera kita ----------
  #explain(error) {
    const name = error?.name ?? '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'Izin kamera ditolak. Izinkan kamera di pengaturan browser.';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Kamera tidak ditemukan di perangkat ini.';
    if (name === 'NotReadableError') return 'Kamera sedang dipakai aplikasi lain.';
    return 'Kamera tidak bisa dinyalakan. Coba lagi.';
  }

  async #startCamera() {
    const LiveKit = this._lk;
    const track = await LiveKit.createLocalVideoTrack({ facingMode: this.facing, resolution: { ...CAM_CAPTURE } });
    try {
      await this.room.localParticipant.publishTrack(track, { source: LiveKit.Track.Source.Unknown, name: CAM_TRACK_NAME, simulcast: true, videoEncoding: { ...CAM_ENCODING } });
    } catch (error) {
      track.stop();
      throw error;
    }
    this.track = track;
    this.camOn = true;
    track.mediaStreamTrack?.addEventListener?.('ended', () => {
      if (this.wantCam && this.track === track) this.#recoverCamera();
    });
  }

  async #stopCamera() {
    const track = this.track;
    this.track = null;
    this.camOn = false;
    if (!track) return;
    try { await this.room?.localParticipant.unpublishTrack(track, true); } catch { /* sudah lepas */ }
    try { track.stop(); } catch { /* sudah berhenti */ }
  }

  async #recoverCamera() {
    if (this.recovering || !this.room) return;
    this.recovering = true;
    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        if (!this.wantCam) return;
        try {
          await this.#stopCamera();
          await this.#startCamera();
          this.onChange(true);
          if (attempt > 1) this.onNotice('Kamera tersambung kembali.');
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 700 * attempt));
        }
      }
      this.wantCam = false;
      this.onChange(false);
      this.onNotice('Kamera terputus. Ketuk 📷 untuk menyalakan lagi.');
    } finally {
      this.recovering = false;
      this.#syncUi();
    }
  }

  /** Nyalakan/matikan kamera. Dipanggil dari ketukan pengguna (browser mewajibkan gestur untuk izin kamera). */
  async setCamera(on) {
    if (!this.room) return false;
    if (!on) {
      this.wantCam = false;
      await this.#stopCamera();
      this.onChange(false);
      this.#syncUi();
      return false;
    }
    if (this.camOn) return true;
    if (this.nav && !this.nav.mediaDevices?.getUserMedia) {
      this.onNotice('Kamera tidak tersedia di browser ini.');
      return false;
    }
    this.wantCam = true;
    try {
      await this.#startCamera();
      this.onChange(true);
      this.onNotice('Kamera menyala. Tamu di dekat Anda bisa melihat video Anda.');
    } catch (error) {
      this.wantCam = false;
      this.onNotice(this.#explain(error));
      this.onChange(false);
    }
    this.#syncUi();
    return this.camOn;
  }

  /** Balik kamera depan/belakang. */
  async flip() {
    this.facing = this.facing === 'user' ? 'environment' : 'user';
    if (!this.camOn || !this.track) return;
    try {
      await this.track.restartTrack({ facingMode: this.facing });
    } catch {
      await this.#recoverCamera(); // cadangan: terbitkan ulang dengan arah kamera baru
    }
  }

  /** false = sembunyikan semua kotak video (juga pratinjau sendiri) dan jangan unduh video orang lain. */
  setViewing(on, { notify = false } = {}) {
    this.viewing = Boolean(on);
    this.lastTick = 0;
    // langsung lepas langganan video orang lain tanpa menunggu pembaruan berikutnya
    if (!this.viewing && this.room) this.update({ x: 0, z: 0 }, [], Date.now());
    this.#syncUi();
    if (notify) {
      if (!this.viewing) this.onNotice(this.camOn ? 'Video disembunyikan. Kamera Anda tetap menyala; matikan lewat tombol 📷.' : 'Video disembunyikan (mode hemat).');
      else this.onNotice('Video ditampilkan.');
    }
  }

  // ---------- video orang lain ----------
  /** Dipanggil tiap frame (dibatasi sendiri ke ±4x/dtk). self {x,z,y}, players dari net.players. */
  tick(self, players, nowMs = Date.now()) {
    if (nowMs - this.lastTick < VIDEO_CALL.tickMs) return;
    this.lastTick = nowMs;
    try {
      this.update(self, players, nowMs);
    } catch (error) {
      console.warn('[video] pembaruan gagal', error);
    }
  }

  update(self, players, nowMs = Date.now()) {
    const room = this.room;
    if (!room) return;
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const s of room.activeSpeakers ?? []) this.lastSpoke.set(s.identity, nowMs);
    const speaking = new Set((room.activeSpeakers ?? []).map((s) => s.identity));
    const entries = new Map(); // id -> { pub, name }
    const peers = [];
    for (const part of room.remoteParticipants?.values?.() ?? []) {
      const pub = camPublication(part);
      // saat disembunyikan posisi tidak dibutuhkan: semua publikasi tetap dicatat agar bisa dilepas langgananannya
      const pos = byId.get(part.identity);
      if (!pub || (!pos && this.viewing)) continue;
      entries.set(part.identity, { pub, name: part.name || pos?.name || 'Tamu' });
      if (pos) peers.push(pos);
    }
    const selected = this.viewing
      ? pickVideoPeers({ peers, self, max: this.maxTiles, previous: this.selected, lastSpoke: this.lastSpoke, now: nowMs })
      : new Set();
    for (const [id, { pub }] of entries) {
      const want = selected.has(id);
      if (want && !pub.isSubscribed) pub.setSubscribed?.(true);
      else if (!want && pub.isSubscribed) pub.setSubscribed?.(false);
    }
    this.selected = selected;
    this.#renderTiles(entries, selected, speaking);
  }

  // ---------- tampilan ----------
  #makeTile(isSelf) {
    const doc = this.doc;
    const el = doc.createElement('div');
    el.className = isSelf ? 'vc-tile is-self' : 'vc-tile';
    const ph = doc.createElement('span');
    ph.className = 'vc-ph';
    const video = doc.createElement('video');
    video.autoplay = true;
    video.muted = true; // suara dikelola VoiceChat berdasarkan jarak; video di sini hanya gambar
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    const label = doc.createElement('span');
    label.className = 'vc-name';
    el.append(ph, video, label);
    return { el, video, ph, label, track: null };
  }

  #dropTile(tile) {
    try { tile.track?.detach(tile.video); } catch { /* sudah lepas */ }
    tile.el.remove();
  }

  #renderTiles(entries, selected, speaking) {
    if (!this.doc || !this.strip) return;
    for (const [id, tile] of this.tiles) {
      if (selected.has(id) && entries.has(id)) continue;
      this.#dropTile(tile);
      this.tiles.delete(id);
    }
    for (const id of selected) {
      const entry = entries.get(id);
      if (!entry) continue;
      let tile = this.tiles.get(id);
      if (!tile) {
        tile = this.#makeTile(false);
        this.tiles.set(id, tile);
        this.strip.append(tile.el);
      }
      tile.label.textContent = entry.name;
      tile.ph.textContent = ([...entry.name][0] ?? '?').toUpperCase();
      const track = entry.pub.track ?? null;
      if (track && tile.track !== track) {
        try { tile.track?.detach(tile.video); } catch { /* sudah lepas */ }
        track.attach(tile.video);
        tile.track = track;
      }
      tile.el.classList.toggle('has-video', Boolean(tile.track));
      tile.el.classList.toggle('is-speaking', speaking.has(id));
    }
    this.#syncUi();
  }

  #syncUi() {
    if (!this.doc || !this.strip) return;
    // pratinjau kamera sendiri ikut disembunyikan saat mode sembunyikan aktif (kamera tetap menyiarkan)
    if (this.camOn && this.track && this.viewing) {
      if (!this.selfTile) {
        this.selfTile = this.#makeTile(true);
        this.selfTile.label.textContent = 'Anda';
        this.selfTile.ph.textContent = '📷';
        this.ctls.after(this.selfTile.el);
      }
      if (this.selfTile.track !== this.track) {
        try { this.selfTile.track?.detach(this.selfTile.video); } catch { /* sudah lepas */ }
        this.track.attach(this.selfTile.video);
        this.selfTile.track = this.track;
      }
      this.selfTile.el.classList.add('has-video');
    } else if (this.selfTile) {
      this.#dropTile(this.selfTile);
      this.selfTile = null;
    }
    this.strip.hidden = !(this.camOn || this.tiles.size > 0 || !this.viewing);
    this.flipBtn.hidden = !this.camOn;
    this.viewBtn.textContent = this.viewing ? '👁' : '🙈';
    this.viewBtn.setAttribute('aria-pressed', this.viewing ? 'false' : 'true');
    this.viewBtn.setAttribute('aria-label', this.viewing ? 'Sembunyikan semua video (mode hemat)' : 'Tampilkan video');
    this.viewBtn.title = this.viewing ? 'Sembunyikan semua video' : 'Tampilkan video';
    if (this.toggle) {
      this.toggle.classList.toggle('is-on', this.camOn);
      this.toggle.setAttribute('aria-pressed', this.camOn ? 'true' : 'false');
    }
  }

  /** Pasang tombol 📷 dan baris kotak video. Tombol ikut barisan tombol yang ada (aula/villa); bila tidak ada, mengambang. */
  mount() {
    const doc = this.doc;
    if (!doc || this.strip) return this;
    if (!doc.getElementById('vc-style')) {
      const style = doc.createElement('style');
      style.id = 'vc-style';
      style.textContent = CSS;
      doc.head.append(style);
    }
    const strip = doc.createElement('div');
    strip.className = 'vc-strip';
    strip.hidden = true;
    const ctls = doc.createElement('div');
    ctls.className = 'vc-ctls';
    const mkCtl = (text, label, onClick) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'vc-ctl';
      b.textContent = text;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', onClick);
      return b;
    };
    this.flipBtn = mkCtl('🔄', 'Balik kamera', () => this.flip());
    this.flipBtn.hidden = true;
    this.viewBtn = mkCtl('👁', 'Sembunyikan semua video (mode hemat)', () => this.setViewing(!this.viewing, { notify: true }));
    ctls.append(this.flipBtn, this.viewBtn);
    strip.append(ctls);
    doc.body.append(strip);
    this.strip = strip;
    this.ctls = ctls;

    const menuGrid = doc.querySelector('#menu-grid');
    const bar = doc.querySelector('.arena-topline') ?? doc.querySelector('.rb')?.parentElement ?? null;
    const sibling = bar?.querySelector('.icon-button') ? 'icon-button' : bar?.querySelector('.rb') ? 'rb' : '';
    const toggle = doc.createElement('button');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Kamera video call');
    toggle.title = 'Kamera video call';
    if (menuGrid) {
      toggle.className = 'sheet-tile vc-on-tile';
      const ico = doc.createElement('span');
      ico.className = 'tile-ico';
      ico.textContent = '📷';
      const text = doc.createElement('span');
      text.className = 'tile-label';
      text.textContent = 'Kamera';
      toggle.append(ico, text);
      menuGrid.append(toggle);
    } else if (bar) {
      toggle.className = `${sibling} vc-on-tile`.trim();
      toggle.textContent = '📷';
      bar.insertBefore(toggle, bar.querySelector('#party-button') ?? bar.querySelector('#chat-button') ?? null);
    } else {
      toggle.className = 'vc-toggle';
      toggle.textContent = '📷';
      doc.body.append(toggle);
    }
    toggle.addEventListener('click', () => { toggle.disabled = true; this.setCamera(!this.camOn).finally(() => { toggle.disabled = false; }); });
    this.toggle = toggle;
    this.#syncUi();
    return this;
  }

  dispose() {
    this.wantCam = false;
    this.doc?.removeEventListener('visibilitychange', this._onVisible);
    this.#stopCamera();
    for (const tile of this.tiles.values()) this.#dropTile(tile);
    this.tiles.clear();
    if (this.selfTile) this.#dropTile(this.selfTile);
    this.selfTile = null;
    this.strip?.remove();
    this.toggle?.remove();
    this.strip = null;
    this.toggle = null;
    this.room = null;
  }
}
