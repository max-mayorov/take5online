import {
  DECK_SIZE,
  MAX_SEATS,
  ROW_COUNT,
  type Card,
  type GameEvent,
  type GameView,
} from '@take5/engine';
import * as z from 'zod/mini';

/** Bump on any incompatible message change; clients on another version are told to reload. */
export const PROTOCOL_VERSION = 4;

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;
export const NICKNAME_MAX_LENGTH = 16;
export const MAX_SPECTATORS = 20;
export const DEFAULT_END_SCORE = 66;
export const MIN_END_SCORE = 10;
export const MAX_END_SCORE = 200;
/** Pick Timer choices in seconds; 0 means off. */
export const PICK_TIMER_OPTIONS = [0, 30, 60] as const;
export type PickTimer = (typeof PICK_TIMER_OPTIONS)[number];
export const DEFAULT_PICK_TIMER: PickTimer = 0;

/** The fixed set of emoji a member may react with. */
export const REACTIONS = ['👍', '😂', '😱', '🐮', '🎉', '😭'] as const;
export type Reaction = (typeof REACTIONS)[number];
/** Each member may send at most this many Reactions per window; extras are dropped. */
export const REACTION_LIMIT = 5;
export const REACTION_WINDOW_MS = 10_000;

/** Upper-cases and trims user input; returns null unless it is a well-formed Room Code. */
export function parseRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  const pattern = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);
  return pattern.test(code) ? code : null;
}

export const nicknameSchema = z
  .string()
  .check(z.trim(), z.minLength(1), z.maxLength(NICKNAME_MAX_LENGTH));

/** An integer in [min, max]. */
const int = (min: number, max: number) => z.int().check(z.minimum(min), z.maximum(max));
const count = z.int();
const card = int(1, DECK_SIZE);
const seat = int(0, MAX_SEATS - 1);
const row = int(0, ROW_COUNT - 1);
const v = z.literal(PROTOCOL_VERSION);
const memberId = z.string().check(z.maxLength(64));
const pickTimer = z.literal(PICK_TIMER_OPTIONS);

// ---------------------------------------------------------------------------
// Client → server

