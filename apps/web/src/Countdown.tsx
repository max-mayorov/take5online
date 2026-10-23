import { useEffect, useMemo, useState } from 'react';
import { tControls } from './strings';

/** Seconds left on the Pick Timer, corrected for the gap between our clock and the server's. */
export function Countdown({ deadline, now }: { deadline: number | null; now: number }) {
  const skew = useMemo(() => now - Date.now(), [now]);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);

  if (deadline === null) return null;
  const seconds = Math.max(0, Math.ceil((deadline - (clock + skew)) / 1000));
  return (
    <span
      className={`countdown ${seconds <= 10 ? 'urgent' : ''}`}
      role="timer"
      aria-label={tControls.countdownLabel(seconds)}
    >
      <span aria-hidden="true">⏱</span> {seconds}s
    </span>
  );
}
