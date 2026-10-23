import type { GameView } from '@take5/engine';
import type { ClientIntent, RoomView } from '@take5/protocol';
import { Board } from './Board';
import type { ReactionShown } from './connection';
import { Hand } from './Hand';
import { Floaters } from './Reactions';
import { RevealTray } from './RevealTray';
import { tableFrom, type Frame } from './reveal';
import { SeatStrip } from './SeatStrip';
import { t } from './strings';
import { TakeFlight } from './TakeFlight';

interface Props {
  view: RoomView;
  game: GameView;
  /** The Reveal step being shown, or null for the live snapshot. */
  frame: Frame | null;
  onSkip: () => void;
  reactions: ReactionShown[];
  send: (intent: ClientIntent) => void;
}

export function GameTable({ view, game, frame, onSkip, reactions, send }: Props) {
  const name = (seat: number) => view.gameSeats[seat]?.nickname ?? '?';
  const table = frame?.table ?? tableFrom(game);
  const animating = frame !== null;
  const mySeat = game.seat;
  const iMustChoose = !animating && game.phase === 'choosingRow' && game.choosingSeat === mySeat;

  let prompt: string;
  if (animating) prompt = table.roundEnded ? t.roundOver(table.roundEnded) : t.revealing;
  else if (mySeat === null) prompt = t.spectating;
  else if (iMustChoose) prompt = t.chooseRowPrompt(game.unplaced[0]!.card);
  else if (game.phase === 'choosingRow') prompt = t.othersChoosing(name(game.choosingSeat!));
  else prompt = game.pick === null ? t.pickPrompt : t.picked;

  const watching = view.members.filter((m) => !view.gameSeats.some((s) => s.memberId === m.id));

  return (
    <section className={`table ${iMustChoose ? 'must-choose' : ''}`}>
      <div className="table-top">
        <span className="muted">{t.round(game.round, game.turn)}</span>
        {animating && (
          <button className="skip" onClick={onSkip}>
            {t.skip} ⏭
          </button>
        )}
      </div>

      <div className="table-seats">
        <SeatStrip view={view} game={game} table={table} reactions={reactions} />
        {watching.length > 0 && (
          <p className="watching muted">
            {t.spectators}:{' '}
            {watching.map((m) => (
              <span key={m.id} className="watcher">
                <Floaters reactions={reactions} memberId={m.id} name={m.nickname} />
                {m.nickname}
              </span>
            ))}
          </p>
        )}
      </div>

      <Board
        table={table}
        choosable={iMustChoose}
        onChoose={(row) => send({ type: 'chooseRow', row })}
      />

      <div className="status">
        {table.tray.length > 0 && (
          <RevealTray
            tray={table.tray}
            faceDown={table.faceDown}
            choosing={animating ? null : table.choosing}
            name={name}
          />
        )}
        <p className={`prompt ${iMustChoose ? 'urgent' : ''}`} aria-live="polite">
          {prompt}
        </p>
      </div>

      {mySeat !== null && game.phase !== 'gameOver' && (
        <Hand
          hand={game.hand}
          pick={game.pick}
          enabled={game.phase === 'picking'}
          onPick={(card) => send({ type: 'pick', card })}
        />
      )}

      <TakeFlight flight={table.flight} />
    </section>
  );
}
