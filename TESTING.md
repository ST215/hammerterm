# Testing Guide - Hammer v9.0.2

## What Was Fixed

**ROOT CAUSE IDENTIFIED**: OpenFront changed the DisplayEvent data structure in commit 8235da93 (Jan 11, 2026). The message format changed from English text to translation keys, and actual values moved to a new `params` object.

Fixes implemented:

1. **DisplayEvent Structure Update** (current commit)
   - Updated field access: `msgType` → `messageType`, `msg.text` → `message`, `msg.playerID` → `playerID`
   - Replaced regex parsing with direct extraction from `params` object
   - Now extracts donation data from `params.troops`, `params.gold`, `params.name`
   - Uses `msg.goldAmount` (bigint) for precise gold values

2. **Timing Fix** (previous commit a92300b)
   - Implemented message buffering to prevent race conditions
   - Messages now buffer until player data is ready

3. **Diagnostic Logging** (previous commit 8f88146)
   - Added comprehensive debug logging for troubleshooting

## How to Test

### Step 1: Load the Script

1. Open OpenFront.io in your browser
2. Press F12 to open DevTools
3. Navigate to Console tab
4. Copy the entire contents of `hammer-scripts/hammer.js`
5. Paste into console and press Enter

**Expected**:
- Script loads without errors
- UI appears in bottom-right corner
- Console shows `[HAMMER] Hammer v9.0 initialized`

### Step 2: Check Initial State

In the console, run:
```javascript
window.__HAMMER__.getState()
```

**Expected Output**:
```javascript
{
  mySmallID: <number>,           // Should be set (not null)
  currentClientID: "<string>",   // Should be set
  playerDataReady: true,         // Should be true after game loads
  pendingMessagesCount: 0,       // Should be 0 after processing
  playersCount: <number>,        // Should be > 0
  playerNamesCount: <number>,    // Should be > 0
  gameSocket: true,              // Should be true
  inboundCount: <number>,        // Donation tracking (starts at 0)
  outboundCount: <number>,       // Donation tracking (starts at 0)
  feedInCount: <number>,         // Feed entries
  feedOutCount: <number>         // Feed entries
}
```

**⚠️ If `mySmallID` is null or `playerDataReady` is false:**
- Wait a few seconds and check again
- Player data may not have loaded yet

### Step 3: Monitor Debug Logs

Watch the console for [DEBUG] messages:

**When DisplayEvents arrive**:
```
[HAMMER] [DEBUG] DisplayEvents received: <count>
[HAMMER] [DEBUG] DisplayEvent: {
  type: 21,
  text: "events_display.sent_troops_to_player",
  playerID: <id>,
  mySmallID: <id>
}
```

**New format** (OpenFront v29+):
- `message` field contains translation key (e.g., "events_display.received_troops_from_player")
- Actual values in `params` object: `{ troops: "500", name: "Alice" }`
- Gold donations also have `goldAmount` field with bigint value

**When player updates arrive**:
```
[HAMMER] [DEBUG] Player update: { count: <n>, mySmallID: <id>, playerMapSize: <n>, currentClientID: "..." }
[HAMMER] [DEBUG] Player data ready, processing buffered messages: <count>
```

**If messages are buffered**:
```
[HAMMER] [DEBUG] Buffering message until players ready: "Received 500 troops from Alice"
```

**If messages match** (NEW FORMAT):
```
[HAMMER] [DEBUG] Matched RECEIVED_TROOPS: { name: "Alice", amt: 500, params: { troops: "500", name: "Alice" } }
[HAMMER] [DEBUG] findPlayer SUCCESS (map): { input: "Alice", found: "Alice", mapSize: <n> }
```

**If params missing**:
```
[HAMMER] [DEBUG] No params for RECEIVED_TROOPS: { params: {}, text: "events_display.received_troops_from_player" }
```

### Step 4: Test Donation Tracking

#### Option A: Use Game UI
1. Send gold to another player via the game UI
2. Check console for debug logs
3. Check Hammer UI → Feed tab for transaction
4. Run `window.__HAMMER__.getState()` - check `outboundCount` increased

