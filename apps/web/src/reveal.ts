import type { Card, GameEvent, GameView, PlayedCard } from '@take5/engine';

export type Sound = 'flip' | 'place' | 'take';

/** What the table shows at one moment: either the live snapshot or a step of a Reveal. */
export interface TableState {
  /** The Round on the table, and the viewer's Hand in it, without their Pick. */
  round: number;
  hand: Card[];
  board: Card[][];
  scores: number[];
  /** Cards in each Seat's Penalty Pile. */
  piles: number[];
  /** Revealed Cards still waiting for Placement, ascending. */
  tray: PlayedCard[];
  /** The tray's Cards are still face down, just before they flip. */
  faceDown: boolean;
  /** The Card that has just been Placed. */
  placed: { row: number; card: Card } | null;
  /** A Row about to be Taken, with the Card that Takes it. */
  taking: { row: number; seat: number; card: Card } | null;
  /** Cards on their way from a Row into a Seat's Penalty Pile. */
  flight: { row: number; seat: number; cards: Card[] } | null;
  /** The Seat choosing a Row to Take for its Low Card. */
  choosing: number | null;
  /** Set while showing that a Round has just ended. */
  roundEnded: number | null;
}

export interface Frame {
  table: TableState;
  ms: number;
  sound?: Sound;
}

export const TIMING = {
  faceDown: 350,
  flip: 900,
  place: 600,
  taking: 700,
  take: 800,
  roundEnded: 1600,
} as const;

export function tableFrom(game: GameView): TableState {
  return {
    round: game.round,
    hand: [...game.hand],
    board: game.board.map((row) => [...row]),
    scores: game.seats.map((s) => s.score),
    piles: game.seats.map((s) => s.penaltyPile.length),
    tray: game.unplaced.map((p) => ({ ...p })),
    faceDown: false,
    placed: null,
    taking: null,
    flight: null,
    choosing: game.choosingSeat,
    roundEnded: null,
  };
}

/** Whether these events change the table in a way worth animating. */
export function isAnimated(events: readonly GameEvent[]): boolean {
  return events.some((e) => e.type === 'revealed' || e.type === 'cardPlaced');
}

/**
 * The steps that lead from the snapshot `before` through `events`. The last frame is not the
 * new snapshot itself: once the frames have played, the table shows the live snapshot again.
 */
export function revealFrames(before: GameView, events: readonly GameEvent[]): Frame[] {
  if (!isAnimated(events)) return [];
  const frames: Frame[] = [];
  let table: TableState = { ...tableFrom(before), choosing: null };
  const push = (change: Partial<TableState>, ms: number, sound?: Sound) => {
    table = { ...table, placed: null, flight: null, taking: null, ...change };
    frames.push(sound ? { table, ms, sound } : { table, ms });
  };
  const withoutCard = (card: Card) => table.tray.filter((p) => p.card !== card);
  const withRow = (row: number, cards: Card[]) =>
    table.board.map((r, i) => (i === row ? cards : r));

  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    switch (event.type) {
      case 'revealed':
        push({ tray: event.cards.map((p) => ({ ...p })), faceDown: true }, TIMING.faceDown);
        push({ faceDown: false }, TIMING.flip, 'flip');
        break;
      case 'rowTaken': {
        // The engine follows every Take with the Taking Card starting the Row.
        const next = events[i + 1];
        const card = next?.type === 'cardPlaced' ? next.card : null;
        if (card === null) break;
        i++;
        push(
          { taking: { row: event.row, seat: event.seat, card }, tray: withoutCard(card) },
          TIMING.taking,
        );
        push(
          {
            board: withRow(event.row, [card]),
            scores: table.scores.map((s, seat) => (seat === event.seat ? s + event.bullHeads : s)),
            piles: table.piles.map((n, seat) => (seat === event.seat ? n + event.cards.length : n)),
            placed: { row: event.row, card },
            flight: { row: event.row, seat: event.seat, cards: event.cards },
          },
          TIMING.take,
          'take',
        );
        break;
      }
      case 'cardPlaced':
        push(
          {
            board: withRow(event.row, [...table.board[event.row]!, event.card]),
            tray: withoutCard(event.card),
            placed: { row: event.row, card: event.card },
          },
          TIMING.place,
          'place',
        );
        break;
      case 'roundEnded':
        push({ tray: [], roundEnded: event.round }, TIMING.roundEnded);
        break;
      default:
        // Picks, the Low Card pause and the next deal show up in the live snapshot.
        break;
    }
  }
  return frames;
}

/** The sounds to play when a Reveal is shown without animation. */
export function summarySounds(events: readonly GameEvent[]): Sound[] {
  if (!isAnimated(events)) return [];
  return events.some((e) => e.type === 'rowTaken') ? ['take'] : ['place'];
}
