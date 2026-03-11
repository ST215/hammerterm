# Changelog

All notable changes to Hammer Control Panel will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [15.0.0] - 2026-03-11 "Full Dashboard + Match Replay"

### Added

- **Dashboard Window** — detach the Hammer overlay into a standalone browser window. The overlay stays visible on the game page simultaneously. Header toggle switches between modes seamlessly; dashboard initializes to correct mode without momentarily hiding the panel.
- **Trading View** — new dedicated tab for donation history: inbound/outbound feeds with cumulative gold/troops totals and running stats per session.
- **Broadcast** — timed emoji broadcaster. Configure a sequence (or single emoji), set a cadence, toggle on/off. Broadcasts to all alliance targets in sequence.
- **Player search** — Comms, Alliances, and Trading views all have a live search/filter field to find players by name.
- **Alliance Request UI** — bot/human filtering in the Alliances tab; send alliance requests to filtered sets of players.
- **Notification position pickers** — independently reposition ReciprocatePopup and DonationToast to any of 7 screen zones (top-left, top-center, top-right, center, bottom-left, bottom-center, bottom-right) via 3×3 grid selector in the Help tab.
- **StatusToast scale + test** — center-screen flash popup now has a scale slider (0.5–2.5) and a "Test" button in the Help tab. StatusToast now mounts in dashboard window mode so test button works there too.
- **DonationToast enrichment** — donation popups now show cumulative history per donor: ordinal count (1st/2nd/3rd gift), running gold/troops totals, per-session history list.
- **Separate toast scale sliders** — ReciprocatePopup scale and DonationToast scale are independently configurable.
- **Match Export** — "Export Match Data" button in Help tab downloads a structured JSON snapshot of the full session: CIA transfers, flow graph, player totals, donation feeds, player roster.
- **Replay Viewer** (`hammer-replay-viewer/index.html`) — standalone static app (no build step, no server) for visualizing exported match data. Drop zone, player POV selector, overview cards, leaderboard bar charts (Chart.js), timeline, net balance table, flow table, and suspicious pattern detection (feeder/sink alerts).
- **Palantir mode** — sacrifice-aware smart reciprocation engine that weighs donor sacrifice ratio, loyalty score, team relationship, and your current power phase to decide if/how much to send back.

### Changed

- Opening dashboard window no longer hides the overlay panel — both coexist.
- Mode toggle icon in header correctly reflects current display mode from first render.
- Auto mode in Reciprocate hides percentage buttons (only relevant in manual mode).
- `.gitignore` now excludes `.wxt/`, `install/`, `hammer-recording-*.json`, `hammer-match-*.json`.

### Fixed

- StatusToast test button was a no-op in dashboard window mode (component not mounted). Fixed by mounting StatusToast in window mode render branch.
- Dashboard opening caused immediate panel disappearance due to premature `setDisplayMode("window")` call in overlay button handler. Overlay now only sends `OPEN_DASHBOARD`; dashboard forces its own `displayMode: "window"` on mount.

## [11.0.4] - 2026-02-19

### Fixed
- **Reciprocate on Gold sends wrong resource**: When receiving gold, the system now sends **troops** back (not gold). This enables the "Troops for Gold Trust" playstyle — receive troops → send gold back, receive gold → send troops back. Affects manual popup buttons, auto mode, and reciprocation history display.

## [11.0.3] - 2026-02-15

### Added
- **Help tab**: Comprehensive guide explaining every tab and feature — Summary, Stats, Ports, Feed, Alliances, Auto Troops, Auto Gold, Reciprocate, Comms, CIA, Hotkeys, and general tips
- **About tab**: Added "iSend 50PCT GOLD 4 TROOPS" to in-game names

## [11.0.2] - 2026-02-15

### Fixed
- **Allies section blinking every ~3 seconds**: Removed `myAllies` overwrite from `refreshPlayerData` — game object `p.allies()` returned stale/wrong-format data every 3s, causing `getAllies()` to find 0 matches until the next Worker update restored it. Worker handler is now the sole authoritative source for alliance state.
- **CIA "Most Generous" inflated totals & doubled alerts**: Each transfer fired two DisplayEvents (SENT + RECEIVED) that bypassed dedup due to name source mismatches. CIA now only counts SENT events (types 18/21) for flow tracking — RECEIVED events are the same transfer from the receiver's perspective. Port trades (type 20) still tracked separately.

## [11.0.1] - 2026-02-15

### Fixed
- **Auto Troops/Gold target button flickering**: Removed volatile player stats (troops %, gold amounts) from target selection buttons — these values changed every game tick, causing the targets section to rebuild every 500ms even with section-level DOM updates

## [10.9] - 2026-02-07 "Buttery Smooth"

### Fixed
- **Persistent blinking in Comms/Allies/Auto-Troops/Auto-Gold tabs**: Changed `playersById`/`playersBySmallId` from `const` to `let`, enabling true atomic reference swaps (single assignment) instead of clear-then-copy pattern that left maps empty mid-cycle
- **"Works then stops" bug**: Removed unsafe fallback that picked a random alive player when `clientID` wasn't found in Worker updates, which corrupted `mySmallID`/`myTeam`/`myAllies` and broke all PID matching + ally detection
- **PID mismatch flood**: Now looks up our player by known `smallID` when `clientID` isn't available, instead of falling back to any alive player

