import { REACTIONS, type Reaction } from '@take5/protocol';
import { useEffect, useRef, useState } from 'react';
import type { ReactionShown } from './connection';
import { t } from './strings';

/** A button that opens the fixed set of Reactions. */
export function ReactionPicker({ onReact }: { onReact: (emoji: Reaction) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    addEventListener('pointerdown', close);
    return () => removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="reaction-picker" ref={ref}>
      <button
        className="icon-button"
        aria-label={t.react}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        😀
      </button>
      {open && (
        <div className="reaction-menu" role="menu">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              role="menuitem"
              aria-label={t.reactWith(emoji)}
              onClick={() => {
                onReact(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Reactions floating up over one member's name; the parent must be positioned. */
export function Floaters({
  reactions,
  memberId,
  name,
}: {
  reactions: ReactionShown[];
  memberId: string;
  name: string;
}) {
  const mine = reactions.filter((r) => r.memberId === memberId);
  if (mine.length === 0) return null;
  return (
    <span className="floaters" aria-live="polite">
      {mine.map((r) => (
        <span
          key={r.id}
          className="floater"
          style={{ left: `${50 + ((r.id % 3) - 1) * 18}%` }}
          role="img"
          aria-label={t.reacted(name, r.emoji)}
        >
          {r.emoji}
        </span>
      ))}
    </span>
  );
}
