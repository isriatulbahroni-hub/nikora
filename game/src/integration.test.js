// Pemeriksaan lintas-proyek: tautan yang dibuat undangan/studio harus bisa dipahami dunia (gerbang + ruang acara).
import test from 'node:test';
import assert from 'node:assert/strict';
import { shareLinks } from '../../invitation/src/studio/api.js';
import { buildView } from '../../invitation/src/engine/config.js';
import { worldUrl } from '../../invitation/src/engine/world-link.js';
import { parseEventParams } from './event-context.js';
import { shouldShowGate } from './gate.js';
import { roomFor } from './token-issuer.js';

test('tautan dunia dari studio dan dari adegan undangan membawa slug yang sama dan memicu gerbang', () => {
  const links = shareLinks({ slug: 'dimas-rani', inviteBase: 'https://nikora-undangan.vercel.app' });
  const fromStudio = new URL(links.world);
  assert.equal(parseEventParams(fromStudio.search).slug, 'dimas-rani');
  assert.equal(shouldShowGate(fromStudio.search), true);

  const view = buildView({ invitation: { slug: 'dimas-rani', groom: 'Dimas', bride: 'Rani', event_type: 'pernikahan' }, query: { to: 'Bapak Ahmad' } });
  const fromScene = new URL(worldUrl(view));
  assert.equal(parseEventParams(fromScene.search).slug, 'dimas-rani');
  assert.equal(parseEventParams(fromScene.search).to, 'Bapak Ahmad');
  assert.equal(roomFor('villa', 'dimas-rani'), 'evt-dimas-rani-villa');
});

test('link tamu dari studio tetap membawa nama ke undangan (?to=) yang lalu diteruskan ke dunia', () => {
  const links = shareLinks({ slug: 'dimas-rani', inviteBase: 'https://nikora-undangan.vercel.app' });
  const guest = new URL(links.forGuest('Ibu Sari'));
  assert.equal(guest.searchParams.get('slug'), 'dimas-rani');
  const view = buildView({ invitation: { slug: 'dimas-rani', event_type: 'pernikahan' }, query: { to: guest.searchParams.get('to') } });
  assert.equal(parseEventParams(new URL(worldUrl(view)).search).to, 'Ibu Sari');
});
