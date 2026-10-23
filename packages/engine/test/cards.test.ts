import { describe, expect, it } from 'vitest';
import { bullHeads, createRng, fullDeck, isCard, roundSeed, shuffle, sumBullHeads } from '../src';

describe('bullHeads', () => {
  it.each([
    [55, 7],
    [11, 5],
    [99, 5],
    [10, 3],
    [100, 3],
    [5, 2],
    [95, 2],
    [1, 1],
    [104, 1],
  ])('card %i has %i Bull-heads', (card, expected) => {
    expect(bullHeads(card)).toBe(expected);
  });

  it('matches the real deck: 171 Bull-heads in total', () => {
    expect(sumBullHeads(fullDeck())).toBe(171);
  });

  it('has the real deck’s tier counts', () => {
    const counts = new Map<number, number>();
    for (const card of fullDeck())
      counts.set(bullHeads(card), (counts.get(bullHeads(card)) ?? 0) + 1);
    expect(Object.fromEntries(counts)).toEqual({ 1: 76, 2: 9, 3: 10, 5: 8, 7: 1 });
  });
});

describe('isCard', () => {
  it('accepts 1–104 integers only', () => {
    expect([1, 104].every(isCard)).toBe(true);
    expect([0, 105, 1.5, NaN].some(isCard)).toBe(false);
  });
});

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('shuffles into a permutation without touching the input', () => {
    const deck = fullDeck();
    const shuffled = shuffle(deck, createRng(7));
    expect(shuffled).not.toEqual(deck);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(deck);
    expect(deck).toEqual(fullDeck());
  });

  it('derives different seeds for different Rounds', () => {
    expect(roundSeed(1, 1)).not.toBe(roundSeed(1, 2));
    expect(roundSeed(1, 1)).toBe(roundSeed(1, 1));
  });
});
