# take5online — Design

The agreed design for take5online, a private site for playing 6 nimmt! live with friends at
**https://take5.mayorov.dev**. Vocabulary follows [CONTEXT.md](./CONTEXT.md); the reasoning
behind the bigger decisions lives in [adr/](./adr/).

## Goals and non-goals

**Goals**

- Friends open a link, type a Nickname, and are playing within seconds.
- Plays well on a phone held at the table; works on desktop.
- Runs on Cloudflare's free plan with nothing to administer.

**Non-goals (for now)**

- Async / play-by-notification games ([ADR-0002](./adr/0002-live-play-only.md)).
- Accounts, login, persistent stats or game history ([ADR-0003](./adr/0003-no-accounts.md)).
- Rule variants (Professional, Tactical, …) — the engine leaves room for them.
- Translations — English only, but all UI strings live in one file.
- Text chat — emoji reactions only.
- Public launch, Amigo branding or artwork ([ADR-0008](./adr/0008-original-artwork.md)).

## Rules (standard 6 nimmt!)

- 104 Cards numbered 1–104. Bull-heads per Card:
  - 55 → 7
  - other multiples of 11 → 5
  - multiples of 10 → 3
  - other multiples of 5 → 2
  - everything else → 1
- 2–10 Seats. Each Round: shuffle, deal 10 Cards to every Seat, start the four Rows with one Card each.
- Each Turn every Seat Picks one Card in secret, and may change it until the last Seat has Picked, which triggers the Reveal. All Picks are Revealed together and Placed in ascending order:
  - A Card goes at the end of the Row whose last Card is the highest one below it.
  - If it would be the Sixth Card there, the Seat Takes the five Cards and the played Card starts the Row.
  - If it is a Low Card, the Seat chooses any Row to Take, and the Card starts that Row. Placement pauses while they choose.
- After ten Turns the Round ends; Taken Bull-heads are added to Scores. If any Score ≥ the End Score
  (Host-configurable, default 66), the Game ends and the lowest Score wins (ties share the win).
  Otherwise a new Round is dealt.

## Architecture

```
 browser (React app)  ──HTTPS──▶  Worker  ──▶  static assets (built React app)
        │                            │
        └──── WebSocket /ws/:code ───┴──▶  Room Durable Object (one per Room Code)
                                              ├─ engine (pure rules)
                                              └─ SQLite storage (room + game state)
```

- **Worker** (`apps/worker`): serves the built SPA via Workers Static Assets, handles
  `POST /api/rooms` (create a Room, rate-limited per IP) and routes `GET /ws/:code` WebSocket upgrades
  to the Room's Durable Object (`idFromName(code)`).
- **Room Durable Object**: the single authority for one Room. It holds the Lobby/Game/Results state,
  runs the engine, persists state in its SQLite-backed storage after every change, uses the WebSocket
  Hibernation API so idle Rooms cost nothing, and uses alarms for the Pick Timer, the Grace Period and expiry.
  See [ADR-0001](./adr/0001-one-durable-object-per-room.md).
- **No database.** Nothing outlives a Room.
- **Analytics** (PostHog, EU cloud, cookieless): the app sends pageviews, autocaptured clicks,
  exceptions and a few game/connection events (`room_joined`, `game_started`, `ws_closed`, `server_error`…),
  tagged with the Room Code and Member id, never the Nickname (autocapture masks element text and
  attributes, which show Nicknames). They go through the Worker at `/relay/*` so ad
  blockers don't drop them. Nothing is stored in the browser for analytics, so there is no consent
  banner; the only browser storage is the seat token, the mute choice and an analytics opt-out, all
  strictly necessary. Off anywhere but take5.mayorov.dev (dev servers, PR previews), with Global
  Privacy Control or Do Not Track, or after opting out on the privacy page. See [ADR-0009](./adr/0009-posthog-analytics.md).
- **Privacy notice** at `/privacy` (GDPR Art. 13), linked from the home page and the Nickname form. It
  names the controller, what each part of the site keeps and for how long, and holds the analytics
  opt-out switch. Update it whenever what the site collects changes.
- Free plan only; custom domain `take5.mayorov.dev` (zone already on Cloudflare) configured as a Worker custom domain.

### Repository layout (TypeScript monorepo, pnpm workspaces)

