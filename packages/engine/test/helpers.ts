import { applyAction, type Action, type Card, type GameEvent, type GameState } from '../src';

/** Builds a mid-Round state; Seat count comes from `hands`. */
export function stateWith(opts: {
  board: Card[][];
  hands: Card[][];
  scores?: number[];
  endScore?: number;
  round?: number;
}): GameState {
  const seatCount = opts.hands.length;
  return deepFreeze({
    config: { seatCount, endScore: opts.endScore ?? 66 },
    seed: 1,
    round: opts.round ?? 1,
    turn: 1,
    phase: 'picking',
    board: opts.board,
    hands: opts.hands,
    picks: Array<Card | null>(seatCount).fill(null),
    unplaced: [],
    penaltyPiles: Array.from({ length: seatCount }, () => []),
    scores: opts.scores ?? Array<number>(seatCount).fill(0),
    winners: [],
  });
}

/** Applies Actions in order, failing loudly on the first rejected one. */
export function play(state: GameState, ...actions: Action[]) {
  const events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`${JSON.stringify(action)} rejected: ${result.error}`);
    state = deepFreeze(result.state);
    events.push(...result.events);
  }
  return { state, events };
}

/** Freezing inputs makes any accidental mutation by the engine throw. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
