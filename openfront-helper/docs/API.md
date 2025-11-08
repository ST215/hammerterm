# OpenFront Helper API Reference

## Global API

Access via `window.OFHelper` after script loads.

### Methods

#### `OFHelper.start()`
Start the helper (idempotent). Automatically called on load.

#### `OFHelper.stop()`
Stop the helper and cleanup UI.

#### `OFHelper.getState()`
Get current game state snapshot.

Returns:
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

#### `OFHelper.on(event, handler)`
Subscribe to an event.

Events:
- `"wire:gameUpdate"` - Raw game update from server
- `"state:updated"` - Store updated after processing
- `"turn:tick"` - New tick with `{ tick, state }` payload

#### `OFHelper.emit(event, payload)`
Emit a custom event.

#### `OFHelper.featureRegistry`
Access to feature registry API (see Feature Registry section).

#### `OFHelper.version`
Helper version string.

### Example Usage

```javascript
// Get current state
const state = OFHelper.getState();
console.log('My tiles:', state.my.tiles);

// Listen to tick events
OFHelper.on('turn:tick', ({ tick, state }) => {
  console.log('Tick:', tick, 'Troops:', state.my.troops);
});

// Register custom feature
OFHelper.featureRegistry.registerFeature('MyFeature', (api) => {
  return {
    init() {
      api.UI.createPanel('myfeature');
      api.on('turn:tick', ({ state }) => {
        api.UI.setPanelText('myfeature', `Custom: ${state.my.gold}`);
      });
    },
    destroy() {
      api.UI.removePanel('myfeature');
    }
  };
});
```

## Feature API

When creating a feature, you receive a `FeatureAPI` object with the following properties:

### `api.on(event, handler)`
Subscribe to events (see EventBus).

### `api.emit(event, payload)`
Emit events (see EventBus).

### `api.getState()`
Get current game state snapshot (see Store).

### `api.UI`
UI management API (see UI section).

### `api.Actions`
Game interaction API (see Actions section).

### `api.selectors`
Helper functions for derived data (see Selectors section).

## Selectors API

Pure functions for computing derived values from state.

### `selectors.getMyPlayer(state)`
Get current player's full snapshot.

Returns: `PlayerSnapshot | null`

### `selectors.getMySummary(state)`
Get current player's summary stats.

Returns:
```javascript
{
  tiles: number,
  troops: number,
  gold: number,
  goldCap: number,
  troopCap: number,
  allies: number[],
  isAlive: boolean
}
```

### `selectors.getLeaderboard(state)`
Get all players sorted by territory descending.

Returns: `PlayerSnapshot[]`

### `selectors.getAllies(state)`
Get current player's allies.

Returns: `PlayerSnapshot[]`

### `selectors.getAlivePlayers(state)`
Get all alive players who have spawned.

Returns: `PlayerSnapshot[]`

### `selectors.getPlayerBySmallID(state, smallID)`
Get player by their small ID (0-99).

Parameters:
- `smallID` (number) - Player's small ID

Returns: `PlayerSnapshot | null`

### `selectors.getIncomeRates(state)`
Calculate current income rates per second.

Returns:
```javascript
{
  gold: number,    // Gold per second
  troops: number   // Troops per second
}
```

Example:
```javascript
const state = OFHelper.getState();
const rates = selectors.getIncomeRates(state);
console.log(`Earning ${rates.gold} gold/sec`);
```

## UI API

Manages HUD overlay and panels.

### `UI.init()`
Initialize HUD container (called automatically).

### `UI.createPanel(id, opts)`
Create or get a named panel.

Parameters:
- `id` (string) - Unique panel identifier
- `opts` (object, optional)
  - `interactive` (boolean) - Enable pointer events (default: false)
  - `style` (string) - Additional CSS

Returns: `HTMLElement`

### `UI.setPanelText(id, text)`
Set panel text content.

Parameters:
- `id` (string) - Panel identifier
- `text` (string) - Text to display

### `UI.setPanelHTML(id, html)`
Set panel HTML content.

Parameters:
- `id` (string) - Panel identifier
- `html` (string) - HTML to display

### `UI.removePanel(id)`
Remove a panel.

Parameters:
- `id` (string) - Panel identifier

### `UI.setPanelVisible(id, visible)`
Show or hide a panel.

Parameters:
- `id` (string) - Panel identifier
- `visible` (boolean) - Whether to show

### `UI.destroy()`
Cleanup all UI elements.

Example:
```javascript
// Create interactive panel
const panel = api.UI.createPanel('custom', { interactive: true });

// Set HTML with button
api.UI.setPanelHTML('custom', `
  <div>Custom Panel</div>
  <button onclick="alert('Clicked!')">Click Me</button>
`);

// Later: remove panel
api.UI.removePanel('custom');
```

## Actions API

Game interaction methods (stubs in v1.0).

### `Actions.sendTroops(opts)`
Send troops from one tile to another.

Parameters:
```javascript
{
  fromTile: number,   // Source tile reference
  toTile: number,     // Target tile reference
  percent: number     // Percentage to send (0-100)
}
```

Status: **Not implemented** (logs warning)

### `Actions.sendGold(opts)`
Send gold to a player.

Parameters:
```javascript
{
  toPlayerId: number,  // Target player's small ID
  amount: number       // Gold amount to send
}
```

