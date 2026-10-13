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

import { stageIds, isRoleHolder } from './party.js';

test('mode terbatas: hanya pemegang peran yang sah boleh membuka panggung; klaim tamu biasa diabaikan', () => {
  const present = new Set(['guest', 'owner1', 'mc1']);
  const canHost = (id) => id === 'owner1' || id === 'mc1';
  assert.deepEqual(applyMessage(emptyParty(), 'guest', { k: 'host' }, present, canHost), emptyParty());
  assert.equal(applyMessage(emptyParty(), 'mc1', { k: 'host' }, present, canHost).host, 'mc1');
  assert.deepEqual(applyMessage(emptyParty(), 'guest', { k: 'sync', sp: ['guest'], h: [] }, present, canHost), emptyParty(), 'sync palsu dari tamu ditolak');
  assert.equal(applyMessage(emptyParty(), 'owner1', { k: 'sync', sp: [], h: [] }, present, canHost).host, 'owner1');
});

test('mode terbuka (bawaan) tetap seperti semula: siapa pun boleh jadi MC', () => {
  assert.equal(applyMessage(emptyParty(), 'guest', { k: 'host' }, new Set(['guest'])).host, 'guest');
});

test('pengendali: tamu tanpa hak tidak mengirim klaim MC dan canClaim false; pemegang peran bisa', () => {
  const mkNet = (id, canHostFn) => {
    const sent = [];
    const h = {};
    return { id, players: [{ id }], sent, canHost: canHostFn, on: (e, f) => ((h[e] ??= []).push(f), undefined), sendParty: (m) => sent.push(m) };
  };
  const guest = mkNet('g', () => false);
  const pg = createPartyController({ net: guest });
  assert.equal(pg.canClaim, false);
  pg.claimHost();
  assert.equal(guest.sent.length, 0, 'tidak ada pesan terkirim');
  assert.equal(pg.role, 'listener');
  const mc = mkNet('m', () => true);
  const pm = createPartyController({ net: mc });
  assert.equal(pm.canClaim, true);
  pm.claimHost();
  assert.equal(pm.role, 'host');
  assert.equal(mc.sent.length, 1);
});

test('stageIds: MC/pembicara panggung ditambah pemilik dan MC terverifikasi (selalu terdengar)', () => {
  const players = [{ id: 'a', role: 'owner' }, { id: 'b', role: 'mc' }, { id: 'c', role: 'guest' }, { id: 'd' }];
  assert.deepEqual([...stageIds(emptyParty(), players)].sort(), ['a', 'b']);
  const state = { host: 'b', speakers: ['c'], hands: [] };
  assert.deepEqual([...stageIds(state, players)].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...stageIds(undefined, [])], []);
  assert.equal(isRoleHolder({ role: 'owner' }), true);
  assert.equal(isRoleHolder({ role: 'admin' }), false);
});
