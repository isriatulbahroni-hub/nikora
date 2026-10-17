import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { DOOR_HEIGHT, WALL_HEIGHT } from './villa-layout.js';
import { GAME_SIGNS, GAME_TERMINALS, GAMES, TERMINAL_RANGE, insideGameWing, nearestTerminal } from './villa-gamewing.js';
import { createVillaGames } from './villa-gameui.js';

const newDoc = () => new JSDOM('<!doctype html><body></body>').window.document;
const inHorror = { x: -18, z: 37.2, level: 0, stair: null, y: 0 };
const inBadminton = { x: -34, z: 37.2, level: 0, stair: null, y: 0 };
const readyCatalog = { ...GAMES, horror: { ...GAMES.horror, status: 'ready' } };

test('terminal berada di dalam ruangannya, menempel di dinding selatan, dan tidak tumpang tindih', () => {
  for (const t of GAME_TERMINALS) {
    assert.ok(insideGameWing(t.x, t.z, 0), `${t.id} di luar sayap`);
    assert.ok(t.z > 38 && t.z < 39.2, `${t.id} tidak menempel di dinding selatan`);
    assert.ok(GAMES[t.game], `${t.id} tanpa permainan`);
  }
  const [a, b] = GAME_TERMINALS;
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 2 * TERMINAL_RANGE, 'dua terminal terlalu dekat');
});

test('nearestTerminal: dekat = ada, jauh/di tangga/lantai atas = tidak', () => {
  assert.equal(nearestTerminal(inHorror)?.id, 'term_horror');
  assert.equal(nearestTerminal(inBadminton)?.id, 'term_badminton');
  assert.equal(nearestTerminal({ x: -26, z: 35, level: 0, stair: null }), null, 'lobi tidak punya terminal');
  assert.equal(nearestTerminal({ ...inHorror, stair: 'tower_w_a' }), null);
  assert.equal(nearestTerminal({ ...inHorror, level: 1 }), null);
  assert.equal(nearestTerminal(null), null);
});

test('papan nama berada di atas bukaan pintu dan di bawah puncak dinding', () => {
  assert.equal(GAME_SIGNS.length, 3);
  for (const s of GAME_SIGNS) {
    assert.ok(s.y - s.h / 2 >= DOOR_HEIGHT, `${s.id} menutupi bukaan pintu`);
    assert.ok(s.y + s.h / 2 <= WALL_HEIGHT, `${s.id} melewati puncak dinding`);
    assert.ok(insideGameWing(s.x, s.z, 0.3), `${s.id} di luar sayap`);
  }
});

test('tombol terminal: soon berlabel segera hadir, ready berlabel Main', () => {
  const g = createVillaGames({ doc: newDoc(), decor: null });
  assert.match(g.nearTerminal(inHorror).label, /segera hadir/);
  const g2 = createVillaGames({ doc: newDoc(), decor: null, catalog: readyCatalog });
  assert.match(g2.nearTerminal(inHorror).label, /Main Mansion Horor/);
  assert.equal(g2.nearTerminal({ x: -26, z: 35, level: 0, stair: null }), null);
});

test('membuka permainan yang belum siap: pesan segera hadir, layar tetap tertutup', async () => {
  const notices = [];
  const doc = newDoc();
  const g = createVillaGames({ doc, decor: null, toast: (m) => notices.push(m) });
  const r = await g.open(g.nearTerminal(inHorror), inHorror);
  assert.equal(r.reason, 'soon');
  assert.equal(notices.length, 1);
  assert.equal(doc.querySelector('.vg').hidden, true);
  assert.equal(g.locksInput, false);
});

test('permainan siap: layar terbuka, input terkunci, villa berhenti menggambar; Keluar dan Escape menutup', async () => {
  const doc = newDoc();
  const log = [];
  const loaders = {
    horror: async () => ({
      default: {
        mount(ctx) {
          const el = doc.createElement('canvas');
          ctx.container.appendChild(el);
          log.push(`mount:${ctx.gameId}`);
          return { destroy: () => log.push('destroy') };
        },
      },
    }),
  };
  const g = createVillaGames({ doc, decor: null, catalog: readyCatalog, loaders });
  const shell = doc.querySelector('.vg');

  const r = await g.open(g.nearTerminal(inHorror), inHorror);
  assert.equal(r.ok, true);
  assert.equal(shell.hidden, false);
  assert.equal(shell.querySelector('.vg-title').textContent, 'Mansion Horor');
  assert.equal(shell.querySelector('.vg-screen canvas') !== null, true);
  assert.equal(g.locksInput, true);
  assert.equal(g.covering, true);
  assert.equal(doc.documentElement.classList.contains('vg-open'), true);

  shell.querySelector('.vg-exit').click();
  assert.equal(shell.hidden, true);
  assert.equal(g.locksInput, false);
  assert.equal(shell.querySelector('.vg-screen').children.length, 0);
  assert.deepEqual(log, ['mount:horror', 'destroy']);

  await g.open(g.nearTerminal(inHorror), inHorror);
  const esc = new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape' });
  doc.dispatchEvent(esc);
  assert.equal(g.locksInput, false);
});

test('pemain keluar dari ruangan saat bermain: tick menutup permainan', async () => {
  const doc = newDoc();
  const loaders = { horror: async () => ({ default: { mount: () => ({ destroy() {} }) } }) };
  const g = createVillaGames({ doc, decor: null, catalog: readyCatalog, loaders });
  await g.open(g.nearTerminal(inHorror), inHorror);
  g.tick(inHorror);
  assert.equal(g.locksInput, true);
  g.tick({ x: -26, z: 35, level: 0, stair: null }); // pindah ke lobi
  assert.equal(g.locksInput, false);
});

test('hanya ruang seram yang memberi peringatan saat dimasuki', () => {
  const g = createVillaGames({ doc: newDoc(), decor: null });
  assert.match(g.entered('game_horror'), /seram/i);
  assert.equal(g.entered('game_badminton'), null);
  assert.equal(g.entered('game_lobby'), null);
  assert.equal(g.entered('wedding_hall'), null);
});

test('dispose membersihkan layar dan listener', async () => {
  const doc = newDoc();
  const g = createVillaGames({ doc, decor: null });
  g.dispose();
  assert.equal(doc.querySelector('.vg'), null);
});
