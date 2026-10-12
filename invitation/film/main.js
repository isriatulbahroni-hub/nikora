import { createWorld, DUR, N, TOTAL } from '../src/world3d/world.js';
import { DESIGNS } from '../src/world3d/designs.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const E = (t) => 1 - Math.pow(1 - t, 3);

await Promise.all(['58px GV', '600 17px Cin', '400 17px Cin', 'italic 500 14px Cor', '500 14px Cor'].map((f) => document.fonts.load(f, 'Rani & Dimas')));
const world = await createWorld({ width: 720, height: 1280, canvas: document.getElementById('cv') });

const caps = DESIGNS.map((d) => { const el = document.createElement('div'); el.className = 'cap'; el.innerHTML = `<b>${d.label}</b><i>${d.sub}</i>`; document.getElementById('caps').append(el); return el; });
const flash = document.getElementById('flash'), fade = document.getElementById('fade');
const o1 = document.querySelector('.o1'), o2 = document.querySelector('.o2');

function setFrame(t) {
  world.setTime(t);
  caps.forEach((el, i) => { const lt = t - i * DUR; el.style.opacity = (seg(lt, .3, .8) * (1 - seg(lt, 3.2, 3.6))).toFixed(3); el.style.transform = `translateY(${((1 - seg(lt, .3, .9)) * 12).toFixed(1)}px)`; });
  let f = 0; for (let k = 0; k < N; k++) { const tb = k * DUR + 3.97, p = seg(t, tb - .32, tb + .4); if (p > 0 && p < 1) f = Math.max(f, Math.sin(p * Math.PI) ** 1.4 * .92); }
  flash.style.opacity = f.toFixed(3);
  const to = t - N * DUR;
  fade.style.opacity = Math.max(1 - seg(t, 0, .7), seg(t, TOTAL - .8, TOTAL)).toFixed(3);
  o1.style.opacity = E(seg(to, .9, 1.8)).toFixed(3); o1.style.transform = `translateY(${((1 - E(seg(to, .9, 1.8))) * 14).toFixed(1)}px)`;
  o2.style.opacity = E(seg(to, 1.6, 2.4)).toFixed(3);
}
window.setFrame = setFrame; window.TOTAL = TOTAL; window.READY = true;
setFrame(0);
