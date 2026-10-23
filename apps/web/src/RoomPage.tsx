import type { GameEvent } from '@take5/engine';
import { MAX_END_SCORE, MIN_END_SCORE, type Reaction, type RoomView } from '@take5/protocol';
import { useState, type FormEvent } from 'react';
import { BullIcon } from './Card';
import { useRoom } from './connection';
import { GameTable } from './GameTable';
import { HostControls } from './HostControls';
import { Floaters, ReactionPicker } from './Reactions';
import { RulesLink } from './RulesLink';
import { SeatActions } from './SeatActions';
import { setMuted, useMuted } from './sound';
import { t, tControls, tPrivacy } from './strings';
import { useReveal } from './useReveal';

type Room = ReturnType<typeof useRoom>;

export function RoomPage({ code, onExit }: { code: string; onExit: () => void }) {
  const room = useRoom(code);

  if (room.status === 'notFound' || room.status === 'left' || room.status === 'kicked') {
    return (
      <main className="center">
        {room.status === 'notFound' && <p>{t.roomNotFound}</p>}
        {room.status === 'kicked' && <p>{tControls.kicked}</p>}
        <button onClick={onExit}>{t.backHome}</button>
      </main>
    );
  }
  if (room.status === 'reload') {
    return (
      <main className="center">
        <p>{t.reload}</p>
        <button className="primary" onClick={() => location.reload()}>
          {t.reloadButton}
        </button>
      </main>
    );
  }

  const joined = room.status === 'joined' && room.room;
  return (
    <main className="room">
      <Header
        code={code}
        reconnecting={room.reconnecting}
        onReact={joined ? (emoji) => room.send({ type: 'react', emoji }) : null}
        onHome={onExit}
      />
      {room.cantConnect && (
        <p className="error" role="alert">
          {t.cantConnect(location.host)}
        </p>
      )}
      {room.error && (
        <p className="error" role="alert">
          {t.errors[room.error]}
        </p>
      )}
      {room.status === 'needNickname' && <NicknameForm onSubmit={room.join} />}
      {room.status === 'connecting' && !room.cantConnect && <p className="muted">{t.connecting}</p>}
      {joined && <Joined room={room} view={room.room!} />}
    </main>
  );
}

function Header({
  code,
  reconnecting,
  onReact,
  onHome,
}: {
  code: string;
  reconnecting: boolean;
  onReact: ((emoji: Reaction) => void) | null;
  onHome: () => void;
}) {
  const muted = useMuted();
  return (
    <header className="room-header">
      <button className="brand-button" onClick={onHome} aria-label={t.backHome}>
        <BullIcon className="brand-icon" />
      </button>
      <h1>{t.room(code)}</h1>
      {reconnecting && <span className="badge">{t.reconnecting}</span>}
      <span className="header-tools">
        <RulesLink className="icon-button rules-link" />
        {onReact && <ReactionPicker onReact={onReact} />}
        <button
          className="icon-button"
          onClick={() => setMuted(!muted)}
          aria-label={muted ? t.unmute : t.mute}
          aria-pressed={muted}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </span>
    </header>
  );
}

function NicknameForm({ onSubmit }: { onSubmit: (nickname: string) => void }) {
  const [nickname, setNickname] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (nickname.trim()) onSubmit(nickname.trim());
  };
  return (
    <form onSubmit={submit} className="panel stack">
      <label htmlFor="nickname">{t.nicknamePrompt}</label>
      <div className="row">
        <input
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={t.nicknamePlaceholder}
          maxLength={16}
          autoComplete="nickname"
          autoFocus
        />
        <button type="submit" className="primary">
          {t.enterRoom}
        </button>
      </div>
      {/* A new tab, so reading it doesn't leave the room. */}
      <a className="footer-link" href="/privacy" target="_blank" rel="noopener">
        {tPrivacy.link}
      </a>
    </form>
  );
}

function Joined({ room, view }: { room: Room; view: RoomView }) {
  const frame = useReveal(room.update);
  // Keep the table up while the last Reveal of a Game plays out, then show Results.
  const atTable = view.game && (view.phase === 'game' || frame !== null);
  return (
    <>
      {atTable ? (
        <GameTable
          view={view}
          game={view.game!}
          frame={frame}
          reactions={room.reactions}
          send={room.send}
          onLeave={room.leave}
        />
      ) : (
        <div className="lobby-layout">
          {view.phase === 'results' && <Results view={view} />}
          <Lobby room={room} view={view} />
        </div>
      )}
      {!frame && <EventLog events={room.events} view={view} />}
    </>
  );
}

