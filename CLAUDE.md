CLAUDE.md

Behavioral guidelines to reduce common coding mistakes. Project-specific instructions live at the bottom.

**Tradeoff:** These bias toward caution over speed. Use judgment on trivial tasks.

## 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Test: "Would a senior engineer call this overcomplicated?" If yes, simplify.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that _your_ changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the request.

## 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan before executing:

[Step] → verify: [check]
[Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Project Context

<!-- Fill in per repo -->

- **Stack:**
- **Run / test / lint:**
- **Conventions:**
- **Out of scope:**

---

_Working if: fewer unnecessary changes in diffs, fewer rewrites from overcomplication, clarifying questions come before implementation rather than after mistakes._

# Project Rules

## Quick Start for AI Agents

- **Working directory**: `cd hammer-openfront-extension` before any npm commands
- **Install**: `npm install`
- **Build**: `npm run build` (production) or `npm run dev` (HMR)
- **Test**: `npm test` (476+ tests, all should pass including game-contract tests via OpenFrontIO)
- **Typecheck**: `npm run typecheck` (some pre-existing WXT auto-import errors are expected)
- **Key entry points to read first**: `src/store/index.ts` (store shape), `src/content/bridge.ts` (data flow), `entrypoints/hooks.content.ts` (game hooks)
- **Path aliases**: `@shared` = `src/shared`, `@content` = `src/content`, `@ui` = `src/ui`, `@store` = `src/store`
- **OpenFrontIO game repo**: Cloned at `hammerterm/OpenFrontIO`. Needed for game-contract tests.

## Project Structure

- `hammer-scripts/hammer.js` — legacy single-file browser console injection (v10.x). Not actively maintained.
- `hammer-openfront-extension/` — Chrome Extension (WXT + React + Zustand + Tailwind v4). This is the active codebase.

## Extension Architecture

- **MAIN world** (`entrypoints/hooks.content.ts`): Intercepts Worker, WebSocket, Canvas, GameView, EventBus. Emits data via `window.postMessage`.
- **ISOLATED world** (`src/content/bridge.ts`): Receives MAIN world data, updates Zustand store, handles dashboard port sync.
- **Background** (`entrypoints/background.ts`): Service worker for tab management, dashboard window, config persistence.
- **Dashboard** (`entrypoints/dashboard/`): Separate window that syncs state from the game tab's content script.
- **Store** (`src/store/`): Zustand with 12 slices (ui, player, donations, auto-troops, auto-gold, reciprocate, comms, cia, donation-toasts, recorder, broadcast, attack-ratio).
- **Automation** (`src/content/automation/`): reciprocate-engine, auto-troops, auto-gold, broadcast, attack-ratio — all run in ISOLATED world. (attack-ratio governs the game's attack-ratio slider via a client-side `uiState.attackRatio` write — no server intent; reads a live troop scalar from worker-hook for fast floor protection.)
- **Flight Recorder** (`src/recorder.ts`): Toggleable structured event logger. Records automation decisions, message flow, hook status. Export as JSON for diagnostics.
- **Global Intent Rate Limiter** (`src/content/game/send.ts`): All game actions queue through a central limiter (8/sec, 120/min) to stay under OpenFront server limits (10/sec, 150/min).

## OpenFront Game Context

- **Singleplayer team mode** behaves exactly like multiplayer team mode — used for testing because it's faster to start
- In singleplayer/team mode: `game-view` element is `null`, but `events-display.game` contains all game data
- Key paths in singleplayer mode:
  - `events-display.game._myClientID` — the client ID
  - `events-display.game._players` — player data (Map)
  - `events-display.game._myPlayer` — our player object
  - `events-display.game.worker` — the Worker
  - `events-display.eventBus` — the EventBus for emitting events
- In multiplayer mode: `game-view.clientGameRunner` contains the game data

## OpenFront Server Rate Limits

- **10 intents/second** per client (Hammer caps at 8 to leave headroom)
- **150 intents/minute** per client (Hammer caps at 120)
- **500 bytes max** per intent
- **2MB cumulative** per session — exceeding this kicks the client
- Invalid messages (bad JSON, missing fields) = instant kick
- Intent types: `spawn`, `attack`, `boat`, `allianceRequest`, `allianceReject`, `breakAlliance`, `targetPlayer`, `emoji`, `donate_gold`, `donate_troops`, `build_unit`, `embargo`, `embargo_all`, `move_warship`, `upgrade_structure`, `delete_unit`, `quick_chat`, `allianceExtension`, `toggle_pause`

## Troop Display Units

- Game internally stores troops at **10× display value** (`TROOP_DISPLAY_DIV = 10`)
- `dTroops(v)` converts internal → display. Use it for ALL user-facing troop amounts.
- `estimateMaxTroops()` returns **internal** units. Divide by `TROOP_DISPLAY_DIV` for display.
- When logging/toasting auto-troops sends: the game expects internal units for the actual send, but log/toast amounts must be converted via `dTroops()`.

## Ally vs Teammate Distinction

- **Teammates** = same-team players (`player.team === myTeam`). Retrieved via `getTeammates()`.
- **Allies** = alliance partners (`myAllies.has(player.smallID)`). Retrieved via `getAllies()`.
- `asIsAlly(id)` returns true for BOTH teammates AND allies. Use team check directly when you need teammate-only logic.
- Allies naturally interact with opponents — betrayal alerts should only fire for teammates feeding enemies.
- Transport ship sends auto-reject incoming alliance requests from the target (OpenFront v0.30+).

## Extension UI Rules

- UI uses React components with Tailwind v4 classes. Views are in `src/ui/views/`, components in `src/ui/components/`.
- View switching via `VIEW_MAP` in `App.tsx` + `TABS` in `TabBar.tsx`.
- Tab names: "Troop MGMT", "Gold MGMT" (not "AutoTroops"/"AutoGold"), "Attack Ratio".
- Design system components in `src/ui/components/ds/` (Badge, DataRow, Section, StatCard, etc.).
- Overlay mode renders in shadow DOM on game page. Window mode renders in dashboard popup.
- `LOCAL_KEYS` in `entrypoints/dashboard/App.tsx` controls which store keys are user-interactive (not overwritten by game tab snapshots). Any new user-configurable setting must be added here.

## Preventing UI Blink (CRITICAL)

- **NEVER subscribe directly to `playersById` or `lastPlayers`** in UI components. Always use hooks from `src/ui/hooks/usePlayerHelpers.ts`.
- Available hooks: `useMyPlayer()`, `useTeammates()`, `useAllies()`, `useAllAlivePlayers()`, `usePlayersById()`. All use structural-only equality to prevent re-renders from volatile stat updates (troops/gold/tiles ticking every second).
- **Stats throttle**: `bridge.ts` classifies player changes as structural (instant) vs volatile stats (1s throttle). `troops`, `gold`, and `tilesOwned` are volatile. `isAlive`, `team`, `name`, `clientID` are structural.
- **Dashboard snapshot diff**: `sendSnapshot()` skips port messages when state JSON is identical to last sent.
- **Panel resize**: Uses `borderBoxSize` from ResizeObserver, not `contentRect` (which excludes borders and causes collapse loops).
- If you need the full `playersById` Map for lookups, use `usePlayersById()` — it returns the same reference unless structural changes occurred.

## Dashboard Sync

- Game tab content script syncs store snapshots to dashboard every 500ms via `chrome.runtime.Port`.
- Snapshots are diffed — skipped when state hasn't changed.
- Dashboard filters out `LOCAL_KEYS` from incoming snapshots to prevent clobbering user interactions.
- Dashboard pushes `LOCAL_KEYS` changes back to content script via `sync-local` port message.
- Both directions must stay in sync — if you add a new user-configurable setting, add it to `LOCAL_KEYS`.

## Versioning

- **Bump the version on every commit** that changes behavior (features, fixes, UI changes). Use semver: major.minor.patch.
- Version lives in 5 places — but only `package.json` needs manual bumping. The other 4 embed a `-ext` suffix:
  - `package.json` → `"version": "X.Y.Z"` (source of truth, also imported by HelpView for the About page)
  - `entrypoints/background.ts` → `"X.Y.Z-ext"`
  - `entrypoints/hooks.content.ts` → `"X.Y.Z-ext"`
  - `entrypoints/openfront.content/index.tsx` → `"X.Y.Z-ext"`
  - `src/recorder.ts` → `"X.Y.Z-ext"`
- The Help/About page reads the version from `package.json` at build time — no hardcoded string to update.
- Tag releases with `vX.Y.Z` and push tags.

## Build Output

- Extension builds to `hammer-openfront-extension/.output/chrome-mv3/` (NOT `hammerterm/.output/`).
- Load in Chrome via `chrome://extensions` → "Load unpacked" → navigate to the full `.output/chrome-mv3/` path.
