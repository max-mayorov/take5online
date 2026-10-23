import { MAX_SEATS } from '@take5/engine';
import {
  PICK_TIMER_OPTIONS,
  type ClientIntent,
  type PickTimer,
  type RoomView,
} from '@take5/protocol';
import { tControls } from './strings';

/** Lobby settings beyond the End Score: the Pick Timer and seating Bots. */
export function HostControls({
  view,
  send,
}: {
  view: RoomView;
  send: (intent: ClientIntent) => void;
}) {
  const { pickTimer } = view.settings;
  if (view.hostId !== view.you)
    return <p className="muted">{tControls.pickTimerNote(pickTimer)}</p>;
  return (
    <div className="row wrap">
      <label className="row">
        {tControls.pickTimer}
        <select
          value={pickTimer}
          onChange={(e) =>
            send({ type: 'settings', pickTimer: Number(e.target.value) as PickTimer })
          }
        >
          {PICK_TIMER_OPTIONS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {tControls.pickTimerOption(seconds)}
            </option>
          ))}
        </select>
      </label>
      <button disabled={view.seats.length >= MAX_SEATS} onClick={() => send({ type: 'addBot' })}>
        {tControls.addBot}
      </button>
    </div>
  );
}
