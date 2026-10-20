// Bunyi "ting" lift saat tiba: dua nada lembut lewat WebAudio. AudioContext baru dibuat saat pertama kali dipanggil
// (setelah pemain menekan tombol lift), jadi tidak melanggar aturan autoplay browser.
let ctx = null;

export function playLiftChime(volume = 0.14) {
  try {
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) return false;
    ctx ??= new AC();
    if (ctx.state === 'suspended') ctx.resume?.();
    const t = ctx.currentTime;
    for (const [freq, delay] of [[1318.5, 0], [1046.5, 0.18]]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(volume, t + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 1.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 1.4);
    }
    return true;
  } catch {
    return false;
  }
}