Status: **Not implemented** (logs warning)

### `Actions.sendAllianceRequest(playerId)`
Send alliance request.

Parameters:
- `playerId` (number) - Target player's small ID

Status: **Not implemented** (logs warning)

### `Actions.acceptAllianceRequest(playerId)`
Accept alliance request.

Parameters:
- `playerId` (number) - Player who sent request

Status: **Not implemented** (logs warning)

### `Actions.breakAlliance(playerId)`
Break alliance with player.

Parameters:
- `playerId` (number) - Ally's small ID

Status: **Not implemented** (logs warning)

### `Actions.sendChat(message)`
Send chat message.

Parameters:
- `message` (string) - Message text

Status: **Not implemented** (logs warning)

### `Actions.spawn(tileRef)`
Spawn on a tile.

Parameters:
- `tileRef` (number) - Tile reference to spawn on

Status: **Not implemented** (logs warning)

## Feature Registry API

Manage features dynamically.

### `featureRegistry.registerFeature(name, factory)`
Register and initialize a feature.

Parameters:
- `name` (string) - Feature name
- `factory` (function) - `(api) => { init?, destroy? }`

Example:
```javascript
OFHelper.featureRegistry.registerFeature('AllyTracker', (api) => {
  const PANEL_ID = 'allies';

  function init() {
    api.UI.createPanel(PANEL_ID);
    api.on('turn:tick', ({ state }) => {
      const allies = api.selectors.getAllies(state);
      const allyList = allies.map(a => `${a.name}: ${a.tiles} tiles`).join(', ');
      api.UI.setPanelText(PANEL_ID, `Allies: ${allyList || 'None'}`);
    });
  }

  function destroy() {
    api.UI.removePanel(PANEL_ID);
  }

  return { init, destroy };
});
```

### `featureRegistry.unregisterFeature(name)`
Unregister and destroy a feature.

Parameters:
- `name` (string) - Feature name

### `featureRegistry.getFeature(name)`
Get feature instance.

Parameters:
- `name` (string) - Feature name

Returns: Feature instance or `undefined`

### `featureRegistry.listFeatures()`
Get list of registered feature names.

Returns: `string[]`

## Type Definitions

### PlayerSnapshot
```javascript
{
  id: string,              // UUID
  name: string,            // Display name
  smallID: number,         // 0-99
  clientID: string | null,
  tiles: number,
  gold: number,
  troops: number,
  isAlive: boolean,
  isDisconnected: boolean,
  isTraitor: boolean,
  hasSpawned: boolean,
  allies: number[],        // Array of ally smallIDs
  playerType: number       // 0=Human, 1=Bot, 2=FakeHuman
}
```

### UnitSnapshot
```javascript
{
  id: number,              // Unique unit ID
  unitType: number,        // 0=City, 1=Port, etc.
  ownerID: number,         // Owner's smallID
  troops: number,
  level: number,           // Upgrade level
  pos: number              // Tile reference
}
```

## Events Reference

### `wire:gameUpdate`
Emitted by Wiretap when game update received.

Payload: `GameUpdateViewData` object

### `state:updated`
Emitted by Store after processing update.

Payload: Current state snapshot

### `turn:tick`
Emitted by TurnClock on each tick.

Payload:
```javascript
{
  tick: number,
  state: GameSnapshot
}
```

## Best Practices

1. **Use Selectors**: Don't re-implement data queries - use provided selectors
2. **Listen to turn:tick**: Base periodic logic on tick events, not `setInterval`
3. **Don't Mutate State**: State from `getState()` is a snapshot - don't modify it
4. **Cleanup in destroy()**: Always clean up UI and event listeners in feature's `destroy()`
5. **Error Handling**: Wrap risky code in try-catch, especially in event handlers
6. **Performance**: Throttle expensive operations if needed (but ticks are only 10/sec)

## Example: Complete Custom Feature

```javascript
OFHelper.featureRegistry.registerFeature('TroopMonitor', (api) => {
  const { on, UI, selectors } = api;
  const PANEL_ID = 'troop-monitor';
  const THRESHOLD = 0.9; // Alert when troops > 90% of cap

  let lastAlertTick = -1;

  function checkTroops({ tick, state }) {
    const my = selectors.getMySummary(state);

    if (!my.isAlive) return;

    const ratio = my.troops / my.troopCap;
    const status = ratio >= THRESHOLD ? 'WARNING' : 'OK';
    const color = ratio >= THRESHOLD ? '#ff0' : '#0f0';

    UI.setPanelHTML(PANEL_ID, `
      <span style="color: ${color}">
        Troops: ${Math.floor(ratio * 100)}% (${status})
      </span>
    `);

    // Alert once when threshold crossed
    if (ratio >= THRESHOLD && lastAlertTick < tick - 100) {
      console.warn('[TroopMonitor] Troops approaching cap!');
      lastAlertTick = tick;
    }
  }

  function init() {
    UI.createPanel(PANEL_ID);
    on('turn:tick', checkTroops);
    console.log('[TroopMonitor] Initialized');
  }

  function destroy() {
    UI.removePanel(PANEL_ID);
    console.log('[TroopMonitor] Destroyed');
  }

  return { init, destroy };
});
```
