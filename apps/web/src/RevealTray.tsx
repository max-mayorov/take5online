import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { CardBack, CardFace } from './Card';
import type { TrayCard } from './reveal';
import { t } from './strings';
import { reducedMotion } from './useReveal';

/** How long a Pick takes to slide over as another arrives or leaves. */
const SLIDE_MS = 300;
/** How long the Picks take to slide into ascending order for Placement. */
const SORT_MS = 600;

interface Props {
  tray: TrayCard[];
  /** How many Seats play: the tray keeps room for all their Picks, so the Hand never moves. */
  seats: number;
  /** The viewer's Seat, whose own Pick is marked while the others are still hidden. */
  you: number | null;
  /** The Seat choosing a Row for its Low Card, whose Card is marked. */
  choosing: number | null;
  name: (seat: number) => string;
}

/** Each Seat's Pick with its Nickname: face down once Picked, then Revealed until Placed. */
export function RevealTray({ tray, seats, you, choosing, name }: Props) {
  const list = useRef<HTMLUListElement>(null);
  const places = useRef(new Map<number, { x: number; y: number }>());

  // Picks slide to their new places as one arrives or leaves, or as the tray sorts for Placement.
  useLayoutEffect(() => {
    const items = [...(list.current?.children ?? [])] as HTMLElement[];
    const before = places.current;
    places.current = new Map(
      items.map((li) => [Number(li.dataset.seat), { x: li.offsetLeft, y: li.offsetTop }]),
    );
    if (reducedMotion()) return;
    // The same Picks in a new order are being sorted for Placement.
    const sorting =
      items.length === before.size && items.every((li) => before.has(Number(li.dataset.seat)));
    for (const li of items) {
      const from = before.get(Number(li.dataset.seat));
      const [dx, dy] = from ? [from.x - li.offsetLeft, from.y - li.offsetTop] : [0, 0];
      if (dx === 0 && dy === 0) continue;
      li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: sorting ? SORT_MS : SLIDE_MS,
        easing: 'ease',
      });
    }
  }, [tray]);

  // One row for a few Seats, two for more.
  const columns = seats <= 6 ? seats : Math.ceil(seats / 2);
  const style = { '--columns': columns, '--rows': Math.ceil(seats / columns) } as CSSProperties;
  return (
    <ul ref={list} className="tray" aria-label={t.picks} style={style}>
      {tray.map((p) => (
        <li
          key={p.seat}
          data-seat={p.seat}
          className={[
            p.seat === choosing ? 'low-card' : p.seat === you ? 'mine' : '',
            p.empty ? 'empty' : '',
          ].join(' ')}
        >
          {p.empty ? (
            <span className="tray-empty" />
          ) : (
            <span className={`flip ${p.card === null ? 'face-down' : ''}`}>
              {p.card !== null && <CardFace card={p.card} className="flip-front" />}
              <CardBack className="flip-back" />
            </span>
          )}
          <span className="tray-name">{name(p.seat)}</span>
        </li>
      ))}
    </ul>
  );
}
