import {
  applyAction,
  botAction,
  MAX_SEATS,
  MIN_SEATS,
  newGame,
  viewFor,
  waitingOn,
  type Action,
  type GameEvent,
  type GameState,
} from '@take5/engine';
import {
  DEFAULT_END_SCORE,
  DEFAULT_PICK_TIMER,
  MAX_SPECTATORS,
  type ErrorCode,
  type GameSeatView,
  type PickTimer,
  type RoomPhase,
  type RoomView,
  type SessionTotal,
} from '@take5/protocol';

/** Rooms with no activity for this long are deleted. */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
/** How long an Away Player is waited for before the Bot acts for them. */
export const GRACE_PERIOD_MS = 60 * 1000;
/** A Bot Seat "thinks" for this long before each move, so its moves don't land all at once. */
export const BOT_DELAY_MIN_MS = 1000;
export const BOT_DELAY_MAX_MS = 2000;

export interface Member {
  id: string;
  /** Secret that reclaims this member's place; never shown to anyone else. Empty for a Bot. */
  token: string;
  nickname: string;
  /** A Bot occupies a Seat as a member without a connection or token. */
  bot: boolean;
}

/** The decision the Game is waiting on (a Turn's Picks, or one Low Card's Row) and when it began. */
export interface Decision {
  key: string;
  since: number;
}

/** The whole persisted state of one Room. */
export interface RoomData {
  code: string;
  hostId: string | null;
  members: Member[];
  /** Member ids seated for the next Game, in Seat order. During a Game, the Game's Seats. */
  seats: string[];
  settings: { endScore: number; pickTimer: PickTimer };
  phase: RoomPhase;
  game: GameState | null;
  gameSeats: GameSeatView[];
  totals: SessionTotal[];
  lastActivity: number;
  /** When each Away Player's last connection closed. Bots are never Away. */
  awaySince: Record<string, number>;
  /** Null outside a Game, and while the Game stands still because nobody is connected. */
  decision: Decision | null;
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
    settings: { endScore: DEFAULT_END_SCORE, pickTimer: DEFAULT_PICK_TIMER },
    phase: 'lobby',
    game: null,
    gameSeats: [],
    totals: [],
    lastActivity: now,
    awaySince: {},
    decision: null,
  };
}

/** Fills in fields that Rooms stored by an older version lack. */
export function upgradeRoom(stored: RoomData): RoomData {
  const room: RoomData = { ...stored };
  room.settings = { ...room.settings, pickTimer: room.settings.pickTimer ?? DEFAULT_PICK_TIMER };
  room.members = room.members.map((m) => ({ ...m, bot: m.bot ?? false }));
  room.gameSeats = room.gameSeats.map((s) => ({ ...s, bot: s.bot ?? false }));
  room.totals = room.totals.map((t) => ({ ...t, bot: t.bot ?? false }));
  room.awaySince ??= {};
  room.decision ??= null;
  delete (room as { deadline?: unknown }).deadline;
  return room;
}

export function memberByToken(room: RoomData, token: string): Member | undefined {
  return token ? room.members.find((m) => !m.bot && m.token === token) : undefined;
}

