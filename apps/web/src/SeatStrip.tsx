import type { GameView } from '@take5/engine';
import type { ClientIntent, RoomView } from '@take5/protocol';
import { BullIcon } from './Card';
import type { ReactionShown } from './connection';
import { Floaters } from './Reactions';
import type { TableState } from './reveal';
import { SeatActions } from './SeatActions';
import { t, tControls } from './strings';

interface Props {
  view: RoomView;
  game: GameView;
  table: TableState;
  reactions: ReactionShown[];
  send: (intent: ClientIntent) => void;
}

/** One compact chip per Seat: Nickname, Score, Penalty Pile, whether it has Picked, Away. */
export function SeatStrip({ view, game, table, reactions, send }: Props) {
  return (
    <ol className="seats" aria-label={t.seats}>
      {view.gameSeats.map(({ memberId, nickname, bot }, seat) => {
        const member = view.members.find((m) => m.id === memberId);
        const away = member && !member.bot ? !member.connected : false;
        const choosing = table.choosing === seat;
        const picked = game.seats[seat]?.picked ?? false;
        const score = table.scores[seat] ?? 0;
        const pile = table.piles[seat] ?? 0;
        const classes = [
          'seat',
          memberId === view.you && 'me',
          choosing && 'choosing',
          picked && 'picked',
          away && 'away',
          bot && 'bot',
        ];
        return (
          <li key={memberId} className={classes.filter(Boolean).join(' ')} data-seat={seat}>
            <Floaters reactions={reactions} memberId={memberId} name={nickname} />
            <span className="seat-name">
              {nickname}
              {bot && <span className="sr-only"> ({tControls.bot})</span>}
            </span>
            <span className="seat-info" aria-label={t.scoreLabel(nickname, score, pile)}>
              <span className="seat-score">
                <BullIcon />
                {score}
              </span>
              <span className="seat-pile" data-pile={seat}>
                {pile}
              </span>
            </span>
            <span className="seat-status">
              {away ? (
                <span className="badge away-badge">{t.away}</span>
              ) : choosing ? (
                <span className="choosing-mark">
                  <span aria-hidden="true">⏳</span>
                  <span className="sr-only">{t.choosing}</span>
                </span>
              ) : game.phase === 'picking' && !table.roundEnded ? (
                <span className={picked ? 'picked-mark' : 'thinking-mark'}>
                  <span aria-hidden="true">{picked ? t.pickedMark : '…'}</span>
                  <span className="sr-only">{picked ? t.hasPicked : t.thinking}</span>
                </span>
              ) : null}
            </span>
            <SeatActions view={view} memberId={memberId} send={send} />
          </li>
        );
      })}
    </ol>
  );
}
