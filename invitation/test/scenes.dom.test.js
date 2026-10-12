import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
dom.window.HTMLElement.prototype.scrollIntoView = () => {};

const { buildView } = await import('../src/engine/config.js');
const { demoInvitation, demoScenes } = await import('../src/engine/demo.js');
const { createEngine, registerScene } = await import('../src/engine/scene-engine.js');
const { THEMES } = await import('../src/themes/index.js');
const { mountSurat } = await import('../src/scenes/surat.js');
const { mountCover } = await import('../src/scenes/cover.js');
const { mountKisah } = await import('../src/scenes/kisah.js');
const { mountDetail } = await import('../src/scenes/detail.js');
const { mountGaleri } = await import('../src/scenes/galeri.js');
const { mountPenutup } = await import('../src/scenes/penutup.js');
const { mountHariAcara } = await import('../src/scenes/hari.js');
const { mountArsip } = await import('../src/scenes/arsip.js');
const { text3d } = await import('../src/engine/text3d.js');
const { createAvatar, heroRoles } = await import('../src/engine/avatars.js');
const { buildScenery, SCENERY_KINDS } = await import('../src/engine/scenery.js');

const env = { reduced: true };
const demo = (id) => buildView({ invitation: demoInvitation(id), scenes: demoScenes(id), query: { to: 'Budi' } });
const mount = (fn, view) => {
  const root = document.createElement('div');
  document.body.append(root);
  const scene = fn(root, { view, env, scene: {} });
  return { root, scene };
};
const withScene = (view, kind, config) => ({ ...view, scenes: [{ kind, position: 0, active: true, config }] });

test('surat: sapaan tamu, paragraf, tanda tangan; tombol lanjut menyelesaikan adegan', async () => {
  const { root, scene } = mount(mountSurat, demo('pernikahan-taman'));
  assert.equal(root.querySelector('.sheet-to strong').textContent, 'Budi');
  assert.ok(root.querySelectorAll('.sheet-p').length >= 2);
  assert.equal(root.querySelector('.sheet-sign').textContent, 'Dimas & Rani');
  assert.match(root.querySelector('.sheet-hosts').textContent, /Bapak Ahmad/);
  let finished = false;
  scene.done.then(() => { finished = true; });
  root.querySelector('.pg-cta').click();
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(finished);
  scene.destroy();
  assert.equal(root.children.length, 0);
});

test('surat: teks dari editor tidak pernah jadi HTML', () => {
  const view = withScene(demo('pernikahan-taman'), 'surat', { paragraphs: ['<img src=x onerror=alert(1)>'] });
  const { root } = mount(mountSurat, view);
  assert.equal(root.querySelector('img'), null);
  assert.match(root.querySelector('.sheet-p').textContent, /<img/);
});

test('cover: nama, tanggal, pemandangan 3 lapis, hitung mundur; berhenti saat destroy', () => {
  const view = demo('pernikahan-islami');
  const { root, scene } = mount(mountCover, view);
  assert.equal(root.querySelectorAll('.cv-name').length, 2);
  assert.equal(root.querySelector('.scenery').dataset.kind, 'masjid');
  assert.equal(root.querySelectorAll('.sc-layer').length, 3);
  assert.equal(root.querySelectorAll('.cv-cell').length, 4);
  scene.destroy();
});

test('cover: acara yang sudah lewat menyembunyikan hitung mundur', () => {
  const view = { ...demo('pernikahan-taman'), eventDate: '2001-01-01T00:00:00Z' };
  const { root, scene } = mount(mountCover, view);
  assert.equal(root.querySelector('.cv-count').hidden, true);
  scene.destroy();
});

test('kisah: kartu, titik, navigasi; kosong = dilewati', () => {
  const { root } = mount(mountKisah, demo('pernikahan-taman'));
  const cards = root.querySelectorAll('.ks-card');
  assert.equal(cards.length, 3);
  assert.equal(root.querySelectorAll('.ks-dot').length, 3);
  const [prev, next] = root.querySelectorAll('.ks-nav');
  assert.equal(prev.disabled, true);
  next.click();
  assert.ok(cards[1].classList.contains('is-on'));
  assert.equal(root.querySelectorAll('.ks-dot')[1].getAttribute('aria-current'), 'true');
  const empty = mountKisah(document.createElement('div'), { view: buildView({ invitation: demoInvitation('pernikahan-taman') }), env });
  assert.equal(empty.skipped, true);
});

