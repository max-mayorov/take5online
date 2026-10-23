import { expect, test, type Browser, type Page } from '@playwright/test';

test('two friends play a whole game', async ({ browser }) => {
  // Reduced motion shows every Reveal at once, which keeps a whole Game fast.
  const [max, sam] = await friends(browser, { reducedMotion: 'reduce' });
  await expect(max.getByText('Players (2/10)')).toBeVisible();

  const endScore = max.getByLabel('Game ends at');
  await endScore.fill('10');
  await endScore.blur();
  await expect(sam.getByText('Game ends at 10.')).toBeVisible();
  await max.getByRole('button', { name: 'Start game' }).click();
  await expect(sam.locator('.hand .card-button')).toHaveCount(10);
  await expect(sam.locator('.board-row')).toHaveCount(4);

  // Both play their leftmost Card each Turn, and Take the first Row when they must.
  const done = () => max.getByText('Game over').isVisible();
  for (let steps = 0; !(await done()); steps++) {
    expect(steps).toBeLessThan(400);
    for (const page of [max, sam]) await act(page);
  }

  await expect(sam.getByText('Game over')).toBeVisible();
  await expect(max.getByText('Tonight so far')).toBeVisible();
  await expect(max.locator('.winner')).toContainText(/wins!|share the win!/);
  await expect(max.getByRole('button', { name: 'Play again' })).toBeVisible();
});

test('a Reveal animates and can be skipped', async ({ browser }) => {
  const [max, sam] = await friends(browser, { reducedMotion: 'no-preference' });
  await max.getByRole('button', { name: 'Start game' }).click();

  await pickFirst(max);
  await expect(sam.locator('.seat', { hasText: 'Max' }).getByText('picked')).toBeAttached();
  await pickFirst(sam);

  // Both Picks appear in the tray, then get Placed one by one; skipping jumps to the end.
  await Promise.all(
    [max, sam].map(async (page) => {
      await expect(page.getByText('Revealing…')).toBeVisible();
      await expect(page.locator('.tray .card')).not.toHaveCount(0);
    }),
  );
  await max.getByRole('button', { name: /Skip/ }).click();
  await expect(max.getByRole('button', { name: /Skip/ })).toHaveCount(0);
  await expect(max.getByText('Revealing…')).toHaveCount(0);

  // Without skipping, the animation finishes by itself.
  await expect(sam.getByRole('button', { name: /Skip/ })).toHaveCount(0, { timeout: 10_000 });

  // Every Pick is now on the Board, or still in the tray if a Low Card is waiting for a Row.
  for (const page of [max, sam]) {
    await expect
      .poll(async () => {
        const onBoard = await page.locator('.board-row .slot:not(.row-end) .card').count();
        const waiting = await page.locator('.tray li').count();
        return onBoard + waiting;
      })
      .toBe(6);
  }
});

test('reactions float over the sender for everyone', async ({ browser }) => {
  const [max, sam] = await friends(browser, { reducedMotion: 'reduce' });
  await max.getByRole('button', { name: 'React', exact: true }).click();
  await max.getByRole('menuitem', { name: 'React with 🐮' }).click();
  for (const page of [max, sam]) {
    await expect(page.getByRole('img', { name: 'Max reacted 🐮' })).toBeVisible();
  }
  await expect(sam.getByRole('img', { name: 'Max reacted 🐮' })).toHaveCount(0, {
    timeout: 5000,
  });
});

test('a reload keeps your seat and your mute choice', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a room' }).click();
  await enter(page, 'Max');
  await page.getByRole('button', { name: 'Mute sounds' }).click();
  await page.reload();
  await expect(page.getByText('Max (host, you)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn sounds on' })).toBeVisible();
});

test('unknown rooms say so', async ({ page }) => {
  await page.goto('/ZZZZ');
  await expect(page.getByText('This room does not exist or has expired.')).toBeVisible();
});

/** Max creates a Room and Sam joins it, each in their own browser context. */
async function friends(browser: Browser, options: { reducedMotion: 'reduce' | 'no-preference' }) {
  const max = await (await browser.newContext(options)).newPage();
  const sam = await (await browser.newContext(options)).newPage();
  await max.goto('/');
  await max.getByRole('button', { name: 'Create a room' }).click();
  await expect(max).toHaveURL(/\/[A-Z]{4}$/);
  await enter(max, 'Max');
  await sam.goto(max.url());
  await enter(sam, 'Sam');
  return [max, sam] as const;
}

async function enter(page: Page, nickname: string) {
  await page.getByLabel('Pick a nickname').fill(nickname);
  await page.getByRole('button', { name: 'Enter room' }).click();
  await expect(page.getByText(`${nickname} (`).first()).toBeVisible();
}

/** Picks the leftmost Card not already Picked, and waits until the server has taken it. */
async function pickFirst(page: Page) {
  const button = page.locator('.hand .card-button[aria-pressed="false"]:not(:disabled)').first();
  const card = await button.getAttribute('data-card');
  await button.click();
  // A Picked Card is either raised in the Hand or, once the Turn is Revealed, gone from it.
  await expect(
    page.locator(`.hand .card-button[aria-pressed="false"][data-card="${card}"]`),
  ).toHaveCount(0);
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
  if (prompt?.startsWith('Pick a card')) await pickFirst(page);
}
