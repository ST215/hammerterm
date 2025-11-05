# Hammer v3.0 - Worker Intercept Edition

## What Changed

I analyzed the **MARS OpenFrontChromeExtension** your teammates use and discovered they solved the exact problem you were facing!

## The Problem You Had (v1.x - v2.2)

Your earlier versions tried two approaches that didn't work:

1. **Player method hooking** - `Player.donateTroops()` and `Player.donateGold()` only exist server-side
2. **DOM message parsing** - Unreliable because messages appear/disappear in the DOM
3. **DisplayEvent parsing via GameView** - `GameView.update()` doesn't process DisplayEvent updates

## The MARS Solution

The MARS extension uses **Worker interception** - a brilliant technique that:

1. Wraps the `window.Worker` constructor
2. Intercepts messages from the game's Web Worker
3. Directly reads `game_update` messages containing ALL game state updates
4. Extracts `DisplayMessageUpdate` events from `updates[GameUpdateType.DisplayEvent]`

### Why This Works

OpenFront.io runs its game logic in a Web Worker. The Worker sends `game_update` messages to the main thread containing:
- Player updates (gold, troops, alliances, etc.)
- Unit updates (SAM launchers, cities, etc.)  
- **DisplayMessageUpdate** events (including donation messages!)

The key insight: `DisplayMessageUpdate` events ARE sent from the Worker, they're just not processed by the client's `GameView.update()` method. By intercepting Worker messages directly, we can access them!

## Hammer v3.0 Implementation

### Core Components

#### 1. Worker Wrapper (lines 47-137)

```javascript
const OriginalWorker = window.Worker

function onWorkerMessage(e) {
  const msg = e.data
  if (msg.type === "game_update") {
    const displayEvents = msg.gameUpdate.updates[GameUpdateType.DisplayEvent]
    // Process donation messages!
  }
}

class WrappedWorker extends OriginalWorker {
  constructor(...args) {
    super(...args)
    worker.addEventListener("message", onWorkerMessage)
  }
}

Object.defineProperty(window, "Worker", {
  value: WrappedWorker
})
```

#### 2. DisplayMessage Processing (lines 181-293)

Processes these message types:
- `MessageType.RECEIVED_TROOPS_FROM_PLAYER` (22)
- `MessageType.SENT_TROOPS_TO_PLAYER` (21)
- `MessageType.RECEIVED_GOLD_FROM_TRADE` (20)
- `MessageType.RECEIVED_GOLD_FROM_PLAYER` (19)
- `MessageType.SENT_GOLD_TO_PLAYER` (18)

Each message includes:
- `messageType`: Numeric enum value
- `playerID`: The player this message is for (usually you)
- `message`: Text like "Received 1,500 troops from PlayerName"
- `goldAmount`: Optional bigint for gold transactions

#### 3. Player Roster Tracking (lines 152-174)

Updates from `updates[GameUpdateType.Player]`:
- Builds lookup maps: by ID, by smallID, by name
- Tracks your clientID, smallID, team, allies
- Used to resolve player names → IDs for aggregation

### Key Improvements Over v2.2

| Feature | v2.2 (MutationObserver) | v3.0 (Worker Intercept) |
|---------|------------------------|------------------------|
| **Reliability** | DOM changes must be visible | Direct game state access |
| **Completeness** | Only messages in visible DOM | ALL DisplayMessageUpdate events |
| **Timing** | Race conditions with DOM rendering | Immediate upon game update |
| **Player Data** | Manual roster scraping | Automatic from Worker messages |
| **Future-proof** | Breaks if UI changes | Breaks only if Worker protocol changes |

### What You Get

✅ **Inbound Tab** - Who sent you gold/troops  
✅ **Outbound Tab** - Who you sent to  
✅ **Ports Tab** - Trade efficiency analysis with GPM  
✅ **Feed Tab** - Chronological activity stream  
✅ **Debug Tab** - Verify Worker wrapper is installed  
✅ **Tag Mates Filter** - Focus on your clan  
✅ **Export** - Download JSON data  

### How to Use

1. Copy entire [hammerScript_v3.js](hammerScript_v3.js)
2. Join OpenFront.io match
3. Open browser console (F12)
4. Paste and run
5. Dashboard appears bottom-right

