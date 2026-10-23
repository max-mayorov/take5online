import { exports, env } from 'cloudflare:workers';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { GRACE_PERIOD_MS, type RoomData } from '../src/room';
import type { RoomObject } from '../src/room-object';
import type { ClientIntent } from '@take5/protocol';
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
      { id: welcome.memberId, nickname: 'Max', connected: true, seated: true, bot: false },
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

describe('Bots', () => {
  it('plays a whole Game for one Player against a Bot', async () => {
    const code = await createRoom();
    const max = await Client.join(code, 'Max');
    await max.request({ type: 'addBot' });
    await max.request({ type: 'settings', endScore: 10 });
    expect(max.latest().members.map((m) => [m.nickname, m.bot, m.seated])).toEqual([
      ['Max', false, true],
      ['Bot 1', true, true],
    ]);

    let room = await stateAfter(max, { type: 'start' });
    for (let moves = 0; room.phase === 'game'; moves++) {
      if (moves > 300) throw new Error('Game did not finish');
      const game = room.game!;
      // The Bot never keeps Max waiting.
      expect(game.phase === 'choosingRow' ? game.choosingSeat : game.seats[1]!.picked).toBe(
        game.phase === 'choosingRow' ? 0 : true,
      );
      room = await stateAfter(
        max,
        game.phase === 'choosingRow'
          ? { type: 'chooseRow', row: 0 }
          : { type: 'pick', card: game.hand[0]! },
      );
    }
    expect(room.totals.map((t) => [t.nickname, t.bot, t.games])).toEqual([
      ['Max', false, 1],
      ['Bot 1', true, 1],
    ]);
  });

  it('gives a leaving Player’s Seat to a Bot, which a newcomer may take over', async () => {
    const code = await createRoom();
    const max = await Client.join(code, 'Max');
    const sam = await Client.join(code, 'Sam');
    await Client.synced(max, sam);
    await stateAfter(max, { type: 'start' });

    const from = max.messages.length;
    sam.send({ type: 'leave' });
    let room = await max.state(from);
    expect(room.gameSeats.map((s) => [s.nickname, s.bot])).toEqual([
      ['Max', false],
      ['Bot 1', true],
    ]);
    expect(room.game!.seats[1]!.picked).toBe(true);

    const kim = await Client.join(code, 'Kim');
    expect(kim.latest().game!.seat).toBeNull();
    room = await stateAfter(kim, { type: 'takeSeat', seat: 1 });
    expect(room.gameSeats[1]).toMatchObject({ nickname: 'Kim', bot: false });
    expect(room.game!.seat).toBe(1);
    expect(room.game!.hand).toHaveLength(9);
    expect(room.game!.pick).not.toBeNull();
  });
});

describe('Host controls', () => {
  it('kicks a Player: they are told, disconnected, and their token stops working', async () => {
    const code = await createRoom();
    const max = await Client.join(code, 'Max');
    const sam = await Client.join(code, 'Sam');
    await Client.synced(max, sam);
    const { message: welcome } = await sam.next(isWelcome);
    await stateAfter(max, { type: 'start' });

    expect(await sam.request({ type: 'kick', memberId: max.latest().you })).toMatchObject({
      code: 'not_host',
    });
    const from = sam.messages.length;
    const room = await stateAfter(max, { type: 'kick', memberId: welcome.memberId });
    expect(room.members.map((m) => m.nickname)).toEqual(['Max', 'Bot 1']);
    expect((await sam.next(isError, from)).message.code).toBe('kicked');
    await waitFor(() => sam.isClosed);

    const again = await Client.connect(code);
    again.send({ type: 'hello', token: welcome.token });
    expect((await again.next(isError)).message.code).toBe('nickname_required');
  });

  it('replaces an Away Player with a Bot', async () => {
    const code = await createRoom();
    const max = await Client.join(code, 'Max');
    const sam = await Client.join(code, 'Sam');
    await Client.synced(max, sam);
    const samId = (await sam.next(isWelcome)).message.memberId;
    expect(await max.request({ type: 'replaceWithBot', memberId: samId })).toMatchObject({
      code: 'not_away',
    });
    sam.close();
    await untilState(max, (r) => r.members.find((m) => m.id === samId)?.connected === false);
    const room = await stateAfter(max, { type: 'replaceWithBot', memberId: samId });
    expect(room.seats.map((id) => room.members.find((m) => m.id === id)!.nickname)).toEqual([
      'Max',
      'Bot 1',
    ]);
    expect(room.members.find((m) => m.id === samId)!.seated).toBe(false);
  });
});

