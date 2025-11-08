# OpenFront Helper - Debug Mode

## Problem: "OpenFront Helper v1.0 - Initializing..." Stuck

If you see the helper initialize but the HUD never updates beyond "Initializing...", it means the Wiretap isn't detecting game update messages.

## Solution: Enable Debug Mode

Debug mode logs **every** WebSocket/SharedWorker message to help identify what the game is actually sending.

### How to Enable Debug Mode

**IMPORTANT**: Debug mode must be enabled **BEFORE** loading the script.

#### Step 1: Set Debug Flag
```javascript
// In browser console, FIRST run this:
window.OFHelper_DEBUG = true;
```

#### Step 2: Load the Script
```javascript
// Then paste the entire of-helper.v1.js script and press Enter
```

#### Step 3: Watch the Console
You should now see verbose logging:
```
[Wiretap] DEBUG MODE ENABLED
[Wiretap] Initialized - monitoring WebSocket and SharedWorker traffic
[Wiretap:DEBUG #1] Received (string): {"type":"ping",...
[Wiretap:DEBUG #1] Parsed JSON: ["type", "timestamp"]
[Wiretap:DEBUG #1] ✗ No pattern matched. Message structure: {...}
[Wiretap:DEBUG #2] Received (string): {"type":"turn",...
[Wiretap:DEBUG #2] Parsed JSON: ["type", "turn"]
[Wiretap:DEBUG #2] ✗ No pattern matched. Message structure: {...}
```

## What to Look For

### Good Signs
If you see:
```
[Wiretap] Game update detected! 1234
[TurnClock] Initialized - listening for game ticks
```
**→ It's working!** The HUD should start updating.

### Bad Signs

#### 1. No Messages at All
```
[Wiretap] Initialized - monitoring WebSocket and SharedWorker traffic
(nothing else)
```
**Problem**: Script loaded after game connection was established.
**Solution**:
1. Keep debug flag set: `window.OFHelper_DEBUG = true`
2. Refresh the page (F5)
3. **Immediately** paste the script BEFORE joining/starting a game
4. Then join/start the game

#### 2. Seeing Messages But No Match
```
[Wiretap:DEBUG #45] ✗ No pattern matched. Message structure: {
  hasType: true,
  type: "turn",
  hasGameUpdate: false,
  hasTick: false,
  hasUpdates: false,
  keys: ["type", "turn"]
}
```
**Problem**: Game uses a different message format than expected.
**Solution**: Copy the debug output and report it (see below)

#### 3. Binary Messages Only
```
[Wiretap:DEBUG #1] Binary message - skipped
[Wiretap:DEBUG #2] Binary message - skipped
```
**Problem**: Game sends data as ArrayBuffer/Blob which we can't parse yet.
**Solution**: Binary parsing needs to be implemented (advanced)

## Quick Debug Checklist

1. ✅ **Set debug flag FIRST**: `window.OFHelper_DEBUG = true`
2. ✅ **Paste script BEFORE joining game**
3. ✅ **Are in an active game** (not lobby)
4. ✅ **Have spawned** (controlling territory)
5. ✅ **Game is not paused**

## Copy Debug Output

If still stuck, copy 10-20 lines of debug output and examine them:

```javascript
// See last 20 messages with this pattern:
// [Wiretap:DEBUG #N] ...
```

Look for repeated messages - that's likely the game tick messages.

## Common Message Patterns

Based on OpenFront source code, expect one of these:

### Pattern 1: Worker Message (Mars extension)
```json
{
  "type": "game_update",
  "gameUpdate": {
    "tick": 1234,
    "updates": {...},
    "packedTileUpdates": [...]
  }
}
```
✓ Should auto-detect

### Pattern 2: WebSocket Turn Message
```json
{
  "type": "turn",
  "turn": {
    "turnNumber": 1234,
    "intents": [...]
  }
}
```
✗ Doesn't contain player/unit data directly

### Pattern 3: Raw GameUpdateViewData
```json
{
  "tick": 1234,
  "updates": {
    "2": [...],  // Player updates
    "1": [...]   // Unit updates
  },
  "packedTileUpdates": [...]
}
```
✓ Should auto-detect

## Still Not Working?

### Check These

1. **Correct game page?**
   - Must be on `openfront.io` game page
   - Not the lobby or a different site

2. **Console errors?**
   - Look for red error messages
   - Check if script loaded completely

3. **WebSocket patching worked?**
   - Should see "monitoring WebSocket and SharedWorker traffic"

### Manual Test

Test if WebSocket patching worked:

```javascript
// See if OFHelper loaded
console.log(OFHelper.version);  // Should show "1.0.0"

// Check if any messages received
// (message count increases if working)
```

## Reporting Issues

If you need help, provide:

1. **Browser & version**: (e.g., Chrome 120)
2. **Debug output**: Copy 20 lines of `[Wiretap:DEBUG]` messages
3. **Message structure**: What keys do the messages have?
4. **When pasted**: Before or after joining game?

Example good report:
```
Browser: Chrome 120
Pasted: Before joining game
Debug enabled: Yes

Output:
[Wiretap:DEBUG #1] Received (string): {"type":"turn","turn":{"turnNumber":156}}
[Wiretap:DEBUG #1] Parsed JSON: ["type", "turn"]
[Wiretap:DEBUG #1] ✗ No pattern matched. Message structure: {
  hasType: true,
  type: "turn",
  hasGameUpdate: false,
  hasTick: false,
  hasUpdates: false,
  keys: ["type", "turn"]
}
```

This tells us the game sends `type: "turn"` messages but they don't contain the full update data.

## Advanced: Fix Pattern Detection

If you identify a new message pattern, you can temporarily patch it:

```javascript
// After loading the script, before the issue occurs
// This is advanced - only if you know what you're doing

// Example: If game sends { type: "tick", data: {...} }
OFHelper.on('wire:gameUpdate', (data) => {
  console.log('Got game update:', data);
});
```

## Disable Debug Mode

Once it's working, disable debug to reduce console spam:

```javascript
window.OFHelper_DEBUG = false;
// Then reload script
```

Or just reload without setting the flag.
