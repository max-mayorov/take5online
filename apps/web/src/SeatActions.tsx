import type { ClientIntent, RoomView } from '@take5/protocol';
import { useEffect, useRef, useState } from 'react';
import { tControls } from './strings';

type Send = (intent: ClientIntent) => void;

/**
 * What the viewer may do about one member: take over a Bot's Seat, and the Host's
 * kick / let-a-bot-play / remove-Bot behind a small menu.
 */
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
  const seat = view.seats.indexOf(memberId);
  const canTake = member.bot && seat !== -1 && !view.seats.includes(view.you);

  const hostItems: { label: string; intent: ClientIntent }[] = [];
  if (view.hostId === view.you) {
    if (member.bot) {
      if (view.phase !== 'game') {
        hostItems.push({ label: tControls.removeBot, intent: { type: 'removeBot', memberId } });
      }
    } else {
      if (seat !== -1 && !member.connected) {
        hostItems.push({
          label: tControls.replaceWithBot,
          intent: { type: 'replaceWithBot', memberId },
        });
      }
      hostItems.push({ label: tControls.kick, intent: { type: 'kick', memberId } });
    }
  }

  if (!canTake && hostItems.length === 0) return null;
  return (
    <span className="seat-actions">
      {canTake && (
        <button
          className="small-button"
          aria-label={tControls.takeSeatOf(member.nickname)}
          onClick={() => send({ type: 'takeSeat', seat })}
        >
          {tControls.takeSeat}
        </button>
      )}
      {hostItems.length > 0 && <SeatMenu name={member.nickname} items={hostItems} send={send} />}
    </span>
  );
}

function SeatMenu({
  name,
  items,
  send,
}: {
  name: string;
  items: { label: string; intent: ClientIntent }[];
  send: Send;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    addEventListener('pointerdown', close);
    return () => removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <span className="seat-menu-anchor" ref={ref}>
      <button
        className="seat-menu-button"
        aria-label={tControls.optionsFor(name)}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⋮
      </button>
      {open && (
        <span className="seat-menu" role="menu">
          {items.map(({ label, intent }) => (
            <button
              key={label}
              role="menuitem"
              className={intent.type === 'kick' ? 'danger' : ''}
              onClick={() => {
                send(intent);
                setOpen(false);
              }}
            >
              {label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
