import { DECK_SIZE, MAX_SEATS, ROW_COUNT, type GameEvent, type GameView } from '@take5/engine';
import { z } from 'zod';

/** Bump on any incompatible message change; clients on another version are told to reload. */
export const PROTOCOL_VERSION = 2;

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;
export const NICKNAME_MAX_LENGTH = 16;
export const MAX_SPECTATORS = 20;
export const DEFAULT_END_SCORE = 66;
export const MIN_END_SCORE = 10;
export const MAX_END_SCORE = 200;

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

export const nicknameSchema = z.string().trim().min(1).max(NICKNAME_MAX_LENGTH);

const card = z.number().int().min(1).max(DECK_SIZE);
const seat = z
  .number()
  .int()
  .min(0)
  .max(MAX_SEATS - 1);
const row = z
  .number()
  .int()
  .min(0)
  .max(ROW_COUNT - 1);
const v = z.literal(PROTOCOL_VERSION);

// ---------------------------------------------------------------------------
// Client → server

export const clientMessageSchema = z.discriminatedUnion('type', [
  /** First message on every connection: resume with a token, or join with a Nickname. */
  z.object({
    v,
    type: z.literal('hello'),
    token: z.string().max(64).optional(),
    nickname: nicknameSchema.optional(),
  }),
  z.object({ v, type: z.literal('sit') }),
  z.object({ v, type: z.literal('stand') }),
  z.object({ v, type: z.literal('leave') }),
  z.object({
    v,
    type: z.literal('settings'),
    endScore: z.number().int().min(MIN_END_SCORE).max(MAX_END_SCORE),
  }),
  z.object({ v, type: z.literal('start') }),
  z.object({ v, type: z.literal('pick'), card }),
  z.object({ v, type: z.literal('chooseRow'), row }),
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

export type RoomPhase = 'lobby' | 'game' | 'results';

export interface MemberView {
  id: string;
  nickname: string;
  connected: boolean;
  seated: boolean;
}

export interface GameSeatView {
  memberId: string;
  nickname: string;
}

export interface SessionTotal {
  memberId: string;
  nickname: string;
  games: number;
  wins: number;
  bullHeads: number;
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
  settings: { endScore: number };
  /** The current or last Game; Seat i of the Game is `gameSeats[i]`. */
  game: GameView | null;
  gameSeats: GameSeatView[];
  totals: SessionTotal[];
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
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const playedCard = z.object({ seat, card });
const board = z.array(z.array(card));

const gameViewSchema: z.ZodType<GameView> = z.object({
  config: z.object({ seatCount: z.number().int(), endScore: z.number().int() }),
  round: z.number().int(),
  turn: z.number().int(),
  phase: z.enum(['picking', 'choosingRow', 'gameOver']),
  board,
  seats: z.array(
    z.object({
      handSize: z.number().int(),
      picked: z.boolean(),
      score: z.number().int(),
      penaltyPile: z.array(card),
    }),
  ),
  unplaced: z.array(playedCard),
  choosingSeat: seat.nullable(),
  winners: z.array(seat),
  seat: seat.nullable(),
  hand: z.array(card),
  pick: card.nullable(),
});

const gameEventSchema: z.ZodType<GameEvent> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('roundStarted'), round: z.number().int(), board }),
  z.object({ type: z.literal('picked'), seat }),
  z.object({ type: z.literal('revealed'), cards: z.array(playedCard) }),
  z.object({ type: z.literal('rowChoiceRequired'), seat, card }),
  z.object({
    type: z.literal('rowTaken'),
    seat,
    row,
    cards: z.array(card),
    bullHeads: z.number().int(),
  }),
  z.object({ type: z.literal('cardPlaced'), seat, card, row }),
  z.object({ type: z.literal('roundEnded'), round: z.number().int(), scores: z.array(z.number()) }),
  z.object({
    type: z.literal('gameEnded'),
    scores: z.array(z.number()),
    winners: z.array(seat),
  }),
]);

const roomViewSchema: z.ZodType<RoomView> = z.object({
  code: z.string(),
  phase: z.enum(['lobby', 'game', 'results']),
  hostId: z.string(),
  you: z.string(),
  members: z.array(
    z.object({ id: z.string(), nickname: z.string(), connected: z.boolean(), seated: z.boolean() }),
  ),
  seats: z.array(z.string()),
  settings: z.object({ endScore: z.number().int() }),
  game: gameViewSchema.nullable(),
  gameSeats: z.array(z.object({ memberId: z.string(), nickname: z.string() })),
  totals: z.array(
    z.object({
      memberId: z.string(),
      nickname: z.string(),
      games: z.number().int(),
      wins: z.number().int(),
      bullHeads: z.number().int(),
    }),
  ),
});

export const serverMessageSchema = z.discriminatedUnion('type', [
  /** Sent once a hello succeeds: the token to store for reclaiming this place. */
  z.object({ v, type: z.literal('welcome'), memberId: z.string(), token: z.string() }),
  /** A fresh snapshot after every change, plus public events to animate. */
  z.object({ v, type: z.literal('state'), room: roomViewSchema, events: z.array(gameEventSchema) }),
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
