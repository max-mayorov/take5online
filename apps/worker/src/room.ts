import {
  applyAction,
  MAX_SEATS,
  MIN_SEATS,
  newGame,
  viewFor,
  type Action,
  type GameEvent,
  type GameState,
} from '@take5/engine';
import {
  DEFAULT_END_SCORE,
  MAX_SPECTATORS,
  type ErrorCode,
  type GameSeatView,
  type RoomPhase,
  type RoomView,
  type SessionTotal,
} from '@take5/protocol';

export interface Member {
  id: string;
  /** Secret that reclaims this member's place; never shown to anyone else. */
  token: string;
  nickname: string;
}

/** The whole persisted state of one Room. */
export interface RoomData {
  code: string;
  hostId: string | null;
  members: Member[];
  /** Member ids seated for the next Game, in Seat order. */
  seats: string[];
  settings: { endScore: number };
  phase: RoomPhase;
  game: GameState | null;
  gameSeats: GameSeatView[];
  totals: SessionTotal[];
  lastActivity: number;
}

export type RoomResult = { ok: true; events: GameEvent[] } | { ok: false; error: ErrorCode };

const ok = (events: GameEvent[] = []): RoomResult => ({ ok: true, events });
const fail = (error: ErrorCode): RoomResult => ({ ok: false, error });

export function createRoom(code: string, now: number): RoomData {
  return {
    code,
    hostId: null,
    members: [],
    seats: [],
    settings: { endScore: DEFAULT_END_SCORE },
    phase: 'lobby',
    game: null,
    gameSeats: [],
    totals: [],
    lastActivity: now,
  };
}

export function memberByToken(room: RoomData, token: string): Member | undefined {
  return room.members.find((m) => m.token === token);
}

/** Adds a new member: seated if a Seat is free outside a Game, otherwise a Spectator. */
export function join(
  room: RoomData,
  nickname: string,
  ids: { id: string; token: string },
): { ok: true; member: Member } | { ok: false; error: ErrorCode } {
  const taken = room.members.some((m) => m.nickname.toLowerCase() === nickname.toLowerCase());
  if (taken) return { ok: false, error: 'nickname_taken' };
  const sits = room.phase !== 'game' && room.seats.length < MAX_SEATS;
  const spectators = room.members.length - room.seats.length;
  if (!sits && spectators >= MAX_SPECTATORS) return { ok: false, error: 'room_full' };

  const member = { ...ids, nickname };
  room.members.push(member);
  if (sits) room.seats.push(member.id);
  room.hostId ??= member.id;
  return { ok: true, member };
}

export function sit(room: RoomData, memberId: string): RoomResult {
  if (room.phase === 'game') return fail('game_in_progress');
  if (room.seats.includes(memberId)) return ok();
  if (room.seats.length >= MAX_SEATS) return fail('room_full');
  room.seats.push(memberId);
  return ok();
}

export function stand(room: RoomData, memberId: string): RoomResult {
  if (room.phase === 'game') return fail('game_in_progress');
  room.seats = room.seats.filter((id) => id !== memberId);
  return ok();
}

/** Removes a member for good. Players in a running Game can't leave until M4 adds Bots. */
export function leave(room: RoomData, memberId: string): RoomResult {
  if (room.phase === 'game' && room.gameSeats.some((s) => s.memberId === memberId)) {
    return fail('game_in_progress');
  }
  room.members = room.members.filter((m) => m.id !== memberId);
  room.seats = room.seats.filter((id) => id !== memberId);
  if (room.hostId === memberId) room.hostId = room.seats[0] ?? room.members[0]?.id ?? null;
  return ok();
}

export function setEndScore(room: RoomData, memberId: string, endScore: number): RoomResult {
  if (room.hostId !== memberId) return fail('not_host');
  if (room.phase === 'game') return fail('game_in_progress');
  room.settings.endScore = endScore;
  return ok();
}

/** Starts a Game (or a Rematch) with the current Seats. */
export function start(room: RoomData, memberId: string, seed: number): RoomResult {
  if (room.hostId !== memberId) return fail('not_host');
  if (room.phase === 'game') return fail('game_in_progress');
  if (room.seats.length < MIN_SEATS) return fail('need_players');

  const { state, events } = newGame(
    { seatCount: room.seats.length, endScore: room.settings.endScore },
    seed,
  );
  room.game = state;
  room.gameSeats = room.seats.map((id) => ({ memberId: id, nickname: nicknameOf(room, id) }));
  room.phase = 'game';
  return ok(events);
}

export type PlayIntent = { type: 'pick'; card: number } | { type: 'chooseRow'; row: number };

/** A seated Player's move in the running Game. */
export function play(room: RoomData, memberId: string, intent: PlayIntent): RoomResult {
  if (room.phase !== 'game' || !room.game) return fail('wrong_phase');
  const seat = room.gameSeats.findIndex((s) => s.memberId === memberId);
  if (seat === -1) return fail('not_seated');

  const action: Action =
    intent.type === 'pick'
      ? { type: 'pick', seat, card: intent.card }
      : { type: 'chooseRow', seat, row: intent.row };
  const result = applyAction(room.game, action);
  if (!result.ok) return fail(result.error);

  room.game = result.state;
  if (result.state.phase === 'gameOver') finishGame(room, result.state);
  return ok(result.events);
}

function finishGame(room: RoomData, game: GameState): void {
  room.phase = 'results';
  room.gameSeats.forEach(({ memberId, nickname }, seat) => {
    let total = room.totals.find((t) => t.memberId === memberId);
    if (!total) {
      total = { memberId, nickname, games: 0, wins: 0, bullHeads: 0 };
      room.totals.push(total);
    }
    total.nickname = nickname;
    total.games += 1;
    total.bullHeads += game.scores[seat]!;
    if (game.winners.includes(seat)) total.wins += 1;
  });
}

function nicknameOf(room: RoomData, memberId: string): string {
  return room.members.find((m) => m.id === memberId)?.nickname ?? '?';
}

/** What `memberId` may see of the Room, given who is connected right now. */
export function roomView(
  room: RoomData,
  memberId: string,
  connected: ReadonlySet<string>,
): RoomView {
  const seat = room.gameSeats.findIndex((s) => s.memberId === memberId);
  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId ?? '',
    you: memberId,
    members: room.members.map((m) => ({
      id: m.id,
      nickname: m.nickname,
      connected: connected.has(m.id),
      seated: room.seats.includes(m.id),
    })),
    seats: [...room.seats],
    settings: { ...room.settings },
    game: room.game ? viewFor(room.game, seat === -1 ? null : seat) : null,
    gameSeats: room.gameSeats.map((s) => ({ ...s })),
    totals: room.totals.map((t) => ({ ...t })),
  };
}
