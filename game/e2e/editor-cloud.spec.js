import { expect, test } from '@playwright/test';
import { createMock } from './support/mock-supabase.js';

// Menguji SAMBUNGAN UI + klien awan memakai tiruan Supabase (lihat support/mock-supabase.js). Aturan izin database asli
// dibuktikan terpisah pada database nyata; di sini yang diperiksa: tombol yang muncul, status, pesan, dan mode tinjau.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
test.describe.configure({ timeout: 150_000 }); // render perangkat lunak (CI) lambat; dua konteks browser per tes

async function openPage(browser, mock) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Melanggar kebijakan' : undefined));
  await page.addInitScript(() => { window.__ORBIT_NO_RENDER__ = true; }); // tes ini non-visual: hemat CPU
  await mock.attach(page);
  await page.goto('/editor.html?debug=1');
  await page.waitForFunction(() => window.__editor);
  await page.evaluate(() => localStorage.clear());
  return { page, context, errors };
}
async function login(page, email, password = 'rahasia1') {
  await page.click('#cloudBtn');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Kata sandi').fill(password);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
}

test('pemilik: masuk, simpan versi, ajukan, batal; dunia berisi galat tidak bisa diajukan; nama berbahaya tampil sebagai teks', async ({ browser }) => {
  const mock = createMock();
  mock.addUser('rani@example.test', 'rahasia1');
  const { page, context, errors } = await openPage(browser, mock);

  await page.click('#cloudBtn');
  await page.getByLabel('Email').fill('rani@example.test');
  await page.getByLabel('Kata sandi').fill('salah-sandi');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.locator('#cloud small.msg')).toContainText('Email atau kata sandi salah');
  await page.getByLabel('Kata sandi').fill('rahasia1');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.locator('#cloudSave')).toBeVisible();

  // nama berbahaya: harus tampil sebagai teks, tidak dieksekusi
  await page.evaluate(() => window.__editor.rename('<img src=x onerror=window.__pwn=1>'));
  await page.click('#cloudSave');
  await expect(page.locator('[data-project]')).toHaveCount(1);
  await expect(page.locator('[data-project] strong')).toHaveText('<img src=x onerror=window.__pwn=1>');
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  await expect(page.locator('[data-project] .st').first()).toContainText('Draf · v1');
  await expect(page.locator('#cloudState')).toContainText('☁');

  // ajukan versi 1
  await page.getByRole('button', { name: 'Versi', exact: true }).click();
  await page.locator('[data-submit="1"]').click();
  await expect(page.locator('[data-project] .st').first()).toContainText('Sedang ditinjau');
  await page.getByRole('button', { name: 'Batal ajukan' }).click();
  await expect(page.locator('[data-project] .st').first()).toContainText('Draf');

  // versi 2 berisi galat (titik mulai tertutup): boleh disimpan sebagai draf, TIDAK boleh diajukan, dan tidak sampai ke server
  await page.evaluate(() => window.__editor.place('table', 0, window.__editor.project.spawn.z)); // tepat di titik mulai
  await page.click('#cloudSave');
  await expect(page.locator('[data-submit="2"]')).toBeVisible(); // daftar versi tetap terbuka setelah menyimpan dan ikut diperbarui
  const before = mock.log.filter((x) => x === 'dunia_ajukan').length;
  await page.locator('[data-submit="2"]').click();
  await expect(page.locator('#cloud small.msg')).toContainText('belum bisa diajukan');
  expect(mock.log.filter((x) => x === 'dunia_ajukan').length).toBe(before);
  // satu-satunya galat konsol yang diharapkan: respons 400 dari login dengan kata sandi salah di awal tes
  expect(errors.filter((e) => !/status of 400/.test(e))).toEqual([]);
  expect(errors.filter((e) => /status of 400/.test(e))).toHaveLength(1);
  await context.close();
});

