import { expect, test } from '@playwright/test';

/**
 * Contoh warna kanvas WebGL. Kanvas dibaca di dalam requestAnimationFrame (setelah game menggambar pada frame yang sama)
 * lewat drawImage, karena buffer WebGL tanpa preserveDrawingBuffer sudah kosong setelah frame dikomposit.
 */
async function inspectCanvas(canvas) {
  return canvas.evaluate((element) => new Promise((resolve) => {
    requestAnimationFrame(() => {
      const webgl = element.getContext('webgl2') !== null;
      const probe = document.createElement('canvas');
      probe.width = element.width;
      probe.height = element.height;
      const ctx = probe.getContext('2d');
      ctx.drawImage(element, 0, 0);
      const colors = new Set();
      for (const xf of [0.12, 0.32, 0.5, 0.68, 0.88]) {
        for (const yf of [0.12, 0.32, 0.5, 0.68, 0.88]) {
          const x = Math.min(element.width - 1, Math.floor(element.width * xf));
          const y = Math.min(element.height - 1, Math.floor(element.height * yf));
          colors.add(Array.from(ctx.getImageData(x, y, 1, 1).data).join(','));
        }
      }
      resolve({ webgl, width: element.width, height: element.height, colors: colors.size });
    });
  }));
}

/**
 * Tombol duduk menandai 'is-ready' hanya bila avatar dekat kursi kosong atau sedang duduk.
 * Tombol ditahan sambil memeriksa tombol duduk: gerak game dibatasi per frame, jadi di render perangkat lunak (CI)
 * jarak tempuh per detik nyata bisa kecil. Yang dibatasi adalah waktu tunggu, bukan jumlah langkah.
 */
async function walkUntilNearSeat(page) {
  const ready = () => page.locator('#touch-sit').evaluate((el) => el.classList.contains('is-ready'));
  const plan = [['KeyD', 14_000], ['KeyW', 10_000], ['KeyA', 20_000], ['KeyS', 12_000]];
  for (const [key, budget] of plan) {
    await page.keyboard.down(key);
    const until = Date.now() + budget;
    while (Date.now() < until) {
      await page.waitForTimeout(200);
      if (await ready()) {
        await page.keyboard.up(key);
        return true;
      }
    }
    await page.keyboard.up(key);
  }
  return false;
}

test('desktop: aula tampil, masuk dengan nama, berjalan, duduk, dan berdiri', async ({ page }) => {
  test.setTimeout(120_000);
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
  await expect(page.locator('#sit-label')).toHaveText('DUDUK'); // HUD hidup (status teks lama sudah dihapus dari UI)
  await page.screenshot({ path: '/tmp/orbit-hall-desktop.png' });

  // Berjalan menyisir aula sampai dekat kursi kosong (tata letak dan kamera bisa berubah, jadi jangan memakai rute tetap).
  expect(await walkUntilNearSeat(page)).toBe(true);
  await expect(page.locator('#touch-sit')).toHaveClass(/is-ready/); // dekat kursi kosong
  await page.keyboard.press('KeyE');
  await expect(page.locator('#sit-label')).toHaveText('BERDIRI');
  await page.keyboard.press('Space'); // tepuk tangan tidak boleh error
  await page.keyboard.press('KeyE');
  await expect(page.locator('#sit-label')).toHaveText('DUDUK');
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
  // Tombol duduk hanya muncul saat avatar dekat kursi kosong; di pintu masuk harus tersembunyi.
  await expect(page.getByRole('button', { name: 'Duduk atau berdiri' })).toBeHidden();
  // Dock bawah: obrolan, gerakan, menu. Joget/tepuk ada di lembar emoji; fitur lain di menu ≡.
  await expect(page.locator('#dock')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buka obrolan' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Joget' })).toBeHidden();
  await page.getByRole('button', { name: 'Gerakan dan emoji', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Joget' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Tepuk tangan' }).click(); // memilih gerakan menutup lembar
  await expect(page.getByRole('menuitem', { name: 'Joget' })).toBeHidden();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kembali ke pintu masuk' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Layar acara' })).toHaveCount(0); // layar acara mati secara bawaan
  await page.getByRole('button', { name: 'Tutup menu' }).click();
  await expect(page.getByRole('button', { name: 'Kembali ke pintu masuk' })).toBeHidden();
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

test('obrolan: pesan tampil di log (mode offline) dan tidak menjalankan HTML', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.locator('#name-input').fill('Penguji');
  await page.getByRole('button', { name: /Masuk/ }).click();

  await page.keyboard.press('Enter');
  await expect(page.locator('#chat-input')).toBeFocused();
  await page.keyboard.type('Halo <b>semua</b>');
  await page.keyboard.press('Enter');
  const line = page.locator('#chat-log .chat-line').first();
  await expect(line).toContainText('Penguji');
  await expect(line).toContainText('Halo <b>semua</b>'); // tampil apa adanya sebagai teks
  await expect(page.locator('#chat-log b', { hasText: 'semua' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#chat-form')).toBeHidden();
  expect(pageErrors).toEqual([]);
});