/** Adds a new member: seated if a Seat is free outside a Game, otherwise a Spectator. */
export function join(
  room: RoomData,
  nickname: string,
  ids: { id: string; token: string },
): { ok: true; member: Member } | { ok: false; error: ErrorCode } {
  // "Bot 3" is how Bots are named, so people can't pass for one.
  if (nicknameTaken(room, nickname) || isBotName(nickname)) {
    return { ok: false, error: 'nickname_taken' };
  }
  const sits = room.phase !== 'game' && room.seats.length < MAX_SEATS;
  const spectators = room.members.length - room.seats.length;
  if (!sits && spectators >= MAX_SPECTATORS) return { ok: false, error: 'room_full' };

  const member: Member = { ...ids, nickname, bot: false };
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

/** Removes a member for good. A Player leaving a running Game leaves their Seat to a Bot. */
export function leave(room: RoomData, memberId: string): RoomResult {
  if (!memberById(room, memberId)) return fail('unknown_member');
  if (room.phase === 'game' && room.seats.includes(memberId)) {
    seatBot(room, room.seats.indexOf(memberId));
  }
  room.members = room.members.filter((m) => m.id !== memberId);
  room.seats = room.seats.filter((id) => id !== memberId);
  delete room.awaySince[memberId];
  if (room.hostId === memberId) {
    room.hostId = nextHost(room, memberId) ?? room.members.find((m) => !m.bot)?.id ?? null;
  }
  return ok();
}

/** Host only: changes the settings for the next Game. */
export function changeSettings(
  room: RoomData,
  memberId: string,
  settings: { endScore?: number | undefined; pickTimer?: PickTimer | undefined },
): RoomResult {
  if (room.hostId !== memberId) return fail('not_host');
  if (room.phase === 'game') return fail('game_in_progress');
  if (settings.endScore !== undefined) room.settings.endScore = settings.endScore;
  if (settings.pickTimer !== undefined) room.settings.pickTimer = settings.pickTimer;
  return ok();
}

/** Host only: seats a new Bot in a free Seat. */
export function addBot(room: RoomData, memberId: string): RoomResult {
  if (room.hostId !== memberId) return fail('not_host');
  if (room.phase === 'game') return fail('game_in_progress');
  if (room.seats.length >= MAX_SEATS) return fail('room_full');
  const bot = newBot(room);
  room.members.push(bot);
  room.seats.push(bot.id);
  return ok();
}

/** Host only: removes a Bot from the Room. */
export function removeBot(room: RoomData, memberId: string, botId: string): RoomResult {
  if (room.hostId !== memberId) return fail('not_host');
  if (room.phase === 'game') return fail('game_in_progress');
  const bot = memberById(room, botId);
  if (!bot) return fail('unknown_member');
  if (!bot.bot) return fail('not_a_bot');
  room.members = room.members.filter((m) => m.id !== botId);
  room.seats = room.seats.filter((id) => id !== botId);
  return ok();
}

/** Host only: removes a person for good; their token stops working. */
export function kick(room: RoomData, memberId: string, targetId: string): RoomResult {
  if (room.hostId !== memberId) return fail('not_host');
  const target = memberById(room, targetId);
  if (!target) return fail('unknown_member');
  if (target.bot || targetId === memberId) return fail('invalid_target');
  return leave(room, targetId);
}

/** Host only: gives an Away Player's Seat to a Bot. The Player stays on as a Spectator. */
export function replaceWithBot(room: RoomData, memberId: string, targetId: string): RoomResult {
  if (room.hostId !== memberId) return fail('not_host');
  const target = memberById(room, targetId);
  if (!target) return fail('unknown_member');
  const seat = room.seats.indexOf(targetId);
  if (target.bot || seat === -1) return fail('invalid_target');
  if (!isAway(room, targetId)) return fail('not_away');
  seatBot(room, seat);
  return ok();
}

/** A Spectator takes over the Seat a Bot occupies, in any phase. The Bot leaves the Room. */
export function takeSeat(room: RoomData, memberId: string, seat: number): RoomResult {
  const member = memberById(room, memberId);
  if (!member || member.bot) return fail('unknown_member');
  if (room.seats.includes(memberId)) return fail('invalid_target');
  const botId = room.seats[seat];
  if (botId === undefined) return fail('invalid_seat');
  if (!memberById(room, botId)?.bot) return fail('not_a_bot');

  room.members = room.members.filter((m) => m.id !== botId);
  room.seats[seat] = memberId;
  if (room.phase === 'game') {
    room.gameSeats[seat] = { memberId, nickname: member.nickname, bot: false };
  }
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
  room.gameSeats = room.seats.map((id) => {
    const member = memberById(room, id);
    return { memberId: id, nickname: member?.nickname ?? '?', bot: member?.bot ?? false };
  });
  room.phase = 'game';
  room.decision = null;
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
  return apply(room, action);
}

/**
 * Records who is connected: people with no open connection become Away, and people
 * who came back stop being Away. Returns whether anything changed.
 */
export function syncPresence(room: RoomData, connected: ReadonlySet<string>, now: number): boolean {
  let changed = false;
  for (const member of room.members) {
    if (member.bot) continue;
    const away = member.id in room.awaySince;
    if (connected.has(member.id) && away) {
      delete room.awaySince[member.id];
      changed = true;
    } else if (!connected.has(member.id) && !away) {
      room.awaySince[member.id] = now;
      changed = true;
    }
  }
  return changed;
}

export function isAway(room: RoomData, memberId: string): boolean {
  return memberId in room.awaySince;
}

/**
 * Does whatever is due at `now`: passes Host on from an Away Host, keeps track of the
 * decision the Game waits on, and lets the Bot act for every Seat it is due for. While
 * nobody is connected the Game stands still. Returns the Game events this produced.
 */
export function tick(room: RoomData, now: number): GameEvent[] {
  handOffHost(room, now);
  const events: GameEvent[] = [];
  if (room.phase !== 'game' || !room.game || !anyoneConnected(room)) {
    room.decision = null;
    return events;
  }
  for (;;) {
    refreshDecision(room, now);
    const game: GameState | null = room.game;
    if (room.phase !== 'game' || !game) break;
    const seat = waitingOn(game).find((s) => botDueAt(room, s) <= now);
    if (seat === undefined) break;
    const result = apply(room, botAction(game, seat)!);
    if (!result.ok) throw new Error(`Bot move rejected: ${result.error}`);
    events.push(...result.events);
    room.lastActivity = now;
  }
  return events;
}

/** When the Room next needs `tick` (or expiry): the earliest future deadline. */
export function nextWakeup(room: RoomData, now: number): number {
  const expiry = room.lastActivity + ROOM_TTL_MS;
  // Only expiry is due while nobody is connected: no one to hand Host to, no one to play for.
  if (!anyoneConnected(room)) return expiry;
  const times = [expiry];
  if (room.hostId && isAway(room, room.hostId)) {
    times.push(room.awaySince[room.hostId]! + GRACE_PERIOD_MS);
  }
  if (room.phase === 'game' && room.game) {
    for (const seat of waitingOn(room.game)) times.push(botDueAt(room, seat));
  }
  const future = times.filter((t) => t > now);
  return future.length > 0 ? Math.min(...future) : expiry;
}

function apply(room: RoomData, action: Action): RoomResult {
  const result = applyAction(room.game!, action);
  if (!result.ok) return fail(result.error);
  room.game = result.state;
  if (result.state.phase === 'gameOver') finishGame(room, result.state);
  return ok(result.events);
}

/** When the current decision's Pick Timer runs out, or null if the timer is off or idle. */
export function pickDeadline(room: RoomData): number | null {
  const { decision } = room;
  const seconds = room.settings.pickTimer;
  return decision && seconds > 0 ? decision.since + seconds * 1000 : null;
}

/**
 * When the Bot makes Seat `seat`'s pending move: a Bot Seat after its thinking delay;
 * a Player's when the Pick Timer runs out or they have been Away for the Grace Period,
 * whichever comes first. Infinity if not at all.
 */
export function botDueAt(room: RoomData, seat: number): number {
  const { decision, game } = room;
  if (!decision || !game) return Infinity;
  const id = room.gameSeats[seat]?.memberId;
  const member = id === undefined ? undefined : memberById(room, id);
  if (!member || member.bot) return decision.since + botDelay(game.seed, decision.key, seat);
  const away = room.awaySince[member.id];
  return Math.min(
    pickDeadline(room) ?? Infinity,
    away === undefined ? Infinity : away + GRACE_PERIOD_MS,
  );
}

/**
 * A Bot Seat's thinking time for one decision: 1–2 s, varying by Seat and decision but
 * derived from the Game's seed, so a Game replays the same way.
 */
export function botDelay(seed: number, key: string, seat: number): number {
  let hash = 0x811c9dc5;
  for (const char of `${seed}:${key}:${seat}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  }
  return BOT_DELAY_MIN_MS + (hash % (BOT_DELAY_MAX_MS - BOT_DELAY_MIN_MS + 1));
}

/** Notes when the Game moved on to a new decision; the clocks above count from there. */
function refreshDecision(room: RoomData, now: number): void {
  const game = room.game;
  if (!game || game.phase === 'gameOver') {
    room.decision = null;
    return;
  }
  // One decision per Turn's Picks, and one per Low Card awaiting its Row choice.
  const key =
    game.phase === 'picking'
      ? `${game.round}.${game.turn}`
      : `${game.round}.${game.turn}.${game.unplaced.length}`;
  if (room.decision?.key !== key) room.decision = { key, since: now };
}

function handOffHost(room: RoomData, now: number): void {
  const host = room.hostId;
  const since = host === null ? undefined : room.awaySince[host];
  const lost = host === null || !memberById(room, host);
  if (!lost && (since === undefined || now < since + GRACE_PERIOD_MS)) return;
  const next = nextHost(room, host);
  if (next) room.hostId = next;
}

/**
 * The next connected Player in Seat order after `from`, wrapping around;
 * failing that, the first connected Spectator.
 */
function nextHost(room: RoomData, from: string | null): string | null {
  const start = from === null ? -1 : room.seats.indexOf(from);
  const inSeatOrder = room.seats.map((_, i) => room.seats[(start + 1 + i) % room.seats.length]!);
  const candidates = [...inSeatOrder, ...room.members.map((m) => m.id)];
  return candidates.find((id) => id !== from && isConnectedPerson(room, id)) ?? null;
}

function isConnectedPerson(room: RoomData, id: string): boolean {
  const member = memberById(room, id);
  return member !== undefined && !member.bot && !isAway(room, id);
}

function anyoneConnected(room: RoomData): boolean {
  return room.members.some((m) => isConnectedPerson(room, m.id));
}

/** Puts a new Bot in Seat `seat`, in the Game too when one is running. */
function seatBot(room: RoomData, seat: number): void {
  const bot = newBot(room);
  room.members.push(bot);
  room.seats[seat] = bot.id;
  if (room.phase === 'game')
    room.gameSeats[seat] = { memberId: bot.id, nickname: bot.nickname, bot: true };
}

/** A Bot named "Bot n" with the lowest n not in use, and an id never used in this Room. */
function newBot(room: RoomData): Member {
  let n = 1;
  while (nicknameTaken(room, botName(n))) n++;
  const used = new Set([
    ...room.members.map((m) => m.id),
    ...room.gameSeats.map((s) => s.memberId),
    ...room.totals.map((t) => t.memberId),
  ]);
  let k = 1;
  while (used.has(`bot-${k}`)) k++;
  return { id: `bot-${k}`, token: '', nickname: botName(n), bot: true };
}

const botName = (n: number) => `Bot ${n}`;
const isBotName = (nickname: string) => /^bot\s*\d+$/i.test(nickname.trim());

function nicknameTaken(room: RoomData, nickname: string): boolean {
  return room.members.some((m) => m.nickname.toLowerCase() === nickname.toLowerCase());
}

function memberById(room: RoomData, id: string): Member | undefined {
  return room.members.find((m) => m.id === id);
}

function finishGame(room: RoomData, game: GameState): void {
  room.phase = 'results';
  room.decision = null;
  room.gameSeats.forEach(({ memberId, nickname, bot }, seat) => {
    // A Bot's totals follow its name, so "Bot 1" keeps one row across Games.
    let total = room.totals.find(
      (t) => t.memberId === memberId || (bot && t.bot && t.nickname === nickname),
    );
    if (!total) {
      total = { memberId, nickname, bot, games: 0, wins: 0, bullHeads: 0 };
      room.totals.push(total);
    }
    total.memberId = memberId;
    total.nickname = nickname;
    total.games += 1;
    total.bullHeads += game.scores[seat]!;
    if (game.winners.includes(seat)) total.wins += 1;
  });
}

/** What `memberId` may see of the Room, given who is connected right now. */
export function roomView(
  room: RoomData,
  memberId: string,
  connected: ReadonlySet<string>,
  now: number,
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
      connected: !m.bot && connected.has(m.id),
      seated: room.seats.includes(m.id),
      bot: m.bot,
    })),
    seats: [...room.seats],
    settings: { ...room.settings },
    game: room.game ? viewFor(room.game, seat === -1 ? null : seat) : null,
    gameSeats: room.gameSeats.map((s) => ({ ...s })),
    totals: room.totals.map((t) => ({ ...t })),
    deadline: room.phase === 'game' ? pickDeadline(room) : null,
    now,
  };
}
