import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><head></head><body></body>', { pretendToBeVisual: true, url: 'https://undangan.example/studio' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const { sanitizeStyle, deriveTokens, applyStyle, loadFonts, normHex, FONT_CHOICES, COLOR_FIELDS } = await import('../src/engine/style.js');
const { contrast } = await import('../src/engine/color.js');
const { buildView } = await import('../src/engine/config.js');
const { THEMES } = await import('../src/themes/index.js');
const { demoInvitation, demoScenes } = await import('../src/engine/demo.js');
const { paletteFromPixels } = await import('../src/studio/palette.js');
const { appearanceView } = await import('../src/studio/appearance.js');
const { createClient } = await import('../src/studio/api.js');
const { acceptPreviewMessage } = await import('../src/preview-frame.js');
const { mountCover } = await import('../src/scenes/cover.js');

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const ev = (t) => new dom.window.Event(t, { bubbles: true });

test('sanitizeStyle: hanya hex, font dari daftar, foto https; sisanya dibuang', () => {
  assert.equal(sanitizeStyle(null), null);
  assert.equal(sanitizeStyle([]), null);
  assert.equal(sanitizeStyle({ colors: { bg1: 'red', accent: 'url(javascript:1)' }, fonts: { display: 'Comic Evil' }, cover: { image: 'http://x/a.jpg' } }), null);
  const s = sanitizeStyle({ colors: { bg1: '#ABC', accent: '#112233', zzz: '#000000' }, fonts: { display: 'Cinzel', body: 'Papyrus' }, cover: { image: 'https://i.example/a.jpg', dim: 5 } });
  assert.deepEqual(s.colors, { bg1: '#aabbcc', accent: '#112233' });
  assert.deepEqual(s.fonts, { display: 'Cinzel' });
  assert.deepEqual(s.cover, { image: 'https://i.example/a.jpg', dim: 0.8 });
  assert.equal(sanitizeStyle({ cover: { image: 'https://i.example/a.jpg', dim: 0 } }).cover.dim, 0.3);
  assert.equal(normHex('#FFF'), '#ffffff');
  assert.equal(normHex('fff'), null);
});

