import test from 'node:test';
import assert from 'node:assert/strict';
import { groupNumber, cardModel, fit, CARD } from '../src/world3d/card-art.js';

test('kartu mengikuti ukuran ID-1 (85,6 x 53,98 mm)', () => {
  assert.equal(CARD.W, 85.6); assert.equal(CARD.H, 53.98);
  assert.ok(Math.abs(CARD.W / CARD.H - 1.5858) < 1e-3);
});

test('groupNumber: angka murni 8-19 digit dikelompokkan 4, selain itu apa adanya', () => {
  assert.equal(groupNumber('0123456789'), '0123 4567 89');
  assert.equal(groupNumber('1234 5678 9012 3456'), '1234 5678 9012 3456');
  assert.equal(groupNumber('1234-5678-9012'), '1234 5678 9012');
  assert.equal(groupNumber('081234567890'), '0812 3456 7890');
  assert.equal(groupNumber('1234567'), '1234567');            // terlalu pendek: biarkan
  assert.equal(groupNumber('ABC-123'), 'ABC-123');
  assert.equal(groupNumber('1'.repeat(25)), '1'.repeat(25));  // terlalu panjang: biarkan
  assert.equal(groupNumber(null), '');
  assert.equal(groupNumber('   '), '');
});

test('cardModel: bank, dompet digital, QRIS, dan isian kosong/rusak', () => {
  const b = cardModel({ kind: 'bank', label: 'bca', accountName: 'Dimas Pratama', accountNo: '0123456789' });
  assert.equal(b.bank, 'BCA'); assert.equal(b.tier, 'TANDA KASIH'); assert.equal(b.number, '0123 4567 89'); assert.equal(b.raw, '0123456789');
  assert.equal(b.holderUpper, 'DIMAS PRATAMA'); assert.match(b.aria, /atas nama Dimas Pratama.*nomor 0123456789/);
  assert.equal(cardModel({ kind: 'ewallet', label: 'GoPay', accountNo: '081234567890' }).tier, 'DOMPET DIGITAL');
  const q = cardModel({ kind: 'qris', label: 'QRIS' });
  assert.equal(q.tier, 'QRIS'); assert.equal(q.number, 'QRIS'); assert.equal(q.raw, '');
  const empty = cardModel({});
  assert.equal(empty.label, 'Hadiah'); assert.equal(empty.number, '•••• •••• ••••'); assert.equal(empty.holderUpper, '');
  assert.equal(cardModel({ kind: 'sembarang' }).kind, 'bank');
});

test('cardModel: teks dibersihkan dan dibatasi (nama bank <= 22, pemilik <= 30 pada kartu)', () => {
  const m = cardModel({ label: 'Bank\n<b>Sangat</b>   Panjang Sekali Namanya Lho', accountName: 'X'.repeat(200), accountNo: '12\u0000 34' });
  assert.ok(m.bank.length <= 22); assert.ok(m.holderUpper.length <= 30); assert.ok(!/[\u0000-\u001f]/.test(m.raw + m.label));
  assert.equal(m.raw, '12 34');
});

test('fit: mengecil hanya bila perlu dan tidak kurang dari batas bawah', () => {
  const at = (n) => (b) => n * b;
  assert.equal(fit(at(2), 100, 300), 100);
  assert.ok(Math.abs(fit(at(10), 100, 500) - 50) < 1e-9);
  assert.equal(fit(at(1000), 100, 100, 40), 40);
});
