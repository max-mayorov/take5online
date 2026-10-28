import type { FlagsResponse } from '@take5/protocol';
import { useEffect, useState } from 'react';

let flags: Promise<FlagsResponse['flags']> | null = null;

/**
 * PostHog feature flags, fetched once per page load from the Worker, which evaluates them for
 * everyone at once. They are kill switches, so they work with analytics off too and send nothing
 * about the visitor.
 */
function loadFlags(): Promise<FlagsResponse['flags']> {
  flags ??= fetch('/api/flags')
    .then((response) => (response.ok ? (response.json() as Promise<FlagsResponse>) : null))
    .then(
      (body) => body?.flags ?? {},
      () => ({}),
    );
  return flags;
}

/** Whether a feature is on: `fallback` until the flags arrive, and whenever PostHog has no answer. */
export function useFlag(key: string, fallback = true): boolean {
  const [on, setOn] = useState(fallback);
  useEffect(() => {
    let current = true;
    void loadFlags().then((all) => {
      const value = all[key];
      if (current && typeof value === 'boolean') setOn(value);
    });
    return () => {
      current = false;
    };
  }, [key]);
  return on;
}
