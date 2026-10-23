import type { Card, GameEvent, GameView } from '@take5/engine';

export type Sound = 'flip' | 'place' | 'take';

/** A Seat's Pick in the tray; its Card is null while it is face down to the viewer. */
export interface TrayCard {
  seat: number;
  card: Card | null;
}

/** What the table shows at one moment: either the live snapshot or a step of a Reveal. */
export interface TableState {
  /** The Round and Turn on the table, and the viewer's Hand in it, without their Pick. */
  round: number;
  turn: number;
  hand: Card[];
  board: Card[][];
  scores: number[];
  /** Cards in each Seat's Penalty Pile. */
  piles: number[];
  /**
   * While Picking, each Seat that has Picked, in Seat order and face down but for the viewer's own.
   * Once Revealed, the Cards still waiting for Placement, ascending.
   */
  tray: TrayCard[];
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
  sort: 800,
  place: 600,
  taking: 700,
  take: 800,
  roundEnded: 1600,
} as const;

export function tableFrom(game: GameView): TableState {
  return {
    round: game.round,
    turn: game.turn,
    hand: [...game.hand],
    board: game.board.map((row) => [...row]),
    scores: game.seats.map((s) => s.score),
    piles: game.seats.map((s) => s.penaltyPile.length),
    tray:
      game.phase === 'picking'
        ? game.seats.flatMap((s, seat) =>
            s.picked ? [{ seat, card: seat === game.seat ? game.pick : null }] : [],
          )
        : game.unplaced.map((p) => ({ ...p })),
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
      case 'revealed': {
        // The Picks flip where they lay face down, in Seat order, then sort for Placement.
        const bySeat = [...event.cards].sort((a, b) => a.seat - b.seat);
        const ascending = [...event.cards].sort((a, b) => a.card - b.card);
        // `before` may predate the viewer's own Pick, which now leaves their Hand for the tray.
        push(
          {
            hand: table.hand.filter((card) => !event.cards.some((p) => p.card === card)),
            tray: bySeat.map((p) => ({
              seat: p.seat,
              card: p.seat === before.seat ? p.card : null,
            })),
          },
          TIMING.faceDown,
        );
        push({ tray: bySeat.map((p) => ({ ...p })) }, TIMING.flip, 'flip');
        if (ascending.some((p, i) => p.seat !== bySeat[i]!.seat))
          push({ tray: ascending.map((p) => ({ ...p })) }, TIMING.sort);
        break;
      }
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
