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
  roomCode: 'Room code',
  shareHint: 'Share the link or the code with your friends.',
  homeHow: 'Create a room, send your friends the link, and play on your phones at the table.',
  or: 'or',
  copyLink: 'Copy link',
  copied: 'Copied!',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  cantConnect: (host: string) =>
    `Can’t reach the game server. A browser extension such as an ad blocker may be blocking it: try allowing ${host}, or use another browser.`,
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
  takeRowLabel: (row: number, bullHeads: number) => `Take row ${row + 1} (${bullHeads} Bull-heads)`,
  bullHeads: (n: number) => `${n}🐮`,
  cardLabel: (card: number, bullHeads: number) =>
    `${card}, ${bullHeads} Bull-head${bullHeads === 1 ? '' : 's'}`,
  hiddenCard: 'Hidden card',
  yourHand: 'Your hand',
  seats: 'Players',
  scoreLabel: (name: string, score: number, pile: number) =>
    `${name}: score ${score}, ${pile} card${pile === 1 ? '' : 's'} taken this round`,
  hasPicked: 'picked',
  thinking: 'picking…',
  choosing: 'choosing',
  revealing: 'Revealing…',
  roundOver: (round: number) => `Round ${round} is over`,
  revealedPicks: 'Revealed cards',
  mute: 'Mute sounds',
  unmute: 'Turn sounds on',
  react: 'React',
  reactWith: (emoji: string) => `React with ${emoji}`,
  reacted: (name: string, emoji: string) => `${name} reacted ${emoji}`,
  pickPrompt: 'Pick a card. You can change it until everyone has picked.',
  picked: 'Picked — waiting for the others. Tap another card to change.',
  chooseRowPrompt: (card: number) => `Your ${card} is lower than every row. Tap a row to take.`,
  othersChoosing: (name: string) => `${name} is choosing a row to take…`,
  spectating: 'You are watching this game.',
  pickedMark: '✓',

  results: 'Game over',
  scoreHeader: { place: '#', name: 'Player', score: 'Score' },
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
  removeBot: 'Remove bot',
  kick: 'Kick',
  replaceWithBot: 'Let a bot play',
  takeSeat: 'Take seat',
  takeSeatOf: (name: string) => `Take over ${name}’s seat`,
  optionsFor: (name: string) => `Options for ${name}`,
  bot: 'bot',
  countdownLabel: (seconds: number) => `${seconds} seconds left to pick`,
  kicked: 'The host removed you from this room.',
} as const;

// ---------------------------------------------------------------------------
// Privacy notice (GDPR Articles 13 and 14). Keep it in step with what the code does.

export const tPrivacy = {
  link: 'Privacy',
  title: 'Privacy',
  updated: 'Last updated 23 October 2026',
  intro:
    'take5online is a free hobby site for playing 6 nimmt! with friends. It has no accounts, no ads and no cookies. This page explains what data it handles, why, for how long, and your rights under the GDPR.',
  controllerHeading: 'Who is responsible',
  controller: 'Max Mayorov runs this site and is responsible for your data. Contact:',
  contactEmail: 'max.mayorov@live.com',
  sections: [
    {
      heading: 'Playing a game',
      body: [
        'When you join a room the site keeps the nickname you choose, a random seat token, your moves and scores, and the room’s settings. Reactions are not stored. Everyone in the room sees your nickname.',
        'This is needed to run the game you asked to join (GDPR Art. 6(1)(b)). It is kept on Cloudflare’s servers, and the whole room, nicknames included, is deleted 24 hours after its last activity.',
      ],
    },
    {
      heading: 'On your device',
      body: [
        'The site sets no cookies. Your browser keeps the seat token for each room you join (so a reload puts you back in your seat), whether you muted the sound, and, if you turn statistics off below, that choice. These are strictly necessary for things you asked for, so they need no consent. Clearing this site’s data in your browser removes them.',
      ],
    },
    {
      heading: 'Hosting and server logs',
      body: [
        'Cloudflare hosts the site, so your IP address and browser details are processed to deliver it. Request logs, which can include your IP address, are kept for 3 days to find and fix problems, and creating rooms is rate-limited per IP address to prevent abuse. This is based on the legitimate interest in running a working, secure site (GDPR Art. 6(1)(f)).',
      ],
    },
    {
      heading: 'Anonymous statistics and error reports',
      body: [
        'To find bugs and see how the game is used, the site sends PostHog which pages are visited, which buttons are clicked (not their text), error details, and game events such as “game started” or “connection lost” with the room code and a random player id, plus your browser and device type. Your nickname is never sent.',
        'PostHog runs in cookieless mode: nothing is stored on your device. To count visitors, PostHog turns your IP address and browser details, mixed with a random value that changes every day, into a one-way code, and does not keep the IP address. The data is stored in PostHog’s EU region in Frankfurt, Germany, and deleted after at most one year.',
        'This is based on the legitimate interest in keeping the game working (GDPR Art. 6(1)(f)). You can object at any time with the switch below. It is also off if your browser sends Global Privacy Control or Do Not Track.',
      ],
    },
    {
      heading: 'Who else receives data',
      body: [
        'Cloudflare, Inc. (hosting) and PostHog, Inc. (statistics) process data on the site’s behalf under data processing agreements. Both are US companies; Cloudflare may process data outside the EU, which is covered by the EU–US Data Privacy Framework and standard contractual clauses. Data is never sold or used for advertising.',
      ],
    },
  ],
  rightsHeading: 'Your rights',
  rights:
    'You can ask to see, correct or delete your data, to restrict its use, to receive a copy, or object to its use. Because there are no accounts, please mention the room code and roughly when you played. Most data deletes itself quickly: rooms after 24 hours, logs after 3 days. You can also complain to a data protection authority, for example the one where you live. Write to:',
  statsHeading: 'Statistics on this device',
  statsOn: 'Send anonymous statistics and error reports',
  statsBrowserOff:
    'Off: your browser asks sites not to track you (Global Privacy Control or Do Not Track).',
  statsNotLiveOff: 'Off on development servers and previews.',
} as const;
