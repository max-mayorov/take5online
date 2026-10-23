import type { Card } from '@take5/engine';
import { useLayoutEffect, useRef } from 'react';
import { CardFace } from './Card';
import type { TableState } from './reveal';

/** How long a Card takes to land, within its frame of the Reveal. */
const FLY_MS = 350;

/** Where each Card the next frame may Place was shown: the tray, or the end of a Row it Takes. */
function cardRects(): Map<Card, DOMRect> {
  const rects = new Map<Card, DOMRect>();
  document
    .querySelectorAll<HTMLElement>('.tray [data-card], .board .row-end [data-card]')
    .forEach((el) => rects.set(Number(el.dataset.card), el.getBoundingClientRect()));
  return rects;
}

/**
 * Flies the Card that has just landed on the Board from where the previous frame showed it, the
 * same way a Taken Row flies into a Penalty Pile: from the tray to its slot, or to the end of the
 * Row it Takes and then into the Row's first slot. The real Card stays hidden until it lands.
 */
export function PlaceFlight({ table, enabled }: { table: TableState; enabled: boolean }) {
  const layer = useRef<HTMLDivElement>(null);
  const last = useRef(new Map<Card, DOMRect>());
  const landed = enabled ? (table.taking ?? table.placed) : null;

  useLayoutEffect(() => {
    const from = landed && last.current.get(landed.card);
    last.current = cardRects();
    const flyer = layer.current?.querySelector<HTMLElement>('.flyer');
    if (!landed || !flyer) return;
    // A Taking Card lands twice, at the end of its Row and then in its first slot, in one flyer.
    flyer.style.display = '';
    flyer.style.visibility = '';
    const target = document.querySelector<SVGElement>(
      `.board-row[data-row="${landed.row}"] [data-card="${landed.card}"]`,
    );
    const to = target?.getBoundingClientRect();
    if (!from || !target || !to) {
      flyer.style.display = 'none';
      return;
    }
    Object.assign(flyer.style, {
      left: `${to.left}px`,
      top: `${to.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
    });
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    target.style.visibility = 'hidden';
    const flight = flyer.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}) rotate(-12deg)` },
        { transform: 'none' },
      ],
      { duration: FLY_MS, easing: 'cubic-bezier(.2,.6,.35,1)', fill: 'forwards' },
    );
    const land = () => {
      target.style.visibility = '';
      flyer.style.visibility = 'hidden';
    };
    flight.onfinish = land;
    return () => {
      flight.cancel();
      land();
    };
  }, [table, landed]);

  if (!landed) return null;
  return (
    <div className="flight" ref={layer} aria-hidden="true">
      <span key={`${landed.row}-${landed.card}`} className="flyer">
        <CardFace card={landed.card} />
      </span>
    </div>
  );
}
