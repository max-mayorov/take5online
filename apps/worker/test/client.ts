import { exports } from 'cloudflare:workers';
import {
  PROTOCOL_VERSION,
  serverMessageSchema,
  type ClientIntent,
  type ServerMessage,
} from '@take5/protocol';

type StateMessage = Extract<ServerMessage, { type: 'state' }>;

let rooms = 0;

/** Creates a Room, from a fresh client IP each time so tests stay under the rate limit. */
export async function createRoom(): Promise<string> {
  const response = await exports.default.fetch('http://test/api/rooms', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': `10.0.${Math.floor(++rooms / 250)}.${rooms % 250}` },
  });
  if (response.status !== 201) throw new Error(`create failed: ${response.status}`);
  return ((await response.json()) as { code: string }).code;
}

/** A test WebSocket client that records every server message, validated by the protocol schema. */
export class Client {
  readonly messages: ServerMessage[] = [];
  private waiters: (() => void)[] = [];
  private closed = false;

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      this.messages.push(serverMessageSchema.parse(JSON.parse(event.data as string)));
      this.wake();
    });
    socket.addEventListener('close', () => {
      this.closed = true;
      this.wake();
    });
  }

  static async connect(code: string): Promise<Client> {
    const response = await exports.default.fetch(`http://test/ws/${code}`, {
      headers: { Upgrade: 'websocket' },
    });
    const socket = response.webSocket;
    if (!socket) throw new Error(`no WebSocket: ${response.status}`);
    socket.accept();
    return new Client(socket);
  }

  /** Connects and joins with a Nickname, resolving once the first snapshot arrives. */
  static async join(code: string, nickname: string): Promise<Client> {
    const client = await Client.connect(code);
    client.send({ type: 'hello', nickname });
    await client.state();
    return client;
  }

  /** Resolves once every client's snapshot shows all of them, so no join broadcast is still due. */
  static async synced(...clients: Client[]): Promise<void> {
    for (const client of clients) {
      while (client.latest().members.length < clients.length) await client.state();
    }
  }

  send(intent: ClientIntent | Record<string, unknown>): void {
    this.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...intent }));
  }

  sendRaw(data: string): void {
    this.socket.send(data);
  }

  close(): void {
    this.socket.close(1000, 'bye');
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Waits for the first message, from `from` onwards, that matches. */
  async next<T extends ServerMessage>(
    match: (m: ServerMessage) => m is T,
    from = 0,
  ): Promise<{ message: T; index: number }> {
    for (;;) {
      const index = this.messages.findIndex((m, i) => i >= from && match(m));
      if (index !== -1) return { message: this.messages[index] as T, index };
      if (this.closed) throw new Error('socket closed while waiting');
      const woke = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 5000);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve(true);
        });
      });
      if (!woke) throw new Error('timed out waiting for a message');
    }
  }

  /** The newest snapshot after the given number of messages. */
  async state(after = this.messages.length): Promise<StateMessage['room']> {
    await this.next(isState, after);
    const states = this.messages.filter(isState);
    return states[states.length - 1]!.room;
  }

  latest(): StateMessage['room'] {
    const states = this.messages.filter(isState);
    const last = states[states.length - 1];
    if (!last) throw new Error('no state yet');
    return last.room;
  }

  /** Sends an intent and resolves with the next message of any kind. */
  async request(intent: ClientIntent): Promise<ServerMessage> {
    const from = this.messages.length;
    this.send(intent);
    return (await this.next((m): m is ServerMessage => true, from)).message;
  }

  private wake(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const wake of waiters) wake();
  }
}

export function isState(m: ServerMessage): m is StateMessage {
  return m.type === 'state';
}

export function isError(m: ServerMessage): m is Extract<ServerMessage, { type: 'error' }> {
  return m.type === 'error';
}

export function isWelcome(m: ServerMessage): m is Extract<ServerMessage, { type: 'welcome' }> {
  return m.type === 'welcome';
}
