# Hammer OpenFront Helper

Advanced Chrome extension for [OpenFront.io](https://openfront.io) providing overlays, statistics, and automation features.

## Features

### Visual Overlays
- **SAM Ranges** (Ctrl+Shift+F) - Shows SAM Launcher ranges (70 tiles) color-coded by relation
- **Atom Bomb Radius** (Alt+A) - Cursor-following bomb damage zones
- **Hydrogen Bomb Radius** (Alt+H) - Larger bomb damage visualization
- **Alliance Status** - Live alliance countdown timers

### Statistics
- **Gold Rate** - Income tracking over 30s/60s/120s windows
- **Advanced Stats** - Tiles, troops, max troops estimate, attacks

### Automation
- **Scope Feeder** (Alt+F) - Auto-donate troops to target player
  - Set target by name/ID or use Alt+M to capture from mouse-over territory
  - Configurable ratio % and threshold %
  - 10-second cooldown per recipient
- **Emoji Spam** - Send emojis to target players
- **Embargo Controls** - Bulk trade management

## Installation

### Load Extension in Chrome

1. **Download or clone** this repository
2. **Open Chrome** and go to `chrome://extensions`
3. **Enable "Developer mode"** (toggle in top right)
4. **Click "Load unpacked"**
5. **Select the `hammer-openfront-extension/` folder**
6. **Done!** The extension icon should appear in your toolbar

### First Use

1. **Go to** [openfront.io](https://openfront.io)
2. **Join a game**
3. **Click the extension icon** to open settings popup
4. **Enable desired features** using toggles
5. **Use keyboard shortcuts** to toggle overlays during gameplay

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+F` | Toggle SAM Ranges overlay |
| `Alt+A` | Toggle Atom Bomb radius |
| `Alt+H` | Toggle Hydrogen Bomb radius |
| `Alt+M` | Capture auto-donate target from mouse-over territory |
| `Alt+F` | Toggle Scope Feeder (auto-donate) |

## Usage Tips

### Auto-Donate (Scope Feeder)

1. Open extension popup
2. In "Scope Feeder" section:
   - **Target**: Enter player name or ID
   - **Ratio %**: How much of your troops to send (e.g., 50 = send 50%)
   - **Threshold %**: Only send if you have at least this % of max capacity
3. **Enable toggle** to start auto-donating
4. Or hover over a territory and press `Alt+M` to capture that player as target

### Viewing SAM Ranges

- Press `Ctrl+Shift+F` to show all SAM Launcher ranges
- **Blue circles** = Your SAMs
- **Green circles** = Ally/teammate SAMs
- **Red circles** = Enemy SAMs

## Development

### File Structure

```
hammer-openfront-extension/
├── manifest.json          # Extension configuration
├── content.js             # Content script (isolated world)
├── injector.js            # Main-world script (game interception)
├── background.js          # Service worker (keyboard shortcuts)
├── popup.html/js          # Extension UI popup
├── features/              # Future: Modular features
└── utils/                 # Future: Shared utilities
```

### Testing Changes

After editing code:

1. Go to `chrome://extensions`
2. Find "Hammer OpenFront Helper"
3. Click the **reload icon** (🔄)
4. Refresh the openfront.io tab (F5)
5. Check console (F12) for `[Extension]` logs

### Debugging

1. Open openfront.io
2. Press **F12** to open DevTools
3. Check **Console** tab for extension logs
4. Look for messages prefixed with `[Extension]` or `[Hammer]`
5. Errors will show exact file:line numbers

## Architecture

### How It Works

1. **Content Script** (`content.js`)
   - Runs in isolated world
   - Injects `injector.js` into page's main world
   - Creates DOM overlays for stats/gold rate
   
2. **Injector Script** (`injector.js`)
   - Runs in page's main world (access to game objects)
   - Intercepts Worker messages to capture game state
   - Intercepts WebSocket to send intents (donate, emoji, embargo)
   - Intercepts Canvas to track camera/zoom for overlay positioning
   
3. **Background Script** (`background.js`)
   - Service worker handling keyboard shortcuts
   - Forwards commands to content script
   
4. **Popup** (`popup.html/js`)
   - Settings UI for all features
   - Persists configuration in `chrome.storage.local`
   - Live-syncs with injected scripts

## Contributing

This extension is built for personal use. To add features:

1. Create a new feature file in `features/`
2. Import and initialize in `injector.js`
3. Add UI controls in `popup.html/js`
4. Test thoroughly before committing

## License

For personal use. Based on the [Mars OpenFront Chrome Extension](https://github.com/openfrontio/MARS-OpenFrontChromeExtension) and [OpenFrontIO](https://github.com/openfrontio/OpenFrontIO) game structure.

## Disclaimer

Use at your own risk. This extension observes and interacts with game state. Check OpenFront.io's terms of service regarding third-party tools. Automation features may be considered unfair advantages - use responsibly.
