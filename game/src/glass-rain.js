// Hujan di kaca (kanvas 2D, tanpa THREE, diuji di Node): tetes di kaca depan mobil dengan wiper (tampak dari kabin), dan tetes di lensa kamera
// saat berdiri di bawah langit terbuka (efek 4D). Koordinat tetes dinormalkan 0..1 supaya aman saat layar berputar; digambar rain-boot.js.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Poros wiper (pecahan layar), panjang bilah (pecahan tinggi layar), dan sudut sapuan (rad dari tegak lurus ke kiri dan kanan). */
export const WIPER = Object.freeze({ pivotX: 0.5, pivotY: 0.98, reach: 0.74, sweep: 1.1 });
const MODES = Object.freeze(['auto', 'on', 'off']);
const MAX_GLASS = 160;
const MAX_LENS = 8;

export function createGlass({ random = Math.random } = {}) {
  const drops = [];
  let mode = 'auto';
  let phase = -1; // -1 = bilah parkir; 0..1 = sedang menyapu (pergi lalu pulang)
  let rest = 0; // jeda antar sapuan (detik)
  let angle = -WIPER.sweep;
  let acc = 0;
  let wasCabin = false;

  const wants = (L, cabin) => cabin && (mode === 'on' || (mode === 'auto' && L > 0.06));
  const glassDrop = () => ({ kind: 'glass', x: random(), y: 0.04 + random() * 0.58, r: 1.4 + 7 * random() ** 2.2, age: 0, life: Infinity });
  const lensDrop = () => ({ kind: 'lens', x: random(), y: 0.1 + random() * 0.8, r: 5 + 11 * random(), age: 0, life: 3.5 + 3 * random() });

  function wipe(from, to, view) {
    const lo = Math.min(from, to) - 0.03;
    const hi = Math.max(from, to) + 0.03;
    const px = WIPER.pivotX * view.w;
    const py = WIPER.pivotY * view.h;
    const reach = WIPER.reach * view.h;
    for (let i = drops.length - 1; i >= 0; i--) {
      const dx = drops[i].x * view.w - px;
      const dy = drops[i].y * view.h - py;
      if (Math.hypot(dx, dy) > reach) continue;
      const th = Math.atan2(dx, -dy); // 0 = lurus ke atas, positif = ke kanan
      if (th >= lo && th <= hi) drops.splice(i, 1);
    }
  }

  return {
    /** Tiap frame. cabin = kamera kabin; exposed = langit terbuka dan bukan kabin; speed = m/s; view = ukuran layar (piksel). */
    step(dt, { level = 0, cabin = false, exposed = false, speed = 0, lens = true, view = { w: 400, h: 800 } } = {}) {
      const d = clamp(Number(dt) || 0, 0, 0.1);
      const L = clamp(Number(level) || 0, 0, 1);
      if (cabin !== wasCabin) {
        drops.length = 0; // pindah kamera: kaca depan dan lensa tidak saling membawa tetes
        acc = 0;
        wasCabin = cabin;
        phase = -1;
        rest = 0;
        angle = -WIPER.sweep;
      }
      if (cabin) {
        if (L > 0.01) {
          acc += d * 85 * L ** 1.25 * (1 + clamp(speed / 30, 0, 1) * 0.6);
          while (acc >= 1) {
            acc -= 1;
            if (drops.length < MAX_GLASS) drops.push(glassDrop());
          }
        } else acc = 0;
      } else if (exposed && lens && L > 0.5) {
        acc += d * 0.9 * L * L;
        while (acc >= 1) {
          acc -= 1;
          if (drops.length < MAX_LENS) drops.push(lensDrop());
        }
      } else acc = 0;

      const blow = clamp(speed / 38, 0, 1); // kecepatan mobil meniup tetes ke atas dan menyamping
      for (let i = drops.length - 1; i >= 0; i--) {
        const p = drops[i];
        p.age += d;
        if (p.kind === 'lens') {
          if (p.age > p.life) drops.splice(i, 1);
          continue;
        }
        const slide = p.r > 4.6 ? (p.r - 4.6) / 5 : 0; // tetes besar meluncur turun
        p.y += (slide * 0.05 - blow * (p.r > 3 ? 0.035 : 0.06)) * d;
        p.x += blow * 0.02 * d * (0.5 + p.r / 8);
        if (p.y > 0.66 || p.y < 0.01 || p.x > 1.02 || (L < 0.02 && random() < d * 0.3)) drops.splice(i, 1);
      }

      if (cabin) {
        const prev = angle;
        if (phase < 0) {
          rest -= d;
          if (rest <= 0 && wants(L, cabin)) {
            phase = 0;
            angle = -WIPER.sweep;
          }
        }
        if (phase >= 0) {
          phase += d / (L > 0.6 ? 1.1 : 1.7);
          if (phase >= 1) {
            phase = -1;
            rest = L > 0.6 ? 0.2 : 2.2;
            angle = -WIPER.sweep;
          } else {
            angle = (phase < 0.5 ? -1 + phase * 4 : 1 - (phase - 0.5) * 4) * WIPER.sweep;
            wipe(prev, angle, view);
          }
        }
      }
    },
    /** Gambar tetes dan bilah wiper di ctx (sudah dalam piksel CSS). */
    draw(ctx, W, H) {
      const sc = clamp(H / 820, 0.6, 1.4);
      for (const p of drops) {
        const a = p.kind === 'lens' ? clamp(1 - p.age / p.life, 0, 1) * Math.min(1, p.age * 4) : 1;
        if (a <= 0.01) continue;
        const x = p.x * W;
        const y = p.y * H;
        const r = p.r * sc;
        ctx.fillStyle = `rgba(170,195,220,${(0.17 * a).toFixed(3)})`;
        ctx.strokeStyle = `rgba(235,245,255,${(0.42 * a).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.85, r * 1.05, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${(0.5 * a).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x - r * 0.3, y - r * 0.35, Math.max(0.8, r * 0.22), 0, Math.PI * 2);
        ctx.fill();
      }
      if (phase >= 0) {
        const px = WIPER.pivotX * W;
        const py = WIPER.pivotY * H;
        const len = WIPER.reach * H;
        const tx = px + Math.sin(angle) * len;
        const ty = py - Math.cos(angle) * len;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(14,14,16,0.92)';
        ctx.lineWidth = 6 * sc;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(90,90,96,0.7)';
        ctx.lineWidth = 2 * sc;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + (tx - px) * 0.42, py + (ty - py) * 0.42);
        ctx.stroke();
      }
    },
    active: () => drops.length > 0 || phase >= 0,
    clear() {
      drops.length = 0;
      phase = -1;
    },
    info: () => ({ drops: drops.length, phase, mode, angle }),
    wiper: {
      mode: () => mode,
      setMode(m) {
        if (MODES.includes(m)) mode = m;
      },
      cycle() {
        mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
        return mode;
      },
    },
  };
}
