import {
  parseRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type CreateRoomResponse,
  type FlagsResponse,
} from '@take5/protocol';
import type { Env } from './env';
import { evaluateFlags, POSTHOG_API_HOST, Telemetry } from './posthog';

export { RoomObject } from './room-object';

const CREATE_ATTEMPTS = 10;

/** Analytics go through our own domain so ad blockers don't drop them; must match the web app. */
const POSTHOG_PATH = '/relay';
const POSTHOG_ASSET_HOST = 'eu-assets.i.posthog.com';

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const telemetry = new Telemetry(env, (promise) => ctx.waitUntil(promise));
    try {
      return await route(request, env, ctx, telemetry);
    } catch (error) {
      telemetry.captureException(error, { path: new URL(request.url).pathname });
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;

async function route(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  telemetry: Telemetry,
): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (pathname.startsWith(`${POSTHOG_PATH}/`)) return proxyPostHog(request, ctx);

  if (pathname === '/api/rooms') {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    return createRoom(request, env, telemetry);
  }

  if (pathname === '/api/flags') {
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    return flags(request, env, ctx, telemetry);
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
}

async function createRoom(request: Request, env: Env, telemetry: Telemetry): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await env.CREATE_ROOM_LIMIT.limit({ key: ip });
  if (!success) {
    telemetry.log('warn', 'Room creation rate-limited');
    return json({ error: 'too_many_requests' }, 429);
  }

  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = randomRoomCode();
    if (await env.ROOMS.getByName(code).create(code)) {
      return json({ code } satisfies CreateRoomResponse, 201);
    }
  }
  telemetry.log('error', `No free Room Code after ${CREATE_ATTEMPTS} attempts`);
  return json({ error: 'no_free_code' }, 503);
}

/**
 * Feature flags change rarely, so each data center asks PostHog at most once a minute. If PostHog
 * can't answer, every flag falls back to its default in the app.
 */
async function flags(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  telemetry: Telemetry,
): Promise<Response> {
  const cached = await caches.default.match(request);
  if (cached) return cached;
  let flags: FlagsResponse['flags'] = {};
  try {
    flags = await evaluateFlags(env);
  } catch (error) {
    telemetry.log('warn', `Feature flags unavailable: ${String(error)}`);
  }
  const response = Response.json({ flags } satisfies FlagsResponse, {
    headers: { 'Cache-Control': 'public, max-age=60' },
  });
  ctx.waitUntil(caches.default.put(request, response.clone()));
  return response;
}

/** Forwards to PostHog: SDK scripts and remote config from the (cached) asset host, events to the API. */
async function proxyPostHog(request: Request, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.slice(POSTHOG_PATH.length) + url.search;

  if (path.startsWith('/static/') || path.startsWith('/array/')) {
    const cached = await caches.default.match(request);
    if (cached) return cached;
    const response = await fetch(`https://${POSTHOG_ASSET_HOST}${path}`);
    if (response.ok) ctx.waitUntil(caches.default.put(request, response.clone()));
    return response;
  }

  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('authorization');
  // So PostHog places visitors where they are, not at Cloudflare's data center.
  headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') ?? '');
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return fetch(`https://${POSTHOG_API_HOST}${path}`, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : null,
  });
}

function randomRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
