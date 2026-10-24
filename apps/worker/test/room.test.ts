import { cheapestRow, waitingOn } from '@take5/engine';
import { revealMs } from '@take5/protocol';
import { describe, expect, it } from 'vitest';
import {
  addBot,
  BOT_DELAY_MAX_MS,
  BOT_DELAY_MIN_MS,
  botDelay,
  changeSettings,
  createRoom,
  GRACE_PERIOD_MS,
  join,
  kick,
  leave,
  memberByToken,
  nextWakeup,
  pickDeadline,
  play,
  removeBot,
  replaceWithBot,
  ROOM_TTL_MS,
  roomView,
  sit,
  stand,
  start,
  syncPresence,
  takeSeat,
  tick,
  upgradeRoom,
  type RoomData,
} from '../src/room';

let counter = 0;
const ids = () => ({ id: `m${++counter}`, token: `t${counter}` });

function roomWith(...nicknames: string[]): { room: RoomData; members: string[] } {
  const room = createRoom('ABCD', 0);
  const members = nicknames.map((nickname) => {
    const joined = join(room, nickname, ids());
    if (!joined.ok) throw new Error(joined.error);
    return joined.member.id;
  });
  return { room, members };
}

describe('joining', () => {
  it('makes the first member Host and seats people while Seats are free', () => {
    const { room, members } = roomWith('Max', 'Sam');
    expect(room.hostId).toBe(members[0]);
    expect(room.seats).toEqual(members);
  });

  it('rejects a Nickname already in the Room, ignoring case', () => {
    const { room } = roomWith('Max');
    expect(join(room, 'max', ids())).toEqual({ ok: false, error: 'nickname_taken' });
  });

  it('makes the 11th person a Spectator, and caps Spectators at 20', () => {
    const { room } = roomWith(...Array.from({ length: 30 }, (_, i) => `p${i}`));
    expect(room.seats).toHaveLength(10);
    expect(room.members).toHaveLength(30);
    expect(join(room, 'one-too-many', ids())).toEqual({ ok: false, error: 'room_full' });
  });

  it('makes people arriving mid-Game Spectators', () => {
    const { room, members } = roomWith('Max', 'Sam');
    start(room, members[0]!, 1);
    const late = join(room, 'Late', ids());
    expect(late.ok && room.seats.includes(late.member.id)).toBe(false);
  });
});

describe('lobby', () => {
  it('lets people stand and sit again', () => {
    const { room, members } = roomWith('Max', 'Sam');
    stand(room, members[0]!);
    expect(room.seats).toEqual([members[1]]);
    sit(room, members[0]!);
    expect(room.seats).toEqual([members[1], members[0]]);
  });

  it('only lets the Host change settings and start', () => {
    const { room, members } = roomWith('Max', 'Sam');
    expect(changeSettings(room, members[1]!, { endScore: 30 })).toEqual({
      ok: false,
      error: 'not_host',
    });
    expect(start(room, members[1]!, 1)).toEqual({ ok: false, error: 'not_host' });
    expect(changeSettings(room, members[0]!, { endScore: 30 })).toMatchObject({ ok: true });
    expect(room.settings.endScore).toBe(30);
  });

  it('needs two seated Players to start', () => {
    const { room, members } = roomWith('Max');
    expect(start(room, members[0]!, 1)).toEqual({ ok: false, error: 'need_players' });
  });

  it('passes Host on when the Host leaves', () => {
    const { room, members } = roomWith('Max', 'Sam');
    leave(room, members[0]!);
    expect(room.hostId).toBe(members[1]);
    expect(room.members.map((m) => m.nickname)).toEqual(['Sam']);
  });
});

