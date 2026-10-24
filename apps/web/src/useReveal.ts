import type { GameView } from '@take5/engine';
import type { RoomEvent } from '@take5/protocol';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { revealFrames, summarySounds, type Frame } from './reveal';
import { playSound } from './sound';

/** One snapshot change: the Game before it and the events that led to the new one. */
export interface Update {
  seq: number;
  before: GameView | null;
  events: RoomEvent[];
}

/** A Reveal step, with the Update it shows. */
export interface QueuedFrame extends Frame {
  seq: number;
}

/** Beyond this many queued steps, older Reveals are dropped rather than replayed. */
const MAX_QUEUE = 80;

export function reducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Plays each Update's Reveal as a sequence of table frames. Returns the frame to show, or null
 * when the table should show the live snapshot. `summary` is the Round whose Round Summary is
 * still open on the server: a Summary frame for any other Round has closed, so it is skipped.
 */
export function useReveal(update: Update | null, summary: number | null) {
  const [queue, setQueue] = useState<QueuedFrame[]>([]);
  const seen = useRef(update?.seq ?? 0);

  // Before paint: the render that brings a new snapshot must not show it before its Reveal.
  useLayoutEffect(() => {
    if (!update || update.seq <= seen.current) return;
    seen.current = update.seq;
    if (!update.before) return;
    if (document.hidden) {
      summarySounds(update.events).forEach(playSound);
      return;
    }
    const { seq } = update;
    let frames = revealFrames(update.before, update.events).map((f) => ({ ...f, seq }));
    // Without motion only the Round Summary shows, as it waits for the Players to tap Continue.
    if (reducedMotion()) {
      summarySounds(update.events).forEach(playSound);
      frames = frames.filter((f) => f.table.roundEnded);
    }
    if (frames.length > 0)
      setQueue((q) => (q.length + frames.length > MAX_QUEUE ? frames : [...q, ...frames]));
  }, [update]);

  const frame = queue[0] ?? null;
  const closed = !!frame?.table.roundEnded && frame.table.roundEnded.round !== summary;
  useEffect(() => {
    if (!frame) return;
    const next = () => setQueue((q) => (q[0] === frame ? q.slice(1) : q));
    if (closed) return next();
    if (frame.sound) playSound(frame.sound);
    const timer = setTimeout(next, frame.ms);
    return () => clearTimeout(timer);
  }, [frame, closed]);

  return frame;
}