| Path                | Contents                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/engine`   | Pure rules engine: `(state, action) → { state, events }`, seeded RNG, Bot. No Cloudflare or React imports. |
| `packages/protocol` | Zod schemas for every client↔server message, the protocol version, shared types.                           |
| `apps/worker`       | Worker entry + Room Durable Object, `wrangler.jsonc`.                                                      |
| `apps/web`          | React + Vite SPA.                                                                                          |
| `e2e`               | Playwright tests.                                                                                          |

See [ADR-0004](./adr/0004-pure-shared-engine.md).

## Server authority and protocol

- The server shuffles, deals, validates and resolves everything. Clients only send _intents_
  (`pick {card}`, `chooseRow {row}`, `react {emoji}`, `takeSeat {seat}`, and the Host's
  `settings {endScore?, pickTimer?}`, `addBot`, `removeBot {memberId}`, `kick {memberId}`,
  `replaceWithBot {memberId}`). See
  [ADR-0005](./adr/0005-authoritative-redacted-snapshots.md).
- After every change the server sends each connection a **full snapshot redacted to what that
  connection may see** (own Hand only; other Seats show "has picked" but not what), plus an ordered
  **event list** for the client to animate (e.g. `placed {card, row}`, `took {seat, row, bullHeads}`).
  The snapshot carries the Pick Timer `deadline` (epoch ms, or null) and the server's `now`, so
  clients can show a countdown that is right even when their clock is off.
- All messages are JSON validated by Zod on both ends (`zod/mini`, which keeps the web bundle small).
  Every message carries the protocol version; on mismatch the server tells the client to reload
  (covers tabs left open across a deploy).
- The client reconnects with exponential backoff. If 3 connections in a row fail before even opening,
  it tells the person that something (usually an ad blocker) is blocking the site, and keeps retrying.
- The engine's RNG is seeded per Round; the seed is stored so any Game can be replayed in tests.
- **Reactions** are the one message that is not a snapshot: a member sends `react {emoji}` with an emoji
  from a fixed set (`REACTIONS` in the protocol: 👍 😂 😱 🐮 🎉 😭), and the Room relays
  `reaction {memberId, emoji}` to every identified connection, Spectators included. Reactions are never
  stored. The Room keeps a per-member rate limit in memory (5 per 10 s); extras are dropped silently, and
  the limit resets if the Durable Object hibernates, which is fine for its purpose.

## Identity and joining

- No accounts. Entering a Room asks for a Nickname (1–16 chars, unique within the Room, case-insensitive).
- The server issues a random **seat token**, stored in `localStorage` per Room Code. Reconnecting with it
  reclaims the same Seat (or Spectator place). Clearing storage means joining as someone new.
- Room Codes are 4 letters from an alphabet without I and O (24⁴ ≈ 330k codes). Creation retries on
  collision. An expired or unknown code shows "Room not found".
- Join via `https://take5.mayorov.dev/ABCD` or by typing the code on the home page.

## Room lifecycle

1. **Lobby**: the creator is Host. People take Seats (max 10) or spectate (max 20). Host sets
   End Score and Pick Timer, may add Bots, kick people, then presses Start (needs ≥ 2 Seats).
2. **Game**: Rounds and Turns as per the rules. People arriving mid-Game become Spectators, or may take over a Bot's Seat.
3. **Results**: final Scores, winner(s), and **Session Totals** across all Games in this Room. Host can start a **Rematch**.

- If the Host leaves the Room or stays Away past the Grace Period, Host passes to the next
  connected Player in Seat order (wrapping around), or failing that to a connected Spectator.
  Bots are never Host. With nobody else connected, an Away Host stays Host.
- A Room is deleted (storage wiped via alarm) after **24 hours without activity**.

## Timers, disconnects and Bots

- **Pick Timer**: off / 30s / 60s, default off. It applies to Picks and to Low Card Row choices.
  When it runs out, the Bot acts for that Seat.
- **Away**: a Player whose sockets are all closed. Their Seat is held. The Bot acts for them once
  they have been Away for the **60s Grace Period**, or earlier if the Pick Timer runs out first.
  On return they reclaim the Seat and play from the current Turn.
- The Host can replace an Away Player with a Bot, or kick them.
- **Bot Seats**: a Bot is a Room member with `bot: true`, no token and no connection, named
  "Bot 1", "Bot 2", … (lowest free number; people can't take such a Nickname). The Host adds and removes
  Bots in the Lobby and Results. Mid-Game a Seat becomes a new Bot's when its Player leaves the
  Room, is kicked, or is replaced while Away (a replaced Player stays on as a Spectator; a kicked
  one is removed and their token stops working). Any Spectator may take over a Bot's Seat, in any
  phase, along with its Hand and Score; the Bot then leaves the Room. Session Totals key a Bot's
  row by its name, so "Bot 1" keeps one row across Games.
- **Who the Bot acts for, and when** (`tick` in `apps/worker/src/room.ts`, run after every change
  and on every alarm): a Bot Seat after a short "thinking" delay of 1–2 s per move; any Seat still
  waiting when the Pick Timer runs out; and an Away Player's Seat once they have been Away for the
  Grace Period (then on every decision until they return), whichever of those last two comes
  first. Moves made on a timeout or after the Grace Period are instant. The thinking delay varies by
  Seat and decision but is derived from the Game's seed, so a Game replays the same way and tests
  stay deterministic. All of these count from when the Game reached the current decision: each
  Turn's Picks are one decision, and each Low Card Row choice another. While nobody at all is
  connected the Game stands still, and the decision's clock restarts when someone returns: a table
  everyone walked away from doesn't play itself to the end.
- **Alarms**: a Durable Object has one alarm, so it is always set to the Room's next wakeup, the
  earliest of the Bot's next move for any Seat the Game waits on (thinking delay, Pick Timer
  deadline or Grace Period end, as above), the end of an Away Host's Grace Period, and expiry.
  `alarm()` expires the Room or runs `tick`, then re-arms. Everything it needs (the current
  `decision` and when it began, `awaySince` per member) lives in the
  persisted Room, so it survives eviction and hibernation. Presence is re-derived from the open
  WebSockets on every change, so a member whose sockets vanished without a close event is marked
  Away the next time anything happens.
