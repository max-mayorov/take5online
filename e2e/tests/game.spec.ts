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

test('one person plays a whole game against a bot', async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a room' }).click();
  await enter(page, 'Max');

  await expect(page.getByLabel('Pick timer')).toHaveValue('0');
  await page.getByLabel('Pick timer').selectOption('60');
  await page.getByRole('button', { name: /Add a bot/ }).click();
  await expect(page.getByText('Bot 1 (bot)')).toBeVisible();
  await expect(page.getByText('Players (2/10)')).toBeVisible();
  const endScore = page.getByLabel('Game ends at');
  await endScore.fill('10');
  await endScore.blur();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('.hand .card-button')).toHaveCount(10);
  await expect(page.getByRole('timer')).toHaveAccessibleName(/\d+ seconds left to pick/);
  await expect(page.locator('.seat.bot')).toContainText('Bot 1');

  // The Bot thinks for a second or two each Turn, so wait until it is Max's move each time.
  const maxToMove = page
    .locator('.prompt', { hasText: /^Pick a card|Tap a row/ })
    .or(page.getByText('Game over'));
  for (let steps = 0; !(await page.getByText('Game over').isVisible()); steps++) {
    expect(steps).toBeLessThan(400);
    await expect(maxToMove).toBeVisible({ timeout: 10_000 });
    await act(page);
  }
  await expect(page.locator('.score-table').last()).toContainText('Bot 1');
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
});

test('the host can kick, and a newcomer can take over the bot that took the seat', async ({
  browser,
}) => {
  const [max, sam] = await friends(browser, { reducedMotion: 'reduce' });
  await max.getByRole('button', { name: 'Start game' }).click();
  await expect(sam.locator('.hand .card-button')).toHaveCount(10);

  await max.getByRole('button', { name: 'Options for Sam' }).click();
  await max.getByRole('menuitem', { name: 'Kick' }).click();
  await expect(sam.getByText('The host removed you from this room.')).toBeVisible();
  await expect(max.locator('.seat.bot')).toContainText('Bot 1');

  const kim = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  await kim.goto(max.url());
  await kim.getByLabel('Pick a nickname').fill('Kim');
  await kim.getByRole('button', { name: 'Enter room' }).click();
  await expect(kim.getByText('You are watching this game.')).toBeVisible();
  await kim.getByRole('button', { name: 'Take over Bot 1’s seat' }).click();
  await expect(kim.locator('.seat.me')).toContainText('Kim');
  await expect(kim.locator('.hand .card-button')).not.toHaveCount(0);
});

