# OpenFront Helper – Architecture

## Overview

OpenFront Helper is a tick-synchronized game assistant for OpenFront.io that hooks into the game's internal tick system instead of using ad-hoc timers and DOM scraping.

## Core Principles

1. **Tick-Based Synchronization**: All periodic logic is driven by game ticks from the server (100ms intervals), not `setInterval`
2. **Read-Only Consumer**: Acts as a passive observer of game state via WebSocket interception
3. **Modular Plugin System**: Features are isolated plugins that communicate via events
4. **No DOM Scraping**: Data comes directly from game update messages

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Features                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ SummaryHUD  │  │  Feature 2  │  │  Feature N  │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         └─────────────────┴─────────────────┘              │
└─────────────────────────┬───────────────────────────────────┘
                          │ FeatureAPI
┌─────────────────────────┴───────────────────────────────────┐
│                     Core Systems                            │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ EventBus │  │  Store   │  │    UI    │  │ Actions  │  │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └──────────┘  │
│       │             │                                       │
│  ┌────┴─────────────┴────┐  ┌──────────────────────┐      │
│  │     TurnClock         │  │     Selectors        │      │
│  └──────────┬────────────┘  └──────────────────────┘      │
│             │                                               │
│  ┌──────────┴────────────┐                                 │
│  │      Wiretap          │                                 │
│  └───────────────────────┘                                 │
└─────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│              WebSocket / SharedWorker                       │
│         (Game's communication with server)                  │
└─────────────────────────────────────────────────────────────┘
```

## Module Descriptions

### 1. EventBus (Core Communication)

Lightweight synchronous pub/sub system for inter-module communication.

**API**:
- `on(event, handler)` - Subscribe to event
- `off(event, handler)` - Unsubscribe
- `emit(event, payload)` - Fire event

**Events**:
- `wire:gameUpdate` - Raw game update from Wiretap
- `state:updated` - Store updated after processing
- `turn:tick` - New tick with current state

### 2. Store (State Management)

Canonical mirror of game state, synchronized with server ticks.

**State Shape**:
```javascript
{
  tick: number,
  myPlayerId: number | null,
  myClientId: string | null,
  players: Record<smallID, PlayerSnapshot>,
  units: Record<unitId, UnitSnapshot>,
  my: {
    tiles: number,
    troops: number,
    gold: number,
    goldCap: number,
    troopCap: number,
    allies: number[],
    isAlive: boolean
  }
}
```

**API**:
- `getState()` - Get current state snapshot
- `updateFromGameUpdate(viewData)` - Process game update (internal use)

### 3. Wiretap (WebSocket Interception)

Monkeypatches WebSocket and SharedWorker to extract `GameUpdateViewData`.

**Detection Patterns**:
1. Worker message: `{ type: "game_update", gameUpdate: {...} }`
2. Raw update: `{ tick: number, updates: {...}, ... }`

**API**:
- `init()` - Patch WebSocket/SharedWorker (idempotent)

### 4. TurnClock (Tick Synchronization)

Authoritative tick/turn engine that drives all time-based logic.

**Responsibilities**:
- Subscribe to `wire:gameUpdate`
- Update Store on each tick
- Emit `turn:tick` with current state
- **No timers** - purely event-driven

**API**:
- `init()` - Start listening (idempotent)
- `getCurrentTick()` - Get last processed tick

### 5. Selectors (Derived Data)

Pure functions for computing derived values from state.

**Functions**:
- `getMyPlayer(state)` - Current player snapshot
- `getMySummary(state)` - Summary stats
- `getLeaderboard(state)` - Players sorted by tiles
- `getAllies(state)` - Current allies
- `getAlivePlayers(state)` - All alive players
- `getPlayerBySmallID(state, smallID)` - Lookup player
- `getIncomeRates(state)` - Gold/troops per second

### 6. UI (HUD Management)

Manages overlay HUD and named panels.

**API**:
- `init()` - Create HUD container
- `createPanel(id, opts)` - Create/get panel
- `setPanelText(id, text)` - Set panel text
- `setPanelHTML(id, html)` - Set panel HTML
- `removePanel(id)` - Remove panel
- `setPanelVisible(id, visible)` - Show/hide
- `destroy()` - Cleanup

### 7. Actions (Game Interaction)

Centralized API for scripted game actions (stubs in v1.0).

**API** (not yet implemented):
- `sendTroops({ fromTile, toTile, percent })`
- `sendGold({ toPlayerId, amount })`
- `sendAllianceRequest(playerId)`
- `acceptAllianceRequest(playerId)`
- `breakAlliance(playerId)`
- `sendChat(message)`
- `spawn(tileRef)`

### 8. FeatureRegistry (Plugin System)

Manages feature lifecycle.

**API**:
- `registerFeature(name, factory)` - Register and init feature
- `unregisterFeature(name)` - Unregister and destroy
- `getFeature(name)` - Get instance
- `listFeatures()` - List names

**Feature Factory Signature**:
```javascript
function createFeature(api) {
  // api = { on, emit, getState, UI, Actions, selectors }

  return {
    init() { /* setup */ },
    destroy() { /* cleanup */ }
  };
}
```

## Data Flow

```
1. Server sends update (100ms interval)
      ↓
2. WebSocket/SharedWorker receives message
      ↓
3. Wiretap intercepts and parses
      ↓ emit("wire:gameUpdate")
4. TurnClock receives update
      ↓
5. Store.updateFromGameUpdate(viewData)
      ↓ emit("state:updated")
6. TurnClock emits turn:tick
      ↓
7. Features react to turn:tick
      ↓
8. Features update UI panels
```

## Game Update Structure

Based on OpenFrontIO codebase:

**GameUpdateViewData**:
```typescript
{
  tick: number,
  updates: {
    [GameUpdateType.Player]: PlayerUpdate[],
    [GameUpdateType.Unit]: UnitUpdate[],
    [GameUpdateType.Tile]: TileUpdate[],
    // ... other update types
  },
  packedTileUpdates: BigUint64Array,
  playerNameViewData: Record<...>
}
```

**PlayerUpdate** (partial):
```typescript
{
  type: GameUpdateType.Player,
  id: string,           // UUID
  smallID: number,      // 0-99
  clientID: string,
  name: string,
  tilesOwned: number,
  gold: bigint,
  troops: number,
  allies: number[],
  isAlive: boolean,
  hasSpawned: boolean,
  // ... more fields
}
```

## Resource Calculations

### Max Troops
```javascript
baseTroops = 2 * (tiles^0.6 * 1000 + 50000)
cityBonus = cityLevels * 250000
maxTroops = baseTroops + cityBonus
```

### Max Gold
```javascript
maxGold = tiles * 5000 + 100000  // Simplified
```

### Income Rates
```javascript
// Gold: 100/tick for humans, 50/tick for bots
goldPerSecond = goldPerTick * 10

// Troops: decreases as approaching cap
ratio = 1 - (currentTroops / maxTroops)
troopsPerTick = (10 + troops^0.73 / 4) * ratio
troopsPerSecond = troopsPerTick * 10
```

## Feature Development

To create a new feature:

1. Create factory function:
```javascript
function createMyFeature(api) {
  const { on, UI, selectors, getState } = api;

  function init() {
    UI.createPanel('myfeature');
    on('turn:tick', handleTick);
  }

  function handleTick({ tick, state }) {
    // React to tick
  }

  function destroy() {
    UI.removePanel('myfeature');
  }

  return { init, destroy };
}
```

2. Register in main.js:
```javascript
featureRegistry.registerFeature('MyFeature', createMyFeature);
```

## Licensing

This helper uses **structure knowledge** from the OpenFrontIO repository but does not copy AGPL-licensed code. If distributing publicly, include attribution:

```
Based on OpenFront.io architecture
Game: https://github.com/openfrontio/OpenFrontIO
Licensed under AGPLv3 with attribution requirements
```

## Future Enhancements

- **Actions implementation** - Implement actual game interaction methods
- **Additional features** - Auto-donate, alliance tracker, SAM overlay, etc.
- **Settings panel** - UI for configuring features
- **Persistent config** - localStorage for user preferences
- **Binary message parsing** - Full support for binary WebSocket messages
