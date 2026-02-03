// =====================================================================
// HAMMER v9.0 "MINIMAL EDITION"
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
// v9.0 - Minimal refactor (Feb 2026)
//   - Enhanced logging system with export
//   - Removed: SAM/Atom/Hydrogen overlays, embargo controls
//   - Slimmed down from 2360 to 2184 lines (84KB)
//   - Based on v8.10 SMOOTH EDITION
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
        version: '9.0',
        timestamp: new Date().toISOString(),
        totalLogs: logBuffer.length,
        exportedLogs: logs.length,
        logs: logs
      }, null, 2)
    }

    // Simple logging functions
    const log = (...args) => {
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

    return { log, warn, error, exportLogs }
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

  const TICK_MS = 100
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
  const playersByName = new Map()
  let lastPlayers = []

  // Message buffering for timing fix
  const pendingMessages = []
  let playerDataReady = false

  // Resource tracking for alternative donation detection
  let lastMyGold = 0
  let lastMyTroops = 0
  const recentIntents = [] // Track our own intents

  // Diagnostic system state
  const diagnosticEvents = []
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

  // Status overlay for hotkey feedback
  let statusOverlay = null

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
    if (!statusOverlay) {
      statusOverlay = document.createElement('div')
      Object.assign(statusOverlay.style, {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(0, 0, 0, 0.9)',
        color: '#7ff2a3',
        padding: '20px 40px',
        borderRadius: '12px',
        font: 'bold 16px Consolas, monospace',
        zIndex: '2147483647',
        boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
        border: '2px solid #7ff2a3',
        pointerEvents: 'none'
      })
      document.body.appendChild(statusOverlay)
    }
    statusOverlay.textContent = message
    statusOverlay.style.display = 'block'

    clearTimeout(statusOverlay._timer)
    statusOverlay._timer = setTimeout(() => {
      statusOverlay.style.display = 'none'
    }, duration)
  }

  // ===== STATE =====
  const SIZES = [
    { w: 520, h: 420, bodyH: 372, label: 'S' },
    { w: 750, h: 580, bodyH: 532, label: 'M' },
    { w: 1000, h: 720, bodyH: 672, label: 'L' }
  ]

  const S = {
    view: 'autotroops',
    paused: false, minimized: false, sizeIdx: 1,
    myTag: null, filterTagMates: false,
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
    asGoldAllTeamMode: false
  }

  function bump(map, key) {
    if (!map.has(key)) map.set(key, { gold: 0, troops: 0, count: 0, last: null })
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

  // ===== TAG HELPERS =====
  const tagOf = n => {
    const m = String(n || '').match(/\[\s*([^\]]+?)\s*\]/)
    return m ? m[1].trim() : null
  }

  function hasTag(player, tag) {
    if (!tag || !player) return false
    const t = tagOf(player.displayName || player.name || '')
    return t && t.toLowerCase() === tag.toLowerCase()
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

  function getTagMates() {
    if (!S.myTag) return []
    const me = readMyPlayer()
    if (!me) return []
    return [...playersById.values()]
      .filter(p => p.id !== me.id && p.isAlive && hasTag(p, S.myTag))
      .sort((a, b) => (a.displayName || a.name || '').localeCompare(b.displayName || b.name || ''))
  }

  function asIsAlly(tid) {
    const p = playersById.get(tid)

    log('[ALLIANCE CHECK] asIsAlly(', tid, '):', {
      playerFound: !!p,
      playerName: p ? (p.displayName || p.name) : null,
      myTeam,
      theirTeam: p?.team,
      teamsMatch: p?.team != null && myTeam != null && p.team === myTeam,
      myAlliesSize: myAllies.size,
      myAlliesHas: p ? myAllies.has(p.smallID) : false,
      theirSmallID: p?.smallID
    })

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
        playersByName.clear()
        for (const p of players) {
          if (!p) continue
          playersById.set(p.id, p)
          if (p.smallID != null) playersBySmallId.set(p.smallID, p)
          if (p.name) playersByName.set(String(p.name).toLowerCase(), p)
          if (p.displayName) playersByName.set(String(p.displayName).toLowerCase(), p)
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
          const currentGold = my.gold || 0
          const currentTroops = my.troops || 0
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

    if (pid !== mySmallID) {
      log('[DEBUG] Message filtered - wrong player:', {
        messagePID: pid,
        mySmallID: mySmallID,
        text: text
      })
      return
    }

    const key = `${mt}:${text}:${params.name || ''}`
    if (S.seen.has(key)) return
    S.seen.add(key)
    if (S.seen.size > 5000) S.seen.clear()

    const now = Date.now()

    // Extract values from params object (new structure)
    if (mt === MessageType.RECEIVED_TROOPS_FROM_PLAYER) {
      const name = params.name
      const amt = parseAmt(params.troops)
      if (name && amt > 0) {
        log('[DEBUG] Matched RECEIVED_TROOPS:', { name, amt, params })
        const from = findPlayer(name)
        if (from) {
          const r = bump(S.inbound, from.id)
          r.troops += amt; r.count++; r.last = nowDate()
          S.feedIn.push({ ts: nowDate(), type: 'troops', name, amount: amt, isPort: false })
          if (S.feedIn.length > 500) S.feedIn.shift()
          donationsTracked++
          addDiagnosticEvent('DONATION_TRACKED', {
            messageType: mt,
            typeName: 'RECEIVED_TROOPS',
            name: name,
            amount: amt
          })
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
          r.troops += amt; r.count++; r.last = nowDate()
          S.feedOut.push({ ts: nowDate(), type: 'troops', name, amount: amt, isPort: false })
          if (S.feedOut.length > 500) S.feedOut.shift()
          donationsTracked++
          addDiagnosticEvent('DONATION_TRACKED', {
            messageType: mt,
            typeName: 'SENT_TROOPS',
            name: name,
            amount: amt
          })
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
          const r = bump(S.inbound, from.id)
          r.gold += amt; r.count++; r.last = nowDate()
          S.feedIn.push({ ts: nowDate(), type: 'gold', name, amount: amt, isPort: true })
          if (S.feedIn.length > 500) S.feedIn.shift()
          bumpPorts(from.id, amt, now)
          donationsTracked++
          addDiagnosticEvent('DONATION_TRACKED', {
            messageType: mt,
            typeName: 'TRADE_GOLD',
            name: name,
            amount: amt
          })
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
          const r = bump(S.inbound, from.id)
          r.gold += amt; r.count++; r.last = nowDate()
          S.feedIn.push({ ts: nowDate(), type: 'gold', name, amount: amt, isPort: false })
          if (S.feedIn.length > 500) S.feedIn.shift()
          donationsTracked++
          addDiagnosticEvent('DONATION_TRACKED', {
            messageType: mt,
            typeName: 'RECEIVED_GOLD',
            name: name,
            amount: amt
          })
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
          r.gold += amt; r.count++; r.last = nowDate()
          S.feedOut.push({ ts: nowDate(), type: 'gold', name, amount: amt, isPort: false })
          if (S.feedOut.length > 500) S.feedOut.shift()
          donationsTracked++
          addDiagnosticEvent('DONATION_TRACKED', {
            messageType: mt,
            typeName: 'SENT_GOLD',
            name: name,
            amount: amt
          })
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
    if (!name) return null
    const lower = String(name).toLowerCase()
    let found = playersByName.get(lower)
    if (found) {
      log('[DEBUG] findPlayer SUCCESS (map):', {
        input: name,
        found: found.displayName || found.name,
        mapSize: playersByName.size
      })
      return { id: found.id, name: found.displayName || found.name || name }
    }
    for (const p of playersById.values()) {
      const pn = p.displayName || p.name || ''
      if (pn.toLowerCase() === lower) {
        log('[DEBUG] findPlayer SUCCESS (iteration):', {
          input: name,
          found: pn,
          mapSize: playersByName.size
        })
        return { id: p.id, name: pn }
      }
    }
    log('[DEBUG] findPlayer FAILED:', {
      input: name,
      mapSize: playersByName.size,
      playersCount: playersById.size
    })
    return null
  }

  // ===== DIAGNOSTIC HELPER FUNCTIONS =====
  function addDiagnosticEvent(type, data) {
    const event = {
      timestamp: new Date().toISOString(),
      type,
      data
    }
    diagnosticEvents.push(event)
    if (diagnosticEvents.length > 100) diagnosticEvents.shift()
    // Note: UI updates handled by render() function every 500ms to prevent flickering
  }

  function updateDiagnosticUI() {
    const gameviewSpan = document.getElementById('diag-gameview')
    const displayeventsSpan = document.getElementById('diag-displayevents')
    const playerdataSpan = document.getElementById('diag-playerdata')
    const donationsSpan = document.getElementById('diag-donations')
    const eventsDiv = document.getElementById('diag-events')

    if (gameviewSpan) {
      gameviewSpan.textContent = gameViewHooked ? '✅ Hooked' : '❌ Not Hooked'
      gameviewSpan.style.color = gameViewHooked ? '#0f0' : '#f00'
    }

    if (displayeventsSpan) {
      displayeventsSpan.textContent = displayEventsReceived.toString()
      displayeventsSpan.style.color = displayEventsReceived > 0 ? '#0f0' : '#f90'
    }

    if (playerdataSpan) {
      playerdataSpan.textContent = playerDataReady ? '✅ Ready' : '⏳ Loading'
      playerdataSpan.style.color = playerDataReady ? '#0f0' : '#f90'
    }

    if (donationsSpan) {
      donationsSpan.textContent = donationsTracked.toString()
      donationsSpan.style.color = donationsTracked > 0 ? '#0f0' : '#6cf'
    }

    if (eventsDiv && diagnosticEvents.length > 0) {
      eventsDiv.innerHTML = diagnosticEvents.slice(-10).reverse().map(e => {
        const time = e.timestamp.substring(11, 19)
        const dataStr = JSON.stringify(e.data).substring(0, 100)
        return `<div style="border-bottom: 1px solid #333; padding: 3px 0;">
          <span style="color: #888;">${time}</span>
          <span style="color: #6cf; font-weight: bold;"> ${e.type}</span>:
          <span style="color: #fc6;">${dataStr}</span>
        </div>`
      }).join('')
    }
  }

  function exportDiagnostics() {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        version: '9.0.2-diagnostic',
        status: {
          gameViewHooked,
          displayEventsReceived,
          playerDataReady,
          donationsTracked,
          mySmallID,
          currentClientID,
          playersCount: playersById.size,
          playerNamesCount: playersByName.size,
          gameSocket: !!gameSocket,
          gameSocketReady: gameSocket?.readyState
        },
        events: diagnosticEvents,
        state: {
          inboundCount: S.inbound.size,
          outboundCount: S.outbound.size,
          feedInCount: S.feedIn.length,
          feedOutCount: S.feedOut.length,
          rawMessagesCount: S.rawMessages.length
        },
        recentLogs: Logger?.getRecentLogs ? Logger.getRecentLogs(50) : []
      }

      const json = JSON.stringify(report, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `hammer-diagnostics-${Date.now()}.json`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 100)

      log('[HAMMER] Diagnostic report downloaded')
      console.log('[HAMMER] ✅ Diagnostic report downloaded!')
      return true
    } catch (err) {
      log('[ERROR] Failed to export diagnostics:', err)
      console.error('[HAMMER] Failed to export diagnostics:', err)
      return false
    }
  }

  function clearDiagnostics() {
    diagnosticEvents.length = 0
    displayEventsReceived = 0
    donationsTracked = 0
    updateDiagnosticUI()
    log('[HAMMER] Diagnostics cleared')
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

  // Discover and wrap EXISTING Worker instances
  let foundWorker = false
  try {
    for (let prop in window) {
      try {
        const val = window[prop]
        if (val && val instanceof OriginalWorker && !val.__hammerWrapped) {
          console.log(`[HAMMER] 🔍 Found existing Worker at window.${prop}`)
          wrapWorker(val)
          foundWorker = true
        }
      } catch {}
    }

    const commonProps = ['gameWorker', 'worker', '_worker', 'mainWorker']
    for (const prop of commonProps) {
      try {
        if (window[prop] && window[prop] instanceof OriginalWorker && !window[prop].__hammerWrapped) {
          console.log(`[HAMMER] 🔍 Found existing Worker at window.${prop}`)
          wrapWorker(window[prop])
          foundWorker = true
        }
      } catch {}
    }
  } catch (e) {
    console.warn('[HAMMER] Worker discovery error:', e)
  }

  if (!foundWorker) {
    console.log('[HAMMER] ⚠️ No existing Worker found - will intercept when created')
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

  // Discover and wrap EXISTING WebSocket instances
  let foundWebSocket = false
  try {
    for (let prop in window) {
      try {
        const val = window[prop]
        if (val && val instanceof OriginalWebSocket && !val.__hammerWrapped) {
          console.log(`[HAMMER] 🔍 Found existing WebSocket at window.${prop}`)
          wrapWebSocket(val)
          foundWebSocket = true
        }
      } catch {}
    }

    const commonProps = ['socket', 'ws', 'gameSocket', '_socket', 'connection']
    for (const prop of commonProps) {
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

  function findEventBus() {
    if (eventBus) return true

    eventBusAttempts++
    console.log(`[HAMMER] 🔍 EventBus search attempt ${eventBusAttempts}/${maxEventBusAttempts}`)

    // Try to find EventBus via events-display element
    try {
      const eventsDisplay = document.querySelector('events-display')
      console.log('[HAMMER] events-display element:', eventsDisplay ? 'found' : 'not found')
      if (eventsDisplay) {
        console.log('[HAMMER] events-display.eventBus:', eventsDisplay.eventBus ? 'found' : 'not found')
      }
      if (eventsDisplay && eventsDisplay.eventBus) {
        eventBus = eventsDisplay.eventBus
        console.log('[HAMMER] ✅ Found EventBus via events-display')
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
        console.log('[HAMMER] ✅ Found EventBus via game-view')
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
          console.log(`[HAMMER] ✅ Found EventBus at window.${prop}`)
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

  // Start searching for EventBus immediately and aggressively
  setTimeout(findEventBus, 100)
  setTimeout(findEventBus, 500)
  setTimeout(findEventBus, 1000)
  setTimeout(findEventBus, 2000)
  setTimeout(findEventBus, 3000)

  // Also search whenever DOM changes
  const eventBusObserver = new MutationObserver(() => {
    if (!eventBus) findEventBus()
  })
  eventBusObserver.observe(document.body, { childList: true, subtree: true })

  // ===== EVENTBUS DONATION EVENTS =====
  // These mirror the game's own event classes from SendResourceModal.ts

  class SendDonateGoldIntentEvent {
    constructor(recipient, gold) {
      this.recipient = recipient  // Must be player object with .id property
      this.gold = gold              // BigInt or number
    }
  }

  class SendDonateTroopsIntentEvent {
    constructor(recipient, troops) {
      this.recipient = recipient    // Must be player object with .id property
      this.troops = troops          // number
    }
  }

  // ===== GAMEVIEW HOOK FOR DISPLAYEVENTS =====
  function hookGameView() {
    // Try to find GameView instance via EventsDisplay element
    const eventsDisplay = document.querySelector('events-display')

    // Diagnostic logging
    if (!eventsDisplay) {
      log('[DEBUG] GameView hook attempt: events-display element not found')
      addDiagnosticEvent('HOOK_ATTEMPT', { reason: 'events-display not found', attempt: gameViewHookAttempts })
      return false
    }

    if (!eventsDisplay.game) {
      log('[DEBUG] GameView hook attempt: events-display found but .game property not set')
      addDiagnosticEvent('HOOK_ATTEMPT', { reason: 'eventsDisplay.game not set', attempt: gameViewHookAttempts })
      return false
    }

    const gameView = eventsDisplay.game

    if (!gameView.updatesSinceLastTick) {
      log('[ERROR] GameView found but no updatesSinceLastTick method')
      addDiagnosticEvent('HOOK_FAILED', { reason: 'updatesSinceLastTick method missing' })
      return false
    }

    if (gameView.__hammerHooked) {
      log('[DEBUG] GameView already hooked')
      return true
    }

    const originalUpdatesSinceLastTick = gameView.updatesSinceLastTick.bind(gameView)

    gameView.updatesSinceLastTick = function() {
      const updates = originalUpdatesSinceLastTick()

      if (updates) {
        // Process DisplayEvents (type 3)
        const displayEvents = updates[GameUpdateType.DisplayEvent]
        if (displayEvents?.length) {
          displayEventsReceived += displayEvents.length
          addDiagnosticEvent('DISPLAY_EVENTS', {
            count: displayEvents.length,
            events: displayEvents.map(e => ({
              type: e.messageType,
              message: e.message,
              playerID: e.playerID,
              hasParams: !!e.params
            }))
          })
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
    addDiagnosticEvent('GAMEVIEW_HOOKED', { success: true, attempts: gameViewHookAttempts })
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
      addDiagnosticEvent('HOOK_FAILED', { reason: 'max attempts reached', attempts: maxGameViewAttempts })
      if (hookCheckInterval) {
        clearInterval(hookCheckInterval)
        hookCheckInterval = null
      }
      return false
    }

    return false
  }

  // Strategy 1: Use MutationObserver to watch for events-display element
  const hookObserver = new MutationObserver((mutations) => {
    if (gameViewHooked) {
      hookObserver.disconnect()
      return
    }

    const eventsDisplay = document.querySelector('events-display')
    if (eventsDisplay) {
      log('[DEBUG] events-display element detected via MutationObserver')
      addDiagnosticEvent('ELEMENT_DETECTED', { method: 'MutationObserver' })
      // Give it a moment for the game property to be set
      setTimeout(() => {
        if (!gameViewHooked) {
          tryHookGameView()
        }
      }, 100)
    }
  })

  hookObserver.observe(document.body, { childList: true, subtree: true })
  eventCleanup.push(() => hookObserver.disconnect())

  // Strategy 2: Periodic checks (fallback)
  hookCheckInterval = setInterval(() => {
    if (!gameViewHooked) {
      tryHookGameView()
    } else {
      clearInterval(hookCheckInterval)
      hookCheckInterval = null
    }
  }, 100)
  eventCleanup.push(() => {
    if (hookCheckInterval) clearInterval(hookCheckInterval)
  })

  // Strategy 3: Immediate attempt
  setTimeout(tryHookGameView, 500)

  // ===== DIRECT COMPONENT HOOK =====
  // Hook directly into EventsDisplay.onDisplayMessageEvent
  let componentHooked = false

  function hookEventsDisplayComponent() {
    const eventsDisplay = document.querySelector('events-display')

    if (!eventsDisplay) {
      setTimeout(hookEventsDisplayComponent, 200)
      return
    }

    if (componentHooked) return

    // Hook the onDisplayMessageEvent method directly
    if (eventsDisplay.onDisplayMessageEvent) {
      const originalMethod = eventsDisplay.onDisplayMessageEvent.bind(eventsDisplay)

      eventsDisplay.onDisplayMessageEvent = function(event) {
        // Log the raw event
        log('[COMPONENT] DisplayEvent received:', {
          message: event.message,
          messageType: event.messageType,
          playerID: event.playerID,
          goldAmount: event.goldAmount,
          params: event.params
        })

        addDiagnosticEvent('COMPONENT_EVENT', {
          message: event.message,
          messageType: event.messageType,
          hasParams: !!event.params,
          hasGoldAmount: event.goldAmount !== undefined
        })

        // Process the event
        try {
          processDisplayMessage(event)
        } catch (err) {
          log('[COMPONENT] Error processing:', err)
        }

        // Call original method
        return originalMethod(event)
      }

      componentHooked = true
      log('[HAMMER] ✅ Hooked EventsDisplay.onDisplayMessageEvent()')
      addDiagnosticEvent('COMPONENT_HOOKED', { success: true })
    } else {
      log('[COMPONENT] onDisplayMessageEvent not found, retrying...')
      setTimeout(hookEventsDisplayComponent, 200)
    }
  }

  setTimeout(hookEventsDisplayComponent, 1000)

  // ===== NOVEL APPROACH: DOM OBSERVATION =====
  // Watch the EventsDisplay element for new messages appearing in the UI
  // This works regardless of code-level interception success
  let domObserverActive = false
  let donationsFromDOM = 0

  function setupDOMObserver() {
    const eventsDisplay = document.querySelector('events-display')

    if (!eventsDisplay) {
      // Retry until element exists
      setTimeout(setupDOMObserver, 200)
      return
    }

    if (domObserverActive) return // Already set up

    log('[HAMMER] 🎯 Setting up DOM observer for EventsDisplay')
    addDiagnosticEvent('DOM_OBSERVER', { status: 'starting' })

    const domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!node.textContent) continue

          const text = node.textContent.trim()

          // Look for donation-related messages
          if (text.includes('gold') || text.includes('troops') || text.includes('Gold') || text.includes('Troops')) {
            log('[DOM] New message detected:', text)
            addDiagnosticEvent('DOM_MESSAGE', { text })
            donationsFromDOM++

            try {
              parseDonationFromDOM(text)
            } catch (err) {
              log('[DOM] Error parsing:', err)
            }
          }
        }
      }
    })

    // Observe the EventsDisplay element for any child changes
    domObserver.observe(eventsDisplay, {
      childList: true,
      subtree: true,
      characterData: true
    })

    eventCleanup.push(() => domObserver.disconnect())
    domObserverActive = true
    log('[HAMMER] ✅ DOM observer active - watching for donation messages')
    addDiagnosticEvent('DOM_OBSERVER', { status: 'active' })
  }

  function parseDonationFromDOM(text) {
    // Try to extract donation info from the visible text
    // Common patterns:
    // "Received 1000 gold from PlayerName"
    // "Sent 500 troops to PlayerName"
    // "Received 1.5K gold from trade with PlayerName"

    let match

    // Received gold
    match = text.match(/Received\s+([\d,\.]+[KkMm]?)\s+gold\s+from\s+(?:trade\s+with\s+)?(.+?)(?:\.|$)/i)
    if (match) {
      const [_, amtStr, name] = match
      const amt = parseAbbreviatedNumber(amtStr)
      log('[DOM] ✅ Parsed RECEIVED GOLD:', { name, amt })
      recordInboundGold(name, amt)
      addDiagnosticEvent('DONATION_PARSED', { type: 'received_gold', name, amt, source: 'DOM' })
      return
    }

    // Sent gold
    match = text.match(/Sent\s+([\d,\.]+[KkMm]?)\s+gold\s+to\s+(.+?)(?:\.|$)/i)
    if (match) {
      const [_, amtStr, name] = match
      const amt = parseAbbreviatedNumber(amtStr)
      log('[DOM] ✅ Parsed SENT GOLD:', { name, amt })
      recordOutboundGold(name, amt)
      addDiagnosticEvent('DONATION_PARSED', { type: 'sent_gold', name, amt, source: 'DOM' })
      return
    }

    // Received troops
    match = text.match(/Received\s+([\d,\.]+[KkMm]?)\s+troops\s+from\s+(.+?)(?:\.|$)/i)
    if (match) {
      const [_, amtStr, name] = match
      const amt = parseAbbreviatedNumber(amtStr)
      log('[DOM] ✅ Parsed RECEIVED TROOPS:', { name, amt })
      recordInboundTroops(name, amt)
      addDiagnosticEvent('DONATION_PARSED', { type: 'received_troops', name, amt, source: 'DOM' })
      return
    }

    // Sent troops
    match = text.match(/Sent\s+([\d,\.]+[KkMm]?)\s+troops\s+to\s+(.+?)(?:\.|$)/i)
    if (match) {
      const [_, amtStr, name] = match
      const amt = parseAbbreviatedNumber(amtStr)
      log('[DOM] ✅ Parsed SENT TROOPS:', { name, amt })
      recordOutboundTroops(name, amt)
      addDiagnosticEvent('DONATION_PARSED', { type: 'sent_troops', name, amt, source: 'DOM' })
      return
    }

    log('[DOM] No match for:', text)
  }

  // Helper functions to record donations
  function recordInboundGold(playerName, amount) {
    const key = `gold-${playerName}`
    S.inbound.set(key, (S.inbound.get(key) || 0) + amount)
    S.feedIn.push({
      type: 'gold',
      from: playerName,
      amt: amount,
      ts: Date.now()
    })
    if (S.feedIn.length > 100) S.feedIn.shift()
    donationsTracked++
  }

  function recordOutboundGold(playerName, amount) {
    const key = `gold-${playerName}`
    S.outbound.set(key, (S.outbound.get(key) || 0) + amount)
    S.feedOut.push({
      type: 'gold',
      to: playerName,
      amt: amount,
      ts: Date.now()
    })
    if (S.feedOut.length > 100) S.feedOut.shift()
    donationsTracked++
  }

  function recordInboundTroops(playerName, amount) {
    const key = `troops-${playerName}`
    S.inbound.set(key, (S.inbound.get(key) || 0) + amount)
    S.feedIn.push({
      type: 'troops',
      from: playerName,
      amt: amount,
      ts: Date.now()
    })
    if (S.feedIn.length > 100) S.feedIn.shift()
    donationsTracked++
  }

  function recordOutboundTroops(playerName, amount) {
    const key = `troops-${playerName}`
    S.outbound.set(key, (S.outbound.get(key) || 0) + amount)
    S.feedOut.push({
      type: 'troops',
      to: playerName,
      amt: amount,
      ts: Date.now()
    })
    if (S.feedOut.length > 100) S.feedOut.shift()
    donationsTracked++
  }

  // Start the DOM observer
  setTimeout(setupDOMObserver, 1000)

  // ===== CANVAS INTERCEPTION =====
  try {
    const proto = CanvasRenderingContext2D.prototype
    origSetTransform = proto.setTransform
    proto.setTransform = function(a, b, c, d, e, f) {
      try {
        const canvas = this.canvas
        if (canvas?.width && canvas.height) {
          targetCanvas = canvas
          currentTransform = { a: num(a) || 1, d: num(d) || 1, e: num(e) || 0, f: num(f) || 0 }
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

      const mouseWorldX = Math.floor((lastMouseClient.x - currentTransform.e) / ((screenCanvasWidth / worldTilesWidth) * currentTransform.a))
      const mouseWorldY = Math.floor((lastMouseClient.y - currentTransform.f) / ((screenCanvasHeight / worldTilesHeight) * currentTransform.d))
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

  // Discover the actual minified event classes used by the game
  function discoverDonationEventClasses() {
    if (!eventBus || !eventBus.listeners) {
      log('[EVENT-DISCOVERY] ❌ EventBus or listeners not available')
      return false
    }

    log('[EVENT-DISCOVERY] 🔍 Examining EventBus listeners...')

    // Hard-code known working classes (discovered through testing)
    for (const [eventClass, handlers] of eventBus.listeners.entries()) {
      if (eventClass.name === 'Rp') {
        donateGoldEventClass = eventClass
        log('[EVENT-DISCOVERY] ✅ Using known gold donation class: Rp')
      }
      if (eventClass.name === 'Op') {
        donateTroopsEventClass = eventClass
        log('[EVENT-DISCOVERY] ✅ Using known troops donation class: Op')
      }
      if (donateGoldEventClass && donateTroopsEventClass) break
    }

    const eventClasses = []
    for (const [eventClass, handlers] of eventBus.listeners.entries()) {
      eventClasses.push({
        name: eventClass.name,
        class: eventClass,
        handlerCount: handlers.length
      })
    }

    log('[EVENT-DISCOVERY] Found', eventClasses.length, 'event classes:',
      eventClasses.map(e => `${e.name}(${e.handlerCount})`).join(', '))

    // Try to identify troops donation event by creating test instances
    // and checking if they have recipient/troops properties
    for (const {name, class: EventClass} of eventClasses) {
      try {
        // Try to create an instance with typical donation parameters
        const testEvent = new EventClass()

        // Check if this event has properties that look like donations
        const hasRecipient = 'recipient' in testEvent
        const hasTroops = 'troops' in testEvent

        if (hasRecipient && hasTroops && !donateTroopsEventClass) {
          log('[EVENT-DISCOVERY] 🎯 Found troops donation event class:', name)
          donateTroopsEventClass = EventClass
        }

        if (donateGoldEventClass && donateTroopsEventClass) {
          log('[EVENT-DISCOVERY] ✅ Both donation event classes discovered!')
          return true
        }
      } catch (err) {
        // Some classes might not have default constructors, that's OK
      }
    }

    if (donateGoldEventClass && !donateTroopsEventClass) {
      log('[EVENT-DISCOVERY] ⚠️ Gold class found (Rp), but troops class not auto-discovered')
      log('[EVENT-DISCOVERY] Try testing similar classes: Op, Bp, Dp, Ep, Lp, Mp, Pp, etc.')
      return false
    }

    log('[EVENT-DISCOVERY] ⚠️ Could not auto-discover event classes')
    return false
  }

  // ===== AUTO-DONATE TROOPS FUNCTIONS =====
  function asSendTroops(targetId, amount) {
    log('[AUTO-SEND] asSendTroops called:', { targetId, amount })

    // Try EventBus approach first (preferred - doesn't need clientID)
    if (eventBus) {
      log('[AUTO-SEND] Using EventBus approach')

      // Discover event classes if not already done
      if (!donateTroopsEventClass && !donateGoldEventClass) {
        discoverDonationEventClasses()
      }

      // Get actual PlayerView instance (not plain object)
      const playerView = getPlayerView(targetId)
      if (!playerView) {
        log('[AUTO-SEND] ❌ PlayerView not found for ID:', targetId)
        return false
      }

      try {
        let event
        if (donateTroopsEventClass) {
          // Use the actual minified event class from the game
          log('[AUTO-SEND] Using discovered event class:', donateTroopsEventClass.name)
          event = new donateTroopsEventClass(playerView, amount == null ? null : num(amount))
        } else {
          // Fallback to custom class (probably won't work but try anyway)
          log('[AUTO-SEND] ⚠️ Using fallback custom event class')
          event = new SendDonateTroopsIntentEvent(playerView, amount == null ? null : num(amount))
        }

        log('[AUTO-SEND] Emitting troops donation event:', {
          eventClass: event.constructor.name,
          recipientName: playerView.name ? playerView.name() : 'unknown',
          recipientId: targetId,
          troops: amount
        })
        eventBus.emit(event)
        log('[AUTO-SEND] ✅ EventBus emit successful')
        return true
      } catch (err) {
        log('[AUTO-SEND] ❌ EventBus emit failed:', err)
        log('[AUTO-SEND] Falling back to WebSocket approach')
      }
    }

    // Fallback: Direct WebSocket approach (only if EventBus failed)
    log('[AUTO-SEND] ⚠️ EventBus not available, using WebSocket fallback')

    // Verify clientID for WebSocket approach
    const cidCheck = verifyClientID()
    if (!cidCheck.match && cidCheck.hammerClientID) {
      log('[AUTO-SEND] ⚠️ Warning: clientID mismatch detected')
      log('[AUTO-SEND] Hammer clientID:', cidCheck.hammerClientID)
      log('[AUTO-SEND] Game clientID:', cidCheck.gameViewClientID || cidCheck.transportClientID)
    }

    if (!gameSocket) {
      log('[AUTO-SEND] ❌ gameSocket is null')
      return false
    }
    if (gameSocket.readyState !== 1) {
      log('[AUTO-SEND] ❌ gameSocket not OPEN, state:', gameSocket.readyState)
      return false
    }
    if (!currentClientID) {
      log('[AUTO-SEND] ❌ currentClientID not set')
      return false
    }

    const intent = { type: 'donate_troops', clientID: currentClientID, recipient: targetId, troops: amount == null ? null : num(amount) }

    log('[AUTO-SEND] Sending troops intent:', intent)

    try {
      const message = JSON.stringify({ type: 'intent', intent })
      log('[AUTO-SEND] WebSocket.send():', message)
      gameSocket.send(message)
      log('[AUTO-SEND] ✅ Troops send successful')
      return true
    } catch (err) {
      log('[AUTO-SEND] ❌ Exception:', err)
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
      const p = playersByName.get(lower)
      if (p) resolved.push({ id: p.id, name: p.displayName || p.name })
    }
    return resolved
  }

  function asTroopsTick() {
    log('[AUTO-SEND] asTroopsTick started, running:', S.asTroopsRunning)

    if (!S.asTroopsRunning) {
      log('[AUTO-SEND] Not running, exiting')
      return
    }

    const now = Date.now()
    const targets = asResolveTargets()

    log('[AUTO-SEND] Resolved troop targets:', targets.length, targets.map(t => t.name))

    if (!targets.length) {
      log('[AUTO-SEND] No targets, exiting')
      return
    }

    const me = readMyPlayer()
    if (!me) {
      log('[AUTO-SEND] Player data not available')
      return
    }

    const troops = me.troops || 0
    const maxT = estimateMaxTroops(me.tilesOwned, me.smallID)
    const troopPct = maxT > 0 ? (troops / maxT) * 100 : 0

    log('[AUTO-SEND] My troops:', troops, 'Max:', maxT, 'Percent:', troopPct.toFixed(1) + '%')

    if (!maxT || troopPct < S.asTroopsThreshold) {
      log(`[AUTO-SEND] Below threshold (${troopPct.toFixed(1)}% < ${S.asTroopsThreshold}%)`)
      return
    }

    const toSend = Math.max(1, Math.floor(troops * (S.asTroopsRatio / 100)))
    log('[AUTO-SEND] Amount to send:', toSend, `(${S.asTroopsRatio}% of ${troops})`)

    for (const target of targets) {
      log('[AUTO-SEND] Checking target:', target.name, target.id)

      const isAlly = asIsAlly(target.id)
      log('[AUTO-SEND] asIsAlly(', target.id, '):', isAlly)

      if (!isAlly) {
        log('[AUTO-SEND] Not an ally, skipping')
        continue
      }

      const last = S.asTroopsLastSend[target.id] || 0
      const cooldownMs = S.asTroopsCooldownSec * 1000
      const nextSend = last + cooldownMs
      const remaining = Math.max(0, nextSend - now)

      log('[AUTO-SEND] Cooldown check:', {
        last,
        cooldownMs,
        nextSend,
        remaining,
        ready: now >= nextSend
      })

      // Track next send time for countdown display
      S.asTroopsNextSend[target.id] = nextSend

      if (now >= nextSend) {
        log('[AUTO-SEND] ✅ Ready to send! Calling asSendTroops...')
        if (asSendTroops(target.id, toSend)) {
          S.asTroopsLastSend[target.id] = now
          S.asTroopsNextSend[target.id] = now + cooldownMs
          S.asTroopsLog.push(`[${fmtTime(nowDate())}] Sent ${short(toSend)} troops to ${target.name}`)
          if (S.asTroopsLog.length > 100) S.asTroopsLog.shift()
          log(`[SUCCESS] Auto-troops: Sent ${toSend} troops to ${target.name}`)
        } else {
          log(`[ERROR] Auto-troops: Send failed to ${target.name}`)
        }
      } else {
        log('[AUTO-SEND] On cooldown, waiting', Math.ceil(remaining / 1000), 'seconds')
      }
    }

    log('[AUTO-SEND] asTroopsTick finished')
  }

  let asTroopsTimer = null
  function asTroopsStart() {
    S.asTroopsRunning = true
    log('[AUTO-SEND] asTroopsStart called, setting up interval')
    if (asTroopsTimer) clearInterval(asTroopsTimer)
    asTroopsTimer = setInterval(() => {
      log('[AUTO-SEND] ⏱️ Troops tick heartbeat - asTroopsTick about to run')
      asTroopsTick()
    }, 800)
    log('[AUTO-SEND] ✅ Troops interval set, ID:', asTroopsTimer)
  }
  function asTroopsStop() {
    S.asTroopsRunning = false
    log('[AUTO-SEND] asTroopsStop called')
    if (asTroopsTimer) { clearInterval(asTroopsTimer); asTroopsTimer = null }
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
      // Try to get clientID from game-view element
      const gameView = document.querySelector('game-view')
      if (gameView?.clientGameRunner?.lobbyConfig?.clientID) {
        results.gameViewClientID = gameView.clientGameRunner.lobbyConfig.clientID
      }

      // Try to get clientID from Transport
      if (gameView?.clientGameRunner?.transport?.lobbyConfig?.clientID) {
        results.transportClientID = gameView.clientGameRunner.transport.lobbyConfig.clientID
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
    log('[AUTO-SEND] asSendGold called:', { targetId, amount })

    // Try EventBus approach first (preferred - doesn't need clientID)
    if (eventBus) {
      log('[AUTO-SEND] Using EventBus approach')

      // Discover event classes if not already done
      if (!donateTroopsEventClass && !donateGoldEventClass) {
        discoverDonationEventClasses()
      }

      // Get actual PlayerView instance (not plain object)
      const playerView = getPlayerView(targetId)
      if (!playerView) {
        log('[AUTO-SEND] ❌ PlayerView not found for ID:', targetId)
        return false
      }

      try {
        // Game expects BigInt for gold amounts
        const goldAmount = BigInt(num(amount))

        let event
        if (donateGoldEventClass) {
          // Use the actual minified event class from the game
          log('[AUTO-SEND] Using discovered event class:', donateGoldEventClass.name)
          event = new donateGoldEventClass(playerView, goldAmount)
        } else {
          // Fallback to custom class (probably won't work but try anyway)
          log('[AUTO-SEND] ⚠️ Using fallback custom event class')
          event = new SendDonateGoldIntentEvent(playerView, goldAmount)
        }

        log('[AUTO-SEND] Emitting gold donation event:', {
          eventClass: event.constructor.name,
          recipientName: playerView.name ? playerView.name() : 'unknown',
          recipientId: targetId,
          gold: amount
        })
        eventBus.emit(event)
        log('[AUTO-SEND] ✅ EventBus emit successful')
        return true
      } catch (err) {
        log('[AUTO-SEND] ❌ EventBus emit failed:', err)
        log('[AUTO-SEND] Falling back to WebSocket approach')
      }
    }

    // Fallback: Direct WebSocket approach (only if EventBus failed)
    log('[AUTO-SEND] ⚠️ EventBus not available, using WebSocket fallback')

    // Verify clientID for WebSocket approach
    const cidCheck = verifyClientID()
    if (!cidCheck.match && cidCheck.hammerClientID) {
      log('[AUTO-SEND] ⚠️ Warning: clientID mismatch detected')
      log('[AUTO-SEND] Hammer clientID:', cidCheck.hammerClientID)
      log('[AUTO-SEND] Game clientID:', cidCheck.gameViewClientID || cidCheck.transportClientID)
    }

    if (!gameSocket) {
      log('[AUTO-SEND] ❌ gameSocket is null')
      return false
    }
    if (gameSocket.readyState !== 1) {
      log('[AUTO-SEND] ❌ gameSocket not OPEN, state:', gameSocket.readyState)
      return false
    }
    if (!currentClientID) {
      log('[AUTO-SEND] ❌ currentClientID not set')
      return false
    }

    const intent = { type: 'donate_gold', clientID: currentClientID, recipient: targetId, gold: num(amount) }

    log('[AUTO-SEND] Sending gold intent:', intent)

    try {
      const message = JSON.stringify({ type: 'intent', intent })
      log('[AUTO-SEND] WebSocket.send():', message)
      gameSocket.send(message)
      log('[AUTO-SEND] ✅ Gold send successful')
      return true
    } catch (err) {
      log('[AUTO-SEND] ❌ Exception:', err)
      return false
    }
  }

  function asResolveGoldTargets() {
    if (S.asGoldAllTeamMode) {
      return getTeammates().map(p => ({ id: p.id, name: p.displayName || p.name }))
    }

    const resolved = []
    for (const tgt of S.asGoldTargets) {
      const lower = String(tgt).toLowerCase()
      const p = playersByName.get(lower)
      if (p) resolved.push({ id: p.id, name: p.displayName || p.name })
    }
    return resolved
  }

  function asGoldTick() {
    log('[AUTO-SEND] asGoldTick started, running:', S.asGoldRunning)

    if (!S.asGoldRunning) {
      log('[AUTO-SEND] Not running, exiting')
      return
    }

    const now = Date.now()
    const targets = asResolveGoldTargets()

    log('[AUTO-SEND] Resolved gold targets:', targets.length, targets.map(t => t.name))

    if (!targets.length) {
      log('[AUTO-SEND] No targets, exiting')
      return
    }

    const me = readMyPlayer()
    if (!me) {
      log('[AUTO-SEND] Player data not available')
      return
    }

    // Convert BigInt gold to number for calculations
    const gold = Number(me.gold || 0n)

    log('[AUTO-SEND] My gold:', gold)

    // Calculate percentage-based send amount (like troops)
    const toSend = Math.max(1, Math.floor(gold * (S.asGoldRatio / 100)))
    if (toSend <= 0) return
    log('[AUTO-SEND] Amount to send:', toSend, `(${S.asGoldRatio}% of ${gold})`)

    for (const target of targets) {
      log('[AUTO-SEND] Checking target:', target.name, target.id)

      const isAlly = asIsAlly(target.id)
      log('[AUTO-SEND] asIsAlly(', target.id, '):', isAlly)

      if (!isAlly) {
        log('[AUTO-SEND] Not an ally, skipping')
        continue
      }

      const last = S.asGoldLastSend[target.id] || 0
      const cooldownMs = S.asGoldCooldownSec * 1000
      const nextSend = last + cooldownMs
      const remaining = Math.max(0, nextSend - now)

      log('[AUTO-SEND] Cooldown check:', {
        last,
        cooldownMs,
        nextSend,
        remaining,
        ready: now >= nextSend
      })

      // Track next send time for countdown display
      S.asGoldNextSend[target.id] = nextSend

      if (now >= nextSend) {
        log('[AUTO-SEND] ✅ Ready to send! Calling asSendGold...')
        if (asSendGold(target.id, toSend)) {
          S.asGoldLastSend[target.id] = now
          S.asGoldNextSend[target.id] = now + cooldownMs
          S.asGoldLog.push(`[${fmtTime(nowDate())}] Sent ${short(toSend)} gold to ${target.name}`)
          if (S.asGoldLog.length > 100) S.asGoldLog.shift()
          log(`[SUCCESS] Auto-gold: Sent ${short(toSend)} gold to ${target.name}`)
        } else {
          log(`[ERROR] Auto-gold: Send failed to ${target.name}`)
        }
      } else {
        log('[AUTO-SEND] On cooldown, waiting', Math.ceil(remaining / 1000), 'seconds')
      }
    }

    log('[AUTO-SEND] asGoldTick finished')
  }

  let asGoldTimer = null
  function asGoldStart() {
    S.asGoldRunning = true
    log('[AUTO-SEND] asGoldStart called, setting up interval')
    if (asGoldTimer) clearInterval(asGoldTimer)
    asGoldTimer = setInterval(() => {
      log('[AUTO-SEND] ⏱️ Gold tick heartbeat - asGoldTick about to run')
      asGoldTick()
    }, 800)
    log('[AUTO-SEND] ✅ Gold interval set, ID:', asGoldTimer)
  }
  function asGoldStop() {
    S.asGoldRunning = false
    log('[AUTO-SEND] asGoldStop called')
    if (asGoldTimer) { clearInterval(asGoldTimer); asGoldTimer = null }
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

  const tabs = ['summary', 'stats', 'aiinsights', 'ports', 'feed', 'goldrate', 'alliances', 'autotroops', 'autogold', 'diag', 'hotkeys']
  ui.innerHTML = `
    <div id="hm-head" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#151f33;border-bottom:1px solid #86531f;cursor:move;flex-shrink:0">
      <div><b>HAMMER v8.10</b> <span style="opacity:.85">SMOOTH</span></div>
      <div class="btns" style="display:flex;gap:6px;flex-wrap:wrap">
        <div id="hm-tabs" style="display:flex;gap:4px;flex-wrap:wrap">
          ${tabs.map(v => `<button class="tab" data-v="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
        </div>
        <button id="hm-size">${SIZES[S.sizeIdx].label}</button>
        <button id="hm-mini">▽</button>
        <button id="hm-pause">Pause</button>
        <button id="hm-tag">Tag</button>
        <button id="hm-export">Export</button>
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
  ui.querySelector('#hm-size').onclick = () => applySize(S.sizeIdx + 1)
  ui.querySelector('#hm-mini').onclick = () => setMin(!S.minimized)
  ui.querySelector('#hm-pause').onclick = () => {
    S.paused = !S.paused
    ui.querySelector('#hm-pause').textContent = S.paused ? 'Resume' : 'Pause'
  }
  ui.querySelector('#hm-tag').onclick = () => {
    if (!S.filterTagMates && !S.myTag) {
      const t = prompt('Enter your clan tag (without brackets)\nExample: If your name is [ABC]PlayerName, enter: ABC')
      if (t?.trim()) S.myTag = t.trim()
    }
    S.filterTagMates = !S.filterTagMates
    ui.querySelector('#hm-tag').textContent = S.filterTagMates ? `Tag[${S.myTag}]` : 'Tag'
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
      }
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }))
    a.download = `hammer_v8.8_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 800)
  }
  ui.querySelector('#hm-tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab')
    if (!b) return
    S.view = b.getAttribute('data-v')
  })

  const isTagMate = id => {
    if (!S.filterTagMates || !S.myTag) return true
    const p = playersById.get(id)
    if (!p) return false
    return hasTag(p, S.myTag)
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

    html += '<div class="stat-grid">'
    html += `<div class="stat-card"><div class="stat-label">Received</div><div class="stat-value">${short(totalInGold)} 💰 | ${short(totalInTroops)} 🪖</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Sent</div><div class="stat-value">${short(totalOutGold)} 💰 | ${short(totalOutTroops)} 🪖</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Port Trades</div><div class="stat-value">${short(totalInPort)} 💰</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Net Balance</div><div class="stat-value">${short(totalInGold - totalOutGold)} 💰</div></div>`
    html += '</div>'

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">'

    html += '<div><div class="title">⬅️ Inbound</div>'
    if (!inKeys.length) {
      html += '<div class="muted">No donations received yet</div>'
    } else {
      const rows = inKeys.map(k => {
        const p = playersById.get(k)
        const n = p ? (p.displayName || p.name || k) : k
        const r = S.inbound.get(k)
        const hasPort = S.feedIn.some(f => f.name === n && f.isPort)
        const portIcon = hasPort ? ' 🏪' : ''
        return { name: n, gold: r.gold, troops: r.troops, portIcon }
      }).sort((a, b) => (b.gold + b.troops) - (a.gold + a.troops))

      html += '<div style="font-size:11px">'
      for (const row of rows) {
        html += `<div class="row" style="margin:4px 0;padding:6px;background:#0d1520;border-radius:4px">`
        html += `<div style="flex:1;overflow:hidden;text-overflow:ellipsis">${esc(row.name)}${row.portIcon}</div>`
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

    return html
  }

  function aiInsightsView() {
    const me = readMyPlayer()
    const duration = Date.now() - sessionStartTime

    let html = '<div class="title">⚔️ Battle Insights</div>'
    html += '<div class="help">Strategic analysis and fun metrics</div>'

    const inKeys = [...S.inbound.keys()]
    const outKeys = [...S.outbound.keys()]
    const allKeys = new Set([...inKeys, ...outKeys])

    let totalVolume = 0
    for (const k of allKeys) {
      const inR = S.inbound.get(k)
      const outR = S.outbound.get(k)
      totalVolume += (inR?.gold || 0) + (inR?.troops || 0) + (outR?.gold || 0) + (outR?.troops || 0)
    }

    const networkType = inKeys.length > outKeys.length * 2 ? 'Receiver Hub' :
                        outKeys.length > inKeys.length * 2 ? 'Feeder Hub' : 'Balanced Node'

    html += '<div class="box"><div class="title" style="margin-top:0">🕸️ Network Analysis</div>'
    html += `<div class="row"><div>Network Size</div><div class="mono">${allKeys.size} players</div></div>`
    html += `<div class="row"><div>Total Volume</div><div class="mono">${short(totalVolume)}</div></div>`
    html += `<div class="row"><div>Network Role</div><div class="mono" style="color:#7ff2a3">${networkType}</div></div>`
    html += '</div>'

    if (me) {
      const maxT = estimateMaxTroops(me.tilesOwned, me.smallID)
      const troopPct = maxT > 0 ? (me.troops / maxT) * 100 : 0

      html += '<div class="box"><div class="title" style="margin-top:0">💡 Strategic Insights</div>'
      if (troopPct > 80) html += '<div class="recommendation">⚠️ High troop capacity - Consider sending troops to allies</div>'
      if (me.gold > 500000) html += '<div class="recommendation">💰 High gold reserves - Good for cities or infrastructure</div>'
      if (troopPct < 30) html += '<div class="recommendation">🪖 Low troops - Focus on rebuilding</div>'
      if (networkType === 'Receiver Hub') html += '<div class="recommendation">🎯 You are a key receiver - Allies investing in you</div>'
      if (networkType === 'Feeder Hub') html += '<div class="recommendation">🤝 You are a key supporter - Fueling your alliance</div>'
      html += '</div>'
    }

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

    html += '<div style="font-size:11px">'
    for (const item of all) {
      const arrow = item.dir === 'in' ? '⬅️' : '➡️'
      const color = item.dir === 'in' ? '#7ff2a3' : '#ffcf5d'
      const typeIcon = item.type === 'troops' ? '🪖' : '💰'
      const portIcon = item.isPort ? ' 🏪' : ''
      html += `<div class="row" style="margin:2px 0;padding:4px;background:#0d1520;border-radius:4px">`
      html += `<div class="mono muted" style="font-size:10px">${fmtTime(item.ts)}</div>`
      html += `<div>${arrow}</div>`
      html += `<div style="flex:1;overflow:hidden;text-overflow:ellipsis">${esc(item.name)}${portIcon}</div>`
      html += `<div class="mono" style="color:${color}">${short(item.amount)} ${typeIcon}</div>`
      html += '</div>'
    }
    html += '</div>'

    return html
  }

  function goldRateView() {
    const me = readMyPlayer()

    let html = '<div class="title">💰 Gold Rate Monitor</div>'
    html += '<div class="help">Track gold generation over time</div>'

    if (!me) {
      return html + '<div class="muted">Player data not available</div>'
    }

    html += '<div class="box">'
    html += `<div class="row"><div>Current Gold</div><div class="mono" style="color:#ffcf5d">${short(me.gold)}</div></div>`
    html += `<div class="row"><div>Gold/Sec (30s)</div><div class="mono" style="color:#7ff2a3">${(S.gps30 || 0).toFixed(2)}</div></div>`
    html += `<div class="row"><div>Gold/Min (60s)</div><div class="mono" style="color:#7ff2a3">${short(S.gpm60 || 0)}</div></div>`
    html += `<div class="row"><div>Gold/Min (120s)</div><div class="mono" style="color:#7ff2a3">${short(S.gpm120 || 0)}</div></div>`
    html += '</div>'

    html += '<div class="help" style="margin-top:12px">💡 Higher rates = more port trades or territory income</div>'

    return html
  }

  function alliancesView() {
    const me = readMyPlayer()

    let html = '<div class="title">🤝 Alliances & Teams</div>'
    html += '<div class="help">View teammates, allies, and tag mates</div>'

    if (!me) {
      return html + '<div class="muted">Player data not available</div>'
    }

    const teammates = getTeammates()
    html += '<div class="box"><div class="title" style="margin-top:0">👥 Teammates</div>'
    if (!teammates.length) {
      html += '<div class="muted">No teammates (solo or FFA mode)</div>'
    } else {
      for (const p of teammates.slice(0, 20)) {
        const maxT = estimateMaxTroops(p.tilesOwned, p.smallID)
        const troopPct = maxT > 0 ? Math.round((p.troops / maxT) * 100) : 0
        html += `<div class="box" style="margin:4px 0">`
        html += `<div class="row"><div style="font-weight:700">${esc(p.displayName || p.name || 'Unknown')}</div><div class="mono">${troopPct}%</div></div>`
        html += `<div class="row muted" style="font-size:10px"><div>Troops</div><div class="mono">${short(p.troops)} / ${short(maxT)}</div></div>`
        html += '</div>'
      }
    }
    html += '</div>'

    const allies = getAllies()
    html += '<div class="box"><div class="title" style="margin-top:0">🤝 Allies</div>'
    if (!allies.length) {
      html += '<div class="muted">No active alliances</div>'
    } else {
      for (const p of allies.slice(0, 20)) {
        const maxT = estimateMaxTroops(p.tilesOwned, p.smallID)
        const troopPct = maxT > 0 ? Math.round((p.troops / maxT) * 100) : 0
        html += `<div class="box" style="margin:4px 0">`
        html += `<div class="row"><div style="font-weight:700">${esc(p.displayName || p.name || 'Unknown')}</div><div class="mono">${troopPct}%</div></div>`
        html += `<div class="row muted" style="font-size:10px"><div>Troops</div><div class="mono">${short(p.troops)} / ${short(maxT)}</div></div>`
        html += '</div>'
      }
    }
    html += '</div>'

    if (S.myTag) {
      const tagmates = getTagMates()
      html += '<div class="box"><div class="title" style="margin-top:0">🏷️ Tag Mates [' + esc(S.myTag) + ']</div>'
      if (!tagmates.length) {
        html += '<div class="muted">No other players with your tag found</div>'
      } else {
        for (const p of tagmates.slice(0, 20)) {
          const maxT = estimateMaxTroops(p.tilesOwned, p.smallID)
          const troopPct = maxT > 0 ? Math.round((p.troops / maxT) * 100) : 0
          html += `<div class="box" style="margin:4px 0">`
          html += `<div class="row"><div style="font-weight:700">${esc(p.displayName || p.name || 'Unknown')}</div><div class="mono">${troopPct}%</div></div>`
          html += `<div class="row muted" style="font-size:10px"><div>Troops</div><div class="mono">${short(p.troops)} / ${short(maxT)}</div></div>`
          html += '</div>'
        }
      }
      html += '</div>'
    }

    return html
  }

  function calculateOptimalTroopSend(me, targetCount) {
    if (!me) return null

    const maxT = estimateMaxTroops(me.tilesOwned, me.smallID)
    const currentTroops = me.troops || 0
    const troopPct = maxT > 0 ? (currentTroops / maxT) * 100 : 0

    // Game mechanics:
    // - You regenerate troops based on tiles owned
    // - Sending troops reduces your defense capability
    // - Optimal is to stay above 40% capacity for defense

    const recommendations = []

    if (troopPct < 30) {
      recommendations.push({
        ratio: 0,
        threshold: 50,
        reason: "🛡️ DEFENSE MODE - You're low on troops. Don't send until 50%+",
        color: "#ff8b94"
      })
    } else if (troopPct < 50) {
      recommendations.push({
        ratio: 10,
        threshold: 50,
        reason: "⚠️ CAUTIOUS - Send small amounts (10%) to maintain defense",
        color: "#ffcf5d"
      })
    } else if (targetCount === 1) {
      // Single target - can be more aggressive
      recommendations.push({
        ratio: 30,
        threshold: 60,
        reason: "🎯 FOCUSED FEED - Single ally, moderate send rate",
        color: "#7ff2a3"
      })
      recommendations.push({
        ratio: 50,
        threshold: 70,
        reason: "💪 POWER FEED - Single ally, aggressive boost",
        color: "#7bb8ff"
      })
    } else {
      // Multiple targets - be conservative
      const perTarget = Math.floor(20 / targetCount)
      recommendations.push({
        ratio: Math.max(5, perTarget),
        threshold: 60,
        reason: `🔀 MULTI-FEED - Split ${Math.max(5, perTarget)}% among ${targetCount} allies`,
        color: "#7ff2a3"
      })
    }

    return {
      currentPct: troopPct,
      maxTroops: maxT,
      currentTroops,
      recommendations
    }
  }

  function autoDonateTroopsView() {
    const me = readMyPlayer()
    const statusDot = `<span class="status-dot ${S.asTroopsRunning ? 'running' : 'stopped'}"></span>`

    let html = '<div class="title">🪖 Auto-Donate Troops</div>'
    html += `<div class="help">${statusDot}Status: <b>${S.asTroopsRunning ? 'RUNNING' : 'STOPPED'}</b></div>`

    if (me) {
      const maxT = estimateMaxTroops(me.tilesOwned, me.smallID)
      const troopPct = maxT > 0 ? Math.round((me.troops / maxT) * 100) : 0
      const willSend = troopPct >= S.asTroopsThreshold
      const sendAmount = willSend ? Math.floor(me.troops * (S.asTroopsRatio / 100)) : 0

      html += '<div class="preview-calc">'
      html += `<div style="font-size:16px;margin-bottom:8px"><b>LIVE PREVIEW</b></div>`
      html += `<div>You have: <b>${short(me.troops)}</b> / <b>${short(maxT)}</b> troops (<b>${troopPct}%</b>)</div>`
      if (willSend) {
        html += `<div style="color:#7ff2a3;font-size:15px;margin-top:8px">✅ Will send: <b>${short(sendAmount)}</b> troops (${S.asTroopsRatio}% of ${short(me.troops)})</div>`
        html += `<div>You keep: <b>${short(me.troops - sendAmount)}</b> troops</div>`
      } else {
        html += `<div style="color:#ff8b94;margin-top:8px">❌ Below threshold (need ${S.asTroopsThreshold}%, have ${troopPct}%)</div>`
      }
      html += '</div>'
    }

    // Add intelligent calculator
    const targetCount = S.asTroopsAllTeamMode ? getTeammates().length : S.asTroopsTargets.length
    const calc = calculateOptimalTroopSend(me, targetCount)
    if (calc && calc.recommendations.length > 0) {
      html += '<div class="box">'
      html += '<div class="title" style="margin-top:0">🧠 Intelligent Recommendations</div>'
      html += '<div class="help">Based on your current situation:</div>'
      for (const rec of calc.recommendations) {
        html += `<div style="background:#0d1520;border-left:3px solid ${rec.color};padding:8px;margin:6px 0;cursor:pointer" data-apply-ratio="${rec.ratio}" data-apply-threshold="${rec.threshold}">`
        html += `<div style="font-weight:700;color:${rec.color}">${rec.reason}</div>`
        html += `<div style="margin-top:4px">Ratio: <b>${rec.ratio}%</b> | Threshold: <b>${rec.threshold}%</b></div>`
        html += `<div class="help" style="margin-top:4px">Click to apply these settings</div>`
        html += '</div>'
      }
      html += '</div>'
    }

    html += '<div class="box">'
    html += '<div class="title" style="margin-top:0">⚙️ Settings</div>'
    html += `<div class="row"><div>Ratio: <b>${S.asTroopsRatio}%</b></div>`
    html += '<div style="display:flex;gap:4px">'
    html += '<button id="at-ratio-minus">−</button>'
    html += `<input id="at-ratio-input" type="number" value="${S.asTroopsRatio}" min="1" max="100" step="1" style="width:60px;text-align:center">`
    html += '<button id="at-ratio-plus">+</button>'
    html += '</div></div>'
    html += `<div class="row"><div>Threshold: <b>${S.asTroopsThreshold}%</b></div>`
    html += '<div style="display:flex;gap:4px">'
    html += '<button id="at-threshold-minus">−</button>'
    html += `<input id="at-threshold-input" type="number" value="${S.asTroopsThreshold}" min="0" max="100" step="1" style="width:60px;text-align:center">`
    html += '<button id="at-threshold-plus">+</button>'
    html += '</div></div>'
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
      const tagmates = getTagMates()
      const allTargets = [...teammates, ...allies, ...tagmates].filter((p, i, arr) =>
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
    html += `<div class="help">${statusDot}Status: <b>${S.asGoldRunning ? 'RUNNING' : 'STOPPED'}</b></div>`

    if (me) {
      // Convert BigInt gold to number for calculations and display
      const myGold = Number(me.gold || 0n)
      const willSend = myGold >= S.asGoldThreshold
      const sendAmount = willSend ? Math.floor(myGold * (S.asGoldRatio / 100)) : 0

      html += '<div class="preview-calc">'
      html += `<div style="font-size:16px;margin-bottom:8px"><b>LIVE PREVIEW</b></div>`
      html += `<div>You have: <b>${short(myGold)}</b> gold</div>`
      if (willSend) {
        html += `<div style="color:#7ff2a3;font-size:15px;margin-top:8px">✅ Will send: <b>${short(sendAmount)}</b> gold (${S.asGoldRatio}% of ${short(myGold)})</div>`
        html += `<div>You keep: <b>${short(myGold - sendAmount)}</b> gold</div>`
      } else {
        html += `<div style="color:#ff8b94;margin-top:8px">❌ Below threshold (need ${short(S.asGoldThreshold)}, have ${short(myGold)})</div>`
      }
      html += '</div>'
    }

    html += '<div class="box">'
    html += '<div class="title" style="margin-top:0">⚙️ Settings</div>'
    html += `<div class="row"><div>Ratio: <b>${S.asGoldRatio}%</b></div>`
    html += '<div style="display:flex;gap:4px">'
    html += '<button id="ag-ratio-minus">−</button>'
    html += `<input id="ag-ratio-input" type="number" value="${S.asGoldRatio}" min="1" max="100" step="1" style="width:60px;text-align:center">`
    html += '<button id="ag-ratio-plus">+</button>'
    html += '</div></div>'
    html += `<div class="row"><div>Min Gold Threshold</div><input id="ag-threshold" type="number" value="${S.asGoldThreshold}" min="0" step="10000" style="width:120px"></div>`
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
      const tagmates = getTagMates()
      const allTargets = [...teammates, ...allies, ...tagmates].filter((p, i, arr) =>
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


  function hotkeysView() {
    let html = '<div class="title">⌨️ Keyboard Shortcuts</div>'
    html += '<div class="help">Available keyboard shortcuts</div>'

    html += '<div class="box"><div class="title" style="margin-top:0">Auto-Troops</div>'
    html += '<div class="row"><div>Add Target</div><span class="hotkey">ALT+M</span></div>'
    html += '<div class="row"><div>Toggle Auto-Feed</div><span class="hotkey">ALT+F</span></div>'
    html += '</div>'

    return html
  }

  function diagnosticsView() {
    return `
      <div style="padding: 10px; font-size: 11px; color: #ccc;">
        <h3 style="margin: 0 0 10px 0; color: #fff;">System Status</h3>
        <div id="diag-status" style="background: #1a1a1a; padding: 8px; border-radius: 4px; margin-bottom: 10px;">
          <p style="margin: 4px 0;">
            <strong>GameView Hook:</strong>
            <span id="diag-gameview">❓ Unknown</span>
          </p>
          <p style="margin: 4px 0;">
            <strong>DisplayEvents Received:</strong>
            <span id="diag-displayevents" style="color: #f90;">0</span>
          </p>
          <p style="margin: 4px 0;">
            <strong>Player Data Ready:</strong>
            <span id="diag-playerdata">❓ Unknown</span>
          </p>
          <p style="margin: 4px 0;">
            <strong>Donations Tracked:</strong>
            <span id="diag-donations" style="color: #6cf;">0</span>
          </p>
        </div>

        <h3 style="margin: 15px 0 10px 0; color: #fff;">Auto-Send Status</h3>
        <div style="background: #1a1a1a; padding: 8px; border-radius: 4px; margin-bottom: 10px;">
          <p style="margin: 4px 0;">
            <strong>Send Method:</strong>
            <span style="color: ${eventBus ? '#6f6' : '#f90'};">
              ${eventBus ? '🟢 EventBus (Preferred)' : '🟠 WebSocket (Fallback)'}
            </span>
          </p>
          <p style="margin: 4px 0;">
            <strong>Auto-Gold:</strong>
            <span style="color: ${S.asGoldRunning ? '#6f6' : '#f66'};">
              ${S.asGoldRunning ? '🟢 RUNNING' : '🔴 STOPPED'}
            </span>
          </p>
          <p style="margin: 4px 0;">
            <strong>Auto-Troops:</strong>
            <span style="color: ${S.asTroopsRunning ? '#6f6' : '#f66'};">
              ${S.asTroopsRunning ? '🟢 RUNNING' : '🔴 STOPPED'}
            </span>
          </p>
          <p style="margin: 4px 0;">
            <strong>EventBus:</strong>
            <span style="color: ${eventBus ? '#6f6' : '#f66'};">
              ${eventBus ? '🟢 Found' : '🔴 Not Found'}
            </span>
          </p>
          <p style="margin: 4px 0;">
            <strong>gameSocket:</strong>
            <span style="color: ${gameSocket ? (gameSocket.readyState === 1 ? '#6f6' : '#f90') : '#f66'};">
              ${gameSocket ? (gameSocket.readyState === 1 ? '🟢 OPEN' : `🟠 State ${gameSocket.readyState}`) : '🔴 NULL'}
            </span>
          </p>
          <p style="margin: 4px 0;">
            <strong>currentClientID:</strong>
            <span style="color: ${currentClientID ? '#6f6' : '#f66'};">
              ${currentClientID || '🔴 NOT SET'}
            </span>
          </p>
          <p style="margin: 4px 0;">
            <strong>Gold Tick Interval:</strong>
            <span style="color: ${asGoldTimer ? '#6f6' : '#f66'};">
              ${asGoldTimer ? '🟢 Active' : '🔴 Not Running'}
            </span>
          </p>
          <p style="margin: 4px 0;">
            <strong>Troops Tick Interval:</strong>
            <span style="color: ${asTroopsTimer ? '#6f6' : '#f66'};">
              ${asTroopsTimer ? '🟢 Active' : '🔴 Not Running'}
            </span>
          </p>
        </div>

        <div style="margin-top: 10px; padding: 8px; background: #1a3a1a; border-radius: 4px; font-size: 10px;">
          <p style="margin: 0;"><strong>How it works:</strong></p>
          <p style="margin: 5px 0 0 0; color: #aaa;">
            ${eventBus
              ? '✅ Using EventBus: Emitting the same events the game UI emits. This is the most reliable method!'
              : '⚠️ Using WebSocket fallback: Sending intents directly. If this doesn\'t work, the game might need EventBus.'}
          </p>
        </div>

        <div style="margin-top: 10px; padding: 8px; background: #1a3a1a; border-radius: 4px; font-size: 10px;">
          <p style="margin: 0;"><strong>Debug Logging:</strong> Check console for [AUTO-SEND] messages</p>
          <p style="margin: 5px 0 0 0; color: #aaa;">Open Chrome DevTools (F12) and look for green [AUTO-SEND] logs to see detailed execution flow</p>
        </div>

        <h3 style="margin: 15px 0 10px 0; color: #fff;">Recent Events (Last 10)</h3>
        <div id="diag-events" style="max-height: 200px; overflow-y: auto; background: #1a1a1a; padding: 5px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 10px;">
          <div style="color: #888;">No events yet. Send a donation to see activity.</div>
        </div>

        <div style="margin-top: 15px;">
          <button onclick="window.__HAMMER__.exportDiagnostics()" style="
            background: #4a90e2;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            margin-right: 10px;
          ">
            📥 Download Diagnostic Report
          </button>

          <button onclick="window.__HAMMER__.clearDiagnostics()" style="
            background: #666;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
          ">
            🗑️ Clear Events
          </button>
        </div>

        <div style="margin-top: 15px; padding: 10px; background: #1a3a1a; border-radius: 4px; font-size: 10px;">
          <p style="margin: 0;"><strong>How to use:</strong></p>
          <ol style="margin: 5px 0 0 20px; padding: 0;">
            <li>Check that GameView Hook shows ✅ Hooked</li>
            <li>Form an alliance with another player</li>
            <li>Send gold or troops to them</li>
            <li>Watch the counters above increase</li>
            <li>If something fails, download the diagnostic report</li>
          </ol>
        </div>
      </div>
    `
  }

  function render() {
    const content = ui.querySelector('#hm-content')
    if (!content) return

    const views = {
      summary: summaryView,
      stats: statsView,
      aiinsights: aiInsightsView,
      ports: portsView,
      feed: feedView,
      goldrate: goldRateView,
      alliances: alliancesView,
      autotroops: autoDonateTroopsView,
      autogold: autoDonateGoldView,
      diag: diagnosticsView,
      hotkeys: hotkeysView
    }

    const fn = views[S.view]
    if (fn) content.innerHTML = fn()

    // Update diagnostic UI if diagnostic tab is active
    if (S.view === 'diag') {
      setTimeout(updateDiagnosticUI, 10)
    }

    ui.querySelectorAll('.tab').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-v') === S.view)
    })

    // Auto-troops handlers
    const atRatioMinus = ui.querySelector('#at-ratio-minus')
    const atRatioPlus = ui.querySelector('#at-ratio-plus')
    const atRatioInput = ui.querySelector('#at-ratio-input')
    const atThresholdMinus = ui.querySelector('#at-threshold-minus')
    const atThresholdPlus = ui.querySelector('#at-threshold-plus')
    const atThresholdInput = ui.querySelector('#at-threshold-input')
    const atCooldown = ui.querySelector('#at-cooldown')
    const atAllTeamToggle = ui.querySelector('#at-allteam-toggle')
    const atStart = ui.querySelector('#at-start')
    const atClear = ui.querySelector('#at-clear')

    if (atRatioMinus) {
      atRatioMinus.onclick = () => {
        S.asTroopsRatio = Math.max(1, S.asTroopsRatio - 5)
      }
    }
    if (atRatioPlus) {
      atRatioPlus.onclick = () => {
        S.asTroopsRatio = Math.min(100, S.asTroopsRatio + 5)
      }
    }
    if (atRatioInput) {
      atRatioInput.onchange = () => {
        S.asTroopsRatio = Math.max(1, Math.min(100, num(atRatioInput.value)))
      }
    }
    if (atThresholdMinus) {
      atThresholdMinus.onclick = () => {
        S.asTroopsThreshold = Math.max(0, S.asTroopsThreshold - 5)
      }
    }
    if (atThresholdPlus) {
      atThresholdPlus.onclick = () => {
        S.asTroopsThreshold = Math.min(100, S.asTroopsThreshold + 5)
      }
    }
    if (atThresholdInput) {
      atThresholdInput.onchange = () => {
        S.asTroopsThreshold = Math.max(0, Math.min(100, num(atThresholdInput.value)))
      }
    }
    if (atCooldown) {
      atCooldown.onchange = () => {
        S.asTroopsCooldownSec = Math.max(10, num(atCooldown.value))
      }
    }
    if (atAllTeamToggle) {
      atAllTeamToggle.onclick = () => {
        S.asTroopsAllTeamMode = !S.asTroopsAllTeamMode
      }
    }
    if (atStart) {
      atStart.onclick = () => {
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

    // Intelligent recommendation click handlers
    ui.querySelectorAll('[data-apply-ratio]').forEach(div => {
      div.onclick = () => {
        const ratio = num(div.getAttribute('data-apply-ratio'))
        const threshold = num(div.getAttribute('data-apply-threshold'))
        S.asTroopsRatio = ratio
        S.asTroopsThreshold = threshold
        showStatus(`✅ Applied: ${ratio}% ratio, ${threshold}% threshold`)
      }
    })

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
    const agRatioMinus = ui.querySelector('#ag-ratio-minus')
    const agRatioPlus = ui.querySelector('#ag-ratio-plus')
    const agRatioInput = ui.querySelector('#ag-ratio-input')
    const agThreshold = ui.querySelector('#ag-threshold')
    const agCooldown = ui.querySelector('#ag-cooldown')
    const agAllTeamToggle = ui.querySelector('#ag-allteam-toggle')
    const agStart = ui.querySelector('#ag-start')
    const agClear = ui.querySelector('#ag-clear')

    if (agRatioMinus) {
      agRatioMinus.onclick = () => {
        S.asGoldRatio = Math.max(1, S.asGoldRatio - 5)
      }
    }
    if (agRatioPlus) {
      agRatioPlus.onclick = () => {
        S.asGoldRatio = Math.min(100, S.asGoldRatio + 5)
      }
    }
    if (agRatioInput) {
      agRatioInput.onchange = () => {
        S.asGoldRatio = Math.max(1, Math.min(100, num(agRatioInput.value)))
      }
    }
    if (agThreshold) {
      agThreshold.onchange = () => {
        S.asGoldThreshold = Math.max(0, num(agThreshold.value))
      }
    }
    if (agCooldown) {
      agCooldown.onchange = () => {
        S.asGoldCooldownSec = Math.max(10, num(agCooldown.value))
      }
    }
    if (agAllTeamToggle) {
      agAllTeamToggle.onclick = () => {
        S.asGoldAllTeamMode = !S.asGoldAllTeamMode
      }
    }
    if (agStart) {
      agStart.onclick = () => {
        if (S.asGoldRunning) asGoldStop()
        else asGoldStart()
      }
    }
    if (agClear) {
      agClear.onclick = () => {
        S.asGoldLog = []
      }
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
        const toSend = Math.floor(me.gold * (S.asGoldRatio / 100))
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

  }

  const tickId = setInterval(() => {
    render()
  }, 500)

  // ===== CLEANUP FUNCTION =====
  function cleanup() {
    console.log('[HAMMER] Cleanup started...')

    // Clear intervals
    clearInterval(tickId)
    if (asTroopsTimer) clearInterval(asTroopsTimer)
    if (asGoldTimer) clearInterval(asGoldTimer)

    // Remove status overlay
    if (statusOverlay) statusOverlay.remove()

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
    version: '9.0.2-diagnostic',
    exportLogs: Logger.exportLogs,
    exportDiagnostics,
    clearDiagnostics,
    // Exposed for testing
    asSendGold,
    asSendTroops,
    findPlayer,
    verifyClientID,
    // Debug helpers
    getState: () => ({
      mySmallID,
      currentClientID,
      playerDataReady,
      pendingMessagesCount: pendingMessages.length,
      playersCount: playersById.size,
      playerNamesCount: playersByName.size,
      myAllies,
      myTeam,
      playersById,
      playersBySmallId,
      playersByName,
      eventBus: !!eventBus,
      eventBusMethod: eventBus ? 'EventBus' : 'WebSocket',
      gameSocket: !!gameSocket,
      gameSocketReady: gameSocket?.readyState,
      gameSocketReadyStateText: gameSocket?.readyState === 1 ? 'OPEN' : gameSocket?.readyState === 0 ? 'CONNECTING' : gameSocket?.readyState === 2 ? 'CLOSING' : gameSocket?.readyState === 3 ? 'CLOSED' : 'UNKNOWN',
      gameViewHooked,
      displayEventsReceived,
      donationsTracked,
      inboundCount: S.inbound.size,
      outboundCount: S.outbound.size,
      feedInCount: S.feedIn.length,
      feedOutCount: S.feedOut.length,
      autoSendReady: !!(eventBus || (gameSocket && gameSocket.readyState === 1 && currentClientID)),
      autoSendMethod: eventBus ? 'EventBus (preferred)' : 'WebSocket (fallback)',
      autoSendBlockers: [
        !eventBus && !gameSocket ? 'Neither EventBus nor gameSocket available' : null,
        !eventBus && gameSocket && gameSocket.readyState !== 1 ? `gameSocket not OPEN (state: ${gameSocket.readyState})` : null,
        !eventBus && !currentClientID ? 'currentClientID not set (needed for WebSocket fallback)' : null
      ].filter(x => x)
    }),
    testAutoSend: () => {
      console.log('[HAMMER] Auto-send test:')
      console.log('  gameSocket:', !!gameSocket)
      console.log('  gameSocket.readyState:', gameSocket?.readyState, gameSocket?.readyState === 1 ? '(OPEN)' : '(NOT OPEN)')
      console.log('  currentClientID:', currentClientID || '(NOT SET)')
      console.log('  playersByName.size:', playersByName.size)
      console.log('  Teammates:', getTeammates().map(p => p.displayName || p.name))

      if (!gameSocket) {
        console.error('[HAMMER] ❌ gameSocket not captured - WebSocket interception failed')
        return false
      }
      if (gameSocket.readyState !== 1) {
        console.error('[HAMMER] ❌ gameSocket not OPEN - state:', gameSocket.readyState)
        return false
      }
      if (!currentClientID) {
        console.error('[HAMMER] ❌ currentClientID not set - client ID not captured')
        return false
      }

      console.log('[HAMMER] ✅ Auto-send prerequisites met!')
      return true
    },
    clearCooldowns: () => {
      S.asGoldLastSend = {}
      S.asTroopsLastSend = {}
      console.log('[HAMMER] ✅ All cooldowns cleared!')
    },
    discoverEvents: () => {
      console.log('[HAMMER] 🔍 Discovering donation event classes...')
      if (!eventBus) {
        console.error('[HAMMER] ❌ EventBus not available')
        return false
      }
      const result = discoverDonationEventClasses()
      if (result) {
        console.log('[HAMMER] ✅ Discovery successful!')
        console.log('[HAMMER] Gold event class:', donateGoldEventClass?.name)
        console.log('[HAMMER] Troops event class:', donateTroopsEventClass?.name)
      } else {
        console.log('[HAMMER] ⚠️ Could not auto-discover - will need manual identification')
        console.log('[HAMMER] Available event classes:')
        for (const [eventClass, handlers] of eventBus.listeners.entries()) {
          console.log(`  - ${eventClass.name} (${handlers.length} listeners)`)
        }
      }
      return result
    },
    listEventClasses: () => {
      if (!eventBus) {
        console.error('[HAMMER] ❌ EventBus not available')
        return []
      }
      const classes = []
      for (const [eventClass, handlers] of eventBus.listeners.entries()) {
        classes.push({ name: eventClass.name, class: eventClass, handlerCount: handlers.length })
      }
      console.log('[HAMMER] Found', classes.length, 'event classes:')
      classes.forEach(c => console.log(`  - ${c.name} (${c.handlerCount} listeners)`))
      return classes
    },
    testEventClass: (className, playerName, goldAmount = 1000) => {
      console.log(`[HAMMER] 🧪 Testing event class "${className}" for donation...`)

      if (!eventBus) {
        console.error('[HAMMER] ❌ EventBus not available')
        return false
      }

      // Find the event class by name
      let EventClass = null
      for (const [eventClass, handlers] of eventBus.listeners.entries()) {
        if (eventClass.name === className) {
          EventClass = eventClass
          console.log('[HAMMER] ✅ Found event class:', className, 'with', handlers.length, 'listeners')
          break
        }
      }

      if (!EventClass) {
        console.error(`[HAMMER] ❌ Event class "${className}" not found`)
        console.log('[HAMMER] Use window.__HAMMER__.listEventClasses() to see available classes')
        return false
      }

      // Find the player
      const player = findPlayer(playerName)
      if (!player) {
        console.error(`[HAMMER] ❌ Player "${playerName}" not found`)
        return false
      }

      // Get PlayerView
      const playerView = getPlayerView(player.id)
      if (!playerView) {
        console.error('[HAMMER] ❌ PlayerView not found for ID:', player.id)
        return false
      }

      console.log('[HAMMER] ✅ Player found:', player.displayName || player.name)
      console.log('[HAMMER] ✅ PlayerView obtained')

      try {
        // Gold (Rp) needs BigInt, Troops (Op) needs regular number
        const amount = className === 'Rp' ? BigInt(goldAmount) : goldAmount
        const event = new EventClass(playerView, amount)
        console.log('[HAMMER] ✅ Event created:', event)
        console.log('[HAMMER] Event properties:', Object.keys(event))

        // Emit it
        eventBus.emit(event)
        console.log('[HAMMER] ✅ Event emitted!')
        console.log('[HAMMER] 📋 Check game UI - did the donation appear?')
        return true
      } catch (err) {
        console.error('[HAMMER] ❌ Failed to create/emit event:', err)
        return false
      }
    },
    testManualSend: (playerName, goldAmount = 1000) => {
      console.log(`[HAMMER] 🧪 Testing manual send to "${playerName}" for ${goldAmount} gold...`)

      const player = findPlayer(playerName)
      if (!player) {
        console.error(`[HAMMER] ❌ Player "${playerName}" not found`)
        console.log('[HAMMER] Available players:', Array.from(playersByName.keys()).slice(0, 20))
        return false
      }

      console.log('[HAMMER] ✅ Player found:', player.displayName || player.name, 'ID:', player.id)
      console.log('[HAMMER] EventBus available:', !!eventBus)
      console.log('[HAMMER] Discovered gold class:', donateGoldEventClass?.name || 'not discovered yet')

      const result = asSendGold(player.id, goldAmount)
      if (result) {
        console.log('[HAMMER] ✅ Send function returned TRUE')
        console.log('[HAMMER] 📋 Check game UI to see if donation appeared!')
      } else {
        console.log('[HAMMER] ❌ Send function returned FALSE - check [AUTO-SEND] error logs above')
      }
      return result
    },
    state: S  // Expose state for debugging
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

  console.log('%c[HAMMER]%c v8.8 FINAL ready! 🔨', 'color:#deb887;font-weight:bold', 'color:inherit')
  console.log('[HAMMER] Status:', initMessages.join(' | '))
  console.log('[HAMMER] ✅ Hotkeys FIXED with stopImmediatePropagation!')
  console.log('[HAMMER] 📜 Vertical scroll layout - no nested scroll containers!')
  console.log('[HAMMER] 🔄 Now supports mid-game reruns!')
})()
