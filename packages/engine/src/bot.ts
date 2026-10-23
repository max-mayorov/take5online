import { cheapestRow, targetRow } from './board';
import { DECK_SIZE, ROW_LIMIT, sumBullHeads, type Card } from './cards';
import type { Action, GameState } from './types';

/**
 * The greedy Bot's move for `seat`, or null if the Game isn't waiting on it.
 * It looks only at its own Hand and the Board, never at other Hands.
 */
export function botAction(state: GameState, seat: number): Action | null {
  if (state.phase === 'choosingRow' && state.unplaced[0]?.seat === seat) {
    return { type: 'chooseRow', seat, row: cheapestRow(state.board) };
  }
  const hand = state.hands[seat];
  if (state.phase === 'picking' && hand && hand.length > 0 && state.picks[seat] === null) {
    return { type: 'pick', seat, card: bestCard(hand, state.board) };
  }
  return null;
}

/**
 * Expected Bull-heads of playing `card` if it were Placed on today's Board.
 * A Take costs the Row's Bull-heads (at least 1). A safe Placement costs a risk score
 * below 1 that grows with how full the Row is and how wide the gap to its last Card is.
 */
export function cardCost(card: Card, board: readonly (readonly Card[])[]): number {
  const row = targetRow(board, card);
  if (row === null) return sumBullHeads(board[cheapestRow(board)]!);
  const cards = board[row]!;
  if (cards.length >= ROW_LIMIT) return sumBullHeads(cards);
  const gap = card - cards[cards.length - 1]!;
  return (cards.length / ROW_LIMIT) * 0.5 + (gap / DECK_SIZE) * 0.4;
}

/** The cheapest Card by `cardCost`; the lowest Card wins ties. */
function bestCard(hand: readonly Card[], board: readonly (readonly Card[])[]): Card {
  let best = hand[0]!;
  let bestCost = Infinity;
  for (const card of hand) {
    const cost = cardCost(card, board);
    if (cost < bestCost) {
      best = card;
      bestCost = cost;
    }
  }
  return best;
}
