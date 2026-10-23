import { exports, env } from 'cloudflare:workers';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { RoomData } from '../src/room';
import type { RoomObject } from '../src/room-object';
import { Client, createRoom, isError, isState, isWelcome } from './client';

describe('HTTP API', () => {
  it('creates a Room and reports that it exists', async () => {
    const code = await createRoom();
    expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    const found = await exports.default.fetch(`http://test/api/rooms/${code.toLowerCase()}`);
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ code });
  });

  it.each(['ZZZZ', 'nope', 'AB1D'])('404s for Room %s', async (code) => {
    const response = await exports.default.fetch(`http://test/api/rooms/${code}`);
    expect(response.status).toBe(404);
  });

  it('only accepts WebSocket upgrades on /ws', async () => {
    const response = await exports.default.fetch('http://test/ws/ABCD');
    expect(response.status).toBe(426);
  });

  it('404s unknown API routes', async () => {
    expect((await exports.default.fetch('http://test/api/nope')).status).toBe(404);
  });
});

describe('connections', () => {
  it('tells a client the Room does not exist', async () => {
    const client = await Client.connect('QQQQ');
    const { message } = await client.next(isError);
    expect(message.code).toBe('room_not_found');
  });

  it('joins with a Nickname and hands out a token', async () => {
    const code = await createRoom();
    const client = await Client.join(code, 'Max');
    const { message: welcome } = await client.next(isWelcome);
    const room = client.latest();
    expect(room).toMatchObject({
      code,
      phase: 'lobby',
      hostId: welcome.memberId,
      you: welcome.memberId,
    });
    expect(room.members).toEqual([
      { id: welcome.memberId, nickname: 'Max', connected: true, seated: true },
    ]);
  });

  it('asks for a Nickname when there is no valid token', async () => {
    const code = await createRoom();
    const client = await Client.connect(code);
    client.send({ type: 'hello', token: 'not-a-real-token' });
    expect((await client.next(isError)).message.code).toBe('nickname_required');
    client.send({ type: 'sit' });
    expect((await client.next(isError, 1)).message.code).toBe('nickname_required');
  });

  it('reclaims the same place with the token after reconnecting', async () => {
    const code = await createRoom();
    const first = await Client.join(code, 'Max');
    const { message: welcome } = await first.next(isWelcome);
    first.close();

    const again = await Client.connect(code);
    again.send({ type: 'hello', token: welcome.token });
    const { message: rewelcome } = await again.next(isWelcome);
    expect(rewelcome.memberId).toBe(welcome.memberId);
    expect((await again.state(0)).members).toHaveLength(1);
  });

  it('tells clients on another protocol version to reload', async () => {
    const code = await createRoom();
    const client = await Client.connect(code);
    client.sendRaw(JSON.stringify({ v: 999, type: 'hello', nickname: 'Old' }));
    expect((await client.next((m): m is typeof m => m.type === 'reload')).message.type).toBe(
      'reload',
    );
  });

  it('rejects malformed messages', async () => {
    const code = await createRoom();
    const client = await Client.join(code, 'Max');
    client.sendRaw('{not json');
    expect((await client.next(isError)).message.code).toBe('bad_message');
  });

  it('shows others as disconnected when their socket closes', async () => {
    const code = await createRoom();
    const max = await Client.join(code, 'Max');
    const sam = await Client.join(code, 'Sam');
    const from = max.messages.length;
    sam.close();
    let room = await max.state(from);
    while (room.members.find((m) => m.nickname === 'Sam')?.connected) room = await max.state();
    expect(room.members.map((m) => [m.nickname, m.connected])).toEqual([
      ['Max', true],
      ['Sam', false],
    ]);
  });
});

describe('a full Game over WebSockets', () => {
  it('plays from Lobby to Results without ever leaking a Hand', async () => {
    const code = await createRoom();
    const max = await Client.join(code, 'Max');
    const sam = await Client.join(code, 'Sam');
    const watcher = await Client.join(code, 'Watcher');
    watcher.send({ type: 'stand' });

    expect(await max.request({ type: 'settings', endScore: 10 })).toMatchObject({ type: 'state' });
    const samFrom = sam.messages.length;
    sam.send({ type: 'start' });
    expect((await sam.next(isError, samFrom)).message.code).toBe('not_host');

    let from = max.messages.length;
    max.send({ type: 'start' });
    let room = await max.state(from);
    expect(room.phase).toBe('game');
    expect(room.gameSeats.map((s) => s.nickname)).toEqual(['Max', 'Sam']);

    const players = [max, sam];
    for (let moves = 0; room.phase === 'game'; moves++) {
      if (moves > 500) throw new Error('Game did not finish');
      const game = room.game!;
      const seat =
        game.phase === 'choosingRow' ? game.choosingSeat! : game.seats.findIndex((s) => !s.picked);
      const player = players[seat]!;
      const view = player.latest().game!;
      from = max.messages.length;
      player.send(
        game.phase === 'choosingRow'
          ? { type: 'chooseRow', row: 0 }
          : { type: 'pick', card: view.hand[0]! },
      );
      room = await max.state(from);
    }

    expect(room.phase).toBe('results');
    expect(room.game?.phase).toBe('gameOver');
    expect(room.totals.map((t) => [t.nickname, t.games])).toEqual([
      ['Max', 1],
      ['Sam', 1],
    ]);

    // The Spectator saw every snapshot, and none of them held a Hand.
    const watched = watcher.messages.filter(isState);
    expect(watched.some((m) => m.room.phase === 'game')).toBe(true);
    expect(watched.every((m) => (m.room.game?.hand ?? []).length === 0)).toBe(true);
  });
});

describe('expiry', () => {
  it('deletes a Room after 24 hours without activity', async () => {
    const code = await createRoom();
    const stub = env.ROOMS.getByName(code);

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await stub.exists()).toBe(true);

    // Pretend the last activity was 25 hours ago; the pending alarm then finds the Room expired.
    await runInDurableObject(stub, (instance: RoomObject) => {
      const room = (instance as unknown as { room: RoomData }).room;
      room.lastActivity -= 25 * 60 * 60 * 1000;
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await stub.exists()).toBe(false);
  });
});
