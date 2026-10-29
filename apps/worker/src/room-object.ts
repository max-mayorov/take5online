import { DurableObject } from 'cloudflare:workers';
import {
  clientMessageSchema,
  messageVersion,
  nicknameSchema,
  PROTOCOL_VERSION,
  REACTION_LIMIT,
  REACTION_WINDOW_MS,
  type ClientMessage,
  type ErrorCode,
  type Reaction,
  type RoomEvent,
  type RoomPhase,
  type ServerMessage,
} from '@take5/protocol';
import {
  addBot,
  changeSettings,
  continueRound,
  createRoom,
  join,
  kick,
  leave,
  memberByToken,
  nextWakeup,
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
  type RoomResult,
} from './room';
import type { Env } from './env';
import { Telemetry } from './posthog';

export { ROOM_TTL_MS } from './room';

interface Attachment {
  memberId: string | null;
}

/**
 * One Room. The single authority for its state; holds every connection via the
 * WebSocket Hibernation API and persists the Room after every change.
 *
 * Its single alarm is always set to the Room's next wakeup: the earliest of the Bot's next
 * move (a Bot Seat's thinking delay, the Pick Timer deadline, an Away Player's Grace Period),
 * the end of an Away Host's Grace Period, and expiry. `alarm()` does whatever is due.
 */
