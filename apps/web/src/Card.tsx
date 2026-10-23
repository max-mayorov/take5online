import { bullHeads, type Card } from '@take5/engine';
import { t } from './strings';

// Original artwork (ADR-0008): a stylised bull head, drawn once and reused through <use>.

const BULL = 'bull-icon';

/** Shared SVG symbols; render once near the root. */
export function Sprites() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <symbol id={BULL} viewBox="0 0 24 24">
        <path d="M7.2 6.2C4.6 6.4 2.4 4.9 1.6 1.8 3.6 3.6 5.6 4 8.2 4.2Z" />
        <path d="M16.8 6.2C19.4 6.4 21.6 4.9 22.4 1.8 20.4 3.6 18.4 4 15.8 4.2Z" />
        <ellipse cx="4.6" cy="9.4" rx="2.6" ry="1.4" transform="rotate(-20 4.6 9.4)" />
        <ellipse cx="19.4" cy="9.4" rx="2.6" ry="1.4" transform="rotate(20 19.4 9.4)" />
        <path d="M12 4.2c3.6 0 6 1.4 6 4.6 0 2.6-.9 5-1.5 7.6-.6 2.9-2 4.6-4.5 4.6s-3.9-1.7-4.5-4.6C6.9 13.8 6 11.4 6 8.8c0-3.2 2.4-4.6 6-4.6Z" />
        <ellipse className="bull-muzzle" cx="12" cy="17.6" rx="3.7" ry="2.9" />
        <circle className="bull-muzzle" cx="9.4" cy="10.6" r="1.05" />
        <circle className="bull-muzzle" cx="14.6" cy="10.6" r="1.05" />
        <circle cx="10.6" cy="17.8" r="0.75" />
        <circle cx="13.4" cy="17.8" r="0.75" />
      </symbol>
    </svg>
  );
}

export function BullIcon({ className = 'bull' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <use href={`#${BULL}`} />
    </svg>
  );
}

/** Icon centres and size on the 60×84 Card, by Bull-head count. */
const LAYOUTS: Record<number, { size: number; at: [number, number][] }> = {
  1: { size: 18, at: [[30, 15]] },
  2: {
    size: 15,
    at: [
      [21, 15],
      [39, 15],
    ],
  },
  3: {
    size: 14,
    at: [
      [14, 15],
      [30, 15],
      [46, 15],
    ],
  },
  5: {
    size: 12,
    at: [
      [15, 11],
      [30, 11],
      [45, 11],
      [22.5, 23],
      [37.5, 23],
    ],
  },
  7: {
    size: 11.5,
    at: [
      [11, 11],
      [23.6, 11],
      [36.3, 11],
      [49, 11],
      [17.3, 23],
      [30, 23],
      [42.6, 23],
    ],
  },
};

interface CardProps {
  card: Card;
  className?: string;
}

/**
 * A Card: big number, one bull per Bull-head, and a colour by tier. The icon count (and, for
 * 5 and 7, a double frame) carries the tier too, so colour is never the only cue.
 */
export function CardFace({ card, className = '' }: CardProps) {
  const heads = bullHeads(card);
  const layout = LAYOUTS[heads]!;
  const half = layout.size / 2;
  return (
    <svg
      className={`card tier-${heads} ${className}`}
      viewBox="0 0 60 84"
      role="img"
      aria-label={t.cardLabel(card, heads)}
      data-card={card}
    >
      <rect className="card-bg" x="1" y="1" width="58" height="82" rx="6" />
      {heads >= 5 && (
        <rect className="card-frame" x="4.5" y="4.5" width="51" height="75" rx="3.5" />
      )}
      {layout.at.map(([x, y], i) => (
        <use
          key={i}
          className="card-bull"
          href={`#${BULL}`}
          x={x - half}
          y={y - half}
          width={layout.size}
          height={layout.size}
        />
      ))}
      <text className="card-number" x="30" y="62" textAnchor="middle">
        {card}
      </text>
    </svg>
  );
}

/** A face-down Card, for Picks that have not been Revealed yet. */
export function CardBack({ className = '' }: { className?: string }) {
  return (
    <svg className={`card card-back ${className}`} viewBox="0 0 60 84" aria-label={t.hiddenCard}>
      <rect className="card-bg" x="1" y="1" width="58" height="82" rx="6" />
      <rect className="card-frame" x="5" y="5" width="50" height="74" rx="3.5" />
      <use className="card-bull" href={`#${BULL}`} x="15" y="27" width="30" height="30" />
    </svg>
  );
}
