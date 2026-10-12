import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMessage, emptyScreen, positionAt, prune, sanitizeSource } from './screen-state.js';
import { embedUrl, parseMediaLink, resolveTikTokShort } from './media-resolve.js';

test('parseMediaLink: berbagai bentuk link YouTube', () => {
  const id = 'dQw4w9WgXcQ';
  for (const u of [`https://www.youtube.com/watch?v=${id}`, `youtube.com/watch?v=${id}&feature=share`, `https://youtu.be/${id}`, `https://m.youtube.com/shorts/${id}`, `https://www.youtube.com/embed/${id}`, `https://www.youtube.com/live/${id}?si=abc`]) {
    assert.equal(parseMediaLink(u)?.id, id, u);
  }
  assert.equal(parseMediaLink(`https://youtu.be/${id}?t=90`).start, 90);
  assert.equal(parseMediaLink(`https://youtu.be/${id}?t=1m30s`).start, 90);
  assert.equal(parseMediaLink(`https://youtu.be/${id}?t=1h`).start, 3600);
});

test('parseMediaLink: TikTok panjang dan pendek; selain itu ditolak', () => {
  assert.deepEqual(parseMediaLink('https://www.tiktok.com/@budi/video/7234567890123456789'), { type: 'tiktok', id: '7234567890123456789' });
  assert.deepEqual(parseMediaLink('https://vm.tiktok.com/ZSabc123/'), { type: 'tiktok-short', url: 'https://vm.tiktok.com/ZSabc123/' });
  assert.equal(parseMediaLink('https://www.tiktok.com/t/ZTRabc/').type, 'tiktok-short');
  for (const bad of ['', 'halo', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=pendek', 'javascript:alert(1)', 'https://www.tiktok.com/@budi', 'https://faketiktok.com/@a/video/7234567890123456789', 'x'.repeat(400)]) {
    assert.equal(parseMediaLink(bad), null, bad);
  }
});

test('embedUrl: hanya pemutar resmi; id tidak valid -> null', () => {
  assert.match(embedUrl({ type: 'youtube', id: 'dQw4w9WgXcQ', start: 5 }), /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*start=5/);
  assert.match(embedUrl({ type: 'tiktok', id: '7234567890123456789' }), /^https:\/\/www\.tiktok\.com\/player\/v1\/7234567890123456789\?/);
  assert.equal(embedUrl({ type: 'youtube', id: '"><script>' }), null);
  assert.equal(embedUrl({ type: 'file' }), null);
});

test('resolveTikTokShort: mengikuti pengalihan sampai ID; domain asing ditolak (anti-SSRF)', async () => {
  const hops = { 'https://vm.tiktok.com/ZSabc/': 'https://www.tiktok.com/@budi/video/7234567890123456789?x=1' };
  const f = async (u) => ({ headers: { get: () => hops[u] ?? null } });
  assert.deepEqual(await resolveTikTokShort('https://vm.tiktok.com/ZSabc/', f), { type: 'tiktok', id: '7234567890123456789' });
  let called = 0;
  const spy = async () => { called++; return { headers: { get: () => null } }; };
  assert.equal(await resolveTikTokShort('https://evil.com/x', spy), null);
  assert.equal(await resolveTikTokShort('http://169.254.169.254/latest', spy), null);
  assert.equal(called, 0, 'tidak pernah menghubungi domain asing');
  const redirectOut = async () => ({ headers: { get: () => 'https://evil.com/steal' } });
  assert.equal(await resolveTikTokShort('https://vm.tiktok.com/ZSabc/', redirectOut), null);
});

const present = (...ids) => new Set(ids);
const YT = { type: 'youtube', id: 'dQw4w9WgXcQ', start: 0 };

test('layar: klaim operator, hanya operator yang mengatur, tamu lain diabaikan', () => {
  let s = applyMessage(emptyScreen(), 'bbbb', { k: 'claim' }, present('aaaa', 'bbbb'), 1000);
  assert.equal(s.op, 'bbbb');
  assert.equal(applyMessage(s, 'aaaa', { k: 'load', src: YT }, present('aaaa', 'bbbb'), 1100), s, 'bukan operator');
  s = applyMessage(s, 'bbbb', { k: 'load', src: YT }, present('aaaa', 'bbbb'), 1100);
  assert.equal(s.st, 'playing');
  assert.equal(applyMessage(s, 'aaaa', { k: 'stop' }, present('aaaa', 'bbbb'), 1200), s);
  assert.equal(applyMessage(s, 'cccc', { k: 'claim' }, present('aaaa', 'bbbb'), 99999), s, 'sudah ada operator');
});

test('layar: dua klaim bersamaan diputuskan sama di semua klien (id kecil menang), klaim terlambat ditolak', () => {
  const p = present('aaaa', 'bbbb');
  const orderAB = applyMessage(applyMessage(emptyScreen(), 'aaaa', { k: 'claim' }, p, 1000), 'bbbb', { k: 'claim' }, p, 1200);
  const orderBA = applyMessage(applyMessage(emptyScreen(), 'bbbb', { k: 'claim' }, p, 1000), 'aaaa', { k: 'claim' }, p, 1200);
  assert.equal(orderAB.op, 'aaaa');
  assert.equal(orderBA.op, 'aaaa');
  const late = applyMessage(applyMessage(emptyScreen(), 'bbbb', { k: 'claim' }, p, 1000), 'aaaa', { k: 'claim' }, p, 9000);
  assert.equal(late.op, 'bbbb');
});

test('layar: posisi berjalan, jeda, loncat; sumber tidak sah ditolak; operator keluar mereset layar', () => {
  const p = present('op');
  let s = applyMessage(emptyScreen(), 'op', { k: 'claim' }, p, 0);
  s = applyMessage(s, 'op', { k: 'load', src: { ...YT, start: 30 } }, p, 1000);
  assert.equal(positionAt(s, 6000), 35);
  s = applyMessage(s, 'op', { k: 'pause', pos: 40 }, p, 7000);
  assert.equal(positionAt(s, 99000), 40);
  s = applyMessage(s, 'op', { k: 'play', pos: 40 }, p, 8000);
  s = applyMessage(s, 'op', { k: 'seek', pos: 100 }, p, 9000);
  assert.equal(positionAt(s, 10000), 101);
  const before = s;
  for (const bad of [{ type: 'youtube', id: '<script>' }, { type: 'iframe', url: 'https://evil.com' }, 'x', null]) assert.equal(applyMessage(s, 'op', { k: 'load', src: bad }, p, 1), before);
  assert.equal(prune(s, present('lain')).op, null);
  assert.equal(prune(s, present('op')), s);
});

test('layar: sync berkala memberi tahu tamu baru; sync dari bukan-operator diabaikan; nilai ngawur dibersihkan', () => {
  const p = present('op', 'x');
  const joined = applyMessage(emptyScreen(), 'op', { k: 'sync', src: YT, st: 'playing', pos: 61 }, p, 5000);
  assert.equal(joined.op, 'op');
  assert.equal(positionAt(joined, 7000), 63);
  assert.equal(applyMessage(joined, 'x', { k: 'sync', src: YT, st: 'playing', pos: 1 }, p, 6000), joined);
  const junk = applyMessage(emptyScreen(), 'op', { k: 'sync', src: YT, st: 'hack', pos: -50 }, p, 0);
  assert.equal(junk.st, 'idle');
  assert.equal(sanitizeSource({ type: 'file', name: '<b>Video</b>' }).name, 'bVideo/b');
  assert.equal(applyMessage(emptyScreen(), 'tidak-hadir', { k: 'claim' }, p, 0).op, null);
});
