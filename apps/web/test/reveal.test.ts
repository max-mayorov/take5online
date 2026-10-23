import {
  applyAction,
  botAction,
  newGame,
  viewFor,
  type GameEvent,
  type GameState,
} from '@take5/engine';
import { describe, expect, it } from 'vitest';
import { isAnimated, revealFrames, summarySounds, tableFrom, TIMING } from '../src/reveal';

/** Plays a whole Game with Bots, yielding the state before and after every Action. */
function* steps(seed: number, seatCount: number) {
  let state: GameState = newGame({ seatCount, endScore: 66 }, seed).state;
  while (state.phase !== 'gameOver') {
    const seat =
      state.phase === 'choosingRow' ? state.unplaced[0]!.seat : state.picks.indexOf(null);
    const action = botAction(state, seat);
    if (!action) throw new Error('the Bot had no move');
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(result.error);
    yield { before: state, after: result.state, events: result.events };
    state = result.state;
  }
}

describe('revealFrames', () => {
  it('has nothing to animate for a Pick that does not complete the Turn', () => {
    const { before, events } = steps(1, 3).next().value!;
    expect(events).toEqual([{ type: 'picked', seat: 0 }]);
    expect(revealFrames(viewFor(before, null), events)).toEqual([]);
    expect(summarySounds(events)).toEqual([]);
  });

  it('flips the Picks together, then Places them one by one in ascending order', () => {
    for (const { before, events } of steps(7, 4)) {
      if (!events.some((e) => e.type === 'revealed')) continue;
      const frames = revealFrames(viewFor(before, null), events);
      expect(frames[0]!.table.faceDown).toBe(true);
      expect(frames[1]).toMatchObject({ sound: 'flip', table: { faceDown: false } });
      expect(frames[1]!.table.tray.map((p) => p.card)).toEqual(
        [...frames[1]!.table.tray.map((p) => p.card)].sort((a, b) => a - b),
      );
      const placed = frames.flatMap((f) => (f.table.placed ? [f.table.placed.card] : []));
      expect(placed).toEqual([...placed].sort((a, b) => a - b));
      return;
    }
    throw new Error('no Reveal found');
  });

  it('shows a Take in two steps: the Row about to go, then its Cards flying to the pile', () => {
    for (const { before, events } of steps(3, 5)) {
      const taken = events.find(
        (e): e is Extract<GameEvent, { type: 'rowTaken' }> => e.type === 'rowTaken',
      );
      if (!taken) continue;
      const frames = revealFrames(viewFor(before, null), events);
      const at = frames.findIndex((f) => f.table.taking?.row === taken.row);
      const [taking, flying] = [frames[at]!, frames[at + 1]!];
      expect(taking).toMatchObject({ ms: TIMING.taking, table: { taking: { seat: taken.seat } } });
      expect(flying).toMatchObject({
        sound: 'take',
        table: { flight: { row: taken.row, seat: taken.seat, cards: taken.cards } },
      });
      expect(flying.table.board[taken.row]).toEqual([taking.table.taking!.card]);
      expect(flying.table.scores[taken.seat]).toBe(
        taking.table.scores[taken.seat]! + taken.bullHeads,
      );
      return;
    }
    throw new Error('no Take found');
  });

  it('always ends on the next snapshot, across whole Games', () => {
    let checked = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const { before, after, events } of steps(seed, 2 + (seed % 9))) {
        const frames = revealFrames(viewFor(before, 0), events);
        expect(frames.length > 0).toBe(isAnimated(events));
        if (frames.length === 0) continue;
        const last = frames[frames.length - 1]!.table;
        const live = tableFrom(viewFor(after, 0));
        expect(last.scores).toEqual(live.scores);
        if (events.some((e) => e.type === 'roundEnded')) {
          expect(last.roundEnded).toBe(before.round);
          expect(last.tray).toEqual([]);
          // The next Round's Hand waits until the Reveal has played.
          expect(frames.every((f) => f.table.round === before.round)).toBe(true);
          expect(last.hand).toEqual(viewFor(before, 0).hand);
          if (after.phase !== 'gameOver') expect(live.round).not.toBe(before.round);
        } else {
          expect(last.board).toEqual(live.board);
          expect(last.piles).toEqual(live.piles);
          // Paused at a Low Card, the Cards still waiting are the snapshot's.
          expect(last.tray).toEqual(live.tray);
        }
        expect(frames.every((f) => f.ms > 0)).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
