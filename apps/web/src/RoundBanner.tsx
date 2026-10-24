import type { CSSProperties } from 'react';
import { BullIcon } from './Card';
import { TIMING, type RoundEnd } from './reveal';
import { t } from './strings';

interface Props {
  end: RoundEnd;
  scores: number[];
  name: (seat: number) => string;
  /** Whether the Seat's Player has tapped Continue. */
  ready: (seat: number) => boolean;
  /** The viewer's Seat, or null for a Spectator, who has nothing to tap. */
  you: number | null;
  onContinue: () => void;
}

/**
 * The Round Summary, over the Board between Rounds: what each Seat Took in the Round that just
 * ended. It closes once every Player taps Continue, or when its time runs out.
 */
export function RoundBanner({ end, scores, name, ready, you, onContinue }: Props) {
  const done = you !== null && ready(you);
  return (
    <section
      className="round-banner"
      aria-label={t.roundBanner(end.round)}
      style={{ '--banner-ms': `${TIMING.roundEnded}ms` } as CSSProperties}
    >
      <div className="round-banner-card">
        <h2>{t.roundBanner(end.round)}</h2>
        <ul>
          {end.points.map((points, seat) => (
            <li key={seat} className={points === 0 ? 'clean' : ''}>
              <span className="round-banner-name">{name(seat)}</span>
              <span className="round-banner-points">
                {t.roundPoints(points)}
                <BullIcon />
              </span>
              <span className="muted">{t.totalScore(scores[seat]!)}</span>
              <span className="picked-mark" aria-label={ready(seat) ? t.ready : undefined}>
                {ready(seat) ? t.pickedMark : ''}
              </span>
            </li>
          ))}
        </ul>
        {end.next !== null && <p className="round-banner-next">{t.nextRound(end.next)}</p>}
        {you !== null && (
          <button className="primary round-banner-continue" disabled={done} onClick={onContinue}>
            {done ? t.waitingForOthers : t.continue}
          </button>
        )}
        <div className="round-banner-time" aria-hidden="true" />
      </div>
    </section>
  );
}
