# OpenFront Game Types Reference

Reference documentation for OpenFront.io game data structures, based on the [OpenFrontIO repository](https://github.com/openfrontio/OpenFrontIO).

## Core Enums

### GameUpdateType
Update type identifiers used in game update messages.

```javascript
{
  Tile: 0,
  Unit: 1,
  Player: 2,
  DisplayEvent: 3,
  DisplayChatEvent: 4,
  AllianceRequest: 5,
  AllianceAccepted: 6,
  AllianceDeclined: 7,
  AllianceRevoked: 8,
  TargetPlayer: 10,
  Emoji: 11,
  Win: 12,
  Hash: 13,
  UnitIncoming: 14,
  BonusEvent: 15,
  RailroadEvent: 16,
  ConquestEvent: 17,
  EmbargoEvent: 18
}
```

### UnitType
Types of units that can exist in the game.

```javascript
{
  City: 0,           // Spawning city (+250k troops per level)
  Port: 1,           // Naval unit
  Factory: 2,        // Production building
  SAMLauncher: 3,    // Anti-air defense (70 tile range)
  IceBallLauncher: 4,
  Warship: 5,        // Combat ship
  TradeShip: 6,      // Resource transport
  Nuke: 7,           // Nuclear missile
  Train: 8,          // Ground transport
  Plane: 9,          // Air unit
  Helicopter: 10,
  Fort: 11,          // Defensive structure
  Farmland: 12,      // Resource generation
  GroundVehicle: 13,
  RailroadStation: 14,
  OilRig: 15,
  Submarine: 16
}
```

### PlayerType
```javascript
{
  Human: 0,          // Real player
  Bot: 1,            // AI opponent
  FakeHuman: 2       // Bot disguised as human
}
```

### GameMode
```javascript
{
  FFA: 0,            // Free-for-all
  Team: 1            // Team-based
}
```

### Difficulty
```javascript
{
  Easy: 0,
  Medium: 1,
  Hard: 2,
  Impossible: 3
}
```

## Core Types

### GameUpdateViewData
Main structure sent by server each tick (100ms interval).

```typescript
{
  tick: number,                                    // Current game tick
  updates: {
    [GameUpdateType.Player]: PlayerUpdate[],
    [GameUpdateType.Unit]: UnitUpdate[],
    [GameUpdateType.Tile]: TileUpdate[],
    // ... other update types
  },
  packedTileUpdates: BigUint64Array,              // Compressed tile ownership
  playerNameViewData: Record<string, NameViewData>,
  tickExecutionDuration?: number                   // Server processing time (ms)
}
```

### PlayerUpdate
Complete player state snapshot.

```typescript
{
  type: GameUpdateType.Player,                     // = 2
  id: string,                                      // PlayerID (UUID)
  smallID: number,                                 // Compact ID (0-99)
  clientID: string | null,                         // ClientID (UUID)
  name: string,                                    // Username
  displayName: string,                             // Formatted name
  playerType: PlayerType,                          // Human, Bot, or FakeHuman
  team?: number,                                   // Team number (if team mode)

  // Status
  isAlive: boolean,
  isDisconnected: boolean,
  hasSpawned: boolean,

  // Resources
  tilesOwned: number,
  gold: bigint,                                    // Large integer
  troops: number,

  // Alliances & Relations
  allies: number[],                                // Array of ally smallIDs
  alliances: AllianceView[],                       // Detailed alliance info
  embargoes: Set<string>,                          // Set of embargoed PlayerIDs
  isTraitor: boolean,                              // Has broken alliance
  traitorRemainingTicks?: number,                  // Traitor status duration
  betrayals: number,                               // Count of betrayals

  // Targets & Communication
  targets: number[],                               // Targeted player smallIDs
  outgoingEmojis: EmojiMessage[],
  outgoingAttacks: AttackUpdate[],
  incomingAttacks: AttackUpdate[],
  outgoingAllianceRequests: string[],              // PlayerIDs

  // Other
  lastDeleteUnitTick: number,                      // Last unit deletion tick
  nameViewData?: NameViewData                      // Display styling
}
```

### UnitUpdate
Complete unit state.

```typescript
{
  type: GameUpdateType.Unit,                       // = 1
  id: number,                                      // Unique unit ID
  unitType: UnitType,                              // City, Port, Factory, etc.
  ownerID: number,                                 // Owner's smallID
  lastOwnerID?: number,                            // Previous owner

  // Position
  pos: number,                                     // Current tile reference
  lastPos: number,                                 // Previous tile reference

  // State
  isActive: boolean,                               // Exists (not destroyed)
  troops: number,
  level: number,                                   // Upgrade level (1-5)
  health?: number,                                 // Warships only

  // Movement & Targeting
  reachedTarget: boolean,
  retreating: boolean,
  targetable: boolean,
  markedForDeletion: number | false,               // Tick when deleted
  targetUnitId?: number,                           // Trade ships
  targetTile?: number,                             // Nukes

  // Special Properties
  hasTrainStation: boolean,                        // Cities
  trainType?: TrainType,                           // Trains only
  loaded?: boolean,                                // Trains only
  constructionType?: UnitType,                     // Factories
  missileTimerQueue: number[]                      // SAM launchers
}
```

### TileUpdate
Tile ownership change.

```typescript
{
  type: GameUpdateType.Tile,                       // = 0
  ref: number,                                     // Tile grid reference
  ownerSmallID: number,                            // Owner's smallID (0 = neutral)
  troops?: number                                  // Troops on tile (optional)
}
```

### AllianceView
Detailed alliance information.

```typescript
{
  ally: number,                                    // Ally's smallID
  requestedAt: number,                             // Tick when requested
  acceptedAt: number,                              // Tick when accepted
  expiresAt: number,                               // Tick when expires
  permanent: boolean                               // Never expires
}
```

### AttackUpdate
Troop movement information.

```typescript
{
  fromTile: number,                                // Source tile reference
  toTile: number,                                  // Target tile reference
  troops: number,                                  // Number of troops
  arrivalTick: number,                             // When troops arrive
  attackerSmallID: number                          // Attacker's smallID
}
```

## Packed Tile Format

Tiles are transmitted in compressed format using `BigUint64Array`.

### Decoding
```javascript
const packedValue = packedTileUpdates[i];  // bigint or string

// Convert to bigint if string
const tu = typeof packedValue === 'string' ? BigInt(packedValue) : packedValue;

// Extract fields
const ref = Number(tu >> 16n);              // Tile reference (upper bits)
const state = Number(tu & 0xffffn);         // State (lower 16 bits)
const ownerSmallID = state & 0x0fff;        // Owner (lower 12 bits)

// ownerSmallID = 0 means neutral/unowned
```

## Constants & Formulas

### Tick Timing
```javascript
turnIntervalMs = 100                        // 100ms per tick
ticksPerSecond = 10                         // 10 ticks/second
```

### Resource Generation

#### Gold
```javascript
// Per tick
goldPerTick = playerType === PlayerType.Bot ? 50n : 100n

// Per second
goldPerSecond = goldPerTick * 10
```

#### Troops
```javascript
// Max troops
baseTroops = 2 * (Math.pow(tilesOwned, 0.6) * 1000 + 50000)
cityBonus = cityLevels * 250000
maxTroops = baseTroops + cityBonus

// For bots
if (playerType === PlayerType.Bot) {
  maxTroops = maxTroops / 3
}

// Per tick generation
ratio = 1 - (currentTroops / maxTroops)
baseRate = 10 + Math.pow(currentTroops, 0.73) / 4
troopsPerTick = baseRate * ratio

// Per second
troopsPerSecond = troopsPerTick * 10
```

### City Troop Bonus
```javascript
bonusTroops = cityLevel * 250000

// Example: Level 3 city = 750,000 extra troop capacity
```

### SAM Launcher Range
```javascript
samRange = 70  // tiles
```

## Message Formats

### Server Messages

#### Turn Message
```typescript
{
  type: "turn",
  turn: {
    turnNumber: number,                     // Current tick
    intents: Intent[],                      // Processed client actions
    hash?: number                           // Game state checksum
  }
}
```

#### Start Game Message
```typescript
{
  type: "start",
  gameID: string,
  playerID: string,
  initialState: GameState
}
```

#### Ping Message
```typescript
{
  type: "ping",
  timestamp: number
}
```

### Client Messages

#### Join Message
```typescript
{
  type: "join",
  clientID: string,
  token: string,
  gameID: string,
  lastTurn: number,
  username: string,
  cosmetics: PlayerCosmetics
}
```

#### Intent Message
```typescript
{
  type: "intent",
  intent: Intent                            // Player action
}
```

## Intent Types

Player actions sent to server:

```typescript
type Intent =
  | AttackIntent                            // Send troops
  | GoldTransferIntent                      // Send gold
  | AllianceRequestIntent                   // Request alliance
  | AllianceAcceptIntent                    // Accept request
  | AllianceRevokeIntent                    // Break alliance
  | BuildIntent                             // Construct unit
  | UpgradeIntent                           // Upgrade unit
  | DeleteIntent                            // Delete unit
  | SpawnIntent                             // Choose spawn location
  | EmbargoIntent                           // Embargo player
  | TargetIntent                            // Mark target
  | ChatIntent                              // Send message
  | EmojiIntent                             // Send emoji
```

## Useful Calculations

### Time Until Alliance Expires
```javascript
const alliance = player.alliances[0];
if (alliance.permanent) {
  return Infinity;
}

const ticksRemaining = alliance.expiresAt - currentTick;
const secondsRemaining = ticksRemaining * 0.1;  // 100ms per tick
const minutesRemaining = secondsRemaining / 60;
```

### Troop Travel Time
```javascript
const attack = player.outgoingAttacks[0];
const ticksUntilArrival = attack.arrivalTick - currentTick;
const secondsUntilArrival = ticksUntilArrival * 0.1;
```

### Territory Percentage
```javascript
const totalTiles = 10000;  // Typical map size (100x100)
const percentage = (player.tilesOwned / totalTiles) * 100;
```

## Reference Links

- [OpenFrontIO Repository](https://github.com/openfrontio/OpenFrontIO)
- [GameUpdates.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/game/GameUpdates.ts)
- [Game.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/game/Game.ts)
- [DefaultConfig.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/configuration/DefaultConfig.ts)
- [Schemas.ts](https://github.com/openfrontio/OpenFrontIO/blob/main/src/core/Schemas.ts)
