# Project Rules

## OpenFront Game Context
- **Singleplayer team mode** behaves exactly like multiplayer team mode - it's used for testing because it's faster to start
- In singleplayer/team mode: `game-view` element is `null`, but `events-display.game` contains all game data
- Key paths in singleplayer mode:
  - `events-display.game._myClientID` - the client ID
  - `events-display.game._players` - player data (Map)
  - `events-display.game._myPlayer` - our player object
  - `events-display.game.worker` - the Worker
  - `events-display.eventBus` - the EventBus for emitting events
- In multiplayer mode: `game-view.clientGameRunner` contains the game data

## Hammer UI Rules
- Never use nested scroll views (e.g. a scrollable div inside the main scrollable panel body). All content sections should flow naturally within the single top-level scrollable body (`#hm-body`). Use collapsible blocks instead of inner scroll containers to manage large lists.
