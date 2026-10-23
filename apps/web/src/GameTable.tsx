import { bullHeads, type Card, type GameView } from '@take5/engine';
import type { ClientIntent, RoomView } from '@take5/protocol';
import { Countdown } from './Countdown';
import { t } from './strings';

interface Props {
  view: RoomView;
  game: GameView;
  send: (intent: ClientIntent) => void;
}

export function GameTable({ view, game, send }: Props) {
  const name = (seat: number) => view.gameSeats[seat]?.nickname ?? '?';
  const mySeat = game.seat;
  const iMustChoose = game.phase === 'choosingRow' && game.choosingSeat === mySeat;

  let prompt: string;
  if (mySeat === null) prompt = t.spectating;
  else if (iMustChoose) prompt = t.chooseRowPrompt(game.unplaced[0]!.card);
  else if (game.phase === 'choosingRow') prompt = t.othersChoosing(name(game.choosingSeat!));
  else prompt = game.pick === null ? t.pickPrompt : t.picked;

  return (
    <section className="stack">
      <p className="muted">{t.round(game.round, game.turn)}</p>
      <ul className="scores">
        {game.seats.map((seat, i) => (
          <li key={i} className={i === mySeat ? 'me' : ''}>
            <span>
              {name(i)} {seat.picked && t.pickedMark}
            </span>
            <span>{t.bullHeads(seat.score)}</span>
          </li>
        ))}
      </ul>

      <div className="board">
        {game.board.map((row, i) => (
          <button
            key={i}
            className={`board-row ${iMustChoose ? 'choosable' : ''}`}
            disabled={!iMustChoose}
            onClick={() => send({ type: 'chooseRow', row: i })}
            aria-label={t.rowLabel(i)}
          >
            {row.map((card) => (
              <CardFace key={card} card={card} />
            ))}
            <span className="row-total muted">
              {t.bullHeads(row.reduce((n, c) => n + bullHeads(c), 0))}
            </span>
          </button>
        ))}
      </div>

      {game.unplaced.length > 0 && (
        <div className="row wrap">
          {game.unplaced.map((p) => (
            <span key={p.card} className="row">
              <CardFace card={p.card} /> {name(p.seat)}
            </span>
          ))}
        </div>
      )}

      <p className="prompt">{prompt}</p>
      <Countdown deadline={view.deadline} now={view.now} />

      {mySeat !== null && (
        <div className="hand" aria-label={t.yourHand}>
          {game.pick !== null && <CardFace card={game.pick} selected />}
          {game.hand.map((card) => (
            <button
              key={card}
              className="card-button"
              disabled={game.phase !== 'picking'}
              onClick={() => send({ type: 'pick', card })}
            >
              <CardFace card={card} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function CardFace({ card, selected = false }: { card: Card; selected?: boolean }) {
  const heads = bullHeads(card);
  return (
    <span className={`card tier-${heads} ${selected ? 'selected' : ''}`} data-card={card}>
      <span className="card-number">{card}</span>
      <span className="card-heads">{'🐮'.repeat(heads)}</span>
    </span>
  );
}
