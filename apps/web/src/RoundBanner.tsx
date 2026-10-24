import type { CSSProperties } from 'react';
import { BullIcon } from './Card';
import { TIMING, type RoundEnd } from './reveal';
import { t } from './strings';

interface Props {
  end: RoundEnd;
  scores: number[];
  name: (seat: number) => string;
}

/** Shown over the Board between Rounds: what each Seat Took in the Round that just ended. */
export function RoundBanner({ end, scores, name }: Props) {
  // The prompt and the log already announce the Round's end; the Seat strip holds the Scores.
  return (
    <div
      className="round-banner"
      aria-hidden="true"
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
            </li>
          ))}
        </ul>
        {end.next !== null && <p className="round-banner-next">{t.nextRound(end.next)}</p>}
      </div>
    </div>
  );
}