describe('timers', () => {
  it('lets the Bot Pick when the Pick Timer runs out, using the alarm', async () => {
    const code = await createRoom();
    const stub = env.ROOMS.getByName(code);
    const max = await Client.join(code, 'Max');
    const sam = await Client.join(code, 'Sam');
    await Client.synced(max, sam);
    let room = await stateAfter(max, { type: 'settings', pickTimer: 30 });
    room = await stateAfter(max, { type: 'start' });
    expect(room.deadline).toBeGreaterThan(room.now);
    expect(room.deadline! - room.now).toBeLessThanOrEqual(30_000);
    await stateAfter(sam, { type: 'pick', card: sam.latest().game!.hand[0]! });

    // The alarm is set for the deadline. Move the deadline into the past and fire it.
    await runInDurableObject(stub, async (instance: RoomObject, state) => {
      const data = roomOf(instance);
      expect(await state.storage.getAlarm()).toBe(data.deadline!.at);
      data.deadline!.at = Date.now() - 1;
    });
    const from = max.messages.length;
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    room = await max.state(from);
    expect(room.game!.turn === 2 || room.game!.phase === 'choosingRow').toBe(true);
    expect(room.game!.hand).toHaveLength(9);
  });

  it('lets the Bot act for an Away Player after the Grace Period when the timer is off', async () => {
    const code = await createRoom();
    const stub = env.ROOMS.getByName(code);
    const max = await Client.join(code, 'Max');
    const sam = await Client.join(code, 'Sam');
    await Client.synced(max, sam);
    const samId = (await sam.next(isWelcome)).message.memberId;
    await stateAfter(max, { type: 'settings', pickTimer: 0 });
    let room = await stateAfter(max, { type: 'start' });
    expect(room.deadline).toBeNull();

    sam.close();
    room = await untilState(max, (r) => r.members.find((m) => m.id === samId)?.connected === false);
    expect(room.game!.seats[1]!.picked).toBe(false);

    await runInDurableObject(stub, async (instance: RoomObject, state) => {
      const data = roomOf(instance);
      expect(await state.storage.getAlarm()).toBe(data.awaySince[samId]! + GRACE_PERIOD_MS);
      data.awaySince[samId]! -= GRACE_PERIOD_MS;
    });
    const from = max.messages.length;
    await runDurableObjectAlarm(stub);
    room = await max.state(from);
    expect(room.game!.seats[1]!.picked).toBe(true);

    // Sam comes back with the token and plays on from the current Turn.
    const back = await Client.connect(code);
    back.send({ type: 'hello', token: (await sam.next(isWelcome)).message.token });
    room = await back.state();
    expect(room.you).toBe(samId);
    expect(room.game!.seat).toBe(1);
    expect(room.game!.pick).not.toBeNull();
  });

  it('hands Host on when the Host stays Away past the Grace Period', async () => {
    const code = await createRoom();
    const stub = env.ROOMS.getByName(code);
    const max = await Client.join(code, 'Max');
    const maxId = max.latest().you;
    const sam = await Client.join(code, 'Sam');
    await Client.synced(max, sam);
    max.close();
    await untilState(sam, (r) => r.members.find((m) => m.id === maxId)?.connected === false);

    await runInDurableObject(stub, (instance: RoomObject) => {
      roomOf(instance).awaySince[maxId]! -= GRACE_PERIOD_MS;
    });
    const from = sam.messages.length;
    await runDurableObjectAlarm(stub);
    expect((await sam.state(from)).hostId).toBe(sam.latest().you);
  });
});

describe('expiry', () => {
  it('deletes a Room after 24 hours without activity', async () => {
    const code = await createRoom();
    const stub = env.ROOMS.getByName(code);

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await stub.exists()).toBe(true);
    await runInDurableObject(stub, async (instance: RoomObject, state) => {
      const room = roomOf(instance);
      expect(await state.storage.getAlarm()).toBe(room.lastActivity + 24 * 60 * 60 * 1000);
    });

    // Pretend the last activity was 25 hours ago; the pending alarm then finds the Room expired.
    await runInDurableObject(stub, (instance: RoomObject) => {
      roomOf(instance).lastActivity -= 25 * 60 * 60 * 1000;
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await stub.exists()).toBe(false);
  });
});

function roomOf(instance: RoomObject): RoomData {
  return (instance as unknown as { room: RoomData }).room;
}

type Room = ReturnType<Client['latest']>;

/** Sends an intent and resolves with the next snapshot, failing on an error. */
async function stateAfter(client: Client, intent: ClientIntent): Promise<Room> {
  const message = await client.request(intent);
  if (message.type !== 'state') throw new Error(`expected state, got ${JSON.stringify(message)}`);
  return message.room;
}

/** Waits until a snapshot matches. */
async function untilState(client: Client, match: (room: Room) => boolean): Promise<Room> {
  let from = 0;
  for (;;) {
    const { message, index } = await client.next(isState, from);
    if (match(message.room)) return message.room;
    from = index + 1;
  }
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !condition(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(condition()).toBe(true);
}
