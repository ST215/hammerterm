# Project Rules

## Quick Start for AI Agents
- **Working directory**: `cd hammer-openfront-extension` before any npm commands
- **Install**: `npm install`
- **Build**: `npm run build` (production) or `npm run dev` (HMR)
- **Test**: `npm test` (380+ tests, all should pass)
- **Typecheck**: `npm run typecheck`
- **Key entry points to read first**: `src/store/index.ts` (store shape), `src/content/bridge.ts` (data flow), `entrypoints/hooks.content.ts` (game hooks)
- **Path aliases**: `@shared` = `src/shared`, `@content` = `src/content`, `@ui` = `src/ui`, `@store` = `src/store`

## Project Structure
- `hammer-scripts/hammer.js` — legacy single-file browser console injection (v10.x).
- `hammer-scripts/HAMMER_ARCHITECTURE.md` — architecture guide for the legacy script.
- `hammer-openfront-extension/` — Chrome Extension (WXT + React + Zustand + Tailwind v4). This is the active codebase.

## Extension Architecture
- **MAIN world** (`entrypoints/hooks.content.ts`): Intercepts Worker, WebSocket, Canvas, GameView, EventBus. Emits data via `window.postMessage`.
- **ISOLATED world** (`src/content/bridge.ts`): Receives MAIN world data, updates Zustand store, handles dashboard port sync.
- **Background** (`entrypoints/background.ts`): Service worker for tab management, dashboard window, config persistence.
- **Dashboard** (`entrypoints/dashboard/`): Separate window that syncs state from the game tab's content script.
- **Store** (`src/store/`): Zustand with 10 slices (ui, player, donations, auto-troops, auto-gold, reciprocate, comms, cia, donation-toasts, recorder).
- **Automation** (`src/content/automation/`): reciprocate-engine, auto-troops, auto-gold — all run in ISOLATED world.
- **Flight Recorder** (`src/recorder.ts`): Toggleable structured event logger. Records automation decisions, message flow, hook status. Export as JSON for diagnostics.

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

## Ally vs Teammate Distinction
- **Teammates** = same-team players (`player.team === myTeam`). Retrieved via `getTeammates()`.
- **Allies** = alliance partners (`myAllies.has(player.smallID)`). Retrieved via `getAllies()`.
- `asIsAlly(id)` returns true for BOTH teammates AND allies. Use team check directly when you need teammate-only logic.
- Allies naturally interact with opponents — betrayal alerts should only fire for teammates feeding enemies.

## Extension UI Rules
- UI uses React components with Tailwind v4 classes. Views are in `src/ui/views/`, components in `src/ui/components/`.
- View switching via `VIEW_MAP` in `App.tsx` + `TABS` in `TabBar.tsx`.
- Design system components in `src/ui/components/ds/` (Badge, DataRow, Section, StatCard, etc.).
- Overlay mode renders in shadow DOM on game page. Window mode renders in dashboard popup.
- `LOCAL_KEYS` in `entrypoints/dashboard/App.tsx` controls which store keys are user-interactive (not overwritten by game tab snapshots). Any new user-configurable setting must be added here.

## Dashboard Sync
- Game tab content script syncs store snapshots to dashboard every 500ms via `chrome.runtime.Port`.
- Dashboard filters out `LOCAL_KEYS` from incoming snapshots to prevent clobbering user interactions.
- Dashboard pushes `LOCAL_KEYS` changes back to content script via `sync-local` port message.
- Both directions must stay in sync — if you add a new user-configurable setting, add it to `LOCAL_KEYS`.