describe('a Game', () => {
  it('locks Seats while running', () => {
    const { room, members } = roomWith('Max', 'Sam');
    start(room, members[0]!, 1);
    expect(stand(room, members[0]!)).toEqual({ ok: false, error: 'game_in_progress' });
    expect(sit(room, members[0]!)).toEqual({ ok: false, error: 'game_in_progress' });
    expect(changeSettings(room, members[0]!, { endScore: 20 })).toEqual({
      ok: false,
      error: 'game_in_progress',
    });
    expect(addBot(room, members[0]!)).toEqual({ ok: false, error: 'game_in_progress' });
  });

  it('rejects moves from people without a Seat', () => {
    const { room, members } = roomWith('Max', 'Sam');
    start(room, members[0]!, 1);
    const spectator = join(room, 'Watcher', ids());
    if (!spectator.ok) throw new Error();
    expect(play(room, spectator.member.id, { type: 'pick', card: 1 }, 0)).toEqual({
      ok: false,
      error: 'not_seated',
    });
  });

  it('plays to Results and records Session Totals across Rematches', () => {
    const { room, members } = roomWith('Max', 'Sam');
    changeSettings(room, members[0]!, { endScore: 10 });
    for (const game of [1, 2]) {
      expect(start(room, members[0]!, game)).toMatchObject({ ok: true });
      playOut(room);
      expect(room.phase).toBe('results');
    }
    expect(room.totals.map((t) => t.games)).toEqual([2, 2]);
    expect(room.totals.reduce((n, t) => n + t.wins, 0)).toBeGreaterThanOrEqual(2);
    expect(room.totals.every((t) => t.bullHeads > 0 || t.wins > 0)).toBe(true);
  });
});

describe('roomView', () => {
  it('shows a member only their own Hand and marks who is connected', () => {
    const { room, members } = roomWith('Max', 'Sam');
    start(room, members[0]!, 1);
    const view = roomView(room, members[1]!, new Set([members[1]!]), 0);
    expect(view.game?.seat).toBe(1);
    expect(view.game?.hand).toEqual(room.game!.hands[1]);
    expect(view.members.map((m) => m.connected)).toEqual([false, true]);
    expect(JSON.stringify(view)).not.toContain('"token"');
  });
});

describe('Bots in the Lobby', () => {
  it('lets the Host seat Bots named Bot 1, Bot 2, … and remove them', () => {
    const { room, members } = roomWith('Max');
    expect(addBot(room, members[0]!)).toMatchObject({ ok: true });
    expect(addBot(room, members[0]!)).toMatchObject({ ok: true });
    const bots = room.members.filter((m) => m.bot);
    expect(bots.map((b) => b.nickname)).toEqual(['Bot 1', 'Bot 2']);
    expect(room.seats).toEqual([members[0], ...bots.map((b) => b.id)]);

    expect(removeBot(room, members[0]!, bots[0]!.id)).toMatchObject({ ok: true });
    expect(room.seats).toEqual([members[0], bots[1]!.id]);
    // The freed name is reused; the id is not.
    addBot(room, members[0]!);
    const again = room.members.find((m) => m.nickname === 'Bot 1')!;
    expect(again.id).not.toBe(bots[1]!.id);
    expect(room.seats).toHaveLength(3);
  });

  it('only lets the Host add or remove Bots, and only Bots', () => {
    const { room, members } = roomWith('Max', 'Sam');
    expect(addBot(room, members[1]!)).toEqual({ ok: false, error: 'not_host' });
    addBot(room, members[0]!);
    const bot = room.members.find((m) => m.bot)!;
    expect(removeBot(room, members[1]!, bot.id)).toEqual({ ok: false, error: 'not_host' });
    expect(removeBot(room, members[0]!, members[1]!)).toEqual({ ok: false, error: 'not_a_bot' });
    expect(removeBot(room, members[0]!, 'nobody')).toEqual({ ok: false, error: 'unknown_member' });
  });

  it('stops adding Bots once all ten Seats are taken', () => {
    const { room, members } = roomWith('Max');
    for (let i = 0; i < 9; i++) expect(addBot(room, members[0]!)).toMatchObject({ ok: true });
    expect(addBot(room, members[0]!)).toEqual({ ok: false, error: 'room_full' });
  });

  it('keeps Bot names for Bots', () => {
    const { room } = roomWith('Max');
    expect(join(room, 'bot 7', ids())).toEqual({ ok: false, error: 'nickname_taken' });
    expect(join(room, 'Bottle', ids())).toMatchObject({ ok: true });
  });

  it('never matches a Bot by token', () => {
    const { room, members } = roomWith('Max');
    addBot(room, members[0]!);
    expect(memberByToken(room, '')).toBeUndefined();
  });

  it('shows Bots in the snapshot, never as connected', () => {
    const { room, members } = roomWith('Max');
    addBot(room, members[0]!);
    const bot = room.members.find((m) => m.bot)!;
    const view = roomView(room, members[0]!, new Set([members[0]!, bot.id]), 0);
    expect(view.members[1]).toEqual({
      id: bot.id,
      nickname: 'Bot 1',
      connected: false,
      seated: true,
      bot: true,
    });
  });
});

