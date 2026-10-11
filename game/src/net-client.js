// Klien jaringan untuk ORBIT multiplayer. Tidak menyentuh render/physics:
// hanya mengirim input dan menerima snapshot dari server (otoritatif).
export class NetClient {
  constructor({ WebSocketImpl = globalThis.WebSocket, pingMs = 5000 } = {}) {
    this.WebSocketImpl = WebSocketImpl;
    this.pingMs = pingMs;
    this.ws = null;
    this.id = null;
    this.seq = 0;
    this.players = [];
    this.handlers = { welcome: [], state: [], left: [], chat: [], close: [], error: [], 'greet-req': [], 'greet-declined': [], voice: [] };
    this.pingTimer = null;
  }

  on(event, fn) {
    this.handlers[event].push(fn);
    return this;
  }

  #emit(event, payload) {
    for (const fn of this.handlers[event]) fn(payload);
  }

  connect(url, name = 'Tamu') {
    return new Promise((resolve, reject) => {
      const ws = new this.WebSocketImpl(url);
      this.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name }));
      ws.onerror = (e) => {
        this.#emit('error', e);
        reject(new Error('koneksi gagal'));
      };
      ws.onclose = (e) => {
        clearInterval(this.pingTimer);
        this.#emit('close', e);
        reject(new Error('koneksi ditutup'));
      };
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.t === 'welcome') {
          this.id = msg.id;
          this.players = msg.players;
          this.pingTimer = setInterval(() => this.#send({ t: 'ping', ts: Date.now() }), this.pingMs);
          this.#emit('welcome', msg);
          resolve(msg);
        } else if (msg.t === 'state') {
          this.players = msg.players;
          this.#emit('state', msg);
        } else if (msg.t === 'left') {
          this.#emit('left', msg);
        } else if (msg.t === 'chat') {
          this.#emit('chat', msg);
        } else if (msg.t === 'greet-req') {
          this.#emit('greet-req', msg);
        } else if (msg.t === 'voice') {
          this.#emit('voice', msg);
        } else if (msg.t === 'greet-declined') {
          this.#emit('greet-declined', msg);
        }
      };
    });
  }

  #send(data) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(data));
  }

  /** sit: id kursi untuk duduk, null untuk berdiri; undefined = tidak mengubah status duduk. */
  sendInput(x, z, rot, sit) {
    const msg = { t: 'input', x, z, rot, seq: ++this.seq };
    if (sit !== undefined) msg.sit = sit;
    this.#send(msg);
  }

  sendChat(text) {
    this.#send({ t: 'chat', text });
  }

  /** kind: 'handshake' | 'highfive' (butuh persetujuan) atau 'wave' | 'bow' (langsung). */
  sendGreet(to, kind) {
    this.#send({ t: 'greet', to, kind });
  }

  requestVoiceToken() {
    this.#send({ t: 'voice-token' });
  }

  replyGreet(from, accept) {
    this.#send({ t: 'greet-reply', from, accept: accept === true });
  }

  close() {
    clearInterval(this.pingTimer);
    this.ws?.close();
  }
}
