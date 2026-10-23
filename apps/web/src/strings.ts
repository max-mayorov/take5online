/** Every piece of UI text lives here, so translating later is a matter of adding a copy. */
export const t = {
  appName: 'take5online',
  tagline: 'Play 6 nimmt! live with friends.',
  createRoom: 'Create a room',
  creating: 'Creating…',
  joinRoom: 'Join',
  roomCodePlaceholder: 'Room code',
  invalidCode: 'Room codes are 4 letters.',
  createFailed: 'Could not create a room. Try again in a minute.',

  room: (code: string) => `Room ${code}`,
  copyLink: 'Copy link',
  copied: 'Copied!',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  roomNotFound: 'This room does not exist or has expired.',
  backHome: 'Back to start',
  reload: 'A new version is available.',
  reloadButton: 'Reload',

  nicknamePrompt: 'Pick a nickname',
  nicknamePlaceholder: 'Nickname',
  enterRoom: 'Enter room',

  lobby: 'Lobby',
  players: (n: number) => `Players (${n}/10)`,
  spectators: 'Watching',
  host: 'host',
  you: 'you',
  away: 'away',
  sit: 'Take a seat',
  stand: 'Watch instead',
  leave: 'Leave room',
  endScore: 'Game ends at',
  start: 'Start game',
  rematch: 'Play again',
  needPlayers: 'Waiting for at least 2 players.',
  waitingForHost: 'Waiting for the host to start.',

  round: (round: number, turn: number) => `Round ${round} · Turn ${turn}/10`,
  rowLabel: (row: number) => `Row ${row + 1}`,
  bullHeads: (n: number) => `${n}🐮`,
  yourHand: 'Your hand',
  pickPrompt: 'Pick a card. You can change it until everyone has picked.',
  picked: 'Picked — waiting for the others. Tap another card to change.',
  chooseRowPrompt: (card: number) => `Your ${card} is lower than every row. Tap a row to take.`,
  othersChoosing: (name: string) => `${name} is choosing a row to take…`,
  spectating: 'You are watching this game.',
  pickedMark: '✓',

  results: 'Game over',
  winners: (names: string[]) =>
    names.length === 1 ? `${names[0]} wins!` : `${names.join(' & ')} share the win!`,
  finalScores: 'Final scores',
  sessionTotals: 'Tonight so far',
  totalsHeader: { name: 'Player', games: 'Games', wins: 'Wins', bullHeads: 'Bull-heads' },

  log: {
    revealed: 'Cards revealed.',
    took: (name: string, row: number, bullHeads: number) =>
      `${name} took row ${row + 1} for ${bullHeads}🐮`,
    roundEnded: (round: number) => `Round ${round} is over.`,
    roundStarted: (round: number) => `Round ${round} dealt.`,
  },

  errors: {
    bad_message: 'Something went wrong. Try again.',
    room_not_found: 'This room does not exist or has expired.',
    nickname_required: 'Pick a nickname first.',
    nickname_taken: 'That nickname is taken in this room.',
    room_full: 'The room is full.',
    not_host: 'Only the host can do that.',
    wrong_phase: 'You can’t do that right now.',
    need_players: 'You need at least 2 players.',
    not_seated: 'You are not playing in this game.',
    game_in_progress: 'Not while a game is running.',
    invalid_seat: 'Something went wrong. Try again.',
    card_not_in_hand: 'That card is not in your hand.',
    not_your_choice: 'Someone else is choosing.',
    invalid_row: 'Pick one of the four rows.',
    // Bots and Host controls
    unknown_member: 'That person is no longer in the room.',
    not_a_bot: 'Only a bot’s seat can be taken over.',
    not_away: 'They are still here.',
    invalid_target: 'You can’t do that to them.',
    kicked: 'The host removed you from this room.',
  },
} as const;

// ---------------------------------------------------------------------------
// Bots, the Pick Timer and Host controls

export const tControls = {
  pickTimer: 'Pick timer',
  pickTimerOption: (seconds: number) => (seconds === 0 ? 'Off' : `${seconds} seconds`),
  pickTimerNote: (seconds: number) =>
    seconds === 0 ? 'No pick timer.' : `${seconds} seconds per pick.`,
  addBot: 'Add a bot',
  removeBot: 'Remove',
  kick: 'Kick',
  replaceWithBot: 'Let a bot play',
  takeSeat: 'Take this seat',
  bot: 'bot',
  seats: 'Seats',
  leave: 'Leave room',
  countdown: (seconds: number) => `⏱ ${seconds}s`,
  kicked: 'The host removed you from this room.',
} as const;