describe('playing with Bots', () => {
  it('plays a whole Game for one Player against a Bot, with Bot totals', () => {
    const { room, members } = roomWith('Max');
    addBot(room, members[0]!);
    changeSettings(room, members[0]!, { endScore: 10 });
    let now = 0;
    for (const game of [1, 2]) {
      start(room, members[0]!, game);
      // Each step the Bot has had time to think, then Max makes any move that is his.
      for (let moves = 0; room.phase === 'game'; moves++) {
        if (moves > 500) throw new Error('Game did not finish');
        now += BOT_DELAY_MAX_MS;
        tick(room, now);
        const g = room.game!;
        if (room.phase !== 'game' || !waitingOn(g).includes(0)) continue;
        const result =
          g.phase === 'choosingRow'
            ? play(room, members[0]!, { type: 'chooseRow', row: 0 }, now)
            : play(room, members[0]!, { type: 'pick', card: g.hands[0]![0]! }, now);
        expect(result).toMatchObject({ ok: true });
        tick(room, now);
      }
    }
    expect(room.totals.map((t) => [t.nickname, t.bot, t.games])).toEqual([
      ['Max', false, 2],
      ['Bot 1', true, 2],
    ]);
  });

  it('gives a leaving Player’s Seat to a Bot, which plays on', () => {
    const { room, members } = roomWith('Max', 'Sam');
    start(room, members[0]!, 1);
    expect(leave(room, members[1]!)).toMatchObject({ ok: true });
    expect(room.gameSeats[1]).toMatchObject({ nickname: 'Bot 1', bot: true });
    expect(room.seats[1]).toBe(room.gameSeats[1]!.memberId);
    expect(room.members.map((m) => m.nickname)).toEqual(['Max', 'Bot 1']);

    expect(tick(room, 0)).toEqual([{ type: 'turnStarted', round: 1, turn: 1 }]);
    expect(tick(room, BOT_DELAY_MAX_MS)).toEqual([{ type: 'picked', seat: 1 }]);
  });

  it('lets a Bot Seat think for a few seconds before each move', () => {
    const { room, members } = roomWith('Max');
    addBot(room, members[0]!);
    addBot(room, members[0]!);
    start(room, members[0]!, 7);
    tick(room, 10_000);
    const due = [1, 2].map((seat) => 10_000 + botDelay(7, room.decision!.key, seat));
    for (const at of due) {
      expect(at - 10_000).toBeGreaterThanOrEqual(BOT_DELAY_MIN_MS);
      expect(at - 10_000).toBeLessThanOrEqual(BOT_DELAY_MAX_MS);
    }
    expect(nextWakeup(room, 10_000)).toBe(Math.min(...due));
    expect(tick(room, Math.min(...due) - 1)).toEqual([]);
    expect(tick(room, Math.max(...due))).toEqual([
      { type: 'picked', seat: 1 },
      { type: 'picked', seat: 2 },
    ]);
  });

  it('starts each decision, and the Bots’ thinking and Pick Timer, once its Reveal has played', () => {
    const { room, members } = roomWith('Max');
    for (let i = 0; i < 9; i++) addBot(room, members[0]!);
    changeSettings(room, members[0]!, { pickTimer: 30 });
    start(room, members[0]!, 3);
    expect(tick(room, 1000)).toEqual([{ type: 'turnStarted', round: 1, turn: 1 }]);
    tick(room, 1000 + BOT_DELAY_MAX_MS);
    expect(waitingOn(room.game!)).toEqual([0]);

    // Max's Pick completes the Turn; ten Cards take a while to Reveal and Place.
    const at = 2000 + BOT_DELAY_MAX_MS;
    const card = room.game!.hands[0]!.at(-1)!;
    const result = play(room, members[0]!, { type: 'pick', card }, at);
    if (!result.ok) throw new Error(result.error);
    const since = at + revealMs(result.events);
    expect(since - at).toBeGreaterThan(BOT_DELAY_MAX_MS);
    expect(tick(room, at)).toEqual([]);
    expect(room.decision).toMatchObject({ since, started: false });
    expect(nextWakeup(room, at)).toBe(since);
    expect(pickDeadline(room)).toBe(since + 30_000);

    // Nobody moves for the Bots before the Reveal is over.
    expect(tick(room, since - 1)).toEqual([]);
    expect(tick(room, since)).toEqual([{ type: 'turnStarted', round: 1, turn: 2 }]);
    expect(room.decision!.started).toBe(true);
    expect(tick(room, since + BOT_DELAY_MIN_MS - 1)).toEqual([]);
  });

  it('queues Reveals that follow each other, as the clients play them', () => {
    const { room, members } = roomWith('Max', 'Sam');
    start(room, members[0]!, 1);
    tick(room, 0);
    const pick = (seat: number, now: number) =>
      play(room, members[seat]!, { type: 'pick', card: room.game!.hands[seat]!.at(-1)! }, now);
    pick(0, 0);
    const first = pick(1, 0);
    if (!first.ok) throw new Error(first.error);
    expect(room.revealEnds).toBe(revealMs(first.events));
    tick(room, 0);
    expect(room.game!.phase).toBe('picking');
    // Picks made while the first Reveal still plays: the second one queues behind it.
    pick(0, 100);
    const second = pick(1, 100);
    if (!second.ok) throw new Error(second.error);
    expect(room.revealEnds).toBe(revealMs(first.events) + revealMs(second.events));
  });

  it('derives Bot thinking time from the seed, varying by Seat and decision', () => {
    expect(botDelay(1, '1.1', 1)).toBe(botDelay(1, '1.1', 1));
    const delays = new Set(
      [1, 2, 3].flatMap((seed) =>
        ['1.1', '1.2', '1.2.3'].flatMap((key) =>
          [0, 1, 2].map((seat) => botDelay(seed, key, seat)),
        ),
      ),
    );
    expect(delays.size).toBeGreaterThan(20);
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(BOT_DELAY_MIN_MS);
      expect(delay).toBeLessThanOrEqual(BOT_DELAY_MAX_MS);
    }
  });

  it('lets a Spectator take over a Bot’s Seat mid-Game, Hand and Score included', () => {
    const { room, members } = roomWith('Max', 'Sam');
    start(room, members[0]!, 1);
    leave(room, members[1]!);
    tick(room, 0);
    tick(room, BOT_DELAY_MAX_MS);
    const late = join(room, 'Late', ids());
    if (!late.ok) throw new Error();
    const hand = room.game!.hands[1];

    expect(takeSeat(room, late.member.id, 0)).toEqual({ ok: false, error: 'not_a_bot' });
    expect(takeSeat(room, late.member.id, 7)).toEqual({ ok: false, error: 'invalid_seat' });
    expect(takeSeat(room, late.member.id, 1)).toMatchObject({ ok: true });
    expect(room.gameSeats[1]).toEqual({ memberId: late.member.id, nickname: 'Late', bot: false });
    expect(room.members.some((m) => m.bot)).toBe(false);
    expect(roomView(room, late.member.id, new Set(), 0).game?.hand).toEqual(hand);
    // The Bot's Pick this Turn stands; Late may change it until the Reveal.
    expect(
      play(room, late.member.id, { type: 'pick', card: hand![0]! }, BOT_DELAY_MAX_MS),
    ).toMatchObject({
      ok: true,
    });
    expect(takeSeat(room, members[0]!, 1)).toEqual({ ok: false, error: 'invalid_target' });
  });

  it('lets a Spectator take a Bot’s Seat in the Lobby', () => {
    const { room, members } = roomWith('Max');
    addBot(room, members[0]!);
    stand(room, members[0]!);
    expect(takeSeat(room, members[0]!, 0)).toMatchObject({ ok: true });
    expect(room.seats).toEqual([members[0]]);
  });
});

