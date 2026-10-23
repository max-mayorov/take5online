import {
  parseRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type CreateRoomResponse,
} from '@take5/protocol';
import type { Env } from './env';

export { RoomObject } from './room-object';

const CREATE_ATTEMPTS = 10;

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/rooms') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      return createRoom(request, env);
    }

    const roomMatch = /^\/api\/rooms\/([^/]+)$/.exec(pathname);
    if (roomMatch) {
      const code = parseRoomCode(roomMatch[1]!);
      const exists = code !== null && (await env.ROOMS.getByName(code).exists());
      return exists ? json({ code }) : json({ error: 'room_not_found' }, 404);
    }

    const wsMatch = /^\/ws\/([^/]+)$/.exec(pathname);
    if (wsMatch) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }
      const code = parseRoomCode(wsMatch[1]!);
      if (!code) return new Response('Room not found', { status: 404 });
      return env.ROOMS.getByName(code).fetch(request);
    }

    if (pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function createRoom(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await env.CREATE_ROOM_LIMIT.limit({ key: ip });
  if (!success) return json({ error: 'too_many_requests' }, 429);

  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = randomRoomCode();
    if (await env.ROOMS.getByName(code).create(code)) {
      return json({ code } satisfies CreateRoomResponse, 201);
    }
  }
  return json({ error: 'no_free_code' }, 503);
}

function randomRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
