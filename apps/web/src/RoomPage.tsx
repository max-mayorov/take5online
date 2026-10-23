import type { GameEvent } from '@take5/engine';
import { MAX_END_SCORE, MIN_END_SCORE, type RoomView } from '@take5/protocol';
import { useState, type FormEvent } from 'react';
import { useRoom } from './connection';
import { GameTable } from './GameTable';
import { t } from './strings';

type Room = ReturnType<typeof useRoom>;

export function RoomPage({ code, onExit }: { code: string; onExit: () => void }) {
  const room = useRoom(code);

  if (room.status === 'notFound' || room.status === 'left') {
    return (
      <main className="center">
        {room.status === 'notFound' && <p>{t.roomNotFound}</p>}
        <button onClick={onExit}>{t.backHome}</button>
      </main>
    );
  }
  if (room.status === 'reload') {
    return (
      <main className="center">
        <p>{t.reload}</p>
        <button onClick={() => location.reload()}>{t.reloadButton}</button>
      </main>
    );
  }

  return (
    <main className="room">
      <Header code={code} reconnecting={room.reconnecting} />
      {room.error && <p className="error">{t.errors[room.error]}</p>}
      {room.status === 'needNickname' && <NicknameForm onSubmit={room.join} />}
      {room.status === 'connecting' && <p>{t.connecting}</p>}
      {room.status === 'joined' && room.room && <Joined room={room} view={room.room} />}
    </main>
  );
}

function Header({ code, reconnecting }: { code: string; reconnecting: boolean }) {
  const [copied, setCopied] = useState(false);
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
    <header className="row spread">
      <h1>{t.room(code)}</h1>
      <span className="row">
        {reconnecting && <span className="muted">{t.reconnecting}</span>}
        <button onClick={copy}>{copied ? t.copied : t.copyLink}</button>
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
    <form onSubmit={submit} className="stack">
      <label htmlFor="nickname">{t.nicknamePrompt}</label>
      <div className="row">
        <input
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={t.nicknamePlaceholder}
          maxLength={16}
          autoFocus
        />
        <button type="submit" className="primary">
          {t.enterRoom}
        </button>
      </div>
    </form>
  );
}

function Joined({ room, view }: { room: Room; view: RoomView }) {
  return (
    <>
      {view.phase === 'game' && view.game && (
        <GameTable view={view} game={view.game} send={room.send} />
      )}
      {view.phase === 'results' && <Results view={view} />}
      {view.phase !== 'game' && <Lobby room={room} view={view} />}
      {view.phase === 'game' && <Members view={view} />}
      <EventLog events={room.events} view={view} />
    </>
  );
}

function Lobby({ room, view }: { room: Room; view: RoomView }) {
  const isHost = view.hostId === view.you;
  const seated = view.seats.includes(view.you);
  const [endScore, setEndScore] = useState(String(view.settings.endScore));
  const saveEndScore = () => {
    const value = Number(endScore);
    if (Number.isInteger(value) && value >= MIN_END_SCORE && value <= MAX_END_SCORE) {
      if (value !== view.settings.endScore) room.send({ type: 'settings', endScore: value });
    } else {
      setEndScore(String(view.settings.endScore));
    }
  };

  return (
    <section className="stack">
      {view.phase === 'lobby' && <h2>{t.lobby}</h2>}
      <Members view={view} />
      <div className="row wrap">
        {seated ? (
          <button onClick={() => room.send({ type: 'stand' })}>{t.stand}</button>
        ) : (
          <button onClick={() => room.send({ type: 'sit' })}>{t.sit}</button>
        )}
        <button onClick={room.leave}>{t.leave}</button>
      </div>
      {isHost ? (
        <div className="stack">
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
          <button
            className="primary"
            disabled={view.seats.length < 2}
            onClick={() => room.send({ type: 'start' })}
          >
            {view.phase === 'results' ? t.rematch : t.start}
          </button>
          {view.seats.length < 2 && <p className="muted">{t.needPlayers}</p>}
        </div>
      ) : (
        <p className="muted">
          {t.endScore} {view.settings.endScore}. {t.waitingForHost}
        </p>
      )}
    </section>
  );
}

function Members({ view }: { view: RoomView }) {
  const label = (id: string) => {
    const member = view.members.find((m) => m.id === id)!;
    const tags = [
      id === view.hostId && t.host,
      id === view.you && t.you,
      !member.connected && t.away,
    ].filter(Boolean);
    return (
      <li key={id} className={member.connected ? '' : 'muted'}>
        {member.nickname}
        {tags.length > 0 && <span className="muted"> ({tags.join(', ')})</span>}
      </li>
    );
  };
  const watching = view.members.filter((m) => !m.seated);
  return (
    <div className="members">
      {view.phase !== 'game' && <h3>{t.players(view.seats.length)}</h3>}
      {view.phase !== 'game' && <ol>{view.seats.map(label)}</ol>}
      {watching.length > 0 && (
        <>
          <h3>{t.spectators}</h3>
          <ul>{watching.map((m) => label(m.id))}</ul>
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
    <section className="stack">
      <h2>{t.results}</h2>
      <p className="big">{t.winners(game.winners.map(name))}</p>
      <h3>{t.finalScores}</h3>
      <ol>
        {order.map(({ seat, score }) => (
          <li key={seat}>
            {name(seat)} — {t.bullHeads(score)}
          </li>
        ))}
      </ol>
      <h3>{t.sessionTotals}</h3>
      <table>
        <thead>
          <tr>
            <th>{t.totalsHeader.name}</th>
            <th>{t.totalsHeader.games}</th>
            <th>{t.totalsHeader.wins}</th>
            <th>{t.totalsHeader.bullHeads}</th>
          </tr>
        </thead>
        <tbody>
          {view.totals.map((total) => (
            <tr key={total.memberId}>
              <td>{total.nickname}</td>
              <td>{total.games}</td>
              <td>{total.wins}</td>
              <td>{total.bullHeads}</td>
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
        .slice(-8)
        .reverse()
        .map((line, i) => (
          <li key={i}>{line}</li>
        ))}
    </ul>
  );
}
