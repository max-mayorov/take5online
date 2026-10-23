import { describe, expect, it } from 'vitest';
import { applyAction, newGame, waitingOn } from '../src';
import { play, stateWith } from './helpers';

describe('newGame', () => {
  it('deals 10 Cards to each Seat and starts four Rows', () => {
    const { state, events } = newGame({ seatCount: 3, endScore: 66 }, 123);
    expect(state.hands).toHaveLength(3);
    expect(state.hands.every((hand) => hand.length === 10)).toBe(true);
    expect(state.board.map((row) => row.length)).toEqual([1, 1, 1, 1]);
    const dealt = [...state.hands.flat(), ...state.board.flat()];
    expect(new Set(dealt).size).toBe(34);
    expect(state.hands.every((h) => h.every((c, i) => i === 0 || h[i - 1]! < c))).toBe(true);
    expect(events).toEqual([{ type: 'roundStarted', round: 1, board: state.board }]);
    expect(state).toMatchObject({ round: 1, turn: 1, phase: 'picking', scores: [0, 0, 0] });
  });

  it('uses the whole deck with 10 Seats', () => {
    const { state } = newGame({ seatCount: 10, endScore: 66 }, 1);
    expect(new Set([...state.hands.flat(), ...state.board.flat()]).size).toBe(104);
  });

  it('is deterministic for a seed', () => {
    const config = { seatCount: 4, endScore: 66 };
    expect(newGame(config, 9).state).toEqual(newGame(config, 9).state);
    expect(newGame(config, 9).state.hands).not.toEqual(newGame(config, 10).state.hands);
  });

  it.each([
    { seatCount: 1, endScore: 66 },
    { seatCount: 11, endScore: 66 },
    { seatCount: 2.5, endScore: 66 },
    { seatCount: 2, endScore: 0 },
  ])('rejects config %o', (config) => {
    expect(() => newGame(config, 1)).toThrow(RangeError);
  });
});

describe('picking', () => {
  const state = stateWith({
    board: [[1], [20], [30], [40]],
    hands: [
      [10, 50],
      [60, 70],
    ],
  });

  it('keeps Picks secret until every Seat has Picked', () => {
    const { state: next, events } = play(state, { type: 'pick', seat: 0, card: 10 });
    expect(events).toEqual([{ type: 'picked', seat: 0 }]);
    expect(next.picks).toEqual([10, null]);
    expect(next.hands[0]).toEqual([50]);
    expect(waitingOn(next)).toEqual([1]);
  });

  it.each([
    [{ type: 'pick', seat: 2, card: 10 }, 'invalid_seat'],
    [{ type: 'pick', seat: -1, card: 10 }, 'invalid_seat'],
    [{ type: 'pick', seat: 0, card: 60 }, 'card_not_in_hand'],
    [{ type: 'chooseRow', seat: 0, row: 0 }, 'wrong_phase'],
  ] as const)('rejects %o with %s', (action, error) => {
    expect(applyAction(state, action)).toEqual({ ok: false, error });
  });

  it('rejects a second Pick in the same Turn', () => {
    const { state: next } = play(state, { type: 'pick', seat: 0, card: 10 });
    expect(applyAction(next, { type: 'pick', seat: 0, card: 50 })).toEqual({
      ok: false,
      error: 'already_picked',
    });
  });
});

describe('placement', () => {
  it('Places each Card on the Row whose last Card is the highest below it, lowest first', () => {
    const state = stateWith({
      board: [[1], [20], [30], [40]],
      hands: [
        [35, 99],
        [25, 98],
      ],
    });
    const { state: next, events } = play(
      state,
      { type: 'pick', seat: 0, card: 35 },
      { type: 'pick', seat: 1, card: 25 },
    );
    expect(next.board).toEqual([[1], [20, 25], [30, 35], [40]]);
    expect(events.slice(2)).toEqual([
      {
        type: 'revealed',
        cards: [
          { seat: 1, card: 25 },
          { seat: 0, card: 35 },
        ],
      },
      { type: 'cardPlaced', seat: 1, card: 25, row: 1 },
      { type: 'cardPlaced', seat: 0, card: 35, row: 2 },
    ]);
    expect(next).toMatchObject({ turn: 2, phase: 'picking', picks: [null, null] });
  });

  it('a Sixth Card Takes the Row and starts it afresh', () => {
    const state = stateWith({
      board: [[1, 2, 3, 4, 5], [20], [30], [40]],
      hands: [
        [6, 50],
        [60, 70],
      ],
    });
    const { state: next, events } = play(
      state,
      { type: 'pick', seat: 0, card: 6 },
      { type: 'pick', seat: 1, card: 60 },
    );
    expect(events).toContainEqual({
      type: 'rowTaken',
      seat: 0,
      row: 0,
      cards: [1, 2, 3, 4, 5],
      bullHeads: 6,
    });
    expect(next.board).toEqual([[6], [20], [30], [40, 60]]);
    expect(next.penaltyPiles).toEqual([[1, 2, 3, 4, 5], []]);
    expect(next.scores).toEqual([6, 0]);
  });

  describe('a Low Card', () => {
    const state = stateWith({
      board: [[10], [20, 21], [30], [40]],
      hands: [
        [5, 90],
        [25, 91],
      ],
    });
    const { state: paused, events } = play(
      state,
      { type: 'pick', seat: 0, card: 5 },
      { type: 'pick', seat: 1, card: 25 },
    );

    it('pauses Placement until its Seat chooses a Row', () => {
      expect(events.at(-1)).toEqual({ type: 'rowChoiceRequired', seat: 0, card: 5 });
      expect(paused.phase).toBe('choosingRow');
      expect(paused.unplaced).toEqual([
        { seat: 0, card: 5 },
        { seat: 1, card: 25 },
      ]);
      expect(waitingOn(paused)).toEqual([0]);
    });

    it.each([
      [{ type: 'chooseRow', seat: 1, row: 0 }, 'not_your_choice'],
      [{ type: 'chooseRow', seat: 0, row: 4 }, 'invalid_row'],
      [{ type: 'chooseRow', seat: 0, row: 0.5 }, 'invalid_row'],
      [{ type: 'pick', seat: 0, card: 90 }, 'wrong_phase'],
    ] as const)('rejects %o with %s', (action, error) => {
      expect(applyAction(paused, action)).toEqual({ ok: false, error });
    });

    it('Takes the chosen Row, then Places the rest against the new Board', () => {
      const { state: next, events: after } = play(paused, { type: 'chooseRow', seat: 0, row: 1 });
      expect(after).toEqual([
        { type: 'rowTaken', seat: 0, row: 1, cards: [20, 21], bullHeads: 4 },
        { type: 'cardPlaced', seat: 0, card: 5, row: 1 },
        { type: 'cardPlaced', seat: 1, card: 25, row: 0 },
      ]);
      expect(next.board).toEqual([[10, 25], [5], [30], [40]]);
      expect(next).toMatchObject({ phase: 'picking', turn: 2, scores: [4, 0], unplaced: [] });
    });
  });
});

