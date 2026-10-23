# Server decides everything; clients get full redacted snapshots, not diffs

The Room Durable Object shuffles, deals, validates and resolves everything. Clients only send intents (e.g. "I Pick card 47"). After every change the server sends each connection a full snapshot of what _that connection_ may see (its own Hand only; other Seats show only that they have Picked), plus an ordered event list for animation. 6 nimmt! depends on hidden Hands, so the server must never send another Seat's Cards. Full snapshots are tiny here (at most 104 Cards), and they rule out a whole class of out-of-sync bugs that diffs or patches bring, so a reconnecting or out-of-date client is fixed by its next message.

## Considered Options

- **Diffs/patches**: smaller messages, but needs sequence numbers and resync logic for no real gain at this size.
- **Lockstep, where clients run the engine and the server just relays**: would mean every client knows every Hand, so cheating is trivial.