test('detail: kartu acara, peta aman, kalender; tanpa tanggal/tempat = dilewati', () => {
  const view = withScene(demo('pernikahan-taman'), 'detail', { events: [
    { label: 'Akad', start: '2026-12-12T08:00:00+08:00', venue: 'Masjid', mapUrl: 'https://maps.example/a' },
    { label: 'Resepsi', start: '2026-12-12T11:00:00+08:00', venue: 'Gedung', mapUrl: 'javascript:alert(1)' },
  ] });
  const { root } = mount(mountDetail, view);
  assert.equal(root.querySelectorAll('.dt-card').length, 2);
  const links = [...root.querySelectorAll('a.dt-btn')];
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute('href'), 'https://maps.example/a');
  assert.match(links[0].getAttribute('rel'), /noopener/);
  assert.equal(root.querySelectorAll('button.dt-btn').length, 2);
  const none = mountDetail(document.createElement('div'), { view: buildView({ invitation: { ...demoInvitation('pernikahan-taman'), event_date: null } }), env });
  assert.equal(none.skipped, true);
});

test('galeri: posisi coverflow, geser lewat tombol, zoom dan Esc; foto non-https tidak dirender', () => {
  const view = withScene(demo('pernikahan-taman'), 'galeri', { images: [
    { src: 'https://img.example/1.jpg', caption: 'Satu' },
    { src: 'http://img.example/2.jpg', caption: 'Tolak' },
    { placeholder: true, caption: 'Dua' },
    { placeholder: true, caption: 'Tiga' },
  ] });
  const { root, scene } = mount(mountGaleri, view);
  const items = root.querySelectorAll('.gl-item');
  assert.equal(items.length, 3);
  assert.equal(items[0].dataset.pos, '0');
  assert.equal(items[1].dataset.pos, '1');
  assert.equal(root.querySelector('img').getAttribute('referrerpolicy'), 'no-referrer');
  assert.equal(root.querySelector('.gl-caption').textContent, 'Satu');
  root.querySelectorAll('.ks-nav')[1].click();
  assert.equal(items[1].dataset.pos, '0');
  assert.equal(root.querySelector('.gl-caption').textContent, 'Dua');
  items[1].click();
  assert.ok(root.querySelector('.gl-zoom'));
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(root.querySelector('.gl-zoom'), null);
  scene.destroy();
  assert.equal(root.children.length, 0);
  assert.equal(mountGaleri(document.createElement('div'), { view: buildView({ invitation: demoInvitation('pernikahan-taman') }), env }).skipped, true);
});

test('penutup: ucapan dan nama tuan rumah; tombol Selesai', async () => {
  const { root, scene } = mount(mountPenutup, demo('khitanan-ksatria'));
  assert.equal(root.querySelector('.pn-name').textContent, 'Khitanan Dimas');
  assert.match(root.querySelector('.pn-hosts').textContent, /Bapak Ahmad/);
  root.querySelector('.pg-cta').click();
  await scene.done;
  scene.destroy();
});

test('mesin: adegan kosong dilewati tanpa transisi dan urutan tetap, lalu kartu akhir muncul', async () => {
  registerScene('surat', mountSurat);
  registerScene('kisah', mountKisah);
  registerScene('galeri', mountGaleri);
  const root = document.getElementById('app');
  const view = buildView({
    invitation: demoInvitation('pernikahan-taman'),
    scenes: [{ kind: 'galeri', position: 0, active: true, config: {} }, { kind: 'kisah', position: 1, active: true, config: {} }, { kind: 'surat', position: 2, active: true, config: {} }],
    query: {},
  });
  const engine = createEngine({ root, view: { ...view, worldUrl: null }, env });
  engine.start();
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(root.querySelector('.sheet'), 'surat tampil setelah dua adegan kosong dilewati');
  root.querySelector('.pg-cta').click();
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(root.querySelector('.end-card'));
  engine.stop();
});