describe('Host controls', () => {
  it('kicks a seated Player mid-Game: a Bot takes the Seat and the token stops working', () => {
    const { room, members } = roomWith('Max', 'Sam', 'Kim');
    start(room, members[0]!, 1);
    const samToken = room.members[1]!.token;
    expect(kick(room, members[1]!, members[2]!)).toEqual({ ok: false, error: 'not_host' });
    expect(kick(room, members[0]!, members[0]!)).toEqual({ ok: false, error: 'invalid_target' });
    expect(kick(room, members[0]!, 'ghost')).toEqual({ ok: false, error: 'unknown_member' });

    expect(kick(room, members[0]!, members[1]!)).toMatchObject({ ok: true });
    expect(memberByToken(room, samToken)).toBeUndefined();
    expect(room.gameSeats.map((s) => s.nickname)).toEqual(['Max', 'Bot 1', 'Kim']);
    const bot = room.gameSeats[1]!.memberId;
    expect(kick(room, members[0]!, bot)).toEqual({ ok: false, error: 'invalid_target' });
  });

  it('kicks a Spectator or Lobby Player outright', () => {
    const { room, members } = roomWith('Max', 'Sam');
    kick(room, members[0]!, members[1]!);
    expect(room.members.map((m) => m.nickname)).toEqual(['Max']);
    expect(room.seats).toEqual([members[0]]);
  });

  it('replaces only an Away Player with a Bot, who stays on as a Spectator', () => {
    const { room, members } = roomWith('Max', 'Sam');
    start(room, members[0]!, 1);
    syncPresence(room, new Set(members), 0);
    expect(replaceWithBot(room, members[0]!, members[1]!)).toEqual({
      ok: false,
      error: 'not_away',
    });
    syncPresence(room, new Set([members[0]!]), 0);
    expect(replaceWithBot(room, members[1]!, members[1]!)).toEqual({
      ok: false,
      error: 'not_host',
    });
    expect(replaceWithBot(room, members[0]!, members[1]!)).toMatchObject({ ok: true });
    expect(room.gameSeats[1]).toMatchObject({ nickname: 'Bot 1', bot: true });
    expect(room.members.find((m) => m.id === members[1])?.nickname).toBe('Sam');
    expect(room.seats.includes(members[1]!)).toBe(false);

    // Back again, Sam can reclaim the Seat from the Bot.
    syncPresence(room, new Set(members), 1);
    expect(takeSeat(room, members[1]!, 1)).toMatchObject({ ok: true });
    expect(room.gameSeats[1]).toMatchObject({ memberId: members[1], bot: false });
  });

  it('hands Host to the next connected Player in Seat order when the Host leaves', () => {
    const { room, members } = roomWith('Max', 'Sam', 'Kim', 'Lee');
    syncPresence(room, new Set([members[0]!, members[3]!, members[1]!]), 0);
    leave(room, members[0]!);
    // Sam is next in Seat order and connected.
    expect(room.hostId).toBe(members[1]);
    syncPresence(room, new Set([members[3]!]), 0);
    leave(room, members[1]!);
    // Kim is Away, so Lee.
    expect(room.hostId).toBe(members[3]);
  });

  it('hands Host on once the Host has been Away for the Grace Period', () => {
    const { room, members } = roomWith('Max', 'Sam', 'Kim');
    addBot(room, members[0]!);
    syncPresence(room, new Set([members[2]!]), 1000);
    tick(room, 1000 + GRACE_PERIOD_MS - 1);
    expect(room.hostId).toBe(members[0]);
    expect(nextWakeup(room, 1000)).toBe(1000 + GRACE_PERIOD_MS);
    tick(room, 1000 + GRACE_PERIOD_MS);
    // Sam is Away too; Bots are never Host.
    expect(room.hostId).toBe(members[2]);
  });

  it('keeps an Away Host when nobody else is connected', () => {
    const { room, members } = roomWith('Max', 'Sam');
    syncPresence(room, new Set(), 0);
    tick(room, GRACE_PERIOD_MS * 10);
    expect(room.hostId).toBe(members[0]);
    syncPresence(room, new Set([members[1]!]), GRACE_PERIOD_MS * 10);
    tick(room, GRACE_PERIOD_MS * 10);
    expect(room.hostId).toBe(members[1]);
  });
});