function Lobby({ room, view }: { room: Room; view: RoomView }) {
  const isHost = view.hostId === view.you;
  const seated = view.seats.includes(view.you);
  const [endScore, setEndScore] = useState(String(view.settings.endScore));
  const [copied, setCopied] = useState(false);
  const saveEndScore = () => {
    const value = Number(endScore);
    if (Number.isInteger(value) && value >= MIN_END_SCORE && value <= MAX_END_SCORE) {
      if (value !== view.settings.endScore) room.send({ type: 'settings', endScore: value });
    } else {
      setEndScore(String(view.settings.endScore));
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; the code is on screen anyway.
    }
  };

  return (
    <section className="panel stack lobby">
      {view.phase === 'lobby' && (
        <div className="share">
          <span className="muted">{t.roomCode}</span>
          <span className="code-letters" aria-label={view.code}>
            {[...view.code].map((letter, i) => (
              <span key={i}>{letter}</span>
            ))}
          </span>
          <button onClick={copy}>{copied ? t.copied : t.copyLink}</button>
          <span className="muted small">{t.shareHint}</span>
        </div>
      )}
      <Members view={view} reactions={room.reactions} send={room.send} />
      <div className="row wrap">
        {seated ? (
          <button onClick={() => room.send({ type: 'stand' })}>{t.stand}</button>
        ) : (
          <button onClick={() => room.send({ type: 'sit' })}>{t.sit}</button>
        )}
        <button className="quiet" onClick={room.leave}>
          {t.leave}
        </button>
      </div>
      {isHost ? (
        <div className="stack host-controls">
          <label className="row">
            {t.endScore}
            <input
              type="number"
              min={MIN_END_SCORE}
              max={MAX_END_SCORE}
              value={endScore}
              onChange={(e) => setEndScore(e.target.value)}
              onBlur={saveEndScore}
              className="narrow"
            />
          </label>
          <HostControls view={view} send={room.send} />
          <button
            className="primary big-button"
            disabled={view.seats.length < 2}
            onClick={() => room.send({ type: 'start' })}
          >
            {view.phase === 'results' ? t.rematch : t.start}
          </button>
          {view.seats.length < 2 && <p className="muted">{t.needPlayers}</p>}
        </div>
      ) : (
        <p className="muted">
          {t.endScore} {view.settings.endScore}. {tControls.pickTimerNote(view.settings.pickTimer)}{' '}
          {tControls.animateCardsNote(view.settings.animateCards)} {t.waitingForHost}
        </p>
      )}
    </section>
  );
}

function Members({
  view,
  reactions,
  send,
}: {
  view: RoomView;
  reactions: Room['reactions'];
  send: Room['send'];
}) {
  const label = (id: string) => {
    const member = view.members.find((m) => m.id === id)!;
    const tags = [
      id === view.hostId && t.host,
      id === view.you && t.you,
      member.bot && tControls.bot,
      !member.connected && !member.bot && t.away,
    ].filter(Boolean);
    const state = member.bot ? 'bot' : member.connected ? '' : 'away';
    return (
      <li key={id} className={`member ${state}`}>
        <Floaters reactions={reactions} memberId={id} name={member.nickname} />
        {member.nickname}
        {tags.length > 0 && <span className="muted"> ({tags.join(', ')})</span>}
        <SeatActions view={view} memberId={id} send={send} />
      </li>
    );
  };
  const watching = view.members.filter((m) => !m.seated);
  return (
    <div className="members">
      <h3>{t.players(view.seats.length)}</h3>
      <ol className="member-list">{view.seats.map(label)}</ol>
      {watching.length > 0 && (
        <>
          <h3>{t.spectators}</h3>
          <ul className="member-list">{watching.map((m) => label(m.id))}</ul>
        </>
      )}
    </div>
  );
}

function Results({ view }: { view: RoomView }) {
  const game = view.game!;
  const name = (seat: number) => view.gameSeats[seat]?.nickname ?? '?';
  const order = game.seats
    .map((s, seat) => ({ seat, score: s.score }))
    .sort((a, b) => a.score - b.score);
  return (
    <section className="panel stack results">
      <h2>{t.results}</h2>
      <p className="winner">
        <span aria-hidden="true">🏆 </span>
        {t.winners(game.winners.map(name))}
      </p>
      <h3>{t.finalScores}</h3>
      <table className="score-table">
        <thead>
          <tr>
            <th>{t.scoreHeader.place}</th>
            <th>{t.scoreHeader.name}</th>
            <th className="num">{t.scoreHeader.score}</th>
          </tr>
        </thead>
        <tbody>
          {order.map(({ seat, score }) => (
            <tr key={seat} className={game.winners.includes(seat) ? 'won' : ''}>
              <td>{order.findIndex((o) => o.score === score) + 1}</td>
              <td>{name(seat)}</td>
              <td className="num">
                <span className="with-icon">
                  <BullIcon />
                  {score}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>{t.sessionTotals}</h3>
      <table className="score-table">
        <thead>
          <tr>
            <th>{t.totalsHeader.name}</th>
            <th className="num">{t.totalsHeader.games}</th>
            <th className="num">{t.totalsHeader.wins}</th>
            <th className="num">{t.totalsHeader.bullHeads}</th>
          </tr>
        </thead>
        <tbody>
          {[...view.totals]
            .sort((a, b) => b.wins - a.wins || a.bullHeads - b.bullHeads)
            .map((total) => (
              <tr key={total.memberId}>
                <td>{total.nickname}</td>
                <td className="num">{total.games}</td>
                <td className="num">{total.wins}</td>
                <td className="num">{total.bullHeads}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}

function EventLog({ events, view }: { events: GameEvent[]; view: RoomView }) {
  const name = (seat: number) => view.gameSeats[seat]?.nickname ?? '?';
  const lines = events.flatMap((event): string[] => {
    switch (event.type) {
      case 'revealed':
        return [t.log.revealed];
      case 'rowTaken':
        return [t.log.took(name(event.seat), event.row, event.bullHeads)];
      case 'roundEnded':
        return [t.log.roundEnded(event.round)];
      case 'roundStarted':
        return [t.log.roundStarted(event.round)];
      default:
        return [];
    }
  });
  if (lines.length === 0) return null;
  return (
    <ul className="log muted">
      {lines
        .slice(-6)
        .reverse()
        .map((line, i) => (
          <li key={i}>{line}</li>
        ))}
    </ul>
  );
}
