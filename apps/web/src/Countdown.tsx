import { useEffect, useMemo, useState } from 'react';
import { tControls } from './strings';

interface Props {
  deadline: number | null;
  now: number;
  /** Hidden while a Reveal plays, but still taking up its line so the Hand below stays put. */
  hidden: boolean;
}

/** Seconds left on the Pick Timer, corrected for the gap between our clock and the server's. */
export function Countdown({ deadline, now, hidden }: Props) {
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
      className={`countdown ${seconds <= 10 ? 'urgent' : ''} ${hidden ? 'hidden' : ''}`}
      role="timer"
      aria-label={tControls.countdownLabel(seconds)}
    >
      <span aria-hidden="true">⏱</span> {seconds}s
    </span>
  );
}
