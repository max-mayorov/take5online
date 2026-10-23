import { expect, test } from '@playwright/test';

test('the privacy notice is one tap from the home page and the nickname form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'max.mayorov@live.com' }).first()).toBeVisible();
  // The e2e server is local, where analytics never load.
  await expect(page.getByText('Off on local development servers.')).toBeVisible();

  await page.getByRole('button', { name: 'Back to start' }).click();
  await page.getByRole('button', { name: 'Create a room' }).click();
  const link = page.getByRole('link', { name: 'Privacy' });
  await expect(link).toHaveAttribute('href', '/privacy');
  await expect(link).toHaveAttribute('target', '_blank');
});
