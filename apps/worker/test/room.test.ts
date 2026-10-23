import { describe, expect, it } from 'vitest';
import {
  createRoom,
  join,
  leave,
  play,
  roomView,
  setEndScore,
  sit,
  stand,
  start,
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
    expect(setEndScore(room, members[1]!, 30)).toEqual({ ok: false, error: 'not_host' });
    expect(start(room, members[1]!, 1)).toEqual({ ok: false, error: 'not_host' });
    expect(setEndScore(room, members[0]!, 30)).toMatchObject({ ok: true });
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
    expect(leave(room, members[1]!)).toEqual({ ok: false, error: 'game_in_progress' });
    expect(setEndScore(room, members[0]!, 20)).toEqual({ ok: false, error: 'game_in_progress' });
  });

  it('rejects moves from people without a Seat', () => {
    const { room, members } = roomWith('Max', 'Sam');
    start(room, members[0]!, 1);
    const spectator = join(room, 'Watcher', ids());
    if (!spectator.ok) throw new Error();
    expect(play(room, spectator.member.id, { type: 'pick', card: 1 })).toEqual({
      ok: false,
      error: 'not_seated',
    });
  });

  it('plays to Results and records Session Totals across Rematches', () => {
    const { room, members } = roomWith('Max', 'Sam');
    setEndScore(room, members[0]!, 10);
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
    const view = roomView(room, members[1]!, new Set([members[1]!]));
    expect(view.game?.seat).toBe(1);
    expect(view.game?.hand).toEqual(room.game!.hands[1]);
    expect(view.members.map((m) => m.connected)).toEqual([false, true]);
    expect(JSON.stringify(view)).not.toContain('"token"');
  });
});

/** Plays the current Game to the end: everyone Picks their lowest Card and Takes Row 0. */
function playOut(room: RoomData): void {
  while (room.phase === 'game') {
    const game = room.game!;
    room.gameSeats.forEach(({ memberId }, seat) => {
      if (room.phase !== 'game') return;
      if (room.game!.phase === 'choosingRow' && room.game!.unplaced[0]?.seat === seat) {
        play(room, memberId, { type: 'chooseRow', row: 0 });
      } else if (room.game!.phase === 'picking' && room.game!.picks[seat] === null) {
        play(room, memberId, { type: 'pick', card: room.game!.hands[seat]![0]! });
      }
    });
    if (room.game === game) throw new Error('no progress');
  }
}
