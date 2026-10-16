# Hammer Terminal

Automation and intelligence companion for [OpenFront.io](https://openfront.io).

Hammer Terminal is a Chrome extension that hooks into the OpenFront game client to provide an attack-ratio governor, automated resource sharing, donation tracking, alliance intelligence, and paced diplomacy tools — from an in-game overlay or a detachable dashboard window. It loads silently: nothing appears on the game screen until you ask for it.

Built against OpenFront **v0.35**.

## Install (no build needed)

Works in Chrome (and Chromium browsers such as Edge or Brave) on Mac, Windows, and Linux.

1. Download the latest `hammer-openfront-extension-<version>-chrome.zip` from [Releases](https://github.com/ST215/hammerterm/releases).
2. Unzip it somewhere permanent (Chrome loads the extension from that folder — don't delete it).
3. Open `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`).
5. Refresh any open OpenFront tab.

**Updating:** unzip the new release over the old folder (or into a new one and load that), click the reload arrow on Hammer's card in `chrome://extensions`, then refresh the game tab. If the toolbar popup says **needs refresh**, click **Reload tab**.

## Controls

| Control | What it does |
|---|---|
| Toolbar icon | Control center: show the in-game panel (Analytics / Controls / Hide), launch or close the external window, reset views |
| **Alt+Shift+H** | Toggle the external dashboard window (set or change it at `chrome://extensions/shortcuts`) |
| **Alt+G** | Toggle the attack governor — e.g. to land a counter-attack it's holding |
| **Alt+F** | Toggle Auto Troops / Auto Gold |
| **Alt+M** | Set the player under your cursor as the auto-send target |

## Features

- **Attack Ratio governor** — you still choose where and when to attack; the governor decides how many troops each attack takes.
  - **Peak 42%** — each attack sends only your surplus above 42% of max troops, the level where troops regrow fastest. At or below 42%, attacks are held until you regen.
  - **Hold %** — the same at a level you choose. **Fixed %** — a fixed share per attack with a "never drop below" floor. **Watch** — numbers only.
  - Reads your true max troops from the game (cities included) and counts troops already sent but not yet confirmed by the server, so rapid clicking can't overspend.
  - Stays in standby each match until your troops first reach the target, so early expansion is untouched. Remembers its settings and on/off state across matches. Nothing is sent to the server — it only shapes your own attacks.
- **Auto Troops / Auto Gold** — send to teammates or allies on a cooldown, by ratio or Palantir (surplus above the regen peak), with thresholds.
- **Reciprocate** — return resources when you receive donations (cross-resource: gold in, troops back), including **Palantir mode** (sacrifice-aware) and optional thank-you sends. Auto modes reset to off each match.
- **Comms** — emoji and every OpenFront quick-chat phrase, to one player or many. Multi-player sends are paced: a 0.3s–20s slider plus **Humanize** (randomized gaps, delayed first send, occasional long pause); presets Instant / Quick / Brisk / Human.
- **Alliances** — teammates vs allies, multi-select alliance requests and betrayals (paced).
- **Status strip** — a one-line footer on every tab: estimated intents used against the server's 150/minute limit (attack clicks count too), plus any paced send in progress with time left and cancel.
- **Hammer view** — at a glance: troop capacity and peak-regen cue, donations received and top supporters, quick governor controls.
- **Trading / Summary** — inbound and outbound donation history, totals, port income.
- **CIA** — server-wide transfer intelligence, betrayal alerts, leaderboard.
- **Broadcast** — timed emoji sequences.
- **Pop-ups** — donation alerts ("X sent you troops/gold") are on by default and work on their own; every other pop-up (reciprocate, status, growth HUD, outbound toasts) is off until you enable it in **Settings**, which also has per-pop-up position, scale, and a Test button.
- **Silent by default** — the overlay loads hidden. Open it from the toolbar icon, or use the external window on a second monitor; the external window keeps working across matches and reconnects on its own when the game page reloads.
- **Replay support** — replays are auto-detected: automation pauses, data is still ingested.
- **Match Export / Replay Viewer / Flight Recorder** — see below.

Every game action goes through the game's own event system (never raw network messages) and a shared rate limiter that stays under OpenFront's server limits (10/s, 150/min).

## Build from source

```bash
cd hammer-openfront-extension
npm install
npm run build        # production build → .output/chrome-mv3/
npm run zip          # build + package the release zip
npm run dev          # HMR dev mode
npm test             # Vitest suite
npm run typecheck    # tsc --noEmit
```

Then load `.output/chrome-mv3/` with **Load unpacked** as above.

### Testing

- `npm test` — full Vitest suite (580+ tests). The `.todo()` tests need real browser/game APIs.
- `npm run typecheck` — a handful of WXT auto-import errors (`defineBackground`, `defineContentScript`, `createShadowRootUi`) and three known test-file type nits are expected; everything else should be clean.
- **Game-contract tests** (`tests/game-contract.test.ts`) check the extension against a sibling clone of the game (`../OpenFrontIO`): event-class shapes, update indices, packed stat layout, donation events, the quick-chat catalog, the binary-only wire, and the troop formulas the governor relies on. They fail loudly when OpenFront changes something the extension depends on.
- **Governor simulation** (`tests/attack-governor.test.ts`) replays spam-clicking against the game's regen formula at 1–12 tick latencies and asserts troops hold the 42% target.

## Architecture

```
MAIN world (entrypoints/hooks.content.ts) — runs beside the game
  |  Wraps Worker (player stats), patches GameView (donations, display events),
  |  wraps the EventBus: sends via the game's own event classes, and runs the
  |  ATTACK GOVERNOR on every attack the player fires
  |  Posts data via window.postMessage
  v
ISOLATED world (src/content/bridge.ts) — the game tab's content script
  |  Routes messages to the Zustand store (the source of truth)
  |  Automation runtime: auto-troops, auto-gold, broadcast, reciprocate loops
  |  run HERE only, whichever window toggled them
  v
React UI (src/ui/)
  |  Overlay (shadow DOM on the game page) — inGameView: hidden | disguised | revealed
  |  Dashboard (external window), Popup (toolbar control center)
  v
Dashboard sync (chrome.runtime.Port)
     Game tab → window: snapshots every 500ms; the window adopts game-owned settings
     Window → game tab: edits pushed immediately ("sync-local"); intents re-queued
     through the game tab's rate limiter
```

Every match ends with the game page reloading, so the MAIN-world hooks reinstall each match and the external window reconnects automatically.

### Directory structure

```
hammer-openfront-extension/
  entrypoints/
    hooks.content.ts         # MAIN world: hooks, sends, attack governor
    openfront.content/       # ISOLATED world entry (bridge, runtime, overlay)
    background.ts            # Service worker: window/tab mgmt, config storage, hotkey
    dashboard/               # External window app
    popup/                   # Toolbar control center
  src/
    content/
      bridge.ts              # MAIN → store router, dashboard port
      automation/            # runtime.ts (loop owner), auto-troops, auto-gold,
                             # broadcast, reciprocate-engine, attack-ratio (config sync)
      game/                  # send.ts (rate limiter, pacer), message-processor, keyboard
    store/slices/            # Zustand slices
    ui/                      # components/ (App, Panel, StatusStrip, ds/), views/
    shared/
      logic/                 # Pure logic: attack-governor, pace, troop-math, cia, ...
      dashboard-sync.ts      # Which keys sync between window and game tab
      quick-chat.ts          # Quick-chat catalog (must match the game's QuickChat.json)
      schemas.ts             # Persisted settings schema
  tests/                     # Vitest
hammer-replay-viewer/        # Standalone match-data viewer (no build step)
hammer-scripts/              # Legacy single-file console script (v10.x, superseded)
```

### Key concepts

**Settings sync** — Keys the user edits are listed in `LOCAL_KEYS` (`src/shared/dashboard-sync.ts`). Edits in the external window push to the game tab immediately; the window adopts the game tab's values from snapshots except for window-only keys (current tab, size, in-progress selections) and anything edited in the last 2s. If you add a user setting, add it to `LOCAL_KEYS` — and to `PersistedStateSchema` (`src/shared/schemas.ts`) if it should survive a reload. Toggles that make the extension *send* things (auto-troops, auto-gold, broadcast, reciprocate auto) are deliberately not persisted and reset every match.

**Units** — the game stores troops at 10× what it displays; convert with `dTroops()` for anything user-facing.

**Ally vs teammate** — teammates share a team; allies are alliance partners. Betrayal alerts only fire for teammates.

**Cross-resource reciprocation** — receive gold, send troops back (and vice versa). Intentional.

## Match Export & Replay Viewer

**Export Match Data** (Help tab) saves all trading/economy data as JSON; **Export & View** opens it in the bundled viewer. The standalone viewer (`hammer-replay-viewer/index.html`) also accepts a dropped JSON file: per-player POV, donor/recipient leaderboards, activity timeline, net balances, transfer flows, and suspicious-pattern detection.

## Flight Recorder

Toggle **REC** in the panel header (or the Recorder tab) to capture automation decisions, message processing, hook discovery, and errors as structured events (`{t, cat, evt, d}`), then export the JSON for debugging. Useful metrics: `displayEventsReceived` / `displayEventsProcessed` (both should climb), `playerUpdatesApplied` far below `playerUpdatesReceived` (throttle working), `intentsBlockedReplay` (0 in live games).

## License

Private project.
