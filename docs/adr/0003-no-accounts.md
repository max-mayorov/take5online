# No accounts; identity is a per-Room seat token

There are no accounts or login. A person enters a Nickname when joining a Room, and the server issues a random seat token that the browser keeps in `localStorage` for that Room Code. Showing the token again reclaims the same Seat. Asking friends to sign up is friction a private party game doesn't need. The cost: identity doesn't carry over between Rooms or devices, and clearing browser storage makes you a new person. Optional login (for history and stats) can be added on top later without changing how Seats work.