describe('end of Round and Game', () => {
  it('deals a new Round after the tenth Turn and keeps Scores', () => {
    const state = stateWith({
      board: [[1, 2, 3, 4, 5], [20], [30], [40]],
      hands: [[6], [60]],
      scores: [10, 3],
    });
    const { state: next, events } = play(
      state,
      { type: 'pick', seat: 0, card: 6 },
      { type: 'pick', seat: 1, card: 60 },
    );
    expect(events).toContainEqual({ type: 'roundEnded', round: 1, scores: [16, 3] });
    expect(events.at(-1)).toMatchObject({ type: 'roundStarted', round: 2 });
    expect(next).toMatchObject({ round: 2, turn: 1, phase: 'picking', scores: [16, 3] });
    expect(next.hands.map((h) => h.length)).toEqual([10, 10]);
    expect(next.penaltyPiles).toEqual([[], []]);
  });

  it('does not end the Game mid-Round when the End Score is passed', () => {
    const state = stateWith({
      board: [[1, 2, 3, 4, 5], [20], [30], [40]],
      hands: [
        [6, 7],
        [60, 61],
      ],
      scores: [65, 0],
    });
    const { state: next } = play(
      state,
      { type: 'pick', seat: 0, card: 6 },
      { type: 'pick', seat: 1, card: 60 },
    );
    expect(next.scores[0]).toBeGreaterThanOrEqual(66);
    expect(next.phase).toBe('picking');
  });

  it('ends the Game at the end of the Round; lowest Score wins, ties share', () => {
    const state = stateWith({
      board: [[1, 2, 3, 4, 5], [20], [30], [40]],
      hands: [[6], [60], [70]],
      scores: [62, 8, 9],
    });
    const { state: next, events } = play(
      state,
      { type: 'pick', seat: 0, card: 6 },
      { type: 'pick', seat: 1, card: 60 },
      { type: 'pick', seat: 2, card: 70 },
    );
    // 70 lands after 60 on Row 3: no Bull-heads for Seat 2.
    expect(next.scores).toEqual([68, 8, 9]);
    expect(next).toMatchObject({ phase: 'gameOver', winners: [1] });
    expect(events.at(-1)).toEqual({ type: 'gameEnded', scores: [68, 8, 9], winners: [1] });
    expect(waitingOn(next)).toEqual([]);
    expect(applyAction(next, { type: 'pick', seat: 1, card: 1 })).toEqual({
      ok: false,
      error: 'wrong_phase',
    });
  });

  it('shares the win on a tie', () => {
    const state = stateWith({
      board: [[1, 2, 3, 4, 5], [20], [30], [40]],
      hands: [[6], [60], [70]],
      scores: [62, 8, 8],
    });
    const { state: next } = play(
      state,
      { type: 'pick', seat: 0, card: 6 },
      { type: 'pick', seat: 1, card: 60 },
      { type: 'pick', seat: 2, card: 70 },
    );
    expect(next.winners).toEqual([1, 2]);
  });

  it('respects a custom End Score', () => {
    const state = stateWith({
      board: [[1, 2, 3, 4, 5], [20], [30], [40]],
      hands: [[6], [60]],
      endScore: 5,
    });
    const { state: next } = play(
      state,
      { type: 'pick', seat: 0, card: 6 },
      { type: 'pick', seat: 1, card: 60 },
    );
    expect(next.phase).toBe('gameOver');
  });
});
