import { targetRow } from './board';
import {
  fullDeck,
  HAND_SIZE,
  MAX_SEATS,
  MIN_SEATS,
  ROW_COUNT,
  ROW_LIMIT,
  sumBullHeads,
  type Card,
} from './cards';
import { createRng, roundSeed, shuffle } from './rng';
import type {
  Action,
  ApplyResult,
  GameConfig,
  GameError,
  GameEvent,
  GameState,
  PlayedCard,
} from './types';

/** Starts a Game and deals its first Round. Throws on an invalid config. */
export function newGame(
  config: GameConfig,
  seed: number,
): { state: GameState; events: GameEvent[] } {
  const { seatCount, endScore } = config;
  if (!Number.isInteger(seatCount) || seatCount < MIN_SEATS || seatCount > MAX_SEATS) {
    throw new RangeError(`seatCount must be an integer from ${MIN_SEATS} to ${MAX_SEATS}`);
  }
  if (!Number.isInteger(endScore) || endScore < 1) {
    throw new RangeError('endScore must be a positive integer');
  }
  const state: GameState = {
    config: { seatCount, endScore },
    seed: seed >>> 0,
    round: 0,
    turn: 0,
    phase: 'picking',
    board: [],
    hands: [],
    picks: [],
    unplaced: [],
    penaltyPiles: [],
    scores: Array<number>(seatCount).fill(0),
    winners: [],
  };
  const events: GameEvent[] = [];
  startRound(state, events);
  return { state, events };
}

/** Applies one Action without mutating `state`. */
export function applyAction(state: GameState, action: Action): ApplyResult {
  const draft = cloneState(state);
  const events: GameEvent[] = [];
  const error =
    action.type === 'pick'
      ? pick(draft, action.seat, action.card, events)
      : chooseRow(draft, action.seat, action.row, events);
  return error ? { ok: false, error } : { ok: true, state: draft, events };
}

/** The Seats the Game is currently waiting on. */
export function waitingOn(state: GameState): number[] {
  switch (state.phase) {
    case 'picking':
      return state.picks.flatMap((card, seat) => (card === null ? [seat] : []));
    case 'choosingRow':
      return state.unplaced[0] ? [state.unplaced[0].seat] : [];
    case 'gameOver':
      return [];
  }
}

function pick(state: GameState, seat: number, card: Card, events: GameEvent[]): GameError | null {
  if (!isSeat(state, seat)) return 'invalid_seat';
  if (state.phase !== 'picking') return 'wrong_phase';
  const hand = state.hands[seat]!;
  // A Pick may be changed until the Reveal: the earlier Card goes back into the Hand.
  const previous = state.picks[seat];
  if (previous != null) {
    hand.push(previous);
    hand.sort((a, b) => a - b);
  }
  const index = hand.indexOf(card);
  if (index === -1) return 'card_not_in_hand';

  hand.splice(index, 1);
  state.picks[seat] = card;
  events.push({ type: 'picked', seat });

  if (state.picks.every((p) => p !== null)) reveal(state, events);
  return null;
}

function chooseRow(
  state: GameState,
  seat: number,
  row: number,
  events: GameEvent[],
): GameError | null {
  if (!isSeat(state, seat)) return 'invalid_seat';
  if (state.phase !== 'choosingRow') return 'wrong_phase';
  const next = state.unplaced[0]!;
  if (next.seat !== seat) return 'not_your_choice';
  if (!Number.isInteger(row) || row < 0 || row >= ROW_COUNT) return 'invalid_row';

  state.unplaced.shift();
  take(state, next, row, events);
  state.phase = 'picking';
  placeUnplaced(state, events);
  return null;
}

function reveal(state: GameState, events: GameEvent[]): void {
  state.unplaced = state.picks
    .map((card, seat): PlayedCard => ({ seat, card: card! }))
    .sort((a, b) => a.card - b.card);
  state.picks = state.picks.map(() => null);
  events.push({ type: 'revealed', cards: state.unplaced.map((p) => ({ ...p })) });
  placeUnplaced(state, events);
}

/** Places Revealed Cards in ascending order, pausing at a Low Card. */
function placeUnplaced(state: GameState, events: GameEvent[]): void {
  while (state.unplaced.length > 0) {
    const next = state.unplaced[0]!;
    const row = targetRow(state.board, next.card);
    if (row === null) {
      state.phase = 'choosingRow';
      events.push({ type: 'rowChoiceRequired', seat: next.seat, card: next.card });
      return;
    }
    state.unplaced.shift();
    if (state.board[row]!.length >= ROW_LIMIT) {
      take(state, next, row, events);
    } else {
      state.board[row]!.push(next.card);
      events.push({ type: 'cardPlaced', seat: next.seat, card: next.card, row });
    }
  }
  endTurn(state, events);
}

/** The Seat collects the Row, and its Card starts the Row afresh. */
function take(state: GameState, played: PlayedCard, row: number, events: GameEvent[]): void {
  const cards = state.board[row]!;
  const bullHeads = sumBullHeads(cards);
  state.penaltyPiles[played.seat]!.push(...cards);
  state.scores[played.seat]! += bullHeads;
  events.push({ type: 'rowTaken', seat: played.seat, row, cards: [...cards], bullHeads });
  state.board[row] = [played.card];
  events.push({ type: 'cardPlaced', seat: played.seat, card: played.card, row });
}

function endTurn(state: GameState, events: GameEvent[]): void {
  if (state.hands[0]!.length > 0) {
    state.turn += 1;
    return;
  }
  events.push({ type: 'roundEnded', round: state.round, scores: [...state.scores] });
  if (Math.max(...state.scores) >= state.config.endScore) {
    const best = Math.min(...state.scores);
    state.phase = 'gameOver';
    state.winners = state.scores.flatMap((score, seat) => (score === best ? [seat] : []));
    events.push({ type: 'gameEnded', scores: [...state.scores], winners: [...state.winners] });
    return;
  }
  startRound(state, events);
}

function startRound(state: GameState, events: GameEvent[]): void {
  const { seatCount } = state.config;
  state.round += 1;
  state.turn = 1;
  state.phase = 'picking';

  const deck = shuffle(fullDeck(), createRng(roundSeed(state.seed, state.round)));
  state.hands = Array.from({ length: seatCount }, (_, seat) =>
    deck.slice(seat * HAND_SIZE, (seat + 1) * HAND_SIZE).sort((a, b) => a - b),
  );
  state.board = deck
    .slice(seatCount * HAND_SIZE, seatCount * HAND_SIZE + ROW_COUNT)
    .map((card) => [card]);
  state.picks = Array<Card | null>(seatCount).fill(null);
  state.unplaced = [];
  state.penaltyPiles = Array.from({ length: seatCount }, () => []);
  events.push({ type: 'roundStarted', round: state.round, board: state.board.map((r) => [...r]) });
}

function isSeat(state: GameState, seat: number): boolean {
  return Number.isInteger(seat) && seat >= 0 && seat < state.config.seatCount;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    config: { ...state.config },
    board: state.board.map((row) => [...row]),
    hands: state.hands.map((hand) => [...hand]),
    picks: [...state.picks],
    unplaced: state.unplaced.map((p) => ({ ...p })),
    penaltyPiles: state.penaltyPiles.map((pile) => [...pile]),
    scores: [...state.scores],
    winners: [...state.winners],
  };
}
