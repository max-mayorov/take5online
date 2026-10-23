import type { Card } from '@take5/engine';
import { CardFace } from './Card';
import { t } from './strings';

interface Props {
  hand: Card[];
  pick: Card | null;
  enabled: boolean;
  onPick: (card: Card) => void;
}

/** The viewer's Hand as a scrollable fan; the current Pick sits in place, raised. */
export function Hand({ hand, pick, enabled, onPick }: Props) {
  const cards = pick === null ? hand : [...hand, pick].sort((a, b) => a - b);
  return (
    <div className="hand" role="group" aria-label={t.yourHand}>
      {cards.map((card) => (
        <button
          key={card}
          className="card-button"
          data-card={card}
          aria-pressed={card === pick}
          disabled={!enabled}
          onClick={() => card !== pick && onPick(card)}
        >
          <CardFace card={card} />
        </button>
      ))}
    </div>
  );
}
