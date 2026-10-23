import { sumBullHeads, type Card } from './cards';

function lastCard(row: readonly Card[]): Card {
  const last = row[row.length - 1];
  if (last === undefined) throw new Error('Row is empty');
  return last;
}

/**
 * The Row a Card would be Placed on: the one whose last Card is the highest below it.
 * Returns null for a Low Card.
 */
export function targetRow(board: readonly (readonly Card[])[], card: Card): number | null {
  let best: number | null = null;
  let bestLast = 0;
  for (const [index, row] of board.entries()) {
    const last = lastCard(row);
    if (last < card && last > bestLast) {
      best = index;
      bestLast = last;
    }
  }
  return best;
}

/** The Row with the fewest Bull-heads; the lowest index wins ties. */
export function cheapestRow(board: readonly (readonly Card[])[]): number {
  let best = 0;
  let bestCost = Infinity;
  for (const [index, row] of board.entries()) {
    const cost = sumBullHeads(row);
    if (cost < bestCost) {
      best = index;
      bestCost = cost;
    }
  }
  return best;
}
