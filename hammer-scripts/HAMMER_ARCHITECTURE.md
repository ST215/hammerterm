# Hammer v10.0 - Architecture & Visual Guide

> **What is Hammer?** A browser-injected companion tool for [OpenFront.io](https://openfront.io) that intercepts game data to track donations, automate resource sending, and provide real-time analytics. You paste it into the browser console and it hooks into the running game.

---

## High-Level Architecture

```
+============================================================================+
|                           BROWSER (OpenFront.io)                           |
|                                                                            |
|  +------------------+     +------------------+     +-------------------+   |
|  |   Game Worker     |     |   Game WebSocket |     |   Game DOM        |   |
|  |  (Web Worker)     |     |  (Server Comms)  |     |  (Canvas + UI)    |   |
|  +--------+---------+     +--------+---------+     +--------+----------+   |
|           |                        |                         |              |
|     [intercepted]            [intercepted]             [intercepted]       |
|           |                        |                         |              |
|  +--------v---------+     +--------v---------+     +--------v----------+   |
|  | WrappedWorker     |     | WrappedWebSocket |     | Canvas Hooks      |   |
|  | - Reads player    |     | - Captures socket|     | - setTransform()  |   |
|  |   updates         |     | - Logs intents   |     | - drawImage()     |   |
|  | - Reads tile data |     | - Sends commands |     | - Mouse tracking  |   |
|  +--------+---------+     +--------+---------+     +--------+----------+   |
|           |                        |                         |              |
|           +----------+-------------+-------------------------+              |
|                      |                                                     |
|              +-------v--------+                                            |
|              |  HAMMER CORE   |                                            |
|              |  (State + Logic)|                                           |
|              +-------+--------+                                            |
|                      |                                                     |
|           +----------+----------+                                          |
|           |                     |                                          |
|   +-------v--------+   +-------v--------+                                  |
|   | Automation      |   | Floating UI    |                                 |
|   | Engine          |   | Panel          |                                 |
|   | - Auto-Troops   |   | - 12 Tabs      |                                |
|   | - Auto-Gold     |   | - Draggable    |                                |
|   | - Reciprocate   |   | - Resizable    |                                |
|   +-----------------+   +----------------+                                 |
|                                                                            |
+============================================================================+
```

---

## Data Flow: How Hammer Sees the Game

Hammer doesn't modify the game. It **wraps** the browser APIs that the game uses, so it can read data flowing through them.

```
                          GAME SERVER
                              |
                    +---------+---------+
                    |                   |
              WebSocket             Web Worker
              (commands)            (game state)
                    |                   |
    +---------------v---+       +-------v-----------+
    | WrappedWebSocket   |       | WrappedWorker      |
    |                    |       |                     |
    | READS:             |       | READS:              |
    | - Join messages    |       | - Player updates    |
    |   (captures        |       |   (troops, gold,    |
    |    clientID)       |       |    tiles, teams)    |
    | - Intent messages  |       | - Tile ownership    |
    |   (logs donations) |       |   (packed updates)  |
    |                    |       | - Unit updates      |
    | SENDS:             |       |   (city tracking)   |
    | - donate_gold      |       |                     |
    | - donate_troops    |       +----------+----------+
    +--------+-----------+                  |
             |                              |
             +-------------+----------------+
                            |
                    +-------v-------+
                    |  Global State |
                    |  (the "S"     |
                    |   object)     |
                    +-------+-------+
                            |
              +-------------+-------------+
              |             |             |
        Donation        Player        Gold Rate
        Tracking        Maps          History
```

---

## Interception Layer: The Three Hooks

Hammer intercepts game data at **three separate points**:

```
  HOOK 1: Worker Messages              HOOK 2: WebSocket             HOOK 3: GameView
  ========================              ==================            =================

  Game creates Web Worker               Game opens WebSocket          Game renders events
        |                                     |                             |
  Hammer replaces                       Hammer replaces               Hammer patches
  window.Worker with                    window.WebSocket with         updatesSinceLastTick()
  WrappedWorker class                   WrappedWebSocket class        on the GameView object
        |                                     |                             |
  Every message from                    Every send() call is          DisplayEvents (donation
  Worker is also sent                   logged; socket ref            messages) are captured
  to onWorkerMessage()                  saved as gameSocket           before rendering
        |                                     |                             |
  Extracts:                             Extracts:                     Extracts:
  - Player list                         - clientID                    - "Received X gold from Y"
  - Tile ownership                      - Game socket ref             - "Sent X troops to Y"
  - City/unit data                      - Outgoing intents            - Port trade messages
  - Alliance info                                                     - All donation events
```

---

## State Architecture

All runtime state lives in the `S` object. Here's what it tracks:

```
S (Global State Object)
|
+-- view: string              <- Which tab is active ("summary", "autotroops", etc.)
+-- paused: bool              <- Pause all tracking
+-- minimized: bool           <- UI minimized
|
+-- DONATION TRACKING
|   +-- inbound: Map<id, {gold, troops, count, last}>    <- What you received
|   +-- outbound: Map<id, {gold, troops, count, last}>   <- What you sent
|   +-- ports: Map<id, {totalGold, times[], gpm}>        <- Port trade income
|   +-- feedIn: [{ts, type, name, amount, isPort}]       <- Live inbound log
|   +-- feedOut: [{ts, type, name, amount}]               <- Live outbound log
|
+-- AUTO-TROOPS CONFIG
|   +-- asTroopsRunning: bool
|   +-- asTroopsTargets: string[]     <- Player names to send to
|   +-- asTroopsRatio: 20             <- Send 20% of your troops
|   +-- asTroopsThreshold: 50         <- Only send when >50% full
|   +-- asTroopsCooldownSec: 10       <- Wait 10s between sends
|   +-- asTroopsAllTeamMode: bool     <- Send to ALL teammates
|   +-- asTroopsLog: string[]         <- Activity log
|
+-- AUTO-GOLD CONFIG
|   +-- asGoldRunning: bool
|   +-- asGoldTargets: string[]
|   +-- asGoldRatio: 20               <- Send 20% of current gold
|   +-- asGoldThreshold: 0            <- Min gold to trigger
|   +-- asGoldCooldownSec: 10
|   +-- asGoldAllTeamMode: bool
|   +-- asGoldLog: string[]
|
+-- RECIPROCATE CONFIG
    +-- reciprocateEnabled: bool
    +-- reciprocateMode: "manual"|"auto"
    +-- reciprocateAutoPct: 50         <- Auto-send 50% back
    +-- reciprocateOnTroops: bool      <- Trigger on troop receipts
    +-- reciprocateOnGold: bool        <- Trigger on gold receipts
    +-- reciprocatePopupsEnabled: bool
    +-- reciprocateHistory: []
```

---

## Auto-Send Flow (Troops & Gold)

This is the core automation loop. It runs on an 800ms interval timer.

```
Every 800ms (asTroopsTick / asGoldTick)
                |
                v
    +--[ Is running? ]--NO--> (skip)
                |
               YES
                v
    +--[ Resolve targets ]
    |   - AllTeam mode? --> getTeammates()
    |   - Manual mode?  --> look up each name in playersByName
                |
                v
    +--[ Read my player data ]
    |   - Get current troops/gold
    |   - Calculate troop % capacity
                |
                v
    +--[ Above threshold? ]--NO--> (skip, show "below threshold")
                |
               YES
                v
    +--[ Calculate send amount ]
    |   amount = myResource * (ratio / 100)
                |
                v
    +--[ For each target: ]
    |       |
    |   +--[ Is ally/teammate? ]--NO--> (skip)
    |       |
    |      YES
    |       v
    |   +--[ Cooldown expired? ]--NO--> (skip, show countdown)
    |       |
    |      YES
    |       v
    |   +--[ SEND! ]--> Try EventBus first, fall back to WebSocket
    |       |
    |       v
    |   +--[ Log result, reset cooldown timer ]
    |
    (loop to next target)
```

---

## Send Methods: EventBus vs WebSocket

Hammer has TWO ways to actually send donations. It prefers EventBus:

```
METHOD 1: EventBus (Preferred)                METHOD 2: WebSocket (Fallback)
============================                  ==============================

1. Find EventBus on DOM                       1. Use captured gameSocket
   (events-display, game-view)                2. Build JSON intent:
2. Discover minified event classes               { type: "intent",
   (scans for classes with                         intent: {
    "recipient" + "gold/troops")                     type: "donate_gold",
3. Get PlayerView object for target                  clientID: "...",
4. Create event instance:                            recipient: targetId,
   new GoldEventClass(playerView, amount)            gold: amount
5. eventBus.emit(event)                            }
                                                 }
WHY PREFERRED:                                3. gameSocket.send(JSON.stringify(...))
- Doesn't need clientID
- Same path as game UI                        WHY FALLBACK:
- More reliable                               - Needs correct clientID
                                              - Bypasses game validation
```

---

## Event Class Discovery

The game's JavaScript is minified, so class names change with updates. Hammer auto-discovers them:

```
EventBus.listeners (Map)
    |
    +-- Class "Xp" --> [handler1, handler2]
    +-- Class "Yp" --> [handler1]
    +-- Class "Op" --> [handler1, handler2, handler3]   <-- candidate?
    +-- Class "Rp" --> [handler1, handler2]             <-- candidate?
    +-- ...

For each class, Hammer does:
    1. Try "new EventClass()" and "new EventClass(null, 0)"
    2. Check: does instance have "recipient" property?
    3. Check: does instance have "troops" property? --> TROOPS CLASS
    4. Check: does instance have "gold" property?   --> GOLD CLASS
    5. Cache result in localStorage for next reload
```

---

## Donation Detection Pipeline

When someone sends you gold or troops, here's how Hammer detects it:

```
  Game server sends donation event
            |
            v
  +--[ GameView.updatesSinceLastTick() ]  <-- HOOKED
  |   Returns DisplayEvents array
            |
            v
  +--[ processDisplayMessage(event) ]
  |   |
  |   +--[ Check event.playerID === mySmallID ]  <-- Is this about me?
  |   |       NO --> discard
  |   |
  |   +--[ Deduplication check ]  <-- seen this in last 60s?
  |   |       YES --> discard
  |   |
  |   +--[ Match messageType ]
  |       |
  |       +-- 22: RECEIVED_TROOPS_FROM_PLAYER
  |       |     --> bump inbound map
  |       |     --> add to feedIn
  |       |     --> trigger reciprocate?
  |       |
  |       +-- 19: RECEIVED_GOLD_FROM_PLAYER
  |       |     --> bump inbound map
  |       |     --> add to feedIn
  |       |     --> trigger reciprocate?
  |       |
  |       +-- 20: RECEIVED_GOLD_FROM_TRADE (port)
  |       |     --> bump inbound map + ports map
  |       |     --> calculate port GPM
  |       |
  |       +-- 21: SENT_TROOPS_TO_PLAYER
  |       |     --> bump outbound map
  |       |
  |       +-- 18: SENT_GOLD_TO_PLAYER
  |             --> bump outbound map
```

---

## Reciprocation System

When you receive troops/gold, Hammer can auto-send back:

```
  Donation received (troops or gold)
            |
    +--[ reciprocateEnabled? ]--NO--> (nothing)
            |
           YES
            |
    +--[ reciprocateOnTroops / reciprocateOnGold? ]--NO--> (nothing)
            |
           YES
            |
    +-------+-------+
    |               |
  MANUAL          AUTO
    |               |
    v               v
  Show popup      Add to queue
  with %          (reciprocatePending[])
  buttons              |
    |                  v
  User clicks     processReciprocateQueue()
  "50%"           runs every 1000ms
    |                  |
    v                  v
  handleQuick     Check cooldown (10s per player)
  Reciprocate     Calculate gold = myGold * autoPct%
    |             Send via asSendGold()
    v             Log to reciprocateHistory
  asSendGold()
```

---

## UI Structure

The floating panel is a fixed-position div with 12 tabs:

```
+================================================================+
|  Hammer Control Panel v10.0    [tabs...] [S] [v] [Pause] [x]  |  <-- Header (draggable)
+================================================================+
|                                                                 |
|  Tab Content Area (scrollable)                                  |
|                                                                 |
|  TABS:                                                          |
|  +----------+----------+----------+----------+                  |
|  | Summary  | Stats    | Ports    | Feed     |                  |
|  | Inbound/ | War      | Port     | Live     |                  |
|  | Outbound | report,  | trade    | donation |                  |
|  | totals,  | leaders, | GPM,     | stream   |                  |
|  | per-     | fun      | best     |          |                  |
|  | player   | metrics  | ports    |          |                  |
|  +----------+----------+----------+----------+                  |
|  | GoldRate | Alliances| AutoTroop| AutoGold |                  |
|  | Gold/sec | Teams,   | Config,  | Config,  |                  |
|  | over 30/ | allies,  | targets, | targets, |                  |
|  | 60/120s  | tag      | live     | live     |                  |
|  | windows  | mates    | preview  | preview  |                  |
|  +----------+----------+----------+----------+                  |
|  | Recipro- | Diagnos- | Hotkeys  | About    |                  |
|  | cate     | tics     | ALT+M    | Credits  |                  |
|  | Manual/  | System   | ALT+F    | Feature  |                  |
|  | Auto     | status,  |          | list     |                  |
|  | mode     | scanner  |          |          |                  |
|  +----------+----------+----------+----------+                  |
|                                                                 |
+================================================================+

Renders every 500ms via setInterval --> render()
Each tab is a function that returns HTML string
Event handlers re-attached after each render
```

---

## Player Data Model

How Hammer tracks every player in the game:

```
Player Update (from Worker)
    |
    v
lastPlayers[] -----> playersById (Map: id --> player)
                +--> playersBySmallId (Map: smallID --> player)
                +--> playersByName (Map: lowercase name --> player)

Each player object has:
  {
    id: "uuid-string",
    smallID: 42,              <-- compact integer ID
    clientID: "client-uuid",  <-- only YOUR player has this
    name: "PlayerName",
    displayName: "[TAG]PlayerName",
    troops: 150000,
    gold: 500000n,            <-- BigInt!
    tilesOwned: 1234,
    team: 2,
    allies: [41, 43, 44],
    isAlive: true
  }

Finding "my" player:
  1. Match by clientID (from localStorage or WebSocket join)
  2. Fallback: first alive player
```

---

## Target Selection (ALT+M)

How mouse-over capture works:

```
  User presses ALT+M
        |
        v
  Read lastMouseClient {x, y}     <-- tracked via mousemove listener
        |
        v
  Convert screen coords to world coords:
    worldX = (mouseX - transform.e) / (canvasScale * transform.a)
    worldY = (mouseY - transform.f) / (canvasScale * transform.d)
        |
        v
  Calculate tile reference:
    tileRef = worldY * worldTilesWidth + worldX
        |
        v
  Look up owner:
    ownerSmallID = tileOwnerByRef.get(tileRef)   <-- from packed tile updates
        |
        v
  Look up player:
    player = playersBySmallId.get(ownerSmallID)
        |
        v
  Add player name to:
    S.asTroopsTargets[]
    S.asGoldTargets[]
        |
        v
  Show status overlay: "Added: PlayerName"
```

---

## Lifecycle & Cleanup

```
INITIALIZATION                              CLEANUP (window.__HAMMER__.cleanup())
==============                              ====================================

1. Kill previous instance                   1. Clear all setInterval timers
2. Create Logger module                     2. Remove status overlay
3. Wrap Worker constructor                  3. Remove all event listeners
4. Wrap WebSocket constructor                  (stored in eventCleanup[])
5. Hook canvas (setTransform/drawImage)     4. Restore CanvasRenderingContext2D
6. Add keyboard listeners                      .setTransform and .drawImage
7. Start EventBus discovery                 5. Restore window.Worker
8. Start GameView hook attempts             6. Restore window.WebSocket
9. Start DOM observer                       7. Remove UI panel
10. Build UI panel
11. Start render loop (500ms)
12. Start reciprocate processor (1000ms)
13. Expose window.__HAMMER__ API
```

---

## Module Map (by line regions)

```
Lines     Module                    Purpose
------    ----------------------    --------------------------------
1-67      Header & Docs             Version info, usage, changelog
68-81     Self-Cleanup              Kill previous instance
83-140    Logger                    Ring buffer logging system
142-170   Constants                 Game update types, message types
172-220   Global State              Player maps, session tracking
222-270   Utility Functions         Formatting (short, fmtTime, etc.)
272-310   Status Overlay            Center-screen feedback messages
312-500   Reciprocate Notifications Popup system for manual mode
500-620   Reciprocate Queue         Auto-mode queue processor
622-720   State Object (S)          All configuration & tracking data
720-800   City & Tile Tracking      Max troops calculation
800-1050  Worker Message Handler    Main data ingestion pipeline
1050-1200 Display Message Processor Donation event classification
1200-1350 GameView Hook             DisplayEvent interception
1350-1450 Component Hook            Direct EventsDisplay patching
1450-1550 DOM Observer              Fallback: watch DOM for messages
1550-1650 Canvas Interception       World coordinate tracking
1650-1750 Keyboard Shortcuts        ALT+M, ALT+F handlers
1750-1900 Event Class Discovery     Auto-detect minified class names
1900-2000 Auto-Troops Engine        Troop automation loop
2000-2100 Auto-Gold Engine          Gold automation loop
2100-4300 UI Rendering              All 12 tab view functions
4300-4400 Render Loop & Handlers    Event binding, interval setup
4400-4489 Cleanup & API Export      window.__HAMMER__ definition
```

---

## Prompt for Image Generation

If you want to turn any of the diagrams above into a polished graphic, give an image generation AI (Midjourney, DALL-E, etc.) a prompt like:

> **"Technical architecture diagram for a browser-based game automation tool. Dark theme with navy blue (#0b1220) background. Show three interception layers (Worker, WebSocket, Canvas) feeding into a central state engine, which connects to an automation engine (auto-troops, auto-gold, reciprocate) and a floating UI panel with 12 tabs. Use glowing green (#7ff2a3) accent lines for data flow, gold (#ffcf5d) for gold-related paths, and blue (#7bb8ff) for troop-related paths. Monospace font labels. Clean, minimal, engineer-style diagram. No photorealism."**

For a **flowchart-style** image of the auto-send loop:

> **"Flowchart diagram showing an automation loop: Timer fires every 800ms -> Check if running -> Resolve targets -> Read player resources -> Check threshold -> Calculate send amount -> For each target: check alliance, check cooldown, send via EventBus or WebSocket fallback -> Log result. Dark theme, neon green flow lines on dark navy background, rounded boxes, monospace labels."**
