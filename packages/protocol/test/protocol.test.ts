import { newGame, viewFor } from '@take5/engine';
import { describe, expect, it } from 'vitest';
import {
  clientMessageSchema,
  messageVersion,
  parseRoomCode,
  PROTOCOL_VERSION,
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
    { v, type: 'nope' },
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
        members: [{ id: 'a', nickname: 'Max', connected: true, seated: true }],
        seats: ['a', 'b'],
        settings: { endScore: 66 },
        game: viewFor(state, 0),
        gameSeats: [
          { memberId: 'a', nickname: 'Max' },
          { memberId: 'b', nickname: 'Sam' },
        ],
        totals: [],
      },
      events,
    };
    expect(serverMessageSchema.parse(JSON.parse(JSON.stringify(message)))).toEqual(message);
  });
});

describe('messageVersion', () => {
  it('reads v without trusting the rest', () => {
    expect(messageVersion({ v: 3, junk: true })).toBe(3);
    expect(messageVersion('x')).toBeNull();
    expect(messageVersion({ v: '1' })).toBeNull();
  });
});
