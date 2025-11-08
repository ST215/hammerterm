# OpenFront Helper v1.0

A tick-synchronized game helper for [OpenFront.io](https://openfront.io) that provides real-time stats and extensible features without DOM scraping.

## Features

- **Real-Time Stats HUD**: Live display of tiles, troops, gold, and resource caps
- **Tick-Synchronized**: Updates precisely with game server ticks (10/second)
- **Modular Plugin System**: Easy to extend with custom features
- **Non-Intrusive**: Minimal overlay, doesn't interfere with game
- **Zero Timers**: All logic driven by game's internal tick system

## Quick Start

### Installation

1. **Copy the script**: Open [of-helper.v1.js](of-helper.v1.js)
2. **Open OpenFront.io** in your browser
3. **Open browser console** (F12 or Ctrl+Shift+J)
4. **Paste the entire script** and press Enter
5. **Done!** You should see initialization messages and a HUD appear in the top-right

### What You'll See

A small overlay panel showing:
```
T:1234 | Tiles:42 | Troops:123.4K/456.7K | Gold:78.9K/234.5K
```

- `T:` - Current game tick
- `Tiles:` - Territory count
- `Troops:` - Current troops / Max capacity
- `Gold:` - Current gold / Max capacity

## Usage

### Basic API

```javascript
// Get current game state
const state = OFHelper.getState();
console.log('My tiles:', state.my.tiles);
console.log('My gold:', state.my.gold);

// Listen to game ticks
OFHelper.on('turn:tick', ({ tick, state }) => {
  console.log('Tick', tick, '- Troops:', state.my.troops);
});

// Stop the helper
OFHelper.stop();

// Restart
OFHelper.start();
```

### Create Custom Features

```javascript
// Register a custom feature
OFHelper.featureRegistry.registerFeature('AllyMonitor', (api) => {
  const PANEL_ID = 'allies';

  function init() {
    // Create UI panel
    api.UI.createPanel(PANEL_ID);

    // Listen to ticks
    api.on('turn:tick', ({ state }) => {
      const allies = api.selectors.getAllies(state);
      const allyNames = allies.map(a => a.name).join(', ');
      api.UI.setPanelText(PANEL_ID, `Allies: ${allyNames || 'None'}`);
    });
  }

  function destroy() {
    api.UI.removePanel(PANEL_ID);
  }

  return { init, destroy };
});

// Unregister a feature
OFHelper.featureRegistry.unregisterFeature('AllyMonitor');
```

## Project Structure

```
openfront-helper/
├── of-helper.v1.js          # Production bundle (paste this in console)
├── src/                     # Source modules
│   ├── core/                # Core systems
│   │   ├── EventBus.js
│   │   ├── Store.js
│   │   ├── Wiretap.js
│   │   └── TurnClock.js
│   ├── api/                 # Public APIs
│   │   ├── Selectors.js
│   │   ├── UI.js
│   │   └── Actions.js
│   ├── features/            # Feature system
│   │   ├── FeatureRegistry.js
│   │   └── SummaryHUD.js
│   └── main.js              # Bootstrap
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md      # System design
│   ├── API.md               # API reference
│   └── GAME_TYPES.md        # OpenFront data structures
└── examples/                # Usage examples
    └── usage.html
```

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** - System design and data flow
- **[API Reference](docs/API.md)** - Complete API documentation
- **[Game Types](docs/GAME_TYPES.md)** - OpenFront data structure reference

## How It Works

1. **Wiretap** intercepts WebSocket/SharedWorker messages
2. **TurnClock** synchronizes with game's 100ms tick cycle
3. **Store** maintains current game state
4. **Features** react to tick events and update UI
5. **Zero DOM scraping** - all data from game update messages

## Architecture Highlights

### Tick-Based Design
Instead of polling the DOM or using timers, the helper hooks into the game's internal tick system:

```
Server (100ms ticks) → WebSocket → Wiretap → TurnClock → Features
```

### Event-Driven
All modules communicate via events:
- `wire:gameUpdate` - Raw update from server
- `state:updated` - Store updated
- `turn:tick` - New tick with current state

### Plugin System
Features receive a clean API:

```javascript
{
  on,         // Subscribe to events
  emit,       // Emit events
  getState,   // Get current state
  UI,         // HUD management
  Actions,    // Game interactions (future)
  selectors   // Helper functions
}
```

## Built-in Features

### SummaryHUD (Default)
Real-time stats overlay showing:
- Current tick
- Territory count
- Troops (current / max)
- Gold (current / max)

More features coming in future versions!

## Example Features

### Troop Cap Warning

```javascript
OFHelper.featureRegistry.registerFeature('TroopWarning', (api) => {
  function init() {
    api.on('turn:tick', ({ state }) => {
      const ratio = state.my.troops / state.my.troopCap;
      if (ratio > 0.95) {
        console.warn('Troops at 95% capacity!');
      }
    });
  }
  return { init };
});
```

### Leaderboard Display

```javascript
OFHelper.featureRegistry.registerFeature('Leaderboard', (api) => {
  const PANEL_ID = 'leaderboard';

  function init() {
    api.UI.createPanel(PANEL_ID);

    api.on('turn:tick', ({ state }) => {
      const top5 = api.selectors.getLeaderboard(state).slice(0, 5);
      const html = top5.map((p, i) =>
        `${i+1}. ${p.name}: ${p.tiles} tiles`
      ).join('<br>');

      api.UI.setPanelHTML(PANEL_ID, `<b>Top 5</b><br>${html}`);
    });
  }

  function destroy() {
    api.UI.removePanel(PANEL_ID);
  }

  return { init, destroy };
});
```

## Development

### Source Structure

The `src/` directory contains modular ES6 code for development:

- **core/** - Core systems (EventBus, Store, Wiretap, TurnClock)
- **api/** - Public APIs (Selectors, UI, Actions)
- **features/** - Feature system and built-in features

### Building

To create the bundled `of-helper.v1.js`, manually combine all modules into an IIFE. The current bundle includes all modules inline without imports/exports.

## Compatibility

- **Browser**: Modern browsers with ES6 support
- **Game**: OpenFront.io (as of 2025-01)
- **Based on**: [OpenFrontIO](https://github.com/openfrontio/OpenFrontIO) game structure

## Limitations

- **Actions API**: Not yet implemented (v1.0 is read-only)
- **Binary messages**: Skips ArrayBuffer/Blob messages currently
- **Gold cap formula**: Uses simplified calculation (may not match exact game logic)

## Roadmap

**v1.1**:
- Implement Actions API (send troops, gold, etc.)
- Binary message parsing
- More built-in features (alliance tracker, attack monitor)

**v2.0**:
- Settings panel
- Persistent configuration
- User-friendly feature toggle UI

## License & Attribution

This helper is based on the structure of [OpenFrontIO](https://github.com/openfrontio/OpenFrontIO), which is licensed under AGPLv3 with attribution requirements.

**This helper**:
- Uses structure knowledge from the open-source game
- Does not copy AGPL-licensed code wholesale
- Implements its own logic based on observed patterns

If distributing publicly, include attribution:
```
Based on OpenFront.io architecture
Game: https://github.com/openfrontio/OpenFrontIO
Licensed under AGPLv3
```

## FAQ

### Q: Is this allowed?
A: This helper only observes game state via WebSocket interception. It doesn't modify game logic or provide unfair advantages - just displays information already available to the client.

### Q: Will this get me banned?
A: The helper is read-only and doesn't automate gameplay. However, use at your own risk and check the game's terms of service.

### Q: Can I add automation?
A: The Actions API (not yet implemented) will provide hooks for automation. However, be mindful of fair play and game rules.

### Q: How do I update?
A: Simply paste the new version into console. The helper is idempotent - running it multiple times won't break anything.

### Q: The HUD isn't showing
A: Make sure you're on the game page (not lobby) and a game is running. Check console for errors.

## Support

- **Issues**: Report bugs in your implementation
- **Features**: Suggest features by extending the plugin system
- **Documentation**: See [docs/](docs/) for detailed guides

## Contributing

This is a personal helper script. Feel free to:
- Fork and modify for your own use
- Share improvements
- Create your own features using the plugin API

## Acknowledgments

- **OpenFront.io** - For the excellent open-source RTS game
- **Mars Chrome Extension** - For parsing pattern examples
- **Community** - For testing and feedback
