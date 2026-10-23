export type Card = number;

export const DECK_SIZE = 104;
export const MIN_SEATS = 2;
export const MAX_SEATS = 10;
export const HAND_SIZE = 10;
export const ROW_COUNT = 4;
/** A Row holds at most this many Cards; the next one is a Sixth Card. */
export const ROW_LIMIT = 5;

export function isCard(value: number): value is Card {
  return Number.isInteger(value) && value >= 1 && value <= DECK_SIZE;
}

export function bullHeads(card: Card): number {
  if (card === 55) return 7;
  if (card % 11 === 0) return 5;
  if (card % 10 === 0) return 3;
  if (card % 5 === 0) return 2;
  return 1;
}

export function sumBullHeads(cards: readonly Card[]): number {
  return cards.reduce((total, card) => total + bullHeads(card), 0);
}

export function fullDeck(): Card[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i + 1);
}
