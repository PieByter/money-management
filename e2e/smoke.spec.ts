import { expect, test } from '@playwright/test';

test('alur kritis: dashboard, buat kantong, catat transaksi, laporan', async ({ page }) => {
  const walletName = `E2E ${Date.now()}`;

  await page.goto('/dashboard');
  await expect(page.getByText('Kekayaan bersih')).toBeVisible();
  await expect(page.getByText('Arus kas')).toBeVisible();

  await page.goto('/wallets');
  await expect(page.getByRole('heading', { name: 'Kantong' })).toBeVisible();
  await page.getByRole('button', { name: 'Tambah kantong' }).click();
  await page.getByLabel('Nama').fill(walletName);
  await page.getByRole('button', { name: 'Buat kantong' }).click();
  await expect(page.getByText(walletName)).toBeVisible();

  await page.goto('/dashboard');
  await page
    .getByRole('button', { name: /Catat transaksi|Tambah transaksi/ })
    .first()
    .click();
  await expect(page.getByRole('tab', { name: 'Keluar' })).toBeVisible();
  await page.keyboard.type('25000');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Transaksi tersimpan')).toBeVisible();

  await page.goto('/reports');
  await expect(page.getByText('Posisi keuangan saat ini')).toBeVisible();
  await expect(page.getByText('Tren 6 bulan')).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByText('Telegram', { exact: true })).toBeVisible();
  await expect(page.getByText('Ekspor backup JSON')).toBeVisible();
});
