# Quick Start Guide

Get Hammer Script running in under 60 seconds!

## 1. Join OpenFront.io Match

Navigate to [OpenFront.io](https://openfront.io) and join or create a match.

## 2. Open Browser Console

| Browser | Shortcut |
|---------|----------|
| Chrome/Edge | `F12` or `Ctrl+Shift+J` |
| Firefox | `F12` or `Ctrl+Shift+K` |
| Safari | `Cmd+Option+C` |

## 3. Copy & Paste Script

1. Open [hammerScript.js](hammerScript.js) in a text editor
2. Select all (`Ctrl+A`)
3. Copy (`Ctrl+C`)
4. Paste into console (`Ctrl+V`)
5. Press `Enter`

## 4. Dashboard Appears

The Hammer dashboard appears in the bottom-right corner.

## 5. Start Playing

As you send/receive donations, the dashboard automatically updates:

- **Inbound** tab: Resources you received
- **Outbound** tab: Resources you sent
- **Ports** tab: Trade efficiency analysis
- **Feed** tab: Live activity stream
- **Debug** tab: Technical diagnostics

## First Time Setup

### Optional: Set Your Clan Tag

1. Click "Tag Mates" button
2. Enter your tag (e.g., `ABC` not `[ABC]`)
3. Click "Tag Mates" again to toggle filter

Now only clan members will show in all views!

## Common Actions

| Action | How To |
|--------|--------|
| Switch views | Click tab buttons (Inbound, Outbound, etc.) |
| Change size | Click "Size ▽" button |
| Minimize | Click "▽" button |
| Pause tracking | Click "Pause" button |
| Clear all data | Click "Reset" button |
| Save data | Click "Export" button |
| Move dashboard | Drag the title bar |
| Resize manually | Drag bottom-right corner |
| Close | Click "×" button |

## Troubleshooting

### No Data Showing Up?

1. Switch to **Debug** tab
2. Send a donation in-game
3. Check if message appears in Debug view
4. If yes: Script is working!
5. If no: See [README.md](README.md) troubleshooting section

### Script Won't Paste?

Some browsers have console paste protection:

1. Type `allow pasting` in console
2. Try pasting again
3. Or type the script manually (not recommended)

### Dashboard Disappeared?

You might have closed it. Just re-paste the script - it will clean up the old instance and create a new one.

## Tips for Best Results

1. **Run early** - Start the script at match beginning to capture all data
2. **Export often** - Save your data periodically in long matches
3. **Check Ports** - Use efficiency analysis to optimize your trade routes
4. **Use Tag Filter** - Focus on your clan/alliance members
5. **Debug tab** - First place to check if something seems wrong

## What's Next?

- Read the full [README.md](README.md) for detailed features
- Check [CHANGELOG.md](CHANGELOG.md) for version history
- See [CONTRIBUTING.md](CONTRIBUTING.md) if you want to help improve it

## One-Liner Installation

For advanced users, you can bookmark this (replace with your hosted version):

```javascript
javascript:(function(){fetch('URL_TO_YOUR_HOSTED_SCRIPT.js').then(r=>r.text()).then(eval)})()
```

Save as a browser bookmark and click it when in a match!

---

**Need help?** Check the Debug tab first, then see the README troubleshooting section.

**Enjoying Hammer Script?** Star the repo and share with your clan!
