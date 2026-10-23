import type { GameEvent } from '@take5/engine';
import {
  PROTOCOL_VERSION,
  serverMessageSchema,
  type ClientIntent,
  type ErrorCode,
  type Reaction,
  type RoomView,
} from '@take5/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Update } from './useReveal';

export type Status =
  'connecting' | 'needNickname' | 'joined' | 'notFound' | 'reload' | 'left' | 'kicked';

export interface RoomConnection {
  status: Status;
  room: RoomView | null;
  /** The latest server error, cleared on the next successful snapshot. */
  error: ErrorCode | null;
  /** Events from recent snapshots, newest last. */
  events: GameEvent[];
  /** The latest snapshot change, for animating it. */
  update: Update | null;
  /** Reactions received in the last few seconds. */
  reactions: ReactionShown[];
  reconnecting: boolean;
  /** Several connections in a row failed before opening: something (often an ad blocker) blocks them. */
  cantConnect: boolean;
}

export interface ReactionShown {
  id: number;
  memberId: string;
  emoji: Reaction;
}

/** How long a Reaction floats on screen. */
export const REACTION_MS = 2500;

const PING_MS = 25_000;
/** Failed opens in a row before the "can't connect" hint shows (~4 s with the backoff below). */
const CANT_CONNECT_AFTER = 3;
const MAX_EVENTS = 40;

const tokenKey = (code: string) => `take5:token:${code}`;

function readToken(code: string): string | null {
  try {
    return localStorage.getItem(tokenKey(code));
  } catch {
    return null;
  }
}

function writeToken(code: string, token: string | null): void {
  try {
    if (token) localStorage.setItem(tokenKey(code), token);
    else localStorage.removeItem(tokenKey(code));
  } catch {
    // Without storage, a reload means joining again under a new Nickname.
  }
}

/** Keeps a WebSocket to one Room open, reconnecting with the stored token. */
export function useRoom(code: string) {
  const [state, setState] = useState<RoomConnection>({
    status: 'connecting',
    room: null,
    error: null,
    events: [],
    update: null,
    reactions: [],
    reconnecting: false,
    cantConnect: false,
  });
  const socket = useRef<WebSocket | null>(null);
  const pendingNickname = useRef<string | null>(null);
  const finished = useRef(false);

  const send = useCallback((intent: ClientIntent) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...intent }));
  }, []);

  useEffect(() => {
    finished.current = false;
    let attempt = 0;
    let failedOpens = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let seq = 0;
    let reactionId = 0;
    const reactionTimers = new Set<ReturnType<typeof setTimeout>>();

    const hello = (ws: WebSocket) => {
      const token = readToken(code);
      const nickname = pendingNickname.current;
      if (token || nickname) {
        ws.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            type: 'hello',
            ...(token ? { token } : {}),
            ...(nickname ? { nickname } : {}),
          }),
        );
      } else {
        setState((s) => ({ ...s, status: 'needNickname' }));
      }
    };

    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/ws/${code}`);
      socket.current = ws;
      let opened = false;

      ws.onopen = () => {
        opened = true;
        attempt = 0;
        failedOpens = 0;
        setState((s) => (s.cantConnect ? { ...s, cantConnect: false } : s));
        hello(ws);
        ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS);
      };

      ws.onmessage = (event) => {
        if (event.data === 'pong') return;
        let data: unknown;
        try {
          data = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const parsed = serverMessageSchema.safeParse(data);
        if (!parsed.success) return;
        const message = parsed.data;
        switch (message.type) {
          case 'welcome':
            writeToken(code, message.token);
            pendingNickname.current = null;
            setState((s) => ({ ...s, status: 'joined', reconnecting: false }));
            break;
          case 'state': {
            const update = { seq: ++seq, events: message.events };
            setState((s) => ({
              ...s,
              room: message.room,
              error: null,
              events: [...s.events, ...message.events].slice(-MAX_EVENTS),
              update: { ...update, before: s.room?.game ?? null },
            }));
            break;
          }
          case 'reaction': {
            const shown = { id: ++reactionId, memberId: message.memberId, emoji: message.emoji };
            setState((s) => ({ ...s, reactions: [...s.reactions, shown] }));
            const timer = setTimeout(() => {
              reactionTimers.delete(timer);
              setState((s) => ({ ...s, reactions: s.reactions.filter((r) => r !== shown) }));
            }, REACTION_MS);
            reactionTimers.add(timer);
            break;
          }
          case 'reload':
            finished.current = true;
            setState((s) => ({ ...s, status: 'reload' }));
            break;
          case 'error':
            if (message.code === 'room_not_found') {
              finished.current = true;
              writeToken(code, null);
              setState((s) => ({ ...s, status: 'notFound' }));
            } else if (message.code === 'kicked') {
              finished.current = true;
              writeToken(code, null);
              setState((s) => ({ ...s, status: 'kicked' }));
            } else if (message.code === 'nickname_required') {
              writeToken(code, null);
              setState((s) => ({ ...s, status: 'needNickname', error: null }));
            } else {
              setState((s) => ({ ...s, error: message.code }));
            }
            break;
        }
      };

      ws.onclose = () => {
        clearInterval(ping);
        if (finished.current) return;
        if (!opened) failedOpens++;
        const cantConnect = failedOpens >= CANT_CONNECT_AFTER;
        setState((s) => ({ ...s, reconnecting: true, cantConnect }));
        retry = setTimeout(connect, Math.min(10_000, 500 * 2 ** attempt++));
      };
    };

    connect();
    return () => {
      finished.current = true;
      clearTimeout(retry);
      clearInterval(ping);
      reactionTimers.forEach(clearTimeout);
      socket.current?.close(1000, 'unmount');
    };
  }, [code]);

  const join = useCallback(
    (nickname: string) => {
      pendingNickname.current = nickname;
      send({ type: 'hello', nickname });
    },
    [send],
  );

  const leave = useCallback(() => {
    send({ type: 'leave' });
    finished.current = true;
    writeToken(code, null);
    setState((s) => ({ ...s, status: 'left' }));
  }, [code, send]);

  return { ...state, send, join, leave };
}
