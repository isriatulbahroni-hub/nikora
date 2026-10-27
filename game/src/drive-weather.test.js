import test from 'node:test';
import assert from 'node:assert/strict';
import { DRIZZLE, EPOCH_MS, FADE_IN_MS, createWeather, hash01, manualFromSearch, manualStorm, nextStorm, stormIn, stormLevel, weatherAt } from './drive-weather.js';

const firstStormEpoch = () => {
  for (let e = 1000; e < 1200; e++) if (stormIn(e)) return e;
  throw new Error('tidak ada hujan di 200 periode');
};

test('hash01: tetap untuk masukan yang sama, 0..1, dan tersebar', () => {
  assert.equal(hash01(5, 2), hash01(5, 2));
  let lo = 1;
  let hi = 0;
  for (let i = 0; i < 500; i++) {
    const v = hash01(i, 0);
    assert.ok(v >= 0 && v < 1);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  assert.ok(lo < 0.1 && hi > 0.9);
});

test('stormIn: sekitar separuh periode berhujan, selalu di dalam periodenya, durasi 12-35 menit', () => {
  let rainy = 0;
  for (let e = 0; e < 2000; e++) {
    const s = stormIn(e);
    if (!s) continue;
    rainy++;
    assert.ok(s.start >= e * EPOCH_MS && s.end <= (e + 1) * EPOCH_MS, `periode ${e}`);
    const min = (s.end - s.start) / 60000;
    assert.ok(min >= 12 - 1e-9 && min <= 35 + 1e-9);
    assert.ok(s.peak >= 0.45 && s.peak <= 1);
    assert.ok(s.rise >= 0.6 && s.rise <= 0.8);
  }
  assert.ok(rainy > 850 && rainy < 1150, `hujan ${rainy}/2000`);
});

test('stormLevel: mulai dari gerimis, makin lama makin deras, puncak, lalu reda ke 0 (halus, tanpa lompatan)', () => {
  const st = { start: 0, end: 30 * 60000, peak: 0.9, rise: 0.7 };
  assert.equal(stormLevel(st, -1), 0);
  assert.equal(stormLevel(st, st.end), 0);
  assert.ok(stormLevel(st, 1000) < DRIZZLE); // detik pertama: baru mulai
  const afterFade = stormLevel(st, FADE_IN_MS + 1);
  assert.ok(afterFade > 0.1 && afterFade < 0.2, `gerimis ${afterFade}`);
  let prev = 0;
  let max = 0;
  for (let t = FADE_IN_MS; t <= st.end * st.rise; t += 5000) {
    const v = stormLevel(st, t);
    assert.ok(v >= prev - 1e-9, 'naik terus sampai puncak');
    prev = v;
    max = Math.max(max, v);
  }
  assert.ok(Math.abs(stormLevel(st, st.end * st.rise) - 0.9) < 1e-9);
  assert.ok(stormLevel(st, st.end * 0.35) > stormLevel(st, st.end * 0.05));
  let last = stormLevel(st, st.end * 0.7);
  for (let t = st.end * 0.7; t < st.end; t += 5000) {
    const v = stormLevel(st, t);
    assert.ok(v <= last + 1e-9, 'reda terus');
    last = v;
  }
  let step = 0; // tidak ada lompatan antar sampel 1 dtk
  for (let t = 0; t < st.end - 1000; t += 1000) step = Math.max(step, Math.abs(stormLevel(st, t + 1000) - stormLevel(st, t)));
  assert.ok(step < 0.05, `lompatan ${step}`);
});

test('weatherAt: hujan tiba-tiba di luar dugaan (jam tidak teratur) dan sama untuk semua pemain', () => {
  const e = firstStormEpoch();
  const s = stormIn(e);
  assert.equal(weatherAt(s.start - 1000), 0);
  assert.ok(weatherAt(s.start + 60000) > 0);
  assert.equal(weatherAt(s.start + 60000), weatherAt(s.start + 60000));
  const starts = [];
  for (let k = 0; k < 40; k++) {
    const x = stormIn(e + k);
    if (x) starts.push(Math.round(((x.start - (e + k) * EPOCH_MS) / 60000)));
  }
  assert.ok(new Set(starts).size > 5, 'menit mulai berbeda-beda');
});

test('nextStorm: menemukan hujan berikutnya', () => {
  const e = firstStormEpoch();
  const s = stormIn(e);
  const n = nextStorm(s.start - 1);
  assert.equal(n.start, s.start);
  assert.ok(nextStorm(s.end + 1).start > s.end);
});

test('manualFromSearch dan manualStorm', () => {
  assert.equal(manualFromSearch(''), null);
  assert.equal(manualFromSearch('?hujan=0'), null);
  assert.equal(manualFromSearch('?hujan=abc'), null);
  assert.equal(manualFromSearch('?hujan=1'), 0.85);
  assert.equal(manualFromSearch('?hujan=0.5'), 0.5);
  assert.equal(manualFromSearch('?hujan=0.01'), 0.15);
  const m = manualStorm(1000, 0.9);
  assert.equal(m.start, 1000);
  assert.ok(m.end > m.start);
});

test('createWeather: tombol mulai = gerimis lalu deras; calm = reda dan tidak hujan acak selama 15 menit; ?cuaca=0 mematikan hujan acak', () => {
  let t = 5e12;
  const now = () => t;
  const w = createWeather({ now });
  const e = Math.floor(t / EPOCH_MS);
  assert.equal(w.random, true);
  w.start(0.9);
  t += 30000;
  const early = w.intensity();
  assert.ok(early > 0.1 && early < 0.25, `awal ${early}`);
  t += 10 * 60000;
  assert.ok(w.intensity() > early, 'makin deras');
  w.calm();
  assert.equal(w.intensity(), 0);
  t += 14 * 60000;
  assert.equal(w.intensity(), 0);
  void e;

  const off = createWeather({ search: '?cuaca=0', now: () => stormIn(firstStormEpoch()).start + 5 * 60000 });
  assert.equal(off.random, false);
  assert.equal(off.intensity(), 0);

  const s = stormIn(firstStormEpoch());
  const live = createWeather({ now: () => s.start + 10 * 60000 });
  assert.ok(live.intensity() > 0, 'hujan acak dari jadwal');
  live.setFixed(0.33);
  assert.equal(live.intensity(), 0.33);
  live.setFixed(null);
  assert.ok(live.intensity() > 0.14);
});

test('createWeather ?cuaca=cepat: waktu 30x lebih cepat; ?hujan=1 langsung gerimis', () => {
  let t = 7e12;
  const fast = createWeather({ search: '?cuaca=cepat', now: () => t });
  assert.equal(fast.speed, 30);
  const c0 = fast.clock();
  t += 1000;
  assert.equal(fast.clock() - c0, 30000);
  const n = fast.next();
  assert.ok(n && n.startsInMs >= 0 && n.peak >= 0.45);
  const instant = createWeather({ search: '?hujan=1', now: () => t });
  t += 25000;
  const v = instant.intensity();
  assert.ok(v > 0.1 && v < 0.2, `awal ${v}`);
});
