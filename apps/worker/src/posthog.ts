import type { Env } from './env';

/** The PostHog project token is public by design: it can send events and read flags, not data. */
export const POSTHOG_TOKEN = 'phc_BgAoPDRJwfq4ovH9BUo8EqWiGu4QYKNLabHUWg3ZTaYf';
export const POSTHOG_API_HOST = 'eu.i.posthog.com';

/** Only the production deploy sets `POSTHOG=on`; dev servers, tests and PR previews send nothing. */
export const posthogOn = (env: Env) => env.POSTHOG === 'on';

type Properties = Record<string, string | number | boolean>;
type Severity = 'info' | 'warn' | 'error';

const SEVERITY_NUMBER: Record<Severity, number> = { info: 9, warn: 13, error: 17 };

/**
 * Server-side events, exceptions and logs for PostHog, sent in the background. They never identify
 * a visitor: no IP, Nickname or Member id, only the Room Code and counts.
 */
export class Telemetry {
  constructor(
    private readonly env: Env,
    private readonly waitUntil: (promise: Promise<unknown>) => void,
  ) {}

  /** Room events share the Room as their distinct id, so PostHog can count Rooms. */
  capture(event: string, properties: Properties & { room_code?: string } = {}): void {
    this.send('/i/v0/e/', {
      api_key: POSTHOG_TOKEN,
      event,
      distinct_id: properties.room_code ? `room:${properties.room_code}` : 'worker',
      timestamp: new Date().toISOString(),
      properties: {
        ...properties,
        $lib: 'take5-worker',
        $process_person_profile: false,
        $geoip_disable: true,
      },
    });
  }

  captureException(error: unknown, properties: Properties = {}): void {
    const e = error instanceof Error ? error : new Error(String(error));
    this.send('/i/v0/e/', {
      api_key: POSTHOG_TOKEN,
      event: '$exception',
      distinct_id: 'worker',
      timestamp: new Date().toISOString(),
      properties: {
        ...properties,
        $lib: 'take5-worker',
        $process_person_profile: false,
        $geoip_disable: true,
        $exception_list: [
          {
            type: e.name,
            value: e.message,
            mechanism: { type: 'generic', handled: false },
            stacktrace: { type: 'raw', frames: stackFrames(e.stack) },
          },
        ],
      },
    });
    this.log('error', `${e.name}: ${e.message}`, properties);
  }

  /** An OpenTelemetry log record for PostHog Logs. */
  log(severity: Severity, message: string, attributes: Properties = {}): void {
    this.send(
      '/i/v1/logs',
      {
        resourceLogs: [
          {
            resource: { attributes: otlpAttributes({ 'service.name': 'take5-worker' }) },
            scopeLogs: [
              {
                logRecords: [
                  {
                    timeUnixNano: `${Date.now()}000000`,
                    severityNumber: SEVERITY_NUMBER[severity],
                    severityText: severity.toUpperCase(),
                    body: { stringValue: message },
                    attributes: otlpAttributes(attributes),
                  },
                ],
              },
            ],
          },
        ],
      },
      { Authorization: `Bearer ${POSTHOG_TOKEN}` },
    );
  }

  private send(path: string, body: unknown, headers: Record<string, string> = {}): void {
    if (!posthogOn(this.env)) return;
    this.waitUntil(
      fetch(`https://${POSTHOG_API_HOST}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }).catch(() => {}),
    );
  }
}

/** V8 stack lines ("at fn (file:1:2)" or "at file:1:2") as PostHog frames, outermost call first. */
export function stackFrames(stack = '') {
  const frames = [];
  for (const line of stack.split('\n')) {
    const match = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (!match) continue;
    frames.push({
      platform: 'node:javascript',
      function: match[1] ?? '?',
      filename: match[2]!,
      lineno: Number(match[3]),
      colno: Number(match[4]),
      in_app: true,
    });
  }
  return frames.reverse();
}

function otlpAttributes(attributes: Properties) {
  return Object.entries(attributes).map(([key, value]) => ({
    key,
    value:
      typeof value === 'boolean'
        ? { boolValue: value }
        : typeof value === 'number' && Number.isInteger(value)
          ? { intValue: value }
          : typeof value === 'number'
            ? { doubleValue: value }
            : { stringValue: value },
  }));
}

/** Evaluates feature flags for everyone at once (they are kill switches, not per-person rollouts). */
export async function evaluateFlags(env: Env): Promise<Record<string, boolean | string>> {
  if (!posthogOn(env)) return {};
  const response = await fetch(`https://${POSTHOG_API_HOST}/flags/?v=2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: POSTHOG_TOKEN, distinct_id: 'everyone' }),
  });
  if (!response.ok) throw new Error(`PostHog flags: ${response.status}`);
  const { flags } = (await response.json()) as {
    flags: Record<string, { enabled: boolean; variant?: string | null }>;
  };
  return Object.fromEntries(
    Object.entries(flags).map(([key, flag]) => [key, flag.variant ?? flag.enabled]),
  );
}
