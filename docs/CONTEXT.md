# take5online

A private website where friends play live games of 6 nimmt! (aka Take 5) together in shared rooms.

## Language

### Rooms and people

**Room**:
A shared space, addressed by a Room Code, in which a group plays one Game after another.
_Avoid_: Lobby (that is a phase), table, match, server

**Room Code**:
The four-letter identifier people share to join a Room.
_Avoid_: Room ID, PIN, invite code

**Seat**:
One of the up to 10 places at a Room's table that a Player or a Bot occupies.
_Avoid_: Slot, position

**Player**:
A person occupying a Seat.
_Avoid_: User, account, member

**Bot**:
The computer occupant of a Seat, seated deliberately or given the Seat of a Player who left; it also acts for an Away or slow Player.
_Avoid_: AI, CPU, computer player

**Spectator**:
A person in a Room who watches without occupying a Seat.
_Avoid_: Observer, viewer, guest

**Host**:
The Player who controls the Room's settings, starts Games, and may kick or replace others.
_Avoid_: Admin, owner, creator

**Away**:
The state of a Player whose connection is gone but whose Seat is still held for them.
_Avoid_: Offline, disconnected, AFK

**Nickname**:
The name a person picks for themselves on entering a Room, unique within that Room.
_Avoid_: Username, display name, handle

### Room phases

**Lobby**:
The Room phase in which people gather in Seats and the Host configures and starts a Game.
_Avoid_: Waiting room, setup

**Results**:
The Room phase after a Game ends, showing the outcome and Session Totals, from which the Host can start a Rematch.
_Avoid_: Game over screen, summary

**Rematch**:
A new Game in the same Room with the same Seats.
_Avoid_: Replay, restart, new room

**Session Totals**:
Each Seat's accumulated Scores and wins across every Game played in a Room.
_Avoid_: Leaderboard, stats, history

### The game

**Game**:
A sequence of Rounds that ends once any Seat's Score reaches the End Score.
_Avoid_: Match, session

**End Score**:
The Score threshold, set by the Host (default 66), that ends a Game.
_Avoid_: Point limit, target, max score

**Round**:
One deal of ten Cards to every Seat, played out over ten Turns.
_Avoid_: Hand (that is the cards held), deal

**Turn**:
One cycle in which every Seat Picks a Card, then all Picks are Revealed and Placed.
_Avoid_: Trick, move, step

**Card**:
One of the 104 numbered cards (1–104), each worth a fixed number of Bull-heads.
_Avoid_: Tile

**Bull-heads**:
The penalty value printed on a Card, from 1 to 7.
_Avoid_: Points (ambiguous), cows, oxen, penalty points

**Hand**:
The Cards a Seat currently holds and has not yet played.
_Avoid_: Deck

**Board**:
The four Rows in the middle of the table.
_Avoid_: Table, field

**Row**:
An ordered line of one to five Cards on the Board, rising from left to right.
_Avoid_: Stack, pile, line, column

**Pick**:
A Seat's secret choice of one Card from its Hand during a Turn; it can be changed until the Reveal.
_Avoid_: Play, selection, move

**Reveal**:
The moment all Picks of a Turn are shown at once and Placed in ascending order.
_Avoid_: Flip, show

**Placement**:
Putting a Revealed Card at the end of the Row whose last Card is the highest one below it.
_Avoid_: Play, laying

**Take**:
Collecting every Card of a Row into one's Penalty Pile, leaving the Taking Card as the start of that Row.
_Avoid_: Capture, eat, grab, swallow

**Sixth Card**:
A Card whose Placement would make a Row six long, forcing its Seat to Take that Row.
_Avoid_: Overflow card

**Low Card**:
A Card lower than the last Card of every Row, which forces its Seat to choose a Row to Take.
_Avoid_: Undercut card, too-low card

**Penalty Pile**:
The Cards a Seat has Taken during the current Round.
_Avoid_: Bull pile, discard

**Score**:
The total Bull-heads a Seat has Taken so far in a Game; the lowest Score wins.
_Avoid_: Points, penalty

### Timing

**Pick Timer**:
The per-Room time limit on making a Pick or a Low Card Row choice: off, 30s, or 60s (default).
_Avoid_: Turn timer, clock, countdown

**Grace Period**:
The 60 seconds an Away Player is waited for, when the Pick Timer is off, before a Bot acts for them.
_Avoid_: Timeout, reconnect window

## Relationships

- A **Room** has 2–10 **Seats** and up to 20 **Spectators**; it hosts one **Game** at a time.
- A **Seat** is occupied by exactly one **Player** or **Bot**; a **Player** who goes **Away** keeps their **Seat**, and a **Bot** acts for them until they return.
- A **Game** contains **Rounds**; a **Round** contains ten **Turns**; a **Turn** produces one **Pick** per **Seat**.
- A **Sixth Card** or a **Low Card** causes a **Take**; a **Take** adds to a **Seat's** **Penalty Pile**, whose **Bull-heads** add to its **Score**.

## Example dialogue

> **Dev:** "Max's **Pick** was a **Low Card**, so does the **Reveal** stop?"
> **Domain expert:** "Yes, **Placement** pauses until Max chooses which **Row** to **Take**, or until the **Pick Timer** runs out and the cheapest **Row** is **Taken** for them. The remaining **Picks** are then **Placed** in order."

## Flagged ambiguities

- "Hand" is commonly used for both the cards held and a single deal. Resolved: a **Hand** is the cards held; a deal is a **Round**.
- "Points" could mean **Bull-heads** on one card or a **Score**. Resolved: never say "points"; use **Bull-heads** for a Card's value and **Score** for a Seat's total.