export class RoomObject extends DurableObject<Env> {
  private room: RoomData | null = null;
  /** Recent Reaction times per member, for rate limiting; losing it on hibernation is fine. */
  private reactionTimes = new Map<string, number[]>();
  /** The phase last reported to PostHog, so each Game's start and end is reported once. */
  private phase: RoomPhase | null = null;
  private readonly telemetry: Telemetry;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.telemetry = new Telemetry(env, (promise) => ctx.waitUntil(promise));
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<RoomData>('room');
      this.room = stored ? upgradeRoom(stored) : null;
      this.phase = this.room?.phase ?? null;
    });
  }

  /** Creates the Room under this code; false if the code is already in use. */
  async create(code: string): Promise<boolean> {
    return this.reportingErrors(async () => {
      if (this.room) return false;
      this.room = createRoom(code, Date.now());
      this.phase = this.room.phase;
      await this.commit([]);
      this.telemetry.capture('worker_room_created', { room_code: code });
      this.telemetry.log('info', 'Room created', { room_code: code });
      return true;
    });
  }

  async exists(): Promise<boolean> {
    return this.room !== null;
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ memberId: null } satisfies Attachment);
    if (!this.room) {
      send(server, { v: PROTOCOL_VERSION, type: 'error', code: 'room_not_found' });
      server.close(4004, 'room_not_found');
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    return this.reportingErrors(() => this.message(ws, raw));
  }

  private async message(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const room = this.room;
    if (!room) return sendError(ws, 'room_not_found');

    let data: unknown;
    try {
      data = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      this.telemetry.log('warn', 'Message is not JSON', { room_code: room.code });
      return sendError(ws, 'bad_message');
    }
    if (messageVersion(data) !== PROTOCOL_VERSION) {
      return send(ws, { v: PROTOCOL_VERSION, type: 'reload' });
    }
    const parsed = clientMessageSchema.safeParse(data);
    if (!parsed.success) {
      this.telemetry.log('warn', `Bad message: ${parsed.error.message.slice(0, 500)}`, {
        room_code: room.code,
      });
      return sendError(ws, 'bad_message');
    }
    const message = parsed.data;

    const { memberId } = ws.deserializeAttachment() as Attachment;
    if (message.type === 'hello') return this.hello(ws, room, message);
    if (!memberId) return sendError(ws, 'nickname_required');
    if (message.type === 'react') return this.react(memberId, message.emoji);

    const result = this.handle(room, memberId, message);
    if (!result.ok) return sendError(ws, result.error);
    room.lastActivity = Date.now();
    await this.commit(result.events);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.reportingErrors(() => this.commit([], ws));
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.reportingErrors(() => this.commit([], ws));
  }

  override async alarm(): Promise<void> {
    return this.reportingErrors(async () => {
      const room = this.room;
      if (room && Date.now() - room.lastActivity < ROOM_TTL_MS) {
        await this.commit([]);
        return;
      }
      for (const ws of this.ctx.getWebSockets()) ws.close(4004, 'room_expired');
      this.room = null;
      await this.ctx.storage.deleteAll();
      if (room) {
        const games = Math.max(0, ...room.totals.map((total) => total.games));
        this.telemetry.capture('worker_room_expired', { room_code: room.code, games });
        this.telemetry.log('info', 'Room expired', { room_code: room.code, games });
      }
    });
  }

  /** Reports an error to PostHog, then lets it fail the call as before. */
  private async reportingErrors<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      this.telemetry.captureException(error, this.room ? { room_code: this.room.code } : {});
      throw error;
    }
  }

  /** Reports each Game's start and end, so they are counted even when no browser reports them. */
  private notePhase(room: RoomData): void {
    if (room.phase === this.phase) return;
    this.phase = room.phase;
    const properties = {
      room_code: room.code,
      players: room.gameSeats.filter((seat) => !seat.bot).length,
      bots: room.gameSeats.filter((seat) => seat.bot).length,
    };
    if (room.phase === 'game') {
      this.telemetry.capture('worker_game_started', {
        ...properties,
        end_score: room.settings.endScore,
        pick_timer: room.settings.pickTimer,
      });
      this.telemetry.log('info', 'Game started', properties);
    }
    if (room.phase === 'results') {
      const rounds = room.game?.round ?? 0;
      this.telemetry.capture('worker_game_ended', { ...properties, rounds });
      this.telemetry.log('info', 'Game ended', { ...properties, rounds });
    }
  }

  private async hello(
    ws: WebSocket,
    room: RoomData,
    message: Extract<ClientMessage, { type: 'hello' }>,
  ): Promise<void> {
    let member = message.token ? memberByToken(room, message.token) : undefined;
    if (!member) {
      const nickname = nicknameSchema.safeParse(message.nickname);
      if (!nickname.success) return sendError(ws, 'nickname_required');
      const joined = join(room, nickname.data, {
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
      });
      if (!joined.ok) return sendError(ws, joined.error);
      member = joined.member;
      room.lastActivity = Date.now();
    }
    ws.serializeAttachment({ memberId: member.id } satisfies Attachment);
    send(ws, { v: PROTOCOL_VERSION, type: 'welcome', memberId: member.id, token: member.token });
    await this.commit([]);
  }

  /** Relays a Reaction to everyone in the Room, silently dropping any over the rate limit. */
  private react(memberId: string, emoji: Reaction): void {
    const now = Date.now();
    const recent = (this.reactionTimes.get(memberId) ?? []).filter(
      (time) => now - time < REACTION_WINDOW_MS,
    );
    if (recent.length >= REACTION_LIMIT) return;
    this.reactionTimes.set(memberId, [...recent, now]);
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as Attachment).memberId) {
        send(ws, { v: PROTOCOL_VERSION, type: 'reaction', memberId, emoji });
      }
    }
  }

  private handle(
    room: RoomData,
    memberId: string,
    message: Exclude<ClientMessage, { type: 'hello' | 'react' }>,
  ): RoomResult {
    switch (message.type) {
      case 'sit':
        return sit(room, memberId);
      case 'stand':
        return stand(room, memberId);
      case 'leave': {
        const result = leave(room, memberId);
        if (result.ok) this.disconnect(memberId);
        return result;
      }
      case 'settings':
        return changeSettings(room, memberId, message);
      case 'start':
        return start(room, memberId, randomSeed());
      case 'pick':
        return play(room, memberId, { type: 'pick', card: message.card }, Date.now());
      case 'chooseRow':
        return play(room, memberId, { type: 'chooseRow', row: message.row }, Date.now());
      case 'addBot':
        return addBot(room, memberId);
      case 'removeBot':
        return removeBot(room, memberId, message.memberId);
      case 'kick': {
        const result = kick(room, memberId, message.memberId);
        if (result.ok) this.disconnect(message.memberId, 'kicked');
        return result;
      }
      case 'replaceWithBot':
        return replaceWithBot(room, memberId, message.memberId);
      case 'takeSeat':
        return takeSeat(room, memberId, message.seat);
      case 'continue':
        return continueRound(room, memberId);
    }
  }

  /**
   * After any change: records who is connected, lets timers and Bots do what is due,
   * persists the Room, re-arms the alarm and sends everyone a fresh snapshot.
   */
  private async commit(events: RoomEvent[], closing?: WebSocket): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    syncPresence(room, this.connected(closing), now);
    events.push(...tick(room, now));
    this.notePhase(room);
    await this.ctx.storage.put('room', room);
    await this.ctx.storage.setAlarm(nextWakeup(room, now));
    this.broadcast(events, now, closing);
  }

  /** Member ids with at least one open connection, leaving out one that is closing. */
  private connected(closing?: WebSocket): Set<string> {
    const ids = this.ctx
      .getWebSockets()
      .filter((ws) => ws !== closing)
      .map((ws) => (ws.deserializeAttachment() as Attachment).memberId);
    return new Set(ids.filter((id): id is string => id !== null));
  }

  /** Sends every identified connection its own snapshot plus the public events. */
  private broadcast(events: RoomEvent[], now: number, closing?: WebSocket): void {
    const room = this.room;
    if (!room) return;
    const connected = this.connected(closing);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === closing) continue;
      const { memberId } = ws.deserializeAttachment() as Attachment;
      if (memberId && room.members.some((m) => m.id === memberId)) {
        send(ws, {
          v: PROTOCOL_VERSION,
          type: 'state',
          room: roomView(room, memberId, connected, now),
          events,
        });
      }
    }
  }

  /** Closes a member's connections, telling them first if they were kicked. */
  private disconnect(memberId: string, reason: 'left' | 'kicked' = 'left'): void {
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as Attachment).memberId === memberId) {
        ws.serializeAttachment({ memberId: null } satisfies Attachment);
        if (reason === 'kicked') sendError(ws, 'kicked');
        ws.close(reason === 'kicked' ? 4001 : 4000, reason);
      }
    }
  }
}

function send(ws: WebSocket, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // The socket is already closing; its close handler will broadcast.
  }
}

function sendError(ws: WebSocket, code: ErrorCode): void {
  send(ws, { v: PROTOCOL_VERSION, type: 'error', code });
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}
