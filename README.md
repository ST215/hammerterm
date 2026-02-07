# Hammer Control Panel

A real-time donation tracking and automation tool for [OpenFront.io](https://openfront.io) that runs directly in your browser console.

## Overview

Hammer Control Panel monitors and tracks resource donations (gold and troops) in OpenFront.io matches. It hooks into the game's internal systems (Worker messages, WebSocket, EventBus, GameView) to provide live statistics, automation, and strategic tools.

## Features

### Tabs

| Tab | Description |
|-----|-------------|
| **Summary** | Overview of match statistics, gold rates, and key metrics (port data separated from player donations) |
| **Stats** | Detailed player statistics, leaderboards, and fun stats |
| **Ports** | Trade port GPM analysis, interval timing, and embargo recommendations |
| **Feed** | Real-time chronological stream of all gold/troop transactions |
| **Alliances** | Monitor alliance relationships and team composition |
| **Auto-Troops** | Automated troop donation with configurable ratio, threshold, and cooldown |
| **Auto-Gold** | Automated gold donation with configurable amount, threshold, and cooldown |
| **Reciprocate** | "Troops for Gold Trust" system - popup notifications, quick-send, auto-reciprocate |
| **Comms** | Teammate/ally overview with alliance request button |
| **Hotkeys** | Keyboard shortcut reference |
| **About** | Version info, system health score, reconnect button, diagnostics |

### Key Capabilities

- **DisplayEvent Tracking** - Hooks into GameView to intercept donation messages (sent/received gold, troops, trade gold)
- **Worker Wrapping** - Intercepts `game_update` messages for real-time player data
- **WebSocket Wrapping** - Intent-based communication for donate, emoji, and quickchat
- **EventBus Discovery** - Uses game's native event classes for reliable event emission
- **Gold Rate Tracking** - 30s, 60s, and 120s rolling windows
- **Auto-Send** - Automated gold and troop donations to selected targets
- **Quick Reciprocate** - One-click gold sending when troops are received, with manual or auto mode
- **Target Capture** - Select targets by name or mouse-over (Alt+M)
- **Export Data** - Download complete JSON diagnostic reports
- **Config Persistence** - Settings saved across reloads
- **Draggable & Resizable** - Position anywhere, three size presets plus manual resize
- **Minimizable** - Collapse to title bar

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+M` | Capture target player under mouse |
| `Alt+F` | Toggle auto-troops on/off |

## Installation

1. Join an OpenFront.io match (multiplayer or singleplayer/team mode)
2. Open browser DevTools (F12 or Ctrl+Shift+J)
3. Copy the entire contents of [hammer-scripts/hammer.js](hammer-scripts/hammer.js)
4. Paste into the console and press Enter
5. The Hammer Control Panel appears in the bottom-right corner

## How It Works

### Architecture

Hammer is a single IIFE (Immediately Invoked Function Expression) in pure vanilla JavaScript with no dependencies. It hooks into four game systems:

1. **Worker Hook** - Wraps the game Worker's `postMessage`/`onmessage` to intercept `game_update` messages containing player data (clientID, smallID, team, troops, gold, allies, tiles)
2. **WebSocket Hook** - Wraps the WebSocket `send` method to intercept and emit intent events (donate gold, donate troops, emoji, quickchat)
3. **EventBus Discovery** - Discovers the game's minified event classes (e.g., `Rp` for gold, `Op` for troops) to emit events that the game's EventBus correctly routes
4. **GameView Hook** - Patches `updatesSinceLastTick` to intercept DisplayEvent messages with donation data (message types 18-22)

### Player Identity

- `mySmallID` identifies the current player across all DisplayEvent PID matching
- Bootstrap discovers identity via `_myClientID` / `_myPlayer` from game objects
- Safe fallback chain: clientID lookup -> known smallID lookup -> alive heuristic (only when unidentified)

### Supported Message Types (DisplayEvent)

| Type | Code | Description |
|------|------|-------------|
| SENT_GOLD | 18 | Gold sent to another player |
| RECEIVED_GOLD | 19 | Gold received from another player |
| RECEIVED_GOLD_TRADE | 20 | Gold received via trade port |
| SENT_TROOPS | 21 | Troops sent to another player |
| RECEIVED_TROOPS | 22 | Troops received from another player |

### Mode Support

- **Multiplayer** - Uses `game-view.clientGameRunner` path
- **Singleplayer/Team** - Uses `events-display.game` path (behaves identically to multiplayer)

### State Management

Global namespace `window.__HAMMER__` exposes:

```javascript
window.__HAMMER__.exportLogs()          // Export logs for debugging
window.__HAMMER__.exportLogs({          // Export with filters
  minLevel: 'warn',                     //   Only warnings and errors
  limit: 50                             //   Last 50 entries
})
window.__HAMMER__.cleanup()             // Clean up and remove script
window.__HAMMER__.version               // Current version
```

### Performance

- Atomic reference swapping for player data maps (no blink during updates)
- Render HTML caching (skip DOM rebuild when content unchanged)
- Bounded collections prevent memory leaks
- 500ms render interval with efficient Map-based lookups
- Debounced popup rendering with event delegation
- Escalating retry delays for system discovery (200ms-4s)

## File Structure

```
openfront/
├── hammer-scripts/
│   ├── hammer.js                # Main script (paste into console)
│   └── HAMMER_ARCHITECTURE.md   # Detailed architecture documentation
├── README.md                    # This file
├── CHANGELOG.md                 # Version history
└── CLAUDE.md                    # Development instructions
```

## Troubleshooting

### No Data Appearing

1. Check the **About** tab for system health score (should be 5/6 or 6/6)
2. If systems show as disconnected, click the **Reconnect** button
3. Check the **Feed** tab for raw transaction data
4. Export diagnostics for detailed debugging info

### Script Stops Tracking

- The game may have reloaded Worker/WebSocket connections
- Click **Reconnect** in the About tab to re-hook all systems
- If that fails, re-paste the script (old instance auto-cleans up)

### Allies/Teammates Not Showing

- Ensure you're in a team game or have active alliances
- Check the **Comms** tab for teammate/ally classification
- Player data refreshes every 3 seconds from game objects

### Export Button Not Working

Check browser console for errors. Some browsers block auto-downloads - allow the download in your browser's security settings.

## API

```javascript
// Access internal state
console.log(window.__HAMMER__)

// Export diagnostic logs
window.__HAMMER__.exportLogs()

// Clean shutdown
window.__HAMMER__.cleanup()
```

## License

This is an independent fan-made tool for OpenFront.io. Not affiliated with or endorsed by the game developers.

**Use at your own risk.** Browser console scripts can be powerful - only run code you understand or trust.

## Acknowledgments

Built for the OpenFront.io community to enhance strategic gameplay and economic analysis.
