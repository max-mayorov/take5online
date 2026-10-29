import { exports, env } from 'cloudflare:workers';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOT_DELAY_MAX_MS, GRACE_PERIOD_MS, pickDeadline, type RoomData } from '../src/room';
import type { RoomObject } from '../src/room-object';
import { evaluateFlags, stackFrames, Telemetry } from '../src/posthog';
import { REACTION_LIMIT, type ClientIntent } from '@take5/protocol';
import { Client, createRoom, isError, isReaction, isState, isWelcome } from './client';

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

  it('rate-limits Room creation per IP', async () => {
    const create = () =>
      exports.default.fetch('http://test/api/rooms', {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '203.0.113.7' },
      });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await create()).status);
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('404s unknown API routes', async () => {
    expect((await exports.default.fetch('http://test/api/nope')).status).toBe(404);
  });
});

describe('PostHog proxy', () => {
  afterEach(() => vi.restoreAllMocks());

  const upstream = () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('ok'));
    return () => {
      const [input, init] = spy.mock.calls[0]!;
      return { url: String(input), init: init! };
    };
  };

  it('forwards events to the EU API without cookies, keeping the visitor IP', async () => {
    const sent = upstream();
    const response = await exports.default.fetch('http://test/relay/e/?ver=1', {
      method: 'POST',
      headers: { cookie: 'a=b', 'CF-Connecting-IP': '203.0.113.9' },
      body: '{"event":"x"}',
    });
    expect(await response.text()).toBe('ok');
    const { url, init } = sent();
    expect(url).toBe('https://eu.i.posthog.com/e/?ver=1');
    const headers = new Headers(init.headers);
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('X-Forwarded-For')).toBe('203.0.113.9');
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"event":"x"}');
  });

  it('serves SDK scripts from the EU asset host', async () => {
    const sent = upstream();
    await exports.default.fetch('http://test/relay/static/recorder.js?v=1');
    expect(sent().url).toBe('https://eu-assets.i.posthog.com/static/recorder.js?v=1');
  });
});

