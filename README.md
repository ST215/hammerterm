# Hammer Script

A real-time donation tracking tool for OpenFront.io that runs directly in your browser console.

## Overview

Hammer Script monitors and tracks resource donations (gold and troops) in OpenFront.io matches. It provides live statistics, trade port analysis, and helps you identify teammates who aren't contributing to your economy.

## Features

### 📊 Multiple Powerful Views

1. **Summary** - Overview of match statistics and key metrics

2. **Stats** - Detailed player statistics and comparisons

3. **AI Insights** - Intelligent analysis and recommendations

4. **Ports** - Analyze trade port performance
   - Gold per minute (GPM) calculations
   - Average and last interval timing
   - Embargo recommendations for inefficient routes
   - Identifies long routes vs. profitable partners

5. **Feed** - Real-time transaction stream
   - Chronological view of all donations
   - Both sent and received in one place
   - Auto-scrolls to show latest activity

6. **Gold Rate** - Track gold generation rates

7. **Alliances** - Monitor alliance relationships

8. **Auto-Troops** - Automated troop donation system

9. **Auto-Gold** - Automated gold donation system

10. **Reciprocate** - Quick reciprocation for "Troops for Gold Trust" playstyle
    - Popup notifications when troops received
    - One-click gold sending at preset percentages (10%, 25%, 50%, 75%, 100%)
    - Manual mode (case-by-case decisions) or Auto mode (fixed percentage)
    - Recent donors list with quick-send buttons
    - Reciprocation history tracking
    - Eliminates manual player searching and amount calculations

11. **Diagnostics** - Technical diagnostics and debugging

12. **Hotkeys** - Keyboard shortcut reference

### 🎯 Key Capabilities

- **Tag Mates Filter** - Focus on your clan/alliance members
- **Live Updates** - Refreshes automatically every 500ms
- **Export Data** - Download complete JSON reports
- **Pause/Resume** - Stop tracking temporarily
- **Reset** - Clear all data and start fresh
- **Resizable UI** - Three size presets plus manual resize
- **Draggable** - Position anywhere on screen
- **Minimizable** - Get it out of the way when needed

### 💡 Smart Analytics

- **Port Efficiency Scoring** - Flags trade routes with high interval + low GPM
- **Cumulative Tracking** - All-time statistics for entire match
- **Deduplication** - Prevents double-counting of messages
- **Tag Detection** - Automatically identifies clan tags like `[ABC]`

## Installation

1. Join an OpenFront.io match
2. Open browser console (F12 or Ctrl+Shift+J)
3. Copy the entire contents of [hammerScript.js](hammerScript.js)
4. Paste into console and press Enter
5. The Hammer dashboard appears in the bottom-right corner

## Usage

### Basic Controls

- **Tabs** - Click Inbound/Outbound/Ports/Feed/Debug to switch views
- **Size ▽** - Cycle through three size presets
- **▽** - Minimize to title bar only
- **Pause** - Stop tracking (resume to continue)
- **Reset** - Clear all data
- **Tag Mates** - Filter to show only your clan members
- **Export** - Download JSON data file
- **×** - Close and stop tracking

### Tag Mates Feature

1. Click "Tag Mates" button
2. Enter your clan tag (without brackets) - e.g., enter `ABC` not `[ABC]`
3. Click again to toggle the filter on/off
4. When active, only shows players with matching tag

### Understanding Port Analysis

The Ports view helps you optimize your trade economy:

- **GPM (Gold Per Minute)** - Higher is better (2000+ is excellent)
- **Avg Sec** - Average time between trades
- **Last Sec** - Time since last trade received
- **Consider Embargo** - Red flag appears when:
  - Average interval > 120 seconds AND
  - GPM < 2000

These flags indicate long trade routes that aren't profitable. Consider switching to closer partners.

### Export Format

Exported JSON includes:

```json
{
  "exportedAt": "2025-11-04T...",
  "inbound": { "PlayerName": { "gold": 12345, "troops": 5000, "count": 15 } },
  "outbound": { "PlayerName": { "gold": 8000, "troops": 3000, "count": 10 } },
  "ports": {
    "PlayerName": {
      "totalGold": 50000,
      "avgIntSec": 45,
      "lastIntSec": 38,
      "gpm": 3200,
      "trades": 23
    }
  },
  "stream": {
    "inbound": [...],
    "outbound": [...]
  },
  "rawSample": ["last 80 raw message lines"]
}
```

## How It Works

### Message Detection

Hammer Script uses a `MutationObserver` to watch the DOM for text changes in the game's message area. When donation messages appear, it:

1. Captures the raw text
2. Parses message format using regex patterns
3. Extracts player name, resource type, and amount
4. Updates aggregated statistics
5. Adds to activity feed

### Supported Message Patterns

- `Received X troops from PlayerName`
- `Sent X troops to PlayerName`
- `Received X gold from trade with PlayerName`
- `Sent X gold to PlayerName`

Amounts can include abbreviations: `1.5k`, `2M`, `500`, etc.

### Deduplication

Messages are deduplicated using a `Set` with prefix `L:` + full message text. The set is bounded to 8000 entries to prevent memory issues in long matches.