describe('Pick Timer', () => {
  it('is off by default and can be set to 30 or 60 seconds', () => {
    const { room, members } = roomWith('Max', 'Sam');
    expect(room.settings.pickTimer).toBe(0);
    start(room, members[0]!, 1);
    tick(room, 0);
    expect(pickDeadline(room)).toBeNull();
    expect(roomView(room, members[0]!, new Set(), 0).deadline).toBeNull();
    expect(nextWakeup(room, 0)).toBe(room.lastActivity + ROOM_TTL_MS);
    playOut(room);
    changeSettings(room, members[0]!, { pickTimer: 60 });
    expect(room.settings).toEqual({ endScore: 66, pickTimer: 60 });
    changeSettings(room, members[0]!, { pickTimer: 30 });
    expect(room.settings.pickTimer).toBe(30);
  });

  it('lets the Bot Pick for everyone still Picking when it runs out', () => {
    const { room, members } = roomWith('Max', 'Sam', 'Kim');
    changeSettings(room, members[0]!, { pickTimer: 30 });
    start(room, members[0]!, 1);
    tick(room, 1000);
    expect(pickDeadline(room)).toBe(31_000);
    expect(roomView(room, members[0]!, new Set(), 2000)).toMatchObject({
      deadline: 31_000,
      now: 2000,
    });
    expect(nextWakeup(room, 1000)).toBe(31_000);

    play(room, members[0]!, { type: 'pick', card: room.game!.hands[0]![0]! }, 2000);
    expect(tick(room, 30_999)).toEqual([]);
    const events = tick(room, 31_000);
    expect(events.slice(0, 3)).toEqual([
      { type: 'picked', seat: 1 },
      { type: 'picked', seat: 2 },
      expect.objectContaining({ type: 'revealed' }),
    ]);
    // A fresh Pick Timer for the next decision, once its Reveal has played.
    expect(pickDeadline(room)).toBe(31_000 + revealMs(events) + 30_000);
  });

  it('lets the Bot Take the cheapest Row when a Low Card choice runs out', () => {
    const { room, members } = roomWith('Max', 'Sam');
    changeSettings(room, members[0]!, { pickTimer: 60 });
    for (let seed = 1; ; seed++) {
      start(room, members[0]!, seed);
      // Both Pick their lowest Card until someone must choose a Row.
      while (room.phase === 'game' && room.game!.phase === 'picking') {
        room.gameSeats.forEach(({ memberId }, seat) => {
          if (room.game!.phase === 'picking' && room.game!.picks[seat] === null) {
            play(room, memberId, { type: 'pick', card: room.game!.hands[seat]![0]! }, 0);
          }
        });
      }
      if (room.phase === 'game') break;
    }
    const { seat: chooser, card } = room.game!.unplaced[0]!;
    const cheapest = cheapestRow(room.game!.board);
    // The choice starts once the Reveals so far have played.
    const at = room.revealEnds;
    expect(tick(room, at)).toEqual([{ type: 'rowChoiceStarted', seat: chooser, card }]);
    expect(pickDeadline(room)).toBe(at + 60_000);
    expect(tick(room, at + 59_999)).toEqual([]);
    const events = tick(room, at + 60_000);
    expect(events[0]).toMatchObject({ type: 'rowTaken', seat: chooser, row: cheapest });
  });

  it('covers Away Players when it runs out before their Grace Period ends', () => {
    const { room, members } = roomWith('Max', 'Sam');
    changeSettings(room, members[0]!, { pickTimer: 30 });
    start(room, members[0]!, 1);
    syncPresence(room, new Set([members[0]!]), 0);
    tick(room, 0);
    expect(nextWakeup(room, 0)).toBe(30_000);
    play(room, members[0]!, { type: 'pick', card: room.game!.hands[0]![0]! }, 0);
    expect(tick(room, 29_999)).toEqual([]);
    expect(tick(room, 30_000)[0]).toEqual({ type: 'picked', seat: 1 });
  });

  it('lets the Grace Period end first for someone Away since before the decision', () => {
    const { room, members } = roomWith('Max', 'Sam');
    changeSettings(room, members[0]!, { pickTimer: 60 });
    start(room, members[0]!, 1);
    syncPresence(room, new Set([members[0]!]), 0);
    tick(room, 30_000);
    play(room, members[0]!, { type: 'pick', card: room.game!.hands[0]![0]! }, 30_000);
    expect(pickDeadline(room)).toBe(90_000);
    expect(nextWakeup(room, 30_000)).toBe(GRACE_PERIOD_MS);
    expect(tick(room, GRACE_PERIOD_MS - 1)).toEqual([]);
    expect(tick(room, GRACE_PERIOD_MS)[0]).toEqual({ type: 'picked', seat: 1 });
  });
});

