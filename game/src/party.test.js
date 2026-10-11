import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTY, applyMessage, createPartyController, emptyParty, prune, roleOf, speakerIds } from './party.js';

const here = (...ids) => new Set(ids);

test('klaim MC: id lebih kecil menang saat klaim bersamaan', () => {
  let s = applyMessage(emptyParty(), 'bbb', { k: 'host' }, here('aaa', 'bbb'));
  assert.equal(s.host, 'bbb');
  s = applyMessage(s, 'aaa', { k: 'host' }, here('aaa', 'bbb'));
  assert.equal(s.host, 'aaa');
  assert.equal(applyMessage(s, 'bbb', { k: 'host' }, here('aaa', 'bbb')).host, 'aaa');
});

test('angkat tangan: hanya pendengar, tanpa duplikat, dan butuh panggung aktif', () => {
  const p = here('h', 'a', 'b');
  assert.deepEqual(applyMessage(emptyParty(), 'a', { k: 'raise' }, p).hands, []);
  let s = applyMessage(emptyParty(), 'h', { k: 'host' }, p);
  s = applyMessage(s, 'a', { k: 'raise' }, p);
  s = applyMessage(s, 'a', { k: 'raise' }, p);
  assert.deepEqual(s.hands, ['a']);
  assert.deepEqual(applyMessage(s, 'h', { k: 'raise' }, p).hands, ['a']); // MC tidak ikut antre
});

test('hanya MC yang bisa menaikkan pembicara; batas jumlah pembicara berlaku', () => {
  const ids = ['h', 'a', 'b', 'c', 'd', 'e', 'f'];
  const p = new Set(ids);
  let s = applyMessage(emptyParty(), 'h', { k: 'host' }, p);
  assert.deepEqual(applyMessage(s, 'a', { k: 'grant', to: 'b' }, p).speakers, []); // bukan MC
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    s = applyMessage(s, id, { k: 'raise' }, p);
    s = applyMessage(s, 'h', { k: 'grant', to: id }, p);
  }
  assert.equal(s.speakers.length, PARTY.maxSpeakers);
  assert.equal(roleOf(s, 'e'), 'listener');
  assert.deepEqual([...speakerIds(s)].sort(), ['a', 'b', 'c', 'd', 'h']);
});

test('menurunkan pembicara: MC bebas, pembicara hanya dirinya sendiri', () => {
  const p = here('h', 'a', 'b');
  let s = applyMessage(emptyParty(), 'h', { k: 'host' }, p);
  s = applyMessage(s, 'h', { k: 'grant', to: 'a' }, p);
  s = applyMessage(s, 'h', { k: 'grant', to: 'b' }, p);
  assert.deepEqual(applyMessage(s, 'a', { k: 'revoke', to: 'b' }, p).speakers, ['a', 'b']);
  assert.deepEqual(applyMessage(s, 'a', { k: 'revoke' }, p).speakers, ['b']);
  assert.deepEqual(applyMessage(s, 'h', { k: 'revoke', to: 'b' }, p).speakers, ['a']);
});

test('MC keluar menutup panggung; peserta keluar dibuang; pesan dari non-peserta diabaikan', () => {
  const p = here('h', 'a');
  let s = applyMessage(emptyParty(), 'h', { k: 'host' }, p);
  s = applyMessage(s, 'h', { k: 'grant', to: 'a' }, p);
  assert.deepEqual(prune(s, here('h')).speakers, []);
  assert.deepEqual(prune(s, here('a')), emptyParty());
  assert.equal(applyMessage(emptyParty(), 'ghost', { k: 'host' }, p).host, null);
  assert.equal(applyMessage(s, 'a', { k: 'close' }, p).host, 'h'); // bukan MC
});

test('sync dari MC diterima, sync palsu dari bukan-MC ditolak, data ngawur dibersihkan', () => {
  const p = here('h', 'a', 'b', 'x');
  let s = applyMessage(emptyParty(), 'h', { k: 'sync', sp: ['a', 'a', 'zz', 5], h: ['b', 'b'] }, p);
  assert.deepEqual(s, { host: 'h', speakers: ['a'], hands: ['b'] });
  assert.equal(applyMessage(s, 'x', { k: 'sync', sp: ['x'], h: [] }, p).host, 'h');
});

function fakeNet(id, bus) {
  const handlers = {};
  const net = {
    id,
    players: [],
    on(e, f) { (handlers[e] ??= []).push(f); return net; },
    sendParty(msg) { for (const other of bus) if (other !== net) other.emit('party', { from: id, msg }); },
    emit(e, p) { for (const f of handlers[e] ?? []) f(p); },
  };
  bus.push(net);
  return net;
}

test('pengendali: alur lengkap angkat tangan -> naik panggung antar dua klien', () => {
  const bus = [];
  const nh = fakeNet('h', bus);
  const na = fakeNet('a', bus);
  const all = [{ id: 'h' }, { id: 'a' }];
  nh.players = all;
  na.players = all;
  const host = createPartyController({ net: nh });
  const guest = createPartyController({ net: na });
  host.claimHost();
  guest.raiseHand();
  assert.equal(guest.handRaised, true);
  assert.deepEqual(host.state.hands, ['a']);
  host.grant('a');
  assert.equal(guest.role, 'speaker');
  assert.equal(guest.handRaised, false);
  guest.revoke();
  assert.equal(host.state.speakers.length, 0);
  host.close();
  assert.equal(guest.state.host, null);
});

test('pengendali: tamu baru mendapat state lewat sync berkala dari MC', () => {
  const bus = [];
  const nh = fakeNet('h', bus);
  const nl = fakeNet('late', bus);
  nh.players = [{ id: 'h' }, { id: 'a' }];
  let clock = 10_000;
  const host = createPartyController({ net: nh, now: () => clock });
  host.claimHost();
  nl.players = [{ id: 'h' }, { id: 'late' }, { id: 'a' }];
  const late = createPartyController({ net: nl });
  assert.equal(late.state.host, null);
  clock += PARTY.syncMs;
  host.tick();
  assert.equal(late.state.host, 'h');
});
