import type { GameView } from '@take5/engine';
import type { ClientIntent, RoomView } from '@take5/protocol';
import { Board } from './Board';
import type { ReactionShown } from './connection';
import { Countdown } from './Countdown';
import { Hand } from './Hand';
import { PlaceFlight } from './PlaceFlight';
import { Floaters } from './Reactions';
import { RevealTray } from './RevealTray';
import { tableFrom, type Frame } from './reveal';
import { SeatStrip } from './SeatStrip';
import { t, tControls } from './strings';
import { TakeFlight } from './TakeFlight';

interface Props {
  view: RoomView;
  game: GameView;
  /** The Reveal step being shown, or null for the live snapshot. */
  frame: Frame | null;
  reactions: ReactionShown[];
  send: (intent: ClientIntent) => void;
  onLeave: () => void;
}

export function GameTable({ view, game, frame, reactions, send, onLeave }: Props) {
  const name = (seat: number) => view.gameSeats[seat]?.nickname ?? '?';
  const table = frame?.table ?? tableFrom(game);
  // A Reveal is playing: from the flip until every Card is Placed, no new Pick.
  const animating = frame !== null;
  // While the Reveal that ends a Round plays, the next Round's Hand waits.
  const nextDealt = table.round !== game.round;
  const mySeat = game.seat;
  const isHost = view.hostId === view.you;
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
        <span className="muted">{t.round(table.round, table.turn)}</span>
        {isHost && (
          <label className="row animate-toggle muted">
            <input
              type="checkbox"
              checked={view.settings.animateCards}
              onChange={(e) => send({ type: 'settings', animateCards: e.target.checked })}
            />
            {tControls.animateCardsShort}
          </label>
        )}
      </div>

      <div className="table-seats">
        <SeatStrip view={view} game={game} table={table} reactions={reactions} send={send} />
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
        <button className="quiet small leave-table" onClick={onLeave}>
          {t.leave}
        </button>
      </div>

      <Board
        table={table}
        choosable={iMustChoose}
        onChoose={(row) => send({ type: 'chooseRow', row })}
      />

      <div className="status">
        <RevealTray
          tray={table.tray}
          seats={game.config.seatCount}
          you={!animating && game.phase === 'picking' ? mySeat : null}
          choosing={animating ? null : table.choosing}
          name={name}
        />
        <p className={`prompt ${iMustChoose ? 'urgent' : ''}`} aria-live="polite">
          {prompt}
        </p>
        {!animating && <Countdown deadline={view.deadline} now={view.now} />}
      </div>

      {mySeat !== null && game.phase !== 'gameOver' && (
        <Hand
          hand={nextDealt ? table.hand : game.hand}
          enabled={!animating && game.phase === 'picking'}
          onPick={(card) => send({ type: 'pick', card })}
        />
      )}

      <TakeFlight flight={table.flight} />
      <PlaceFlight table={table} enabled={view.settings.animateCards} />
    </section>
  );
}
