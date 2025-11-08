// =====================================================================
// HAMMER v9.1 "HARDENED" — The Stable Edition
// Version: 9.1
// Build Date: 2025-01-07
// Previous: v9.0 APEX FINAL
//
// CRITICAL FIXES (from v9.0):
// - Auto-troops scroll bounce FIXED (removed live troop counts)
// - Auto-troops target clicking FIXED (event delegation implemented)
// - Tab switching lag FIXED (reduced render from 500ms to 1500ms)
// - Overlays FIXED (separate canvas, no longer erased by game)
// - Event handlers no longer destroyed/recreated every 500ms
//
// PERFORMANCE IMPROVEMENTS:
// - Render interval: 500ms → 1500ms (3x faster)
// - Event delegation prevents handler thrashing
// - Static target lists prevent scroll position jumps
// - Simplified activity log (no live countdowns)
//
// ALL v9.0 FEATURES PRESERVED:
// - Weak Player Targeting system
// - Enhanced Gold Rate intelligence
// - Fixed troop display (divided by 10)
// - Alliance timer warnings
// - Enhanced Embargo manager
// - All automation features working
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

  const DEBUG = false
  const log = (...a) => { if (DEBUG) console.log('[HAMMER]', ...a) }

  // ===== CLEANUP TRACKING =====
  const eventCleanup = []
  let origSetTransform = null
  let origDrawImage = null
  let origRAF = null

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
  const SAM_RANGE_TILES = 70
  const ATOM_INNER = 12, ATOM_OUTER = 30
  const HYDROGEN_INNER = 80, HYDROGEN_OUTER = 100
  const DEFAULT_QUEUE_DELAY_MS = 240
  const MAX_INTENT_RETRY = 3

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

  // Session tracking
  const sessionStartTime = Date.now()

  // Gold rate tracking
  const goldHistory = []
  let lastGoldDispatch = 0

  // SAM tracking
  const samUnits = new Map()
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
  const tileCountByOwner = new Map()
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
    // Fix: 150,000 was showing as 1.5M - need better threshold
    if (v >= 1e6) {
      // 1,000,000+ → show as M with one decimal
      return (Math.round(v / 1e5) / 10) + 'M'
    }
    if (v >= 1e3) {
      // 1,000+ → show as k
      const thousands = v / 1e3
      if (thousands >= 100) {
        // 100k+ → no decimal (e.g., 150k, 372k)
        return Math.round(thousands) + 'k'
      } else {
        // Under 100k → one decimal (e.g., 33.6k, 99.9k)
        return (Math.round(thousands * 10) / 10) + 'k'
      }
    }
    // Under 1,000 → show full number
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
    view: 'command',
    paused: false, minimized: false, sizeIdx: 1,
    myTag: null, filterTagMates: false,
    seen: new Set(),

    // Donation tracking
    inbound: new Map(), outbound: new Map(), ports: new Map(),
    feedIn: [], feedOut: [], rawMessages: [],

    // Feature toggles
    goldRateEnabled: true, samOverlayEnabled: false,
    atomOverlayEnabled: false, hydrogenOverlayEnabled: false,
    intentQueueDelayMs: DEFAULT_QUEUE_DELAY_MS,
    intentQueueSize: 0,

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

    // Auto-donate gold state
    asGoldRunning: false,
    asGoldTargets: [],
    asGoldAmount: 10000,
    asGoldThreshold: 100000,
    asGoldLastSend: {},
    asGoldNextSend: {},
    asGoldCooldownSec: 10,
    asGoldLog: [],
    asGoldAllTeamMode: false
  }

  const intentQueue = []
  let intentQueueBusy = false
  let metricsCache = []
  let metricsCacheTs = 0

  function bump(map, key) {
    if (!map.has(key)) map.set(key, { gold: 0, troops: 0, count: 0, last: null })
    return map.get(key)
  }

  function ensurePortRecord(playerId) {
    if (!S.ports.has(playerId)) {
      S.ports.set(playerId, {
        received: 0,
        sent: 0,
        net: 0,
        inboundTimes: [],
        outboundTimes: [],
        inboundAvgSec: 0,
        outboundAvgSec: 0,
        inboundLastSec: 0,
        outboundLastSec: 0,
        inboundGpm: 0,
        outboundGpm: 0
      })
    }
    return S.ports.get(playerId)
  }

  function trackPortTrade(playerId, gold, t, direction = 'in') {
    if (playerId == null || !gold) return
    const rec = ensurePortRecord(playerId)
    const times = direction === 'out' ? rec.outboundTimes : rec.inboundTimes
    const key = direction === 'out' ? 'sent' : 'received'
    rec[key] += gold
    rec.net = rec.received - rec.sent

    times.push(t)
    if (times.length > 60) times.shift()

    if (times.length >= 2) {
      const diffs = []
      for (let i = 1; i < times.length; i++) diffs.push((times[i] - times[i - 1]) / 1000)
      const sum = diffs.reduce((a, b) => a + b, 0)
      const avg = sum / diffs.length
      const last = diffs[diffs.length - 1]
      if (direction === 'out') {
        rec.outboundAvgSec = Math.round(avg)
        rec.outboundLastSec = Math.round(last)
        rec.outboundGpm = Math.round((rec.sent / Math.max(1, (sum / 60))))
      } else {
        rec.inboundAvgSec = Math.round(avg)
        rec.inboundLastSec = Math.round(last)
        rec.inboundGpm = Math.round((rec.received / Math.max(1, (sum / 60))))
      }
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
        }

        metricsCache = []
        metricsCacheTs = 0
        updateAlliancePlanKey()

      }

      // Unit updates
      const units = updates?.[GameUpdateType.Unit]
      if (units?.length) {
        for (const u of units) {
          if (!u || u.id === undefined) continue
          const idKey = String(u.id)
          const isSam = u.unitType === 'SAM Launcher' || u.unitType === 'SAMLauncher'
          const isCity = u.unitType === 'City'

          if (isCity) upsertCity(u)

          if (isSam) {
            if (u.isActive === false) {
              samUnits.delete(idKey)
            } else {
              samUnits.set(idKey, { ref: u.pos, ownerID: u.ownerID })
            }
          }
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
            const prevOwner = tileOwnerByRef.get(ref)
            if (prevOwner != null && prevOwner !== ownerSmall) {
              if (prevOwner > 0) {
                const prevCt = tileCountByOwner.get(prevOwner) || 0
                tileCountByOwner.set(prevOwner, Math.max(0, prevCt - 1))
              }
            }
            tileOwnerByRef.set(ref, ownerSmall)
            if (ownerSmall > 0) {
              tileCountByOwner.set(ownerSmall, (tileCountByOwner.get(ownerSmall) || 0) + 1)
            }
          } catch {}
        }
        metricsCache = []
        metricsCacheTs = 0
      }

      // DisplayEvent messages
      const displayEvents = updates?.[GameUpdateType.DisplayEvent]
      if (displayEvents?.length) {
        for (const evt of displayEvents) {
          try { processDisplayMessage(evt) }
          catch (err) { log('Display event error:', err) }
        }
      }
    } catch (err) {
      log('Worker message error:', err)
    }
  }

  function processDisplayMessage(msg) {
    if (!msg || typeof msg.messageType !== 'number') return

    S.rawMessages.push(msg)
    if (S.rawMessages.length > 100) S.rawMessages.shift()

    if (S.paused) return

    const mt = msg.messageType
    const pid = msg.playerID
    const text = msg.message || ''

    if (pid !== mySmallID) {
      log(`Message for player ${pid}, I am ${mySmallID}, skipping`)
      return
    }

    const key = `${mt}:${text}`
    if (S.seen.has(key)) return
    S.seen.add(key)
    if (S.seen.size > 5000) S.seen.clear()

    const now = Date.now()

    if (mt === MessageType.RECEIVED_TROOPS_FROM_PLAYER) {
      const m = text.match(/Received\s+([\d,\.]+[KkMm]?)\s+troops from\s+(.+)$/i)
      if (m) {
        const amt = parseAmt(m[1]), name = m[2].trim()
        const from = findPlayer(name)
        if (from && amt > 0) {
          const r = bump(S.inbound, from.id)
          r.troops += amt; r.count++; r.last = nowDate()
          S.feedIn.push({ ts: nowDate(), type: 'troops', name, amount: amt, isPort: false })
          if (S.feedIn.length > 500) S.feedIn.shift()
          }
      }
    } else if (mt === MessageType.SENT_TROOPS_TO_PLAYER) {
      const m = text.match(/Sent\s+([\d,\.]+[KkMm]?)\s+troops to\s+(.+)$/i)
      if (m) {
        const amt = parseAmt(m[1]), name = m[2].trim()
        const to = findPlayer(name)
        if (to && amt > 0) {
          const r = bump(S.outbound, to.id)
          r.troops += amt; r.count++; r.last = nowDate()
          S.feedOut.push({ ts: nowDate(), type: 'troops', name, amount: amt, isPort: false })
          if (S.feedOut.length > 500) S.feedOut.shift()
          }
      }
    } else if (mt === MessageType.RECEIVED_GOLD_FROM_TRADE) {
      const m = text.match(/Received\s+([\d,\.]+[KkMm]?)\s+gold from trade with\s+(.+)$/i)
      if (m) {
        const amt = msg.goldAmount ? num(msg.goldAmount) : parseAmt(m[1])
        const name = m[2].trim()
        const from = findPlayer(name)
        if (from && amt > 0) {
          const r = bump(S.inbound, from.id)
          r.gold += amt; r.count++; r.last = nowDate()
          S.feedIn.push({ ts: nowDate(), type: 'gold', name, amount: amt, isPort: true })
          if (S.feedIn.length > 500) S.feedIn.shift()
          trackPortTrade(from.id, amt, now, 'in')
          }
      }
    } else if (mt === MessageType.RECEIVED_GOLD_FROM_PLAYER) {
      const m = text.match(/Received\s+([\d,\.]+[KkMm]?)\s+gold from\s+(.+)$/i)
      if (m) {
        const amt = msg.goldAmount ? num(msg.goldAmount) : parseAmt(m[1])
        const name = m[2].trim()
        const from = findPlayer(name)
        if (from && amt > 0) {
          const r = bump(S.inbound, from.id)
          r.gold += amt; r.count++; r.last = nowDate()
          S.feedIn.push({ ts: nowDate(), type: 'gold', name, amount: amt, isPort: false })
          if (S.feedIn.length > 500) S.feedIn.shift()
          }
      }
    } else if (mt === MessageType.SENT_GOLD_TO_PLAYER) {
      const tradeMatch = text.match(/Sent\s+([\d,\.]+[KkMm]?)\s+gold to trade with\s+(.+)$/i)
      const genericMatch = tradeMatch || text.match(/Sent\s+([\d,\.]+[KkMm]?)\s+gold to\s+(.+)$/i)
      if (genericMatch) {
        const amt = msg.goldAmount ? num(msg.goldAmount) : parseAmt(genericMatch[1])
        const name = genericMatch[2].trim()
        const to = findPlayer(name)
        if (to && amt > 0) {
          const r = bump(S.outbound, to.id)
          r.gold += amt; r.count++; r.last = nowDate()
          const isPort = Boolean(tradeMatch)
          S.feedOut.push({ ts: nowDate(), type: 'gold', name, amount: amt, isPort })
          if (S.feedOut.length > 500) S.feedOut.shift()
          if (isPort) trackPortTrade(to.id, amt, now, 'out')
          }
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
    if (found) return { id: found.id, name: found.displayName || found.name || name }
    for (const p of playersById.values()) {
      const pn = p.displayName || p.name || ''
      if (pn.toLowerCase() === lower) return { id: p.id, name: pn }
    }
    return null
  }

  const safeNum = v => num(v) || 0

  function safeRatio(a, b) {
    const na = safeNum(a)
    const nb = safeNum(b)
    if (!nb) return na > 0 ? Infinity : 0
    return na / nb
  }

  function battleScoreFromMetrics(m) {
    if (!m) return 0
    return safeNum(m.troops) +
      safeNum(m.gold) * 0.28 +
      safeNum(m.territory) * 160 +
      safeNum(m.cityLevels) * 26000 +
      Math.max(0, safeNum(m.portIncome)) * 0.55 +
      Math.max(0, safeNum(m.supportDelta)) * 0.1
  }

  function computePlayerMetrics(force = false) {
    const now = Date.now()
    if (!force && metricsCache.length && now - metricsCacheTs < 400) return metricsCache

    const metrics = []
    for (const player of playersById.values()) {
      if (!player || player.isAlive === false) continue
      const trackedTiles = tileCountByOwner.get(player.smallID) || 0
      const territory = Math.max(trackedTiles, safeNum(player.tilesOwned))
      const troopCap = estimateMaxTroops(territory, player.smallID)
      const portRec = S.ports.get(player.id) || null
      const inbound = S.inbound.get(player.id)
      const outbound = S.outbound.get(player.id)
      const cityLevels = cityLevelSumByOwner.get(player.smallID) || 0
      const isMe = (currentClientID && player.clientID === currentClientID) || (mySmallID != null && player.smallID === mySmallID)
      const isAlly = isMe ? true : asIsAlly(player.id)
      const actualTroops = safeNum(player.troops) / 10 // Fix: game sends troops * 10
      const troopFillPct = troopCap > 0 ? Math.min(100, Math.round((actualTroops / troopCap) * 100)) : 0
      const portIncome = portRec ? portRec.received : 0
      const portSpent = portRec ? portRec.sent : 0
      const powerScore = actualTroops +
        safeNum(player.gold) * 0.35 +
        territory * 180 +
        cityLevels * 25000 +
        Math.max(0, portIncome) * 0.65
      const economyScore = safeNum(player.gold) +
        (portRec ? portRec.inboundGpm * 120 : 0) +
        Math.max(0, portIncome - portSpent) * 0.5
      metrics.push({
        id: player.id,
        smallID: player.smallID,
        clientID: player.clientID,
        name: player.displayName || player.name || `Player ${player.id}`,
        team: player.team,
        isAlive: player.isAlive !== false,
        isMe,
        isAlly,
        troops: actualTroops,
        troopCap,
        troopFillPct,
        gold: safeNum(player.gold),
        territory,
        tilesOwned: safeNum(player.tilesOwned),
        portIncome,
        portSpent,
        portNet: portRec ? portRec.net : 0,
        inboundGpm: portRec ? portRec.inboundGpm : 0,
        outboundGpm: portRec ? portRec.outboundGpm : 0,
        inboundGold: inbound ? inbound.gold : 0,
        inboundTroops: inbound ? inbound.troops : 0,
        outboundGold: outbound ? outbound.gold : 0,
        outboundTroops: outbound ? outbound.troops : 0,
        supportDelta:
          (inbound ? inbound.gold + inbound.troops : 0) -
          (outbound ? outbound.gold + outbound.troops : 0),
        cityLevels,
        powerScore,
        economyScore,
        lastUpdate: now
      })
    }

    metricsCache = metrics
    metricsCacheTs = now
    return metrics
  }

  function predictBattleOutcome(meMetrics, enemyMetrics) {
    const myScore = battleScoreFromMetrics(meMetrics)
    const enemyScore = battleScoreFromMetrics(enemyMetrics)
    if (!myScore && !enemyScore) {
      return { verdict: 'Unknown', ratio: 1, diff: 0, note: 'Insufficient intel' }
    }
    const ratio = safeRatio(myScore, enemyScore || 1)
    const diff = myScore - enemyScore
    let verdict = 'Even'
    let note = 'Could go either way'
    if (ratio >= 1.45) {
      verdict = 'Dominant'
      note = 'You have overwhelming force'
    } else if (ratio >= 1.25) {
      verdict = 'Advantage'
      note = 'Favorable margins'
    } else if (ratio >= 1.05) {
      verdict = 'Edge'
      note = 'Slightly ahead'
    } else if (ratio <= 0.6) {
      verdict = 'Outmatched'
      note = 'Avoid direct confrontation'
    } else if (ratio <= 0.85) {
      verdict = 'Risky'
      note = 'They hold the upper hand'
    }
    return { verdict, ratio, diff, note }
  }

  function computeThreatRadar(force = false) {
    const metrics = computePlayerMetrics(force)
    const me = metrics.find(m => m.isMe)
    if (!me) return []

    const threats = []
    for (const m of metrics) {
      if (m.id === me.id || m.isAlly || !m.isAlive) continue
      const troopRatio = safeRatio(m.troops, me.troops || 1)
      const goldRatio = safeRatio(m.gold, me.gold || 1)
      const territoryRatio = safeRatio(m.territory, me.territory || 1)
      const powerRatio = safeRatio(m.powerScore, me.powerScore || 1)
      const econRatio = safeRatio(m.portIncome, me.portIncome || 1)
      const threatScore = (troopRatio * 0.4) + (goldRatio * 0.15) + (territoryRatio * 0.15) + (powerRatio * 0.2) + (econRatio * 0.1)
      const reasons = []
      if (troopRatio > 1.2) reasons.push(`Troop mass x${troopRatio.toFixed(1)}`)
      if (goldRatio > 1.4) reasons.push(`Gold reserve x${goldRatio.toFixed(1)}`)
      if (territoryRatio > 1.2) reasons.push('Territory surge')
      if (econRatio > 1.3) reasons.push('Port dominance')
      if (powerRatio > 1.15) reasons.push('Overall power edge')
      if (!reasons.length) reasons.push('Even footing')
      let severity = 'Watch'
      if (threatScore >= 2.4) severity = 'Critical'
      else if (threatScore >= 1.8) severity = 'High'
      else if (threatScore >= 1.3) severity = 'Elevated'
      const battle = predictBattleOutcome(me, m)
      threats.push({ ...m, threatScore, severity, reasons, battle })
    }

    threats.sort((a, b) => b.threatScore - a.threatScore)
    return threats.slice(0, 8)
  }

  function computePowerRankings(force = false) {
    const metrics = computePlayerMetrics(force).slice()
    metrics.sort((a, b) => b.powerScore - a.powerScore)
    return metrics
  }

  function buildAdviceForPlayer(meMetrics) {
    if (!meMetrics) return []
    const advice = []
    const gpm60 = S.gpm60 || 0
    const gpm120 = S.gpm120 || 0
    const troopFill = meMetrics.troopFillPct
    const portIncome = safeNum(meMetrics.portIncome)
    const netTrade = safeNum(meMetrics.portNet)
    const gold = safeNum(meMetrics.gold)

    if (troopFill > 85) advice.push('Donate or deploy troops before hitting cap')
    if (gold > 400000 && troopFill < 50) advice.push('Invest in troop production or city upgrades')
    if (gpm60 < 12000 && gold > 150000) advice.push('Build new cities or capture ports to boost income')
    if (portIncome > 0 && netTrade > 0) advice.push('Protect trade routes with SAM coverage')
    if (gpm120 > gpm60 * 1.2) advice.push('Momentum rising — queue big builds while income surges')
    if (gold < 50000 && gpm60 < 8000) advice.push('Farm weaker targets or request support')
    if (portIncome === 0 && gold > 250000) advice.push('Establish a port trade to monetize surplus gold')
    if (!advice.length) advice.push('Maintain balanced growth across troops, gold, and territory')
    return advice.slice(0, 4)
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
          if (obj?.type === 'join' && obj.clientID) {
            currentClientID = obj.clientID
            gameSocket = this
          }
          if (obj?.type === 'intent') gameSocket = this
        }
      } catch {}
      return origSend.call(this, data)
    }

    ws.addEventListener('message', ev => {
      try {
        if (!ev?.data) return
        const obj = typeof ev.data === 'string' ? JSON.parse(ev.data) : null
        if (obj && (obj.type === 'turn' || obj.type === 'start' || obj.type === 'ping')) {
          gameSocket = ws
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

  // ===== CANVAS INTERCEPTION =====
  try {
    const proto = CanvasRenderingContext2D.prototype
    origSetTransform = proto.setTransform
    proto.setTransform = function(a, b, c, d, e, f) {
      try {
        const canvas = this.canvas
        if (canvas?.width && canvas.height) {
          targetCanvas = canvas
          currentTransform = {
            a: num(a) || 1,
            b: num(b) || 0,
            c: num(c) || 0,
            d: num(d) || 1,
            e: num(e) || 0,
            f: num(f) || 0
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

    if (e.altKey && e.code === 'KeyE') {
      e.preventDefault()
      e.stopImmediatePropagation()
      embargoAll()
      handled = true
    }

    if (e.altKey && e.code === 'KeyA') {
      e.preventDefault()
      e.stopImmediatePropagation()
      S.atomOverlayEnabled = !S.atomOverlayEnabled
      showStatus(S.atomOverlayEnabled ? '💣 Atom Bomb Overlay ON' : '⏹️ Atom Bomb Overlay OFF')
      handled = true
    }

    if (e.altKey && e.code === 'KeyH') {
      e.preventDefault()
      e.stopImmediatePropagation()
      S.hydrogenOverlayEnabled = !S.hydrogenOverlayEnabled
      showStatus(S.hydrogenOverlayEnabled ? '☢️ Hydrogen Bomb Overlay ON' : '⏹️ Hydrogen Bomb Overlay OFF')
      handled = true
    }

    if (e.ctrlKey && e.shiftKey && e.code === 'KeyF') {
      e.preventDefault()
      e.stopImmediatePropagation()
      S.samOverlayEnabled = !S.samOverlayEnabled
      showStatus(S.samOverlayEnabled ? '🎯 SAM Overlay ON' : '⏹️ SAM Overlay OFF')
      handled = true
    }

    if (handled) return false
  }

  // CRITICAL: Use capture phase (true) to intercept BEFORE the game
  window.addEventListener('keydown', keydownHandler, true)
  eventCleanup.push(() => window.removeEventListener('keydown', keydownHandler, true))

  // ===== AUTO-DONATE TROOPS FUNCTIONS =====
  function enqueueIntent(intent, meta = {}) {
    if (!gameSocket || gameSocket.readyState !== 1 || !currentClientID) return false
    const item = { intent, meta, attempts: 0 }
    intentQueue.push(item)
    S.intentQueueSize = intentQueue.length
    processIntentQueue()
    return true
  }

  function processIntentQueue() {
    if (intentQueueBusy) return
    if (!intentQueue.length) {
      S.intentQueueSize = 0
      return
    }
    if (!gameSocket || gameSocket.readyState !== 1) {
      intentQueue.length = 0
      S.intentQueueSize = 0
      intentQueueBusy = false
      return
    }

    const item = intentQueue.shift()
    S.intentQueueSize = intentQueue.length
    intentQueueBusy = true

    try {
      gameSocket.send(JSON.stringify({ type: 'intent', intent: item.intent }))
    } catch (err) {
      console.warn('[HAMMER] Intent send failed, retrying...', err)
      item.attempts = (item.attempts || 0) + 1
      if (item.attempts < MAX_INTENT_RETRY) {
        intentQueue.unshift(item)
      }
    } finally {
      setTimeout(() => {
        intentQueueBusy = false
        processIntentQueue()
      }, Math.max(120, S.intentQueueDelayMs || DEFAULT_QUEUE_DELAY_MS))
    }
  }

  function asSendTroops(targetId, amount) {
    if (!currentClientID) return false
    const intent = { type: 'donate_troops', clientID: currentClientID, recipient: targetId, troops: amount == null ? null : num(amount) }
    return enqueueIntent(intent, { kind: 'troops', targetId, amount })
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
    if (!S.asTroopsRunning) return
    const now = Date.now()
    const targets = asResolveTargets()
    if (!targets.length) return

    const me = readMyPlayer()
    if (!me) return
    const troops = me.troops || 0
    const maxT = estimateMaxTroops(me.tilesOwned, me.smallID)
    if (!maxT || (troops / maxT) * 100 < S.asTroopsThreshold) return

    const toSend = Math.max(1, Math.floor(troops * (S.asTroopsRatio / 100)))

    for (const target of targets) {
      if (!asIsAlly(target.id)) continue
      const last = S.asTroopsLastSend[target.id] || 0
      const cooldownMs = S.asTroopsCooldownSec * 1000
      const nextSend = last + cooldownMs

      // Track next send time for countdown display
      S.asTroopsNextSend[target.id] = nextSend

      if (now >= nextSend) {
        if (asSendTroops(target.id, toSend)) {
          S.asTroopsLastSend[target.id] = now
          S.asTroopsNextSend[target.id] = now + cooldownMs
          S.asTroopsLog.push(`[${fmtTime(nowDate())}] Sent ${short(toSend)} troops to ${target.name}`)
          if (S.asTroopsLog.length > 100) S.asTroopsLog.shift()
          }
      }
    }
  }

  let asTroopsTimer = null
  function asTroopsStart() {
    S.asTroopsRunning = true
    if (asTroopsTimer) clearInterval(asTroopsTimer)
    asTroopsTimer = setInterval(asTroopsTick, 800)
  }
  function asTroopsStop() {
    S.asTroopsRunning = false
    if (asTroopsTimer) { clearInterval(asTroopsTimer); asTroopsTimer = null }
  }

  // ===== AUTO-DONATE GOLD FUNCTIONS =====
  function asSendGold(targetId, amount) {
    if (!currentClientID) return false
    const intent = { type: 'donate_gold', clientID: currentClientID, recipient: targetId, gold: num(amount) }
    return enqueueIntent(intent, { kind: 'gold', targetId, amount })
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
    if (!S.asGoldRunning) return
    const now = Date.now()
    const targets = asResolveGoldTargets()
    if (!targets.length) return

    const me = readMyPlayer()
    if (!me) return
    const gold = me.gold || 0
    if (gold < S.asGoldThreshold) return

    const toSend = num(S.asGoldAmount)
    if (toSend <= 0) return

    for (const target of targets) {
      if (!asIsAlly(target.id)) continue
      const last = S.asGoldLastSend[target.id] || 0
      const cooldownMs = S.asGoldCooldownSec * 1000
      const nextSend = last + cooldownMs

      // Track next send time for countdown display
      S.asGoldNextSend[target.id] = nextSend

      if (now >= nextSend) {
        if (asSendGold(target.id, toSend)) {
          S.asGoldLastSend[target.id] = now
          S.asGoldNextSend[target.id] = now + cooldownMs
          S.asGoldLog.push(`[${fmtTime(nowDate())}] Sent ${short(toSend)} gold to ${target.name}`)
          if (S.asGoldLog.length > 100) S.asGoldLog.shift()
          }
      }
    }
  }

  let asGoldTimer = null
  function asGoldStart() {
    S.asGoldRunning = true
    if (asGoldTimer) clearInterval(asGoldTimer)
    asGoldTimer = setInterval(asGoldTick, 800)
  }
  function asGoldStop() {
    S.asGoldRunning = false
    if (asGoldTimer) { clearInterval(asGoldTimer); asGoldTimer = null }
  }

  // ===== EMBARGO FUNCTIONS =====
  function sendEmbargo(tid, action = 'start') {
    if (!currentClientID) return false
    const intent = { type: 'embargo', clientID: currentClientID, targetID: tid, action }
    return enqueueIntent(intent, { kind: 'embargo', targetId: tid, action })
  }

  async function embargoAll() {
    const me = readMyPlayer()
    if (!me) {
      showStatus('❌ Player not found')
      return
    }

    const players = [...playersById.values()].filter(p => p.id && p.id !== me.id)
    showStatus(`🚫 Embargoing ${players.length} players...`, 3000)

    let ct = 0
    for (const p of players) {
      if (sendEmbargo(p.id, 'start')) ct++
      await new Promise(r => setTimeout(r, 50))
    }

    showStatus(`🚫 Embargoed ${ct} players`)
  }

  async function unembargoAll() {
    const me = readMyPlayer()
    if (!me) {
      showStatus('❌ Player not found')
      return
    }

    const players = [...playersById.values()].filter(p => p.id && p.id !== me.id)
    showStatus(`✅ Un-embargoing ${players.length} players...`, 3000)

    let ct = 0
    for (const p of players) {
      if (sendEmbargo(p.id, 'stop')) ct++
      await new Promise(r => setTimeout(r, 50))
    }

    showStatus(`✅ Trading enabled with ${ct} players`)
  }

  // ===== OVERLAY DRAWING =====
  const createPoint = (x, y) => (typeof DOMPoint === 'function' ? new DOMPoint(x, y) : { x, y })

  function tileScale() {
    const sx = worldTilesWidth ? screenCanvasWidth / worldTilesWidth : 1
    const sy = worldTilesHeight ? screenCanvasHeight / worldTilesHeight : 1
    return { sx, sy }
  }

  function getCanvasTransform() {
    if (targetCanvas) {
      try {
        const ctx = targetCanvas.getContext('2d')
        if (ctx?.getTransform) return ctx.getTransform()
      } catch {}
    }
    const Matrix = typeof DOMMatrix === 'function' ? DOMMatrix : null
    if (!Matrix) {
      return {
        transformPoint(pt) {
          const { x, y } = pt
          return {
            x: x * (currentTransform.a ?? 1) + y * (currentTransform.c ?? 0) + (currentTransform.e ?? 0),
            y: x * (currentTransform.b ?? 0) + y * (currentTransform.d ?? 1) + (currentTransform.f ?? 0)
          }
        },
        inverse() { return this }
      }
    }
    return new Matrix([
      currentTransform.a ?? 1,
      currentTransform.b ?? 0,
      currentTransform.c ?? 0,
      currentTransform.d ?? 1,
      currentTransform.e ?? 0,
      currentTransform.f ?? 0
    ])
  }

  function screenToWorld(screenX, screenY) {
    const matrix = getCanvasTransform()
    const inv = typeof matrix.inverse === 'function' ? matrix.inverse() : matrix
    const pt = inv.transformPoint(createPoint(screenX, screenY))
    const { sx, sy } = tileScale()
    return { x: sx ? pt.x / sx : pt.x, y: sy ? pt.y / sy : pt.y }
  }

  // ===== OVERLAY CANVASES (separate from game canvas) =====
  let overlayCanvas = null
  let overlayCtx = null

  function ensureOverlayCanvas() {
    if (!overlayCanvas) {
      overlayCanvas = document.createElement('canvas')
      overlayCanvas.id = 'hammer-overlay'
      Object.assign(overlayCanvas.style, {
        position: 'fixed',
        zIndex: '2147483647',
        pointerEvents: 'none',
        top: '0px',
        left: '0px'
      })
      document.documentElement.appendChild(overlayCanvas)
      overlayCtx = overlayCanvas.getContext('2d')
    }
    syncOverlayBounds()
  }

  function syncOverlayBounds() {
    if (!overlayCanvas || !targetCanvas) return
    const r = targetCanvas.getBoundingClientRect()
    overlayCanvas.width = targetCanvas.width
    overlayCanvas.height = targetCanvas.height
    overlayCanvas.style.width = `${Math.round(r.width)}px`
    overlayCanvas.style.height = `${Math.round(r.height)}px`
    overlayCanvas.style.left = `${Math.round(r.left)}px`
    overlayCanvas.style.top = `${Math.round(r.top)}px`
  }

  function hideOverlayCanvas() {
    if (overlayCanvas) {
      overlayCanvas.remove()
    }
    overlayCanvas = null
    overlayCtx = null
  }

  function drawOverlays() {
    // Check if any overlay is enabled
    if (!S.samOverlayEnabled && !S.atomOverlayEnabled && !S.hydrogenOverlayEnabled) {
      hideOverlayCanvas()
      return
    }

    if (!targetCanvas) return

    ensureOverlayCanvas()
    if (!overlayCtx) return

    // Clear overlay
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)

    // Apply game transform
    overlayCtx.setTransform(currentTransform.a, 0, 0, currentTransform.d, currentTransform.e, currentTransform.f)

    if (S.samOverlayEnabled) {
      const halfW = (worldTilesWidth || 0) / 2
      const halfH = (worldTilesHeight || 0) / 2
      if (!worldTilesWidth || !worldTilesHeight) return

      overlayCtx.lineWidth = 1.5 / Math.max(0.5, currentTransform.a)

      const me = readMyPlayer()
      for (const sam of samUnits.values()) {
        const tx = sam.ref % worldTilesWidth
        const ty = Math.floor(sam.ref / worldTilesWidth)
        const cx = tx - halfW
        const cy = ty - halfH

        // Pick color based on relation
        let stroke = 'rgba(0, 200, 255, 0.85)'
        let fill = 'rgba(0, 200, 255, 0.15)'

        if (me && sam.ownerID === me.smallID) {
          stroke = 'rgba(0, 200, 255, 0.85)'
          fill = 'rgba(0, 200, 255, 0.15)'
        } else if (me && asIsAlly(sam.ownerID)) {
          stroke = 'rgba(0, 200, 0, 0.85)'
          fill = 'rgba(0, 200, 0, 0.15)'
        } else {
          stroke = 'rgba(220, 0, 0, 0.85)'
          fill = 'rgba(220, 0, 0, 0.15)'
        }

        overlayCtx.strokeStyle = stroke
        overlayCtx.fillStyle = fill
        overlayCtx.beginPath()
        overlayCtx.arc(cx, cy, SAM_RANGE_TILES, 0, Math.PI * 2)
        overlayCtx.fill()
        overlayCtx.stroke()
      }
    }

    if (S.atomOverlayEnabled) {
      const worldPoint = screenToWorld(lastMouseClient.x, lastMouseClient.y)

      overlayCtx.strokeStyle = 'rgba(255, 200, 0, 0.8)'
      overlayCtx.fillStyle = 'rgba(255, 200, 0, 0.1)'
      overlayCtx.lineWidth = 2 / Math.max(0.5, currentTransform.a)
      overlayCtx.beginPath()
      overlayCtx.arc(worldPoint.x, worldPoint.y, ATOM_INNER, 0, Math.PI * 2)
      overlayCtx.fill()
      overlayCtx.stroke()

      overlayCtx.strokeStyle = 'rgba(255, 100, 0, 0.5)'
      overlayCtx.fillStyle = 'rgba(255, 100, 0, 0.05)'
      overlayCtx.lineWidth = 1.5 / Math.max(0.5, currentTransform.a)
      overlayCtx.beginPath()
      overlayCtx.arc(worldPoint.x, worldPoint.y, ATOM_OUTER, 0, Math.PI * 2)
      overlayCtx.fill()
      overlayCtx.stroke()
    }

    if (S.hydrogenOverlayEnabled) {
      const worldPoint = screenToWorld(lastMouseClient.x, lastMouseClient.y)

      overlayCtx.strokeStyle = 'rgba(0, 255, 255, 0.8)'
      overlayCtx.fillStyle = 'rgba(0, 255, 255, 0.1)'
      overlayCtx.lineWidth = 2 / Math.max(0.5, currentTransform.a)
      overlayCtx.beginPath()
      overlayCtx.arc(worldPoint.x, worldPoint.y, HYDROGEN_INNER, 0, Math.PI * 2)
      overlayCtx.fill()
      overlayCtx.stroke()

      overlayCtx.strokeStyle = 'rgba(0, 150, 255, 0.5)'
      overlayCtx.fillStyle = 'rgba(0, 150, 255, 0.05)'
      overlayCtx.lineWidth = 1.5 / Math.max(0.5, currentTransform.a)
      overlayCtx.beginPath()
      overlayCtx.arc(worldPoint.x, worldPoint.y, HYDROGEN_OUTER, 0, Math.PI * 2)
      overlayCtx.fill()
      overlayCtx.stroke()
    }

    // Reset transform
    overlayCtx.setTransform(1, 0, 0, 1, 0, 0)
  }

  if (window.requestAnimationFrame) {
    origRAF = window.requestAnimationFrame
    window.requestAnimationFrame = function(callback) {
      return origRAF.call(this, function(time) {
        callback(time)
        try { drawOverlays() } catch {}
      })
    }
  }

  // ===== UI =====
  const ui = document.createElement('div')
  ui.id = 'hammer-v9'
  Object.assign(ui.style, {
    position: 'fixed', right: '14px', bottom: '14px',
    width: SIZES[S.sizeIdx].w + 'px', height: SIZES[S.sizeIdx].h + 'px',
    background: '#0b1220', color: '#e7eef5',
    font: '12px/1.35 Consolas,Menlo,monospace',
    border: '2px solid #86531f', borderRadius: '10px',
    zIndex: '2147483645', boxShadow: '0 10px 28px rgba(0,0,0,.55)',
    overflow: 'hidden', userSelect: 'none', resize: 'both'
  })

  const tabs = ['command', 'summary', 'stats', 'aiinsights', 'threat', 'power', 'weaktargets', 'ports', 'feed', 'goldrate', 'alliances', 'autotroops', 'autogold', 'overlays', 'embargo', 'hotkeys']
  const tabLabels = {
    command: 'Command',
    aiinsights: 'AI Insights',
    threat: 'Threat Radar',
    power: 'Power Rankings',
    goldrate: 'Gold Rate',
    weaktargets: 'Weak Targets',
    autotroops: 'Auto Troops',
    autogold: 'Auto Gold'
  }
  ui.innerHTML = `
    <div id="hm-head" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#151f33;border-bottom:1px solid #86531f;cursor:move;flex-shrink:0">
      <div><b>HAMMER v9.0</b> <span style="opacity:.85">APEX</span></div>
      <div class="btns" style="display:flex;gap:6px;flex-wrap:wrap">
        <div id="hm-tabs" style="display:flex;gap:4px;flex-wrap:wrap">
          ${tabs.map(v => `<button class="tab" data-v="${v}">${tabLabels[v] || (v[0].toUpperCase() + v.slice(1))}</button>`).join('')}
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
        #hammer-v9 .row{display:flex;justify-content:space-between;gap:10px;margin:2px 0;align-items:center}
        #hammer-v9 .muted{color:#9bb0c8}
        #hammer-v9 .mono{font-feature-settings:"tnum";font-variant-numeric:tabular-nums}
        #hammer-v9 .title{font-weight:700;margin:8px 0 4px;color:#ffcf5d}
        #hammer-v9 .box{padding:10px;border:1px solid #2a3a55;border-radius:10px;background:#101a2a;margin:8px 0}
        #hammer-v9 .help{color:#7bb8ff;font-size:11px;line-height:1.4;margin:4px 0}
        #hammer-v9 button{background:#0e1a2f;color:#e7eef5;border:1px solid #2a3a55;border-radius:6px;padding:4px 8px;cursor:pointer;font:11px Consolas,Menlo,monospace;pointer-events:auto}
        #hammer-v9 button:hover{background:#253454}
        #hammer-v9 button.active{background:#2a5244;border-color:#4a8864}
        #hammer-v9 button.danger{background:#3a1f1f;border-color:#ff8b94}
        #hammer-v9 button.danger:hover{background:#4a2525}
        #hammer-v9 input,#hammer-v9 textarea{background:#0e1a2f;color:#e7eef5;border:1px solid #2a3a55;border-radius:6px;padding:6px 8px;font:12px Consolas,Menlo,monospace}
        #hammer-v9 textarea{min-height:54px;resize:vertical}
        #hammer-v9 input:focus,#hammer-v9 textarea:focus{outline:2px solid #4a6894;background:#152030}
        #hammer-v9 input[type="range"]{width:100%;margin:8px 0}
        #hammer-v9 .status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
        #hammer-v9 .status-dot.running{background:#7ff2a3;animation:pulse 2s infinite}
        #hammer-v9 .status-dot.stopped{background:#ff8b94}
        #hammer-v9 .preview-calc{background:#0d1520;border:2px solid #4a8864;border-radius:10px;padding:14px;margin:12px 0;font-size:14px;color:#7ff2a3}
        #hammer-v9 .tag-list{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}
        #hammer-v9 .tag{background:#2a3a55;padding:4px 8px;border-radius:12px;font-size:11px;display:inline-flex;align-items:center;gap:6px}
        #hammer-v9 .tag-remove{cursor:pointer;color:#ff8b94;font-weight:bold;pointer-events:auto}
        #hammer-v9 .hotkey{display:inline-block;background:#1a2a3f;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:6px;color:#7bb8ff}
        #hammer-v9 .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:8px 0}
        #hammer-v9 .stat-card{background:#0d1520;border:1px solid #2a3a55;border-radius:8px;padding:12px}
        #hammer-v9 .stat-label{color:#9bb0c8;font-size:10px;text-transform:uppercase;margin-bottom:4px}
        #hammer-v9 .stat-value{color:#7ff2a3;font-size:18px;font-weight:700}
        #hammer-v9 .recommendation{background:#1a2a1f;border-left:3px solid #4a8864;padding:8px;margin:6px 0;font-size:11px}
        #hammer-v9 .warning{background:#2a1f1a;border-left:3px solid #ff8b94;padding:8px;margin:6px 0;font-size:11px}
        #hammer-v9 .severity-critical{background:rgba(255,64,64,0.12);border-left:3px solid #ff5a5a}
        #hammer-v9 .severity-high{background:rgba(255,160,64,0.12);border-left:3px solid #ff9f5d}
        #hammer-v9 .severity-elevated{background:rgba(255,200,0,0.12);border-left:3px solid #ffcf5d}
        #hammer-v9 .pill{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:999px;font-size:10px;background:#1a2a3f;color:#7bb8ff}
        #hammer-v9 .battle-list{display:flex;flex-direction:column;gap:6px}
        #hammer-v9 .battle-item{display:flex;justify-content:space-between;gap:10px;padding:6px 8px;border:1px solid #2a3a55;border-radius:6px;background:#0e1826;cursor:pointer}
        #hammer-v9 .battle-item:hover{border-color:#4a8864;background:#142233}
        #hammer-v9 .queue-indicator{font-size:11px;color:#7bb8ff;margin-left:6px}
        #hammer-v9 .plan-actions{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}
        #hammer-v9 .plan{border:1px solid #2a3a55;border-radius:8px;padding:10px;background:#0d1520;margin:6px 0}
        #hammer-v9 .plan.done{opacity:0.65;border-style:dashed}
        #hammer-v9 .badge{display:inline-flex;align-items:center;padding:2px 6px;border-radius:6px;font-size:10px;background:#1a2a3f;color:#7bb8ff;margin-left:6px}
        #hammer-v9 .list-compact{display:flex;flex-direction:column;gap:4px;font-size:11px}
        #hammer-v9 .threat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
        #hammer-v9 .threat-card{background:#0d1520;border:1px solid #2a3a55;border-radius:8px;padding:10px;min-height:120px;display:flex;flex-direction:column;gap:6px}
        #hammer-v9 .threat-card .header{display:flex;justify-content:space-between;align-items:center;font-weight:700;color:#ffcf5d}
        #hammer-v9 .flex-between{display:flex;justify-content:space-between;align-items:center}
        #hammer-v9 .grid-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
        #hammer-v9 .plan-meta{font-size:10px;color:#9bb0c8;margin-top:4px}
        #hammer-v9 .accent{color:#7ff2a3}
        #hammer-v9 .negative{color:#ff8b94}
        #hammer-v9 .neutral{color:#9bb0c8}
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
      if (t?.trim()) {
        S.myTag = t.trim()
        updateAlliancePlanKey()
      }
    }
    S.filterTagMates = !S.filterTagMates
    ui.querySelector('#hm-tag').textContent = S.filterTagMates ? `Tag[${S.myTag}]` : 'Tag'
    updateAlliancePlanKey()
  }
  ui.querySelector('#hm-export').onclick = () => {
    const obj = {
      exportedAt: new Date().toISOString(),
      sessionDuration: fmtDuration(Date.now() - sessionStartTime),
      myClientID: currentClientID, mySmallID,
      inbound: Object.fromEntries(S.inbound),
      outbound: Object.fromEntries(S.outbound),
      ports: Object.fromEntries([...S.ports.entries()].map(([k, v]) => [k, {
        received: v.received,
        sent: v.sent,
        net: v.net,
        inboundGpm: v.inboundGpm,
        outboundGpm: v.outboundGpm,
        inboundAvgSec: v.inboundAvgSec,
        outboundAvgSec: v.outboundAvgSec
      }])),
      goldRate: { gps30: S.gps30, gpm60: S.gpm60, gpm120: S.gpm120 },
      stream: {
        inbound: S.feedIn.map(x => ({ ts: x.ts.toISOString(), type: x.type, name: x.name, amount: x.amount, isPort: x.isPort })),
        outbound: S.feedOut.map(x => ({ ts: x.ts.toISOString(), type: x.type, name: x.name, amount: x.amount }))
      }
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }))
    a.download = `hammer_v9.0_codex_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
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
  function commandCenterView() {
    const metrics = computePlayerMetrics()
    const me = metrics.find(m => m.isMe)
    const threats = computeThreatRadar()

    let html = '<div class="title">🧠 Command Center</div>'
    html += '<div class="help">Strategic overview updated live.</div>'

    if (!me) {
      html += '<div class="muted">Waiting for player data...</div>'
      return html
    }

    html += '<div class="stat-grid">'
    html += `<div class="stat-card"><div class="stat-label">Troops</div><div class="stat-value">${short(me.troops)}</div><div class="muted mono">Cap ${short(me.troopCap)} (${me.troopFillPct}% full)</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Gold</div><div class="stat-value">${short(me.gold)}</div><div class="muted mono">${short(S.gpm60 || 0)} gpm (60s)</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Territory</div><div class="stat-value">${short(me.territory)}</div><div class="muted mono">Cities ${short(me.cityLevels)}</div></div>`
    const netClass = me.portNet >= 0 ? 'accent' : 'negative'
    html += `<div class="stat-card"><div class="stat-label">Port Net</div><div class="stat-value ${netClass}">${me.portNet >= 0 ? '+' : ''}${short(me.portNet)}</div><div class="muted mono">${short(me.portIncome)} in / ${short(me.portSpent)} out</div></div>`
    html += '</div>'

    const queueCount = S.intentQueueSize || 0
    html += '<div class="box"><div class="title" style="margin-top:0">Automation</div>'
    html += `<div class="row"><div><span class="status-dot ${S.asTroopsRunning ? 'running' : 'stopped'}"></span>Auto Troops</div><div>${S.asTroopsRunning ? 'Running' : 'Stopped'}</div></div>`
    html += `<div class="row"><div><span class="status-dot ${S.asGoldRunning ? 'running' : 'stopped'}"></span>Auto Gold</div><div>${S.asGoldRunning ? 'Running' : 'Stopped'}</div></div>`
    html += `<div class="row"><div>Intent Queue</div><div class="mono">${queueCount}</div></div>`
    if (queueCount > 0) {
      html += '<div class="help">Queue smoothing keeps auto-gold and auto-troops firing together without conflict.</div>'
    } else {
      html += '<div class="help">Queue clear — ready for instant actions.</div>'
    }
    html += '</div>'

    const topThreats = threats.slice(0, 3)
    html += '<div class="box"><div class="title" style="margin-top:0">Threat Snapshot</div>'
    if (!topThreats.length) {
      html += '<div class="muted">No major threats flagged. Maintain scouting.</div>'
    } else {
      for (const t of topThreats) {
        const severityColor = t.severity === 'Critical' ? '#ff5a5a' : (t.severity === 'High' ? '#ff9f5d' : '#7bb8ff')
        html += `<div class="row" style="align-items:flex-start;gap:12px;">`
        html += `<div style="flex:1"><div style="font-weight:700">${esc(t.name)}</div><div class="muted mono">Score ${t.threatScore.toFixed(2)}</div></div>`
        html += `<div><span class="badge" style="border:1px solid ${severityColor};color:${severityColor}">${t.severity}</span></div>`
        html += '</div>'
      }
      html += '<div class="help">Open the Threat Radar tab for a full breakdown.</div>'
    }
    html += '</div>'

    // Weak Player Identification - find easy targets
    const weakPlayers = lastPlayers
      .filter(p => p.id !== mySmallID && !asIsAlly(p.id) && p.isAlive !== false)
      .map(p => {
        const troops = (p.troops || 0) / 10 // Fix: game sends troops * 10
        const tiles = p.tilesOwned || 0
        const production = tiles * 250 // estimate base production
        const weakness = (100000 - troops) + (500 - tiles) * 1000 // higher = weaker
        return { name: p.displayName || p.name, troops, tiles, production, weakness, id: p.id, isAlive: p.isAlive }
      })
      .sort((a, b) => b.weakness - a.weakness)
      .slice(0, 5)

    html += '<div class="box"><div class="title" style="margin-top:0">🎯 Weak Targets</div>'
    html += '<div class="help">Easy targets for expansion (low troops, low production)</div>'
    if (!weakPlayers.length) {
      html += '<div class="muted">No targets identified yet.</div>'
    } else {
      for (const target of weakPlayers) {
        html += `<div class="row" style="background:#0d1520;padding:6px;border-radius:4px;margin:4px 0">`
        html += `<div style="flex:1;font-weight:700">${esc(target.name)}</div>`
        html += `<div class="mono" style="color:#7bb8ff">${short(target.troops)} 🪖</div>`
        html += `<div class="mono muted">${target.tiles} tiles</div>`
        html += '</div>'
      }
      html += '<div class="help">Target these players for quick territorial gains with minimal resistance.</div>'
    }
    html += '</div>'

    return html
  }

  function threatRadarView() {
    const threats = computeThreatRadar()
    let html = '<div class="title">⚠️ Threat Radar</div>'
    html += '<div class="help">Blends power, economy, territory, and troop ratios to flag emerging threats.</div>'

    if (!threats.length) {
      html += '<div class="muted">No threats detected. Stay vigilant.</div>'
      return html
    }

    html += '<div class="threat-grid">'
    for (const t of threats) {
      const severityClass = `severity-${t.severity.toLowerCase()}`
      const battle = t.battle || { verdict: 'Unknown', ratio: 1, note: 'No intel', diff: 0 }
      const ratioTxt = Number.isFinite(battle.ratio) ? battle.ratio.toFixed(2) : '∞'
      html += `<div class="threat-card ${severityClass}">`
      html += `<div class="header"><span>${esc(t.name)}</span><span>${t.severity}</span></div>`
      html += `<div class="muted mono">Threat score ${t.threatScore.toFixed(2)}</div>`
      html += '<div class="list-compact">'
      for (const reason of t.reasons.slice(0, 4)) {
        html += `<div>• ${esc(reason)}</div>`
      }
      html += '</div>'
      html += `<div class="muted mono">Troops ${short(t.troops)} • Gold ${short(t.gold)} • Territory ${short(t.territory)}</div>`
      html += `<div class="muted mono">Port net ${t.portNet >= 0 ? '+' : ''}${short(t.portNet)}</div>`
      html += `<div class="mono">Battle: ${battle.verdict} (x${ratioTxt})</div>`
      html += '</div>'
    }
    html += '</div>'

    return html
  }

  function powerRankingsView() {
    const rankings = computePowerRankings()
    let html = '<div class="title">🏆 Power Rankings</div>'
    html += '<div class="help">Power score weighs troops, gold, territory, city levels, and port net income.</div>'

    if (!rankings.length) {
      html += '<div class="muted">No players tracked yet.</div>'
      return html
    }

    html += '<div class="box">'
    html += '<div class="list-compact">'
    rankings.slice(0, 15).forEach((p, idx) => {
      const rank = (idx + 1).toString().padStart(2, '0')
      const name = esc(p.name)
      const nameHtml = p.isMe ? `<span class="accent">${name}</span>` : name
      const teamTag = p.team != null ? `<span class="muted"> [${p.team}]</span>` : ''
      html += `<div class="row" style="align-items:flex-start;gap:8px;">`
      html += `<div class="mono" style="width:28px">${rank}.</div>`
      html += `<div style="flex:1"><div>${nameHtml}${teamTag}</div>`
      html += `<div class="muted mono">Power ${short(p.powerScore)} • Troops ${short(p.troops)} • Gold ${short(p.gold)}</div>`
      html += `<div class="muted mono">Territory ${short(p.territory)} • Port net ${p.portNet >= 0 ? '+' : ''}${short(p.portNet)}</div></div>`
      html += '</div>'
    })
    html += '</div>'
    html += '</div>'

    return html
  }

  function weakTargetsView() {
    let html = '<div class="title">🎯 Weak Target Identification</div>'
    html += '<div class="help">Prime targets for efficient territorial expansion</div>'

    const weakPlayers = lastPlayers
      .filter(p => p.id !== mySmallID && !asIsAlly(p.id) && p.isAlive !== false)
      .map(p => {
        const troops = (p.troops || 0) / 10 // Fix: game sends troops * 10
        const tiles = p.tilesOwned || 0
        const gold = p.gold || 0
        const production = tiles * 250 // estimate base production
        const weakness = (100000 - troops) + (500 - tiles) * 1000 // higher = weaker
        return {
          name: p.displayName || p.name,
          troops,
          tiles,
          gold,
          production,
          weakness,
          id: p.id,
          isAlive: p.isAlive,
          team: p.team
        }
      })
      .sort((a, b) => b.weakness - a.weakness)
      .slice(0, 20)

    if (!weakPlayers.length) {
      html += '<div class="muted">No targets identified yet.</div>'
      return html
    }

    html += '<div class="box"><div class="title" style="margin-top:0">🥇 Top 20 Weakest Players</div>'
    html += '<div class="help">Ranked by low troop count + low territory. Perfect for quick wins.</div>'

    weakPlayers.forEach((target, idx) => {
      const rank = (idx + 1).toString().padStart(2, '0')
      const teamTag = target.team != null ? `<span class="muted"> [Team ${target.team}]</span>` : ''
      const troopStrength = target.troops < 10000 ? '🟢 Very Weak' : target.troops < 30000 ? '🟡 Weak' : '🟠 Moderate'

      html += `<div class="box" style="margin:4px 0">`
      html += `<div class="row" style="align-items:flex-start;gap:8px">`
      html += `<div class="mono" style="width:28px;color:#ffcf5d">${rank}.</div>`
      html += `<div style="flex:1">`
      html += `<div style="font-weight:700">${esc(target.name)}${teamTag}</div>`
      html += `<div class="row muted" style="font-size:10px;margin-top:4px">`
      html += `<div>Troops</div><div class="mono" style="color:#7bb8ff">${short(target.troops)} 🪖</div>`
      html += `</div>`
      html += `<div class="row muted" style="font-size:10px">`
      html += `<div>Territory</div><div class="mono">${target.tiles} tiles</div>`
      html += `</div>`
      html += `<div class="row muted" style="font-size:10px">`
      html += `<div>Gold</div><div class="mono" style="color:#ffcf5d">${short(target.gold)} 💰</div>`
      html += `</div>`
      html += `<div class="help" style="margin-top:4px">${troopStrength}</div>`
      html += `</div>`
      html += `</div>`
      html += `</div>`
    })
    html += '</div>'

    html += '<div class="box"><div class="title" style="margin-top:0">💡 Attack Strategy</div>'
    html += '<div class="recommendation">🎯 Focus on green "Very Weak" targets for fastest gains with minimal losses</div>'
    html += '<div class="recommendation">⚡ Strike when your troop capacity is 70%+ for maximum effectiveness</div>'
    html += '<div class="recommendation">🛡️ Defend your gains - weak players are easy to capture but also easy to lose</div>'
    html += '</div>'

    return html
  }

  function summaryView() {
    const me = readMyPlayer()

    let html = '<div class="title">📊 Summary - Session Overview</div>'
    html += `<div class="help">Tracking donations for this session (${fmtDuration(Date.now() - sessionStartTime)})</div>`

    const inKeys = [...S.inbound.keys()].filter(isTagMate)
    const outKeys = [...S.outbound.keys()].filter(isTagMate)

    let totalInGold = 0, totalInTroops = 0, totalInPort = 0
    let totalOutGold = 0, totalOutTroops = 0, totalOutPort = 0

    for (const k of inKeys) {
      const r = S.inbound.get(k)
      totalInGold += r.gold
      totalInTroops += r.troops
    }

    for (const item of S.feedIn) {
      if (item.isPort && item.type === 'gold') totalInPort += item.amount
    }

    for (const item of S.feedOut) {
      if (item.isPort && item.type === 'gold') totalOutPort += item.amount
    }

    for (const k of outKeys) {
      const r = S.outbound.get(k)
      totalOutGold += r.gold
      totalOutTroops += r.troops
    }

    const portNet = totalInPort - totalOutPort

    html += '<div class="stat-grid">'
    html += `<div class="stat-card"><div class="stat-label">Received</div><div class="stat-value">${short(totalInGold)} 💰 | ${short(totalInTroops)} 🪖</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Sent</div><div class="stat-value">${short(totalOutGold)} 💰 | ${short(totalOutTroops)} 🪖</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Port Received</div><div class="stat-value">${short(totalInPort)} 💰</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Port Sent</div><div class="stat-value">${short(totalOutPort)} 💰</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Port Net</div><div class="stat-value ${portNet >= 0 ? 'accent' : 'negative'}">${portNet >= 0 ? '+' : ''}${short(portNet)} 💰</div></div>`
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

    // Debug panel
    html += '<div class="box" style="margin-top:12px"><div class="title" style="margin-top:0">🔍 Debug Info</div>'
    html += `<div class="row"><div>mySmallID</div><div class="mono">${mySmallID || 'null'}</div></div>`
    html += `<div class="row"><div>Tag filter</div><div class="mono">${S.filterTagMates ? `[${S.myTag}]` : 'OFF'}</div></div>`
    html += `<div class="row"><div>Total inbound</div><div class="mono">${S.inbound.size} players (${inKeys.length} shown)</div></div>`
    html += `<div class="row"><div>Total outbound</div><div class="mono">${S.outbound.size} players (${outKeys.length} shown)</div></div>`
    html += `<div class="row"><div>Feed In</div><div class="mono">${S.feedIn.length} events</div></div>`
    html += `<div class="row"><div>Feed Out</div><div class="mono">${S.feedOut.length} events</div></div>`
    html += '<div class="help">If you\'ve sent/received troops/gold but see "No data", check:</div>'
    html += '<div class="help">1. Is mySmallID correct? (Should match your player ID)</div>'
    html += '<div class="help">2. Is tag filter blocking data? Try turning OFF tag filter</div>'
    html += '<div class="help">3. Check Stats tab Debug Info for raw message count</div>'
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
      const actualTroops = (me.troops || 0) / 10 // Fix: game sends troops * 10
      const maxT = estimateMaxTroops(me.tilesOwned, me.smallID)
      const troopPct = maxT > 0 ? Math.round((actualTroops / maxT) * 100) : 0
      html += `<div class="row"><div>Player</div><div class="mono">${esc(me.displayName || me.name || 'Unknown')}</div></div>`
      html += `<div class="row"><div>Troops</div><div class="mono">${short(actualTroops)} / ${short(maxT)} (${troopPct}%)</div></div>`
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

    const metrics = computePlayerMetrics()
    const meMetrics = metrics.find(m => m.isMe)
    const rankings = computePowerRankings()
    const myRankIdx = rankings.findIndex(r => r.isMe)
    const threats = computeThreatRadar()
    const topThreat = threats[0]

    if (meMetrics) {
      html += '<div class="box"><div class="title" style="margin-top:0">📊 Strategic Metrics</div>'
      html += '<div class="stat-grid">'
      html += `<div class="stat-card"><div class="stat-label">Power Score</div><div class="stat-value">${short(meMetrics.powerScore)}</div><div class="muted mono">Rank ${myRankIdx >= 0 ? myRankIdx + 1 : '—'} / ${rankings.length}</div></div>`
      html += `<div class="stat-card"><div class="stat-label">Economy</div><div class="stat-value">${short(meMetrics.economyScore)}</div><div class="muted mono">Gold ${short(meMetrics.gold)} • Net ${meMetrics.portNet >= 0 ? '+' : ''}${short(meMetrics.portNet)}</div></div>`
      if (topThreat) {
        html += `<div class="stat-card"><div class="stat-label">Top Threat</div><div class="stat-value">${esc(topThreat.name)}</div><div class="muted mono">${topThreat.severity} • ${topThreat.threatScore.toFixed(2)}</div></div>`
      }
      const advice = buildAdviceForPlayer(meMetrics)
      if (advice.length) {
        html += `<div class="stat-card"><div class="stat-label">Build Advice</div><div class="muted">${esc(advice.slice(0, 2).join(' · '))}</div></div>`
      }
      html += '</div>'
      html += '</div>'
    }

    // Debug panel to help diagnose donation tracking
    html += '<div class="box"><div class="title" style="margin-top:0">🔍 Debug Info</div>'
    html += `<div class="row"><div>mySmallID</div><div class="mono">${mySmallID || 'null'}</div></div>`
    html += `<div class="row"><div>Inbound tracked</div><div class="mono">${S.inbound.size} players</div></div>`
    html += `<div class="row"><div>Outbound tracked</div><div class="mono">${S.outbound.size} players</div></div>`
    html += `<div class="row"><div>Feed In</div><div class="mono">${S.feedIn.length} events</div></div>`
    html += `<div class="row"><div>Feed Out</div><div class="mono">${S.feedOut.length} events</div></div>`
    html += `<div class="row"><div>Raw Messages</div><div class="mono">${S.rawMessages.length} total</div></div>`
    html += `<div class="row"><div>Paused</div><div class="mono">${S.paused ? 'YES' : 'NO'}</div></div>`
    if (S.rawMessages.length > 0) {
      const lastMsg = S.rawMessages[S.rawMessages.length - 1]
      html += `<div class="help">Last message: Type ${lastMsg.messageType}, PID ${lastMsg.playerID || 'none'}</div>`
      html += `<div class="help" style="font-size:10px;word-break:break-word">${esc(lastMsg.message || 'no text')}</div>`
    }
    html += '</div>'

    return html
  }

  function aiInsightsView() {
    const metrics = computePlayerMetrics()
    const meMetrics = metrics.find(m => m.isMe)
    const threats = computeThreatRadar()
    const teammates = getTeammates()
    const queueCount = S.intentQueueSize || 0

    let html = '<div class="title">⚔️ Battle Insights</div>'
    html += '<div class="help">AI-driven recommendations with tooltips for deeper context.</div>'

    let inboundGold = 0, inboundTroops = 0, outboundGold = 0, outboundTroops = 0
    S.inbound.forEach(r => { inboundGold += r.gold; inboundTroops += r.troops })
    S.outbound.forEach(r => { outboundGold += r.gold; outboundTroops += r.troops })
    const totalVolume = inboundGold + inboundTroops + outboundGold + outboundTroops
    const networkSize = new Set([...S.inbound.keys(), ...S.outbound.keys()]).size

    const networkType = inboundGold + inboundTroops > (outboundGold + outboundTroops) * 2 ? 'Receiver Hub'
      : (outboundGold + outboundTroops) > (inboundGold + inboundTroops) * 2 ? 'Feeder Hub'
      : 'Balanced Node'

    html += '<div class="box"><div class="title" style="margin-top:0">🕸️ Network Analysis</div>'
    html += `<div class="row"><div>Network Size</div><div class="mono">${networkSize} players</div></div>`
    html += `<div class="row"><div>Total Volume</div><div class="mono">${short(totalVolume)}</div></div>`
    html += `<div class="row"><div>Inbound / Outbound</div><div class="mono">${short(inboundGold + inboundTroops)} ↔ ${short(outboundGold + outboundTroops)}</div></div>`
    html += `<div class="row"><div>Network Role</div><div class="mono" style="color:#7ff2a3">${networkType}</div></div>`
    html += '</div>'

    const insights = []
    const addInsight = (tone, icon, message, tip) => {
      insights.push({ tone, icon, message, tip })
    }

    const rankings = computePowerRankings()
    const myRankIdx = rankings.findIndex(r => r.isMe)
    const topThreat = threats[0]

    if (meMetrics) {
      const troopPct = meMetrics.troopFillPct
      if (troopPct >= 85) addInsight('warning', '🧨', 'Troops near capacity — schedule a drop or donation.', 'Auto Troops or a manual attack will prevent waste above 85% capacity.')
      if (troopPct <= 30) addInsight('recommendation', '🪖', 'Troop reserves low — rebuild before pushing.', 'Reinforce with troop production or allied support to avoid being caught weak.')
      if (meMetrics.gold > 500000) addInsight('recommendation', '💰', 'War chest ready — invest in cities, SAMs, or airports.', 'Large gold surplus is ideal for infrastructure; the new build advice tab prioritises options.')
      if (meMetrics.portNet < 0) addInsight('warning', '🏪', 'Ports draining gold — renegotiate or pause trades.', 'You are sending more gold through ports than you receive. Consider rotating partners.')
      if (!S.asTroopsRunning && troopPct >= 60) addInsight('recommendation', '🤖', 'Enable Auto Troops to relieve cap pressure.', 'Automation now uses a unified queue so it can run safely with auto-gold.')
      if (!S.asGoldRunning && meMetrics.gold > 300000 && outboundGold === 0) addInsight('recommendation', '🚚', 'Auto-gold idle while surplus grows.', 'Turn on Auto Gold to stream excess cash to frontline allies.')
      if (queueCount > 3) addInsight('warning', '🛣️', 'Intent queue backing up — stagger automation targets.', 'Multiple sends are waiting; consider reducing simultaneous targets or raising cooldowns.')
      if (myRankIdx >= 0 && myRankIdx >= 3) addInsight('recommendation', '📉', `Power rank ${myRankIdx + 1} — push economy to climb.`, 'Power score balances troops, gold, territory, and trade net. Capture more ground or invest gold.')
      if ((S.gpm60 || 0) > (S.gpm120 || 1) * 1.2) addInsight('recommendation', '📈', 'Income surge detected — queue builds while momentum lasts.', 'Gold per minute over the last minute exceeds your 2-minute trend by 20%+.')
      if (topThreat && (topThreat.severity === 'Critical' || topThreat.severity === 'High')) {
        addInsight('warning', '⚠️', `${topThreat.name} is ${topThreat.severity.toLowerCase()} priority.`, `Threat score ${topThreat.threatScore.toFixed(2)} with ${short(topThreat.troops)} troops and ${short(topThreat.gold)} gold.`)
      }

      const lowTeammate = teammates.find(t => {
        const tiles = Math.max(t.tilesOwned || 0, tileCountByOwner.get(t.smallID) || 0)
        const cap = estimateMaxTroops(tiles, t.smallID)
        const actualTroops = (t.troops || 0) / 10 // Fix: game sends troops * 10
        return cap > 0 && (actualTroops / cap) * 100 < 35
      })
      if (lowTeammate) {
        const name = lowTeammate.displayName || lowTeammate.name || 'Teammate'
        addInsight('recommendation', '🤝', `${name} needs troop support soon.`, 'A teammate has fallen below 35% troop capacity — consider sending reinforcements.')
      }
    } else {
      addInsight('recommendation', '🛰️', 'Still gathering personal stats.', 'Once player data loads, AI will tailor recommendations to your position.')
    }

    if (networkType === 'Receiver Hub') addInsight('recommendation', '🎯', 'Allies are investing heavily in you — stay defended.', 'High inbound flow means you are the focal point. Keep SAM coverage active.')
    if (networkType === 'Feeder Hub') addInsight('recommendation', '📦', 'You are fueling the team — monitor reserves closely.', 'Significant outbound donations detected; pace yourself so you do not stall.')

    const efficiency = outboundGold + outboundTroops > 0 ? (inboundGold + inboundTroops) / (outboundGold + outboundTroops) : 0
    if (efficiency && efficiency < 0.75) addInsight('warning', '⚖️', 'Donation efficiency low — request backline support.', `Inbound vs outbound ratio is ${efficiency.toFixed(2)}x; consider requesting relief.`)
    if (efficiency > 1.5) addInsight('recommendation', '📦', 'Strong return on support — keep allies supplied.', `Inbound vs outbound ratio is ${efficiency.toFixed(2)}x in your favor.`)

    const fillerPool = [
      ['recommendation', '🧭', 'Review Command Center for the latest snapshot.', 'The Command tab fuses automation and threat intel in one place.'],
      ['recommendation', '🛡️', 'Confirm SAM overlay alignment from Overlays tab.', 'SAM radius now uses precision transforms — verify coverage after moving defenses.'],
      ['recommendation', '⚒️', 'Use Gold Rate advice to spend efficiently.', 'Build suggestions adapt to your current income curve.'],
      ['recommendation', '🎯', 'Target weak players for efficient expansion.', 'Focus on opponents with fewer troops and lower production for quick gains.']
    ]
    while (insights.length < 8 && fillerPool.length) {
      const [tone, icon, message, tip] = fillerPool.shift()
      addInsight(tone, icon, message, tip)
    }

    html += '<div class="box"><div class="title" style="margin-top:0">🧠 Intelligent Recommendations</div>'
    if (!insights.length) {
      html += '<div class="muted">No alerts right now. Keep executing the plan.</div>'
    } else {
      insights.forEach(ins => {
        const cls = ins.tone === 'warning' ? 'warning' : 'recommendation'
        html += `<div class="${cls}" title="${esc(ins.tip)}">${ins.icon} ${esc(ins.message)}</div>`
      })
    }
    html += '</div>'

    return html
  }

  function portsView() {
    let html = '<div class="title">🏪 Port Trades & Insights</div>'
    html += '<div class="help">Bidirectional tracking showing both income and contributions.</div>'

    const keys = [...S.ports.keys()].filter(isTagMate)
    if (!keys.length) {
      return html + '<div class="muted">No port trades detected yet.</div>'
    }

    const rows = keys.map(k => {
      const player = playersById.get(k)
      const name = player ? (player.displayName || player.name || k) : k
      const rec = S.ports.get(k) || {}
      return {
        id: k,
        name,
        received: rec.received || 0,
        sent: rec.sent || 0,
        net: rec.net || 0,
        inboundGpm: rec.inboundGpm || 0,
        outboundGpm: rec.outboundGpm || 0,
        inboundAvgSec: rec.inboundAvgSec || 0,
        outboundAvgSec: rec.outboundAvgSec || 0
      }
    }).sort((a, b) => b.received - a.received)

    const totalReceived = rows.reduce((sum, r) => sum + r.received, 0)
    const totalSent = rows.reduce((sum, r) => sum + r.sent, 0)
    const netTotal = totalReceived - totalSent
    const bestInbound = rows.reduce((best, r) => (best == null || r.received > best.received) ? r : best, null)
    const bestNet = rows.reduce((best, r) => (best == null || r.net > best.net) ? r : best, null)
    const biggestDrain = rows.reduce((worst, r) => (worst == null || r.net < worst.net) ? r : worst, null)

    html += '<div class="box"><div class="title" style="margin-top:0">📊 Port Statistics</div>'
    html += `<div class="row"><div>Partners</div><div class="mono">${rows.length}</div></div>`
    html += `<div class="row"><div>Total Income</div><div class="mono">${short(totalReceived)} 💰</div></div>`
    html += `<div class="row"><div>Total Sent</div><div class="mono">${short(totalSent)} 💰</div></div>`
    html += `<div class="row"><div>Net Flow</div><div class="mono ${netTotal >= 0 ? 'accent' : 'negative'}">${netTotal >= 0 ? '+' : ''}${short(netTotal)} 💰</div></div>`
    if (bestInbound) html += `<div class="help">Top income: <b>${esc(bestInbound.name)}</b> (${short(bestInbound.received)} 💰 in)</div>`
    if (bestNet) html += `<div class="help">Best net: <b>${esc(bestNet.name)}</b> (${bestNet.net >= 0 ? '+' : ''}${short(bestNet.net)} 💰)</div>`
    if (biggestDrain && (!bestNet || biggestDrain.id !== bestNet.id)) html += `<div class="help">Biggest drain: <b>${esc(biggestDrain.name)}</b> (${short(biggestDrain.sent)} out)</div>`
    html += '</div>'

    html += '<div class="title">Port Details</div>'
    for (const row of rows.slice(0, 50)) {
      const netClass = row.net >= 0 ? 'accent' : 'negative'
      html += '<div class="box">'
      html += `<div class="row"><div style="font-weight:700">${esc(row.name)}</div><div class="mono ${netClass}">${row.net >= 0 ? '+' : ''}${short(row.net)} 💰</div></div>`
      html += `<div class="row muted" style="font-size:11px"><div>Received</div><div class="mono">${short(row.received)} 💰 (${short(row.inboundGpm)} gpm)</div></div>`
      html += `<div class="row muted" style="font-size:11px"><div>Sent</div><div class="mono">${short(row.sent)} 💰 (${short(row.outboundGpm)} gpm)</div></div>`
      if (row.inboundAvgSec) html += `<div class="row muted" style="font-size:11px"><div>Inbound cadence</div><div class="mono">${row.inboundAvgSec}s avg</div></div>`
      if (row.outboundAvgSec) html += `<div class="row muted" style="font-size:11px"><div>Outbound cadence</div><div class="mono">${row.outboundAvgSec}s avg</div></div>`
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
    const metrics = computePlayerMetrics()
    const meMetrics = metrics.find(m => m.isMe)

    let html = '<div class="title">💰 Gold Rate Intelligence</div>'
    html += '<div class="help">Real-time income tracking with predictive analysis</div>'

    if (!me) {
      return html + '<div class="muted">Player data not available</div>'
    }

    const currentGold = me.gold || 0
    const gps30 = S.gps30 || 0
    const gpm60 = S.gpm60 || 0
    const gpm120 = S.gpm120 || 0

    html += '<div class="stat-grid">'
    html += `<div class="stat-card"><div class="stat-label">Current Gold</div><div class="stat-value" style="color:#ffcf5d">${short(currentGold)}</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Gold/Sec (30s)</div><div class="stat-value" style="color:#7ff2a3">${gps30.toFixed(2)}</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Gold/Min (60s)</div><div class="stat-value" style="color:#7ff2a3">${short(gpm60)}</div></div>`
    html += `<div class="stat-card"><div class="stat-label">Gold/Min (120s)</div><div class="stat-value" style="color:#7bb8ff">${short(gpm120)}</div></div>`
    html += '</div>'

    // Income trend analysis
    const trendDiff = gpm60 - gpm120
    const trendPct = gpm120 > 0 ? ((trendDiff / gpm120) * 100) : 0
    let trendStatus = 'Stable'
    let trendColor = '#7bb8ff'
    let trendIcon = '➡️'
    if (trendPct > 15) {
      trendStatus = 'Surging'
      trendColor = '#7ff2a3'
      trendIcon = '📈'
    } else if (trendPct < -15) {
      trendStatus = 'Declining'
      trendColor = '#ff8b94'
      trendIcon = '📉'
    }

    html += '<div class="box"><div class="title" style="margin-top:0">📊 Income Trend Analysis</div>'
    html += `<div class="row"><div>Status</div><div class="mono" style="color:${trendColor}">${trendIcon} ${trendStatus}</div></div>`
    html += `<div class="row"><div>Trend</div><div class="mono">${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(1)}% vs 2min avg</div></div>`

    // Predictions
    if (gpm60 > 0) {
      const minutesToTarget = [50000, 100000, 200000, 500000]
      html += '<div style="margin-top:8px"><div class="help">⏱️ Time to reach milestones (at current 60s rate):</div>'
      for (const target of minutesToTarget) {
        if (currentGold < target) {
          const goldNeeded = target - currentGold
          const minutesNeeded = goldNeeded / gpm60
          const secondsNeeded = Math.round(minutesNeeded * 60)
          html += `<div class="row muted" style="font-size:10px"><div>${short(target)} gold</div><div class="mono">${fmtSec(secondsNeeded)}</div></div>`
        }
      }
      html += '</div>'
    }
    html += '</div>'

    // Port impact
    if (meMetrics && (meMetrics.portIncome > 0 || meMetrics.portSpent > 0)) {
      const portGpm = meMetrics.portIncome > 0 ? Math.round(meMetrics.portIncome / ((Date.now() - sessionStartTime) / 60000)) : 0
      html += '<div class="box"><div class="title" style="margin-top:0">🏪 Port Impact</div>'
      html += `<div class="row"><div>Port Income</div><div class="mono" style="color:#7ff2a3">${short(meMetrics.portIncome)}</div></div>`
      html += `<div class="row"><div>Port Spending</div><div class="mono" style="color:#ff9f5d">${short(meMetrics.portSpent)}</div></div>`
      html += `<div class="row"><div>Port GPM (Est)</div><div class="mono">${short(portGpm)}</div></div>`
      const portPct = gpm60 > 0 ? Math.round((portGpm / gpm60) * 100) : 0
      html += `<div class="help">Ports contribute ~${portPct}% of your current income</div>`
      html += '</div>'
    }

    if (meMetrics) {
      const advice = buildAdviceForPlayer(meMetrics)
      html += '<div class="box"><div class="title" style="margin-top:0">🛠 Smart Spending Advice</div>'
      if (!advice.length) {
        html += '<div class="muted">No specific recommendations — keep expanding steadily.</div>'
      } else {
        advice.slice(0, 5).forEach(line => {
          html += `<div class="recommendation">💡 ${esc(line)}</div>`
        })
      }
      html += '</div>'
    }

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
        const actualTroops = (p.troops || 0) / 10 // Fix: game sends troops * 10
        const maxT = estimateMaxTroops(p.tilesOwned, p.smallID)
        const troopPct = maxT > 0 ? Math.round((actualTroops / maxT) * 100) : 0
        html += `<div class="box" style="margin:4px 0">`
        html += `<div class="row"><div style="font-weight:700">${esc(p.displayName || p.name || 'Unknown')}</div><div class="mono">${troopPct}%</div></div>`
        html += `<div class="row muted" style="font-size:10px"><div>Troops</div><div class="mono">${short(actualTroops)} / ${short(maxT)}</div></div>`
        html += '</div>'
      }
    }
    html += '</div>'

    const allies = getAllies()
    html += '<div class="box"><div class="title" style="margin-top:0">🤝 Allies</div>'
    html += '<div class="help">⚠️ Monitor alliance timers - they expire and need renewal!</div>'
    if (!allies.length) {
      html += '<div class="muted">No active alliances</div>'
    } else {
      for (const p of allies.slice(0, 20)) {
        const actualTroops = (p.troops || 0) / 10 // Fix: game sends troops * 10
        const maxT = estimateMaxTroops(p.tilesOwned, p.smallID)
        const troopPct = maxT > 0 ? Math.round((actualTroops / maxT) * 100) : 0
        html += `<div class="box" style="margin:4px 0">`
        html += `<div class="row"><div style="font-weight:700">${esc(p.displayName || p.name || 'Unknown')}</div><div class="mono">${troopPct}%</div></div>`
        html += `<div class="row muted" style="font-size:10px"><div>Troops</div><div class="mono">${short(actualTroops)} / ${short(maxT)}</div></div>`
        html += '<div class="help" style="color:#ffcf5d;font-size:10px">⏱️ Check in-game for expiry time</div>'
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
          const actualTroops = (p.troops || 0) / 10 // Fix: game sends troops * 10
          const maxT = estimateMaxTroops(p.tilesOwned, p.smallID)
          const troopPct = maxT > 0 ? Math.round((actualTroops / maxT) * 100) : 0
          html += `<div class="box" style="margin:4px 0">`
          html += `<div class="row"><div style="font-weight:700">${esc(p.displayName || p.name || 'Unknown')}</div><div class="mono">${troopPct}%</div></div>`
          html += `<div class="row muted" style="font-size:10px"><div>Troops</div><div class="mono">${short(actualTroops)} / ${short(maxT)}</div></div>`
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
    const currentTroops = (me.troops || 0) / 10 // Fix: game sends troops * 10
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
    html += `<div class="row"><div>Cooldown</div><div style="display:flex;align-items:center;gap:6px"><input id="at-cooldown" type="number" value="${S.asTroopsCooldownSec}" min="10" max="60" step="1" style="width:80px"><div class="muted">${S.asTroopsCooldownSec}s (minimum 10s)</div></div></div>`
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
        html += '<div id="at-target-list" style="max-height:300px;overflow-y:auto">'
        for (const p of allTargets) {
          const name = p.displayName || p.name || 'Unknown'
          const isSelected = S.asTroopsTargets.includes(name)
          html += `<div class="box" style="margin:4px 0;cursor:pointer" data-toggle-troop-target="${esc(name)}" data-player-id="${p.id}">`
          html += `<div style="font-weight:${isSelected ? '700' : '400'};color:${isSelected ? '#7ff2a3' : 'inherit'}">${isSelected ? '✓ ' : ''}${esc(name)}</div>`
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
    html += '</div>'

    // Activity Log (static - no live countdowns to prevent scroll bounce)
    if (S.asTroopsLog.length > 0) {
      html += '<div class="box">'
      html += '<div class="title" style="margin-top:0">📋 Recent Activity</div>'
      html += '<div class="help">Last 10 sends:</div>'
      const recentLogs = S.asTroopsLog.slice(-10).reverse()
      html += '<div style="font-size:10px">'
      for (const entry of recentLogs) {
        html += `<div style="margin:2px 0;padding:4px;background:#0d1520;border-radius:4px;color:#9bb0c8">${esc(entry)}</div>`
      }
      html += '</div>'
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
      const willSend = me.gold >= S.asGoldThreshold

      html += '<div class="preview-calc">'
      html += `<div style="font-size:16px;margin-bottom:8px"><b>LIVE PREVIEW</b></div>`
      html += `<div>You have: <b>${short(me.gold)}</b> gold</div>`
      if (willSend) {
        html += `<div style="color:#7ff2a3;font-size:15px;margin-top:8px">✅ Will send: <b>${short(S.asGoldAmount)}</b> gold</div>`
        html += `<div>You keep: <b>${short(me.gold - S.asGoldAmount)}</b> gold</div>`
      } else {
        html += `<div style="color:#ff8b94;margin-top:8px">❌ Below threshold (need ${short(S.asGoldThreshold)}, have ${short(me.gold)})</div>`
      }
      html += '</div>'
    }

    html += '<div class="box">'
    html += '<div class="title" style="margin-top:0">⚙️ Settings</div>'
    html += `<div class="row"><div>Amount</div><input id="ag-amount" type="number" value="${S.asGoldAmount}" min="1000" step="1000" style="width:120px"></div>`
    html += `<div class="row"><div>Threshold</div><input id="ag-threshold" type="number" value="${S.asGoldThreshold}" min="0" step="1000" style="width:120px"></div>`
    html += `<div class="row"><div>Cooldown</div><div style="display:flex;align-items:center;gap:6px"><input id="ag-cooldown" type="number" value="${S.asGoldCooldownSec}" min="10" max="60" step="1" style="width:80px"><div class="muted">${S.asGoldCooldownSec}s (minimum 10s)</div></div></div>`
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
        html += '<div id="ag-target-list" style="max-height:300px;overflow-y:auto">'
        for (const p of allTargets) {
          const name = p.displayName || p.name || 'Unknown'
          const isSelected = S.asGoldTargets.includes(name)
          html += `<div class="box" style="margin:4px 0;cursor:pointer" data-toggle-gold-target="${esc(name)}" data-player-id="${p.id}">`
          html += '<div class="row">'
          html += `<div style="font-weight:${isSelected ? '700' : '400'};color:${isSelected ? '#7ff2a3' : 'inherit'}">${isSelected ? '✓ ' : ''}${esc(name)}</div>`
          html += `<div class="mono" style="color:#ffcf5d" data-gold-num="${p.id}">${short(p.gold || 0)} 💰</div>`
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
    html += '</div>'

    // Activity Log (performance fix: removed live countdown to prevent lag)
    if (S.asGoldLog.length > 0) {
      html += '<div class="box">'
      html += '<div class="title" style="margin-top:0">📋 Recent Activity</div>'
      html += '<div class="help">Last 10 sends:</div>'
      const recentLogs = S.asGoldLog.slice(-10).reverse()
      html += '<div style="font-size:10px">'
      for (const entry of recentLogs) {
        html += `<div style="margin:2px 0;padding:4px;background:#0d1520;border-radius:4px;color:#9bb0c8">${esc(entry)}</div>`
      }
      html += '</div>'
      html += '</div>'
    }

    return html
  }

  function overlaysView() {
    let html = '<div class="title">🎨 Map Overlays</div>'
    html += '<div class="help">Visual overlays on game map</div>'

    html += '<div class="box">'
    html += `<div class="row"><div>SAM Overlay</div><button id="ov-sam">${S.samOverlayEnabled ? 'ON' : 'OFF'}</button><span class="hotkey">CTRL+SHIFT+F</span></div>`
    html += '<div class="help">Shows SAM launcher ranges (70 tiles) - FIXED positioning</div>'
    html += '</div>'

    html += '<div class="box">'
    html += `<div class="row"><div>Atom Bomb Overlay</div><button id="ov-atom">${S.atomOverlayEnabled ? 'ON' : 'OFF'}</button><span class="hotkey">ALT+A</span></div>`
    html += '<div class="help">Shows atom bomb radius (12/30 tiles)</div>'
    html += '</div>'

    html += '<div class="box">'
    html += `<div class="row"><div>Hydrogen Bomb Overlay</div><button id="ov-hydrogen">${S.hydrogenOverlayEnabled ? 'ON' : 'OFF'}</button><span class="hotkey">ALT+H</span></div>`
    html += '<div class="help">Shows hydrogen bomb radius (80/100 tiles)</div>'
    html += '</div>'

    return html
  }

  function embargoView() {
    let html = '<div class="title">🚫 Embargo Manager</div>'
    html += '<div class="help">Control port trade access on your territory</div>'

    html += '<div class="box">'
    html += '<div class="warning">⚠️ WARNING: Bulk actions affect ALL players!</div>'
    html += '<div class="row" style="margin-top:12px">'
    html += '<button id="emb-all">Embargo All</button>'
    html += '<button id="unemb-all">Un-embargo All</button>'
    html += '<span class="hotkey">ALT+E</span>'
    html += '</div>'
    html += '</div>'

    html += '<div class="box"><div class="title" style="margin-top:0">📋 Player List</div>'
    html += '<div class="help">All active players in the game</div>'

    const allPlayers = lastPlayers
      .filter(p => p.isAlive !== false)
      .sort((a, b) => {
        // Sort by: allies first, then teammates, then enemies
        const aIsAlly = asIsAlly(p.id)
        const bIsAlly = asIsAlly(p.id)
        if (aIsAlly && !bIsAlly) return -1
        if (!aIsAlly && bIsAlly) return 1
        return (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '')
      })

    if (!allPlayers.length) {
      html += '<div class="muted">No players detected yet</div>'
    } else {
      html += '<div style="max-height:400px;overflow-y:auto">'
      for (const p of allPlayers.slice(0, 50)) {
        const name = p.displayName || p.name || 'Unknown'
        const isAlly = asIsAlly(p.id)
        const teamTag = p.team != null ? ` [Team ${p.team}]` : ''
        const allyIcon = isAlly ? '🤝 ' : ''
        const nameColor = isAlly ? '#7ff2a3' : '#e7eef5'

        html += `<div class="box" style="margin:4px 0">`
        html += `<div class="row">`
        html += `<div style="flex:1;color:${nameColor}">${allyIcon}${esc(name)}${esc(teamTag)}</div>`
        html += `<div class="mono muted" style="font-size:10px">${short((p.troops || 0) / 10)} 🪖 | ${short(p.gold || 0)} 💰</div>`
        html += `</div>`
        html += `</div>`
      }
      html += '</div>'
    }
    html += '</div>'

    html += '<div class="box"><div class="title" style="margin-top:0">ℹ️ About Embargoes</div>'
    html += '<div class="help"><b>What is an embargo?</b><br>'
    html += 'Prevents specific players from trading with ports on your territory. Use strategically to cut off enemy gold income while maintaining your own port network.'
    html += '</div>'
    html += '<div class="recommendation" style="margin-top:8px">💡 Embargo enemies to deny them port income without affecting your allies</div>'
    html += '</div>'

    return html
  }

  function hotkeysView() {
    let html = '<div class="title">⌨️ Keyboard Shortcuts</div>'
    html += '<div class="help">All hotkeys - NOW WORKING!</div>'

    html += '<div class="box"><div class="title" style="margin-top:0">Auto-Feeder</div>'
    html += '<div class="row"><div>Add Target</div><span class="hotkey">ALT+M</span></div>'
    html += '<div class="row"><div>Toggle Auto-Feed</div><span class="hotkey">ALT+F</span></div>'
    html += '</div>'

    html += '<div class="box"><div class="title" style="margin-top:0">Overlays</div>'
    html += '<div class="row"><div>SAM Overlay</div><span class="hotkey">CTRL+SHIFT+F</span></div>'
    html += '<div class="row"><div>Atom Bomb</div><span class="hotkey">ALT+A</span></div>'
    html += '<div class="row"><div>Hydrogen Bomb</div><span class="hotkey">ALT+H</span></div>'
    html += '</div>'

    html += '<div class="box"><div class="title" style="margin-top:0">Quick Actions</div>'
    html += '<div class="row"><div>Embargo All</div><span class="hotkey">ALT+E</span></div>'
    html += '</div>'

    return html
  }

  function render() {
    const content = ui.querySelector('#hm-content')
    if (!content) return

    const views = {
      command: commandCenterView,
      summary: summaryView,
      stats: statsView,
      aiinsights: aiInsightsView,
      threat: threatRadarView,
      power: powerRankingsView,
      weaktargets: weakTargetsView,
      ports: portsView,
      feed: feedView,
      goldrate: goldRateView,
      alliances: alliancesView,
      autotroops: autoDonateTroopsView,
      autogold: autoDonateGoldView,
      overlays: overlaysView,
      embargo: embargoView,
      hotkeys: hotkeysView
    }

    const fn = views[S.view]
    if (fn) content.innerHTML = fn()

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

    // NOTE: Troop target handlers moved to event delegation (see below render function)

    // Auto-gold handlers
    const agAmount = ui.querySelector('#ag-amount')
    const agThreshold = ui.querySelector('#ag-threshold')
    const agCooldown = ui.querySelector('#ag-cooldown')
    const agAllTeamToggle = ui.querySelector('#ag-allteam-toggle')
    const agStart = ui.querySelector('#ag-start')
    const agClear = ui.querySelector('#ag-clear')

    if (agAmount) {
      agAmount.onchange = () => {
        S.asGoldAmount = num(agAmount.value)
      }
    }
    if (agThreshold) {
      agThreshold.onchange = () => {
        S.asGoldThreshold = num(agThreshold.value)
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

    // NOTE: Gold target handlers moved to event delegation (see below render function)

    // Overlay toggles
    const ovSam = ui.querySelector('#ov-sam')
    const ovAtom = ui.querySelector('#ov-atom')
    const ovHydrogen = ui.querySelector('#ov-hydrogen')

    if (ovSam) ovSam.onclick = () => { S.samOverlayEnabled = !S.samOverlayEnabled }
    if (ovAtom) ovAtom.onclick = () => { S.atomOverlayEnabled = !S.atomOverlayEnabled }
    if (ovHydrogen) ovHydrogen.onclick = () => { S.hydrogenOverlayEnabled = !S.hydrogenOverlayEnabled }

    // Embargo buttons
    const embAll = ui.querySelector('#emb-all')
    const unembAll = ui.querySelector('#unemb-all')

    if (embAll) embAll.onclick = () => embargoAll()
    if (unembAll) unembAll.onclick = () => unembargoAll()

    // ===== REMOVED: Dynamic number updates cause scroll bounce issues =====
    // Keeping troop/gold counts static to prevent nested scroll jumping
  }

  // ===== EVENT DELEGATION (set up once, not on every render) =====
  // This prevents handlers from being destroyed/recreated every 500ms
  // which was causing click failures and performance issues

  const content = ui.querySelector('#hm-content')
  if (content) {
    // Delegate troop target toggles
    content.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('[data-toggle-troop-target]')
      if (toggleBtn) {
        const target = toggleBtn.getAttribute('data-toggle-troop-target')
        const idx = S.asTroopsTargets.indexOf(target)
        if (idx >= 0) {
          S.asTroopsTargets.splice(idx, 1)
        } else {
          S.asTroopsTargets.push(target)
        }
        render() // Re-render to show updated state
        return
      }

      // Delegate troop target removes
      const removeBtn = e.target.closest('[data-remove-troop-target]')
      if (removeBtn) {
        e.stopPropagation()
        const target = removeBtn.getAttribute('data-remove-troop-target')
        const idx = S.asTroopsTargets.indexOf(target)
        if (idx >= 0) S.asTroopsTargets.splice(idx, 1)
        render()
        return
      }

      // Delegate gold target toggles
      const goldToggleBtn = e.target.closest('[data-toggle-gold-target]')
      if (goldToggleBtn) {
        const target = goldToggleBtn.getAttribute('data-toggle-gold-target')
        const idx = S.asGoldTargets.indexOf(target)
        if (idx >= 0) {
          S.asGoldTargets.splice(idx, 1)
        } else {
          S.asGoldTargets.push(target)
        }
        render()
        return
      }

      // Delegate gold target removes
      const goldRemoveBtn = e.target.closest('[data-remove-gold-target]')
      if (goldRemoveBtn) {
        e.stopPropagation()
        const target = goldRemoveBtn.getAttribute('data-remove-gold-target')
        const idx = S.asGoldTargets.indexOf(target)
        if (idx >= 0) S.asGoldTargets.splice(idx, 1)
        render()
        return
      }
    })
  }

  // Initial render
  render()

  const tickId = setInterval(() => {
    render()
  }, 1500) // Reduced from 500ms to 1500ms to improve performance

  // ===== CLEANUP FUNCTION =====
  function cleanup() {
    console.log('[HAMMER] Cleanup started...')

    // Clear intervals
    clearInterval(tickId)
    if (asTroopsTimer) clearInterval(asTroopsTimer)
    if (asGoldTimer) clearInterval(asGoldTimer)
    intentQueue.length = 0
    intentQueueBusy = false

    // Remove status overlay
    if (statusOverlay) statusOverlay.remove()

    // Remove game overlays
    hideOverlayCanvas()

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
    if (origRAF) {
      try {
        window.requestAnimationFrame = origRAF
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

  window.__HAMMER__ = { cleanup, ui: { root: ui }, version: '9.0' }

  render()

  // Show initialization status
  const initMessages = []
  if (foundWorker) initMessages.push('✅ Worker')
  else initMessages.push('⚠️ Worker (will intercept)')
  if (foundWebSocket) initMessages.push('✅ WebSocket')
  else initMessages.push('⚠️ WebSocket (will intercept)')
  if (targetCanvas) initMessages.push('✅ Canvas')
  else initMessages.push('⏳ Canvas (detecting...)')

  console.log('%c[HAMMER]%c v9.0 APEX ready! 🔨', 'color:#deb887;font-weight:bold', 'color:inherit')
  console.log('[HAMMER] Status:', initMessages.join(' | '))
  console.log('[HAMMER] ✅ Auto-gold performance optimized!')
  console.log('[HAMMER] ✅ Weak player targeting added!')
  console.log('[HAMMER] 🔄 Now supports mid-game reruns!')
})()
