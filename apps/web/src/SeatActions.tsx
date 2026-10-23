import type { ClientIntent, RoomView } from '@take5/protocol';
import { t, tControls } from './strings';

type Send = (intent: ClientIntent) => void;

/** The buttons next to one member: Host controls, and taking over a Bot's Seat. */
export function SeatActions({
  view,
  memberId,
  send,
}: {
  view: RoomView;
  memberId: string;
  send: Send;
}) {
  const member = view.members.find((m) => m.id === memberId);
  if (!member || memberId === view.you) return null;
  const isHost = view.hostId === view.you;
  const seat = view.seats.indexOf(memberId);
  const buttons: { label: string; intent: ClientIntent }[] = [];

  if (member.bot) {
    if (seat !== -1 && !view.seats.includes(view.you)) {
      buttons.push({ label: tControls.takeSeat, intent: { type: 'takeSeat', seat } });
    }
    if (isHost && view.phase !== 'game') {
      buttons.push({ label: tControls.removeBot, intent: { type: 'removeBot', memberId } });
    }
  } else if (isHost) {
    if (seat !== -1 && !member.connected) {
      buttons.push({
        label: tControls.replaceWithBot,
        intent: { type: 'replaceWithBot', memberId },
      });
    }
    buttons.push({ label: tControls.kick, intent: { type: 'kick', memberId } });
  }

  if (buttons.length === 0) return null;
  return (
    <span className="seat-actions">
      {buttons.map(({ label, intent }) => (
        <button
          key={label}
          className="small"
          aria-label={`${label}: ${member.nickname}`}
          onClick={() => send(intent)}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

/** The Seats of the running Game, with Bots and Away Players marked and their actions. */
export function GameSeats({
  view,
  send,
  onLeave,
}: {
  view: RoomView;
  send: Send;
  onLeave: () => void;
}) {
  return (
    <div className="members">
      <h3>{tControls.seats}</h3>
      <ol>
        {view.gameSeats.map(({ memberId, nickname, bot }) => {
          const member = view.members.find((m) => m.id === memberId);
          const tags = [
            bot && tControls.bot,
            memberId === view.hostId && t.host,
            memberId === view.you && t.you,
            member && !bot && !member.connected && t.away,
          ].filter(Boolean);
          return (
            <li key={memberId} className={bot ? 'bot' : member?.connected ? '' : 'muted'}>
              {nickname}
              {tags.length > 0 && <span className="muted"> ({tags.join(', ')})</span>}
              <SeatActions view={view} memberId={memberId} send={send} />
            </li>
          );
        })}
      </ol>
      <div className="row">
        <button onClick={onLeave}>{tControls.leave}</button>
      </div>
    </div>
  );
}