export const clientMessageSchema = z.discriminatedUnion('type', [
  /** First message on every connection: resume with a token, or join with a Nickname. */
  z.object({
    v,
    type: z.literal('hello'),
    token: z.optional(z.string().check(z.maxLength(64))),
    nickname: z.optional(nicknameSchema),
  }),
  z.object({ v, type: z.literal('sit') }),
  z.object({ v, type: z.literal('stand') }),
  z.object({ v, type: z.literal('leave') }),
  /** Host only, outside a Game. Any field may be left out to keep it as it is. */
  z.object({
    v,
    type: z.literal('settings'),
    endScore: z.optional(int(MIN_END_SCORE, MAX_END_SCORE)),
    pickTimer: z.optional(pickTimer),
  }),
  z.object({ v, type: z.literal('start') }),
  z.object({ v, type: z.literal('pick'), card }),
  z.object({ v, type: z.literal('chooseRow'), row }),
  /** Host only, outside a Game: seat a new Bot in a free Seat. */
  z.object({ v, type: z.literal('addBot') }),
  /** Host only, outside a Game: remove a Bot from its Seat. */
  z.object({ v, type: z.literal('removeBot'), memberId }),
  /** Host only: remove someone from the Room for good; a seated Player's Game Seat becomes a Bot's. */
  z.object({ v, type: z.literal('kick'), memberId }),
  /** Host only: give an Away Player's Seat to a Bot; the Player stays on as a Spectator. */
  z.object({ v, type: z.literal('replaceWithBot'), memberId }),
  /** A Spectator takes over the Seat a Bot occupies. */
  z.object({ v, type: z.literal('takeSeat'), seat }),
  z.object({ v, type: z.literal('react'), emoji: z.enum(REACTIONS) }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Messages a client sends, without the version stamp. */
export type ClientIntent = ClientMessage extends infer M
  ? M extends unknown
    ? Omit<M, 'v'>
    : never
  : never;

// ---------------------------------------------------------------------------
// Server → client

/**
 * A Game event, or one of the Room's signals that a decision has started: the Reveal that led
 * to it has finished playing, so the Pick Timer and the Bots' thinking count from here.
 */
export type RoomEvent =
  | GameEvent
  | { type: 'turnStarted'; round: number; turn: number }
  | { type: 'rowChoiceStarted'; seat: number; card: Card };

/** How long each Reveal step shows, in ms. */
export const TIMING = {
  faceDown: 350,
  flip: 900,
  sort: 800,
  place: 600,
  taking: 700,
  take: 800,
  roundEnded: 1600,
} as const;

/** Whether these events change the table in a way worth animating. */
export function isAnimated(events: readonly RoomEvent[]): boolean {
  return events.some((e) => e.type === 'revealed' || e.type === 'cardPlaced');
}

/** How long the Reveal of these events plays on the clients; the sum of its steps' TIMING. */
export function revealMs(events: readonly RoomEvent[]): number {
  if (!isAnimated(events)) return 0;
  let ms = 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    switch (event.type) {
      case 'revealed': {
        const bySeat = [...event.cards].sort((a, b) => a.seat - b.seat);
        const ascending = [...event.cards].sort((a, b) => a.card - b.card);
        ms += TIMING.faceDown + TIMING.flip;
        if (ascending.some((p, i) => p.seat !== bySeat[i]!.seat)) ms += TIMING.sort;
        break;
      }
      case 'rowTaken':
        // A Take shows together with the Card that starts the Row afresh.
        if (events[i + 1]?.type !== 'cardPlaced') break;
        i++;
        ms += TIMING.taking + TIMING.take;
        break;
      case 'cardPlaced':
        ms += TIMING.place;
        break;
      case 'roundEnded':
        ms += TIMING.roundEnded;
        break;
      default:
        break;
    }
  }
  return ms;
}

export type RoomPhase = 'lobby' | 'game' | 'results';

export interface MemberView {
  id: string;
  nickname: string;
  /** Always false for a Bot, which has no connection. */
  connected: boolean;
  seated: boolean;
  bot: boolean;
}

export interface GameSeatView {
  memberId: string;
  nickname: string;
  bot: boolean;
}

export interface SessionTotal {
  memberId: string;
  nickname: string;
  bot: boolean;
  games: number;
  wins: number;
  bullHeads: number;
}

/** The Host's choices for the next Game, shared by everyone in the Room. */
export interface RoomSettings {
  endScore: number;
  pickTimer: PickTimer;
}

/** Everything one connection may see of a Room. */
export interface RoomView {
  code: string;
  phase: RoomPhase;
  hostId: string;
  /** The viewer's own member id. */
  you: string;
  members: MemberView[];
  /** Member ids seated for the next Game, in Seat order. */
  seats: string[];
  settings: RoomSettings;
  /** The current or last Game; Seat i of the Game is `gameSeats[i]`. */
  game: GameView | null;
  gameSeats: GameSeatView[];
  totals: SessionTotal[];
  /** When the Pick Timer runs out for the current decision (epoch ms), or null if it isn't running. */
  deadline: number | null;
  /** The server's clock when this snapshot was made, so clients can correct for their own. */
  now: number;
}

export const ERROR_CODES = [
  'bad_message',
  'room_not_found',
  'nickname_required',
  'nickname_taken',
  'room_full',
  'not_host',
  'wrong_phase',
  'need_players',
  'not_seated',
  'game_in_progress',
  'invalid_seat',
  'card_not_in_hand',
  'not_your_choice',
  'invalid_row',
  'unknown_member',
  'not_a_bot',
  'not_away',
  'invalid_target',
  'kicked',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const playedCard = z.object({ seat, card });
const board = z.array(z.array(card));

const gameViewSchema: z.ZodMiniType<GameView> = z.object({
  config: z.object({ seatCount: count, endScore: count }),
  round: count,
  turn: count,
  phase: z.enum(['picking', 'choosingRow', 'gameOver']),
  board,
  seats: z.array(
    z.object({
      handSize: count,
      picked: z.boolean(),
      score: count,
      penaltyPile: z.array(card),
    }),
  ),
  unplaced: z.array(playedCard),
  choosingSeat: z.nullable(seat),
  winners: z.array(seat),
  seat: z.nullable(seat),
  hand: z.array(card),
  pick: z.nullable(card),
});

const roomEventSchema: z.ZodMiniType<RoomEvent> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('roundStarted'), round: count, board }),
  z.object({ type: z.literal('picked'), seat }),
  z.object({ type: z.literal('revealed'), cards: z.array(playedCard) }),
  z.object({ type: z.literal('rowChoiceRequired'), seat, card }),
  z.object({
    type: z.literal('rowTaken'),
    seat,
    row,
    cards: z.array(card),
    bullHeads: count,
  }),
  z.object({ type: z.literal('cardPlaced'), seat, card, row }),
  z.object({ type: z.literal('roundEnded'), round: count, scores: z.array(z.number()) }),
  z.object({
    type: z.literal('gameEnded'),
    scores: z.array(z.number()),
    winners: z.array(seat),
  }),
  z.object({ type: z.literal('turnStarted'), round: count, turn: count }),
  z.object({ type: z.literal('rowChoiceStarted'), seat, card }),
]);

const roomViewSchema: z.ZodMiniType<RoomView> = z.object({
  code: z.string(),
  phase: z.enum(['lobby', 'game', 'results']),
  hostId: z.string(),
  you: z.string(),
  members: z.array(
    z.object({
      id: z.string(),
      nickname: z.string(),
      connected: z.boolean(),
      seated: z.boolean(),
      bot: z.boolean(),
    }),
  ),
  seats: z.array(z.string()),
  settings: z.object({ endScore: count, pickTimer }),
  game: z.nullable(gameViewSchema),
  gameSeats: z.array(z.object({ memberId: z.string(), nickname: z.string(), bot: z.boolean() })),
  totals: z.array(
    z.object({
      memberId: z.string(),
      nickname: z.string(),
      bot: z.boolean(),
      games: count,
      wins: count,
      bullHeads: count,
    }),
  ),
  deadline: z.nullable(z.number()),
  now: z.number(),
});

export const serverMessageSchema = z.discriminatedUnion('type', [
  /** Sent once a hello succeeds: the token to store for reclaiming this place. */
  z.object({ v, type: z.literal('welcome'), memberId: z.string(), token: z.string() }),
  /** A fresh snapshot after every change, plus public events to animate. */
  z.object({ v, type: z.literal('state'), room: roomViewSchema, events: z.array(roomEventSchema) }),
  /** Someone in the Room reacted; shown briefly and never stored. */
  z.object({ v, type: z.literal('reaction'), memberId: z.string(), emoji: z.enum(REACTIONS) }),
  z.object({ v, type: z.literal('error'), code: z.enum(ERROR_CODES) }),
  /** The client is on a different protocol version and must reload. */
  z.object({ v: z.number(), type: z.literal('reload') }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

/** Reads a message's version without trusting anything else about it. */
export function messageVersion(data: unknown): number | null {
  if (data && typeof data === 'object' && 'v' in data && typeof data.v === 'number') return data.v;
  return null;
}

export interface CreateRoomResponse {
  code: string;
}
