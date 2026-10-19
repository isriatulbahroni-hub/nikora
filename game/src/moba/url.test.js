import test from 'node:test';
import assert from 'node:assert/strict';
import { MOBA_ORIGIN_DEFAULT, mobaServicesFromSearch, mobaUrl, normalizeLobbyCode, resolveMobaOrigin } from './url.js';
import moba from './index.js';

test('kode lobi: 5 huruf, dijadikan huruf besar; selain itu ditolak', () => {
  assert.equal(normalizeLobbyCode(' abcde '), 'ABCDE');
  for (const bad of ['abcd', 'abcdef', 'ab1de', '', null, undefined, 'ab de']) assert.equal(normalizeLobbyCode(bad), null);
});

test('origin: hanya https tanpa kredensial; selain itu kembali ke bawaan', () => {
  assert.equal(resolveMobaOrigin('https://moba.example.com/jalur?x=1'), 'https://moba.example.com');
  for (const bad of ['http://moba.example.com', 'javascript:alert(1)', 'https://u:p@moba.example.com', 'bukan url', undefined]) {
    assert.equal(resolveMobaOrigin(bad), MOBA_ORIGIN_DEFAULT);
  }
});

test('alamat MOBA: beranda, atau langsung ke lobi privat bila kodenya sah', () => {
  assert.equal(mobaUrl(undefined, undefined), `${MOBA_ORIGIN_DEFAULT}/`);
  assert.equal(mobaUrl('https://m.example.com', 'abcde'), 'https://m.example.com/?join=ABCDE');
  assert.equal(mobaUrl('https://m.example.com', 'abc"><'), 'https://m.example.com/');
});

function fakeDoc() {
  const made = [];
  return {
    made,
    createElement: (tag) => {
      const el = { tag, attrs: {}, style: {}, removed: false, setAttribute(k, v) { this.attrs[k] = v; }, remove() { this.removed = true; } };
      made.push(el);
      return el;
    },
  };
}

test('mode frame: memasang iframe ke alamat MOBA dan melepasnya saat ditutup', () => {
  const doc = fakeDoc();
  const children = [];
  const inst = moba.mount({ container: { appendChild: (c) => children.push(c) }, services: { doc, mobaOrigin: 'https://m.example.com', mobaLobbyCode: 'qwert' } });
  assert.equal(children.length, 1);
  assert.equal(children[0].tag, 'iframe');
  assert.equal(children[0].src, 'https://m.example.com/?join=QWERT');
  assert.match(children[0].attrs.sandbox, /allow-scripts/);
  inst.destroy();
  assert.equal(children[0].removed, true);
  assert.equal(children[0].src, 'about:blank');
});

test('mode tab: membuka tab baru lalu menutup layar permainan villa', async () => {
  const opened = [];
  let exited = null;
  const inst = moba.mount({ container: null, services: { mobaMode: 'tab', mobaOrigin: 'https://m.example.com', open: (u) => { opened.push(u); return {}; } }, exit: (r) => { exited = r; } });
  await Promise.resolve();
  assert.deepEqual(opened, ['https://m.example.com/']);
  assert.deepEqual(exited, { opened: 'tab' });
  inst.destroy();
});

test('mode tab: pop-up diblokir -> pemain diberi tahu', async () => {
  const notes = [];
  moba.mount({ container: null, notice: (m) => notes.push(m), exit: () => {}, services: { mobaMode: 'tab', open: () => null } });
  assert.equal(notes.length, 1);
});

test('opsi dari query halaman: kode lobi dan mode, nilai tidak sah diabaikan', () => {
  assert.deepEqual(mobaServicesFromSearch('?e=pesta-rina&moba=abcde&mobamode=TAB'), { mobaLobbyCode: 'ABCDE', mobaMode: 'tab' });
  assert.deepEqual(mobaServicesFromSearch('?mobamode=frame'), { mobaMode: 'frame' });
  assert.deepEqual(mobaServicesFromSearch('?moba=ab1de&mobamode=popup'), {});
  assert.deepEqual(mobaServicesFromSearch(''), {});
  assert.deepEqual(mobaServicesFromSearch(), {});
});