**Verify it's working:**
1. Switch to **Debug** tab
2. Should show: "Worker Wrapper: ✅ INSTALLED"
3. Send/receive a donation
4. Check Debug tab - new message should appear
5. Check Inbound/Outbound tabs - donation should be tracked

### Technical Details

**Worker Message Format:**
```json
{
  "type": "game_update",
  "gameUpdate": {
    "tick": 12345,
    "updates": [
      [...],  // 0: Tile updates
      [...],  // 1: Unit updates  
      [...],  // 2: Player updates
      [...],  // 3: DisplayEvent updates ← WE WANT THIS!
      [...],  // 4: DisplayChatEvent
      // etc.
    ]
  }
}
```

**DisplayMessageUpdate Format:**
```json
{
  "type": 3,  // GameUpdateType.DisplayEvent
  "messageType": 22,  // RECEIVED_TROOPS_FROM_PLAYER
  "message": "Received 1,500 troops from [ABC] PlayerName",
  "playerID": 5,  // Your smallID
  "goldAmount": null  // or bigint for gold messages
}
```

### Comparison with MARS Extension

| Feature | MARS Extension | Hammer v3.0 |
|---------|---------------|-------------|
| **Installation** | Chrome extension | Browser console script |
| **Scope** | Gold rate, SAM overlay, auto-donate | Donation tracking only |
| **UI** | Fixed overlay | Draggable, resizable dashboard |
| **Data** | Real-time only | Historical + export |
| **Permissions** | Extension APIs | None (runs in page) |

### What MARS Extension Does

I analyzed their code - here's what they track:

1. **Gold Rate** - Calculates gold/sec and gold/min from Player updates
2. **SAM Overlay** - Shows SAM launcher ranges on map (canvas overlay)
3. **Atom/Hydrogen Overlays** - Shows nuke blast radii
4. **Alliances Overlay** - Shows active alliances with timers
5. **Auto-Donate (Scope Feeder)** - Automatically sends troops to allies
6. **Emoji Spam** - Sends emoji messages repeatedly
7. **Embargo Controls** - Quick embargo all/unembargo all

### Why v3.0 is Better for Donation Tracking

1. **Focused** - Does one thing well (donations)
2. **Portable** - No extension installation needed
3. **Exportable** - Save match data as JSON
4. **Historical** - See cumulative stats, not just real-time
5. **Flexible** - Easy to modify in console

## Troubleshooting

### "No data appearing"

1. Check Debug tab - is Worker wrapper installed?
2. Make sure you pasted BEFORE joining match
3. If joined already, refresh page and re-paste

### "Worker Wrapper: ❌ NOT INSTALLED"

The script ran too late. The game Worker was already created.

**Fix:** Refresh page, paste script, THEN join match

### "Messages in Debug but not in Inbound/Outbound"

Check the `playerID` in Debug tab. Messages are only tracked if `playerID` matches your smallID or clientID.

**Fix:** The script should auto-detect your ID. If not, check `window.__HAMMER__.mySmallID`

## Future Enhancements

Possible additions inspired by MARS:

1. **Auto-donate** - Automatically send troops to allies
2. **Gold rate overlay** - Show GPM like MARS does
3. **Alliance tracker** - Show active alliances
4. **Embargo manager** - Quick embargo controls
5. **Chat parser** - Track chat messages
6. **Unit tracker** - Track SAM placements, city levels

## Credits

- **Original Hammer Script** - Your v1.x - v2.2 versions with ME Stream UI
- **MARS OpenFrontChromeExtension** - Worker interception technique
- **Hammer v3.0** - Combined the best of both!

## Files

- [hammerScript.js](hammerScript.js) - Your current v2.2 (MutationObserver)
- **[hammerScript_v3.js](hammerScript_v3.js) - NEW Worker Intercept Edition** ← Use this!
- [MARS OpenFrontChromeExtension-main/](MARS OpenFrontChromeExtension-main/) - Reference (gitignored)

---

**Ready to test?** Copy [hammerScript_v3.js](hammerScript_v3.js) and paste into console!
