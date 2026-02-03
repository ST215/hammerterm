# Changelog

All notable changes to Hammer Script will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] - 2026-02-02

### Fixed
- **MAJOR: Auto-send gold and troops now fully working**
  - Discovered actual minified event classes from game ('Rp' for gold, 'Op' for troops)
  - Fixed EventBus routing by using game's native event classes instead of custom ones
  - Fixed BigInt/Number mixing errors in gold calculations and display
  - Auto-gold tab now renders correctly with proper BigInt conversion
  - Both single-player and multi-player modes supported

### Changed
- Event discovery system automatically finds and caches minified event classes
- All gold BigInt values converted to Number for safe calculations
- Exposed playersById, myAllies, myTeam in getState() for debugging
- Added testEventClass() helper for testing different event classes

### Technical Details
- Root cause: Custom event classes didn't match minified game classes, so EventBus didn't route events
- Solution: Use game's actual 'Rp' (gold) and 'Op' (troops) event classes discovered via EventBus.listeners
- Gold events require BigInt amounts, troops events require number amounts

## [2.2.0] - 2025-11-04

### Added
- Tag Mates filter button with interactive prompt for tag entry
- Filter toggle shows/hides non-clan members across all views
- Tag badge displayed in button when filter active
- Debug tab shows last 80 raw message lines
- Export functionality creates downloadable JSON with complete match data
- Port efficiency analysis with "consider embargo" warnings
- GPM (gold per minute) calculations for trade partners
- Auto-resize body height when user manually resizes window
- Hard reset logic prevents duplicate instances when re-running script

### Changed
- Complete rewrite to message-only detection (removed EventBus hooks)
- Five-tab interface: Inbound, Outbound, Ports, Feed, Debug
- Feed view now combines both inbound and outbound streams chronologically
- Improved styling with monospace numerics and better spacing
- UI defaults to medium size (600x420px)
- Raw lines buffer increased to 400 entries

### Fixed
- Stability issues from EventBus hooking approach
- Race conditions during script reload
- Memory leaks from unbounded collections
- UI positioning when dragging

## [2.1.0] - 2025-11-03

### Added
- Ports analysis view for trade partner efficiency
- Average interval timing between trades
- Last interval timing for recency
- Trade count tracking per partner

### Changed
- Increased feed capacity to 500 entries per direction
- Improved deduplication with bounded Set (8000 limit)

## [2.0.0] - 2025-11-02

### Added
- Multi-tab interface (Inbound/Outbound/Feed)
- Unified feed view with chronological stream
- MutationObserver for DOM-based message detection
- Support for abbreviated amounts (1k, 2M, etc.)
- Pause/Resume functionality
- Reset button to clear all data
- Size cycling button (3 presets)
- Minimize to title bar

### Changed
- Complete architectural rewrite
- Moved from EventBus hooks to message parsing
- Renamed from "TrainMax" to "ME Stream"

### Removed
- EventBus interception approach
- DisplayMessageUpdate parsing approach
- Roster tracking
- Slackers alert (not feasible with message-only detection)

## [1.4.3] - [5.1.0] - 2025-10-30 through 2025-11-01

### Experimental Phase
Multiple versions exploring different detection strategies:

- v5.1: Fixed critical `hookErrors` bug in EventBus installation
- v5.0: Simplified UI to single-screen dashboard
- v4.1: Hybrid approach (EventBus + message parsing)
- v3.0: DisplayMessageUpdate parsing attempts
- v2.x: Delta matching algorithms
- v1.4.3: Player method hooking attempts

### Key Learnings
- `Player.donateTroops()` and `Player.donateGold()` only exist server-side
- `GameView.update()` does not process DisplayEvent updates client-side
- `SendDonateGoldIntentEvent` and `SendDonateTroopsIntentEvent` are client-side but only fire for YOUR donations
- EventBus approach had stability issues across game updates
- Message-based detection is most reliable approach

### Investigation Results
- Confirmed: Cannot track donations between other players (client limitation)
- Confirmed: DisplayMessageUpdate events are not accessible client-side
- Confirmed: Only YOUR visible messages can be tracked
- Confirmed: GameUpdateType.DisplayEvent = 3 but not processed by client

## [Unreleased]

### Planned Features
- Historical graphs/charts
- Match replay from exported JSON
- Configurable embargo thresholds
- Custom alert sounds for donations
- Keyboard shortcuts
- Mobile-responsive UI
- Canvas-based message detection fallback
- Browser extension version

### Under Consideration
- Server-side version (if API access becomes available)
- Multi-match history database
- Team leaderboards
- Efficiency recommendations engine
- Integration with game Discord bots

---

## Version Format

Version numbers follow semantic versioning: MAJOR.MINOR.PATCH

- **MAJOR**: Breaking changes or complete rewrites
- **MINOR**: New features, non-breaking changes
- **PATCH**: Bug fixes, small improvements

## Notes on Development History

This project went through extensive exploration of OpenFront.io's client-side architecture to determine what data is accessible. The journey from v1.4.3 through v5.1 involved:

1. Analyzing game source code in OpenFrontIO/src/
2. Testing various hooking strategies (Player methods, EventBus, GameView)
3. Confirming client-side limitations through diagnostic output
4. Discovering that message-based detection is the most reliable approach

The current v2.2 represents a stable, production-ready implementation based on those learnings.