### Added
- Render HTML caching: only rebuilds DOM when content actually changes, eliminating unnecessary 500ms DOM thrashing and preserving scroll position / UI state

## [10.8] - 2026-02-07 "Stability & Reconnect"

### Fixed
- Comms/Alliances tab blinking: atomic swap pattern for player data maps
- Intermittent data loss: bootstrap now extracts allies/tilesOwned data, `playerDataReady` only set when `mySmallID` is confirmed

### Added
- **Reconnect button** in About tab: re-discovers Worker, WebSocket, EventBus, GameView hook, and player data on demand with per-system status feedback
- Escalating retry delays for Worker/WebSocket/bootstrap discovery (200ms-4s) instead of single 500ms retry
- System health score (N/6) shown in About tab with color-coded status
- `refreshPlayerData()` now logs errors instead of swallowing silently

## [10.7] - 2026-02-06 "Donation Tracking Fix"

### Fixed
- Donation tracking showing no data (Summary/Stats/Ports/Feed all empty)
- Root cause: bootstrap set `playerDataReady=true` but never drained buffered messages

### Added
- `drainPendingMessages()` called from bootstrap AND Worker message paths
- Periodic player data refresh (every 3s) from game objects
- Diagnostic counters in About tab: filtered events, PID mismatches, etc.
- `findPlayer()` now returns null-safe with diagnostic logging

## [10.6] - 2026-02-05 "Comms Fix & Alliance Requests"

### Fixed
- Comms tab not showing Teammates/Allies (all appeared as "Others")
- "No targets selected" error when sending alliance requests
- `readMyPlayer()` now falls back to `playersById` for singleplayer/bootstrap scenarios

### Added
- Alliance Request button uses EventBus discovery (like emoji/quickchat)
- Alliance requests sent one by one with delay to avoid rate limiting
- Auto-Troops target selection shows troops with %, and gold side by side

### Fixed
- 10x troop display bug: game internally stores troops at 10x display value; all troop displays now use `dTroops()` to match game UI

## [10.5] - 2026-02-04 "Full Numbers & Port Fix"

### Fixed
- Port gold income incorrectly appearing in Reciprocate donor list

### Added
- Full number display with commas in previews and donor stats (e.g., `1,280,000 (1.3M)`)
- Alliance Request button in Comms tab for quick alliance quickchat

## [10.4] - 2026-02-04 "Singleplayer/Team Mode"

### Fixed
- Singleplayer/team mode support: uses `events-display.game` path when `game-view` is null
- Bootstrap now finds `_myClientID`, `_players`, `_myPlayer` correctly

### Added
- Deep Worker/WebSocket discovery in both `game-view` and `events-display` paths
- Immediate hook attempts for faster mid-match startup
- Stale hook clearing for re-injection scenarios

## [10.0] - 2026-02-03 "Control Panel"

### Changed
- Renamed to Hammer Control Panel
- Reciprocate tab: split troops/gold toggles, donor stats, popup toggle
- Auto-Troops & Auto-Gold: enhanced live preview
- Summary: separated port data from player donations
- Stats: expanded metrics, leaderboards, fun stats
- Popup performance improvements (debounce, event delegation)

## [2.4.0] - 2026-02-03

### Added
- **Quick Reciprocate Feature** - "Troops for Gold Trust" reciprocation system
  - Interactive popup notifications when troops are received
  - Quick-send gold at preset percentages (10%, 25%, 50%, 75%, 100%)
  - Two modes: Manual (popup with buttons) or Auto (fixed percentage)
  - Dedicated Reciprocate tab with settings and history
  - Recent troop donors list with one-click gold sending
  - Reciprocation history tracking
  - Configurable notification duration and auto-percentage

## [2.3.0] - 2026-02-02

### Fixed
- **Auto-send gold and troops now fully working**
  - Discovered actual minified event classes from game (`Rp` for gold, `Op` for troops)
  - Fixed EventBus routing by using game's native event classes instead of custom ones
  - Fixed BigInt/Number mixing errors in gold calculations and display
  - Both singleplayer and multiplayer modes supported

## [2.2.0] - 2025-11-04

### Added
- Tag Mates filter with interactive prompt for tag entry
- Debug tab with last 80 raw message lines
- Export functionality (downloadable JSON)
- Port efficiency analysis with embargo recommendations
- GPM (gold per minute) calculations
- Hard reset logic prevents duplicate instances

### Changed
- Complete rewrite to message-only detection (removed EventBus hooks)
- Five-tab interface: Inbound, Outbound, Ports, Feed, Debug

## [2.0.0] - 2025-11-02

### Added
- Multi-tab interface (Inbound/Outbound/Feed)
- MutationObserver for DOM-based message detection
- Support for abbreviated amounts (1k, 2M, etc.)
- Pause/Resume, Reset, Size cycling, Minimize

### Changed
- Complete architectural rewrite from EventBus hooks to message parsing
- Renamed from "TrainMax" to "ME Stream"

---

## Notes

Versions 1.x through 9.x represent the experimental and iterative development phase.
See the in-source changelog in `hammer-scripts/hammer.js` for detailed notes on all versions.
