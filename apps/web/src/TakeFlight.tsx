import { useLayoutEffect, useRef } from 'react';
import { CardFace } from './Card';
import type { TableState } from './reveal';

/** Flies a Taken Row's Cards from their slots into the taker's Penalty Pile in the Seat strip. */
export function TakeFlight({ flight }: { flight: TableState['flight'] }) {
  const layer = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!flight || !layer.current) return;
    const slots = document.querySelectorAll(`.board-row[data-row="${flight.row}"] .slot`);
    const pile = document.querySelector(`[data-pile="${flight.seat}"]`)?.getBoundingClientRect();
    layer.current.querySelectorAll<HTMLElement>('.flyer').forEach((el, i) => {
      const from = slots[i]?.getBoundingClientRect();
      if (!from || !pile) return;
      Object.assign(el.style, {
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
      });
      const dx = pile.left + pile.width / 2 - (from.left + from.width / 2);
      const dy = pile.top + pile.height / 2 - (from.top + from.height / 2);
      el.animate(
        [
          { transform: 'none', opacity: 1 },
          {
            transform: `translate(${dx}px, ${dy}px) scale(0.25) rotate(${i * 9 - 18}deg)`,
            opacity: 0.3,
          },
        ],
        { duration: 600, delay: i * 40, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' },
      );
    });
  }, [flight]);

  if (!flight) return null;
  return (
    <div className="flight" ref={layer} aria-hidden="true">
      {flight.cards.map((card) => (
        <span key={card} className="flyer">
          <CardFace card={card} />
        </span>
      ))}
    </div>
  );
}