### Limitations

- **Only tracks YOUR visible messages** - Cannot see donations between other players
- **DOM-based detection** - If the game switches to canvas-only rendering, detection may fail
- **Client-side only** - No server communication; all data stays local
- **Match-scoped** - Data resets when you leave the match (unless exported)

## Technical Details

### Architecture

- **Pure vanilla JavaScript** - No dependencies
- **Single IIFE** - Entire script in one immediately-invoked function
- **Global namespace** - `window.__HAMMER_ME__` exposes state for debugging
- **Mutation Observer** - Monitors `document.body` with `{ childList: true, subtree: true }`
- **Render loop** - 500ms interval for UI updates

### State Management

```javascript
{
  view: "inbound",           // Current tab
  paused: false,             // Tracking active/paused
  minimized: false,          // UI state
  sizeIdx: 1,                // Size preset index
  myTag: null,               // User's clan tag
  filterTagMates: false,     // Tag filter active
  seen: Set,                 // Deduplication cache
  inbound: Map,              // name -> {gold, troops, count, last}
  outbound: Map,             // name -> {gold, troops, count, last}
  ports: Map,                // name -> {totalGold, times[], avgIntSec, gpm}
  feedIn: [],                // Inbound activity stream
  feedOut: [],               // Outbound activity stream
  rawLines: []               // Last 400 raw message lines
}
```

### Performance

- Bounded collections prevent memory leaks
- Efficient Map-based lookups
- Regex parsing is fast for small message volumes
- UI renders every 500ms regardless of message rate
- MutationObserver batches DOM changes

## Development

### File Structure

```
openfront/
├── hammerScript.js       # Main script (paste into console)
├── README.md             # This file
└── OpenFrontIO/          # Game source (reference only, gitignored)
```

### Debugging

Enable debug mode:

```javascript
// In console after running script
window.__HAMMER_ME__.state.view = 'debug'
```

Access internal state:

```javascript
// View state
console.log(window.__HAMMER_ME__.state)

// View observer
console.log(window.__HAMMER_ME__.obs)

// Stop tracking
window.__HAMMER_ME__.obs.disconnect()
clearInterval(window.__HAMMER_ME__.tickId)
```

### Making Changes

1. Edit [hammerScript.js](hammerScript.js)
2. Refresh the game page
3. Paste the updated script into console
4. The old instance auto-removes itself before creating a new one

The script includes hard reset logic:

```javascript
if (window.__HAMMER_ME__?.ui?.root) {
  // Cleanup old instance: disconnect observer, remove UI, clear interval
  // Then delete global reference
}
```

## Troubleshooting

### No Data Appearing

1. Switch to **Debug** tab
2. Check if raw message lines are appearing
3. If yes: Messages are detected but regex patterns may need adjustment
4. If no: Game may be using canvas rendering or messages appear elsewhere

### Can't Find Messages

Open browser DevTools and search for text like "Received" or "Sent" in the Elements tab. If found in the DOM, the script should detect it. If not found, messages might be rendered on a `<canvas>`.

### Script Stops Working

- Browser extensions (ad blockers) may interfere
- Try incognito/private mode
- Check console for errors
- Re-paste the script to restart

### Export Button Not Working

Check browser console for errors. Some browsers block auto-downloads. You may need to allow the download in your browser's security settings.

### Tag Filter Shows Nothing

- Ensure you entered the tag correctly (without brackets)
- Check spelling - filter is case-insensitive but must match
- Verify players have the tag in their name like `[TAG] PlayerName`

## Version History

### v2.2 (Current)
- Messages-only detection (removed EventBus hooks for stability)
- Added Tag Mates filter with prompt for tag entry
- Five-tab interface: Inbound, Outbound, Ports, Feed, Debug
- Export to JSON
- Port efficiency analysis with embargo recommendations
- Auto-resize body height when user resizes window
- Hard reset on script re-run prevents duplicate instances

### v2.1
- Added Ports analysis view
- GPM (gold per minute) calculations
- Trade interval timing (avg and last)

### v2.0
- Complete rewrite to message-based detection
- Multi-tab UI
- Feed view with unified stream
- Debug pane

### v1.x - v5.x
- Various experimental approaches
- EventBus hooking attempts
- DisplayMessageUpdate parsing attempts
- Confirmed client-side limitations for tracking other players' donations

## License

This is an independent fan-made tool for OpenFront.io. Not affiliated with or endorsed by the game developers.

**Use at your own risk.** Browser console scripts can be powerful - only run code you understand or trust.

## Contributing

Contributions welcome! Areas for improvement:

- Support for additional message formats
- Better canvas-based message detection
- Historical charts/graphs
- Match replay from exported JSON
- Efficiency scoring algorithms
- UI themes

## Support

For issues or questions:

1. Check the Debug tab to verify message detection
2. Export your data before reporting issues
3. Include browser version and any console errors

## Acknowledgments

Built for the OpenFront.io community to enhance strategic gameplay and economic analysis.

---

**Happy trading, and may your ports be profitable!** 🏰💰⚔️