test('deriveTokens: apa pun warna pilihan, kontras tulisan, tinta surat, dan segel tetap aman', () => {
  const base = THEMES[0].tokens;
  // 300 kombinasi acak termasuk yang jahat (latar hampir sama dengan tulisan, semua putih, semua hitam)
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const hex = () => `#${Math.floor(rnd() * 16777216).toString(16).padStart(6, '0')}`;
  const cases = [{ bg1: '#ffffff', bg2: '#ffffff', accent: '#ffffff', accent2: '#ffffff' }, { bg1: '#000000', bg2: '#000000', accent: '#000000', accent2: '#000000' }, { bg1: '#777777', bg2: '#808080', accent: '#7a7a7a', accent2: '#787878' }];
  for (let i = 0; i < 300; i++) cases.push({ bg1: hex(), bg2: hex(), accent: hex(), accent2: hex() });
  for (const c of cases) {
    const { tokens: t } = deriveTokens(base, c);
    assert.ok(contrast(t.stageInk, t.bg1) >= 4.5, `stageInk/bg1 ${JSON.stringify(c)} ${contrast(t.stageInk, t.bg1)}`);
    assert.ok(contrast(t.stageInk, t.bg2) >= 4.5, `stageInk/bg2 ${JSON.stringify(c)}`);
    assert.ok(contrast(t.ink, t.letter) >= 7, `ink/letter ${JSON.stringify(c)}`);
    assert.ok(contrast(t.sealInk, t.sealFill) >= 3, `seal ${JSON.stringify(c)}`);
    assert.ok(contrast(t.accent2, t.bg1) >= 2.1, `accent2 terlihat ${JSON.stringify(c)}`);
    for (const k of Object.keys(base)) assert.match(t[k], /^#[0-9a-f]{6}$/, k);
  }
  assert.equal(deriveTokens(base, { bg1: '#808080', bg2: '#7c7c7c' }).notes.length >= 1, true, 'abu-abu tengah perlu disesuaikan dan dijelaskan');
  assert.equal(deriveTokens(base, { bg1: '#fefefe', bg2: '#fdfdfd' }).notes.length, 0, 'latar putih memakai tulisan gelap: tidak perlu penyesuaian');
  assert.deepEqual(deriveTokens(base, {}).tokens.accent, base.accent);
});

test('applyStyle: tema baru (asli tidak berubah), font dipetakan ke tumpukan font, sanitasi ulang', () => {
  const theme = THEMES[0];
  const before = JSON.stringify(theme);
  const out = applyStyle(theme, { colors: { accent: '#aa2244' }, fonts: { display: 'Great Vibes' } });
  assert.equal(JSON.stringify(theme), before);
  assert.equal(out.tokens.accent, '#aa2244');
  assert.match(out.fonts.display, /Great Vibes/);
  assert.equal(out.fonts.body, theme.fonts.body);
  assert.equal(applyStyle(theme, { colors: { accent: 'bukan' } }), theme);
  assert.equal(out.id, theme.id);
});

test('buildView: extra.style menimpa tema untuk semua adegan; view.style tersaring', () => {
  const inv = { ...demoInvitation('pernikahan-islami'), extra: { tz: 'Asia/Makassar', style: { colors: { accent: '#aa2244', bg1: '#220011' }, cover: { image: 'https://i.example/a.jpg' } } } };
  const v = buildView({ invitation: inv, scenes: demoScenes('pernikahan-islami'), query: {} });
  assert.equal(v.theme.tokens.accent, '#aa2244');
  assert.equal(v.style.cover.image, 'https://i.example/a.jpg');
  assert.ok(contrast(v.theme.tokens.stageInk, v.theme.tokens.bg1) >= 4.5);
  const plain = buildView({ invitation: demoInvitation('pernikahan-islami'), query: {} });
  assert.equal(plain.style, null);
  const evil = buildView({ invitation: { ...inv, extra: { style: { colors: { accent: 'javascript:1' }, cover: { image: 'javascript:alert(1)' } } } }, query: {} });
  assert.equal(evil.style, null);
});

test('loadFonts: satu <link> Google Fonts untuk font pilihan, aman diulang, tanpa font = tidak ada', () => {
  assert.equal(loadFonts(null), null);
  assert.equal(loadFonts({ colors: { accent: '#112233' } }), null);
  const l = loadFonts({ fonts: { display: 'Great Vibes', body: 'Lora' } });
  assert.match(l.href, /^https:\/\/fonts\.googleapis\.com\/css2\?family=Great\+Vibes&family=Lora/);
  assert.match(l.href, /display=swap$/);
  loadFonts({ fonts: { display: 'Great Vibes', body: 'Lora' } });
  assert.equal(document.querySelectorAll('#orbit-style-fonts').length, 1);
  loadFonts({ fonts: { display: 'Cinzel' } });
  assert.equal(document.querySelectorAll('#orbit-style-fonts').length, 1);
  assert.match(document.getElementById('orbit-style-fonts').href, /Cinzel/);
  assert.equal(FONT_CHOICES.length >= 12 && COLOR_FIELDS.length === 4, true);
});

test('palet dari foto: foto biru-oranye menghasilkan 4 warna hex valid yang serasi', () => {
  const px = [];
  const put = (r, g, b, n) => { for (let i = 0; i < n; i++) px.push(r, g, b, 255); };
  put(20, 30, 70, 600); put(30, 80, 190, 250); put(250, 160, 30, 120); put(240, 235, 225, 60);
  const p = paletteFromPixels(Uint8ClampedArray.from(px));
  for (const k of ['bg1', 'bg2', 'accent', 'accent2']) assert.match(p[k], /^#[0-9a-f]{6}$/, k);
  const [r, , b] = [parseInt(p.accent.slice(1, 3), 16), 0, parseInt(p.accent.slice(5, 7), 16)];
  assert.ok(b > r, 'aksen mengikuti biru yang dominan dan hidup');
  const [r2] = [parseInt(p.accent2.slice(1, 3), 16)];
  assert.ok(r2 > 200, 'sorotan mengambil oranye terang');
  assert.equal(paletteFromPixels(new Uint8ClampedArray(0)), null);
  assert.equal(paletteFromPixels(Uint8ClampedArray.from([1, 2, 3, 0])), null, 'piksel transparan diabaikan');
});

test('pesan pratinjau gaya: disaring, null = kembali ke tema', () => {
  const ctx = { origin: 'https://undangan.example', parent: { id: 'p' } };
  const m = (data, over = {}) => ({ origin: ctx.origin, source: ctx.parent, data, ...over });
  const ok = acceptPreviewMessage(m({ type: 'orbit-preview:style', style: { colors: { accent: '#112233', bg1: 'merah' } } }), ctx);
  assert.deepEqual(ok, { type: 'style', style: { colors: { accent: '#112233' } } });
  assert.deepEqual(acceptPreviewMessage(m({ type: 'orbit-preview:style', style: 'x' }), ctx), { type: 'style', style: null });
  assert.equal(acceptPreviewMessage(m({ type: 'orbit-preview:style', style: {} }, { origin: 'https://jahat.example' }), ctx), null);
});

test('cover dengan foto sampul: foto menggantikan pemandangan, redup sesuai pilihan, tanpa tokoh', () => {
  const inv = { ...demoInvitation('pernikahan-islami'), extra: { style: { cover: { image: 'https://i.example/a.jpg', dim: 0.6 } } } };
  const view = buildView({ invitation: inv, scenes: demoScenes('pernikahan-islami'), query: {} });
  const root = document.createElement('div');
  document.body.append(root);
  const scene = mountCover(root, { view, env: { reduced: true } });
  assert.equal(root.querySelector('.cv-photo img').getAttribute('src'), 'https://i.example/a.jpg');
  assert.equal(root.querySelector('.cv-photo img').getAttribute('referrerpolicy'), 'no-referrer');
  assert.equal(root.querySelector('.pg-stage').style.getPropertyValue('--dim'), '0.6');
  assert.equal(root.querySelector('.scenery'), null);
  assert.equal(root.querySelector('.cv-hero'), null);
  assert.ok(root.querySelector('.cv-name'));
  scene.destroy();
});

function fakeClient(extra = { tz: 'Asia/Makassar' }) {
  const saved = [];
  return { saved, uploadImage: async () => 'https://x.supabase.co/storage/v1/object/public/media/u/c.jpg', saveStyle: async (slug, s) => { saved.push({ slug, s }); return s; } };
}

test('tab Tampilan: ubah warna memberi tahu pratinjau, simpan, kembalikan ke tema', async () => {
  const client = fakeClient();
  let sends = 0, changes = 0, savedStyle = 'belum';
  const msgs = [];
  const { node, current } = appearanceView({ client, slug: 'a-b', inv: { slug: 'a-b', event_type: 'pernikahan', theme: 'pernikahan-islami', extra: {} }, send: () => { sends += 1; }, onChange: () => { changes += 1; }, onSaved: (s) => { savedStyle = s; }, setMsg: (m) => msgs.push(m) });
  document.body.append(node);
  assert.equal(current(), null, 'belum diubah = ikut tema');
  const hexes = node.querySelectorAll('.s-hex');
  assert.equal(hexes.length, 4);
  hexes[2].value = '#aa2244'; hexes[2].dispatchEvent(ev('change'));
  assert.ok(sends >= 1 && changes >= 1);
  assert.equal(current().colors.accent, '#aa2244');
  hexes[3].value = 'bukan-warna'; hexes[3].dispatchEvent(ev('change'));
  assert.equal(current().colors.accent2, undefined, 'kode salah ditolak, kembali ke nilai sebelumnya');
  const selects = node.querySelectorAll('select');
  selects[0].value = 'Great Vibes'; selects[0].dispatchEvent(ev('change'));
  assert.equal(current().fonts.display, 'Great Vibes');
  const url = node.querySelector('input[type=url]');
  url.value = 'http://tidak-aman.example/a.jpg'; url.dispatchEvent(ev('change'));
  assert.equal(current().cover, undefined);
  assert.match(msgs.at(-1), /https/);
  url.value = 'https://foto.example/a.jpg'; url.dispatchEvent(ev('change'));
  assert.equal(current().cover.image, 'https://foto.example/a.jpg');
  [...node.querySelectorAll('button')].find((b) => b.textContent === 'Simpan tampilan').click();
  await tick(5);
  assert.equal(client.saved.length, 1);
  assert.equal(client.saved[0].s.colors.accent, '#aa2244');
  assert.equal(savedStyle.fonts.display, 'Great Vibes');
  [...node.querySelectorAll('button')].find((b) => b.textContent === 'Kembalikan ke tema').click();
  assert.equal(current(), null);
});

test('tab Tampilan: warna ekstrem menampilkan penjelasan penyesuaian otomatis', () => {
  const { node } = appearanceView({ client: fakeClient(), slug: 'a-b', inv: { slug: 'a-b', event_type: 'pernikahan', theme: 'pernikahan-islami', extra: {} }, send() {}, onChange() {}, onSaved() {}, setMsg() {} });
  document.body.append(node);
  const hexes = node.querySelectorAll('.s-hex');
  hexes[0].value = '#808080'; hexes[0].dispatchEvent(ev('change'));
  hexes[1].value = '#7c7c7c'; hexes[1].dispatchEvent(ev('change'));
  assert.match(node.querySelector('.s-notes').textContent, /disesuaikan|digelapkan|diterangkan/i);
});

test('saveStyle: PATCH extra tanpa menghapus isi lain; kosong menghapus style', async () => {
  const calls = [];
  const sess = JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u' } });
  const store = { get: () => sess, set() {} };
  const c = createClient({ url: 'https://x.supabase.co', key: 'k', store, fetchImpl: async (u, o) => {
    calls.push({ u, o });
    return { ok: true, status: 200, json: async () => (o.method === 'GET' || !o.method ? [{ slug: 'a-b', event_type: 'pernikahan', extra: { tz: 'Asia/Makassar', hosts: 'Keluarga', style: { colors: { accent: '#111111' } } } }] : null) };
  } });
  const out = await c.saveStyle('a-b', { colors: { accent: '#AA2244', bg1: 'jahat' }, cover: { image: 'javascript:1' } });
  assert.deepEqual(out, { colors: { accent: '#aa2244' } });
  const patch = calls.find((x) => x.o.method === 'PATCH');
  assert.equal(patch.u, 'https://x.supabase.co/rest/v1/invitations?slug=eq.a-b');
  assert.deepEqual(JSON.parse(patch.o.body), { extra: { tz: 'Asia/Makassar', hosts: 'Keluarga', style: { colors: { accent: '#aa2244' } } } });
  await c.saveStyle('a-b', null);
  const patch2 = calls.filter((x) => x.o.method === 'PATCH').at(-1);
  assert.deepEqual(JSON.parse(patch2.o.body), { extra: { tz: 'Asia/Makassar', hosts: 'Keluarga' } });
});
