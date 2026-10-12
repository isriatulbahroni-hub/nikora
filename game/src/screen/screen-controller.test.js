import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createScreenController } from './screen-controller.js';
import { mountScreenUI } from './screen-ui.js';

function makeNet(id, players) {
  const handlers = { screen: [], left: [], 'screen-track': [] };
  const sent = [];
  return {
    id, players: players.map((p) => ({ id: p, name: `N-${p}` })), screenTracks: new Map(), sent,
    on(e, f) { handlers[e].push(f); },
    emit(e, p) { for (const f of handlers[e]) f(p); },
    sendScreen(m) { sent.push(m); },
    async publishStream() { return async () => {}; },
  };
}
const mesh = () => ({ idle: [], videos: [], showIdle(x) { this.idle.push(x); }, showVideo(v) { this.videos.push(v); }, clearVideo() {} });
const setup = (id = 'aaaa', players = ['aaaa', 'bbbb']) => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://nikora.test/' });
  const net = makeNet(id, players);
  const m = mesh();
  let t = 1000;
  const ctl = createScreenController({ net, mesh: m, doc: dom.window.document, now: () => t, nameOf: (x) => `N-${x}`, storage: dom.window.localStorage });
  return { dom, net, m, ctl, tick: (ms) => { t += ms; } };
};
const YT = 'https://youtu.be/dQw4w9WgXcQ?t=30';

test('operator memutar link YouTube: embed resmi terpasang, pesan terkirim ke semua, tamu ikut memutar', async () => {
  const op = setup('aaaa');
  op.ctl.claim();
  assert.equal(op.ctl.isOperator, true);
  await op.ctl.loadLink(YT);
  assert.deepEqual(op.net.sent.map((m) => m.k), ['claim', 'load']);
  const frame = op.dom.window.document.querySelector('.screen-embed-frame');
  assert.match(frame.src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*start=30/);
  assert.equal(op.dom.window.document.querySelector('.screen-embed').hidden, false);
  assert.match(op.m.idle.at(-1).title, /YouTube/);

  const guest = setup('bbbb');
  for (const msg of op.net.sent) guest.net.emit('screen', { from: 'aaaa', msg });
  assert.equal(guest.ctl.isOperator, false);
  assert.match(guest.dom.window.document.querySelector('.screen-embed-frame').src, /dQw4w9WgXcQ/);
});

test('tamu tidak bisa memutar apa pun; link asing ditolak dengan pesan yang jelas', async () => {
  const guest = setup('bbbb');
  guest.net.emit('screen', { from: 'aaaa', msg: { k: 'claim' } });
  await guest.ctl.loadLink(YT);
  assert.match(guest.ctl.status, /operator/);
  assert.deepEqual(guest.net.sent, []);
  const op = setup('aaaa');
  op.ctl.claim();
  await op.ctl.loadLink('https://evil.com/video.mp4');
  assert.match(op.ctl.status, /YouTube atau TikTok/);
  assert.equal(op.ctl.state.src, null);
});

test('pesan palsu dari bukan-operator tidak mengubah layar; jeda dan lanjut mengikuti operator', async () => {
  const guest = setup('bbbb');
  guest.net.emit('screen', { from: 'aaaa', msg: { k: 'claim' } });
  guest.net.emit('screen', { from: 'aaaa', msg: { k: 'load', src: { type: 'youtube', id: 'dQw4w9WgXcQ', start: 0 } } });
  guest.net.emit('screen', { from: 'bbbb', msg: { k: 'stop' } });
  assert.equal(guest.ctl.state.st, 'playing');
  guest.net.emit('screen', { from: 'aaaa', msg: { k: 'pause', pos: 12 } });
  assert.equal(guest.ctl.state.st, 'paused');
  guest.net.emit('left', {});
  guest.net.players = [{ id: 'bbbb' }];
  guest.ctl.tick();
  assert.equal(guest.ctl.state.op, null, 'operator keluar -> layar kembali kosong');
  assert.equal(guest.dom.window.document.querySelector('.screen-embed').hidden, true);
});

test('operator menyiarkan sync berkala untuk tamu yang baru masuk', async () => {
  const op = setup('aaaa');
  op.ctl.claim();
  await op.ctl.loadLink(YT);
  op.tick(3500);
  op.ctl.tick();
  const sync = op.net.sent.at(-1);
  assert.equal(sync.k, 'sync');
  assert.equal(sync.src.id, 'dQw4w9WgXcQ');
  assert.ok(sync.pos >= 33, `pos=${sync.pos}`);
});

test('volume tersimpan dan dibatasi 0..1; panel UI menampilkan kontrol sesuai peran', () => {
  const g = setup('bbbb');
  g.ctl.setVolume(5);
  assert.equal(g.ctl.volume, 1);
  g.ctl.setVolume(-1);
  assert.equal(g.ctl.volume, 0);
  const ui = mountScreenUI({ ctl: g.ctl, net: g.net, doc: g.dom.window.document });
  ui.toggle.click();
  assert.match(ui.panel.textContent, /Jadi operator layar/);
  assert.ok(!ui.panel.querySelector('.sc-input'));
  g.ctl.claim();
  ui.render();
  assert.ok(ui.panel.querySelector('.sc-input'), 'operator melihat kolom link');
  assert.match(ui.panel.textContent, /Video dari HP/);
  assert.match(ui.panel.textContent, /Siaran langsung/);
  assert.match(ui.panel.textContent, /berhak/);
  g.net.emit('screen', { from: 'bbbb', msg: { k: 'release' } });
});

test('video dari HP tanpa dukungan captureStream (iPhone) memberi pesan jujur, bukan gagal diam-diam', async () => {
  const op = setup('aaaa');
  op.ctl.claim();
  const win = op.dom.window;
  win.URL.createObjectURL = () => 'blob:x';
  win.URL.revokeObjectURL = () => {};
  const realCreateUrl = globalThis.URL.createObjectURL;
  const realRevokeUrl = globalThis.URL.revokeObjectURL;
  globalThis.URL.createObjectURL = () => 'blob:x';
  globalThis.URL.revokeObjectURL = () => {};
  const doc = win.document;
  const realCreate = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const n = realCreate(tag);
    if (tag === 'video') { Object.defineProperty(n, 'src', { set() { setTimeout(() => n.onloadedmetadata?.(), 0); }, get() { return ''; } }); }
    return n;
  };
  await op.ctl.pickFile({ type: 'video/mp4', size: 1000, name: 'a.mp4' });
  assert.match(op.ctl.status, /iPhone|belum bisa/);
  assert.equal(op.ctl.state.src, null);
  await op.ctl.pickFile({ type: 'image/png', size: 10, name: 'a.png' });
  assert.match(op.ctl.status, /file video/);
  globalThis.URL.createObjectURL = realCreateUrl;
  globalThis.URL.revokeObjectURL = realRevokeUrl;
});
