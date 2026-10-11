import { expect, test } from '@playwright/test';

async function inspectCanvas(canvas) {
  return canvas.evaluate((element) => {
    const gl = element.getContext('webgl2');
    if (!gl) return { webgl: false, width: element.width, height: element.height, colors: 0 };

    gl.finish();
    const colors = new Set();
    const pixel = new Uint8Array(4);
    const fractions = [0.12, 0.32, 0.5, 0.68, 0.88];
    for (const xFraction of fractions) {
      for (const yFraction of fractions) {
        const x = Math.min(element.width - 1, Math.floor(element.width * xFraction));
        const y = Math.min(element.height - 1, Math.floor(element.height * yFraction));
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        colors.add(`${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3]}`);
      }
    }
    return { webgl: true, width: element.width, height: element.height, colors: colors.size };
  });
}

test('desktop arena renders, resolves an offline match, and restarts', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('#match-status')).toHaveText('READY');
  await page.waitForTimeout(500);

  const visual = await inspectCanvas(canvas);
  expect(visual.webgl).toBe(true);
  expect(visual.width).toBeGreaterThan(900);
  expect(visual.height).toBeGreaterThan(500);
  expect(visual.colors).toBeGreaterThan(3);
  await page.screenshot({ path: '/tmp/orbit-game-desktop.png' });

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1_300);
  await page.keyboard.up('KeyW');
  for (let hit = 0; hit < 5; hit += 1) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(520);
  }

  await expect(page.locator('#result-overlay')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#result-title')).toHaveText('Victory');
  await expect(page.locator('#enemy-health-label')).toHaveText('0');
  await page.locator('#play-again-button').click();
  await expect(page.locator('#result-overlay')).toBeHidden();
  await expect(page.locator('#match-status')).toHaveText('READY');
  await expect(page.locator('#player-health-label')).toHaveText('100');
  expect(pageErrors).toEqual([]);
});

test('mobile viewport renders the arena and touch controls start play', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.touch-controls')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Serang' })).toBeVisible();
  await page.waitForTimeout(500);

  const visual = await inspectCanvas(canvas);
  expect(visual.webgl).toBe(true);
  expect(visual.width).toBeGreaterThan(300);
  expect(visual.height).toBeGreaterThan(700);
  expect(visual.colors).toBeGreaterThan(3);
  await page.screenshot({ path: '/tmp/orbit-game-mobile.png' });

  const upButton = page.locator('[data-direction="up"]');
  const bounds = await upButton.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect(page.locator('#match-status')).toHaveText('FIGHT');
  await page.waitForTimeout(250);
  await page.mouse.up();
  expect(pageErrors).toEqual([]);
});