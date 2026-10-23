import { DurableObject } from 'cloudflare:workers';
import type { GameEvent } from '@take5/engine';
import {
  clientMessageSchema,
  messageVersion,
  nicknameSchema,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '@take5/protocol';
import {
  createRoom,
  join,
  leave,
  memberByToken,
  play,
  roomView,
  setEndScore,
  sit,
  stand,
  start,
  type RoomData,
  type RoomResult,
} from './room';
import type { Env } from './env';

/** Rooms with no activity for this long are deleted. */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

interface Attachment {
  memberId: string | null;
}

/**
 * One Room. The single authority for its state; holds every connection via the
 * WebSocket Hibernation API and persists the Room after every change.
 */
export class RoomObject extends DurableObject<Env> {
  private room: RoomData | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    void ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomData>('room')) ?? null;
    });
  }

  /** Creates the Room under this code; false if the code is already in use. */
  async create(code: string): Promise<boolean> {
    if (this.room) return false;
    this.room = createRoom(code, Date.now());
    await this.save();
    return true;
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
    const room = this.room;
    if (!room) return sendError(ws, 'room_not_found');

    let data: unknown;
    try {
      data = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return sendError(ws, 'bad_message');
    }
    if (messageVersion(data) !== PROTOCOL_VERSION) {
      return send(ws, { v: PROTOCOL_VERSION, type: 'reload' });
    }
    const parsed = clientMessageSchema.safeParse(data);
    if (!parsed.success) return sendError(ws, 'bad_message');
    const message = parsed.data;

    const { memberId } = ws.deserializeAttachment() as Attachment;
    if (message.type === 'hello') return this.hello(ws, room, message);
    if (!memberId) return sendError(ws, 'nickname_required');

    const result = this.handle(room, memberId, message);
    if (!result.ok) return sendError(ws, result.error);
    room.lastActivity = Date.now();
    await this.save();
    this.broadcast(result.events);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.broadcast([], ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcast([], ws);
  }

  override async alarm(): Promise<void> {
    const room = this.room;
    if (room && Date.now() - room.lastActivity < ROOM_TTL_MS) {
      await this.ctx.storage.setAlarm(room.lastActivity + ROOM_TTL_MS);
      return;
    }
    for (const ws of this.ctx.getWebSockets()) ws.close(4004, 'room_expired');
    this.room = null;
    await this.ctx.storage.deleteAll();
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
      await this.save();
    }
    ws.serializeAttachment({ memberId: member.id } satisfies Attachment);
    send(ws, { v: PROTOCOL_VERSION, type: 'welcome', memberId: member.id, token: member.token });
    this.broadcast([]);
  }

  private handle(
    room: RoomData,
    memberId: string,
    message: Exclude<ClientMessage, { type: 'hello' }>,
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
        return setEndScore(room, memberId, message.endScore);
      case 'start':
        return start(room, memberId, randomSeed());
      case 'pick':
        return play(room, memberId, { type: 'pick', card: message.card });
      case 'chooseRow':
        return play(room, memberId, { type: 'chooseRow', row: message.row });
    }
  }

  /** Sends every identified connection its own snapshot plus the public events. */
  private broadcast(events: GameEvent[], closing?: WebSocket): void {
    const room = this.room;
    if (!room) return;
    const sockets = this.ctx.getWebSockets().filter((ws) => ws !== closing);
    const ids = sockets.map((ws) => (ws.deserializeAttachment() as Attachment).memberId);
    const connected = new Set(ids.filter((id): id is string => id !== null));
    sockets.forEach((ws, i) => {
      const memberId = ids[i];
      if (memberId && room.members.some((m) => m.id === memberId)) {
        send(ws, {
          v: PROTOCOL_VERSION,
          type: 'state',
          room: roomView(room, memberId, connected),
          events,
        });
      }
    });
  }

  private disconnect(memberId: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as Attachment).memberId === memberId) {
        ws.serializeAttachment({ memberId: null } satisfies Attachment);
        ws.close(4000, 'left');
      }
    }
  }

  private async save(): Promise<void> {
    if (!this.room) return;
    await this.ctx.storage.put('room', this.room);
    await this.ctx.storage.setAlarm(this.room.lastActivity + ROOM_TTL_MS);
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
