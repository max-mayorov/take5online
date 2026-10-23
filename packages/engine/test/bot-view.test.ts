import { describe, expect, it } from 'vitest';
import { botAction, cardCost, viewFor } from '../src';
import { play, stateWith } from './helpers';

describe('botAction', () => {
  it('prefers a safe Placement over a Take', () => {
    const state = stateWith({
      board: [[1, 2, 3, 4, 5], [20], [30], [40]],
      hands: [
        [6, 21],
        [60, 70],
      ],
    });
    expect(botAction(state, 0)).toEqual({ type: 'pick', seat: 0, card: 21 });
  });

  it('prefers the cheaper of two forced Takes', () => {
    // 8 would be a Sixth Card on Row 0 (6 Bull-heads); 2 is a Low Card whose cheapest Row costs 3.
    const state = stateWith({
      board: [[3, 4, 5, 6, 7], [20], [30], [40]],
      hands: [
        [2, 8],
        [99, 98],
      ],
    });
    expect(cardCost(8, state.board)).toBe(6);
    expect(cardCost(2, state.board)).toBe(3);
    expect(botAction(state, 0)).toEqual({ type: 'pick', seat: 0, card: 2 });
  });

  it('prefers a short Row with a small gap among safe Placements', () => {
    const state = stateWith({
      board: [[10, 11, 12, 13], [50], [80], [90]],
      hands: [
        [14, 51],
        [1, 2],
      ],
    });
    expect(botAction(state, 0)).toEqual({ type: 'pick', seat: 0, card: 51 });
    expect(cardCost(14, state.board)).toBeLessThan(1);
  });

  it('Takes the Row with the fewest Bull-heads when it must choose', () => {
    const state = stateWith({
      board: [[10], [55], [21], [30]],
      hands: [
        [5, 90],
        [91, 92],
      ],
    });
    const { state: paused } = play(
      state,
      { type: 'pick', seat: 0, card: 5 },
      { type: 'pick', seat: 1, card: 91 },
    );
    expect(botAction(paused, 0)).toEqual({ type: 'chooseRow', seat: 0, row: 2 });
    expect(botAction(paused, 1)).toBeNull();
  });

  it('does nothing when the Game is not waiting on it', () => {
    const state = stateWith({
      board: [[1], [20], [30], [40]],
      hands: [
        [10, 50],
        [60, 70],
      ],
    });
    const { state: next } = play(state, { type: 'pick', seat: 0, card: 10 });
    expect(botAction(next, 0)).toBeNull();
    expect(botAction(next, 1)).not.toBeNull();
  });
});

describe('viewFor', () => {
  const state = stateWith({
    board: [[1], [20], [30], [40]],
    hands: [
      [10, 50],
      [60, 70],
    ],
  });
  const { state: picked } = play(state, { type: 'pick', seat: 0, card: 10 });

  it('shows the viewer their own Hand and Pick only', () => {
    const view = viewFor(picked, 1);
    expect(view.hand).toEqual([60, 70]);
    expect(view.pick).toBeNull();
    expect(view.seats.map((s) => [s.handSize, s.picked])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(JSON.stringify(view)).not.toMatch(/\b(10|50)\b/);
    expect(viewFor(picked, 0)).toMatchObject({ hand: [50], pick: 10, seat: 0 });
  });

  it('shows a Spectator no Hand at all', () => {
    const view = viewFor(picked, null);
    expect(view).toMatchObject({ seat: null, hand: [], pick: null });
    expect(JSON.stringify(view)).not.toMatch(/\b(10|50|60|70)\b/);
  });
});
