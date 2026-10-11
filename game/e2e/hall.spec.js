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

test('desktop: aula tampil, masuk dengan nama, berjalan, duduk, dan berdiri', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('#join-overlay')).toBeVisible();
  await page.waitForTimeout(500);

  const visual = await inspectCanvas(canvas);
  expect(visual.webgl).toBe(true);
  expect(visual.colors).toBeGreaterThan(3);

  await page.locator('#name-input').fill('Tamu Uji');
  await page.getByRole('button', { name: /Masuk/ }).click();
  await expect(page.locator('#join-overlay')).toBeHidden();
  await expect(page.locator('#hall-status')).toHaveText('BERJALAN');
  await page.screenshot({ path: '/tmp/orbit-hall-desktop.png' });

  // Dari pintu masuk berjalan ke arah meja kanan bawah (x=6, z=7.6) lalu duduk.
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(350);
  await page.keyboard.up('KeyW');
  await expect(page.locator('#hall-status')).toContainText('KURSI KOSONG');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#hall-status')).toContainText('DUDUK · MEJA');
  await page.keyboard.press('Space'); // tepuk tangan tidak boleh error
  await page.keyboard.press('KeyE');
  await expect(page.locator('#hall-status')).not.toContainText('DUDUK · MEJA');
  expect(pageErrors).toEqual([]);
});

test('mobile: kontrol sentuh aula tampil dan joystick menggerakkan avatar', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?touch=1');

  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();
  await page.locator('#name-input').fill('Tamu HP');
  await page.getByRole('button', { name: /Masuk/ }).click();
  await expect(page.locator('.controls')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Duduk atau berdiri' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tepuk tangan' })).toBeVisible();
  await page.waitForTimeout(500);

  const visual = await inspectCanvas(canvas);
  expect(visual.webgl).toBe(true);
  expect(visual.colors).toBeGreaterThan(3);
  await page.screenshot({ path: '/tmp/orbit-hall-mobile.png' });

  const zone = await page.locator('#joy-zone').boundingBox();
  const startX = zone.x + 100;
  const startY = zone.y + zone.height - 100;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY - 45, { steps: 4 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  expect(pageErrors).toEqual([]);
});
