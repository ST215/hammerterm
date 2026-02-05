// =====================================================================
// HAMMER v10.4 "CONTROL PANEL"
//
// Core automation tool for OpenFront.io focused on essential features:
// - Stats tracking (gold/troops sent/received with logs)
// - Automation (auto-send gold/troops to targets)
// - Enhanced logging with export for debugging
// - Configuration UI with persistence
//
// =====================================================================
// USAGE
// =====================================================================
// 1. Open OpenFront.io in your browser
// 2. Open DevTools (F12)
// 3. Copy this entire script
// 4. Paste into console and press Enter
// 5. Script UI appears in bottom-right corner
//
// =====================================================================
// API
// =====================================================================
// window.__HAMMER__.exportLogs()          - Export logs for debugging
// window.__HAMMER__.exportLogs({          - Export with filters
//   minLevel: 'warn',                     - Only warnings and errors
//   limit: 50                             - Last 50 entries
// })
// window.__HAMMER__.cleanup()             - Clean up and remove script
// window.__HAMMER__.version               - Current version
//
// =====================================================================
// FEATURES
// =====================================================================
// ✓ Gold rate tracking (30s/60s/120s windows)
// ✓ Transaction logs (inbound/outbound gold and troops)
// ✓ Auto-send troops (configurable ratio, threshold, cooldown)
// ✓ Auto-send gold (configurable amount, threshold, cooldown)
// ✓ Target selection by name or mouse-over capture (Alt+M)
// ✓ Configuration persistence across reloads
// ✓ Keyboard shortcuts (Alt+M, Alt+F)
// ✓ Enhanced logging system
//
// =====================================================================
// KEYBOARD SHORTCUTS
// =====================================================================
// Alt+M  - Capture target player under mouse
// Alt+F  - Toggle auto-troops on/off
//
// =====================================================================
// CHANGELOG
// =====================================================================
// v10.4 - Singleplayer/Team Mode & Mid-Match Fixes (Feb 2026)
//   - Fixed singleplayer/team mode: uses events-display.game path when game-view is null
//   - Bootstrap now finds _myClientID, _players, _myPlayer correctly
//   - Deep Worker/WebSocket discovery in both game-view and events-display paths
//   - Immediate hook attempts for faster mid-match startup
//   - Stale hook clearing for re-injection scenarios
//
// v10.0 - Control Panel (Feb 2026)
//   - Renamed to Hammer Control Panel
//   - Reciprocate tab: split troops/gold toggles, donor stats, popup toggle
//   - Auto-Troops & Auto-Gold: enhanced live preview
//   - Summary: separated port data from player donations
//   - Stats: expanded metrics, leaderboards, fun stats
//   - Popup performance improvements (debounce, event delegation)
//
// =====================================================================
(() => {
  // Hard reset with PROPER cleanup
  if (window.__HAMMER__?.cleanup) {
    try {
      console.log('[HAMMER] Cleaning up previous instance...')
      window.__HAMMER__.cleanup()
    } catch (e) {
      console.warn('[HAMMER] Cleanup error:', e)
    }
  }
  if (window.__HAMMER__?.ui?.root) {
    try { window.__HAMMER__.ui.root.remove() } catch {}
  }
  delete window.__HAMMER__

  // ===== LOGGER MODULE =====
  const Logger = (() => {
    const MAX_LOG_ENTRIES = 1000
    const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }
    const LEVEL_NAMES = ['debug', 'info', 'warn', 'error']
    const CONSOLE_LEVEL_MAP = { 'debug': 0, 'log': 1, 'info': 1, 'warn': 2, 'error': 3 }

    let minLogLevel = LOG_LEVELS.DEBUG
    const logBuffer = []
    let logIndex = 0

    function extractCategory(args) {
      if (args.length > 0 && typeof args[0] === 'string') {
        const match = args[0].match(/\[([^\]]+)\]/)
        return match ? match[1] : null
      }
      return null
    }

    function serializeValue(value) {
      try {
        if (value instanceof Error) {
          return { type: 'Error', message: value.message, stack: value.stack, name: value.name }
        } else if (typeof value === 'object' && value !== null) {
          try {
            JSON.stringify(value)
            return value
          } catch { return '[Circular]' }
        }
        return value
      } catch { return '[SerializationError]' }
    }

    function addLog(entry) {
      const entryLevel = CONSOLE_LEVEL_MAP[entry.level] || LOG_LEVELS.INFO
      if (entryLevel < minLogLevel) return

      entry.category = extractCategory(entry.args)
      if (logBuffer.length < MAX_LOG_ENTRIES) {
        logBuffer.push(entry)
      } else {
        logBuffer[logIndex % MAX_LOG_ENTRIES] = entry
        logIndex++
      }
    }

    // Export logs for debugging
    function exportLogs(options = {}) {
      const { limit = 100, level = null, minLevel = null } = options
      let logs = logBuffer.slice()

      if (level) logs = logs.filter(log => log.level === level)
      if (minLevel) {
        const minLevelNum = LOG_LEVELS[minLevel.toUpperCase()] || 0
        logs = logs.filter(log => (CONSOLE_LEVEL_MAP[log.level] || 0) >= minLevelNum)
      }

      logs = logs.slice(-limit)
      return JSON.stringify({
        version: '10.4',
        timestamp: new Date().toISOString(),
        totalLogs: logBuffer.length,
        exportedLogs: logs.length,
        logs: logs
      }, null, 2)
    }

    // Debug mode - OFF by default for max performance
    let debugEnabled = false

    // Simple logging functions
    const log = (...args) => {
      if (!debugEnabled) return
      addLog({ level: 'log', args: args.map(serializeValue), timestamp: new Date().toISOString() })
      console.log('[HAMMER]', ...args)
    }
    const warn = (...args) => {
      addLog({ level: 'warn', args: args.map(serializeValue), timestamp: new Date().toISOString() })
      console.warn('[HAMMER]', ...args)
    }
    const error = (...args) => {
      addLog({ level: 'error', args: args.map(serializeValue), timestamp: new Date().toISOString() })
      console.error('[HAMMER]', ...args)
    }

    function setDebug(on) { debugEnabled = !!on }
    function isDebug() { return debugEnabled }

    return { log, warn, error, exportLogs, setDebug, isDebug }
  })()

  // Convenient alias for internal logging
  const log = Logger.log

  // ===== CLEANUP TRACKING =====
  const eventCleanup = []
  let origSetTransform = null
  let origDrawImage = null

  // ===== CONSTANTS =====
  const GameUpdateType = {
    Tile: 0, Unit: 1, Player: 2, DisplayEvent: 3, DisplayChatEvent: 4,
    AllianceRequest: 5, AllianceRequestReply: 6, BrokeAlliance: 7,
    AllianceExpired: 8, AllianceExtension: 9, TargetPlayer: 10,
    Emoji: 11, Win: 12, Hash: 13, UnitIncoming: 14, BonusEvent: 15,
    RailroadEvent: 16, ConquestEvent: 17, EmbargoEvent: 18
  }

  const MessageType = {
    SENT_GOLD_TO_PLAYER: 18, RECEIVED_GOLD_FROM_PLAYER: 19,
    RECEIVED_GOLD_FROM_TRADE: 20, SENT_TROOPS_TO_PLAYER: 21,
    RECEIVED_TROOPS_FROM_PLAYER: 22
  }

  const MAX_AGE_MS = 2 * 60 * 1000

  // ===== GLOBAL STATE =====
  let currentClientID = null
  try {
    const cid = localStorage.getItem("client_id")
    if (cid) currentClientID = cid
  } catch {}

  let mySmallID = null, myTeam = null, myAllies = new Set()
  const playersById = new Map()
  const playersBySmallId = new Map()
  let lastPlayers = []

  // Message buffering for timing fix
  const pendingMessages = []
  let playerDataReady = false

  // Resource tracking for alternative donation detection
  let lastMyGold = 0
  let lastMyTroops = 0
  // System status
  let gameViewHooked = false
  let displayEventsReceived = 0
  let donationsTracked = 0

  // Session tracking
  const sessionStartTime = Date.now()

  // Gold rate tracking
  const goldHistory = []
  let lastGoldDispatch = 0

  // Canvas tracking (for target selection)
  let worldTilesWidth = 0, worldTilesHeight = 0
  let screenCanvasWidth = 0, screenCanvasHeight = 0
  let targetCanvas = null
  let currentTransform = { a: 1, d: 1, e: 0, f: 0 }

  // City tracking
  const CITY_TROOP_INCREASE = 250000
  const cityById = new Map()
  const cityLevelSumByOwner = new Map()

  // Tile ownership
  const tileOwnerByRef = new Map()
  let lastTick = 0, lastTickMs = Date.now()
  let lastMouseClient = { x: 0, y: 0 }

  // Game socket
  let gameSocket = null

  // ===== UTILS =====
  const num = v => Number(v) || 0
  const nowDate = () => new Date()
  const fmtTime = d => d.toLocaleTimeString()
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]))
  const short = v => {
    v = Math.abs(num(v))
    if (v >= 1e6) return Math.round(v / 1e5) / 10 + 'M'
    if (v >= 1e3) return Math.round(v / 1e3) + 'k'
    return String(Math.round(v))
  }
  const fmtSec = sec => {
    sec = Math.max(0, Math.floor(sec))
    const m = Math.floor(sec / 60), s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }
  const fmtDuration = ms => {
    const sec = Math.floor(ms / 1000)
    const min = Math.floor(sec / 60)
    const hrs = Math.floor(min / 60)
    if (hrs > 0) return `${hrs}h ${min % 60}m`
    if (min > 0) return `${min}m ${sec % 60}s`
    return `${sec}s`
  }

  // ===== STATUS OVERLAY =====
  function showStatus(message, duration = 2000) {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      background: 'rgba(0,0,0,0.9)', color: '#7ff2a3', padding: '20px 40px',
      borderRadius: '12px', font: 'bold 16px Consolas, monospace',
      zIndex: '2147483647', boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
      border: '2px solid #7ff2a3', pointerEvents: 'none'
    })
    el.textContent = message
    document.body.appendChild(el)
    setTimeout(() => el.remove(), duration)
  }

  // ===== RECIPROCATION NOTIFICATION SYSTEM =====
  let reciprocateNotifications = []

  function showReciprocateNotification(donor) {
    console.log('[HAMMER][RECIPROCATE] showReciprocateNotification called for', donor.name, '| troops:', donor.troops, '| gold:', donor.gold)
    // Merge with existing notification from same donor if not dismissed
    const existing = reciprocateNotifications.find(n => n.donorId === donor.id && !n.dismissed)
    if (existing) {
      existing.troops += (donor.troops || 0)
      existing.gold += (donor.gold || 0)
      existing.timestamp = Date.now()
      debouncedRenderReciprocatePopup()
      return
    }

    reciprocateNotifications.push({
      id: Date.now(),
      donorId: donor.id,
      donorName: donor.name,
      troops: donor.troops || 0,
      gold: donor.gold || 0,
      timestamp: Date.now(),
      dismissed: false
    })

    if (reciprocateNotifications.length > 5) {
      reciprocateNotifications.shift()
    }

    debouncedRenderReciprocatePopup()
  }

  function dismissReciprocateNotification(notificationId) {
    const idx = reciprocateNotifications.findIndex(n => n.id === notificationId)
    if (idx >= 0) {
      reciprocateNotifications[idx].dismissed = true
    }
    debouncedRenderReciprocatePopup()
  }

  function clearReciprocateNotifications() {
    reciprocateNotifications = []
    const popup = document.getElementById('hm-reciprocate-popup')
    if (popup) popup.remove()
  }

  let _recipPopupTimer = null
  function debouncedRenderReciprocatePopup() {
    if (_recipPopupTimer) clearTimeout(_recipPopupTimer)
    _recipPopupTimer = setTimeout(() => {
      renderReciprocatePopup()
      _recipPopupTimer = null
    }, 150)
  }

  function renderReciprocatePopup() {
    let popup = document.getElementById('hm-reciprocate-popup')
    if (!popup) {
      popup = document.createElement('div')
      popup.id = 'hm-reciprocate-popup'
      document.body.appendChild(popup)
    }

    const active = reciprocateNotifications.filter(n => !n.dismissed)

    if (active.length === 0) {
      popup.style.display = 'none'
      return
    }

    const latest = active[active.length - 1]
    const me = readMyPlayer()
    const myGold = me ? Number(me.gold || 0n) : 0

    popup.style.cssText = `
      position: fixed;
      top: 120px;
      right: 20px;
      background: rgba(10, 20, 40, 0.98);
      border: 2px solid #7ff2a3;
      border-radius: 12px;
      padding: 20px;
      z-index: 2147483646;
      min-width: 320px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.8);
      font-family: Consolas, monospace;
      color: #fff;
    `

    popup.innerHTML = `
      <div style="font-size: 16px; font-weight: bold; margin-bottom: 12px; color: #7ff2a3;">
        ${latest.troops > 0 ? `🪖 ${esc(latest.donorName)} sent you ${short(latest.troops)} troops` : ''}
        ${latest.gold > 0 ? `💰 ${esc(latest.donorName)} sent you ${short(latest.gold)} gold` : ''}
      </div>
      <div style="font-size: 13px; margin-bottom: 12px; color: #9bb0c8;">
        You have ${short(myGold)} gold
      </div>
      <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px;">
        Send Gold Back:
      </div>
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        ${[10, 25, 50, 75, 100].map(pct => `
          <button
            data-reciprocate-pct="${pct}"
            data-reciprocate-id="${latest.id}"
            style="flex: 1; padding: 8px; background: #2a4a6a; color: #fff; border: 1px solid #7bb8ff; border-radius: 6px; cursor: pointer; font-weight: bold;"
            onmouseover="this.style.background='#3a5a7a'"
            onmouseout="this.style.background='#2a4a6a'"
          >
            ${pct}%<br><span style="font-size:10px">${short(Math.floor(myGold * pct / 100))}</span>
          </button>
        `).join('')}
      </div>
      <div style="display: flex; gap: 8px;">
        <button
          id="reciprocate-dismiss"
          style="flex: 1; padding: 6px; background: #3a2a2a; color: #ff8b94; border: 1px solid #ff8b94; border-radius: 4px; cursor: pointer; font-size: 12px;"
        >
          Dismiss
        </button>
        <button
          id="reciprocate-viewall"
          style="flex: 1; padding: 6px; background: #2a3a2a; color: #7bb8ff; border: 1px solid #7bb8ff; border-radius: 4px; cursor: pointer; font-size: 12px;"
        >
          View All (${active.length})
        </button>
      </div>
    `

    popup.style.display = 'block'

    setupReciprocatePopupHandlers(popup, latest)

    setTimeout(() => {
      dismissReciprocateNotification(latest.id)
    }, S.reciprocateNotifyDuration * 1000)
  }

  function setupReciprocatePopupHandlers(popup, notification) {
    popup.onclick = (e) => {
      const pctBtn = e.target.closest('[data-reciprocate-pct]')
      if (pctBtn) {
        const pct = parseInt(pctBtn.getAttribute('data-reciprocate-pct'))
        handleQuickReciprocate(notification.donorId, notification.donorName, pct, notification.id)
        return
      }
      if (e.target.closest('#reciprocate-dismiss')) {
        dismissReciprocateNotification(notification.id)
        return
      }
      if (e.target.closest('#reciprocate-viewall')) {
        S.view = 'reciprocate'
        clearReciprocateNotifications()
      }
    }
  }

  function handleQuickReciprocate(donorId, donorName, percentage, notificationId) {
    const me = readMyPlayer()
    if (!me) {
      showStatus('❌ Player data not available')
      return
    }

    const myGold = Number(me.gold || 0n)
    const goldToSend = Math.floor(myGold * percentage / 100)

    if (goldToSend === 0) {
      showStatus('❌ Not enough gold to send')
      if (notificationId) dismissReciprocateNotification(notificationId)
      return
    }

    const success = asSendGold(donorId, goldToSend)

    if (success) {
      S.reciprocateHistory.push({
        donorId,
        donorName,
        goldSent: goldToSend,
        percentage,
        timestamp: Date.now(),
        mode: 'manual'
      })

      if (S.reciprocateHistory.length > 100) {
        S.reciprocateHistory.shift()
      }

      showStatus(`✅ Sent ${short(goldToSend)} gold (${percentage}%) to ${donorName}`)
      if (notificationId) dismissReciprocateNotification(notificationId)
    } else {
      showStatus(`❌ Failed to send gold to ${donorName}`)
    }
  }

  function handleAutoReciprocate(donorId, donorName, troopsReceived) {
    console.log('[HAMMER][RECIPROCATE] handleAutoReciprocate called for', donorName, '| troops:', troopsReceived)
    // Check cooldown first
    const lastSent = reciprocateCooldowns.get(donorId)
    if (lastSent && (Date.now() - lastSent) < RECIPROCATE_COOLDOWN_MS) {
      log(`[RECIPROCATE] Cooldown active for ${donorName}, skipping`)
      return
    }

    // Add to pending queue instead of sending immediately
    const pending = {
      donorId,
      donorName,
      troopsReceived,
      addedAt: Date.now(),
      attempts: 0,
      maxAttempts: 5
    }

    reciprocatePending.push(pending)
    log(`[RECIPROCATE] Queued auto-send for ${donorName} (${troopsReceived} troops, queue size: ${reciprocatePending.length})`)
  }

  function processReciprocateQueue() {
    if (!S.reciprocateEnabled || S.reciprocateMode !== 'auto') {
      reciprocatePending.length = 0  // Clear queue if disabled
      return
    }

    if (reciprocatePending.length === 0) return

    const me = readMyPlayer()
    if (!me) {
      log('[RECIPROCATE] Player data not ready, deferring queue processing')
      return
    }

    const myGold = Number(me.gold || 0n)
    const now = Date.now()

    // Process up to 3 pending reciprocations per interval
    const toProcess = reciprocatePending.splice(0, 3)

    for (const pending of toProcess) {
      // Check if too old (5 minutes)
      if (now - pending.addedAt > 300000) {
        log(`[RECIPROCATE] Dropping stale request for ${pending.donorName} (age: ${Math.floor((now - pending.addedAt) / 1000)}s)`)
        continue
      }

      // Check cooldown
      const lastSent = reciprocateCooldowns.get(pending.donorId)
      if (lastSent && (now - lastSent) < RECIPROCATE_COOLDOWN_MS) {
        log(`[RECIPROCATE] Cooldown active for ${pending.donorName}, re-queueing`)
        reciprocatePending.push(pending)  // Re-queue
        continue
      }

      // Calculate gold to send
      const percentage = S.reciprocateAutoPct
      const goldToSend = Math.floor(myGold * percentage / 100)

      if (goldToSend === 0) {
        pending.attempts++
        if (pending.attempts < pending.maxAttempts) {
          log(`[RECIPROCATE] Not enough gold, re-queueing (attempt ${pending.attempts}/${pending.maxAttempts})`)
          reciprocatePending.push(pending)  // Re-queue for later
        } else {
          log(`[RECIPROCATE] Max attempts reached for ${pending.donorName}, dropping`)
        }
        continue
      }

      // Attempt to send gold
      const success = asSendGold(pending.donorId, goldToSend)

      if (success) {
        // Record in history
        S.reciprocateHistory.push({
          donorId: pending.donorId,
          donorName: pending.donorName,
          goldSent: goldToSend,
          percentage,
          troopsReceived: pending.troopsReceived,
          timestamp: Date.now(),
          mode: 'auto'
        })

        if (S.reciprocateHistory.length > 100) {
          S.reciprocateHistory.shift()
        }

        // Set cooldown
        reciprocateCooldowns.set(pending.donorId, now)

        showStatus(`✅ Auto-sent ${short(goldToSend)} gold (${percentage}%) to ${pending.donorName}`)
        log(`[RECIPROCATE] Successfully sent ${goldToSend} gold to ${pending.donorName} (queue size: ${reciprocatePending.length})`)
      } else {
        // Failed to send, retry
        pending.attempts++
        if (pending.attempts < pending.maxAttempts) {
          log(`[RECIPROCATE] Send failed, re-queueing (attempt ${pending.attempts}/${pending.maxAttempts})`)
          reciprocatePending.push(pending)  // Re-queue
        } else {
          log(`[RECIPROCATE] Max attempts reached for ${pending.donorName}, dropping`)
        }
      }
    }
  }

  // ===== RECIPROCATION QUEUE & COOLDOWN TRACKING =====
  const reciprocatePending = []  // Queue of pending reciprocations
  const reciprocateCooldowns = new Map()  // playerId → timestamp
  const RECIPROCATE_COOLDOWN_MS = 10000  // 10 seconds between sends to same player

  // ===== STATE =====
  const SIZES = [
    { w: 520, h: 420, bodyH: 372, label: 'S' },
    { w: 750, h: 580, bodyH: 532, label: 'M' },
    { w: 1000, h: 720, bodyH: 672, label: 'L' }
  ]

  const S = {
    view: 'autotroops',
    paused: false, minimized: false, sizeIdx: 1,
    seen: new Set(),

    // Donation tracking
    inbound: new Map(), outbound: new Map(), ports: new Map(),
    feedIn: [], feedOut: [], rawMessages: [],

    // Feature toggles
    goldRateEnabled: true,

    // Auto-donate troops state
    asTroopsRunning: false,
    asTroopsTargets: [],
    asTroopsRatio: 20,
    asTroopsThreshold: 50,
    asTroopsLastSend: {},
    asTroopsNextSend: {},
    asTroopsCooldownSec: 10,
    asTroopsLog: [],
    asTroopsAllTeamMode: false,

    // Auto-donate gold state (percentage-based like troops)
    asGoldRunning: false,
    asGoldTargets: [],
    asGoldRatio: 20,        // Send 20% of current gold
    asGoldThreshold: 0,      // No minimum threshold (send any amount)
    asGoldLastSend: {},
    asGoldNextSend: {},
    asGoldCooldownSec: 10,
    asGoldLog: [],
    asGoldAllTeamMode: false,

    // Reciprocation settings
    reciprocateEnabled: true,
    reciprocateMode: 'manual',         // 'manual' or 'auto'
    reciprocateAutoPct: 50,            // Percentage for auto mode
    reciprocateNotifySound: false,
    reciprocateNotifyDuration: 30,
    reciprocateOnTroops: true,       // Reciprocate when receiving troops
    reciprocateOnGold: false,        // Reciprocate when receiving gold
    reciprocatePopupsEnabled: true,  // Show popup notifications
    reciprocateHistory: [],

    // Comms state
    commsTargets: new Set(),         // Set of player IDs to send to
    commsGroupMode: null,            // null, 'all', 'all-team', 'all-non-team'
    commsOthersExpanded: false,      // Whether non-team block is expanded
    commsPendingQC: null,            // quickchat key awaiting target selection
    commsRecentSent: [],             // last 10 sent items { type, emoji/key, target, timestamp }

    // Alliance inline comms
    allianceCommsExpanded: null      // player ID whose comms panel is expanded (null = none)
  }

  function bump(map, key) {
    if (!map.has(key)) map.set(key, { gold: 0, troops: 0, count: 0, goldSends: 0, troopsSends: 0, last: null, lastDonorTroops: 0 })
    return map.get(key)
  }

  function bumpPorts(playerId, gold, t) {
    if (!S.ports.has(playerId))
      S.ports.set(playerId, { totalGold: 0, times: [], avgIntSec: 0, lastIntSec: 0, gpm: 0 })
    const p = S.ports.get(playerId)
    p.totalGold += gold
    p.times.push(t)
    if (p.times.length > 60) p.times.shift()
    if (p.times.length >= 2) {
      const diffs = []
      for (let i = 1; i < p.times.length; i++) diffs.push((p.times[i] - p.times[i - 1]) / 1000)
      const sum = diffs.reduce((a, b) => a + b, 0)
      p.avgIntSec = Math.round(sum / diffs.length)
      p.lastIntSec = Math.round(diffs[diffs.length - 1])
      p.gpm = Math.round(p.totalGold / ((sum / 60) || 0.0001))
    }
  }

  // ===== CITY TRACKING =====
  function addToOwnerSum(ownerID, deltaLevel) {
    if (typeof ownerID !== 'number') return
    const prev = cityLevelSumByOwner.get(ownerID) || 0
    cityLevelSumByOwner.set(ownerID, prev + deltaLevel)
  }

  function upsertCity(u) {
    const idKey = String(u.id)
    const newLevel = num(u.level)
    const newOwner = num(u.ownerID)
    const prev = cityById.get(idKey)
    if (u.isActive === false) {
      if (prev) {
        addToOwnerSum(prev.ownerID, -prev.level)
        cityById.delete(idKey)
      }
      return
    }
    if (prev) {
      if (prev.ownerID !== newOwner) {
        addToOwnerSum(prev.ownerID, -prev.level)
        addToOwnerSum(newOwner, newLevel)
      } else if (prev.level !== newLevel) {
        addToOwnerSum(newOwner, newLevel - prev.level)
      }
    } else {
      addToOwnerSum(newOwner, newLevel)
    }
    cityById.set(idKey, { ownerID: newOwner, level: newLevel })
  }

  function estimateMaxTroops(tilesOwned, smallID) {
    const tiles = Math.max(0, num(tilesOwned))
    const base = 2 * (Math.pow(tiles, 0.6) * 1000 + 50000)
    const cityLevels = cityLevelSumByOwner.get(num(smallID)) || 0
    return Math.max(0, Math.floor(base + cityLevels * CITY_TROOP_INCREASE))
  }

  function readMyPlayer() {
    let me = null
    if (currentClientID) me = lastPlayers.find(p => p.clientID === currentClientID)
    if (!me && mySmallID != null) me = lastPlayers.find(p => p.smallID === mySmallID)
    return me || null
  }

  // ===== ALLY/TEAMMATE HELPERS =====
  function getTeammates() {
    const me = readMyPlayer()
    if (!me || me.team == null) return []
    return [...playersById.values()]
      .filter(p => p.id !== me.id && p.team === me.team && p.isAlive)
      .sort((a, b) => (a.displayName || a.name || '').localeCompare(b.displayName || b.name || ''))
  }

  function getAllies() {
    const me = readMyPlayer()
    if (!me) return []
    return [...playersById.values()]
      .filter(p => p.id !== me.id && p.isAlive && myAllies.has(p.smallID))
      .sort((a, b) => (a.displayName || a.name || '').localeCompare(b.displayName || b.name || ''))
  }

  function asIsAlly(tid) {
    const p = playersById.get(tid)
    if (!p) return false
    if (p.team != null && myTeam != null && p.team === myTeam) return true
    if (myAllies.has(p.smallID)) return true
    return false
  }

  // ===== WORKER WRAPPER =====
  const OriginalWorker = window.Worker

  function onWorkerMessage(e) {
    const msg = e.data
    try {
      if (!msg || msg.type !== 'game_update' || !msg.gameUpdate) return
      const { updates } = msg.gameUpdate

      // Debug: log all update types present
      if (updates) {
        const presentTypes = Object.keys(updates).filter(k => updates[k]?.length > 0)
        if (presentTypes.length > 0) {
          log('[DEBUG] Update types present:', presentTypes.join(', '))
        }
      }

      if (msg.gameUpdate.tick) {
        lastTick = msg.gameUpdate.tick
        lastTickMs = Date.now()
      }

      // Player updates
      const players = updates?.[GameUpdateType.Player]
      if (players?.length) {
        lastPlayers = players.slice()
        playersById.clear()
        playersBySmallId.clear()
        for (const p of players) {
          if (!p) continue
          playersById.set(p.id, p)
          if (p.smallID != null) playersBySmallId.set(p.smallID, p)
        }

        let my = null
        if (currentClientID) my = players.find(p => p.clientID === currentClientID)
        if (!my) my = players.find(p => p.isAlive)
        if (my) {
          mySmallID = my.smallID ?? null
          myTeam = my.team ?? null
          myAllies = new Set(Array.isArray(my.allies) ? my.allies : [])
          if (S.goldRateEnabled) updateGoldRate(my)

          // Track resource changes for alternative donation detection
          const currentGold = Number(my.gold || 0)
          const currentTroops = Number(my.troops || 0)
          if (lastMyGold > 0 || lastMyTroops > 0) {
            const goldChange = currentGold - lastMyGold
            const troopChange = currentTroops - lastMyTroops
            if (goldChange !== 0 || troopChange !== 0) {
              log('[DEBUG] Resource change:', {
                goldChange,
                troopChange,
                newGold: currentGold,
                newTroops: currentTroops
              })
            }
          }
          lastMyGold = currentGold
          lastMyTroops = currentTroops
        }

        log('[DEBUG] Player update:', {
          count: players.length,
          mySmallID: mySmallID,
          playerMapSize: playersById.size,
          currentClientID: currentClientID
        })

        // Process buffered messages now that player data is ready
        if (!playerDataReady && mySmallID !== null) {
          playerDataReady = true
          log('[DEBUG] Player data ready, processing buffered messages:', pendingMessages.length)
          for (const bufferedMsg of pendingMessages) {
            try { processDisplayMessage(bufferedMsg) }
            catch (err) { log('Buffered message error:', err) }
          }
          pendingMessages.length = 0
        }
      }

      // Unit updates (city tracking)
      const units = updates?.[GameUpdateType.Unit]
      if (units?.length) {
        for (const u of units) {
          if (!u || u.id === undefined) continue
          const isCity = u.unitType === 'City'
          if (isCity) upsertCity(u)
        }
      }

      // Tile updates
      const packed = msg.gameUpdate?.packedTileUpdates
      if (packed?.length) {
        for (let i = 0; i < packed.length; i++) {
          try {
            let tu = packed[i]
            if (typeof tu === 'string') tu = BigInt(tu)
            const ref = Number(tu >> 16n)
            const state = Number(tu & 0xffffn)
            const ownerSmall = state & 0x0fff
            tileOwnerByRef.set(ref, ownerSmall)
          } catch {}
        }
      }

      // NOTE: DisplayEvent processing moved to GameView hook
      // DisplayEvents are not available in Worker messages - they're UI-layer only
      // See hookGameView() function for DisplayEvent interception
    } catch (err) {
      log('Worker message error:', err)
    }
  }

  function processDisplayMessage(msg) {
    if (!msg || typeof msg.messageType !== 'number') return

    S.rawMessages.push(msg)
    if (S.rawMessages.length > 100) S.rawMessages.shift()

    if (S.paused) return

    // Buffer messages until player data is ready (timing fix)
    if (!playerDataReady) {
      log('[DEBUG] Buffering message until players ready:', msg.message)
      pendingMessages.push(msg)
      return
    }

    const mt = msg.messageType
    const pid = msg.playerID
    const params = msg.params || {}
    const text = msg.message || ''

    // Log all incoming display messages for diagnostics
    console.log('[HAMMER] DisplayMessage:', { type: mt, pid, mySmallID, params: JSON.stringify(params).slice(0, 200) })

    if (pid !== mySmallID) {
      return
    }

    // Improved deduplication with timestamp
    const timestamp = Math.floor(Date.now() / 1000)  // 1-second granularity
    const key = `${mt}:${params.name || ''}:${params.troops || params.gold || ''}:${timestamp}`
    if (S.seen.has(key)) {
      log('[DEBUG] Duplicate message detected, skipping:', key)
      return
    }
    S.seen.add(key)

    const now = Date.now()

    // Extract values from params object (new structure)
    if (mt === MessageType.RECEIVED_TROOPS_FROM_PLAYER) {
      const name = params.name
      const amt = parseAmt(params.troops)
      if (name && amt > 0) {
        log('[DEBUG] Matched RECEIVED_TROOPS:', { name, amt, params })
        const from = findPlayer(name)
        if (from) {
          const donorPlayer = playersById.get(from.id)
          const donorTroopSnapshot = donorPlayer ? (donorPlayer.troops || 0) : 0
          const r = bump(S.inbound, from.id)
          r.troops += amt; r.count++; r.troopsSends++; r.last = nowDate()
          r.lastDonorTroops = donorTroopSnapshot
          S.feedIn.push({ ts: nowDate(), type: 'troops', name, amount: amt, isPort: false, donorTroops: donorTroopSnapshot })
          console.log('[HAMMER] Received troops from', name, ':', amt, '| Reciprocate enabled:', S.reciprocateEnabled, '| OnTroops:', S.reciprocateOnTroops, '| Mode:', S.reciprocateMode)
          if (S.feedIn.length > 500) S.feedIn.shift()
          donationsTracked++

          // Trigger reciprocation (manual or auto)
          if (S.reciprocateEnabled && S.reciprocateOnTroops) {
            if (S.reciprocateMode === 'auto') {
              handleAutoReciprocate(from.id, name, amt)
            } else if (S.reciprocatePopupsEnabled) {
              showReciprocateNotification({
                id: from.id,
                name: name,
                troops: amt,
                gold: 0
              })
            }
          }
        }
      } else {
        log('[DEBUG] No params for RECEIVED_TROOPS:', { params, text })
      }
    } else if (mt === MessageType.SENT_TROOPS_TO_PLAYER) {
      const name = params.name
      const amt = parseAmt(params.troops)
      if (name && amt > 0) {
        log('[DEBUG] Matched SENT_TROOPS:', { name, amt, params })
        const to = findPlayer(name)
        if (to) {
          const r = bump(S.outbound, to.id)
          r.troops += amt; r.count++; r.troopsSends++; r.last = nowDate()
          S.feedOut.push({ ts: nowDate(), type: 'troops', name, amount: amt, isPort: false })
          if (S.feedOut.length > 500) S.feedOut.shift()
          donationsTracked++
        }
      } else {
        log('[DEBUG] No params for SENT_TROOPS:', { params, text })
      }
    } else if (mt === MessageType.RECEIVED_GOLD_FROM_TRADE) {
      const name = params.name
      const amt = msg.goldAmount ? num(msg.goldAmount) : parseAmt(params.gold)
      if (name && amt > 0) {
        log('[DEBUG] Matched RECEIVED_GOLD_TRADE:', { name, amt, params })
        const from = findPlayer(name)
        if (from) {
          const donorPlayer = playersById.get(from.id)
          const donorTroopSnapshot = donorPlayer ? (donorPlayer.troops || 0) : 0
          const r = bump(S.inbound, from.id)
          r.gold += amt; r.count++; r.goldSends++; r.last = nowDate()
          r.lastDonorTroops = donorTroopSnapshot
          S.feedIn.push({ ts: nowDate(), type: 'gold', name, amount: amt, isPort: true, donorTroops: donorTroopSnapshot })
          if (S.feedIn.length > 500) S.feedIn.shift()
          bumpPorts(from.id, amt, now)
          donationsTracked++
        }
      } else {
        log('[DEBUG] No params for RECEIVED_GOLD_TRADE:', { params, text })
      }
    } else if (mt === MessageType.RECEIVED_GOLD_FROM_PLAYER) {
      const name = params.name
      const amt = msg.goldAmount ? num(msg.goldAmount) : parseAmt(params.gold)
      if (name && amt > 0) {
        log('[DEBUG] Matched RECEIVED_GOLD:', { name, amt, params })
        const from = findPlayer(name)
        if (from) {
          const donorPlayer = playersById.get(from.id)
          const donorTroopSnapshot = donorPlayer ? (donorPlayer.troops || 0) : 0
          const r = bump(S.inbound, from.id)
          r.gold += amt; r.count++; r.goldSends++; r.last = nowDate()
          r.lastDonorTroops = donorTroopSnapshot
          S.feedIn.push({ ts: nowDate(), type: 'gold', name, amount: amt, isPort: false, donorTroops: donorTroopSnapshot })
          console.log('[HAMMER] Received gold from', name, ':', amt, '| Reciprocate enabled:', S.reciprocateEnabled, '| OnGold:', S.reciprocateOnGold)
          if (S.feedIn.length > 500) S.feedIn.shift()
          donationsTracked++

          // Trigger reciprocation on gold received
          if (S.reciprocateEnabled && S.reciprocateOnGold) {
            if (S.reciprocateMode === 'auto') {
              handleAutoReciprocate(from.id, name, amt)
            } else if (S.reciprocatePopupsEnabled) {
              showReciprocateNotification({
                id: from.id,
                name: name,
                troops: 0,
                gold: amt
              })
            }
          }
        }
      } else {
        log('[DEBUG] No params for RECEIVED_GOLD:', { params, text })
      }
    } else if (mt === MessageType.SENT_GOLD_TO_PLAYER) {
      const name = params.name
      const amt = msg.goldAmount ? num(msg.goldAmount) : parseAmt(params.gold)
      if (name && amt > 0) {
        log('[DEBUG] Matched SENT_GOLD:', { name, amt, params })
        const to = findPlayer(name)
        if (to) {
          const r = bump(S.outbound, to.id)
          r.gold += amt; r.count++; r.goldSends++; r.last = nowDate()
          S.feedOut.push({ ts: nowDate(), type: 'gold', name, amount: amt, isPort: false })
          if (S.feedOut.length > 500) S.feedOut.shift()
          donationsTracked++
        }
      } else {
        log('[DEBUG] No params for SENT_GOLD:', { params, text })
      }
    }
  }

  function parseAmt(str) {
    if (!str) return 0
    const clean = String(str).replace(/,/g, '')
    const m = clean.match(/([\d\.]+)([KkMm])?/)
    if (!m) return 0
    let v = parseFloat(m[1])
    if (m[2]) v *= m[2].toUpperCase() === 'M' ? 1e6 : 1e3
    return Math.round(v)
  }

  function findPlayer(name) {
    if (!name || playersById.size === 0) return null
    const lower = String(name).toLowerCase()
    for (const p of playersById.values()) {
      const pn = (p.displayName || p.name || '').toLowerCase()
      if (pn === lower) return { id: p.id, name: p.displayName || p.name || name }
    }
    return null
  }

  function updateGoldRate(my) {
    const now = Date.now()
    goldHistory.push({ t: now, g: my.gold, name: my.displayName || my.name })
    const cutoff = now - MAX_AGE_MS
    while (goldHistory.length && goldHistory[0].t < cutoff) goldHistory.shift()

    if (now - lastGoldDispatch < 200) return
    lastGoldDispatch = now

    function rate(winMs) {
      const seg = goldHistory.filter(e => e.t >= now - winMs)
      if (seg.length < 2) return { gps: 0, gpm: 0 }
      const f = seg[0], l = seg[seg.length - 1]
      const dtSec = Math.max(1, (l.t - f.t) / 1000)
      let posDiff = 0n
      for (let i = 1; i < seg.length; i++) {
        const d = BigInt(seg[i].g) - BigInt(seg[i - 1].g)
        if (d > 0n) posDiff += d
      }
      const gps = Number(posDiff) / dtSec
      return { gps, gpm: gps * 60 }
    }

    S.gps30 = rate(30000).gps
    S.gpm60 = rate(60000).gpm
    S.gpm120 = rate(120000).gpm
  }

  function wrapWorker(w) {
    if (!w || w.__hammerWrapped) return w
    w.__hammerWrapped = true
    const origPost = w.postMessage
    w.postMessage = function(data, ...rest) {
      try {
        if (data?.type === 'init' && data.clientID) {
          console.log('[CLIENTID] Worker init message, clientID:', data.clientID)
          if (currentClientID && currentClientID !== data.clientID) {
            console.warn('[CLIENTID] ⚠️ MISMATCH! Previous:', currentClientID, 'New:', data.clientID)
          }
          currentClientID = data.clientID
        }
      } catch {}
      return origPost.call(this, data, ...rest)
    }
    w.addEventListener('message', onWorkerMessage)
    console.log('[HAMMER] ✅ Wrapped Worker instance')
    return w
  }

  // Setup Worker wrapper for future instances
  class WrappedWorker extends OriginalWorker {
    constructor(...args) {
      super(...args)
      wrapWorker(this)
    }
  }

  Object.defineProperty(window, 'Worker', {
    configurable: true,
    writable: true,
    value: WrappedWorker
  })

  // Discover and wrap EXISTING Worker instances - including deep search in game components
  let foundWorker = false

  function deepFindWorker() {
    // Try window properties first
    try {
      for (let prop in window) {
        try {
          const val = window[prop]
          if (val && val instanceof OriginalWorker && !val.__hammerWrapped) {
            console.log(`[HAMMER] 🔍 Found existing Worker at window.${prop}`)
            wrapWorker(val)
            foundWorker = true
            return true
          }
        } catch {}
      }
    } catch {}

    // Try common window property names
    const commonProps = ['gameWorker', 'worker', '_worker', 'mainWorker']
    for (const prop of commonProps) {
      try {
        if (window[prop] && window[prop] instanceof OriginalWorker && !window[prop].__hammerWrapped) {
          console.log(`[HAMMER] 🔍 Found existing Worker at window.${prop}`)
          wrapWorker(window[prop])
          foundWorker = true
          return true
        }
      } catch {}
    }

    // Deep search: look inside game-view component
    try {
      const gameView = document.querySelector('game-view')
      if (gameView) {
        // Worker is nested inside WorkerClient: runner.worker.worker
        const workerClient = gameView.clientGameRunner?.worker
        if (workerClient?.worker && !workerClient.worker.__hammerWrapped) {
          console.log('[HAMMER] 🔍 Found Worker in game-view.clientGameRunner.worker.worker')
          wrapWorker(workerClient.worker)
          foundWorker = true
          return true
        }
      }
    } catch (e) {
      console.warn('[HAMMER] Deep Worker search error:', e)
    }

    // Deep search: look inside events-display.game (singleplayer/team mode)
    try {
      const eventsDisplay = document.querySelector('events-display')
      if (eventsDisplay?.game?.worker) {
        const workerClient = eventsDisplay.game.worker
        // Worker might be nested: workerClient.worker
        const actualWorker = workerClient.worker || workerClient
        if (actualWorker && !actualWorker.__hammerWrapped && actualWorker instanceof OriginalWorker) {
          console.log('[HAMMER] 🔍 Found Worker in events-display.game.worker')
          wrapWorker(actualWorker)
          foundWorker = true
          return true
        }
      }
    } catch (e) {
      console.warn('[HAMMER] Deep Worker search (events-display) error:', e)
    }

    return false
  }

  deepFindWorker()

  if (!foundWorker) {
    console.log('[HAMMER] ⚠️ No existing Worker found - will intercept when created')
    // Retry deep search after a delay (game might still be initializing)
    setTimeout(() => {
      if (!foundWorker) {
        console.log('[HAMMER] 🔄 Retrying Worker discovery...')
        deepFindWorker()
      }
    }, 500)
  }

  // ===== WEBSOCKET WRAPPER =====
  const OriginalWebSocket = window.WebSocket

  function wrapWebSocket(ws) {
    if (!ws || ws.__hammerWrapped) return ws
    ws.__hammerWrapped = true

    const origSend = ws.send
    ws.send = function(data) {
      try {
        if (typeof data === 'string') {
          const obj = JSON.parse(data)

          // Log ALL intent messages for debugging
          if (obj?.type === 'intent') {
            console.log('[WEBSOCKET] 📤 OUTGOING INTENT:', JSON.stringify(obj, null, 2))

            // Highlight donation intents specifically
            if (obj.intent?.type === 'donate_gold' || obj.intent?.type === 'donate_troops') {
              console.log('[WEBSOCKET] 💰 DONATION INTENT DETECTED:', obj.intent)
              console.log('[CLIENTID] 💰 DONATION USES clientID:', obj.intent.clientID)
              if (obj.intent.clientID !== currentClientID) {
                console.error('[CLIENTID] ❌ CRITICAL: Donation clientID differs from hammer clientID!')
                console.error('[CLIENTID]    Donation uses:', obj.intent.clientID)
                console.error('[CLIENTID]    Hammer uses:', currentClientID)
              } else {
                console.log('[CLIENTID] ✅ Donation clientID matches hammer clientID')
              }
            }

            gameSocket = this
          }

          if (obj?.type === 'join' && obj.clientID) {
            console.log('[CLIENTID] WebSocket join message, clientID:', obj.clientID)
            if (currentClientID && currentClientID !== obj.clientID) {
              console.warn('[CLIENTID] ⚠️ MISMATCH! Previous:', currentClientID, 'New:', obj.clientID)
            }
            currentClientID = obj.clientID
            gameSocket = this
            console.log('[WEBSOCKET] 🎮 Client joined, ID:', obj.clientID)
          }
        }
      } catch {}
      return origSend.call(this, data)
    }

    // Log incoming messages related to donations
    ws.addEventListener('message', ev => {
      try {
        if (!ev?.data) return
        const obj = typeof ev.data === 'string' ? JSON.parse(ev.data) : null

        if (obj && (obj.type === 'turn' || obj.type === 'start' || obj.type === 'ping')) {
          gameSocket = ws
        }

        // Log any donation-related server responses
        if (obj?.type === 'error' || obj?.error) {
          console.log('[WEBSOCKET] ❌ SERVER ERROR:', obj)
        }
      } catch {}
    })

    gameSocket = ws
    console.log('[HAMMER] ✅ Wrapped WebSocket instance')
    return ws
  }

  class WrappedWebSocket extends OriginalWebSocket {
    constructor(url, protocols) {
      super(url, protocols)
      wrapWebSocket(this)
    }
  }

  Object.defineProperty(window, 'WebSocket', {
    configurable: true,
    writable: true,
    value: WrappedWebSocket
  })

  // Discover and wrap EXISTING WebSocket instances - including deep search
  let foundWebSocket = false

  function deepFindWebSocket() {
    // Try window properties first
    try {
      for (let prop in window) {
        try {
          const val = window[prop]
          if (val && val instanceof OriginalWebSocket && !val.__hammerWrapped) {
            console.log(`[HAMMER] 🔍 Found existing WebSocket at window.${prop}`)
            wrapWebSocket(val)
            foundWebSocket = true
            return true
          }
        } catch {}
      }
    } catch {}

    // Try common window property names
    const commonProps = ['socket', 'ws', 'gameSocket', '_socket', 'connection']
    for (const prop of commonProps) {
      try {
        if (window[prop] && window[prop] instanceof OriginalWebSocket && !window[prop].__hammerWrapped) {
          console.log(`[HAMMER] 🔍 Found existing WebSocket at window.${prop}`)
          wrapWebSocket(window[prop])
          foundWebSocket = true
          return true
        }
      } catch {}
    }

    // Deep search: look inside game-view component
    try {
      const gameView = document.querySelector('game-view')
      if (gameView) {
        // Try clientGameRunner.transport.socket
        const transport = gameView.clientGameRunner?.transport
        if (transport?.socket && !transport.socket.__hammerWrapped) {
          console.log('[HAMMER] 🔍 Found WebSocket in game-view.clientGameRunner.transport.socket')
          wrapWebSocket(transport.socket)
          foundWebSocket = true
          gameSocket = transport.socket
          return true
        }
        // Try clientGameRunner.transport.ws
        if (transport?.ws && !transport.ws.__hammerWrapped) {
          console.log('[HAMMER] 🔍 Found WebSocket in game-view.clientGameRunner.transport.ws')
          wrapWebSocket(transport.ws)
          foundWebSocket = true
          gameSocket = transport.ws
          return true
        }
      }
    } catch (e) {
      console.warn('[HAMMER] Deep WebSocket search error:', e)
    }

    // Deep search: look inside events-display.game (singleplayer/team mode)
    try {
      const eventsDisplay = document.querySelector('events-display')
      if (eventsDisplay?.game?.worker) {
        // In singleplayer mode, WebSocket might be in worker's transport
        const workerClient = eventsDisplay.game.worker
        if (workerClient?.transport?.socket && !workerClient.transport.socket.__hammerWrapped) {
          console.log('[HAMMER] 🔍 Found WebSocket in events-display.game.worker.transport.socket')
          wrapWebSocket(workerClient.transport.socket)
          foundWebSocket = true
          gameSocket = workerClient.transport.socket
          return true
        }
      }
    } catch (e) {
      console.warn('[HAMMER] Deep WebSocket search (events-display) error:', e)
    }

    return false
  }

  deepFindWebSocket()

  if (!foundWebSocket) {
    console.log('[HAMMER] ⚠️ No existing WebSocket found - will intercept when created')
    // Retry deep search
    setTimeout(() => {
      if (!foundWebSocket) {
        console.log('[HAMMER] 🔄 Retrying WebSocket discovery...')
        deepFindWebSocket()
      }
    }, 500)
  }

  // ===== BOOTSTRAP PLAYER DATA FROM GAME (for mid-match injection) =====
  function bootstrapPlayerData() {
    // Try game-view path first (multiplayer)
    try {
      const gameView = document.querySelector('game-view')
      if (gameView?.clientGameRunner) {
        const runner = gameView.clientGameRunner

        // Get clientID from lobby (not lobbyConfig)
        if (runner.lobby?.clientID && !currentClientID) {
          currentClientID = runner.lobby.clientID
          console.log('[HAMMER] 🆔 Bootstrapped clientID from game-view:', currentClientID)
        }

        // Try to get players from gameView
        const gv = runner.gameView
        if (gv?.players) {
          const playersFunc = typeof gv.players === 'function' ? gv.players() : gv.players
          const playerList = playersFunc instanceof Map ? [...playersFunc.values()] :
                            Array.isArray(playersFunc) ? playersFunc : []

          if (playerList.length > 0) {
            return bootstrapPlayersFromList(playerList, 'game-view')
          }
        }
      }
    } catch (e) {
      console.warn('[HAMMER] Bootstrap (game-view) error:', e)
    }

    // Try events-display.game path (singleplayer/team mode)
    try {
      const eventsDisplay = document.querySelector('events-display')
      if (eventsDisplay?.game) {
        const game = eventsDisplay.game

        // Get clientID from _myClientID
        if (game._myClientID && !currentClientID) {
          currentClientID = game._myClientID
          console.log('[HAMMER] 🆔 Bootstrapped clientID from events-display:', currentClientID)
        }

        // Try to get players from _players
        if (game._players) {
          const playersMap = game._players
          const playerList = playersMap instanceof Map ? [...playersMap.values()] :
                            Array.isArray(playersMap) ? playersMap :
                            Object.values(playersMap)

          if (playerList.length > 0) {
            return bootstrapPlayersFromList(playerList, 'events-display')
          }
        }

        // Also try _myPlayer directly if we have clientID
        if (game._myPlayer && currentClientID) {
          const p = game._myPlayer
          const smallID = typeof p.smallID === 'function' ? p.smallID() : p.smallID
          if (smallID != null) {
            mySmallID = smallID
            myTeam = typeof p.team === 'function' ? p.team() : p.team
            playerDataReady = true
            console.log('[HAMMER] 🎮 Bootstrapped myPlayer from events-display - mySmallID:', mySmallID)
            return true
          }
        }
      }
    } catch (e) {
      console.warn('[HAMMER] Bootstrap (events-display) error:', e)
    }

    return false
  }

  // Helper to bootstrap players from a list
  function bootstrapPlayersFromList(playerList, source) {
    for (const p of playerList) {
      if (!p) continue
      // Players might be PlayerView objects with methods
      const id = typeof p.id === 'function' ? p.id() : p.id
      const smallID = typeof p.smallID === 'function' ? p.smallID() : p.smallID
      const clientID = typeof p.clientID === 'function' ? p.clientID() : p.clientID
      const name = typeof p.name === 'function' ? p.name() : (p.displayName || p.name)
      const isAlive = typeof p.isAlive === 'function' ? p.isAlive() : p.isAlive
      const team = typeof p.team === 'function' ? p.team() : p.team
      const troops = typeof p.troops === 'function' ? p.troops() : p.troops
      const gold = typeof p.gold === 'function' ? p.gold() : p.gold

      const playerData = { id, smallID, clientID, name, displayName: name, isAlive, team, troops, gold }
      playersById.set(id, playerData)
      if (smallID != null) playersBySmallId.set(smallID, playerData)

      // Find our player
      if (clientID === currentClientID) {
        mySmallID = smallID
        myTeam = team
        playerDataReady = true
        console.log('[HAMMER] 🎮 Bootstrapped player data from', source, '- mySmallID:', mySmallID)
      }
    }

    if (playersById.size > 0) {
      console.log('[HAMMER] 📊 Bootstrapped', playersById.size, 'players from', source)
      playerDataReady = true
      return true
    }
    return false
  }

  // Try to bootstrap immediately and after delays
  setTimeout(bootstrapPlayerData, 100)
  setTimeout(bootstrapPlayerData, 500)
  setTimeout(bootstrapPlayerData, 1000)

  // Legacy compatibility - keep old code path but it won't match anymore
  // (the deepFindWebSocket above handles everything now)
  try {
    const commonPropsLegacy = ['socket', 'ws', 'gameSocket', '_socket', 'connection']
    for (const prop of commonPropsLegacy) {
      try {
        if (window[prop] && window[prop] instanceof OriginalWebSocket && !window[prop].__hammerWrapped) {
          console.log(`[HAMMER] 🔍 Found existing WebSocket at window.${prop}`)
          wrapWebSocket(window[prop])
          foundWebSocket = true
        }
      } catch {}
    }
  } catch (e) {
    console.warn('[HAMMER] WebSocket discovery error:', e)
  }

  if (!foundWebSocket) {
    console.log('[HAMMER] ⚠️ No existing WebSocket found - will intercept when created')
  }

  // ===== EVENTBUS DISCOVERY =====
  let eventBus = null
  let eventBusAttempts = 0
  const maxEventBusAttempts = 50

  function onEventBusFound() {
    // Run initial scan and discovery as soon as EventBus is available
    setTimeout(() => {
      scanAllEventClasses()
      discoverDonationEventClasses()
    }, 100)
  }

  function findEventBus() {
    if (eventBus) return true

    eventBusAttempts++
    console.log(`[HAMMER] EventBus search attempt ${eventBusAttempts}/${maxEventBusAttempts}`)

    // Try to find EventBus via events-display element
    try {
      const eventsDisplay = document.querySelector('events-display')
      if (eventsDisplay && eventsDisplay.eventBus) {
        eventBus = eventsDisplay.eventBus
        console.log('[HAMMER] Found EventBus via events-display')
        onEventBusFound()
        return true
      }
    } catch (e) {
      log('[DEBUG] EventBus search via events-display failed:', e)
    }

    // Try to find EventBus via game-view element
    try {
      const gameView = document.querySelector('game-view')
      if (gameView && gameView.eventBus) {
        eventBus = gameView.eventBus
        console.log('[HAMMER] Found EventBus via game-view')
        onEventBusFound()
        return true
      }
    } catch (e) {
      log('[DEBUG] EventBus search via game-view failed:', e)
    }

    // Try common property names
    const commonProps = ['eventBus', '_eventBus', 'bus', 'events']
    for (const prop of commonProps) {
      try {
        if (window[prop] && typeof window[prop].emit === 'function') {
          eventBus = window[prop]
          console.log(`[HAMMER] Found EventBus at window.${prop}`)
          onEventBusFound()
          return true
        }
      } catch {}
    }

    eventBusAttempts++
    if (eventBusAttempts < maxEventBusAttempts) {
      setTimeout(findEventBus, 200)
    } else {
      log('[ERROR] Failed to find EventBus after', maxEventBusAttempts, 'attempts')
      log('[ERROR] Will fall back to direct WebSocket intents')
    }

    return false
  }

  // Search for EventBus periodically until found
  const eventBusSearchInterval = setInterval(() => {
    if (findEventBus()) clearInterval(eventBusSearchInterval)
  }, 200)
  eventCleanup.push(() => clearInterval(eventBusSearchInterval))

  // ===== GAMEVIEW HOOK FOR DISPLAYEVENTS =====
  // Clear stale hooks from previous script injections at startup
  function clearStaleHooks() {
    try {
      const eventsDisplay = document.querySelector('events-display')
      if (eventsDisplay?.game?.__hammerHooked) {
        console.log('[HAMMER] Clearing stale hook from previous session')
        delete eventsDisplay.game.__hammerHooked
      }
      if (eventsDisplay?.__hammerComponentHooked) {
        console.log('[HAMMER] Clearing stale component hook from previous session')
        delete eventsDisplay.__hammerComponentHooked
      }
    } catch (e) {
      // Ignore errors during cleanup
    }
  }

  // Run cleanup immediately
  clearStaleHooks()

  function hookGameView() {
    // Try to find GameView instance via EventsDisplay element
    const eventsDisplay = document.querySelector('events-display')

    // Diagnostic logging
    if (!eventsDisplay) {
      log('[DEBUG] GameView hook attempt: events-display element not found')
      return false
    }

    if (!eventsDisplay.game) {
      log('[DEBUG] GameView hook attempt: events-display found but .game property not set')
      return false
    }

    const gameView = eventsDisplay.game

    if (!gameView.updatesSinceLastTick) {
      log('[ERROR] GameView found but no updatesSinceLastTick method')
      return false
    }

    // Check if already hooked by THIS session (not stale)
    if (gameView.__hammerHooked && gameViewHooked) {
      log('[DEBUG] GameView already hooked by this session')
      return true
    }

    // Clear stale hook if present
    if (gameView.__hammerHooked && !gameViewHooked) {
      console.log('[HAMMER] Re-hooking GameView (stale hook detected)')
      delete gameView.__hammerHooked
    }

    const originalUpdatesSinceLastTick = gameView.updatesSinceLastTick.bind(gameView)

    gameView.updatesSinceLastTick = function() {
      const updates = originalUpdatesSinceLastTick()

      if (updates) {
        // Process DisplayEvents (type 3)
        const displayEvents = updates[GameUpdateType.DisplayEvent]
        if (displayEvents?.length) {
          displayEventsReceived += displayEvents.length
          log('[DEBUG] DisplayEvents from GameView:', displayEvents.length)
          for (const evt of displayEvents) {
            try {
              processDisplayMessage(evt)
            } catch (err) {
              log('[ERROR] DisplayEvent processing error:', err)
            }
          }
        }
      }

      return updates
    }

    gameView.__hammerHooked = true
    gameViewHooked = true
    console.log('[HAMMER] ✅ Successfully hooked GameView.updatesSinceLastTick() after', gameViewHookAttempts, 'attempts')
    return true
  }

  // Try to hook GameView with multiple strategies
  let gameViewHookAttempts = 0
  const maxGameViewAttempts = 200 // 20 seconds max (increased from 5)
  let hookCheckInterval = null

  function tryHookGameView() {
    if (hookGameView()) {
      log('[HAMMER] GameView hook successful')
      if (hookCheckInterval) {
        clearInterval(hookCheckInterval)
        hookCheckInterval = null
      }
      return true
    }

    gameViewHookAttempts++
    if (gameViewHookAttempts >= maxGameViewAttempts) {
      log('[ERROR] Failed to hook GameView after', maxGameViewAttempts, 'attempts')
      log('[ERROR] Donation tracking will NOT work - DisplayEvents cannot be captured')
      if (hookCheckInterval) {
        clearInterval(hookCheckInterval)
        hookCheckInterval = null
      }
      return false
    }

    return false
  }

  // Periodic GameView hook attempts until successful
  hookCheckInterval = setInterval(() => {
    if (!gameViewHooked) {
      tryHookGameView()
    } else {
      clearInterval(hookCheckInterval)
      hookCheckInterval = null
    }
  }, 100)  // Check every 100ms for faster mid-match hooking
  eventCleanup.push(() => {
    if (hookCheckInterval) clearInterval(hookCheckInterval)
  })

  // Immediate hook attempts for mid-match start (try immediately, then at 50ms, 100ms, 250ms, 500ms)
  tryHookGameView()  // Immediate
  setTimeout(tryHookGameView, 50)
  setTimeout(tryHookGameView, 100)
  setTimeout(tryHookGameView, 250)
  setTimeout(tryHookGameView, 500)

  // Status log after 1 second
  setTimeout(() => {
    if (gameViewHooked) {
      console.log('[HAMMER] ✅ Donation tracking ready')
    } else {
      console.log('[HAMMER] ⏳ Still waiting for game to load... (this is normal if in lobby)')
    }
  }, 1000)


  // ===== CANVAS INTERCEPTION =====
  try {
    const proto = CanvasRenderingContext2D.prototype
    origSetTransform = proto.setTransform
    proto.setTransform = function(a, b, c, d, e, f) {
      try {
        const canvas = this.canvas
        if (canvas?.width && canvas.height) {
          targetCanvas = canvas
          // Handle DOMMatrix object form: ctx.setTransform(matrix)
          if (typeof a === 'object' && a !== null) {
            currentTransform = { a: a.a || 1, d: a.d || 1, e: a.e || 0, f: a.f || 0 }
          } else {
            currentTransform = { a: num(a) || 1, d: num(d) || 1, e: num(e) || 0, f: num(f) || 0 }
          }
          screenCanvasWidth = canvas.width | 0
          screenCanvasHeight = canvas.height | 0
        }
      } catch {}
      return origSetTransform.apply(this, arguments)
    }

    origDrawImage = proto.drawImage
    proto.drawImage = function(img) {
      try {
        if (img instanceof HTMLCanvasElement && arguments.length === 5) {
          const w = Math.round(num(arguments[3]))
          const h = Math.round(num(arguments[4]))
          if (w * h > worldTilesWidth * worldTilesHeight) {
            worldTilesWidth = w
            worldTilesHeight = h
          }
        }
      } catch {}
      return origDrawImage.apply(this, arguments)
    }

    // Immediate canvas detection for mid-game reruns
    setTimeout(() => {
      if (!targetCanvas) {
        const canvases = document.querySelectorAll('canvas')
        for (const canvas of canvases) {
          if (canvas.width > 800 && canvas.height > 600) {
            targetCanvas = canvas
            screenCanvasWidth = canvas.width
            screenCanvasHeight = canvas.height
            console.log('[HAMMER] 🎨 Found existing game canvas:', canvas.width, 'x', canvas.height)
            break
          }
        }
      }
    }, 100)
  } catch (e) {
    console.warn('[HAMMER] Canvas interception error:', e)
  }

  // ===== MOUSE TRACKING =====
  const mouseMoveHandler = (e) => {
    lastMouseClient.x = e.clientX
    lastMouseClient.y = e.clientY
  }
  window.addEventListener('mousemove', mouseMoveHandler, true)
  eventCleanup.push(() => window.removeEventListener('mousemove', mouseMoveHandler, true))

  // ===== KEYBOARD SHORTCUTS =====
  function captureMouseTarget() {
    try {
      if (!targetCanvas || !worldTilesWidth || !worldTilesHeight) {
        showStatus('❌ Game map not ready')
        return
      }

      const rect = targetCanvas.getBoundingClientRect()
      // Convert CSS pixels to canvas pixels (handles high-DPI/CSS scaling)
      const pixelX = (lastMouseClient.x - rect.left) * (screenCanvasWidth / rect.width)
      const pixelY = (lastMouseClient.y - rect.top) * (screenCanvasHeight / rect.height)
      // Invert setTransform to get transform-space coordinates
      const txX = (pixelX - currentTransform.e) / currentTransform.a
      const txY = (pixelY - currentTransform.f) / currentTransform.d
      // Transform space → tile coordinates (terrain drawn at -mapWidth/2, -mapHeight/2)
      const mouseWorldX = Math.floor(txX + worldTilesWidth / 2)
      const mouseWorldY = Math.floor(txY + worldTilesHeight / 2)
      const tileRef = mouseWorldY * worldTilesWidth + mouseWorldX

      const ownerSmallID = tileOwnerByRef.get(tileRef)
      if (ownerSmallID == null || ownerSmallID === 0) {
        showStatus('❌ No player owns this tile')
        return
      }

      const player = playersBySmallId.get(ownerSmallID)
      if (!player) {
        showStatus(`❌ Player not found (ID: ${ownerSmallID})`)
        return
      }

      const playerName = player.displayName || player.name || `Player ${ownerSmallID}`

      if (!S.asTroopsTargets.includes(playerName)) {
        S.asTroopsTargets.push(playerName)
      }
      if (!S.asGoldTargets.includes(playerName)) {
        S.asGoldTargets.push(playerName)
      }

      showStatus(`✅ Added: ${playerName}`, 3000)
    } catch (err) {
      console.error('[HAMMER] ALT+M error:', err)
      showStatus('❌ Failed to capture target')
    }
  }

  // FIXED: Use capture phase and stopImmediatePropagation to intercept BEFORE game
  const keydownHandler = (e) => {
    let handled = false

    if (e.altKey && e.code === 'KeyM') {
      e.preventDefault()
      e.stopImmediatePropagation()
      captureMouseTarget()
      handled = true
    }

    if (e.altKey && e.code === 'KeyF') {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (Date.now() - asTroopsLastToggle < 600) { handled = true; return false }
      if (S.asTroopsRunning) {
        asTroopsStop()
        showStatus('⏸️ Auto-Feeder STOPPED')
      } else {
        if (!S.asTroopsTargets.length && !S.asTroopsAllTeamMode) {
          showStatus('❌ Set targets first (ALT+M or AllTeam mode)')
        } else {
          asTroopsStart()
          showStatus('▶️ Auto-Feeder STARTED')
        }
      }
      handled = true
    }


    if (handled) return false
  }

  // CRITICAL: Use capture phase (true) to intercept BEFORE the game
  window.addEventListener('keydown', keydownHandler, true)
  eventCleanup.push(() => window.removeEventListener('keydown', keydownHandler, true))

  // Helper to get actual PlayerView instance from GameView (multiplayer) or events-display (singleplayer)
  function getPlayerView(playerId) {
    try {
      // Try multiplayer mode first (game-view element)
      const gameView = document.querySelector('game-view')
      if (gameView?.clientGameRunner?.gameView?.players) {
        const players = gameView.clientGameRunner.gameView.players

        // Try as Map first
        if (players.get) {
          const playerView = players.get(playerId)
          if (playerView) return playerView
        }

        // Try as array
        if (Array.isArray(players)) {
          return players.find(p => p && p.id && p.id() === playerId)
        }

        // Try iterating
        for (const p of players) {
          if (p && p.id && p.id() === playerId) return p
        }
      }

      // Try singleplayer mode (events-display element)
      const eventsDisplay = document.querySelector('events-display')
      if (eventsDisplay?.game?.players) {
        const players = eventsDisplay.game.players()  // It's a function in singleplayer!

        if (Array.isArray(players)) {
          const found = players.find(p => p && p.id && p.id() === playerId)
          if (found) {
            log('[AUTO-SEND] ✅ Found PlayerView via events-display (singleplayer mode)')
            return found
          }
        }
      }

      log('[AUTO-SEND] ❌ PlayerView not found for ID:', playerId)
      return null
    } catch (err) {
      log('[AUTO-SEND] Error getting PlayerView:', err)
      return null
    }
  }

  // Cache for discovered event classes
  let donateGoldEventClass = null
  let donateTroopsEventClass = null
  let emojiEventClass = null
  let quickChatEventClass = null
  let discoveryMethod = { troops: null, gold: null } // 'property', 'prototype', 'cached', 'hardcoded'
  let lastScanResults = [] // stores probe results for diagnostics UI

  // Probe a single event class for donation-related properties
  function probeEventClass(EventClass) {
    const result = {
      name: EventClass.name,
      class: EventClass,
      properties: [],
      prototypeKeys: [],
      hasRecipient: false,
      hasTroops: false,
      hasGold: false,
      hasEmoji: false,
      hasQuickChatKey: false,
      constructable: false,
      constructableWithArgs: false,
      isDonation: false,
      donationType: null, // 'troops', 'gold', 'emoji', or 'quick_chat'
    }

    // Check prototype for getter/method names
    try {
      result.prototypeKeys = Object.getOwnPropertyNames(EventClass.prototype)
        .filter(k => k !== 'constructor')
    } catch {}

    // Try default constructor
    try {
      const inst = new EventClass()
      result.constructable = true
      result.properties = Object.keys(inst)
      result.hasRecipient = 'recipient' in inst
      result.hasTroops = 'troops' in inst
      result.hasGold = 'gold' in inst
      result.hasEmoji = 'emoji' in inst
      result.hasQuickChatKey = 'quickChatKey' in inst
    } catch {}

    // Try constructor with args if default failed or missed properties
    if (!result.constructable || (!result.hasRecipient && !result.hasTroops && !result.hasGold)) {
      try {
        const inst = new EventClass(null, 0)
        result.constructableWithArgs = true
        const keys = Object.keys(inst)
        if (keys.length > result.properties.length) result.properties = keys
        if (!result.hasRecipient) result.hasRecipient = 'recipient' in inst
        if (!result.hasTroops) result.hasTroops = 'troops' in inst
        if (!result.hasGold) result.hasGold = 'gold' in inst
        if (!result.hasEmoji) result.hasEmoji = 'emoji' in inst
        if (!result.hasQuickChatKey) result.hasQuickChatKey = 'quickChatKey' in inst
      } catch {}
    }

    // Also check prototype keys for properties
    if (!result.hasRecipient) result.hasRecipient = result.prototypeKeys.includes('recipient')
    if (!result.hasTroops) result.hasTroops = result.prototypeKeys.includes('troops')
    if (!result.hasGold) result.hasGold = result.prototypeKeys.includes('gold')
    if (!result.hasEmoji) result.hasEmoji = result.prototypeKeys.includes('emoji')
    if (!result.hasQuickChatKey) result.hasQuickChatKey = result.prototypeKeys.includes('quickChatKey')

    // Classify
    if (result.hasRecipient && result.hasTroops) {
      result.isDonation = true
      result.donationType = 'troops'
    } else if (result.hasRecipient && result.hasGold) {
      result.isDonation = true
      result.donationType = 'gold'
    } else if (result.hasRecipient && result.hasEmoji) {
      result.donationType = 'emoji'
    } else if (result.hasRecipient && result.hasQuickChatKey) {
      result.donationType = 'quick_chat'
    }

    return result
  }

  // Scan all EventBus classes and return probe results
  function scanAllEventClasses() {
    if (!eventBus || !eventBus.listeners) return []

    const results = []
    for (const [eventClass, handlers] of eventBus.listeners.entries()) {
      const probe = probeEventClass(eventClass)
      probe.handlerCount = handlers.length
      results.push(probe)
    }
    lastScanResults = results
    return results
  }

  // Discover the actual minified event classes used by the game
  function discoverDonationEventClasses() {
    if (!eventBus || !eventBus.listeners) {
      log('[EVENT-DISCOVERY] EventBus or listeners not available')
      return false
    }

    // Reset
    donateGoldEventClass = null
    donateTroopsEventClass = null
    emojiEventClass = null
    quickChatEventClass = null
    discoveryMethod = { troops: null, gold: null }

    // Scan all classes
    const probes = scanAllEventClasses()

    log('[EVENT-DISCOVERY] Scanned', probes.length, 'event classes:',
      probes.map(p => `${p.name}(${p.handlerCount})`).join(', '))

    // Property-based discovery (most reliable)
    for (const probe of probes) {
      if (probe.donationType === 'troops' && !donateTroopsEventClass) {
        donateTroopsEventClass = probe.class
        discoveryMethod.troops = 'property'
        log('[EVENT-DISCOVERY] Troops class:', probe.name,
          '(properties:', probe.properties.join(', '), ')')
      }
      if (probe.donationType === 'gold' && !donateGoldEventClass) {
        donateGoldEventClass = probe.class
        discoveryMethod.gold = 'property'
        log('[EVENT-DISCOVERY] Gold class:', probe.name,
          '(properties:', probe.properties.join(', '), ')')
      }
      if (probe.donationType === 'emoji' && !emojiEventClass) {
        emojiEventClass = probe.class
        log('[EVENT-DISCOVERY] Emoji class:', probe.name)
      }
      if (probe.donationType === 'quick_chat' && !quickChatEventClass) {
        quickChatEventClass = probe.class
        log('[EVENT-DISCOVERY] QuickChat class:', probe.name)
      }
    }

    // Log results
    const troopsStatus = donateTroopsEventClass
      ? `troops=${donateTroopsEventClass.name} (${discoveryMethod.troops})`
      : 'troops=NOT FOUND'
    const goldStatus = donateGoldEventClass
      ? `gold=${donateGoldEventClass.name} (${discoveryMethod.gold})`
      : 'gold=NOT FOUND'

    if (donateGoldEventClass && donateTroopsEventClass) {
      console.log(`%c[HAMMER]%c Event classes: ${troopsStatus}, ${goldStatus}`,
        'color:#deb887;font-weight:bold', 'color:inherit')
      return true
    }

    console.warn(`[HAMMER] Event class discovery incomplete: ${troopsStatus}, ${goldStatus}`)
    if (!donateTroopsEventClass || !donateGoldEventClass) {
      console.warn('[HAMMER] Open Hammer > Diagnostics tab to inspect and fix')
    }
    return false
  }

  // ===== AUTO-DONATE TROOPS FUNCTIONS =====
  function asSendTroops(targetId, amount) {
    // Try EventBus approach first (preferred - doesn't need clientID)
    if (eventBus) {
      if (!donateTroopsEventClass) discoverDonationEventClasses()

      if (!donateTroopsEventClass) {
        // Fall through to WebSocket fallback below
      } else {
        const playerView = getPlayerView(targetId)
        if (!playerView) return false

        try {
          const event = new donateTroopsEventClass(playerView, amount == null ? null : num(amount))
          eventBus.emit(event)
          return true
        } catch (err) {
          log('[AUTO-TROOPS] EventBus emit failed:', err)
        }
      }
    }

    // Fallback: Direct WebSocket approach
    if (!gameSocket || gameSocket.readyState !== 1 || !currentClientID) return false

    const intent = { type: 'donate_troops', clientID: currentClientID, recipient: targetId, troops: amount == null ? null : num(amount) }
    try {
      gameSocket.send(JSON.stringify({ type: 'intent', intent }))
      return true
    } catch (err) {
      log('[AUTO-TROOPS] WebSocket send failed:', err)
      return false
    }
  }

  function asResolveTargets() {
    if (S.asTroopsAllTeamMode) {
      return getTeammates().map(p => ({ id: p.id, name: p.displayName || p.name }))
    }

    const resolved = []
    for (const tgt of S.asTroopsTargets) {
      const lower = String(tgt).toLowerCase()
      let p = null
      for (const player of playersById.values()) {
        if ((player.displayName || player.name || '').toLowerCase() === lower) { p = player; break }
      }
      if (p) resolved.push({ id: p.id, name: p.displayName || p.name })
    }
    return resolved
  }

  function asTroopsTick() {
    if (!S.asTroopsRunning) {
      if (asTroopsTimer) { clearInterval(asTroopsTimer); asTroopsTimer = null }
      return
    }

    const now = Date.now()
    const targets = asResolveTargets()
    if (!targets.length) return

    const me = readMyPlayer()
    if (!me) return

    const troops = Number(me.troops || 0)
    const maxT = estimateMaxTroops(me.tilesOwned, me.smallID)
    const troopPct = maxT > 0 ? (troops / maxT) * 100 : 0

    if (!maxT || troopPct < S.asTroopsThreshold) return

    const toSend = Math.max(1, Math.floor(troops * (S.asTroopsRatio / 100)))

    for (const target of targets) {
      if (!S.asTroopsRunning) return
      if (!asIsAlly(target.id)) continue

      const last = S.asTroopsLastSend[target.id] || 0
      const cooldownMs = S.asTroopsCooldownSec * 1000
      const nextSend = last + cooldownMs

      S.asTroopsNextSend[target.id] = nextSend

      if (now >= nextSend) {
        if (asSendTroops(target.id, toSend)) {
          S.asTroopsLastSend[target.id] = now
          S.asTroopsNextSend[target.id] = now + cooldownMs
          S.asTroopsLog.push(`[${fmtTime(nowDate())}] Sent ${short(toSend)} troops to ${target.name}`)
          if (S.asTroopsLog.length > 100) S.asTroopsLog.shift()
        } else {
          log(`[AUTO-TROOPS] Send failed to ${target.name}`)
        }
      }
    }
  }

  let asTroopsTimer = null
  let asTroopsLastToggle = 0
  function asTroopsStart() {
    if (S.asTroopsRunning) return  // Already running
    S.asTroopsRunning = true
    asTroopsLastToggle = Date.now()
    if (asTroopsTimer) clearInterval(asTroopsTimer)
    asTroopsTimer = setInterval(asTroopsTick, 800)
    log('[AUTO-TROOPS] Started')
  }
  function asTroopsStop() {
    S.asTroopsRunning = false
    asTroopsLastToggle = Date.now()
    if (asTroopsTimer) { clearInterval(asTroopsTimer); asTroopsTimer = null }
    log('[AUTO-TROOPS] Stopped')
  }

  // ===== AUTO-DONATE GOLD FUNCTIONS =====
  // Helper to verify clientID matches game's clientID
  function verifyClientID() {
    const results = {
      hammerClientID: currentClientID,
      gameViewClientID: null,
      transportClientID: null,
      match: false
    }

    try {
      // Try to get clientID from game-view element (lobby, not lobbyConfig)
      const gameView = document.querySelector('game-view')
      if (gameView?.clientGameRunner?.lobby?.clientID) {
        results.gameViewClientID = gameView.clientGameRunner.lobby.clientID
      }

      // Try to get clientID from Transport lobby
      if (gameView?.clientGameRunner?.transport?.lobby?.clientID) {
        results.transportClientID = gameView.clientGameRunner.transport.lobby.clientID
      }

      // Check if they match
      results.match = results.hammerClientID === results.gameViewClientID ||
                     results.hammerClientID === results.transportClientID

      console.log('[CLIENTID-CHECK]', results)
      return results
    } catch (err) {
      console.error('[CLIENTID-CHECK] Error:', err)
      return results
    }
  }

  function asSendGold(targetId, amount) {
    // Try EventBus approach first (preferred - doesn't need clientID)
    if (eventBus) {
      if (!donateGoldEventClass) discoverDonationEventClasses()

      if (!donateGoldEventClass) {
        // Fall through to WebSocket fallback below
      } else {
        const playerView = getPlayerView(targetId)
        if (!playerView) return false

        try {
          const goldAmount = BigInt(num(amount))
          const event = new donateGoldEventClass(playerView, goldAmount)
          eventBus.emit(event)
          return true
        } catch (err) {
          log('[AUTO-GOLD] EventBus emit failed:', err)
        }
      }
    }

    // Fallback: Direct WebSocket approach
    if (!gameSocket || gameSocket.readyState !== 1 || !currentClientID) return false

    const intent = { type: 'donate_gold', clientID: currentClientID, recipient: targetId, gold: num(amount) }
    try {
      gameSocket.send(JSON.stringify({ type: 'intent', intent }))
      return true
    } catch (err) {
      log('[AUTO-GOLD] WebSocket send failed:', err)
      return false
    }
  }

  // ===== COMMS: EMOJI & QUICKCHAT =====
  function sendEmoji(recipientId, emojiIndex) {
    // Try EventBus first (but not for AllPlayers - EventBus uses PlayerView objects)
    if (eventBus && emojiEventClass && recipientId !== 'AllPlayers') {
      const playerView = getPlayerView(recipientId)
      if (playerView) {
        try {
          const event = new emojiEventClass(playerView, emojiIndex)
          eventBus.emit(event)
          log('[COMMS] Emoji sent via EventBus to', recipientId)
          return true
        } catch (err) { log('[COMMS] EventBus emoji failed, trying WebSocket:', err) }
      }
    }
    // WebSocket approach (works for AllPlayers and as fallback)
    if (!gameSocket || gameSocket.readyState !== 1 || !currentClientID) return false
    try {
      const msg = { type: 'intent', intent: { type: 'emoji', clientID: currentClientID, recipient: recipientId, emoji: emojiIndex } }
      gameSocket.send(JSON.stringify(msg))
      log('[COMMS] Emoji sent via WebSocket:', msg.intent)
      return true
    } catch (err) { log('[COMMS] WebSocket emoji failed:', err); return false }
  }

  function sendQuickChat(recipientId, quickChatKey, targetId) {
    // Try EventBus first (not for AllPlayers)
    if (eventBus && quickChatEventClass && recipientId !== 'AllPlayers') {
      const playerView = getPlayerView(recipientId)
      if (playerView) {
        try {
          const args = targetId ? [playerView, quickChatKey, targetId] : [playerView, quickChatKey]
          const event = new quickChatEventClass(...args)
          eventBus.emit(event)
          log('[COMMS] QuickChat sent via EventBus:', quickChatKey)
          return true
        } catch (err) { log('[COMMS] EventBus quickchat failed, trying WebSocket:', err) }
      }
    }
    // WebSocket approach
    if (!gameSocket || gameSocket.readyState !== 1 || !currentClientID) return false
    const intent = { type: 'quick_chat', clientID: currentClientID, recipient: recipientId, quickChatKey }
    if (targetId) intent.target = targetId
    try {
      gameSocket.send(JSON.stringify({ type: 'intent', intent }))
      log('[COMMS] QuickChat sent via WebSocket:', intent)
      return true
    } catch (err) { log('[COMMS] WebSocket quickchat failed:', err); return false }
  }

  function logCommsSent(type, label, targetName) {
    S.commsRecentSent.unshift({ type, label, target: targetName, timestamp: Date.now() })
    if (S.commsRecentSent.length > 10) S.commsRecentSent.length = 10
  }

  function asResolveGoldTargets() {
    if (S.asGoldAllTeamMode) {
      return getTeammates().map(p => ({ id: p.id, name: p.displayName || p.name }))
    }

    const resolved = []
    for (const tgt of S.asGoldTargets) {
      const lower = String(tgt).toLowerCase()
      let p = null
      for (const player of playersById.values()) {
        if ((player.displayName || player.name || '').toLowerCase() === lower) { p = player; break }
      }
      if (p) resolved.push({ id: p.id, name: p.displayName || p.name })
    }
    return resolved
  }

  function asGoldTick() {
    if (!S.asGoldRunning) {
      if (asGoldTimer) { clearInterval(asGoldTimer); asGoldTimer = null }
      return
    }

    const now = Date.now()
    const targets = asResolveGoldTargets()
    if (!targets.length) return

    const me = readMyPlayer()
    if (!me) return

    const gold = Number(me.gold || 0n)
    const toSend = Math.max(1, Math.floor(gold * (S.asGoldRatio / 100)))
    if (toSend <= 0) return

    for (const target of targets) {
      if (!S.asGoldRunning) return
      if (!asIsAlly(target.id)) continue

      const last = S.asGoldLastSend[target.id] || 0
      const cooldownMs = S.asGoldCooldownSec * 1000
      const nextSend = last + cooldownMs

      S.asGoldNextSend[target.id] = nextSend

      if (now >= nextSend) {
        if (asSendGold(target.id, toSend)) {
          S.asGoldLastSend[target.id] = now
          S.asGoldNextSend[target.id] = now + cooldownMs
          S.asGoldLog.push(`[${fmtTime(nowDate())}] Sent ${short(toSend)} gold to ${target.name}`)
          if (S.asGoldLog.length > 100) S.asGoldLog.shift()
        } else {
          log(`[AUTO-GOLD] Send failed to ${target.name}`)
        }
      }
    }
  }

  let asGoldTimer = null
  let asGoldLastToggle = 0
  function asGoldStart() {
    if (S.asGoldRunning) return  // Already running
    S.asGoldRunning = true
    asGoldLastToggle = Date.now()
    if (asGoldTimer) clearInterval(asGoldTimer)
    asGoldTimer = setInterval(asGoldTick, 800)
    log('[AUTO-GOLD] Started')
  }
  function asGoldStop() {
    S.asGoldRunning = false
    asGoldLastToggle = Date.now()
    if (asGoldTimer) { clearInterval(asGoldTimer); asGoldTimer = null }
    log('[AUTO-GOLD] Stopped')
  }



  // ===== UI =====
  const ui = document.createElement('div')
  ui.id = 'hammer-v8'
  Object.assign(ui.style, {
    position: 'fixed', right: '14px', bottom: '14px',
    width: SIZES[S.sizeIdx].w + 'px', height: SIZES[S.sizeIdx].h + 'px',
    background: '#0b1220', color: '#e7eef5',
    font: '12px/1.35 Consolas,Menlo,monospace',
    border: '2px solid #86531f', borderRadius: '10px',
    zIndex: '2147483645', boxShadow: '0 10px 28px rgba(0,0,0,.55)',
    overflow: 'hidden', userSelect: 'none', resize: 'both'
  })

  const tabs = ['summary', 'stats', 'ports', 'feed', 'alliances', 'autotroops', 'autogold', 'reciprocate', 'comms', 'hotkeys', 'about']
  ui.innerHTML = `
    <div id="hm-head" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#151f33;border-bottom:1px solid #86531f;cursor:move;flex-shrink:0">
      <div><b>Hammer Control Panel</b> <span style="opacity:.85">v10.4</span></div>
      <div class="btns" style="display:flex;gap:6px;flex-wrap:wrap">
        <div id="hm-tabs" style="display:flex;gap:4px;flex-wrap:wrap">
          ${tabs.map(v => `<button class="tab" data-v="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
        </div>
        <button id="hm-size">${SIZES[S.sizeIdx].label}</button>
        <button id="hm-mini">▽</button>
        <button id="hm-pause">Pause</button>
        <button id="hm-export">Export</button>
        <button id="hm-debug" style="opacity:${Logger.isDebug() ? '1' : '.5'}">${Logger.isDebug() ? 'Debug ON' : 'Debug'}</button>
        <button id="hm-close">×</button>
      </div>
    </div>
    <div id="hm-body" style="height:${SIZES[S.sizeIdx].bodyH}px;padding:10px;overflow-y:auto">
      <style>
        #hammer-v8 .row{display:flex;justify-content:space-between;gap:10px;margin:2px 0;align-items:center}
        #hammer-v8 .muted{color:#9bb0c8}
        #hammer-v8 .mono{font-feature-settings:"tnum";font-variant-numeric:tabular-nums}
        #hammer-v8 .title{font-weight:700;margin:8px 0 4px;color:#ffcf5d}
        #hammer-v8 .box{padding:8px;border:1px solid #2a3a55;border-radius:8px;background:#101a2a;margin:6px 0}
        #hammer-v8 .help{color:#7bb8ff;font-size:11px;line-height:1.4;margin:4px 0}
        #hammer-v8 button{background:#0e1a2f;color:#e7eef5;border:1px solid #2a3a55;border-radius:6px;padding:4px 8px;cursor:pointer;font:11px Consolas,Menlo,monospace;pointer-events:auto}
        #hammer-v8 button:hover{background:#253454}
        #hammer-v8 button.active{background:#2a5244;border-color:#4a8864}
        #hammer-v8 button.danger{background:#3a1f1f;border-color:#ff8b94}
        #hammer-v8 button.danger:hover{background:#4a2525}
        #hammer-v8 input{background:#0e1a2f;color:#e7eef5;border:1px solid #2a3a55;border-radius:6px;padding:4px 8px;font:12px Consolas,Menlo,monospace}
        #hammer-v8 input:focus{outline:2px solid #4a6894;background:#152030}
        #hammer-v8 input[type="range"]{width:100%;margin:8px 0}
        #hammer-v8 .status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
        #hammer-v8 .status-dot.running{background:#7ff2a3;animation:pulse 2s infinite}
        #hammer-v8 .status-dot.stopped{background:#ff8b94}
        #hammer-v8 .preview-calc{background:#0d1520;border:2px solid #4a8864;border-radius:8px;padding:12px;margin:12px 0;font-size:14px;color:#7ff2a3}
        #hammer-v8 .tag-list{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}
        #hammer-v8 .tag{background:#2a3a55;padding:4px 8px;border-radius:12px;font-size:11px;display:inline-flex;align-items:center;gap:6px}
        #hammer-v8 .tag-remove{cursor:pointer;color:#ff8b94;font-weight:bold;pointer-events:auto}
        #hammer-v8 .hotkey{display:inline-block;background:#1a2a3f;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:6px;color:#7bb8ff}
        #hammer-v8 .stat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:8px 0}
        #hammer-v8 .stat-card{background:#0d1520;border:1px solid #2a3a55;border-radius:6px;padding:10px}
        #hammer-v8 .stat-label{color:#9bb0c8;font-size:10px;text-transform:uppercase;margin-bottom:4px}
        #hammer-v8 .stat-value{color:#7ff2a3;font-size:18px;font-weight:700}
        #hammer-v8 .recommendation{background:#1a2a1f;border-left:3px solid #4a8864;padding:8px;margin:6px 0;font-size:11px}
        #hammer-v8 .warning{background:#2a1f1a;border-left:3px solid #ff8b94;padding:8px;margin:6px 0;font-size:11px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
      </style>
      <div id="hm-content"></div>
    </div>
  `
  document.body.appendChild(ui)

  const bar = ui.querySelector('#hm-head')
  let d = false, dx = 0, dy = 0
  const barMouseDown = (e) => {
    d = true; dx = e.clientX - ui.offsetLeft; dy = e.clientY - ui.offsetTop; e.preventDefault()
  }
  bar.addEventListener('mousedown', barMouseDown)
  eventCleanup.push(() => bar.removeEventListener('mousedown', barMouseDown))

  const barMouseMove = (e) => {
    if (!d) return
    ui.style.left = (e.clientX - dx) + 'px'
    ui.style.top = (e.clientY - dy) + 'px'
    ui.style.right = 'auto'; ui.style.bottom = 'auto'
  }
  addEventListener('mousemove', barMouseMove)
  eventCleanup.push(() => removeEventListener('mousemove', barMouseMove))

  const barMouseUp = () => d = false
  addEventListener('mouseup', barMouseUp)
  eventCleanup.push(() => removeEventListener('mouseup', barMouseUp))

  const bodyEl = ui.querySelector('#hm-body')
  const headEl = ui.querySelector('#hm-head')

  function applySize(idx) {
    S.sizeIdx = (idx + SIZES.length) % SIZES.length
    const s = SIZES[S.sizeIdx]
    ui.style.width = s.w + 'px'; ui.style.height = s.h + 'px'
    bodyEl.style.height = s.bodyH + 'px'
    ui.querySelector('#hm-size').textContent = s.label
  }

  try {
    const resizeObs = new ResizeObserver(() => {
      const h = Math.max(120, ui.clientHeight - headEl.offsetHeight - 12)
      bodyEl.style.height = h + 'px'
    })
    resizeObs.observe(ui)
    eventCleanup.push(() => resizeObs.disconnect())
  } catch {}

  function setMin(min) {
    S.minimized = min
    const tabsEl = ui.querySelector('#hm-tabs')
    if (min) {
      bodyEl.style.display = 'none'; tabsEl.style.display = 'none'
      ui.style.width = '280px'; ui.style.height = '44px'
    } else {
      bodyEl.style.display = 'block'; tabsEl.style.display = 'flex'
      applySize(S.sizeIdx)
    }
    ui.querySelector('#hm-mini').textContent = min ? '▲' : '▽'
  }

  ui.querySelector('#hm-close').onclick = () => { cleanup(); ui.remove() }
  ui.querySelector('#hm-debug').onclick = () => {
    const on = !Logger.isDebug()
    Logger.setDebug(on)
    const btn = ui.querySelector('#hm-debug')
    btn.textContent = on ? 'Debug ON' : 'Debug'
    btn.style.opacity = on ? '1' : '.5'
    console.log(`[HAMMER] Debug logging ${on ? 'ENABLED' : 'DISABLED'}`)
  }
  ui.querySelector('#hm-size').onclick = () => applySize(S.sizeIdx + 1)
  ui.querySelector('#hm-mini').onclick = () => setMin(!S.minimized)
  ui.querySelector('#hm-pause').onclick = () => {
    S.paused = !S.paused
    ui.querySelector('#hm-pause').textContent = S.paused ? 'Resume' : 'Pause'
  }
  ui.querySelector('#hm-export').onclick = () => {
    const obj = {
      exportedAt: new Date().toISOString(),
      sessionDuration: fmtDuration(Date.now() - sessionStartTime),
      myClientID: currentClientID, mySmallID,
      inbound: Object.fromEntries(S.inbound),
      outbound: Object.fromEntries(S.outbound),
      ports: Object.fromEntries([...S.ports.entries()].map(([k, v]) => [k, {
        totalGold: v.totalGold, avgIntSec: v.avgIntSec, lastIntSec: v.lastIntSec,
        gpm: v.gpm, trades: v.times.length
      }])),
      goldRate: { gps30: S.gps30, gpm60: S.gpm60, gpm120: S.gpm120 },
      stream: {
        inbound: S.feedIn.map(x => ({ ts: x.ts.toISOString(), type: x.type, name: x.name, amount: x.amount, isPort: x.isPort })),
        outbound: S.feedOut.map(x => ({ ts: x.ts.toISOString(), type: x.type, name: x.name, amount: x.amount }))
      },
      reciprocate: {
        enabled: S.reciprocateEnabled,
        mode: S.reciprocateMode,
        autoPct: S.reciprocateAutoPct,
        onTroops: S.reciprocateOnTroops,
        onGold: S.reciprocateOnGold,
        popupsEnabled: S.reciprocatePopupsEnabled,
        queueSize: reciprocatePending.length,
        cooldownsActive: reciprocateCooldowns.size,
        historyCount: S.reciprocateHistory.length,
        pendingRequests: reciprocatePending.map(p => ({
          donor: p.donorName,
          troops: p.troopsReceived,
          attempts: p.attempts,
          ageSeconds: Math.floor((Date.now() - p.addedAt) / 1000)
        }))
      }
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }))
    a.download = `hammer_v10.4_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 800)
  }
  ui.querySelector('#hm-tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab')
    if (!b) return
    S.view = b.getAttribute('data-v')
  })

  const isTagMate = () => {
    return true
  }

  // ===== RENDER FUNCTIONS =====
  function summaryView() {
    const me = readMyPlayer()

    let html = '<div class="title">📊 Summary - Session Overview</div>'
    html += `<div class="help">Tracking donations for this session (${fmtDuration(Date.now() - sessionStartTime)})</div>`

    const inKeys = [...S.inbound.keys()].filter(isTagMate)
    const outKeys = [...S.outbound.keys()].filter(isTagMate)

    let totalInGold = 0, totalInTroops = 0, totalInPort = 0
    let totalOutGold = 0, totalOutTroops = 0

    for (const k of inKeys) {
      const r = S.inbound.get(k)
      totalInGold += r.gold
      totalInTroops += r.troops
    }

    for (const item of S.feedIn) {
      if (item.isPort && item.type === 'gold') totalInPort += item.amount
    }

    for (const k of outKeys) {
      const r = S.outbound.get(k)
      totalOutGold += r.gold
      totalOutTroops += r.troops
    }

    // Separate player gold from port gold in inbound totals
    const playerInGold = totalInGold - totalInPort

    html += '<div class="stat-grid">'
    html += `<div class="stat-card"><div class="stat-label">From Players</div><div class="stat-value">${short(playerInGold)} 💰 | ${short(totalInTroops)} 🪖</div></div>`
    html += `<div class="stat-card"><div class="stat-label">From Ports</div><div class="stat-value">${short(totalInPort)} 💰</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Sent</div><div class="stat-value">${short(totalOutGold)} 💰 | ${short(totalOutTroops)} 🪖</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Net (Players)</div><div class="stat-value">${short(playerInGold - totalOutGold)} 💰</div></div>`
    html += '</div>'

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">'

    // Filter out port-sourced entries from inbound player list
    const portNames = new Set()
    for (const f of S.feedIn) {
      if (f.isPort) portNames.add(f.name)
    }
    const playerInKeys = inKeys.filter(k => {
      const p = playersById.get(k)
      const n = p ? (p.displayName || p.name || k) : k
      return !portNames.has(n)
    })

    html += '<div><div class="title">⬅️ Inbound (Players)</div>'
    if (!playerInKeys.length) {
      html += '<div class="muted">No player donations received yet</div>'
    } else {
      const rows = playerInKeys.map(k => {
        const p = playersById.get(k)
        const n = p ? (p.displayName || p.name || k) : k
        const r = S.inbound.get(k)
        return { name: n, gold: r.gold, troops: r.troops }
      }).sort((a, b) => (b.gold + b.troops) - (a.gold + a.troops))

      html += '<div style="font-size:11px">'
      for (const row of rows) {
        html += `<div class="row" style="margin:4px 0;padding:6px;background:#0d1520;border-radius:4px">`
        html += `<div style="flex:1;overflow:hidden;text-overflow:ellipsis">${esc(row.name)}</div>`
        html += `<div class="mono" style="color:#7ff2a3">${short(row.gold)} 💰</div>`
        html += `<div class="mono" style="color:#7bb8ff">${short(row.troops)} 🪖</div>`
        html += '</div>'
      }
      html += '</div>'
    }
    html += '</div>'

    html += '<div><div class="title">➡️ Outbound</div>'
    if (!outKeys.length) {
      html += '<div class="muted">No donations sent yet</div>'
    } else {
      const rows = outKeys.map(k => {
        const p = playersById.get(k)
        const n = p ? (p.displayName || p.name || k) : k
        const r = S.outbound.get(k)
        return { name: n, gold: r.gold, troops: r.troops }
      }).sort((a, b) => (b.gold + b.troops) - (a.gold + a.troops))

      html += '<div style="font-size:11px">'
      for (const row of rows) {
        html += `<div class="row" style="margin:4px 0;padding:6px;background:#0d1520;border-radius:4px">`
        html += `<div style="flex:1;overflow:hidden;text-overflow:ellipsis">${esc(row.name)}</div>`
        html += `<div class="mono" style="color:#ffcf5d">${short(row.gold)} 💰</div>`
        html += `<div class="mono" style="color:#ff9f5d">${short(row.troops)} 🪖</div>`
        html += '</div>'
      }
      html += '</div>'
    }
    html += '</div></div>'

    // Separate Port Income section
    const portBySource = new Map()
    for (const entry of S.feedIn) {
      if (entry.isPort) {
        if (!portBySource.has(entry.name)) portBySource.set(entry.name, { gold: 0, count: 0 })
        const p = portBySource.get(entry.name)
        p.gold += entry.amount; p.count++
      }
    }

    html += '<div style="margin-top:12px">'
    html += '<div class="title">🏪 Port Income</div>'
    if (portBySource.size > 0) {
      html += '<div style="font-size:11px">'
      for (const [name, data] of [...portBySource.entries()].sort((a, b) => b[1].gold - a[1].gold)) {
        html += `<div class="row" style="margin:4px 0;padding:6px;background:#0d1520;border-radius:4px">`
        html += `<div style="flex:1">${esc(name)} 🏪</div>`
        html += `<div class="mono" style="color:#ffcf5d">${short(data.gold)} 💰 (${data.count}x)</div>`
        html += '</div>'
      }
      html += '</div>'
    } else {
      html += '<div class="muted">No port trades this session</div>'
    }
    html += '</div>'

    return html
  }

  function statsView() {
    const me = readMyPlayer()
    const duration = Date.now() - sessionStartTime

    let html = '<div class="title">📈 War Report</div>'
    html += `<div class="help">Session Duration: ${fmtDuration(duration)}</div>`

    const inKeys = [...S.inbound.keys()]
    const outKeys = [...S.outbound.keys()]

    let totalInGold = 0, totalInTroops = 0, totalInCount = 0
    let totalOutGold = 0, totalOutTroops = 0, totalOutCount = 0
    let topSupporter = null, topSupportGold = 0, topSupportTroops = 0
    let topRecipient = null, topRecipientGold = 0, topRecipientTroops = 0

    for (const k of inKeys) {
      const r = S.inbound.get(k)
      totalInGold += r.gold
      totalInTroops += r.troops
      totalInCount += r.count

      if (r.gold + r.troops > topSupportGold + topSupportTroops) {
        const p = playersById.get(k)
        topSupporter = p ? (p.displayName || p.name || k) : k
        topSupportGold = r.gold
        topSupportTroops = r.troops
      }
    }

    for (const k of outKeys) {
      const r = S.outbound.get(k)
      totalOutGold += r.gold
      totalOutTroops += r.troops
      totalOutCount += r.count

      if (r.gold + r.troops > topRecipientGold + topRecipientTroops) {
        const p = playersById.get(k)
        topRecipient = p ? (p.displayName || p.name || k) : k
        topRecipientGold = r.gold
        topRecipientTroops = r.troops
      }
    }

    html += '<div class="box"><div class="title" style="margin-top:0">👤 Current Status</div>'
    if (me) {
      const maxT = estimateMaxTroops(me.tilesOwned, me.smallID)
      const troopPct = maxT > 0 ? Math.round((me.troops / maxT) * 100) : 0
      html += `<div class="row"><div>Player</div><div class="mono">${esc(me.displayName || me.name || 'Unknown')}</div></div>`
      html += `<div class="row"><div>Troops</div><div class="mono">${short(me.troops)} / ${short(maxT)} (${troopPct}%)</div></div>`
      html += `<div class="row"><div>Gold</div><div class="mono">${short(me.gold)}</div></div>`
      html += `<div class="row"><div>Tiles</div><div class="mono">${me.tilesOwned || 0}</div></div>`
    } else {
      html += '<div class="muted">Player data not available</div>'
    }
    html += '</div>'

    html += '<div class="box"><div class="title" style="margin-top:0">📊 Session Totals</div>'
    html += '<div class="stat-grid">'
    html += `<div class="stat-card"><div class="stat-label">Received</div><div class="stat-value">${short(totalInGold + totalInTroops)}</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Sent</div><div class="stat-value">${short(totalOutGold + totalOutTroops)}</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Net Balance</div><div class="stat-value">${short((totalInGold + totalInTroops) - (totalOutGold + totalOutTroops))}</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Efficiency</div><div class="stat-value">${totalOutGold + totalOutTroops > 0 ? ((totalInGold + totalInTroops) / (totalOutGold + totalOutTroops)).toFixed(2) + 'x' : 'N/A'}</div></div>`
    html += '</div></div>'

    if (topSupporter || topRecipient) {
      html += '<div class="box"><div class="title" style="margin-top:0">🏆 Top Contributors</div>'
      if (topSupporter) {
        html += `<div class="row"><div>Top Supporter</div><div class="mono">${esc(topSupporter)}</div></div>`
        html += `<div class="row"><div></div><div class="mono" style="color:#7ff2a3">${short(topSupportGold)} 💰 + ${short(topSupportTroops)} 🪖</div></div>`
      }
      if (topRecipient) {
        html += `<div class="row" style="margin-top:8px"><div>Top Recipient</div><div class="mono">${esc(topRecipient)}</div></div>`
        html += `<div class="row"><div></div><div class="mono" style="color:#ffcf5d">${short(topRecipientGold)} 💰 + ${short(topRecipientTroops)} 🪖</div></div>`
      }
      html += '</div>'
    }

    // Donation Velocity
    const durationMin = duration / 60000
    html += '<div class="box"><div class="title" style="margin-top:0">🚀 Donation Velocity</div>'
    const goldPerMin = durationMin > 0 ? Math.round((totalInGold + totalOutGold) / durationMin) : 0
    const troopsPerMin = durationMin > 0 ? Math.round((totalInTroops + totalOutTroops) / durationMin) : 0
    html += `<div class="row"><div>Gold Flow</div><div class="mono">${short(goldPerMin)}/min</div></div>`
    html += `<div class="row"><div>Troop Flow</div><div class="mono">${short(troopsPerMin)}/min</div></div>`
    html += `<div class="row"><div>Total Transactions</div><div class="mono">${totalInCount + totalOutCount}</div></div>`
    html += `<div class="row"><div>Avg Donation Size</div><div class="mono">${(totalInCount + totalOutCount) > 0 ? short(Math.round((totalInGold + totalInTroops + totalOutGold + totalOutTroops) / (totalInCount + totalOutCount))) : 'N/A'}</div></div>`
    html += '</div>'

    // Leaderboard - Top 5
    const supporters = [...S.inbound.entries()]
      .map(([k, r]) => ({ name: playersById.get(k)?.displayName || playersById.get(k)?.name || k, total: r.gold + r.troops, gold: r.gold, troops: r.troops }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    if (supporters.length > 0) {
      html += '<div class="box"><div class="title" style="margin-top:0">🏅 Leaderboard</div>'
      html += '<div class="help">Top Supporters</div>'
      const medals = ['🥇', '🥈', '🥉', '4.', '5.']
      for (let i = 0; i < supporters.length; i++) {
        const s = supporters[i]
        html += `<div class="row" style="padding:4px;background:#0d1520;border-radius:4px;margin:2px 0">`
        html += `<div>${medals[i]} ${esc(s.name)}</div>`
        html += `<div class="mono" style="color:#7ff2a3">${short(s.gold)} 💰 + ${short(s.troops)} 🪖</div>`
        html += '</div>'
      }
      html += '</div>'
    }

    // Fun Metrics
    const totalVolume = totalInGold + totalInTroops + totalOutGold + totalOutTroops
    const uniqueDonors = S.inbound.size
    const uniqueRecipients = S.outbound.size
    const generosityScore = totalVolume > 0 ? Math.min(100, Math.round(((totalOutGold + totalOutTroops) / totalVolume) * 100)) : 0
    const popularityScore = Math.min(100, uniqueDonors * 10)

    html += '<div class="box"><div class="title" style="margin-top:0">🎮 Fun Metrics</div>'
    html += `<div class="row"><div>Generosity Score</div><div class="mono" style="color:#7ff2a3">${generosityScore}/100</div></div>`
    html += `<div class="row"><div>Popularity Score</div><div class="mono" style="color:#7bb8ff">${popularityScore}/100</div></div>`
    html += `<div class="row"><div>Unique Donors</div><div class="mono">${uniqueDonors}</div></div>`
    html += `<div class="row"><div>Unique Recipients</div><div class="mono">${uniqueRecipients}</div></div>`

    let biggestIn = 0, biggestInName = ''
    for (const item of S.feedIn) {
      if (item.amount > biggestIn && !item.isPort) { biggestIn = item.amount; biggestInName = item.name }
    }
    if (biggestIn > 0) {
      html += `<div class="row"><div>Biggest Donation</div><div class="mono">${short(biggestIn)} from ${esc(biggestInName)}</div></div>`
    }

    const networkType = inKeys.length > outKeys.length * 2 ? 'Receiver Hub' :
                        outKeys.length > inKeys.length * 2 ? 'Feeder Hub' : 'Balanced Node'
    html += `<div class="row"><div>Network Role</div><div class="mono" style="color:#ffcf5d">${networkType}</div></div>`
    html += '<div style="margin-top:10px;padding:8px;background:#0d1520;border-radius:4px;font-size:10px;line-height:1.7;color:#7a8fa3">'
    html += '<div><b style="color:#7ff2a3">Generosity Score</b> (0-100): How much of total resource flow you sent vs received. 100 = you gave everything, 0 = you only received.</div>'
    html += '<div style="margin-top:4px"><b style="color:#7bb8ff">Popularity Score</b> (0-100): Based on how many unique players donated to you. 10 points per unique donor, capped at 100.</div>'
    html += '<div style="margin-top:4px"><b style="color:#ffcf5d">Network Role</b>: "Receiver Hub" = you receive 2x more than you send. "Feeder Hub" = you send 2x more than you receive. "Balanced Node" = roughly equal flow.</div>'
    html += '</div>'
    html += '</div>'

    // Gold Rate section (merged from Gold Rate tab)
    html += '<div class="box"><div class="title" style="margin-top:0">💰 Gold Rate</div>'
    if (me) {
      html += `<div class="row"><div>Current Gold</div><div class="mono" style="color:#ffcf5d">${short(me.gold)}</div></div>`
      html += `<div class="row"><div>Gold/Sec (30s)</div><div class="mono" style="color:#7ff2a3">${(S.gps30 || 0).toFixed(2)}</div></div>`
      html += `<div class="row"><div>Gold/Min (60s)</div><div class="mono" style="color:#7ff2a3">${short(S.gpm60 || 0)}</div></div>`
      html += `<div class="row"><div>Gold/Min (120s)</div><div class="mono" style="color:#7ff2a3">${short(S.gpm120 || 0)}</div></div>`
    } else {
      html += '<div class="muted">Player data not available</div>'
    }
    html += '</div>'

    return html
  }


  function portsView() {
    let html = '<div class="title">🏪 Port Trades & Insights</div>'
    html += '<div class="help">AI port trading analysis</div>'

    const keys = [...S.ports.keys()].filter(isTagMate)
    if (!keys.length) {
      return html + '<div class="muted">No port trades detected yet</div>'
    }

    const rows = keys.map(k => {
      const p = playersById.get(k)
      const n = p ? (p.displayName || p.name || k) : k
      const r = S.ports.get(k)
      return { name: n, ...r }
    }).sort((a, b) => b.totalGold - a.totalGold)

    const bestPort = rows[0]
    const avgGPM = rows.reduce((s, r) => s + r.gpm, 0) / rows.length

    html += '<div class="recommendation">'
    html += `🏆 Best Port: <b>${esc(bestPort.name)}</b> (${short(bestPort.gpm)} gold/min)`
    html += '</div>'

    html += '<div class="box"><div class="title" style="margin-top:0">📊 Port Statistics</div>'
    html += `<div class="row"><div>Total Ports</div><div class="mono">${rows.length}</div></div>`
    html += `<div class="row"><div>Avg Gold/Min</div><div class="mono">${short(avgGPM)}</div></div>`
    html += `<div class="row"><div>Total Port Income</div><div class="mono">${short(rows.reduce((s, r) => s + r.totalGold, 0))}</div></div>`
    html += '</div>'

    html += '<div class="title">Port Details</div>'
    for (const row of rows.slice(0, 50)) {
      html += '<div class="box">'
      html += `<div class="row"><div style="font-weight:700">${esc(row.name)}</div><div class="mono" style="color:#7ff2a3">${short(row.totalGold)}</div></div>`
      html += `<div class="row muted" style="font-size:11px"><div>Gold/Min</div><div class="mono">${short(row.gpm)}</div></div>`
      html += `<div class="row muted" style="font-size:11px"><div>Avg Interval</div><div class="mono">${row.avgIntSec}s</div></div>`
      html += `<div class="row muted" style="font-size:11px"><div>Last Interval</div><div class="mono">${row.lastIntSec}s</div></div>`
      html += `<div class="row muted" style="font-size:11px"><div>Trades</div><div class="mono">${row.times.length}</div></div>`
      html += '</div>'
    }

    return html
  }

  function feedView() {
    let html = '<div class="title">📜 Live Feed</div>'
    html += '<div class="help">Real-time donation stream</div>'

    const all = [...S.feedIn.map(x => ({ ...x, dir: 'in' })), ...S.feedOut.map(x => ({ ...x, dir: 'out' }))]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 50)

    if (!all.length) {
      return html + '<div class="muted">No donations yet</div>'
    }

    // Legend
    html += '<div style="display:flex;gap:12px;margin-bottom:8px;font-size:10px">'
    html += '<div style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:10px;height:10px;background:#1a3a2a;border:1px solid #7ff2a3;border-radius:2px"></span> Incoming</div>'
    html += '<div style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:10px;height:10px;background:#3a2a1a;border:1px solid #ffcf5d;border-radius:2px"></span> Outgoing</div>'
    html += '</div>'

    html += '<div style="font-size:12px">'
    for (const item of all) {
      const isIn = item.dir === 'in'
      const bg = isIn ? '#0d1a14' : '#1a150d'
      const borderColor = isIn ? '#7ff2a3' : '#ffcf5d'
      const label = isIn ? 'IN' : 'OUT'
      const labelBg = isIn ? '#1a3a2a' : '#3a2a1a'
      const color = isIn ? '#7ff2a3' : '#ffcf5d'
      const typeIcon = item.type === 'troops' ? '🪖' : '💰'
      const portIcon = item.isPort ? ' 🏪' : ''
      html += `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;padding:6px 8px;background:${bg};border-left:3px solid ${borderColor};border-radius:4px">`
      html += `<div style="padding:2px 6px;background:${labelBg};border-radius:3px;font-size:10px;font-weight:bold;color:${color};min-width:30px;text-align:center">${label}</div>`
      html += `<div class="mono muted" style="font-size:10px;min-width:50px">${fmtTime(item.ts)}</div>`
      html += `<div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.name)}${portIcon}</div>`
      html += `<div class="mono" style="color:${color};font-weight:bold;font-size:13px">${short(item.amount)} ${typeIcon}</div>`
      html += '</div>'
    }
    html += '</div>'

    return html
  }

  function alliancePlayerCard(p) {
    const maxT = estimateMaxTroops(p.tilesOwned, p.smallID)
    const troopPct = maxT > 0 ? Math.round((p.troops / maxT) * 100) : 0
    const tiles = p.tilesOwned || 0
    const isExpanded = S.allianceCommsExpanded === p.id
    let html = `<div class="box" style="margin:4px 0">`
    html += `<div class="row"><div style="font-weight:700">${esc(p.displayName || p.name || 'Unknown')}</div><div style="display:flex;align-items:center;gap:6px"><span class="mono">${troopPct}%</span><button class="alliance-comms-toggle" data-pid="${p.id}" style="padding:2px 6px;background:${isExpanded ? '#2a5a4a' : '#1a2a3a'};border:1px solid ${isExpanded ? '#7ff2a3' : '#3a5a7a'};border-radius:3px;cursor:pointer;font-size:10px">${isExpanded ? '▲ Comms' : '▼ Comms'}</button></div></div>`
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:4px;font-size:10px">`
    html += `<div class="muted">Troops: <span class="mono" style="color:#7ff2a3">${short(p.troops)} / ${short(maxT)}</span></div>`
    html += `<div class="muted">Tiles: <span class="mono" style="color:#7bb8ff">${tiles}</span></div>`
    html += `</div>`
    // Inline comms panel
    if (isExpanded) {
      html += `<div style="margin-top:8px;padding:8px;background:#0a0f18;border:1px solid #1a2a3a;border-radius:4px">`
      // Emoji row - just top 10 most useful
      html += `<div class="muted" style="font-size:9px;margin-bottom:4px">Emoji:</div>`
      html += `<div style="display:flex;flex-wrap:wrap;gap:3px">`
      for (let i = 0; i < EMOJI_TABLE.length; i++) {
        html += `<button class="alliance-emoji-btn" data-pid="${p.id}" data-eidx="${i}" style="padding:2px;font-size:14px;background:#0d1520;border:1px solid #1a2a3a;border-radius:3px;cursor:pointer;width:28px;height:28px">${EMOJI_TABLE[i]}</button>`
      }
      html += `</div>`
      // Quick quickchat buttons
      html += `<div class="muted" style="font-size:9px;margin-top:6px;margin-bottom:4px">Quick Chat:</div>`
      html += `<div style="display:flex;flex-wrap:wrap;gap:3px">`
      const quickActions = [
        { key: 'team.send_troops', label: 'Send Troops' },
        { key: 'team.send_gold', label: 'Send Gold' },
        { key: 'help.help', label: 'Help' },
        { key: 'help.help_defend', label: 'Help Defend' },
        { key: 'attack.attack', label: 'Attack' },
        { key: 'defend.defend', label: 'Defend' },
        { key: 'misc.thanks', label: 'Thanks' },
        { key: 'misc.gg', label: 'GG' },
        { key: 'misc.yes', label: 'Yes' },
        { key: 'misc.no', label: 'No' }
      ]
      for (const qa of quickActions) {
        html += `<button class="alliance-qc-btn" data-pid="${p.id}" data-qc="${qa.key}" style="padding:3px 6px;font-size:9px;background:#0d1520;border:1px solid #1a2a3a;border-radius:3px;cursor:pointer;color:#c8d8e8">${qa.label}</button>`
      }
      html += `</div>`
      html += `</div>`
    }
    html += '</div>'
    return html
  }

  function alliancesView() {
    const me = readMyPlayer()

    let html = '<div class="title">🤝 Alliances & Teams</div>'
    html += '<div class="help">View teammates, allies, and tag mates. Click Comms to send emoji/quickchat.</div>'

    if (!me) {
      return html + '<div class="muted">Player data not available</div>'
    }

    const teammates = getTeammates()
    html += '<div class="box"><div class="title" style="margin-top:0">👥 Teammates</div>'
    if (!teammates.length) {
      html += '<div class="muted">No teammates (solo or FFA mode)</div>'
    } else {
      for (const p of teammates.slice(0, 20)) {
        html += alliancePlayerCard(p)
      }
    }
    html += '</div>'

    const allies = getAllies()
    html += '<div class="box"><div class="title" style="margin-top:0">🤝 Allies</div>'
    if (!allies.length) {
      html += '<div class="muted">No active alliances</div>'
    } else {
      for (const p of allies.slice(0, 20)) {
        html += alliancePlayerCard(p)
      }
    }
    html += '</div>'

    return html
  }


  function autoDonateTroopsView() {
    const me = readMyPlayer()
    const statusDot = `<span class="status-dot ${S.asTroopsRunning ? 'running' : 'stopped'}"></span>`

    let html = '<div class="title">🪖 Auto-Donate Troops</div>'

    // Status header card
    html += '<div class="box">'
    html += '<div class="row" style="font-size:14px">'
    html += `<div><b>Auto-Troops</b></div>`
    html += `<div>${statusDot}<b style="color:${S.asTroopsRunning ? '#7ff2a3' : '#ff8b94'}">${S.asTroopsRunning ? 'RUNNING' : 'STOPPED'}</b></div>`
    html += '</div>'
    html += `<div class="row" style="margin-top:4px"><div class="muted" style="font-size:10px">Ratio: ${S.asTroopsRatio}% | Threshold: ${S.asTroopsThreshold}% | Cooldown: ${S.asTroopsCooldownSec}s</div></div>`
    html += '</div>'

    if (me) {
      const maxT = estimateMaxTroops(me.tilesOwned, me.smallID)
      const troopPct = maxT > 0 ? Math.round((me.troops / maxT) * 100) : 0
      const willSend = troopPct >= S.asTroopsThreshold
      const sendAmount = willSend ? Math.floor(me.troops * (S.asTroopsRatio / 100)) : 0
      const targetCount = S.asTroopsAllTeamMode ? getTeammates().length : S.asTroopsTargets.length

      html += '<div class="preview-calc">'
      html += `<div style="font-size:16px;margin-bottom:8px"><b>LIVE PREVIEW</b></div>`
      html += `<div>You have: <b>${short(me.troops)}</b> / <b>${short(maxT)}</b> troops (<b>${troopPct}%</b>)</div>`
      if (willSend) {
        html += `<div style="color:#7ff2a3;font-size:15px;margin-top:8px">✅ Will send: <b>${short(sendAmount)}</b> troops (${S.asTroopsRatio}% of ${short(me.troops)})</div>`
        if (targetCount > 1) {
          const perTarget = Math.floor(sendAmount / targetCount)
          html += `<div style="color:#7bb8ff">Across <b>${targetCount}</b> targets = <b>${short(perTarget)}</b> each</div>`
        } else if (targetCount === 0) {
          html += `<div style="color:#ffcf5d">⚠️ No targets configured</div>`
        }
        const remaining = me.troops - sendAmount
        const remainPct = maxT > 0 ? Math.round((remaining / maxT) * 100) : 0
        html += `<div>You keep: <b>${short(remaining)}</b> troops (${remainPct}% capacity)</div>`
      } else {
        html += `<div style="color:#ff8b94;margin-top:8px">❌ Below threshold (need ${S.asTroopsThreshold}%, have ${troopPct}%)</div>`
      }
      html += '</div>'
    }

    html += '<div class="box">'
    html += '<div class="title" style="margin-top:0">⚙️ Settings</div>'
    html += `<div class="row"><div>Send Ratio: <b>${S.asTroopsRatio}%</b></div></div>`
    html += `<div style="display:flex;gap:4px;flex-wrap:wrap;margin:4px 0">`
    for (const pct of [5, 10, 15, 20, 25, 33, 50, 75, 100]) {
      html += `<button class="at-ratio-btn" data-pct="${pct}" style="flex:1;min-width:32px;padding:4px;background:${S.asTroopsRatio === pct ? '#2a5a4a' : '#2a3a4a'};border:1px solid ${S.asTroopsRatio === pct ? '#7ff2a3' : '#7bb8ff'};border-radius:4px;cursor:pointer;font-weight:${S.asTroopsRatio === pct ? 'bold' : 'normal'}">${pct}%</button>`
    }
    html += `</div>`
    html += `<div class="row" style="margin-top:4px"><div class="muted">Custom:</div><input id="at-ratio-input" type="number" value="${S.asTroopsRatio}" min="1" max="100" step="1" style="width:60px;text-align:center"></div>`
    html += `<div class="row" style="margin-top:8px"><div>Threshold: <b>${S.asTroopsThreshold}%</b></div></div>`
    html += `<div style="display:flex;gap:4px;flex-wrap:wrap;margin:4px 0">`
    for (const pct of [0, 25, 50, 75]) {
      html += `<button class="at-threshold-btn" data-pct="${pct}" style="flex:1;padding:4px;background:${S.asTroopsThreshold === pct ? '#2a5a4a' : '#2a3a4a'};border:1px solid ${S.asTroopsThreshold === pct ? '#7ff2a3' : '#7bb8ff'};border-radius:4px;cursor:pointer;font-weight:${S.asTroopsThreshold === pct ? 'bold' : 'normal'}">${pct}%</button>`
    }
    html += `</div>`
    html += `<div class="row"><div>Cooldown</div><input id="at-cooldown" type="number" value="${S.asTroopsCooldownSec}" min="10" max="60" step="1" style="width:80px"><div class="muted" style="margin-left:8px">seconds (min 10s)</div></div>`
    html += '</div>'

    html += '<div class="box">'
    html += '<div class="title" style="margin-top:0">🎯 Target Selection</div>'
    html += `<div class="row"><div>AllTeam Mode</div><button id="at-allteam-toggle" class="${S.asTroopsAllTeamMode ? 'active' : ''}">${S.asTroopsAllTeamMode ? 'ON' : 'OFF'}</button></div>`
    html += '<div class="help">Send to ALL teammates automatically (great for single-player!)</div>'

    if (!S.asTroopsAllTeamMode) {
      html += '<div style="margin-top:12px">'
      html += '<div class="help">Selected targets (ALT+M to add from map):</div>'
      if (S.asTroopsTargets.length > 0) {
        html += '<div class="tag-list">'
        for (const target of S.asTroopsTargets) {
          html += `<div class="tag">${esc(target)}<span class="tag-remove" data-remove-troop-target="${esc(target)}">×</span></div>`
        }
        html += '</div>'
      } else {
        html += '<div class="muted">No targets selected. Use ALT+M on map or select below:</div>'
      }

      const teammates = getTeammates()
      const allies = getAllies()
      const allTargets = [...teammates, ...allies].filter((p, i, arr) =>
        arr.findIndex(x => x.id === p.id) === i
      )

      if (allTargets.length > 0) {
        html += '<div class="help" style="margin-top:8px">Available Targets (click to toggle):</div>'
        html += `<div style="border:1px solid #2a4a6a;border-radius:4px;padding:4px;background:#0a1a2a">`
        for (const p of allTargets) {
          const name = p.displayName || p.name || 'Unknown'
          const isSelected = S.asTroopsTargets.includes(name)
          html += '<div class="box" style="margin:4px 0;cursor:pointer" data-toggle-troop-target="' + esc(name) + '">'
          html += '<div class="row">'
          html += `<div style="font-weight:${isSelected ? '700' : '400'};color:${isSelected ? '#7ff2a3' : 'inherit'}">${isSelected ? '✓ ' : ''}${esc(name)}</div>`
          html += `<div class="mono" style="color:#7bb8ff">${short(p.troops)}</div>`
          html += '</div>'
          html += '</div>'
        }
        html += '</div>'
      }
      html += '</div>'
    } else {
      const teammates = getTeammates()
      html += `<div class="help">Will send to <b>${teammates.length}</b> teammates</div>`
    }
    html += '</div>'

    html += '<div class="box">'
    html += '<div class="row">'
    html += `<button id="at-start" class="${S.asTroopsRunning ? 'danger' : 'active'}" style="flex:1">${S.asTroopsRunning ? 'STOP' : 'START'}</button>`
    html += '<button id="at-clear" style="margin-left:8px">Clear Log</button>'
    html += '</div>'
    html += '<div class="help" style="margin-top:8px">Manual Test (sends to first target immediately):</div>'
    html += '<div class="row" style="margin-top:4px">'
    html += '<button id="at-test-send" style="flex:1;background:#4a90e2">🧪 Test Send Troops Now</button>'
    html += '</div>'
    html += '</div>'

    // Activity Log with countdowns
    if (S.asTroopsLog.length > 0 || S.asTroopsRunning) {
      html += '<div class="box">'
      html += '<div class="title" style="margin-top:0">📋 Activity & Status</div>'

      // Show countdowns if running
      if (S.asTroopsRunning) {
        const now = Date.now()
        const targets = asResolveTargets()
        if (targets.length > 0) {
          html += '<div style="margin-bottom:8px">'
          html += '<div class="help" style="margin-bottom:4px">⏱️ Next Send Countdown:</div>'
          for (const target of targets.slice(0, 5)) {
            const nextSend = S.asTroopsNextSend[target.id] || 0
            const remaining = Math.max(0, Math.ceil((nextSend - now) / 1000))
            html += `<div style="margin:2px 0;padding:4px;background:#0d1520;border-radius:4px;display:flex;justify-content:space-between">`
            html += `<div>${esc(target.name)}</div>`
            html += `<div class="mono" style="color:${remaining > 0 ? '#7bb8ff' : '#7ff2a3'}">${remaining > 0 ? fmtSec(remaining) : 'Ready!'}</div>`
            html += '</div>'
          }
          html += '</div>'
        }
      }

      // Show recent logs
      if (S.asTroopsLog.length > 0) {
        html += '<div class="help">Recent Activity (Last 10):</div>'
        const recentLogs = S.asTroopsLog.slice(-10).reverse()
        html += '<div style="font-size:10px">'
        for (const entry of recentLogs) {
          html += `<div style="margin:2px 0;padding:4px;background:#0d1520;border-radius:4px;color:#9bb0c8">${esc(entry)}</div>`
        }
        html += '</div>'
      }
      html += '</div>'
    }

    return html
  }

  function autoDonateGoldView() {
    const me = readMyPlayer()
    const statusDot = `<span class="status-dot ${S.asGoldRunning ? 'running' : 'stopped'}"></span>`

    let html = '<div class="title">💰 Auto-Donate Gold</div>'

    // Status header card
    html += '<div class="box">'
    html += '<div class="row" style="font-size:14px">'
    html += `<div><b>Auto-Gold</b></div>`
    html += `<div>${statusDot}<b style="color:${S.asGoldRunning ? '#7ff2a3' : '#ff8b94'}">${S.asGoldRunning ? 'RUNNING' : 'STOPPED'}</b></div>`
    html += '</div>'
    html += `<div class="row" style="margin-top:4px"><div class="muted" style="font-size:10px">Ratio: ${S.asGoldRatio}% | Min: ${short(S.asGoldThreshold)} | Cooldown: ${S.asGoldCooldownSec}s</div></div>`
    html += '</div>'

    if (me) {
      // Convert BigInt gold to number for calculations and display
      const myGold = Number(me.gold || 0n)
      const willSend = myGold >= S.asGoldThreshold
      const sendAmount = willSend ? Math.floor(myGold * (S.asGoldRatio / 100)) : 0
      const targetCount = S.asGoldAllTeamMode ? getTeammates().length : S.asGoldTargets.length

      html += '<div class="preview-calc">'
      html += `<div style="font-size:16px;margin-bottom:8px"><b>LIVE PREVIEW</b></div>`
      html += `<div>You have: <b>${short(myGold)}</b> gold</div>`
      if (willSend) {
        html += `<div style="color:#7ff2a3;font-size:15px;margin-top:8px">✅ Will send: <b>${short(sendAmount)}</b> gold (${S.asGoldRatio}% of ${short(myGold)})</div>`
        if (targetCount > 1) {
          const perTarget = Math.floor(sendAmount / targetCount)
          html += `<div style="color:#7bb8ff">Across <b>${targetCount}</b> targets = <b>${short(perTarget)}</b> each</div>`
        } else if (targetCount === 0) {
          html += `<div style="color:#ffcf5d">⚠️ No targets configured</div>`
        }
        html += `<div>You keep: <b>${short(myGold - sendAmount)}</b> gold</div>`
      } else {
        html += `<div style="color:#ff8b94;margin-top:8px">❌ Below threshold (need ${short(S.asGoldThreshold)}, have ${short(myGold)})</div>`
      }
      html += '</div>'
    }

    html += '<div class="box">'
    html += '<div class="title" style="margin-top:0">⚙️ Settings</div>'
    html += `<div class="row"><div>Send Ratio: <b>${S.asGoldRatio}%</b></div></div>`
    html += `<div style="display:flex;gap:4px;flex-wrap:wrap;margin:4px 0">`
    for (const pct of [5, 10, 15, 20, 25, 33, 50, 75, 100]) {
      html += `<button class="ag-ratio-btn" data-pct="${pct}" style="flex:1;min-width:32px;padding:4px;background:${S.asGoldRatio === pct ? '#2a5a4a' : '#2a3a4a'};border:1px solid ${S.asGoldRatio === pct ? '#7ff2a3' : '#7bb8ff'};border-radius:4px;cursor:pointer;font-weight:${S.asGoldRatio === pct ? 'bold' : 'normal'}">${pct}%</button>`
    }
    html += `</div>`
    html += `<div class="row" style="margin-top:4px"><div class="muted">Custom:</div><input id="ag-ratio-input" type="number" value="${S.asGoldRatio}" min="1" max="100" step="1" style="width:60px;text-align:center"></div>`
    html += `<div class="row" style="margin-top:8px"><div>Min Gold Threshold</div><input id="ag-threshold" type="number" value="${S.asGoldThreshold}" min="0" step="10000" style="width:120px"></div>`
    html += `<div class="row"><div>Cooldown</div><input id="ag-cooldown" type="number" value="${S.asGoldCooldownSec}" min="10" max="60" step="1" style="width:80px"><div class="muted" style="margin-left:8px">seconds (min 10s)</div></div>`
    html += '</div>'

    html += '<div class="box">'
    html += '<div class="title" style="margin-top:0">🎯 Target Selection</div>'
    html += `<div class="row"><div>AllTeam Mode</div><button id="ag-allteam-toggle" class="${S.asGoldAllTeamMode ? 'active' : ''}">${S.asGoldAllTeamMode ? 'ON' : 'OFF'}</button></div>`
    html += '<div class="help">Send to ALL teammates automatically</div>'

    if (!S.asGoldAllTeamMode) {
      html += '<div style="margin-top:12px">'
      html += '<div class="help">Selected targets (ALT+M to add from map):</div>'
      if (S.asGoldTargets.length > 0) {
        html += '<div class="tag-list">'
        for (const target of S.asGoldTargets) {
          html += `<div class="tag">${esc(target)}<span class="tag-remove" data-remove-gold-target="${esc(target)}">×</span></div>`
        }
        html += '</div>'
      } else {
        html += '<div class="muted">No targets selected. Use ALT+M on map or select below:</div>'
      }

      const teammates = getTeammates()
      const allies = getAllies()
      const allTargets = [...teammates, ...allies].filter((p, i, arr) =>
        arr.findIndex(x => x.id === p.id) === i
      )

      if (allTargets.length > 0) {
        html += '<div class="help" style="margin-top:8px">Available Targets (click to toggle):</div>'
        html += `<div style="border:1px solid #2a4a6a;border-radius:4px;padding:4px;background:#0a1a2a">`
        for (const p of allTargets) {
          const name = p.displayName || p.name || 'Unknown'
          const isSelected = S.asGoldTargets.includes(name)
          // Safely convert BigInt gold to number for display
          const goldAmount = p.gold ? Number(p.gold) : 0
          html += '<div class="box" style="margin:4px 0;cursor:pointer" data-toggle-gold-target="' + esc(name) + '">'
          html += '<div class="row">'
          html += `<div style="font-weight:${isSelected ? '700' : '400'};color:${isSelected ? '#7ff2a3' : 'inherit'}">${isSelected ? '✓ ' : ''}${esc(name)}</div>`
          html += `<div class="mono" style="color:#ffcf5d">${short(goldAmount)} 💰</div>`
          html += '</div>'
          html += '</div>'
        }
        html += '</div>'
      }
      html += '</div>'
    } else {
      const teammates = getTeammates()
      html += `<div class="help">Will send to <b>${teammates.length}</b> teammates</div>`
    }
    html += '</div>'

    html += '<div class="box">'
    html += '<div class="row">'
    html += `<button id="ag-start" class="${S.asGoldRunning ? 'danger' : 'active'}" style="flex:1">${S.asGoldRunning ? 'STOP' : 'START'}</button>`
    html += '<button id="ag-clear" style="margin-left:8px">Clear Log</button>'
    html += '</div>'
    html += '<div class="help" style="margin-top:8px">Manual Test (sends to first target immediately):</div>'
    html += '<div class="row" style="margin-top:4px">'
    html += '<button id="ag-test-send" style="flex:1;background:#4a90e2">🧪 Test Send Gold Now</button>'
    html += '</div>'
    html += '</div>'

    // Activity Log with countdowns
    if (S.asGoldLog.length > 0 || S.asGoldRunning) {
      html += '<div class="box">'
      html += '<div class="title" style="margin-top:0">📋 Activity & Status</div>'

      // Show countdowns if running
      if (S.asGoldRunning) {
        const now = Date.now()
        const targets = asResolveGoldTargets()
        if (targets.length > 0) {
          html += '<div style="margin-bottom:8px">'
          html += '<div class="help" style="margin-bottom:4px">⏱️ Next Send Countdown:</div>'
          for (const target of targets.slice(0, 5)) {
            const nextSend = S.asGoldNextSend[target.id] || 0
            const remaining = Math.max(0, Math.ceil((nextSend - now) / 1000))
            html += `<div style="margin:2px 0;padding:4px;background:#0d1520;border-radius:4px;display:flex;justify-content:space-between">`
            html += `<div>${esc(target.name)}</div>`
            html += `<div class="mono" style="color:${remaining > 0 ? '#7bb8ff' : '#7ff2a3'}">${remaining > 0 ? fmtSec(remaining) : 'Ready!'}</div>`
            html += '</div>'
          }
          html += '</div>'
        }
      }

      // Show recent logs
      if (S.asGoldLog.length > 0) {
        html += '<div class="help">Recent Activity (Last 10):</div>'
        const recentLogs = S.asGoldLog.slice(-10).reverse()
        html += '<div style="font-size:10px">'
        for (const entry of recentLogs) {
          html += `<div style="margin:2px 0;padding:4px;background:#0d1520;border-radius:4px;color:#9bb0c8">${esc(entry)}</div>`
        }
        html += '</div>'
      }
      html += '</div>'
    }

    return html
  }

  function reciprocateView() {
    const me = readMyPlayer()
    const myGold = me ? Number(me.gold || 0n) : 0

    let html = '<div class="title">🔄 Quick Reciprocate</div>'
    html += `<div class="help">Quickly send gold to players who sent you troops</div>`

    // Settings Box
    html += '<div class="box">'
    html += '<div class="title" style="margin-top:0">⚙️ Settings</div>'

    html += `<div class="row">`
    html += `<div>Reciprocation System</div>`
    html += `<button id="recip-toggle" class="${S.reciprocateEnabled ? 'active' : ''}">${S.reciprocateEnabled ? 'ON' : 'OFF'}</button>`
    html += `</div>`

    html += `<div class="row">`
    html += `<div><b>Mode</b></div>`
    html += `<div style="display:flex;gap:8px">`
    html += `<button id="recip-mode-manual" class="${S.reciprocateMode === 'manual' ? 'active' : ''}" style="flex:1">Manual</button>`
    html += `<button id="recip-mode-auto" class="${S.reciprocateMode === 'auto' ? 'active' : ''}" style="flex:1">Auto</button>`
    html += `</div>`
    html += `</div>`

    if (S.reciprocateMode === 'manual') {
      html += `<div class="help">Manual: Popup with buttons for each donation</div>`
      html += `<div class="row">`
      html += `<div>Notification Duration</div>`
      html += `<input id="recip-duration" type="number" value="${S.reciprocateNotifyDuration}" min="10" max="60" step="5" style="width:80px">`
      html += `<span class="muted" style="margin-left:8px">seconds</span>`
      html += `</div>`
    } else {
      html += `<div class="help">Auto: Automatically send fixed % when troops received</div>`
      html += `<div class="row">`
      html += `<div>Auto Percentage</div>`
      html += `<div style="display:flex;gap:4px">`
      for (const pct of [10, 25, 50, 75, 100]) {
        html += `<button class="recip-auto-pct-btn" data-pct="${pct}" style="flex:1;padding:4px;background:${S.reciprocateAutoPct === pct ? '#2a5a4a' : '#2a3a4a'};border:1px solid ${S.reciprocateAutoPct === pct ? '#7ff2a3' : '#7bb8ff'};border-radius:4px;cursor:pointer;font-weight:${S.reciprocateAutoPct === pct ? 'bold' : 'normal'}">${pct}%</button>`
      }
      html += `</div>`
      html += `</div>`
    }

    html += `<div class="row">`
    html += `<div>Reciprocate on Troops</div>`
    html += `<button id="recip-on-troops" class="${S.reciprocateOnTroops ? 'active' : ''}">${S.reciprocateOnTroops ? 'ON' : 'OFF'}</button>`
    html += `</div>`

    html += `<div class="row">`
    html += `<div>Reciprocate on Gold</div>`
    html += `<button id="recip-on-gold" class="${S.reciprocateOnGold ? 'active' : ''}">${S.reciprocateOnGold ? 'ON' : 'OFF'}</button>`
    html += `</div>`

    html += `<div class="row">`
    html += `<div>Show Popups</div>`
    html += `<button id="recip-popups-toggle" class="${S.reciprocatePopupsEnabled ? 'active' : ''}">${S.reciprocatePopupsEnabled ? 'ON' : 'OFF'}</button>`
    html += `</div>`
    html += '</div>'

    // Current Gold Display
    html += '<div class="box">'
    html += `<div class="row" style="font-size:16px">`
    html += `<div><b>Your Current Gold:</b></div>`
    html += `<div class="mono" style="color:#ffcf5d">${short(myGold)} 💰</div>`
    html += `</div>`
    html += '</div>'

    // Recent Donors (from inbound) - show troops or gold donors
    const recentDonors = [...S.inbound.entries()]
      .filter(([id, data]) => data.troops > 0 || data.gold > 0)
      .map(([id, data]) => {
        const playerObj = playersById.get(id)
        const name = playerObj?.displayName || playerObj?.name || 'Unknown'
        // Find last donation from feedIn
        const lastFeed = [...S.feedIn].reverse().find(f => f.name === name && !f.isPort)
        // Use snapshotted donor troops from last donation time (not live)
        const snapshotTroops = data.lastDonorTroops || 0
        const pctOfArmy = snapshotTroops > 0 ? Math.round((data.troops / snapshotTroops) * 100) : 0
        return {
          id, name,
          totalTroops: data.troops,
          totalGold: data.gold,
          troopsSends: data.troopsSends || 0,
          goldSends: data.goldSends || 0,
          lastAmount: lastFeed ? lastFeed.amount : 0,
          lastType: lastFeed ? lastFeed.type : 'troops',
          pctOfArmy,
          lastTime: data.last
        }
      })
      .sort((a, b) => b.lastTime - a.lastTime)
      .slice(0, 10)

    if (recentDonors.length > 0) {
      html += '<div class="box">'
      html += '<div class="row" style="margin-bottom:4px"><div class="title" style="margin-top:0">🎯 Recent Donors</div>'
      html += '<button id="recip-clear-all-donors" style="padding:4px 8px;background:#3a2a2a;color:#ff8b94;border:1px solid #ff8b94;border-radius:4px;cursor:pointer;font-size:10px">Clear All</button></div>'
      html += '<div class="help">Click percentage to send that % of your current gold</div>'

      for (const donor of recentDonors) {
        const timeSince = Math.floor((Date.now() - donor.lastTime.getTime()) / 1000)
        html += '<div class="box" style="margin:8px 0;background:#0d1520">'
        html += '<div class="row">'
        html += `<div><b>${esc(donor.name)}</b></div>`
        html += `<div style="display:flex;align-items:center;gap:6px">`
        html += `<span class="muted" style="font-size:10px">${fmtDuration(timeSince * 1000)} ago</span>`
        html += `<button class="recip-clear-donor" data-donor-id="${donor.id}" style="padding:2px 6px;background:#3a2a2a;color:#ff8b94;border:1px solid #ff8b94;border-radius:3px;cursor:pointer;font-size:9px">✕</button>`
        html += `</div>`
        html += '</div>'
        // Donor stats grid - 2x2 layout
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;font-size:10px">'
        html += `<div><span class="muted">Troops recv:</span><br><span class="mono" style="color:#7ff2a3">${short(donor.totalTroops)} 🪖</span> <span class="muted">(${donor.troopsSends} sends)</span></div>`
        html += `<div><span class="muted">Gold recv:</span><br><span class="mono" style="color:#ffcf5d">${short(donor.totalGold)} 💰</span> <span class="muted">(${donor.goldSends} sends)</span></div>`
        html += `<div><span class="muted">Last send:</span><br><span class="mono" style="color:#7bb8ff">${short(donor.lastAmount)} ${donor.lastType === 'troops' ? '🪖' : '💰'}</span></div>`
        html += `<div><span class="muted">% of army:</span><br><span class="mono" style="color:#ffcf5d">${donor.pctOfArmy}%</span> <span class="muted">(at donation)</span></div>`
        html += '</div>'
        // Percentage send buttons
        html += '<div style="display:flex;gap:4px;margin-top:8px">'
        for (const pct of [10, 25, 50, 75, 100]) {
          const goldAmt = Math.floor(myGold * pct / 100)
          html += `<button class="recip-send-btn" data-donor-id="${donor.id}" data-donor-name="${esc(donor.name)}" data-pct="${pct}" style="flex:1;padding:6px;background:#2a4a6a;border:1px solid #7bb8ff;border-radius:4px;cursor:pointer;font-size:11px">`
          html += `<div style="font-weight:bold">${pct}%</div>`
          html += `<div style="font-size:9px;color:#9bb0c8">${short(goldAmt)}</div>`
          html += `</button>`
        }
        html += '</div>'
        html += '</div>'
      }
      html += '</div>'
    } else {
      html += '<div class="box">'
      html += '<div class="muted">No recent donors. When players send you troops or gold, they\'ll appear here for quick reciprocation.</div>'
      html += '</div>'
    }

    // Reciprocation History
    if (S.reciprocateHistory.length > 0) {
      html += '<div class="box">'
      html += '<div class="title" style="margin-top:0">📋 Recent Reciprocations</div>'

      const recent = S.reciprocateHistory.slice(-10).reverse()
      html += '<div style="font-size:10px">'
      for (const entry of recent) {
        const ts = new Date(entry.timestamp)
        html += `<div style="margin:2px 0;padding:4px;background:#0d1520;border-radius:4px;color:#9bb0c8">`
        html += `[${fmtTime(ts)}] Sent ${short(entry.goldSent)} 💰 (${entry.percentage}%) to ${esc(entry.donorName)}`
        html += `</div>`
      }
      html += '</div>'

      html += '<button id="recip-clear-history" style="margin-top:8px;padding:6px;background:#3a2a2a;color:#ff8b94;border:1px solid #ff8b94;border-radius:4px;cursor:pointer;font-size:11px">Clear History</button>'
      html += '</div>'
    }

    return html
  }


  // ===== COMMS VIEW =====
  const EMOJI_TABLE = [
    '😀','😊','🥰','😇','😎', '😞','🥺','😭','😱','😡',
    '😈','🤡','🥱','🫡','🖕', '👋','👏','✋','🙏','💪',
    '👍','👎','🫴','🤌','🤦‍♂️', '🤝','🆘','🕊️','🏳️','⏳',
    '🔥','💥','💀','☢️','⚠️', '↖️','⬆️','↗️','👑','🥇',
    '⬅️','🎯','➡️','🥈','🥉', '↙️','⬇️','↘️','❤️','💔',
    '💰','⚓','⛵','🏡','🛡️', '🏭','🚂','❓','🐔','🐀'
  ]

  // Keys that require a target player (requiresPlayer: true in QuickChat.json)
  const QC_NEEDS_TARGET = new Set([
    'help.help_defend',
    'attack.attack', 'attack.mirv', 'attack.focus', 'attack.finish',
    'defend.defend', 'defend.defend_from', 'defend.dont_attack', 'defend.ally',
    'misc.team_up',
    'warnings.strong', 'warnings.weak', 'warnings.mirv_soon',
    'warnings.has_allies', 'warnings.no_allies', 'warnings.betrayed',
    'warnings.betrayed_me', 'warnings.getting_big', 'warnings.danger_base',
    'warnings.saving_for_mirv', 'warnings.mirv_ready', 'warnings.snowballing',
    'warnings.cheating', 'warnings.stop_trading'
  ])

  const QUICKCHAT = {
    greet: { label: '👋 Greetings', keys: ['hello','good_job','good_luck','have_fun','gg','nice_to_meet','well_played','hi_again','bye','thanks','oops','trust_me','trust_broken','ruining_games','dont_do_that','same_team'] },
    help: { label: '🆘 Help', keys: ['troops','troops_frontlines','gold','no_attack','sorry_attack','alliance','help_defend','trade_partners'] },
    attack: { label: '⚔️ Attack', keys: ['attack','mirv','focus','finish','build_warships'] },
    defend: { label: '🛡️ Defend', keys: ['defend','defend_from','dont_attack','ally','build_posts'] },
    misc: { label: '💬 Misc', keys: ['go','strategy','fun','team_up','pr','build_closer','coastline'] },
    warnings: { label: '⚠️ Warnings', keys: ['strong','weak','mirv_soon','number1_warning','stalemate','has_allies','no_allies','betrayed','betrayed_me','getting_big','danger_base','saving_for_mirv','mirv_ready','snowballing','cheating','stop_trading'] }
  }

  // Helper to resolve current comms targets to player list
  function resolveCommsTargets() {
    const me = readMyPlayer()
    if (!me) return []

    const results = []
    const seen = new Set()

    function addPlayer(p) {
      if (!p || p.id === me.id || seen.has(p.id)) return
      seen.add(p.id)
      results.push({ id: p.id, name: p.displayName || p.name || 'Unknown' })
    }

    if (S.commsGroupMode === 'all') {
      for (const p of playersById.values()) {
        if (p.isAlive) addPlayer(p)
      }
    } else if (S.commsGroupMode === 'all-team') {
      for (const p of getTeammates()) addPlayer(p)
    } else if (S.commsGroupMode === 'all-non-team') {
      const teammates = getTeammates()
      const teamIds = new Set(teammates.map(t => t.id))
      teamIds.add(me.id)
      for (const p of playersById.values()) {
        if (p.isAlive && !teamIds.has(p.id)) addPlayer(p)
      }
    }

    // Also add individually selected players
    for (const id of S.commsTargets) {
      const p = playersById.get(id) || playersById.get(Number(id))
      if (p) addPlayer(p)
    }

    return results
  }

  function commsView() {
    let html = '<div class="title">📡 Comms</div>'
    html += '<div class="help">Send emojis and quick messages to players</div>'

    // Connection status
    const canSend = (gameSocket && gameSocket.readyState === 1 && currentClientID) || eventBus
    html += `<div style="margin-bottom:8px;padding:4px 8px;border-radius:4px;font-size:10px;background:${canSend ? '#1a2a1a' : '#2a1a1a'};color:${canSend ? '#7ff2a3' : '#ff8b94'}">`
    html += canSend ? '● Connected — ready to send' : '● Not connected — waiting for game'
    html += '</div>'

    // If picking a target for a QuickChat message, show player picker
    if (S.commsPendingQC) {
      const display = S.commsPendingQC.split('.').pop().replace(/_/g, ' ')
      html += '<div class="box" style="border-color:#ffcf5d">'
      html += `<div class="title" style="margin-top:0;color:#ffcf5d">🎯 Select target for: "${display}"</div>`
      html += '<div class="help">This message requires a target player. Click a name below:</div>'

      const teammates = getTeammates()
      const allies = getAllies()
      const others = [...playersById.values()].filter(p => {
        const me = readMyPlayer()
        if (!me || p.id === me.id || !p.isAlive) return false
        return !teammates.find(t => t.id === p.id) && !allies.find(a => a.id === p.id)
      }).sort((a, b) => (a.displayName || a.name || '').localeCompare(b.displayName || b.name || ''))

      if (teammates.length > 0) {
        html += '<div style="font-size:10px;font-weight:bold;color:#7ff2a3;margin:6px 0 3px">Teammates</div>'
        html += '<div style="display:flex;flex-wrap:wrap;gap:3px">'
        for (const p of teammates) {
          html += `<button class="comms-qc-target-btn" data-qc-target-id="${p.id}" style="padding:4px 10px;font-size:11px;background:#1a2a1a;border:1px solid #4a8864;border-radius:4px;cursor:pointer;color:#7ff2a3">${esc(p.displayName || p.name)}</button>`
        }
        html += '</div>'
      }
      if (allies.length > 0) {
        html += '<div style="font-size:10px;font-weight:bold;color:#7bb8ff;margin:6px 0 3px">Allies</div>'
        html += '<div style="display:flex;flex-wrap:wrap;gap:3px">'
        for (const p of allies) {
          html += `<button class="comms-qc-target-btn" data-qc-target-id="${p.id}" style="padding:4px 10px;font-size:11px;background:#1a1a2a;border:1px solid #4a6894;border-radius:4px;cursor:pointer;color:#7bb8ff">${esc(p.displayName || p.name)}</button>`
        }
        html += '</div>'
      }
      if (others.length > 0) {
        html += '<div style="font-size:10px;font-weight:bold;color:#9bb0c8;margin:6px 0 3px">Others</div>'
        html += '<div style="display:flex;flex-wrap:wrap;gap:3px">'
        for (const p of others) {
          html += `<button class="comms-qc-target-btn" data-qc-target-id="${p.id}" style="padding:3px 8px;font-size:10px;background:#0d1520;border:1px solid #1a2a3a;border-radius:3px;cursor:pointer;color:#9bb0c8">${esc(p.displayName || p.name)}</button>`
        }
        html += '</div>'
      }

      html += '<button id="comms-qc-cancel" style="margin-top:8px;padding:4px 12px;background:#3a2a2a;color:#ff8b94;border:1px solid #ff8b94;border-radius:4px;cursor:pointer;font-size:11px">Cancel</button>'
      html += '</div>'
      return html
    }

    // Target selector
    const teammates = getTeammates()
    const allies = getAllies()
    const allyOnly = allies.filter(a => !teammates.find(t => t.id === a.id))

    // Build list of all non-team players
    const me = readMyPlayer()
    const teamIds = new Set(teammates.map(t => t.id))
    if (me) teamIds.add(me.id)
    const nonTeamPlayers = [...playersById.values()].filter(p => {
      if (!p.isAlive || teamIds.has(p.id)) return false
      if (me && p.id === me.id) return false
      return true
    }).sort((a, b) => (a.displayName || a.name || '').localeCompare(b.displayName || b.name || ''))

    const resolvedTargets = resolveCommsTargets()
    const selectedCount = resolvedTargets.length

    html += '<div class="box"><div class="title" style="margin-top:0">🎯 Send To</div>'
    html += `<div class="help" style="margin-bottom:6px">Selected: <b>${selectedCount}</b> player${selectedCount !== 1 ? 's' : ''} (click to toggle, groups are shortcuts)</div>`

    // Group buttons row
    html += '<div style="display:flex;gap:4px;margin-bottom:8px">'
    const grpAll = S.commsGroupMode === 'all'
    const grpTeam = S.commsGroupMode === 'all-team'
    const grpNonTeam = S.commsGroupMode === 'all-non-team'
    html += `<button id="comms-grp-all" style="flex:1;padding:6px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;border:1px solid ${grpAll ? '#ffcf5d' : '#2a4a6a'};background:${grpAll ? '#3a3520' : '#0a1a2a'};color:${grpAll ? '#ffcf5d' : '#9bb0c8'}">📢 All</button>`
    html += `<button id="comms-grp-team" style="flex:1;padding:6px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;border:1px solid ${grpTeam ? '#7ff2a3' : '#2a4a2a'};background:${grpTeam ? '#1a3a1a' : '#0a1a0a'};color:${grpTeam ? '#7ff2a3' : '#7a9a7a'}">👥 All Team</button>`
    html += `<button id="comms-grp-nonteam" style="flex:1;padding:6px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;border:1px solid ${grpNonTeam ? '#ff9f5d' : '#2a2a1a'};background:${grpNonTeam ? '#2a1a0a' : '#0a0a0a'};color:${grpNonTeam ? '#ff9f5d' : '#7a7a5a'}">🌍 All Non-Team</button>`
    html += '<button id="comms-grp-clear" style="padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;border:1px solid #ff8b94;background:#2a1a1a;color:#ff8b94">Clear</button>'
    html += '</div>'

    // Team section
    if (teammates.length > 0) {
      html += '<div style="font-size:10px;font-weight:bold;color:#7ff2a3;margin:6px 0 3px">Team</div>'
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px">'
      for (const p of teammates) {
        const name = p.displayName || p.name || '?'
        const sel = S.commsTargets.has(String(p.id)) || S.commsTargets.has(p.id) || grpAll || grpTeam
        html += `<button class="comms-target-btn" data-comms-target="${p.id}" style="padding:4px 8px;border-radius:4px;cursor:pointer;font-size:10px;border:1px solid ${sel ? '#7ff2a3' : '#2a4a2a'};background:${sel ? '#1a3a1a' : '#0a1a0a'};color:${sel ? '#7ff2a3' : '#7a9a7a'}">${esc(name)}</button>`
      }
      html += '</div>'
    }

    // Allies section
    if (allyOnly.length > 0) {
      html += '<div style="font-size:10px;font-weight:bold;color:#7bb8ff;margin:6px 0 3px">Allies</div>'
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px">'
      for (const p of allyOnly) {
        const name = p.displayName || p.name || '?'
        const sel = S.commsTargets.has(String(p.id)) || S.commsTargets.has(p.id) || grpAll || grpNonTeam
        html += `<button class="comms-target-btn" data-comms-target="${p.id}" style="padding:4px 8px;border-radius:4px;cursor:pointer;font-size:10px;border:1px solid ${sel ? '#7bb8ff' : '#1a2a4a'};background:${sel ? '#1a2a4a' : '#0a0a1a'};color:${sel ? '#7bb8ff' : '#5a7a9a'}">${esc(name)}</button>`
      }
      html += '</div>'
    }

    // Non-team / Others section (collapsible block)
    if (nonTeamPlayers.length > 0) {
      // Filter out allies already shown above
      const shownIds = new Set(allyOnly.map(p => p.id))
      const otherPlayers = nonTeamPlayers.filter(p => !shownIds.has(p.id))

      if (otherPlayers.length > 0) {
        html += '<div style="margin-top:8px">'
        html += `<button id="comms-others-toggle" style="padding:4px 10px;border-radius:4px;cursor:pointer;font-size:10px;border:1px solid #2a3a55;background:#0d1520;color:#9bb0c8;width:100%;text-align:left">${S.commsOthersExpanded ? '▼' : '▶'} Others (${otherPlayers.length} players)</button>`

        if (S.commsOthersExpanded) {
          html += '<div style="border:1px solid #2a3a55;border-radius:4px;padding:6px;background:#0a1020;margin-top:4px">'
          html += '<div style="display:flex;flex-wrap:wrap;gap:3px">'
          for (const p of otherPlayers) {
            const name = p.displayName || p.name || '?'
            const sel = S.commsTargets.has(String(p.id)) || S.commsTargets.has(p.id) || grpAll || grpNonTeam
            html += `<button class="comms-target-btn" data-comms-target="${p.id}" style="padding:3px 8px;font-size:10px;border-radius:3px;cursor:pointer;border:1px solid ${sel ? '#ff9f5d' : '#1a2a3a'};background:${sel ? '#2a1a0a' : '#0d1520'};color:${sel ? '#ff9f5d' : '#9bb0c8'}">${esc(name)}</button>`
          }
          html += '</div></div>'
        }
        html += '</div>'
      }
    }

    html += '</div>'

    // Emoji grid
    html += '<div class="box"><div class="title" style="margin-top:0">😀 Emojis</div>'
    html += '<div class="help">Click to send. Note: you may not see your own emojis in-game.</div>'
    html += '<div style="display:grid;grid-template-columns:repeat(10,1fr);gap:2px">'
    for (let i = 0; i < EMOJI_TABLE.length; i++) {
      html += `<button class="comms-emoji-btn" data-emoji-idx="${i}" style="padding:4px;font-size:18px;background:#0d1520;border:1px solid #1a2a3a;border-radius:4px;cursor:pointer" title="Emoji ${i}">${EMOJI_TABLE[i]}</button>`
    }
    html += '</div></div>'

    // QuickChat sections
    html += '<div class="box"><div class="title" style="margin-top:0">💬 Quick Chat</div>'
    html += '<div class="help">🎯 = requires target player selection</div>'
    for (const [cat, data] of Object.entries(QUICKCHAT)) {
      html += '<div style="margin-bottom:8px">'
      html += `<div style="font-size:11px;font-weight:bold;color:#9bb0c8;margin-bottom:4px">${data.label}</div>`
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px">'
      for (const key of data.keys) {
        const fullKey = `${cat}.${key}`
        const needsTarget = QC_NEEDS_TARGET.has(fullKey)
        const display = key.replace(/_/g, ' ')
        const border = needsTarget ? '#4a4a2a' : '#1a2a3a'
        const prefix = needsTarget ? '🎯 ' : ''
        html += `<button class="comms-qc-btn" data-qc-key="${fullKey}" style="padding:3px 8px;font-size:10px;background:#0d1520;border:1px solid ${border};border-radius:3px;cursor:pointer;color:#c8d8e8">${prefix}${display}</button>`
      }
      html += '</div></div>'
    }
    html += '</div>'

    // Recent sent log - no nested scroll
    if (S.commsRecentSent.length > 0) {
      html += '<div class="box"><div class="title" style="margin-top:0">📤 Recently Sent</div>'
      for (const entry of S.commsRecentSent) {
        const ts = new Date(entry.timestamp)
        const icon = entry.type === 'emoji' ? entry.label : '💬'
        html += `<div style="margin:2px 0;padding:3px 6px;background:#0d1520;border-radius:3px;font-size:10px;color:#9bb0c8">`
        html += `[${fmtTime(ts)}] ${icon} ${entry.type === 'emoji' ? '' : entry.label} → ${esc(entry.target)}`
        html += '</div>'
      }
      html += '</div>'
    }

    return html
  }


  function hotkeysView() {
    let html = '<div class="title">⌨️ Keyboard Shortcuts</div>'
    html += '<div class="help">Available keyboard shortcuts</div>'

    html += '<div class="box"><div class="title" style="margin-top:0">Auto-Troops</div>'
    html += '<div class="row"><div>Add Target</div><span class="hotkey">ALT+M</span></div>'
    html += '<div class="row"><div>Toggle Auto-Feed</div><span class="hotkey">ALT+F</span></div>'
    html += '</div>'

    return html
  }

  function aboutView() {
    let html = '<div class="title">📖 About</div>'

    html += '<div class="box">'
    html += '<div style="text-align:center;padding:16px">'
    html += '<div style="font-size:22px;font-weight:bold;color:#ffcf5d">Hammer Control Panel</div>'
    html += '<div style="font-size:14px;color:#9bb0c8;margin-top:4px">v10.4</div>'
    html += '</div>'
    html += '</div>'

    html += '<div class="box">'
    html += '<div class="title" style="margin-top:0">What is Hammer?</div>'
    html += '<div class="help" style="font-size:12px;line-height:1.6">'
    html += 'Hammer is a companion tool for <b>OpenFront.io</b> that tracks donations, '
    html += 'automates troop and gold sending, and provides real-time game analytics. '
    html += 'Built for alliance coordination and strategic resource management.'
    html += '</div>'
    html += '</div>'

    html += '<div class="box">'
    html += '<div class="title" style="margin-top:0">Features</div>'
    html += '<div style="font-size:11px;line-height:1.8">'
    html += '<div>📊 <b>Summary</b> - Session overview with donation tracking</div>'
    html += '<div>📈 <b>Stats</b> - War report, leaderboards, fun metrics</div>'
    html += '<div>🏪 <b>Ports</b> - Port trade tracking and efficiency</div>'
    html += '<div>📋 <b>Feed</b> - Live donation feed</div>'
    html += '<div>💹 <b>Gold Rate</b> - Gold income over time windows</div>'
    html += '<div>🤝 <b>Alliances</b> - Alliance and team overview</div>'
    html += '<div>🪖 <b>Auto-Troops</b> - Automated troop donations</div>'
    html += '<div>💰 <b>Auto-Gold</b> - Automated gold donations</div>'
    html += '<div>🔄 <b>Reciprocate</b> - Quick payback for incoming donations</div>'
    html += '<div>📡 <b>Comms</b> - Send emojis and quick chat messages</div>'
    html += '<div>⌨️ <b>Hotkeys</b> - Keyboard shortcuts</div>'
    html += '</div>'
    html += '</div>'

    html += '<div class="box">'
    html += '<div class="title" style="margin-top:0">Credits</div>'
    html += '<div style="font-size:11px;line-height:1.6">'
    html += '<div class="row"><div>Author</div><div class="mono">Stanley</div></div>'
    html += '<div class="row"><div>Version</div><div class="mono">10.4</div></div>'
    html += '<div class="row"><div>Game</div><div class="mono">OpenFront.io</div></div>'
    html += '<div class="row"><div>License</div><div class="mono">Free to use</div></div>'
    html += '</div>'
    html += '</div>'

    html += '<div class="box">'
    html += '<div class="title" style="margin-top:0">System Status</div>'
    html += '<div style="font-size:11px">'
    html += '<div class="row"><div>GameView Hook</div><div class="mono" style="color:' + (gameViewHooked ? '#7ff2a3' : '#ff8b94') + '">' + (gameViewHooked ? 'Hooked' : 'Not Hooked') + '</div></div>'
    html += '<div class="row"><div>DisplayEvents</div><div class="mono">' + displayEventsReceived + '</div></div>'
    html += '<div class="row"><div>Donations Tracked</div><div class="mono">' + donationsTracked + '</div></div>'
    html += '<div class="row"><div>Player Data</div><div class="mono" style="color:' + (playerDataReady ? '#7ff2a3' : '#ffcf5d') + '">' + (playerDataReady ? 'Ready' : 'Loading') + '</div></div>'
    html += '<div class="row"><div>EventBus</div><div class="mono" style="color:' + (eventBus ? '#7ff2a3' : '#ff8b94') + '">' + (eventBus ? 'Found' : 'Not Found') + '</div></div>'
    html += '<div class="row"><div>WebSocket</div><div class="mono" style="color:' + (gameSocket && gameSocket.readyState === 1 ? '#7ff2a3' : '#ff8b94') + '">' + (gameSocket && gameSocket.readyState === 1 ? 'Connected' : 'Disconnected') + '</div></div>'
    html += '</div>'
    html += '</div>'

    html += '<div class="box">'
    html += '<div class="title" style="margin-top:0">Quick Reference</div>'
    html += '<div style="font-size:11px">'
    html += '<div class="row"><div>ALT+M</div><div class="muted">Capture target under mouse</div></div>'
    html += '<div class="row"><div>ALT+F</div><div class="muted">Toggle auto-troops</div></div>'
    html += '</div>'
    html += '</div>'

    html += '<div style="text-align:center;margin-top:16px;color:#9bb0c8;font-size:10px">'
    html += 'Made for the OpenFront.io community'
    html += '</div>'

    return html
  }


  function render() {
    const content = ui.querySelector('#hm-content')
    if (!content) return

    const views = {
      summary: summaryView,
      stats: statsView,
      ports: portsView,
      feed: feedView,
      alliances: alliancesView,
      autotroops: autoDonateTroopsView,
      autogold: autoDonateGoldView,
      reciprocate: reciprocateView,
      comms: commsView,
      hotkeys: hotkeysView,
      about: aboutView
    }

    const fn = views[S.view]
    if (fn) content.innerHTML = fn()

    ui.querySelectorAll('.tab').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-v') === S.view)
    })

    // Auto-troops handlers
    ui.querySelectorAll('.at-ratio-btn').forEach(btn => {
      btn.onclick = () => { S.asTroopsRatio = parseInt(btn.getAttribute('data-pct')) }
    })
    const atRatioInput = ui.querySelector('#at-ratio-input')
    if (atRatioInput) {
      atRatioInput.onchange = () => { S.asTroopsRatio = Math.max(1, Math.min(100, num(atRatioInput.value))) }
    }
    ui.querySelectorAll('.at-threshold-btn').forEach(btn => {
      btn.onclick = () => { S.asTroopsThreshold = parseInt(btn.getAttribute('data-pct')) }
    })
    const atCooldown = ui.querySelector('#at-cooldown')
    const atAllTeamToggle = ui.querySelector('#at-allteam-toggle')
    const atStart = ui.querySelector('#at-start')
    const atClear = ui.querySelector('#at-clear')

    if (atCooldown) {
      atCooldown.onchange = () => { S.asTroopsCooldownSec = Math.max(10, num(atCooldown.value)) }
    }
    if (atAllTeamToggle) {
      atAllTeamToggle.onclick = () => { S.asTroopsAllTeamMode = !S.asTroopsAllTeamMode }
    }
    if (atStart) {
      atStart.onclick = () => {
        if (Date.now() - asTroopsLastToggle < 600) return  // Debounce during render cycle
        if (S.asTroopsRunning) asTroopsStop()
        else asTroopsStart()
      }
    }
    if (atClear) {
      atClear.onclick = () => {
        S.asTroopsLog = []
      }
    }

    const atTestSend = ui.querySelector('#at-test-send')
    if (atTestSend) {
      atTestSend.onclick = () => {
        const me = readMyPlayer()
        if (!me) {
          showStatus('❌ Player data not available')
          return
        }
        const targets = asResolveTargets()
        if (targets.length === 0) {
          showStatus('❌ No targets configured')
          return
        }
        const target = targets[0]
        const toSend = Math.max(1, Math.floor(me.troops * (S.asTroopsRatio / 100)))
        if (asSendTroops(target.id, toSend)) {
          showStatus(`✅ Test: Sent ${short(toSend)} troops to ${target.name}`)
          S.asTroopsLog.push(`[${fmtTime(nowDate())}] TEST: Sent ${short(toSend)} troops to ${target.name}`)
        } else {
          showStatus('❌ Test failed - check connection')
        }
      }
    }

    ui.querySelectorAll('[data-toggle-troop-target]').forEach(btn => {
      btn.onclick = () => {
        const target = btn.getAttribute('data-toggle-troop-target')
        const idx = S.asTroopsTargets.indexOf(target)
        if (idx >= 0) {
          S.asTroopsTargets.splice(idx, 1)
        } else {
          S.asTroopsTargets.push(target)
        }
      }
    })

    ui.querySelectorAll('[data-remove-troop-target]').forEach(span => {
      span.onclick = (e) => {
        e.stopPropagation()
        const target = span.getAttribute('data-remove-troop-target')
        const idx = S.asTroopsTargets.indexOf(target)
        if (idx >= 0) S.asTroopsTargets.splice(idx, 1)
      }
    })

    // Auto-gold handlers
    ui.querySelectorAll('.ag-ratio-btn').forEach(btn => {
      btn.onclick = () => { S.asGoldRatio = parseInt(btn.getAttribute('data-pct')) }
    })
    const agRatioInput = ui.querySelector('#ag-ratio-input')
    if (agRatioInput) {
      agRatioInput.onchange = () => { S.asGoldRatio = Math.max(1, Math.min(100, num(agRatioInput.value))) }
    }
    const agThreshold = ui.querySelector('#ag-threshold')
    const agCooldown = ui.querySelector('#ag-cooldown')
    const agAllTeamToggle = ui.querySelector('#ag-allteam-toggle')
    const agStart = ui.querySelector('#ag-start')
    const agClear = ui.querySelector('#ag-clear')

    if (agThreshold) {
      agThreshold.onchange = () => { S.asGoldThreshold = Math.max(0, num(agThreshold.value)) }
    }
    if (agCooldown) {
      agCooldown.onchange = () => { S.asGoldCooldownSec = Math.max(10, num(agCooldown.value)) }
    }
    if (agAllTeamToggle) {
      agAllTeamToggle.onclick = () => { S.asGoldAllTeamMode = !S.asGoldAllTeamMode }
    }
    if (agStart) {
      agStart.onclick = () => {
        if (Date.now() - asGoldLastToggle < 600) return  // Debounce during render cycle
        if (S.asGoldRunning) asGoldStop()
        else asGoldStart()
      }
    }
    if (agClear) {
      agClear.onclick = () => { S.asGoldLog = [] }
    }

    const agTestSend = ui.querySelector('#ag-test-send')
    if (agTestSend) {
      agTestSend.onclick = () => {
        const me = readMyPlayer()
        if (!me) {
          showStatus('❌ Player data not available')
          return
        }
        const targets = asResolveGoldTargets()
        if (targets.length === 0) {
          showStatus('❌ No targets configured')
          return
        }
        const target = targets[0]
        const toSend = Math.floor(Number(me.gold || 0n) * (S.asGoldRatio / 100))
        if (asSendGold(target.id, toSend)) {
          showStatus(`✅ Test: Sent ${short(toSend)} gold to ${target.name}`)
          S.asGoldLog.push(`[${fmtTime(nowDate())}] TEST: Sent ${short(toSend)} gold to ${target.name}`)
        } else {
          showStatus('❌ Test failed - check connection')
        }
      }
    }

    ui.querySelectorAll('[data-toggle-gold-target]').forEach(btn => {
      btn.onclick = () => {
        const target = btn.getAttribute('data-toggle-gold-target')
        const idx = S.asGoldTargets.indexOf(target)
        if (idx >= 0) {
          S.asGoldTargets.splice(idx, 1)
        } else {
          S.asGoldTargets.push(target)
        }
      }
    })

    ui.querySelectorAll('[data-remove-gold-target]').forEach(span => {
      span.onclick = (e) => {
        e.stopPropagation()
        const target = span.getAttribute('data-remove-gold-target')
        const idx = S.asGoldTargets.indexOf(target)
        if (idx >= 0) S.asGoldTargets.splice(idx, 1)
      }
    })

    // Alliance tab handlers - comms toggle
    ui.querySelectorAll('.alliance-comms-toggle').forEach(btn => {
      btn.onclick = () => {
        const pid = btn.getAttribute('data-pid')
        S.allianceCommsExpanded = S.allianceCommsExpanded === pid ? null : pid
      }
    })

    // Alliance inline emoji buttons
    ui.querySelectorAll('.alliance-emoji-btn').forEach(btn => {
      btn.onclick = () => {
        const pid = btn.getAttribute('data-pid')
        const idx = parseInt(btn.getAttribute('data-eidx'))
        if (sendEmoji(pid, idx)) {
          showStatus(`✅ Sent ${EMOJI_TABLE[idx]} to ${playersById.get(pid)?.displayName || 'player'}`)
        }
      }
    })

    // Alliance inline quickchat buttons
    ui.querySelectorAll('.alliance-qc-btn').forEach(btn => {
      btn.onclick = () => {
        const pid = btn.getAttribute('data-pid')
        const key = btn.getAttribute('data-qc')
        if (sendQuickChat(pid, key)) {
          showStatus(`✅ Sent quick chat to ${playersById.get(pid)?.displayName || 'player'}`)
        }
      }
    })

    // Comms tab handlers - group buttons
    const grpAll = ui.querySelector('#comms-grp-all')
    if (grpAll) grpAll.onclick = () => {
      S.commsGroupMode = S.commsGroupMode === 'all' ? null : 'all'
    }
    const grpTeam = ui.querySelector('#comms-grp-team')
    if (grpTeam) grpTeam.onclick = () => {
      S.commsGroupMode = S.commsGroupMode === 'all-team' ? null : 'all-team'
    }
    const grpNonTeam = ui.querySelector('#comms-grp-nonteam')
    if (grpNonTeam) grpNonTeam.onclick = () => {
      S.commsGroupMode = S.commsGroupMode === 'all-non-team' ? null : 'all-non-team'
    }
    const grpClear = ui.querySelector('#comms-grp-clear')
    if (grpClear) grpClear.onclick = () => {
      S.commsGroupMode = null
      S.commsTargets.clear()
    }

    // Others collapsible toggle
    const othersToggle = ui.querySelector('#comms-others-toggle')
    if (othersToggle) othersToggle.onclick = () => {
      S.commsOthersExpanded = !S.commsOthersExpanded
    }

    // Individual player toggle buttons (multi-select)
    ui.querySelectorAll('.comms-target-btn').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-comms-target')
        if (S.commsTargets.has(id)) {
          S.commsTargets.delete(id)
        } else {
          S.commsTargets.add(id)
        }
      }
    })

    // Send emoji to all resolved targets
    ui.querySelectorAll('.comms-emoji-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute('data-emoji-idx'))
        const targets = resolveCommsTargets()
        if (targets.length === 0) {
          showStatus('❌ No targets selected')
          return
        }
        let sentCount = 0
        const names = []
        for (const t of targets) {
          if (sendEmoji(t.id, idx)) {
            sentCount++
            names.push(t.name)
          }
        }
        if (sentCount > 0) {
          const targetLabel = sentCount > 3 ? `${sentCount} players` : names.join(', ')
          logCommsSent('emoji', EMOJI_TABLE[idx] || '?', targetLabel)
          showStatus(`📡 Sent ${EMOJI_TABLE[idx] || '?'} to ${targetLabel}`)
        } else {
          showStatus('❌ Failed to send emoji')
        }
      }
    })

    // Send quickchat to all resolved targets
    ui.querySelectorAll('.comms-qc-btn').forEach(btn => {
      btn.onclick = () => {
        const key = btn.getAttribute('data-qc-key')
        if (QC_NEEDS_TARGET.has(key)) {
          S.commsPendingQC = key
          return
        }
        const targets = resolveCommsTargets()
        if (targets.length === 0) {
          showStatus('❌ No targets selected')
          return
        }
        let sentCount = 0
        const names = []
        for (const t of targets) {
          if (sendQuickChat(t.id, key)) {
            sentCount++
            names.push(t.name)
          }
        }
        if (sentCount > 0) {
          const display = key.split('.').pop().replace(/_/g, ' ')
          const targetLabel = sentCount > 3 ? `${sentCount} players` : names.join(', ')
          logCommsSent('quickchat', display, targetLabel)
          showStatus(`📡 Sent "${display}" to ${targetLabel}`)
        } else {
          showStatus('❌ Failed to send message')
        }
      }
    })

    // QuickChat target picker handlers (when a message needs a target player)
    ui.querySelectorAll('.comms-qc-target-btn').forEach(btn => {
      btn.onclick = () => {
        const targetPlayerId = btn.getAttribute('data-qc-target-id')
        const key = S.commsPendingQC
        if (!key) return
        const targets = resolveCommsTargets()
        if (targets.length === 0) {
          showStatus('❌ No recipients selected')
          S.commsPendingQC = null
          return
        }
        let targetPlayer = playersById.get(targetPlayerId) || playersById.get(Number(targetPlayerId))
        const targetName = targetPlayer ? (targetPlayer.displayName || targetPlayer.name || '?') : '?'
        let sentCount = 0
        const names = []
        for (const t of targets) {
          if (sendQuickChat(t.id, key, targetPlayerId)) {
            sentCount++
            names.push(t.name)
          }
        }
        if (sentCount > 0) {
          const display = key.split('.').pop().replace(/_/g, ' ')
          const targetLabel = sentCount > 3 ? `${sentCount} players` : names.join(', ')
          logCommsSent('quickchat', `${display} [${targetName}]`, targetLabel)
          showStatus(`📡 Sent "${display} ${targetName}" to ${targetLabel}`)
        } else {
          showStatus('❌ Failed to send message')
        }
        S.commsPendingQC = null
      }
    })

    const qcCancel = ui.querySelector('#comms-qc-cancel')
    if (qcCancel) {
      qcCancel.onclick = () => { S.commsPendingQC = null }
    }

    // Reciprocate tab handlers
    const recipToggle = ui.querySelector('#recip-toggle')
    if (recipToggle) {
      recipToggle.onclick = () => {
        S.reciprocateEnabled = !S.reciprocateEnabled
        if (!S.reciprocateEnabled) {
          clearReciprocateNotifications()
        }
      }
    }

    const recipModeManual = ui.querySelector('#recip-mode-manual')
    if (recipModeManual) {
      recipModeManual.onclick = () => {
        S.reciprocateMode = 'manual'
        clearReciprocateNotifications()
      }
    }

    const recipModeAuto = ui.querySelector('#recip-mode-auto')
    if (recipModeAuto) {
      recipModeAuto.onclick = () => {
        S.reciprocateMode = 'auto'
        clearReciprocateNotifications()
      }
    }

    const recipDuration = ui.querySelector('#recip-duration')
    if (recipDuration) {
      recipDuration.onchange = () => {
        S.reciprocateNotifyDuration = Math.max(10, Math.min(60, parseInt(recipDuration.value) || 30))
      }
    }

    const recipOnTroops = ui.querySelector('#recip-on-troops')
    if (recipOnTroops) {
      recipOnTroops.onclick = () => { S.reciprocateOnTroops = !S.reciprocateOnTroops }
    }

    const recipOnGold = ui.querySelector('#recip-on-gold')
    if (recipOnGold) {
      recipOnGold.onclick = () => { S.reciprocateOnGold = !S.reciprocateOnGold }
    }

    const recipPopupsToggle = ui.querySelector('#recip-popups-toggle')
    if (recipPopupsToggle) {
      recipPopupsToggle.onclick = () => {
        S.reciprocatePopupsEnabled = !S.reciprocatePopupsEnabled
        if (!S.reciprocatePopupsEnabled) clearReciprocateNotifications()
      }
    }

    const recipClearHistory = ui.querySelector('#recip-clear-history')
    if (recipClearHistory) {
      recipClearHistory.onclick = () => {
        S.reciprocateHistory = []
      }
    }

    // Auto mode percentage buttons
    ui.querySelectorAll('.recip-auto-pct-btn').forEach(btn => {
      btn.onclick = () => {
        S.reciprocateAutoPct = parseInt(btn.getAttribute('data-pct'))
      }
    })

    // Quick send buttons (manual mode via tab)
    ui.querySelectorAll('.recip-send-btn').forEach(btn => {
      btn.onclick = () => {
        const donorId = btn.getAttribute('data-donor-id')
        const donorName = btn.getAttribute('data-donor-name')
        const pct = parseInt(btn.getAttribute('data-pct'))
        handleQuickReciprocate(donorId, donorName, pct, null)
      }
    })

    // Clear individual donor buttons
    ui.querySelectorAll('.recip-clear-donor').forEach(btn => {
      btn.onclick = () => {
        const donorId = btn.getAttribute('data-donor-id')
        S.inbound.delete(donorId)
      }
    })

    // Clear all donors button
    const clearAllDonors = ui.querySelector('#recip-clear-all-donors')
    if (clearAllDonors) {
      clearAllDonors.onclick = () => { S.inbound.clear() }
    }

  }

  const tickId = setInterval(() => {
    render()
  }, 500)
  setInterval(() => S.seen.clear(), 60000)

  // Start reciprocate queue processor
  const reciprocateProcessorId = setInterval(() => {
    if (S.reciprocateEnabled && S.reciprocateMode === 'auto') {
      processReciprocateQueue()
    }
  }, 1000)  // Process every 1 second

  // ===== CLEANUP FUNCTION =====
  function cleanup() {
    console.log('[HAMMER] Cleanup started...')

    // Clear intervals
    clearInterval(tickId)
    clearInterval(reciprocateProcessorId)
    if (asTroopsTimer) clearInterval(asTroopsTimer)
    if (asGoldTimer) clearInterval(asGoldTimer)

    // Clean up all event listeners
    eventCleanup.forEach(fn => {
      try { fn() } catch (e) { console.warn('[HAMMER] Event cleanup error:', e) }
    })
    eventCleanup.length = 0

    // Restore prototypes
    if (origSetTransform) {
      try {
        CanvasRenderingContext2D.prototype.setTransform = origSetTransform
      } catch {}
    }
    if (origDrawImage) {
      try {
        CanvasRenderingContext2D.prototype.drawImage = origDrawImage
      } catch {}
    }

    // Restore Worker constructor
    try {
      Object.defineProperty(window, 'Worker', {
        configurable: true,
        writable: true,
        value: OriginalWorker
      })
    } catch {}

    // Restore WebSocket constructor
    try {
      Object.defineProperty(window, 'WebSocket', {
        configurable: true,
        writable: true,
        value: OriginalWebSocket
      })
    } catch {}

    console.log('[HAMMER] Cleanup complete')
  }

  window.__HAMMER__ = {
    cleanup,
    ui: { root: ui },
    version: '10.4',
    exportLogs: Logger.exportLogs,
    setDebug: Logger.setDebug,
    isDebug: Logger.isDebug,
    asSendGold,
    asSendTroops,
    findPlayer,
    getState: () => ({
      mySmallID,
      currentClientID,
      playerDataReady,
      pendingMessagesCount: pendingMessages.length,
      playersCount: playersById.size,
      myAllies,
      myTeam,
      playersById,
      playersBySmallId,
      eventBus: !!eventBus,
      eventBusMethod: eventBus ? 'EventBus' : 'WebSocket',
      gameSocket: !!gameSocket,
      gameSocketReady: gameSocket?.readyState,
      gameViewHooked,
      displayEventsReceived,
      donationsTracked,
      inboundCount: S.inbound.size,
      outboundCount: S.outbound.size,
      feedInCount: S.feedIn.length,
      feedOutCount: S.feedOut.length,
      autoSendReady: !!(eventBus || (gameSocket && gameSocket.readyState === 1 && currentClientID)),
      autoSendMethod: eventBus ? 'EventBus (preferred)' : 'WebSocket (fallback)'
    }),
    state: S
  }

  render()

  // Show initialization status
  const initMessages = []
  if (foundWorker) initMessages.push('✅ Worker')
  else initMessages.push('⚠️ Worker (will intercept)')
  if (foundWebSocket) initMessages.push('✅ WebSocket')
  else initMessages.push('⚠️ WebSocket (will intercept)')
  if (targetCanvas) initMessages.push('✅ Canvas')
  else initMessages.push('⏳ Canvas (detecting...)')

  console.log('%c[HAMMER]%c v10.4 Control Panel ready! 🔨', 'color:#deb887;font-weight:bold', 'color:inherit')
  console.log('[HAMMER] Status:', initMessages.join(' | '))
  console.log('[HAMMER] Debug logging OFF by default. Toggle via UI button or __HAMMER__.setDebug(true)')
})()
