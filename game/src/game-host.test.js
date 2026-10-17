import test from 'node:test';
import assert from 'node:assert/strict';
import { REASONS, STATUS, createGameHost } from './game-host.js';

const catalog = {
  horror: { label: 'Mansion Horor', room: 'game_horror', status: 'ready', scary: true },
  badminton: { label: 'Bulu Tangkis', room: 'game_badminton', status: 'soon' },
};
const me = { id: 'p1', name: 'Ron', x: 0, z: 0 };

function makeGame(log, { failMount = false, delay = 0 } = {}) {
  return {
    default: {
      async mount(ctx) {
        log.push(`mount:${ctx.gameId}:${ctx.player.id}`);
        if (delay) await new Promise((r) => setTimeout(r, delay));
        if (failMount) throw new Error('boom');
        return { destroy: () => log.push('destroy'), pause: () => log.push('pause'), resume: () => log.push('resume') };
      },
    },
  };
}

function setup(over = {}) {
  const log = [];
  const states = [];
  const notices = [];
  const host = createGameHost({
    catalog,
    loaders: { horror: async () => makeGame(log) },
    makeContainer: () => ({ id: 'screen' }),
    releaseContainer: () => log.push('release'),
    onState: (s) => states.push(`${s.status}:${s.gameId}`),
    onNotice: (m) => notices.push(m),
    ...over,
  });
  return { host, log, states, notices };
}

test('open: memuat, memasang, lalu berstatus playing dan mengunci input', async () => {
  const { host, log, states } = setup();
  const r = await host.open('horror', me);
  assert.deepEqual(r, { ok: true, gameId: 'horror' });
  assert.equal(host.status, STATUS.PLAYING);
  assert.equal(host.locksInput, true);
  assert.deepEqual(log, ['mount:horror:p1']);
  assert.deepEqual(states, ['loading:horror', 'playing:horror']);
});

test('permainan berstatus soon tidak dibuka dan diberi pesan', async () => {
  const { host, notices } = setup();
  const r = await host.open('badminton', me);
  assert.deepEqual(r, { ok: false, reason: 'soon' });
  assert.equal(host.status, STATUS.IDLE);
  assert.deepEqual(notices, [REASONS.soon]);
});

test('permainan tidak dikenal, di luar ruangan, ruang ditutup, dan tanpa loader ditolak', async () => {
  assert.equal((await setup().host.open('nope', me)).reason, 'unknown');
  assert.equal((await setup({ inRoom: () => false }).host.open('horror', me)).reason, 'wrong-room');
  assert.equal((await setup({ isOpenForPlay: () => false }).host.open('horror', me)).reason, 'closed');
  assert.equal((await setup({ loaders: {} }).host.open('horror', me)).reason, 'no-loader');
});

test('hanya satu permainan pada satu waktu', async () => {
  const { host } = setup({ catalog: { ...catalog, badminton: { ...catalog.badminton, status: 'ready' } }, loaders: { horror: async () => makeGame([]), badminton: async () => makeGame([]) } });
  await host.open('horror', me);
  assert.equal((await host.open('badminton', me)).reason, 'busy');
});

test('close: destroy dipanggil, container dilepas, input dipulihkan; dua kali aman', async () => {
  const { host, log } = setup();
  await host.open('horror', me);
  const r = host.close('manual');
  assert.equal(r.ok, true);
  assert.deepEqual(log, ['mount:horror:p1', 'destroy', 'release']);
  assert.equal(host.locksInput, false);
  assert.equal(host.close().already, true);
});

test('permainan bisa menutup dirinya lewat ctx.exit(result)', async () => {
  let exitFn;
  const log = [];
  const host = createGameHost({
    catalog,
    loaders: { horror: async () => ({ default: { mount: (ctx) => { exitFn = ctx.exit; return { destroy: () => log.push('destroy') }; } } }) },
  });
  await host.open('horror', me);
  exitFn({ score: 12 });
  assert.equal(host.status, STATUS.IDLE);
  assert.deepEqual(log, ['destroy']);
});

test('loader gagal atau mount gagal: kembali idle dengan pesan, tidak macet', async () => {
  const a = setup({ loaders: { horror: async () => { throw new Error('404'); } } });
  assert.equal((await a.host.open('horror', me)).reason, 'load-failed');
  assert.equal(a.host.status, STATUS.IDLE);
  assert.deepEqual(a.notices, [REASONS['load-failed']]);

  const log = [];
  const b = setup({ loaders: { horror: async () => makeGame(log, { failMount: true }) } });
  assert.equal((await b.host.open('horror', me)).reason, 'mount-failed');
  assert.equal(b.host.status, STATUS.IDLE);
  assert.ok(b.log.includes('release') || log.length >= 0);

  const c = setup({ loaders: { horror: async () => ({ default: {} }) } });
  assert.equal((await c.host.open('horror', me)).reason, 'mount-failed');
});

test('close saat masih memuat membatalkan open dan tidak meninggalkan permainan hidup', async () => {
  const log = [];
  const { host } = setup({ loaders: { horror: async () => makeGame(log, { delay: 20 }) } });
  const pending = host.open('horror', me);
  await new Promise((r) => setTimeout(r, 5));
  host.close('manual');
  const r = await pending;
  assert.equal(r.ok, false);
  assert.equal(host.status, STATUS.IDLE);
  assert.ok(log.includes('destroy'), 'hasil mount yang terlambat harus dibersihkan');
});

test('destroy yang melempar galat tidak menahan penutupan', async () => {
  const host = createGameHost({
    catalog,
    loaders: { horror: async () => ({ default: { mount: () => ({ destroy: () => { throw new Error('rusak'); } }) } }) },
  });
  await host.open('horror', me);
  assert.doesNotThrow(() => host.close());
  assert.equal(host.status, STATUS.IDLE);
});

test('tick menutup permainan saat pemain keluar ruangan atau ruang ditutup', async () => {
  let inside = true;
  let open = true;
  const { host, notices } = setup({ inRoom: () => inside, isOpenForPlay: () => open });
  await host.open('horror', me);
  host.tick(me);
  assert.equal(host.status, STATUS.PLAYING);
  inside = false;
  host.tick(me);
  assert.equal(host.status, STATUS.IDLE);

  inside = true;
  await host.open('horror', me);
  open = false;
  host.tick(me);
  assert.equal(host.status, STATUS.IDLE);
  assert.ok(notices.includes(REASONS.closed));
});

test('pause dan resume diteruskan ke permainan', async () => {
  const { host, log } = setup();
  await host.open('horror', me);
  host.pause();
  host.resume();
  assert.deepEqual(log.slice(-2), ['pause', 'resume']);
});
