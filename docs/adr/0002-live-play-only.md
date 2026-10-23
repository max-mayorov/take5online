# Live play only, no async games

Games are played live: everyone is connected at once and a Game runs start to finish in one sitting. We don't support async play (Pick whenever you like, get notified when it's your move). 6 nimmt! is a fast simultaneous-pick game whose fun comes from playing together, and live-only means no notifications, no multi-day Room lifetimes, and a 24-hour idle expiry. The pure engine ([ADR-0004](./0004-pure-shared-engine.md)) doesn't assume live play, so async could be added later as a separate mode.