describe('Away Players with the Pick Timer off', () => {
  function awayGame() {
    const { room, members } = roomWith('Max', 'Sam');
    changeSettings(room, members[0]!, { pickTimer: 0 });
    start(room, members[0]!, 1);
    syncPresence(room, new Set([members[0]!]), 1000);
    return { room, members };
  }

  it('waits the Grace Period, then lets the Bot act for them on every decision', () => {
    const { room, members } = awayGame();
    expect(tick(room, 1000)).toEqual([{ type: 'turnStarted', round: 1, turn: 1 }]);
    expect(pickDeadline(room)).toBeNull();
    expect(nextWakeup(room, 1000)).toBe(1000 + GRACE_PERIOD_MS);
    expect(tick(room, GRACE_PERIOD_MS)).toEqual([]);
    expect(tick(room, 1000 + GRACE_PERIOD_MS)).toEqual([{ type: 'picked', seat: 1 }]);

    // From now on the Bot acts for Sam as soon as each decision starts, Turn after Turn.
    const turn = room.game!.turn;
    let now = 1000 + GRACE_PERIOD_MS;
    play(room, members[0]!, { type: 'pick', card: room.game!.hands[0]![0]! }, now);
    now = room.revealEnds;
    tick(room, now);
    if (room.game!.phase === 'choosingRow' && room.game!.unplaced[0]!.seat === 0) {
      play(room, members[0]!, { type: 'chooseRow', row: 0 }, now);
      now = room.revealEnds;
      tick(room, now);
    }
    expect(room.game!.turn).toBe(turn + 1);
    expect(room.game!.picks[1]).not.toBeNull();
  });

  it('stops when they come back', () => {
    const { room, members } = awayGame();
    syncPresence(room, new Set(members), 2000);
    expect(tick(room, 1000 + GRACE_PERIOD_MS)).toEqual([
      { type: 'turnStarted', round: 1, turn: 1 },
    ]);
    expect(nextWakeup(room, 2000)).toBe(room.lastActivity + ROOM_TTL_MS);
  });

  it('stands still while nobody at all is connected', () => {
    const { room } = awayGame();
    syncPresence(room, new Set(), 2000);
    expect(tick(room, 10 * GRACE_PERIOD_MS)).toEqual([]);
    expect(nextWakeup(room, 2000)).toBe(room.lastActivity + ROOM_TTL_MS);
  });
});

