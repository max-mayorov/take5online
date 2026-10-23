import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  botAction,
  createRng,
  HAND_SIZE,
  newGame,
  ROW_COUNT,
  ROW_LIMIT,
  sumBullHeads,
  viewFor,
  waitingOn,
  type Action,
  type Card,
  type GameState,
  type GameView,
} from '../src';

type Strategy = 'random' | 'bot';

const gameArb = fc.record({
  seatCount: fc.integer({ min: 2, max: 10 }),
  endScore: fc.integer({ min: 1, max: 66 }),
  seed: fc.nat(),
  strategySeed: fc.nat(),
  strategy: fc.constantFrom<Strategy>('random', 'bot'),
});

/** Plays a whole Game, handing every intermediate state to `check`. */
function playGame(
  params: {
    seatCount: number;
    endScore: number;
    seed: number;
    strategySeed: number;
    strategy: Strategy;
  },
  check: (state: GameState, previous: GameState) => void = () => {},
): GameState {
  const rng = createRng(params.strategySeed);
  let { state } = newGame(params, params.seed);
  for (let steps = 0; state.phase !== 'gameOver'; steps++) {
    if (steps > 10_000) throw new Error('Game did not end');
    const seats = waitingOn(state);
    const seat = seats[Math.floor(rng() * seats.length)]!;
    const action =
      params.strategy === 'bot' ? botAction(state, seat)! : randomAction(state, seat, rng);
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`${JSON.stringify(action)} rejected: ${result.error}`);
    check(result.state, state);
    state = result.state;
  }
  return state;
}

function randomAction(state: GameState, seat: number, rng: () => number): Action {
  if (state.phase === 'choosingRow') {
    return { type: 'chooseRow', seat, row: Math.floor(rng() * ROW_COUNT) };
  }
  const hand = state.hands[seat]!;
  return { type: 'pick', seat, card: hand[Math.floor(rng() * hand.length)]! };
}

function cardsInPlay(state: GameState): Card[] {
  return [
    ...state.hands.flat(),
    ...state.board.flat(),
    ...state.penaltyPiles.flat(),
    ...state.picks.filter((c) => c !== null),
    ...state.unplaced.map((p) => p.card),
  ];
}

/** Fields of a GameView whose numbers are not Cards. Anything else numeric counts as a Card. */
const NON_CARD_KEYS = new Set([
  'seatCount',
  'endScore',
  'round',
  'turn',
  'seat',
  'handSize',
  'score',
  'choosingSeat',
  'winners',
]);

/** Every number reachable in the view, except under NON_CARD_KEYS, so new fields can't leak unseen. */
function cardsVisibleIn(view: GameView): Card[] {
  const found: Card[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'number') found.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) if (!NON_CARD_KEYS.has(key)) walk(child);
    }
  };
  walk(view);
  return found;
}

describe('whole Games', () => {
  it('conserve Cards: every dealt Card is in exactly one place', () => {
    fc.assert(
      fc.property(gameArb, (params) => {
        playGame(params, (state) => {
          const cards = cardsInPlay(state);
          if (state.phase === 'gameOver') return;
          expect(cards).toHaveLength(params.seatCount * HAND_SIZE + ROW_COUNT);
          expect(new Set(cards).size).toBe(cards.length);
        });
      }),
    );
  });

  it('keep every Row ascending and 1–5 Cards long', () => {
    fc.assert(
      fc.property(gameArb, (params) => {
        playGame(params, (state) => {
          expect(state.board).toHaveLength(ROW_COUNT);
          for (const row of state.board) {
            expect(row.length).toBeGreaterThanOrEqual(1);
            expect(row.length).toBeLessThanOrEqual(ROW_LIMIT);
            expect(row.every((c, i) => i === 0 || row[i - 1]! < c)).toBe(true);
          }
        });
      }),
    );
  });

  it('never lower a Score, and Scores include the current Penalty Piles', () => {
    fc.assert(
      fc.property(gameArb, (params) => {
        playGame(params, (state, previous) => {
          state.scores.forEach((score, seat) => {
            expect(score).toBeGreaterThanOrEqual(previous.scores[seat]!);
            expect(score).toBeGreaterThanOrEqual(sumBullHeads(state.penaltyPiles[seat]!));
          });
        });
      }),
    );
  });

  it('end within End Score Rounds, with the lowest Scores winning', () => {
    fc.assert(
      fc.property(gameArb, (params) => {
        const end = playGame(params);
        expect(end.round).toBeLessThanOrEqual(params.endScore);
        expect(Math.max(...end.scores)).toBeGreaterThanOrEqual(params.endScore);
        const best = Math.min(...end.scores);
        expect(end.winners.length).toBeGreaterThan(0);
        expect(end.winners.every((seat) => end.scores[seat] === best)).toBe(true);
      }),
    );
  });

  it('replay exactly from the same seeds', () => {
    fc.assert(
      fc.property(gameArb, (params) => {
        expect(playGame(params)).toEqual(playGame(params));
      }),
      { numRuns: 30 },
    );
  });

  it('never show anyone another Seat’s Hand or unrevealed Pick', () => {
    fc.assert(
      fc.property(gameArb, (params) => {
        playGame(params, (state) => {
          for (let viewer = -1; viewer < params.seatCount; viewer++) {
            const seat = viewer === -1 ? null : viewer;
            const visible = new Set(cardsVisibleIn(viewFor(state, seat)));
            state.hands.forEach((hand, other) => {
              if (other === seat) return;
              const hidden = [
                ...hand,
                ...(state.picks[other] === null ? [] : [state.picks[other]!]),
              ];
              expect(hidden.filter((c) => visible.has(c))).toEqual([]);
            });
          }
        });
      }),
      { numRuns: 30 },
    );
  });
});