test('moderator: tinjau pengajuan (mode tinjau mengunci editor, draf lokal aman), setujui, lalu tarik paksa dengan alasan', async ({ browser }) => {
  const mock = createMock();
  mock.addUser('rani@example.test', 'rahasia1');
  mock.addUser('mod@example.test', 'rahasia1', true);

  // Satu halaman hidup pada satu waktu (CI hanya punya 1 inti CPU); status tersimpan di tiruan server.
  const asOwner = async (check) => {
    const o = await openPage(browser, mock);
    await login(o.page, 'rani@example.test');
    await check(o.page);
    expect(o.errors).toEqual([]);
    await o.context.close();
  };

  await asOwner(async (page) => {
    await page.evaluate(() => window.__editor.rename('Taman Rani'));
    await page.click('#cloudSave');
    await page.getByRole('button', { name: 'Versi', exact: true }).click();
    await page.locator('[data-submit="1"]').click();
    await expect(page.locator('[data-project] .st').first()).toContainText('Sedang ditinjau');
  });

  const mod = await openPage(browser, mock);
  await mod.page.evaluate(() => window.__editor.rename('Draf Lokal Moderator'));
  await mod.page.waitForTimeout(600); // beri waktu autosave
  const draftBefore = await mod.page.evaluate(() => localStorage.getItem('orbit.worldeditor.draft.v1'));
  expect(draftBefore).toContain('Draf Lokal Moderator');
  await login(mod.page, 'mod@example.test');
  await expect(mod.page.locator('#tabReview')).toBeVisible();
  await mod.page.click('#tabReview');
  await expect(mod.page.locator('[data-review=pending]')).toHaveCount(1);
  await mod.page.locator('[data-review=pending]').getByRole('button', { name: 'Tinjau' }).click();

  await expect(mod.page.locator('body')).toHaveClass(/review/);
  await expect(mod.page.locator('#reviewbar')).toContainText('Taman Rani');
  await expect(mod.page.locator('#undo')).toBeHidden(); // editor terkunci saat meninjau
  expect(await mod.page.evaluate(() => window.__editor.project.name)).toBe('Taman Rani');
  await mod.page.evaluate(() => window.__editor.place('table', 4, 4)); // perubahan paksa lewat debug tidak boleh bocor ke draf lokal
  await mod.page.waitForTimeout(900);
  expect(await mod.page.evaluate(() => localStorage.getItem('orbit.worldeditor.draft.v1'))).toBe(draftBefore);

  await mod.page.click('#rvApprove');
  await expect(mod.page.locator('body')).not.toHaveClass(/review/);
  expect(await mod.page.evaluate(() => window.__editor.project.name)).toBe('Draf Lokal Moderator'); // draf moderator kembali
  expect(mock.projects[0].live_version).toBe(1);
  await mod.context.close();

  await asOwner(async (page) => {
    await expect(page.locator('[data-project] .st').first()).toContainText('Terbit · v1');
  });

  // tarik paksa (alasan lewat prompt)
  const mod2 = await openPage(browser, mock);
  await login(mod2.page, 'mod@example.test');
  await mod2.page.click('#tabReview');
  await mod2.page.locator('[data-review=live]').getByRole('button', { name: 'Tinjau' }).click();
  await mod2.page.click('#rvTakedown');
  await expect(mod2.page.locator('body')).not.toHaveClass(/review/);
  expect(mock.projects[0].takedown.reason).toBe('Melanggar kebijakan');
  expect(mock.projects[0].live_version).toBeNull();
  expect(mod2.errors).toEqual([]);
  await mod2.context.close();

  await asOwner(async (page) => {
    await expect(page.locator('[data-project]')).toContainText('Ditarik moderator: Melanggar kebijakan');
  });
});

test('pemilik biasa tidak melihat tab Tinjau; tanpa konfigurasi tombol Akun memberi pesan jelas', async ({ browser, page }) => {
  const mock = createMock();
  mock.addUser('rani@example.test', 'rahasia1');
  const { page: p2, context } = await openPage(browser, mock);
  await login(p2, 'rani@example.test');
  await expect(p2.locator('#cloudSave')).toBeVisible();
  await expect(p2.locator('#tabReview')).toHaveCount(0);
  await context.close();

  await page.goto('/editor.html?debug=1');
  await page.waitForFunction(() => window.__editor);
  await page.click('#cloudBtn');
  await expect(page.locator('#toast')).toContainText('belum dikonfigurasi');
});
