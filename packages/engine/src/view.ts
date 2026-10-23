import type { Card } from './cards';
import type { GameConfig, GameState, Phase, PlayedCard } from './types';

export interface SeatView {
  handSize: number;
  /** Whether the Seat has Picked this Turn; never which Card. */
  picked: boolean;
  score: number;
  penaltyPile: Card[];
}

/** What one connection may see of a Game. */
export interface GameView {
  config: GameConfig;
  round: number;
  turn: number;
  phase: Phase;
  board: Card[][];
  seats: SeatView[];
  /** Revealed Cards still waiting for Placement. */
  unplaced: PlayedCard[];
  /** The Seat that must choose a Row to Take, if any. */
  choosingSeat: number | null;
  winners: number[];
  /** The viewer's Seat, or null for a Spectator. */
  seat: number | null;
  /** The viewer's own Hand; empty for a Spectator. */
  hand: Card[];
  /** The viewer's own Pick this Turn, if made. */
  pick: Card | null;
}

/** Redacts `state` to what `seat` (or a Spectator, when null) may see. */
export function viewFor(state: GameState, seat: number | null): GameView {
  const own = seat !== null && seat >= 0 && seat < state.config.seatCount ? seat : null;
  return {
    config: { ...state.config },
    round: state.round,
    turn: state.turn,
    phase: state.phase,
    board: state.board.map((row) => [...row]),
    seats: state.hands.map((hand, i) => ({
      handSize: hand.length,
      picked: state.picks[i] !== null,
      score: state.scores[i]!,
      penaltyPile: [...state.penaltyPiles[i]!],
    })),
    unplaced: state.unplaced.map((p) => ({ ...p })),
    choosingSeat: state.phase === 'choosingRow' ? (state.unplaced[0]?.seat ?? null) : null,
    winners: [...state.winners],
    seat: own,
    hand: own === null ? [] : [...state.hands[own]!],
    pick: own === null ? null : state.picks[own]!,
  };
}
