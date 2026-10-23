import type { PostHog } from 'posthog-js';

/** The PostHog project token is public by design: it can only send events, not read them. */
const POSTHOG_TOKEN = 'phc_BgAoPDRJwfq4ovH9BUo8EqWiGu4QYKNLabHUWg3ZTaYf';
/** The Worker forwards this path to PostHog (EU), so ad blockers don't drop the events. */
const POSTHOG_PATH = '/relay';
/** Set when someone turns analytics off on the privacy page; storing their objection is strictly necessary. */
const OPT_OUT_KEY = 'take5:no-analytics';

/** Only the live site sends events; local servers (dev, e2e) and PR previews don't pollute the data. */
export const liveSite = location.hostname === 'take5.mayorov.dev';
const enabled = liveSite;

let posthog: Promise<PostHog> | null = null;
/** This page's choice, which also covers browsers that refuse storage. */
let optOutChoice: boolean | null = null;

/** Global Privacy Control or Do Not Track: the browser objects on its owner's behalf. */
export function browserObjects(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1';
}

function optedOut(): boolean {
  if (optOutChoice !== null) return optOutChoice;
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function analyticsOn(): boolean {
  return enabled && !browserObjects() && !optedOut();
}

/** Loads PostHog after the app (it's as big as the rest of the bundle). Calls made before then wait. */
export function initAnalytics(): void {
  if (!analyticsOn() || posthog) return;
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
      // Buttons and labels show Nicknames; autocapture records which element was clicked, not its text.
      mask_all_text: true,
      mask_all_element_attributes: true,
      capture_exceptions: true,
      // Opting out must stop events at once; cookieless mode ignores PostHog's own opt-out.
      before_send: (event) => (analyticsOn() ? event : null),
    });
    return ph;
  });
  // Blocked or offline: the app works the same without analytics.
  posthog.catch(() => {});
}

/** Turns analytics off or back on for this browser, from now on. */
export function setAnalyticsOn(on: boolean): void {
  optOutChoice = !on;
  try {
    if (on) localStorage.removeItem(OPT_OUT_KEY);
    else localStorage.setItem(OPT_OUT_KEY, '1');
  } catch {
    // Without storage the choice lasts until the page is reloaded.
  }
  if (on) initAnalytics();
}

const withPostHog = (use: (ph: PostHog) => void) => {
  if (analyticsOn()) void posthog?.then(use, () => {});
};

/** Records a custom event. */
export function track(event: string, properties?: Record<string, unknown>): void {
  withPostHog((ph) => ph.capture(event, properties));
}

/** Reports an error the global handlers won't see (e.g. a render error React handled). */
export function reportError(error: unknown, properties?: Record<string, unknown>): void {
  withPostHog((ph) => ph.captureException(error, properties));
}

/** Tags every following event with the Room and the Member's random id (never the Nickname). */
export function setRoomContext(context: { roomCode: string; memberId?: string }): void {
  withPostHog((ph) =>
    ph.register({
      room_code: context.roomCode,
      ...(context.memberId ? { member_id: context.memberId } : {}),
    }),
  );
}

export function clearRoomContext(): void {
  withPostHog((ph) => {
    for (const key of ['room_code', 'member_id']) ph.unregister(key);
  });
}