describe('PostHog from the Worker', () => {
  afterEach(() => vi.restoreAllMocks());

  const production = { ...env, POSTHOG: 'on' };
  const posthog = (body: unknown = {}) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(body));
  const telemetry = (environment: typeof env) => {
    const pending: Promise<unknown>[] = [];
    return { telemetry: new Telemetry(environment, (p) => pending.push(p)), pending };
  };
  const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

  it('sends nothing outside production', async () => {
    const spy = posthog();
    const { telemetry: t, pending } = telemetry(env);
    t.capture('worker_room_created', { room_code: 'ABCD' });
    t.log('info', 'Room created');
    t.captureException(new Error('boom'));
    expect(pending).toEqual([]);
    const response = await exports.default.fetch('http://test/api/flags');
    expect(await response.json()).toEqual({ flags: {} });
    expect(spy).not.toHaveBeenCalled();
  });

  it('captures Room events without a person profile or location', async () => {
    const spy = posthog();
    const { telemetry: t, pending } = telemetry(production);
    t.capture('worker_game_ended', { room_code: 'ABCD', players: 3 });
    await Promise.all(pending);
    expect(String(spy.mock.calls[0]![0])).toBe('https://eu.i.posthog.com/i/v0/e/');
    expect(bodyOf(spy.mock.calls[0]!)).toMatchObject({
      event: 'worker_game_ended',
      distinct_id: 'room:ABCD',
      properties: { room_code: 'ABCD', players: 3, $process_person_profile: false },
    });
  });

  it('reports exceptions with their stack, and logs them', async () => {
    const spy = posthog();
    const { telemetry: t, pending } = telemetry(production);
    t.captureException(new TypeError('nope'), { room_code: 'ABCD' });
    await Promise.all(pending);
    const [exception, log] = spy.mock.calls.map(bodyOf);
    expect(exception.event).toBe('$exception');
    expect(exception.properties.$exception_list[0]).toMatchObject({
      type: 'TypeError',
      value: 'nope',
    });
    expect(exception.properties.$exception_list[0].stacktrace.frames.length).toBeGreaterThan(0);
    expect(String(spy.mock.calls[1]![0])).toBe('https://eu.i.posthog.com/i/v1/logs');
    expect(log.resourceLogs[0].scopeLogs[0].logRecords[0]).toMatchObject({
      severityText: 'ERROR',
      body: { stringValue: 'TypeError: nope' },
      attributes: [{ key: 'room_code', value: { stringValue: 'ABCD' } }],
    });
  });

  it('reads V8 stack frames, outermost call first', () => {
    const frames = stackFrames(
      'Error: x\n    at commit (index.js:10:5)\n    at async alarm (index.js:20:7)\n    at index.js:30:1',
    );
    expect(frames.map((f) => [f.function, f.lineno, f.colno])).toEqual([
      ['?', 30, 1],
      ['async alarm', 20, 7],
      ['commit', 10, 5],
    ]);
  });

  it('evaluates flags once for everyone, keeping variants', async () => {
    const spy = posthog({
      flags: { reactions: { enabled: false }, layout: { enabled: true, variant: 'compact' } },
    });
    expect(await evaluateFlags(production)).toEqual({ reactions: false, layout: 'compact' });
    expect(bodyOf(spy.mock.calls[0]!)).toMatchObject({ distinct_id: 'everyone' });
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

describe('reactions', () => {
  it('broadcasts a Reaction to everyone in the Room, Spectators included', async () => {
    const code = await createRoom();
    const max = await Client.join(code, 'Max');
    const sam = await Client.join(code, 'Sam');
    const { message: welcome } = await max.next(isWelcome);
    const from = [max, sam].map((c) => c.messages.length);
    max.send({ type: 'react', emoji: '🐮' });
    for (const [i, client] of [max, sam].entries()) {
      const { message } = await client.next(isReaction, from[i]);
      expect(message).toMatchObject({ memberId: welcome.memberId, emoji: '🐮' });
    }
  });

  it('rejects an emoji outside the fixed set', async () => {
    const code = await createRoom();
    const max = await Client.join(code, 'Max');
    const from = max.messages.length;
    max.send({ type: 'react', emoji: '🤡' });
    expect((await max.next(isError, from)).message.code).toBe('bad_message');
    expect(max.messages.slice(from).some(isReaction)).toBe(false);
  });

  it('needs a Nickname first', async () => {
    const code = await createRoom();
    const client = await Client.connect(code);
    client.send({ type: 'react', emoji: '👍' });
    expect((await client.next(isError)).message.code).toBe('nickname_required');
  });

  it('drops Reactions over the per-member rate limit', async () => {
    const code = await createRoom();
    const max = await Client.join(code, 'Max');
    const sam = await Client.join(code, 'Sam');
    const from = sam.messages.length;
    for (let i = 0; i < REACTION_LIMIT + 3; i++) max.send({ type: 'react', emoji: '😂' });
    // Messages are handled in order, so once this snapshot arrives every Reaction has been seen.
    max.send({ type: 'sit' });
    await sam.state(from);
    expect(sam.messages.slice(from).filter(isReaction)).toHaveLength(REACTION_LIMIT);

    // Another member has their own allowance.
    sam.send({ type: 'react', emoji: '🎉' });
    expect((await sam.next(isReaction, sam.messages.length)).message.emoji).toBe('🎉');
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

    const stub = env.ROOMS.getByName(code);
    let room = await stateAfter(max, { type: 'start' });
    expect(room.game!.seats[1]!.picked).toBe(false);
    for (let moves = 0; room.phase === 'game'; moves++) {
      if (moves > 300) throw new Error('Game did not finish');
      const game = room.game!;
      const maxToMove =
        game.phase === 'choosingRow' ? game.choosingSeat === 0 : !game.seats[0]!.picked;
      if (maxToMove) {
        room = await stateAfter(
          max,
          game.phase === 'choosingRow'
            ? { type: 'chooseRow', row: 0 }
            : { type: 'pick', card: game.hand[0]! },
        );
      } else {
        // Max is waiting for the Bot to think it over.
        room = await skipBotThinking(stub, max);
      }
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
    room = await skipBotThinking(env.ROOMS.getByName(code), max);
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
      expect(await state.storage.getAlarm()).toBe(pickDeadline(data));
      data.decision!.since -= 30_000;
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

/**
 * Pretends the current decision began (its Reveal played) long enough ago for every Bot Seat,
 * and fires the alarm.
 */
async function skipBotThinking(stub: DurableObjectStub<RoomObject>, client: Client): Promise<Room> {
  await runInDurableObject(stub, async (instance: RoomObject, state) => {
    const data = roomOf(instance);
    expect(await state.storage.getAlarm()).toBeLessThanOrEqual(
      data.decision!.since + BOT_DELAY_MAX_MS,
    );
    data.decision!.since = Math.min(data.decision!.since, Date.now()) - BOT_DELAY_MAX_MS;
  });
  const from = client.messages.length;
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  return client.state(from);
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
