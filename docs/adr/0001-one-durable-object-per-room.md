# One Durable Object per Room, no database

Each Room is a single Cloudflare Durable Object, addressed by its Room Code. It is the only authority for that Room's state, holds every player's WebSocket (using the Hibernation API so idle Rooms cost nothing), and saves state in its own SQLite-backed storage. There is no D1, KV or external database. A Room is a small group sharing live state for a few hours, which is what a Durable Object is for: one single-threaded place to serialise Picks without locks, storage that survives restarts and redeploys, alarms for timers and expiry, and all of it on the free plan.

## Considered Options

- **Worker + D1/KV with polling or a separate pub/sub**: needs its own locking and fan-out, adds latency, and spends free-plan quota on every Turn.
- **External realtime service (e.g. a hosted WebSocket provider)**: another vendor and account for something Durable Objects already do.

## Consequences

- Nothing outlives a Room. Adding cross-Room data (accounts, history, stats) later means introducing D1 alongside, not instead of, the Room objects.
