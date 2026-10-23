import type { PostHog } from 'posthog-js';

/** The PostHog project token is public by design: it can only send events, not read them. */
const POSTHOG_TOKEN = 'phc_BgAoPDRJwfq4ovH9BUo8EqWiGu4QYKNLabHUWg3ZTaYf';
/** The Worker forwards this path to PostHog (EU), so ad blockers don't drop the events. */
const POSTHOG_PATH = '/relay';

/** Local servers (dev and e2e) send nothing, so tests don't pollute the data. */
const enabled = !['localhost', '127.0.0.1'].includes(location.hostname);

let posthog: Promise<PostHog> | null = null;

/** Loads PostHog after the app (it's as big as the rest of the bundle). Calls made before then wait. */
export function initAnalytics(): void {
  if (!enabled || posthog) return;
  posthog = import('posthog-js').then(({ default: ph }) => {
    ph.init(POSTHOG_TOKEN, {
      api_host: POSTHOG_PATH,
      ui_host: 'https://eu.posthog.com',
      defaults: '2026-08-30',
      // Nothing is stored in the browser, so no consent banner is needed: PostHog counts visitors with
      // a daily-salted hash on its servers. Session replay needs storage, so it stays off.
      cookieless_mode: 'always',
      person_profiles: 'never',
      disable_session_recording: true,
      capture_exceptions: true,
    });
    return ph;
  });
  // Blocked or offline: the app works the same without analytics.
  posthog.catch(() => {});
}

const withPostHog = (use: (ph: PostHog) => void) => void posthog?.then(use, () => {});

/** Records a custom event. */
export function track(event: string, properties?: Record<string, unknown>): void {
  withPostHog((ph) => ph.capture(event, properties));
}

/** Reports an error the global handlers won't see (e.g. a render error React handled). */
export function reportError(error: unknown, properties?: Record<string, unknown>): void {
  withPostHog((ph) => ph.captureException(error, properties));
}

/** Tags every following event with the Room and Member. */
export function setRoomContext(context: {
  roomCode: string;
  memberId?: string;
  nickname?: string;
}): void {
  withPostHog((ph) =>
    ph.register({
      room_code: context.roomCode,
      ...(context.memberId ? { member_id: context.memberId } : {}),
      ...(context.nickname ? { nickname: context.nickname } : {}),
    }),
  );
}

export function clearRoomContext(): void {
  withPostHog((ph) => {
    for (const key of ['room_code', 'member_id', 'nickname']) ph.unregister(key);
  });
}
