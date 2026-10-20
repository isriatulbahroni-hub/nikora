import { expect, test } from '@playwright/test';

// Pusat kabin lift (sama dengan LIFT di src/villa-lift.js) dan tinggi antar lantai.
const CAB = { x: 24.3, z: -18.55 };
const LEVEL_HEIGHT = 3.4;

/**
 * Lift villa: panel lantai muncul hanya di dalam kabin, perjalanan mengikuti jadwal (tutup pintu, naik, buka pintu),
 * tidak bisa dibatalkan di tengah jalan, dan pemain tiba berdiri di lantai tujuan. Mode offline (tanpa server).
 * Waktu perjalanan memakai jam dinding, jadi lambatnya render perangkat lunak di CI tidak mengubah jadwalnya.
 */
test('lift villa: panel hanya di kabin, naik ke lantai 3, kembali dengan tombol keyboard', async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/villa.html?q=low');
  await page.waitForFunction(() => Boolean(window.__villa), null, { timeout: 30_000 });

  const state = () => page.evaluate(() => window.__villa.state());
  const panel = page.locator('#lift-panel');

  // Di depan pintu kabin (di luar poros): panel lantai tidak muncul.
  await page.evaluate(([x, z]) => window.__villa.teleport(x, z + 3.5, 0), [CAB.x, CAB.z]);
  await expect.poll(async () => (await state()).level, { timeout: 15_000 }).toBe(0);
  await expect(panel).toBeHidden();

  // Di dalam kabin: panel muncul, lantai 1 (lantai sekarang) nonaktif, lantai 3 bisa dipilih.
  await page.evaluate(([x, z]) => window.__villa.teleport(x, z, 0), [CAB.x, CAB.z]);
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel).toContainText('Kamu di lantai 1');
  await expect(page.getByRole('button', { name: 'Ke lantai 1' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ke lantai 3' })).toBeEnabled();

  // Naik ke lantai 3: perjalanan dimulai, ketinggian bertambah, lift sibuk.
  await page.getByRole('button', { name: 'Ke lantai 3' }).click();
  await expect.poll(async () => (await state()).lift.riding, { timeout: 10_000 }).toBe(2);
  await expect(panel).toBeHidden(); // panel disembunyikan selama perjalanan

  // Di tengah perjalanan tombol aksi (E) tidak membatalkan perjalanan.
  await page.keyboard.press('KeyE');
  expect((await state()).lift.riding).toBe(2);

  await expect.poll(async () => (await state()).y, { timeout: 20_000 }).toBeGreaterThan(LEVEL_HEIGHT);

  // Tiba: berdiri di lantai 3, perjalanan selesai, lift kembali bebas, panel muncul lagi.
  await expect.poll(async () => (await state()).lift.riding, { timeout: 30_000 }).toBeNull();
  const arrived = await state();
  expect(arrived.level).toBe(2);
  expect(arrived.y).toBeCloseTo(LEVEL_HEIGHT * 2, 1);
  expect(arrived.seat).toBeNull();
  await expect.poll(async () => (await state()).lift.idle, { timeout: 15_000 }).toBe(true);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Kamu di lantai 3');
  await expect(page.getByRole('button', { name: 'Ke lantai 3' })).toBeDisabled();

  // Kembali ke lantai 1 dengan tombol keyboard 1.
  await page.keyboard.press('Digit1');
  await expect.poll(async () => (await state()).lift.riding, { timeout: 10_000 }).toBe(0);
  await expect.poll(async () => (await state()).lift.riding, { timeout: 30_000 }).toBeNull();
  const back = await state();
  expect(back.level).toBe(0);
  expect(back.y).toBeCloseTo(0, 1);
  expect(back.seat).toBeNull();

  expect(pageErrors).toEqual([]);
});