test('setiap tema merender semua adegan baru tanpa galat', () => {
  for (const t of THEMES) {
    const view = demo(t.id);
    for (const fn of [mountSurat, mountCover, mountKisah, mountDetail, mountGaleri, mountHariAcara, mountArsip, mountPenutup]) {
      const { scene } = mount(fn, view);
      assert.ok(!scene.skipped, `${t.id} ${fn.name} dilewati`);
      scene.destroy();
    }
  }
});

test('pemandangan: semua resep menghasilkan 3 lapis berisi bentuk', () => {
  for (const kind of SCENERY_KINDS) {
    const el = buildScenery(kind, 11);
    assert.equal(el.querySelectorAll('.sc-layer').length, 3, kind);
    for (const svg of el.querySelectorAll('svg')) assert.ok(svg.children.length > 0, `${kind} lapisan kosong`);
  }
  assert.equal(buildScenery('tidak-ada').dataset.kind, 'bukit');
});

test('hari acara: status, rundown, tautan dunia dan tombol lanjut; di luar jendela = dilewati', async () => {
  const view = { ...demo('pernikahan-taman'), worldUrl: 'https://dunia.example/villa.html?e=demo' };
  const { root, scene } = mount(mountHariAcara, view);
  assert.ok(root.querySelector('.hr-status'));
  assert.equal(root.querySelectorAll('.hr-run li').length, 3);
  const links = [...root.querySelectorAll('a.pg-cta')];
  assert.equal(links.length, 1);
  assert.match(links[0].getAttribute('href'), /^https:\/\/dunia\.example/);
  let done = false; scene.done.then(() => { done = true; });
  root.querySelector('button.pg-cta').click();
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(done);
  scene.destroy();
  const off = { ...view, scenes: view.scenes.map((s) => (s.kind === 'hari_acara' ? { ...s, config: {} } : s)) };
  assert.equal(mountHariAcara(document.createElement('div'), { view: off, env }).skipped, true);
});

test('arsip: ucapan dan tautan kenangan; belum lewat = dilewati', () => {
  const view = { ...demo('pernikahan-taman'), worldUrl: 'https://dunia.example/villa.html' };
  const { root, scene } = mount(mountArsip, view);
  assert.equal(root.querySelectorAll('.ar-wishes li').length, 2);
  assert.equal(root.querySelector('a.pg-cta').textContent, 'Kunjungi dunia kenangan');
  scene.destroy();
  const off = { ...view, scenes: view.scenes.map((s) => (s.kind === 'arsip' ? { ...s, config: {} } : s)) };
  assert.equal(mountArsip(document.createElement('div'), { view: off, env }).skipped, true);
});

test('teks 3D: dipecah per huruf, aria-label utuh, teks panjang tidak dipecah, tidak ada HTML', () => {
  const el = text3d('h2', { class: 'x' }, 'Dimas & Rani');
  assert.equal(el.getAttribute('aria-label'), 'Dimas & Rani');
  assert.equal(el.querySelectorAll('.ch').length, 'Dimas&Rani'.length);
  assert.ok(el.classList.contains('t3d'));
  const long = text3d('p', {}, 'x'.repeat(100));
  assert.equal(long.querySelectorAll('.ch').length, 0);
  assert.equal(long.textContent.length, 100);
  const evil = text3d('p', {}, '<img src=x onerror=1>');
  assert.equal(evil.querySelector('img'), null);
});

test('avatar: setiap peran menghasilkan SVG tersembunyi dari pembaca layar', () => {
  for (const role of ['groom', 'bride', 'child', 'qari', 'singer', 'guest']) {
    const svg = createAvatar({ role, seed: 3, walking: true });
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    assert.ok(svg.querySelector('.av-body'));
    assert.ok(svg.classList.contains('is-walking'));
  }
  assert.deepEqual(heroRoles('pernikahan'), ['groom', 'bride']);
  assert.equal(heroRoles('khitanan').length, 1);
});