describe('presence', () => {
  it('records when people go Away and forgets it when they return', () => {
    const { room, members } = roomWith('Max', 'Sam');
    addBot(room, members[0]!);
    expect(syncPresence(room, new Set([members[0]!]), 5)).toBe(true);
    expect(room.awaySince).toEqual({ [members[1]!]: 5 });
    expect(syncPresence(room, new Set([members[0]!]), 9)).toBe(false);
    expect(room.awaySince).toEqual({ [members[1]!]: 5 });
    syncPresence(room, new Set(members), 10);
    expect(room.awaySince).toEqual({});
  });

  it('upgrades a Room stored before Bots and timers existed', () => {
    const { room } = roomWith('Max');
    const old = JSON.parse(JSON.stringify(room)) as Record<string, unknown>;
    delete old.awaySince;
    delete old.decision;
    delete old.revealEnds;
    old.deadline = null;
    (old.settings as Record<string, unknown>).pickTimer = undefined;
    (old.settings as Record<string, unknown>).animateCards = false;
    for (const m of old.members as Record<string, unknown>[]) delete m.bot;
    const upgraded = upgradeRoom(old as unknown as RoomData);
    expect(upgraded.settings.pickTimer).toBe(0);
    expect('animateCards' in upgraded.settings).toBe(false);
    expect(upgraded.members[0]!.bot).toBe(false);
    expect(upgraded.awaySince).toEqual({});
    expect(upgraded.decision).toBeNull();
    expect(upgraded.revealEnds).toBe(0);
    expect('deadline' in upgraded).toBe(false);
  });
});

/** Plays the current Game to the end: everyone Picks their lowest Card and Takes Row 0. */
function playOut(room: RoomData): void {
  while (room.phase === 'game') {
    const game = room.game!;
    room.gameSeats.forEach(({ memberId }, seat) => {
      if (room.phase !== 'game') return;
      if (room.game!.phase === 'choosingRow' && room.game!.unplaced[0]?.seat === seat) {
        play(room, memberId, { type: 'chooseRow', row: 0 }, 0);
      } else if (room.game!.phase === 'picking' && room.game!.picks[seat] === null) {
        play(room, memberId, { type: 'pick', card: room.game!.hands[seat]![0]! }, 0);
      }
    });
    if (room.game === game) throw new Error('no progress');
  }
}