- **Bot** (greedy, in the engine; see [ADR-0006](./adr/0006-bot-takes-over.md)):
  - Picks the Card with the lowest expected cost: the Bull-heads of the Row it would Take as a
    Sixth Card or Low Card, otherwise a small risk score based on how full the target Row is and
    the gap to its last Card.
  - When it must choose a Row, it Takes the one with the fewest Bull-heads.

## UI and UX

- Phone-first layout: Board on top (4 Rows × up to 5 Cards), Hand as a horizontally scrollable fan
  below, compact Seat strip with Score, "picked" indicator, Away badge. Desktop gets a wider layout.
- **Cards**: original SVG with a big number, a matching count of original bull icons, and colour by
  Bull-head tier (1 / 2 / 3 / 5 / 7). Tier is also readable from the icon count, so colour is never the only cue.
- **Reveal**: Picks flip together, then Cards are Placed one by one in ascending order (~600 ms each), Takes
  animated into the Penalty Pile.
  - How: the client keeps the previous snapshot and, when a `state` message carries events, turns
    (previous Game view, events) into a list of table frames with a pure function (`apps/web/src/reveal.ts`,
    unit-tested against whole engine Games so the frames always end on the next snapshot). Frames play in
    order; snapshots that arrive meanwhile queue their own frames. Once they have played, the
    table shows the live snapshot again. The Hand is always live, so Players can Pick for the next Turn
    while a Reveal is still showing; Row choices wait for the animation to finish.
  - A Low Card pause is the live snapshot itself: the waiting Cards stay in the tray, the Low Card and the
    choosing Seat are marked, and the Rows pulse for the chooser.
  - `prefers-reduced-motion` (and a hidden tab) skips the frames and plays at most one sound.
- **Emoji reactions**: a small fixed set, shown floating over the sender's Seat (or their name in the
  Lobby or the Spectator list) for 2.5 s; rate-limited.
- Light and dark theme following the system setting.
- Sound effects for Reveal and Take, on by default, mute toggle remembered in `localStorage`. All sounds
  are synthesised with the Web Audio API (no audio files): a swish for the flip, a tock per Placement and
  a low "moo" for a Take. Browsers only allow audio after a gesture, so the audio context starts on the
  first tap or key press.
- All UI text in a single strings module (English).

## Abuse limits

- Room creation rate-limited per IP.
- 10 Seats + 20 Spectators per Room; Nickname length limits; reaction rate limits.
- Host can kick. No captcha.

## Testing

- **Engine**: Vitest unit tests for every rule, plus property-based tests (fast-check). Example properties:
  Card count always 104, every Row holds 1–5 Cards, Scores never decrease, a Game always ends.
- **Worker/DO**: `@cloudflare/vitest-pool-workers` tests for joining, reconnecting, timers, redaction
  (no snapshot ever leaks another Seat's Hand).
- **E2E**: one Playwright test driving 2–3 browser contexts through a full Game.

## Deployment

- GitHub Actions: on every push and PR run typecheck, lint, unit, worker and E2E tests. On `main`,
  run `wrangler deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.
  See [ADR-0007](./adr/0007-github-actions-deploy.md).
- Custom domain `take5.mayorov.dev` declared in `wrangler.jsonc`.

## Milestones

| #   | Deliverable                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------ |
| M1  | Rules engine + full test suite.                                                                                    |
| M2  | Room Durable Object + bare-bones UI, playable end-to-end; **deployed to take5.mayorov.dev** so friends can try it. |
| M3  | Real UI: SVG Cards, Reveal animation, sound, phone layout, themes.                                                 |
| M4  | Bots, Away handling, Pick Timer, Grace Period, Host kick/replace.                                                  |
| M5  | CI polish: full E2E suite gating deploys.                                                                          |
