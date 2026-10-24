import { MAX_SEATS } from '@take5/engine';
import {
  PICK_TIMER_OPTIONS,
  type ClientIntent,
  type PickTimer,
  type RoomView,
} from '@take5/protocol';
import { tControls } from './strings';

/** The Host's Lobby settings beyond the End Score: the Pick Timer and seating Bots. */
export function HostControls({
  view,
  send,
}: {
  view: RoomView;
  send: (intent: ClientIntent) => void;
}) {
  return (
    <>
      <label className="row">
        {tControls.pickTimer}
        <select
          value={view.settings.pickTimer}
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
      <button
        className="add-bot"
        disabled={view.seats.length >= MAX_SEATS}
        onClick={() => send({ type: 'addBot' })}
      >
        🤖 {tControls.addBot}
      </button>
    </>
  );
}
