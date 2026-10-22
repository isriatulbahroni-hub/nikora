// Kualitas grafis adaptif: bila bingkai per detik turun (HP berat, apalagi saat video diputar), resolusi render
// diturunkan bertahap sampai lancar; naik lagi pelan-pelan bila perangkat sanggup.
const FAST_MS = 14.5; // < ~69 fps: boleh naik
const SLOW_MS = 24; // > ~41 fps: turun
export const TIER_COUNT = 4;

export function settingsFor(tier, deviceRatio, cap) {
  const base = Math.min(deviceRatio || 1, cap);
  const ratio = [base, Math.min(base, 1.25), Math.min(base, 1), Math.min(base, 0.75)][tier];
  return { tier, ratio, shadows: tier < 3 };
}

/** maxTier: tingkat terendah yang boleh dipakai (bawaan: semua tingkat). Hotel memakai 2 supaya resolusi tidak jatuh di bawah 1x dan fasad tidak jadi buram atau bergerigi. */
export function createQualityGovernor({ deviceRatio = 1, cap = 1.75, floor = 0, maxTier = TIER_COUNT - 1 } = {}) {
  const worst = Math.max(floor, Math.min(TIER_COUNT - 1, maxTier | 0));
  let tier = floor;
  let minTier = floor;
  let ema = 16.7;
  let last = null;
  let frames = 0;
  let lastChange = -Infinity;
  let goodChecks = 0;
  const result = () => settingsFor(tier, deviceRatio, cap);
  return {
    get tier() { return tier; },
    settings: result,
    /** Batas bawah kualitas (mis. naik ke 1 saat video diputar). Mengembalikan pengaturan baru bila tier berubah. */
    setFloor(n) {
      minTier = Math.max(0, Math.min(worst, n | 0));
      if (tier < minTier) { tier = minTier; return result(); }
      return null;
    },
    /** Panggil sekali per bingkai dengan waktu (ms). Mengembalikan pengaturan baru bila perlu diubah, selain itu null. */
    tick(nowMs) {
      if (last === null) { last = nowMs; return null; }
      const dt = nowMs - last;
      last = nowMs;
      if (dt <= 0 || dt > 250) return null; // tab tersembunyi / hentakan sesaat: abaikan
      ema = ema * 0.94 + dt * 0.06;
      if (++frames % 30 !== 0) return null;
      if (ema > SLOW_MS && tier < worst && nowMs - lastChange > 2000) {
        tier += 1; lastChange = nowMs; goodChecks = 0;
        return result();
      }
      if (ema < FAST_MS && tier > minTier) {
        goodChecks += 1;
        if (goodChecks >= 8 && nowMs - lastChange > 10000) { tier -= 1; lastChange = nowMs; goodChecks = 0; return result(); }
      } else goodChecks = 0;
      return null;
    },
  };
}
