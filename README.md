# Hammer Terminal

Automation and intelligence companion for [OpenFront.io](https://openfront.io).

Hammer Terminal is a Chrome Extension that hooks into the OpenFront game client to provide automated resource management, alliance intelligence, donation tracking, and diplomatic tools — all from an in-game overlay or a detachable dashboard window.

## Origin

This project started as `hammer-scripts/hammer.js`, a single-file console injection script (v10.x). The extension supersedes it with a proper Chrome Extension architecture, React UI, and persistent state. The legacy script and its architecture docs remain in `hammer-scripts/` for reference.

## Features

- **Auto Troops** — automatically send troops to teammates/allies above a configurable threshold
- **Auto Gold** — distribute gold to teammates on a timed interval
- **Reciprocate** — automatically return resources when you receive donations (cross-resource: gold in, troops back). Includes **Palantir mode** — sacrifice-aware smart reciprocation that weighs donor sacrifice ratio, loyalty, team relationship, and your power phase
- **Trading View** — consolidated tab showing inbound/outbound donation history with cumulative stats and running totals
- **CIA** — real-time threat intelligence tracking all server-wide transfers, betrayal alerts, leaderboard
- **Comms** — send emoji sequences and coordinate with allies; search players by name
- **Alliances** — view teammates vs allies, manage diplomacy, search and filter players
- **Broadcast** — timed emoji sequence broadcaster with configurable sequences and cadence
- **Donation Toasts** — enriched popups when you receive resources: donor history, cumulative totals, ordinal count (1st/2nd/3rd gift)
- **Notification Position Pickers** — independently position the ReciprocatePopup and DonationToast in any of 7 screen zones (TL, TC, TR, C, BL, BC, BR) via 3×3 grid selector
- **StatusToast** — configurable center-screen flash for action confirmations; scale slider + test button in Help tab
- **Dashboard Window** — detach the panel into a full browser window alongside the game; toggle back to overlay seamlessly
- **Match Export** — export all trading/economy data (CIA transfers, flow graph, player totals, donation feeds) as structured JSON for offline analysis
- **Replay Viewer** — standalone static HTML app (`hammer-replay-viewer/index.html`) for visualizing exported match data: flow charts, leaderboards, timeline, net balance table, and suspicious pattern detection
- **Flight Recorder** — structured event logger for diagnostics, exportable as JSON

## Tech Stack

- [WXT](https://wxt.dev/) — Chrome Extension framework (Manifest V3)
- React 18 — UI components
- Zustand — state management
- Tailwind CSS v4 — styling (JetBrains Mono, pixel-based theme)
- TypeScript — everything is typed
- Vitest — unit tests (380+ tests)

## Getting Started

```bash
cd hammer-openfront-extension
npm install
```

### Development

```bash
npm run dev          # HMR dev mode, auto-reloads extension
npm run build        # Production build
npm run zip          # Build + package as .zip
npm test             # Run all tests (vitest run)
npm run test:watch   # Watch mode (vitest)
npm run typecheck    # tsc --noEmit
```

### Loading in Chrome

1. Run `npm run build` (or `npm run dev` for development)
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select `.output/chrome-mv3`

## Architecture

```
MAIN world (hooks.content.ts)
  |  Intercepts Worker, WebSocket, Canvas, GameView, EventBus
  |  Posts data via window.postMessage
  v
ISOLATED world (content/bridge.ts)
  |  Routes messages to Zustand store
  |  Runs automation engines (auto-troops, auto-gold, reciprocate)
  v
Zustand Store (store/index.ts)
  |  Slices: ui, player, donations, auto-troops, auto-gold,
  |          reciprocate, comms, cia, donation-toasts, recorder
  v
React UI (ui/)
  |  Overlay (shadow DOM on game page)
  |  Dashboard (detached window via background service worker)
  v
Dashboard Sync (chrome.runtime.Port)
     Game tab <-> Dashboard window, 500ms snapshots
     LOCAL_KEYS pattern prevents clobbering user interactions
```

## Directory Structure

```
hammer-openfront-extension/
  entrypoints/
    hooks.content.ts       # MAIN world injection (Worker/WS/Canvas hooks)
    content.ts             # ISOLATED world entry (bridge + automation)
    background.ts          # Service worker (tab mgmt, config persistence)
    dashboard/             # Detached dashboard window (React app)
  src/
    content/
      bridge.ts            # Message router (MAIN -> store)
      automation/          # reciprocate-engine, auto-troops, auto-gold, broadcast
      game/                # send.ts (game commands), message-processor.ts
    store/
      index.ts             # Combined Zustand store
      slices/              # Slice files (ui, player, donations, etc.)
    ui/
      components/          # App, TabBar, HeaderButtons, design system (ds/)
      views/               # SummaryView, CIAView, TradingView, BroadcastView, etc.
    shared/
      constants.ts         # Message types, intervals, limits
      types.ts             # PlayerData, shared interfaces
      logic/               # Pure functions (cia.ts, player-helpers.ts)
      serialize.ts         # Store serialization for dashboard sync
      notif-position.ts    # Notification position types + CSS helpers
    recorder.ts            # Flight recorder (standalone, no store dependency)
  tests/                   # Vitest test files
hammer-replay-viewer/
  index.html               # Static match data visualization app (no build step)
```

## Replay Viewer

Export match data from the **Help** tab ("Export Match Data" button), then open `hammer-replay-viewer/index.html` in any browser and drop the JSON file.

Features:
- **Player selector** — anyone can pick any player's POV from the dropdown (not just the original player)
- **Overview cards** — total transfers, gold/troops moved, partner count
- **Donor/Recipient leaderboards** — horizontal bar charts (Chart.js)
- **Timeline** — gold + troops activity bucketed by minute
- **Net balance table** — per-partner gave/received/net breakdown
- **Flow table** — all player→player transfer pairs from the flow graph
- **Suspicious patterns** — feeder alerts (>5M gold to single target) and resource sink detection, always global

## Flight Recorder

Toggle recording from the header **REC** button or the Recorder tab. While recording, all automation decisions, message processing, hook discovery, and errors are captured as structured events.

Export as JSON and share recordings for offline analysis and debugging. Events are structured as `{t, cat, evt, d}` with millisecond timestamps relative to recording start.

Categories: `hook`, `bridge`, `msg`, `recip`, `auto-t`, `auto-g`, `cmd`, `error`

## Key Concepts

**LOCAL_KEYS** — Store keys that represent user-interactive state (toggles, percentages, mode selections, position preferences). The dashboard never overwrites these from game tab snapshots. If you add a new user setting, add it to `LOCAL_KEYS` in `entrypoints/dashboard/App.tsx`.

**Ally vs Teammate** — Teammates share a team (`player.team === myTeam`). Allies are alliance partners (`myAllies.has(player.smallID)`). `asIsAlly()` returns true for both. Betrayal alerts only fire for teammates.

**Cross-resource reciprocation** — When you receive gold, Hammer sends troops back (and vice versa). This is intentional design, not a bug.

**Dashboard sync** — The game tab content script pushes full store snapshots to the dashboard every 500ms via `chrome.runtime.Port`. LOCAL_KEYS are excluded from incoming patches. The dashboard pushes LOCAL_KEYS changes back to the game tab via `sync-local` messages.

## License

Private project.
