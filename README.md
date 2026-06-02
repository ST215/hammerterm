# Hammer Terminal

Automation and intelligence companion for [OpenFront.io](https://openfront.io).

Hammer Terminal is a Chrome Extension that hooks into the OpenFront game client to provide automated resource management, alliance intelligence, donation tracking, and diplomatic tools — all from an in-game overlay or a detachable dashboard window.

## Origin

This project started as `hammer-scripts/hammer.js`, a single-file console injection script (v10.x). The extension supersedes it with a proper Chrome Extension architecture, React UI, and persistent state. The legacy script and its architecture docs remain in `hammer-scripts/` for reference.

## Features

- **Auto Troops** — automatically send troops to teammates/allies above a configurable threshold
- **Auto Gold** — distribute gold to teammates on a timed interval
- **Attack Ratio** — governor for the game's attack-ratio slider: fixed %, breakeven (hold troops steady), or peak-regen, with a safety floor and cap and live telemetry
- **Reciprocate** — automatically return resources when you receive donations (cross-resource: gold in, troops back). Includes **Palantir mode** — sacrifice-aware smart reciprocation that weighs donor sacrifice ratio, loyalty, team relationship, and your power phase. **Thank-you sends**: optionally fire a ❤️ heart or "thanks" quickchat to any donor (auto toggle or manual button), independent of send-back and working in every mode. Auto-send modes reset to off each match (values remembered) so nothing carries into a new game unexpectedly
- **Trading View** — consolidated tab showing inbound/outbound donation history with cumulative stats and running totals
- **CIA** — real-time threat intelligence tracking all server-wide transfers, betrayal alerts, leaderboard
- **Comms** — send emoji sequences and coordinate with allies; search players by name
- **Alliances** — view teammates vs allies, manage diplomacy, search and filter players
- **Broadcast** — timed emoji sequence broadcaster with configurable sequences and cadence
- **Donation Toasts** — enriched popups when you receive resources: donor history, cumulative totals, ordinal count (1st/2nd/3rd gift)
- **Settings tab** — one place to configure all four popups (Reciprocate, Donation Toast, Status Toast, Growth HUD): master on/off switch, per-popup enable toggle, 3×3 position picker, scale slider, and a **Test** button to preview each before going live
- **Popups in any view mode** — notifications render on the game screen whether the panel is showing the analytics card, the full controls, or hidden entirely
- **Replay support** — Hammer auto-detects match replays: throttles hard so the fast-forwarded playback doesn't lag, pauses all automation, and still ingests data. Load a replay you weren't even in (a friend's match) to pull its analytics
- **In-game view modes** — the overlay defaults to an innocuous "match analytics" card (stream-safe), expands to full controls on demand, or hides entirely; the extension toolbar icon is the master control center for switching and recovery
- **Dashboard Window** — detach the panel into a full browser window alongside the game for a second monitor; the in-game overlay hides while it drives, and returns when you close it
- **Match Export** — export all trading/economy data (CIA transfers, flow graph, player totals, donation feeds) as structured JSON for offline analysis
- **Replay Viewer** — visualize exported match data: flow charts, leaderboards, timeline, net balance table, and suspicious pattern detection. **Export & View** opens it bundled in the extension with your data already loaded; it also ships standalone (`hammer-replay-viewer/index.html`) for file-drop use
- **Flight Recorder** — structured event logger for diagnostics, exportable as JSON

## Tech Stack

- [WXT](https://wxt.dev/) — Chrome Extension framework (Manifest V3)
- React 18 — UI components
- Zustand — state management
- Tailwind CSS v4 — styling (JetBrains Mono, pixel-based theme)
- TypeScript — everything is typed
- Vitest — unit tests (446+ tests)

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

### Testing

- `npm test` — full Vitest suite (446+ tests). Should be green except the DOM-dependent `.todo()` tests (they require real browser/game APIs).
- `npm run typecheck` — `tsc --noEmit`. A handful of WXT auto-import errors (`defineBackground`, `defineContentScript`, `createShadowRootUi`) are expected and harmless; everything else should be clean.
- **Game-contract tests** (`tests/game-contract.test.ts`) validate the extension's hardcoded constants (intent types, emoji table, quick-chat keys, `GameUpdateType` indices) against the cloned `OpenFrontIO` repo — they catch protocol drift when OpenFront updates.
- **Live / manual verification** is still required for anything that touches the DOM, hooks, view modes, or replays — use the Flight Recorder route below.

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
  |  Overlay (shadow DOM on game page) — inGameView: disguised | revealed | hidden
  |  Dashboard (detached window via background service worker)
  |  Popup (toolbar icon) — master control center
  v
Dashboard Sync (chrome.runtime.Port)
     Game tab <-> Dashboard window, 500ms snapshots
     LOCAL_KEYS pattern prevents clobbering user interactions
```

### View modes & control

The in-game overlay has one canonical presentation state, `inGameView`:

- **disguised** (default) — an innocuous "match analytics" card with Reveal / Launch / Hide buttons. Stream-safe.
- **revealed** — the full Hammer terminal (tab bar + active view).
- **hidden** — nothing on the game page except popups.

The background service worker owns the external window's lifecycle and is the single source of truth for `externalOpen` (invariant: external open ⇒ in-game hidden; closing it restores the disguised card). The **extension toolbar icon** is the always-available control center — switch view modes, launch/focus/close the external window, and **Reset views** to recover any stuck state.

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

### Recording test route (not yet verified end-to-end)

> ⚠️ **Untested:** this capture → export → inspect loop hasn't been validated on the current build. Use it to confirm the v15.15–15.17 changes behave live, and report findings back. Tracked in `ROADMAP.md`.

1. Build (`npm run build`) and load `.output/chrome-mv3/` unpacked in Chrome.
2. Open OpenFront, start (or join) a match — singleplayer team mode is fastest.
3. Click **REC** in the panel header (or the Recorder tab) to start recording.
4. Exercise the things you want to verify, then **Export** the recording (downloads `hammer-recording-<timestamp>.json`).
5. Inspect the JSON for the metrics that prove the recent work:
   - `displayEventsReceived` vs `displayEventsProcessed` — both should climb (processed > 0). This is the old "0 processed" bug check.
   - `playerUpdatesReceived` / `playerUpdatesApplied` / `playerUpdatesThrottled` — applied should be far below received during normal play (throttle working).
   - `intentsBlockedReplay` — should be 0 in a live game, and > 0 if you load a replay with automation on.
6. **Replay checks:** load a match replay and confirm the tool stays responsive, `hook/replay {isReplay:true}` appears, and (for a replay you weren't in) CIA/Summary still populate.

The exported JSON can also be dropped into `hammer-replay-viewer/index.html` if it's a match-data export (see above) — note the flight recording and the match-data export are two different files.

## Key Concepts

**LOCAL_KEYS** — Store keys that represent user-interactive state (toggles, percentages, mode selections, position preferences, `inGameView`/`externalOpen`). The dashboard never overwrites these from game tab snapshots. If you add a new user setting, add it to `LOCAL_KEYS` in `entrypoints/dashboard/App.tsx` — and, if it should survive a refresh, to `PersistedStateSchema` in `src/shared/schemas.ts` (config only; presentation and live automation toggles are deliberately not persisted).

**Ally vs Teammate** — Teammates share a team (`player.team === myTeam`). Allies are alliance partners (`myAllies.has(player.smallID)`). `asIsAlly()` returns true for both. Betrayal alerts only fire for teammates.

**Cross-resource reciprocation** — When you receive gold, Hammer sends troops back (and vice versa). This is intentional design, not a bug.

**Dashboard sync** — The game tab content script pushes full store snapshots to the dashboard every 500ms via `chrome.runtime.Port`. LOCAL_KEYS are excluded from incoming patches. The dashboard pushes LOCAL_KEYS changes back to the game tab via `sync-local` messages.

## License

Private project.