#### Option B: Receive Donation
1. Have another player send you gold or troops
2. Check console for debug logs
3. Check Hammer UI → Feed tab
4. Run `window.__HAMMER__.getState()` - check `inboundCount` increased

### Step 5: Test Auto-Send (Manual)

#### Test Auto-Send Gold
```javascript
// Find a player
window.__HAMMER__.findPlayer('Alice')
// Should return: { id: "...", name: "Alice" }

// Send gold
window.__HAMMER__.asSendGold('Alice', 1000)
// Should return: true (if successful)

// Check in game that gold was sent
```

#### Test Auto-Send Troops
```javascript
// Send troops
window.__HAMMER__.asSendTroops('Alice', 500)
// Should return: true (if successful)

// Check in game that troops were sent
```

### Step 6: Test Auto-Send (Automated)

1. Open Hammer UI → AutoGold tab
2. Add target: `Alice` (or any player name)
3. Set amount: `10000`
4. Set threshold: `100000`
5. Click "Start"
6. Wait 10 seconds (cooldown)
7. Check console for send logs
8. Verify gold sent in game

Repeat for AutoTroops tab with ratio/threshold settings.

## Interpreting Results

### ✅ Success Indicators

1. **DisplayEvents arrive** with count > 0
   - `[DEBUG] DisplayEvents received: 1` (or more)

2. **Params object populated** with donation data
   - `[DEBUG] Matched RECEIVED_TROOPS: { name: "Alice", amt: 500, params: {...} }`
   - Shows `params.troops` or `params.gold` and `params.name` are present

3. **findPlayer succeeds** for all players
   - `[DEBUG] findPlayer SUCCESS`
   - Means player maps are populated correctly

4. **Transactions appear** in Feed tab
   - Both inbound and outbound donations tracked

5. **Auto-send works**
   - Manual test returns `true`
   - Automated sends show in console + game UI

### ❌ Failure Indicators

1. **DisplayEvents not arriving**
   - `[DEBUG] DisplayEvents received: 0` consistently
   - **Issue**: Either OpenFront changed event delivery or Worker interception broken

2. **Params object empty or missing**
   - `[DEBUG] No params for RECEIVED_TROOPS: { params: {}, ... }`
   - **Issue**: OpenFront changed params structure again

3. **findPlayer fails**
   - `[DEBUG] findPlayer FAILED`
   - **Issue**: Player name mismatch or map not populated

4. **Messages filtered by playerID**
   - `[DEBUG] Message filtered - wrong player`
   - **Issue**: mySmallID mismatch (timing or identity issue)

5. **Auto-send returns false**
   - `gameSocket` is null or not ready
   - `currentClientID` is null
   - **Issue**: WebSocket not captured properly

## Export Debug Data

If something is still broken, export full debug logs:

```javascript
// Export all logs
window.__HAMMER__.exportLogs()

// Copy the JSON output and share for analysis
```

Or export only errors/warnings:
```javascript
window.__HAMMER__.exportLogs({ minLevel: 'warn', limit: 100 })
```

## What to Share

If donation tracking still doesn't work after these tests, please share:

1. **Output of `getState()`**
2. **Console logs** showing [DEBUG] messages
3. **DisplayEvent structure** from debug logs (especially `params` object)
4. **Exported logs** (JSON from exportLogs())

See [ANALYSIS.md](ANALYSIS.md) for full technical details on the DisplayEvent structure changes.

## Next Steps After Testing

### If Everything Works ✅
- Disable debug logging (optional - set DEBUG flag to false)
- Commit final working version
- Update version to `9.0.2`

### If DisplayEvents Still Not Arriving ❌
- Check console for Worker message interception logs
- Verify GameUpdateType.DisplayEvent enum value is still 3
- Check if OpenFront changed Worker message structure again

### If Params Structure Changed ❌
- Check actual params object structure from debug logs
- Update extraction code to match new params format
- See ANALYSIS.md for current expected structure

### If Auto-Send Broken ❌
- Check `gameSocket` status in getState()
- Check `currentClientID` is set
- May need to improve WebSocket discovery

## Clean Build (After Testing)

Once everything works, create a production build:

1. Remove or disable debug logs (keep the timing fix!)
2. Update version to `9.0.1`
3. Commit as working baseline
4. Keep this TESTING.md for future debugging
