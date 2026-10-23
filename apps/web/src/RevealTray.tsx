import type { PlayedCard } from '@take5/engine';
import { CardBack, CardFace } from './Card';
import { t } from './strings';

interface Props {
  tray: PlayedCard[];
  faceDown: boolean;
  /** The Seat choosing a Row for its Low Card, whose Card is marked. */
  choosing: number | null;
  name: (seat: number) => string;
}

/** Revealed Picks waiting for Placement, each with its Seat's Nickname. */
export function RevealTray({ tray, faceDown, choosing, name }: Props) {
  return (
    <ul className="tray" aria-label={t.revealedPicks}>
      {tray.map((p) => (
        <li key={p.card} className={p.seat === choosing ? 'low-card' : ''}>
          <span className={`flip ${faceDown ? 'face-down' : ''}`}>
            <CardFace card={p.card} className="flip-front" />
            <CardBack className="flip-back" />
          </span>
          <span className="tray-name">{name(p.seat)}</span>
        </li>
      ))}
    </ul>
  );
}
