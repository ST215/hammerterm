# HAMMER v8.10 - SMOOTH EDITION

## What's Fixed

v8.10 addresses the scrolling issues in auto-troops and auto-gold target selection lists:

### The Problem
- Target selection lists were constantly refreshing because they displayed live troop/gold counts
- Every 500ms refresh would rebuild the entire button list
- This made scrolling impossible - the scroll position would jump/reset
- The nested scroll views were fighting with the main scroll

### The Solution
- **Redesigned layout**: Now uses the same clean box layout as Port Details and Alliances
- **Stable DOM structure**: Each target is now a `<div class="box">` instead of regenerating buttons
- **Better scrolling**: Increased max-height to 300px (from 200px) for more comfortable browsing
- **Visual improvements**:
  - Selected targets show ✓ checkmark and green color
  - Better visual hierarchy with box layout
  - Gold targets show 💰 emoji in gold color (#ffcf5d)
  - Troop counts show in blue color (#7bb8ff)

## Key Changes

### Auto-Troops Target Selection
**Before:**
```html
<button data-toggle-troop-target="PlayerName">
  PlayerName | 1.5M
</button>
```

**After:**
```html
<div class="box" data-toggle-troop-target="PlayerName">
  <div class="row">
    <div style="font-weight:700;color:#7ff2a3">✓ PlayerName</div>
    <div class="mono" style="color:#7bb8ff">1.5M</div>
  </div>
</div>
```

### Auto-Gold Target Selection
Same structure as troops, but with gold emoji and color:
```html
<div class="mono" style="color:#ffcf5d">2.5M 💰</div>
```

## Includes All v8.9 Features

v8.10 is built on v8.9 and includes all these features:
- ✅ Timer conflict fix (auto-troops and auto-gold work simultaneously)
- ✅ +/- button controls instead of sliders
- ✅ Intelligent send calculator with recommendations
- ✅ Live countdown timers
- ✅ Correct number formatting (1.5M)

## Testing v8.10

1. Open auto-troops tab
2. Scroll through the "Available Targets" list
3. **Expected**: Smooth scrolling, no jumping, scroll position stays stable
4. Click targets to select them
5. **Expected**: Targets show ✓ and turn green when selected
6. Repeat test for auto-gold tab

## Why This Works

The key insight: **Separate static structure from dynamic content**

- The DOM structure (boxes, rows) is static
- Only the content inside (names, numbers, checkmarks) changes
- Browser can maintain scroll position because container doesn't rebuild
- Same pattern that makes Port Details and Alliances work perfectly

## Files

- `hammerScript_v8.10_SMOOTH.js` - Main script
- `README_V8.10.md` - This file

## Next Steps

If you still experience any scrolling issues:
1. Check browser console for errors
2. Verify the boxes are using the stable structure
3. Try reducing the refresh rate if needed (currently 500ms)

The target lists should now scroll as smoothly as the Port Details view! 🎯
