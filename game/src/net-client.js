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
    this.handlers = { welcome: [], state: [], left: [], close: [], error: [] };
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
        }
      };
    });
  }

  #send(data) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(data));
  }

  sendInput(x, z, rot) {
    this.#send({ t: 'input', x, z, rot, seq: ++this.seq });
  }

  close() {
    clearInterval(this.pingTimer);
    this.ws?.close();
  }
}
