import { newGame, viewFor } from '@take5/engine';
import { describe, expect, it } from 'vitest';
import {
  clientMessageSchema,
  messageVersion,
  parseRoomCode,
  PROTOCOL_VERSION,
  REACTIONS,
  serverMessageSchema,
  type ServerMessage,
} from '../src';

const v = PROTOCOL_VERSION;

describe('parseRoomCode', () => {
  it('normalises case and whitespace', () => {
    expect(parseRoomCode(' abcd ')).toBe('ABCD');
  });

  it.each(['ABC', 'ABCDE', 'AB1D', 'ABOD', 'ABID', ''])('rejects %j', (input) => {
    expect(parseRoomCode(input)).toBeNull();
  });
});

describe('clientMessageSchema', () => {
  it.each([
    { v, type: 'hello', nickname: 'Max' },
    { v, type: 'hello', token: 'abc' },
    { v, type: 'pick', card: 104 },
    { v, type: 'chooseRow', row: 3 },
    { v, type: 'settings', endScore: 66 },
    { v, type: 'settings', pickTimer: 0 },
    { v, type: 'settings', endScore: 40, pickTimer: 30 },
    { v, type: 'addBot' },
    { v, type: 'removeBot', memberId: 'b1' },
    { v, type: 'kick', memberId: 'm2' },
    { v, type: 'replaceWithBot', memberId: 'm2' },
    { v, type: 'takeSeat', seat: 9 },
    { v, type: 'react', emoji: '🐮' },
    { v, type: 'continue' },
  ])('accepts %o', (message) => {
    expect(clientMessageSchema.safeParse(message).success).toBe(true);
  });

  it.each([
    { type: 'pick', card: 5 },
    { v: v + 1, type: 'pick', card: 5 },
    { v, type: 'pick', card: 105 },
    { v, type: 'chooseRow', row: 4 },
    { v, type: 'hello', nickname: '   ' },
    { v, type: 'hello', nickname: 'x'.repeat(17) },
    { v, type: 'settings', endScore: 5 },
    { v, type: 'settings', pickTimer: 45 },
    { v, type: 'kick' },
    { v, type: 'removeBot', memberId: 'x'.repeat(65) },
    { v, type: 'takeSeat', seat: 10 },
    { v, type: 'takeSeat', seat: -1 },
    { v, type: 'nope' },
    { v, type: 'react', emoji: '💩' },
    { v, type: 'react', emoji: '' },
    { v, type: 'react' },
  ])('rejects %o', (message) => {
    expect(clientMessageSchema.safeParse(message).success).toBe(false);
  });

  it('trims Nicknames', () => {
    expect(clientMessageSchema.parse({ v, type: 'hello', nickname: '  Max ' })).toMatchObject({
      nickname: 'Max',
    });
  });
});

describe('serverMessageSchema', () => {
  it('accepts a real snapshot', () => {
    const { state, events } = newGame({ seatCount: 2, endScore: 66 }, 1);
    const message: ServerMessage = {
      v,
      type: 'state',
      room: {
        code: 'ABCD',
        phase: 'game',
        hostId: 'a',
        you: 'a',
        members: [
          { id: 'a', nickname: 'Max', connected: true, seated: true, bot: false },
          { id: 'b', nickname: 'Bot 1', connected: false, seated: true, bot: true },
        ],
        seats: ['a', 'b'],
        settings: { endScore: 66, pickTimer: 60 },
        game: viewFor(state, 0),
        gameSeats: [
          { memberId: 'a', nickname: 'Max', bot: false },
          { memberId: 'b', nickname: 'Bot 1', bot: true },
        ],
        totals: [{ memberId: 'b', nickname: 'Bot 1', bot: true, games: 1, wins: 1, bullHeads: 4 }],
        deadline: 1_700_000_060_000,
        summary: { round: 1, ready: ['a'] },
        now: 1_700_000_000_000,
      },
      events: [
        ...events,
        { type: 'turnStarted', round: 1, turn: 1 },
        { type: 'rowChoiceStarted', seat: 1, card: 4 },
      ],
    };
    expect(serverMessageSchema.parse(JSON.parse(JSON.stringify(message)))).toEqual(message);
  });
});

describe('reactions', () => {
  it('accepts every Reaction in both directions', () => {
    for (const emoji of REACTIONS) {
      expect(clientMessageSchema.safeParse({ v, type: 'react', emoji }).success).toBe(true);
      const message = { v, type: 'reaction', memberId: 'a', emoji };
      expect(serverMessageSchema.parse(message)).toEqual(message);
    }
  });

  it('rejects a broadcast of an emoji outside the set', () => {
    const message = { v, type: 'reaction', memberId: 'a', emoji: '🤡' };
    expect(serverMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe('messageVersion', () => {
  it('reads v without trusting the rest', () => {
    expect(messageVersion({ v: 3, junk: true })).toBe(3);
    expect(messageVersion('x')).toBeNull();
    expect(messageVersion({ v: '1' })).toBeNull();
  });
});
