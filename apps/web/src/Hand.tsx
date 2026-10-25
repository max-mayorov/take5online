import type { Card } from '@take5/engine';
import { CardFace } from './Card';
import { t } from './strings';

interface Props {
  hand: Card[];
  enabled: boolean;
  onPick: (card: Card) => void;
}

/** The viewer's Hand, all in view at once; the current Pick waits in the tray, not here. */
export function Hand({ hand, enabled, onPick }: Props) {
  return (
    <div className="hand" role="group" aria-label={t.yourHand}>
      {hand.map((card) => (
        <button
          key={card}
          className="card-button"
          data-card={card}
          disabled={!enabled}
          onClick={() => onPick(card)}
        >
          <CardFace card={card} />
        </button>
      ))}
    </div>
  );
}
