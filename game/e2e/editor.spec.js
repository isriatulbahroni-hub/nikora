import { expect, test } from '@playwright/test';
import fs from 'node:fs';

// Studio Dunia (Fase 9.1) di browser ponsel. Render perangkat lunak (CI) lambat, jadi pengujian gerak
// menunggu sampai pemain tiba, bukan waktu tetap.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });

async function openEditor(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/editor.html?debug=1');
  await page.waitForFunction(() => window.__editor && window.__project);
  await page.evaluate(() => { localStorage.clear(); window.__editor.applyTemplate('kosong'); });
  return errors;
}

test('menaruh dengan ketukan, menyeret, satu seretan = satu undo, alat putar/duplikat/hapus', async ({ page }) => {
  const errors = await openEditor(page);
  await page.click('[data-tool=table]');
  const at = await page.evaluate(() => window.__project(0, 8));
  await page.touchscreen.tap(at.x, at.y);
  const placed = await page.evaluate(() => window.__editor.project.props);
  expect(placed).toHaveLength(1);
  expect(placed[0]).toMatchObject({ type: 'table', x: 0, z: 8 });

  await page.click('[data-tool=select]');
  const from = await page.evaluate(([x, z]) => window.__project(x, z), [placed[0].x, placed[0].z]);
  const to = await page.evaluate(() => window.__project(6, 12));
  await page.mouse.move(from.x, from.y - 8);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y - 8 + ((to.y - from.y) * i) / 10);
  await page.mouse.up();
  const moved = await page.evaluate(() => window.__editor.project.props[0]);
  expect(Math.abs(moved.x - 6)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(moved.z - 12)).toBeLessThanOrEqual(1.5);

  await page.click('#undo');
  expect(await page.evaluate(() => window.__editor.project.props[0])).toMatchObject({ x: 0, z: 8 });
  await page.click('#redo');
  expect(await page.evaluate(() => window.__editor.project.props[0].x)).toBe(moved.x);

  await page.evaluate(() => window.__editor.select(window.__editor.project.props[0].id));
  await page.click('#rot');
  expect(await page.evaluate(() => window.__editor.project.props[0].rot)).toBe(1);
  await page.click('#dup');
  expect(await page.evaluate(() => window.__editor.project.props.length)).toBe(2);
  await page.click('#del');
  expect(await page.evaluate(() => window.__editor.project.props.length)).toBe(1);
  expect(errors).toEqual([]);
});

test('simpan ke berkas, buka kembali, dan berkas jahat ditolak tanpa merusak proyek', async ({ page }, info) => {
  await openEditor(page);
  await page.evaluate(() => window.__editor.place('sofa', 4, 4));
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => localStorage.getItem('orbit.worldeditor.draft.v1'))).toContain('orbit.world');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save')]);
  const file = info.outputPath('dunia.json');
  await download.saveAs(file);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(saved.format).toBe('orbit.world');
  expect(saved.props).toHaveLength(1);

  await page.evaluate(() => window.__editor.remove(window.__editor.project.props[0].id));
  await page.setInputFiles('#file', file);
  await expect.poll(() => page.evaluate(() => window.__editor.project.props.length)).toBe(1);

  const evil = info.outputPath('jahat.json');
  fs.writeFileSync(evil, JSON.stringify({ format: 'orbit.world', version: 1, name: 'x', area: { halfX: 20, halfZ: 20 }, spawn: { x: 0, z: 10 }, props: [{ type: '__proto__', x: 0, z: 0 }] }));
  await page.setInputFiles('#file', evil);
  await expect(page.locator('#toast')).toContainText('Tidak bisa dibuka');
  expect(await page.evaluate(() => window.__editor.project.props.length)).toBe(1);
});

test('uji jalan: dinding aula menahan pemain; dunia dengan galat tidak bisa diuji', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await openEditor(page);
  await page.evaluate(() => window.__editor.applyTemplate('aula'));
  await page.click('#play');
  await expect(page.locator('body')).toHaveClass(/play/);

  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__pos().x > 19, null, { timeout: 120_000 });
  await page.waitForTimeout(1500); // beri kesempatan menembus dinding bila bisa
  await page.keyboard.up('ArrowRight');
  const east = await page.evaluate(() => window.__pos());
  expect(east.x).toBeGreaterThan(18.5);
  expect(east.x).toBeLessThan(19.5); // dinding timur: 20 - 0,15 - radius 0,4 = 19,45

  await page.keyboard.down('ArrowDown');
  await page.waitForFunction(() => window.__pos().z > 17, null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowDown');
  expect((await page.evaluate(() => window.__pos())).z).toBeLessThan(17.5); // dinding selatan: 18 - 0,15 - 0,4 = 17,45

  await page.click('#play');
  await expect(page.locator('body')).not.toHaveClass(/play/);

  await page.evaluate(() => { window.__editor.applyTemplate('kosong'); window.__editor.place('table', 0, 22); }); // menutup titik mulai
  await page.click('#play');
  await expect(page.locator('body')).not.toHaveClass(/play/);
  await expect(page.locator('#issues')).toHaveClass(/show/);
  expect(errors).toEqual([]);
});
