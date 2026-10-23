import { expect, test, type Page } from '@playwright/test';

test('two friends play a whole game', async ({ browser }) => {
  const max = await (await browser.newContext()).newPage();
  const sam = await (await browser.newContext()).newPage();

  await max.goto('/');
  await max.getByRole('button', { name: 'Create a room' }).click();
  await expect(max).toHaveURL(/\/[A-Z]{4}$/);
  await enter(max, 'Max');

  await sam.goto(max.url());
  await enter(sam, 'Sam');
  await expect(max.getByText('Players (2/10)')).toBeVisible();

  const endScore = max.getByLabel('Game ends at');
  await endScore.fill('10');
  await endScore.blur();
  await expect(sam.getByText('Game ends at 10.')).toBeVisible();
  await max.getByRole('button', { name: 'Start game' }).click();
  await expect(sam.locator('.hand .card-button')).toHaveCount(10);
  if (process.env.SCREENSHOTS)
    await sam.screenshot({ path: `${process.env.SCREENSHOTS}/game.png`, fullPage: true });

  // Both play their leftmost Card each Turn, and Take the first Row when they must.
  const done = () => max.getByText('Game over').isVisible();
  for (let steps = 0; !(await done()); steps++) {
    expect(steps).toBeLessThan(400);
    for (const page of [max, sam]) await act(page);
  }

  await expect(sam.getByText('Game over')).toBeVisible();
  if (process.env.SCREENSHOTS)
    await max.screenshot({ path: `${process.env.SCREENSHOTS}/results.png`, fullPage: true });
  await expect(max.getByText('Tonight so far')).toBeVisible();
  await expect(max.getByRole('button', { name: 'Play again' })).toBeVisible();
});

test('a reload keeps your seat', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a room' }).click();
  await enter(page, 'Max');
  await page.reload();
  await expect(page.getByText('Max (host, you)')).toBeVisible();
});

test('unknown rooms say so', async ({ page }) => {
  await page.goto('/ZZZZ');
  await expect(page.getByText('This room does not exist or has expired.')).toBeVisible();
});

async function enter(page: Page, nickname: string) {
  await page.getByLabel('Pick a nickname').fill(nickname);
  await page.getByRole('button', { name: 'Enter room' }).click();
  await expect(page.getByText(`${nickname} (`).first()).toBeVisible();
}

async function act(page: Page) {
  const row = page.locator('.board-row.choosable').first();
  if (await row.isVisible()) {
    await row.click();
    return;
  }
  const promptLocator = page.locator('.prompt');
  if ((await promptLocator.count()) === 0) return; // The Game is over.
  const prompt = await promptLocator.textContent();
  if (prompt?.startsWith('Pick a card')) {
    const button = page.locator('.hand .card-button:not(:disabled)').first();
    const card = await button.locator('.card').getAttribute('data-card');
    await button.click();
    // Picked Cards leave the Hand, whether or not the Turn was Revealed right away.
    await expect(page.locator(`.hand .card-button .card[data-card="${card}"]`)).toHaveCount(0);
  }
}
