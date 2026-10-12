// Render deterministik: node film/render.mjs <awal> <akhir> [fps]. Melewati frame yang sudah ada.
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const [a, b] = [Number(process.argv[2]), Number(process.argv[3])];
const FPS = Number(process.argv[4] || 24), OUT = '/tmp/frames';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:5174/film/film.html');
await page.waitForFunction('window.READY===true', null, { timeout: 120000 });
const total = await page.evaluate('window.TOTAL'), frames = Math.ceil(total * FPS);
const start = Date.now(); let done = 0;
for (let f = a; f <= Math.min(b, frames - 1); f++) {
  const file = `${OUT}/${String(f).padStart(5, '0')}.jpg`;
  if (fs.existsSync(file)) continue;
  await page.evaluate(t => setFrame(t), f / FPS);
  await page.screenshot({ path: file, type: 'jpeg', quality: 93 });
  done++;
}
console.log(`frame ${a}-${b} selesai (${done} baru, ${((Date.now() - start) / 1000 / Math.max(1, done)).toFixed(2)} dtk/frame); total frame film = ${frames}; galat: ${errs.length ? errs : 'tidak ada'}`);
await browser.close();
