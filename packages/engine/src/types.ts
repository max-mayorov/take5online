import type { Card } from './cards';

export interface GameConfig {
  /** Number of Seats, 2–10. */
  seatCount: number;
  /** The Game ends after the Round in which any Score reaches this. */
  endScore: number;
}

export type Phase = 'picking' | 'choosingRow' | 'gameOver';

export interface PlayedCard {
  seat: number;
  card: Card;
}

/**
 * The complete, unredacted state of one Game. Seats are identified by index.
 * Treat it as immutable: the engine never mutates a state it is given.
 */
export interface GameState {
  config: GameConfig;
  seed: number;
  /** 1-based. */
  round: number;
  /** 1-based, 1–10 within a Round. */
  turn: number;
  phase: Phase;
  /** Exactly four Rows, each ascending, 1–5 Cards long. */
  board: Card[][];
  /** Per Seat, ascending. A Picked Card has already left the Hand. */
  hands: Card[][];
  /** Per Seat: this Turn's Pick, or null if not yet Picked. Cleared on Reveal. */
  picks: (Card | null)[];
  /** Revealed Cards still waiting for Placement, ascending. Non-empty only while choosingRow. */
  unplaced: PlayedCard[];
  /** Per Seat: Cards Taken during the current Round. */
  penaltyPiles: Card[][];
  /** Per Seat: Bull-heads Taken so far in this Game. */
  scores: number[];
  /** Seats with the lowest Score once the Game is over; empty before that. */
  winners: number[];
}

export type Action =
  { type: 'pick'; seat: number; card: Card } | { type: 'chooseRow'; seat: number; row: number };

/** Everything in an event is public: events may be broadcast to every connection. */
export type GameEvent =
  | { type: 'roundStarted'; round: number; board: Card[][] }
  | { type: 'picked'; seat: number }
  | { type: 'revealed'; cards: PlayedCard[] }
  | { type: 'rowChoiceRequired'; seat: number; card: Card }
  | { type: 'rowTaken'; seat: number; row: number; cards: Card[]; bullHeads: number }
  | { type: 'cardPlaced'; seat: number; card: Card; row: number }
  | { type: 'roundEnded'; round: number; scores: number[] }
  | { type: 'gameEnded'; scores: number[]; winners: number[] };

export type GameError =
  'invalid_seat' | 'wrong_phase' | 'card_not_in_hand' | 'not_your_choice' | 'invalid_row';

export type ApplyResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: GameError };