test('a Reveal animates and can be skipped', async ({ browser }) => {
  const [max, sam] = await friends(browser, { reducedMotion: 'no-preference' });
  await max.getByRole('button', { name: 'Start game' }).click();

  // The highest Cards, so the Reveal Places at least one rather than waiting on a Low Card.
  await pickFirst(max, 'last');
  await expect(sam.locator('.seat', { hasText: 'Max' }).getByText('picked')).toBeAttached();
  await pickFirst(sam, 'last');

  // Both Picks appear in the tray, then fly to their Rows one by one; skipping jumps to the end.
  await Promise.all(
    [max, sam].map(async (page) => {
      await expect(page.getByText('Revealing…')).toBeVisible();
      await expect(page.locator('.tray .card')).not.toHaveCount(0);
      await expect(page.locator('.flight .flyer')).toBeAttached();
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

test('the host can switch card animation for the whole room, even mid-game', async ({
  browser,
}) => {
  const [max, sam] = await friends(browser, { reducedMotion: 'no-preference' });
  const animate = max.getByLabel('Animate cards flying to their rows');
  await expect(animate).toBeChecked();
  await animate.click();
  await expect(animate).not.toBeChecked();
  await expect(sam.getByText('Card animation is off.')).toBeVisible();
  await max.getByRole('button', { name: 'Start game' }).click();

  // Note any Card that flies while the first Turn is Revealed.
  const watchFlights = (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { flew: boolean };
      w.flew = false;
      new MutationObserver(() => {
        w.flew ||= document.querySelector('.flight .flyer') !== null;
      }).observe(document.body, { childList: true, subtree: true });
    });
  await Promise.all([max, sam].map(watchFlights));

  await pickFirst(max, 'last');
  await expect(sam.locator('.seat', { hasText: 'Max' }).getByText('picked')).toBeAttached();
  await pickFirst(sam, 'last');

  // The Reveal still plays, but Cards appear in their slots without flying there.
  await Promise.all(
    [max, sam].map(async (page) => {
      await expect(page.getByText('Revealing…')).toBeVisible();
      await expect(page.getByRole('button', { name: /Skip/ })).toHaveCount(0, { timeout: 10_000 });
      expect(await page.evaluate(() => (window as unknown as { flew: boolean }).flew)).toBe(false);
    }),
  );

  // Only the Host can switch it back on mid-Game, and the next Turn's Cards fly for everyone.
  await expect(sam.getByLabel('Animate cards', { exact: true })).toHaveCount(0);
  const midGame = max.getByLabel('Animate cards', { exact: true });
  await expect(midGame).not.toBeChecked();
  await midGame.click();
  await expect(midGame).toBeChecked();
  await pickFirst(max, 'last');
  await expect(sam.locator('.seat', { hasText: 'Max' }).getByText('picked')).toBeAttached();
  await pickFirst(sam, 'last');
  await expect(sam.locator('.flight .flyer')).toBeAttached();
});

test('the rules are a click away on Wikipedia, here and in every room', async ({ page }) => {
  await page.goto('/');
  const rules = page.getByRole('link', { name: /Rules of 6 nimmt!/ });
  await expect(rules).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/6_nimmt!');
  await expect(rules).toHaveAttribute('target', '_blank');
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
  await expect(page.locator('.room-header').getByRole('link', { name: /Rules/ })).toBeVisible();
  await page.getByRole('button', { name: 'Mute sounds' }).click();
  await page.reload();
  await expect(page.getByText('Max (host, you)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn sounds on' })).toBeVisible();
});

test('a blocked connection explains itself, and recovers when unblocked', async ({ page }) => {
  // Behave like an ad blocker: while the flag is set, every WebSocket fails before opening.
  await page.addInitScript(() => {
    const Real = window.WebSocket;
    const flags = window as unknown as { blockSockets: boolean };
    flags.blockSockets = true;
    window.WebSocket = new Proxy(Real, {
      construct(target, args: ConstructorParameters<typeof WebSocket>) {
        if (!flags.blockSockets) return new target(...args);
        // A real socket to a port nothing listens on fails the same way a blocked one does.
        return new target('ws://127.0.0.1:9/blocked');
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a room' }).click();
  await expect(page).toHaveURL(/\/[A-Z]{4}$/);
  await expect(page.getByText(/an ad blocker may be blocking it/)).toBeVisible({ timeout: 15_000 });

  await page.evaluate(
    () => ((window as unknown as { blockSockets: boolean }).blockSockets = false),
  );
  await expect(page.getByLabel('Pick a nickname')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/an ad blocker may be blocking it/)).toHaveCount(0);
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

/**
 * Picks the leftmost (lowest) Card not already Picked, or the rightmost, and waits until the
 * server has taken it.
 */
async function pickFirst(page: Page, end: 'first' | 'last' = 'first') {
  const turnLabel = page.getByText(/^Round \d+ · Turn/);
  const turn = (await turnLabel.allTextContents()).join();
  const button = page.locator('.hand .card-button[aria-pressed="false"]:not(:disabled)')[end]();
  const card = await button.getAttribute('data-card');
  await button.click();
  // A Picked Card is either raised in the Hand or, once the Turn is Revealed, gone from it,
  // unless a new Round dealt the same Card again; then the Turn label has moved on.
  const unpicked = page.locator(`.hand .card-button[aria-pressed="false"][data-card="${card}"]`);
  await expect(async () => {
    const moved = (await turnLabel.allTextContents()).join() !== turn;
    expect(moved || (await unpicked.count()) === 0).toBe(true);
  }).toPass({ timeout: 5000 });
}

async function act(page: Page) {
  const row = page.locator('.board-row.choosable').first();
  if (await row.isVisible()) {
    await row.click();
    // Wait for the choice to land, so the next call can't click a Row that is about to go stale.
    await expect(page.locator('.board-row.choosable')).toHaveCount(0);
    return;
  }
  const promptLocator = page.locator('.prompt');
  if ((await promptLocator.count()) === 0) return; // The Game is over.
  const prompt = await promptLocator.textContent();
  if (prompt?.startsWith('Pick a card')) await pickFirst(page);
}
