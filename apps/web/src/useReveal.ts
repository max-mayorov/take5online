import type { GameEvent, GameView } from '@take5/engine';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { revealFrames, summarySounds, type Frame } from './reveal';
import { playSound } from './sound';

/** One snapshot change: the Game before it and the events that led to the new one. */
export interface Update {
  seq: number;
  before: GameView | null;
  events: GameEvent[];
}

/** Beyond this many queued steps, older Reveals are dropped rather than replayed. */
const MAX_QUEUE = 80;

function reducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Plays each Update's Reveal as a sequence of table frames. Returns the frame to show, or null
 * when the table should show the live snapshot.
 */
export function useReveal(update: Update | null) {
  const [queue, setQueue] = useState<Frame[]>([]);
  const seen = useRef(update?.seq ?? 0);

  // Before paint: the render that brings a new snapshot must not show it before its Reveal.
  useLayoutEffect(() => {
    if (!update || update.seq <= seen.current) return;
    seen.current = update.seq;
    if (!update.before) return;
    if (reducedMotion() || document.hidden) {
      summarySounds(update.events).forEach(playSound);
      return;
    }
    const frames = revealFrames(update.before, update.events);
    if (frames.length > 0)
      setQueue((q) => (q.length + frames.length > MAX_QUEUE ? frames : [...q, ...frames]));
  }, [update]);

  const frame = queue[0] ?? null;
  useEffect(() => {
    if (!frame) return;
    if (frame.sound) playSound(frame.sound);
    const timer = setTimeout(() => setQueue((q) => (q[0] === frame ? q.slice(1) : q)), frame.ms);
    return () => clearTimeout(timer);
  }, [frame]);

  return frame;
}
