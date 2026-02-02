# Testing Guide - Hammer v9.0.1 (Debug Build)

## What Was Fixed

Three commits implemented fixes for broken donation tracking:

1. **Diagnostic Logging** (commit 8f88146)
   - Added comprehensive debug logging at all critical points
   - Will help identify which part of the chain is failing

2. **Timing Fix** (commit a92300b)
   - Implemented message buffering to fix timing issues
   - Messages now buffer until player data is ready
   - Prevents messages from being filtered due to `mySmallID` not being set

3. **Testing Helpers** (commit 3862827)
   - Exposed auto-send functions for manual testing
   - Added debug state inspector

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
[HAMMER] [DEBUG] DisplayEvent: { type: 21, text: "...", playerID: <id>, mySmallID: <id> }
```

**When player updates arrive**:
```
[HAMMER] [DEBUG] Player update: { count: <n>, mySmallID: <id>, playerMapSize: <n>, currentClientID: "..." }
[HAMMER] [DEBUG] Player data ready, processing buffered messages: <count>
```

**If messages are buffered**:
```
[HAMMER] [DEBUG] Buffering message until players ready: "Received 500 troops from Alice"
```

**If messages match**:
```
[HAMMER] [DEBUG] Matched RECEIVED_TROOPS: { name: "Alice", amt: 500, text: "..." }
[HAMMER] [DEBUG] findPlayer SUCCESS (map): { input: "Alice", found: "Alice", mapSize: <n> }
```

**If messages DON'T match**:
```
[HAMMER] [DEBUG] No match for RECEIVED_TROOPS: "Alice sent you 500 troops"
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

1. **No buffering messages** after initial load
   - Means player data loads before DisplayEvents (good timing)

2. **Regex patterns match** donation messages
   - `[DEBUG] Matched RECEIVED_TROOPS` (or GOLD, etc.)
   - Means message format hasn't changed

3. **findPlayer succeeds** for all players
   - `[DEBUG] findPlayer SUCCESS`
   - Means player maps are populated correctly

4. **Transactions appear** in Feed tab
   - Both inbound and outbound donations tracked

5. **Auto-send works**
   - Manual test returns `true`
   - Automated sends show in console + game UI

### ❌ Failure Indicators

1. **Many buffered messages** that never process
   - `[DEBUG] Buffering message until players ready: ...`
   - `playerDataReady` stays `false`
   - **Issue**: Player data not loading properly

2. **No match for donation messages**
   - `[DEBUG] No match for RECEIVED_TROOPS: ...`
   - **Issue**: Message format changed - need to update regex

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
3. **Example message text** that isn't matching (if regex issue)
4. **Exported logs** (JSON from exportLogs())

## Next Steps After Testing

### If Everything Works ✅
- Disable debug logging (set line ~114 to `const DEBUG = false`)
- Commit final working version
- Update version to `9.0.1` (remove `-debug`)

### If Timing Issue Persists ❌
- Check if `playerDataReady` ever becomes true
- Check if buffered messages are processed
- May need to adjust timing logic

### If Message Format Changed ❌
- Note the actual message text from logs
- Update regex patterns to match new format
- Example: If "Alice sent you 500 troops" instead of "Received 500 troops from Alice"

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
