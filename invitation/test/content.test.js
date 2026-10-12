import test from 'node:test';
import assert from 'node:assert/strict';
import { buildView } from '../src/engine/config.js';
import { demoInvitation, demoScenes } from '../src/engine/demo.js';
import {
  safeUrl, countdownParts, icsFor, detailContent, galleryContent, storyContent, suratContent, coverContent, closingContent, copyFor, timeText,
} from '../src/engine/content.js';

const inv = (over = {}, scenes = []) => buildView({
  invitation: { slug: 'dimas-rani', groom: 'Dimas', bride: 'Rani', event_type: 'pernikahan', theme: 'pernikahan-taman', event_date: '2026-12-12T10:00:00+08:00', extra: { tz: 'Asia/Makassar' }, ...over },
  scenes,
  query: { to: 'Budi' },
});
const sc = (kind, config) => [{ kind, position: 0, active: true, config }];

test('safeUrl: hanya https', () => {
  assert.equal(safeUrl('https://maps.google.com/?q=a'), 'https://maps.google.com/?q=a');
  assert.equal(safeUrl('http://x.com'), null);
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,hai'), null);
  assert.equal(safeUrl('//evil.com/x.png'), null);
  assert.equal(safeUrl(42), null);
  assert.equal(safeUrl(`https://a.com/${'x'.repeat(700)}`), null);
});

test('countdownParts: hitung mundur dan null setelah lewat', () => {
  const t = new Date('2026-12-12T00:00:00Z');
  const p = countdownParts(t, t.getTime() - (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000);
  assert.deepEqual(p, { days: 2, hours: 3, minutes: 4, seconds: 5 });
  assert.equal(countdownParts(t, t.getTime()), null);
  assert.equal(countdownParts(t, t.getTime() + 5000), null);
});

test('surat: teks bawaan per jenis, salam Islami, dan teks editor menimpa', () => {
  const w = suratContent(inv());
  assert.equal(w.recipient, 'Budi');
  assert.match(w.paragraphs[1], /Dimas & Rani/);
  assert.equal(w.greeting, 'Dengan hormat,');
  const k = suratContent(buildView({ invitation: demoInvitation('khitanan-ksatria'), query: {} }));
  assert.match(k.greeting, /Assalamu/);
  assert.match(k.paragraphs.join(' '), /Khitanan Dimas/);
  const own = suratContent(inv({}, sc('surat', { greeting: 'Halo', paragraphs: ['Satu', '  ', 'Dua\u0000x'], hosts: 'Keluarga A' })));
  assert.equal(own.greeting, 'Halo');
  assert.deepEqual(own.paragraphs, ['Satu', 'Dua x']);
  assert.equal(own.hosts, 'Keluarga A');
});

test('cover: nama dipisah, countdown bisa dimatikan', () => {
  const c = coverContent(inv());
  assert.deepEqual(c.names, ['Dimas', 'Rani']);
  assert.ok(c.target instanceof Date);
  assert.equal(coverContent(inv({}, sc('cover', { countdown: false }))).target, null);
  assert.deepEqual(coverContent(inv({ bride: '', extra: { title: 'Aira berusia 7 tahun' } })).names, ['Aira berusia 7 tahun']);
});

test('kisah: batas 8, buang kosong, kosong total = tidak ada item', () => {
  assert.equal(storyContent(inv()).items.length, 0);
  const items = Array.from({ length: 12 }, (_, i) => ({ when: `${i}`, title: `Judul ${i}`, text: 'x' }));
  items.push({ when: 'kosong' });
  assert.equal(storyContent(inv({}, sc('kisah', { items }))).items.length, 8);
});

test('detail: cadangan dari event_date, peta hanya https, jam sesuai zona', () => {
  const d = detailContent(inv());
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].label, 'Pernikahan');
  assert.match(d.events[0].timeText, /10\.00 WITA/);
  const e = detailContent(inv({}, sc('detail', { events: [
    { label: 'Akad', start: '2026-12-12T08:00:00+08:00', venue: 'Masjid', mapUrl: 'https://maps.example/x' },
    { label: 'Resepsi', start: '2026-12-12T11:00:00+08:00', venue: 'Gedung', mapUrl: 'javascript:alert(1)' },
    { label: 'Kosong' },
  ] })));
  assert.equal(e.events.length, 2);
  assert.equal(e.events[0].mapUrl, 'https://maps.example/x');
  assert.equal(e.events[1].mapUrl, null);
  assert.equal(detailContent(inv({ event_date: null })).events.length, 0);
  assert.equal(timeText(new Date('2026-12-12T02:00:00Z'), 'Asia/Jakarta'), '09.00 WIB');
});

test('ics: format kalender valid dan teks di-escape', () => {
  const view = inv();
  const ev = detailContent(inv({}, sc('detail', { events: [{ label: 'Akad, Nikah', start: '2026-12-12T08:00:00+08:00', venue: 'Masjid; Agung', duration: 90, note: 'baris1, baris2' }] }))).events[0];
  const ics = icsFor(ev, view, 0, new Date('2026-10-12T00:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261212T000000Z/);
  assert.match(ics, /DTEND:20261212T013000Z/);
  assert.match(ics, /SUMMARY:Akad\\, Nikah Dimas & Rani/);
  assert.match(ics, /LOCATION:Masjid\\; Agung/);
  assert.match(ics, /DESCRIPTION:baris1\\, baris2/);
  assert.match(ics, /UID:dimas-rani-0@orbit/);
  assert.equal(icsFor({ start: null }, view), null);
});

test('galeri: foto https atau placeholder, selain itu dibuang, maksimal 12', () => {
  const images = [
    { src: 'https://img.example/a.jpg', caption: 'A' },
    { src: 'http://img.example/b.jpg' },
    { src: 'javascript:alert(1)' },
    { placeholder: true, caption: 'P' },
    ...Array.from({ length: 20 }, () => ({ src: 'https://img.example/c.jpg' })),
  ];
  const g = galleryContent(inv({}, sc('galeri', { images })));
  assert.equal(g.images.length, 12);
  assert.equal(g.images[0].src, 'https://img.example/a.jpg');
  assert.equal(g.images[1].placeholder, true);
  assert.equal(galleryContent(inv()).images.length, 0);
});

test('penutup dan teks bawaan tiap jenis acara tersedia', () => {
  const p = closingContent(inv());
  assert.equal(p.signature, 'Dimas & Rani');
  assert.ok(p.body.length > 20);
  for (const type of ['pernikahan', 'khitanan', 'tazkirah', 'tarannum', 'ulang_tahun', 'karaoke', 'komunitas']) {
    const c = copyFor({ eventType: type, theme: { id: `${type}-x` } });
    assert.ok(c.suratBody.length >= 1 && c.closingBody && c.storyTitle && c.detailTitle, type);
  }
});

test('demo: setiap tema punya kisah, detail, dan galeri contoh', () => {
  for (const id of ['pernikahan-islami', 'khitanan-langit', 'tazkirah-nur', 'tarannum-nada', 'ulang_tahun-balon', 'karaoke-panggung', 'komunitas-kota']) {
    const view = buildView({ invitation: demoInvitation(id), scenes: demoScenes(id), query: {} });
    assert.ok(storyContent(view).items.length >= 2, `${id} kisah`);
    assert.ok(detailContent(view).events.length >= 1, `${id} detail`);
    assert.ok(galleryContent(view).images.length >= 3, `${id} galeri`);
  }
});
