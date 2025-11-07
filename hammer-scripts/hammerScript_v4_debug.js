// =====================================================================
// HAMMER v4.0 DEBUG EDITION
// Comprehensive diagnostic version to identify data capture issues
// =====================================================================
(() => {
  // Hard reset
  if (window.__HAMMER__?.cleanup) {
    try { window.__HAMMER__.cleanup() } catch {}
  }
  if (window.__HAMMER__?.ui?.root) {
    try { window.__HAMMER__.ui.root.remove() } catch {}
  }
  delete window.__HAMMER__

  // ===== DEBUG MODE ALWAYS ON =====
  const DEBUG = true
  const timestamp = () => new Date().toISOString().split('T')[1].slice(0, -1)
  const log = (...a) => console.log(`[HAMMER ${timestamp()}]`, ...a)
  const warn = (...a) => console.warn(`[HAMMER ${timestamp()}]`, ...a)
  const error = (...a) => console.error(`[HAMMER ${timestamp()}]`, ...a)

  log('🔨 HAMMER v4.0 DEBUG starting...')

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

  // ===== DIAGNOSTIC COUNTERS =====
  const diagnostics = {
    workerMessagesReceived: 0,
    gameUpdateMessagesReceived: 0,
    playerUpdatesReceived: 0,
    unitUpdatesReceived: 0,
    displayEventsReceived: 0,
    displayEventsDonation: 0,
    donationsProcessed: 0,
    donationsFiltered: 0,
    donationsDuplicate: 0,
    lastWorkerMessageTime: null,
    lastGameUpdateTime: null,
    lastPlayerUpdateTime: null,
    lastDisplayEventTime: null,
    lastDonationTime: null
  }

  // ===== GLOBAL STATE =====
  let currentClientID = null
  try {
    const cid = localStorage.getItem("client_id")
    if (cid) {
      currentClientID = cid
      log('✅ Found clientID in localStorage:', currentClientID)
    } else {
      warn('⚠️ No clientID found in localStorage')
    }
  } catch (err) {
    error('❌ Error reading localStorage:', err)
  }

  let mySmallID = null, myTeam = null, myAllies = new Set(), myAlliances = []
  const playersById = new Map()
  const playersBySmallId = new Map()
  const playersByName = new Map()
  let lastPlayers = []

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
    if (v >= 1e6) return (Math.round(v / 1e5) / 10) + 'M'
    if (v >= 1e3) return Math.round(v / 1e3) + 'k'
    return String(Math.trunc(v))
  }
  const fmtSec = sec => {
    sec = Math.max(0, Math.floor(sec))
    const m = Math.floor(sec / 60), s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // ===== STATE =====
  const SIZES = [
    { w: 480, h: 360, bodyH: 312 },
    { w: 700, h: 500, bodyH: 452 },
    { w: 900, h: 640, bodyH: 592 }
  ]

  const S = {
    view: 'debug', // Start in debug view
    paused: false, minimized: false, sizeIdx: 1,
    myTag: null, filterTagMates: false,
    seen: new Set(),
    inbound: new Map(), outbound: new Map(), ports: new Map(),
    feedIn: [], feedOut: [], rawMessages: [],
    goldRateEnabled: true, samOverlayEnabled: false,
    atomOverlayEnabled: false, hydrogenOverlayEnabled: false,
    alliancesOverlayEnabled: false,
    asRunning: false, asTarget: '', asRatio: 20, asThreshold: 50,
    asLastSend: {}, asCooldownMs: 10000, asLog: []
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

  // ===== WORKER WRAPPER =====
  const OriginalWorker = window.Worker
  log('📦 Original Worker constructor saved:', OriginalWorker)

  function onWorkerMessage(e) {
    diagnostics.workerMessagesReceived++
    diagnostics.lastWorkerMessageTime = new Date()

    // Log EVERY Worker message
    if (diagnostics.workerMessagesReceived <= 5 || diagnostics.workerMessagesReceived % 100 === 0) {
      log(`📨 Worker message #${diagnostics.workerMessagesReceived}:`, e.data?.type || 'unknown type')
    }

    const msg = e.data
    try {
      // Check for game_update messages
      if (!msg) {
        warn('⚠️ Worker message is null/undefined')
        return
      }

      if (msg.type !== 'game_update') {
        // Log non-game_update messages for first 10
        if (diagnostics.workerMessagesReceived <= 10) {
          log(`📝 Non-game_update message type: "${msg.type}"`)
        }
        return
      }

      diagnostics.gameUpdateMessagesReceived++
      diagnostics.lastGameUpdateTime = new Date()

      if (diagnostics.gameUpdateMessagesReceived <= 3 || diagnostics.gameUpdateMessagesReceived % 50 === 0) {
        log(`🎮 Game update #${diagnostics.gameUpdateMessagesReceived}`)
      }

      if (!msg.gameUpdate) {
        warn('⚠️ game_update message has no gameUpdate property')
        return
      }

      const { updates } = msg.gameUpdate

      if (!updates) {
        warn('⚠️ gameUpdate has no updates property')
        return
      }

      // Log update types present
      if (diagnostics.gameUpdateMessagesReceived <= 3) {
        const updateTypes = Object.keys(updates).map(k => `${k}=${updates[k]?.length || 0}`)
        log(`📊 Update types in message: {${updateTypes.join(', ')}}`)
      }

      if (msg.gameUpdate.tick) {
        lastTick = msg.gameUpdate.tick
        lastTickMs = Date.now()
      }

      // Player updates
      const players = updates?.[GameUpdateType.Player]
      if (players?.length) {
        diagnostics.playerUpdatesReceived++
        diagnostics.lastPlayerUpdateTime = new Date()

        log(`👥 Player update #${diagnostics.playerUpdatesReceived}: ${players.length} players`)

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
        if (currentClientID) {
          my = players.find(p => p.clientID === currentClientID)
          if (my) log(`✅ Found my player via clientID: ${my.displayName || my.name} (smallID: ${my.smallID})`)
        }
        if (!my) {
          my = players.find(p => p.isAlive)
          if (my) log(`✅ Found my player via isAlive: ${my.displayName || my.name} (smallID: ${my.smallID})`)
        }

        if (my) {
          const oldSmallID = mySmallID
          mySmallID = my.smallID ?? null
          myTeam = my.team ?? null
          myAllies = new Set(Array.isArray(my.allies) ? my.allies : [])
          myAlliances = Array.isArray(my.alliances) ? my.alliances.slice() : []

          if (oldSmallID !== mySmallID) {
            log(`🆔 My smallID changed: ${oldSmallID} -> ${mySmallID}`)
          }

          if (S.goldRateEnabled) updateGoldRate(my)
        } else {
          warn('⚠️ Could not identify my player in player list')
        }
      }

      // Unit updates
      const units = updates?.[GameUpdateType.Unit]
      if (units?.length) {
        diagnostics.unitUpdatesReceived++
        if (diagnostics.unitUpdatesReceived <= 3) {
          log(`🏢 Unit update #${diagnostics.unitUpdatesReceived}: ${units.length} units`)
        }

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
            tileOwnerByRef.set(ref, ownerSmall)
          } catch {}
        }
      }

      // DisplayEvent messages - THE CRITICAL PART!
      const displayEvents = updates?.[GameUpdateType.DisplayEvent]
      if (displayEvents?.length) {
        diagnostics.displayEventsReceived += displayEvents.length
        diagnostics.lastDisplayEventTime = new Date()

        log(`💬 DisplayEvent batch: ${displayEvents.length} events (total: ${diagnostics.displayEventsReceived})`)

        // Log first few display events in detail
        if (diagnostics.displayEventsReceived <= 20) {
          for (const evt of displayEvents) {
            log(`  📋 DisplayEvent: type=${evt.messageType}, playerID=${evt.playerID}, msg="${evt.message}"`)
          }
        }

        for (const evt of displayEvents) {
          try {
            processDisplayMessage(evt)
          } catch (err) {
            error('❌ Error processing display event:', err, evt)
          }
        }
      }
    } catch (err) {
      error('❌ Worker message processing error:', err)
    }
  }

  function processDisplayMessage(msg) {
    if (!msg || typeof msg.messageType !== 'number') {
      warn('⚠️ Invalid display message:', msg)
      return
    }

    // ALWAYS log the raw message to diagnostics
    S.rawMessages.push(msg)
    if (S.rawMessages.length > 100) S.rawMessages.shift()

    const mt = msg.messageType
    const pid = msg.playerID
    const text = msg.message || ''

    // Check if this is a donation message type
    const isDonationType = [
      MessageType.SENT_GOLD_TO_PLAYER,
      MessageType.RECEIVED_GOLD_FROM_PLAYER,
      MessageType.RECEIVED_GOLD_FROM_TRADE,
      MessageType.SENT_TROOPS_TO_PLAYER,
      MessageType.RECEIVED_TROOPS_FROM_PLAYER
    ].includes(mt)

    if (isDonationType) {
      diagnostics.displayEventsDonation++
      log(`💰 DONATION MESSAGE #${diagnostics.displayEventsDonation}: type=${mt}, playerID=${pid}, mySmallID=${mySmallID}, text="${text}"`)
    }

    if (S.paused) {
      log(`⏸️ Paused - skipping message processing`)
      return
    }

    // CRITICAL: Player ID check - temporarily DISABLED for debugging
    if (pid !== mySmallID) {
      diagnostics.donationsFiltered++
      log(`⚠️ FILTERED: Message for player ${pid}, I am ${mySmallID} - SKIPPING`)
      return
    }

    // Duplicate check
    const key = `${mt}:${text}`
    if (S.seen.has(key)) {
      diagnostics.donationsDuplicate++
      log(`⏭️ DUPLICATE: Already seen "${key}"`)
      return
    }
    S.seen.add(key)
    if (S.seen.size > 5000) S.seen.clear()

    const now = Date.now()

    // Process donation types
    if (mt === MessageType.RECEIVED_TROOPS_FROM_PLAYER) {
      const m = text.match(/Received\s+([\d,\.]+[KkMm]?)\s+troops from\s+(.+)$/i)
      if (m) {
        const amt = parseAmt(m[1]), name = m[2].trim()
        const from = findPlayer(name)
        if (from && amt > 0) {
          diagnostics.donationsProcessed++
          diagnostics.lastDonationTime = new Date()
          const r = bump(S.inbound, from.id)
          r.troops += amt; r.count++; r.last = nowDate()
          S.feedIn.push({ ts: nowDate(), type: 'troops', name, amount: amt })
          if (S.feedIn.length > 500) S.feedIn.shift()
          log(`✅ RECV TROOPS: ${amt} from ${name}`)
        } else {
          warn(`⚠️ Could not process troops donation: amt=${amt}, name="${name}", from=${from}`)
        }
      }
    } else if (mt === MessageType.SENT_TROOPS_TO_PLAYER) {
      const m = text.match(/Sent\s+([\d,\.]+[KkMm]?)\s+troops to\s+(.+)$/i)
      if (m) {
        const amt = parseAmt(m[1]), name = m[2].trim()
        const to = findPlayer(name)
        if (to && amt > 0) {
          diagnostics.donationsProcessed++
          diagnostics.lastDonationTime = new Date()
          const r = bump(S.outbound, to.id)
          r.troops += amt; r.count++; r.last = nowDate()
          S.feedOut.push({ ts: nowDate(), type: 'troops', name, amount: amt })
          if (S.feedOut.length > 500) S.feedOut.shift()
          log(`✅ SENT TROOPS: ${amt} to ${name}`)
        }
      }
    } else if (mt === MessageType.RECEIVED_GOLD_FROM_TRADE) {
      const m = text.match(/Received\s+([\d,\.]+[KkMm]?)\s+gold from trade with\s+(.+)$/i)
      if (m) {
        const amt = msg.goldAmount ? num(msg.goldAmount) : parseAmt(m[1])
        const name = m[2].trim()
        const from = findPlayer(name)
        if (from && amt > 0) {
          diagnostics.donationsProcessed++
          diagnostics.lastDonationTime = new Date()
          const r = bump(S.inbound, from.id)
          r.gold += amt; r.count++; r.last = nowDate()
          S.feedIn.push({ ts: nowDate(), type: 'gold', name, amount: amt })
          if (S.feedIn.length > 500) S.feedIn.shift()
          bumpPorts(from.id, amt, now)
          log(`✅ RECV GOLD TRADE: ${amt} from ${name}`)
        }
      }
    } else if (mt === MessageType.RECEIVED_GOLD_FROM_PLAYER) {
      const m = text.match(/Received\s+([\d,\.]+[KkMm]?)\s+gold from\s+(.+)$/i)
      if (m) {
        const amt = msg.goldAmount ? num(msg.goldAmount) : parseAmt(m[1])
        const name = m[2].trim()
        const from = findPlayer(name)
        if (from && amt > 0) {
          diagnostics.donationsProcessed++
          diagnostics.lastDonationTime = new Date()
          const r = bump(S.inbound, from.id)
          r.gold += amt; r.count++; r.last = nowDate()
          S.feedIn.push({ ts: nowDate(), type: 'gold', name, amount: amt })
          if (S.feedIn.length > 500) S.feedIn.shift()
          log(`✅ RECV GOLD: ${amt} from ${name}`)
        }
      }
    } else if (mt === MessageType.SENT_GOLD_TO_PLAYER) {
      const m = text.match(/Sent\s+([\d,\.]+[KkMm]?)\s+gold to\s+(.+)$/i)
      if (m) {
        const amt = msg.goldAmount ? num(msg.goldAmount) : parseAmt(m[1])
        const name = m[2].trim()
        const to = findPlayer(name)
        if (to && amt > 0) {
          diagnostics.donationsProcessed++
          diagnostics.lastDonationTime = new Date()
          const r = bump(S.outbound, to.id)
          r.gold += amt; r.count++; r.last = nowDate()
          S.feedOut.push({ ts: nowDate(), type: 'gold', name, amount: amt })
          if (S.feedOut.length > 500) S.feedOut.shift()
          log(`✅ SENT GOLD: ${amt} to ${name}`)
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
    if (w.__hammerWrapped) {
      log('⚠️ Worker already wrapped')
      return w
    }
    log('🔧 Wrapping Worker instance')
    w.__hammerWrapped = true
    const origPost = w.postMessage
    w.postMessage = function(data, ...rest) {
      try {
        if (data?.type === 'init' && data.clientID) {
          currentClientID = data.clientID
          log('✅ Got clientID from init message:', currentClientID)
        }
      } catch {}
      return origPost.call(this, data, ...rest)
    }
    w.addEventListener('message', onWorkerMessage)
    log('✅ Worker message listener attached')
    return w
  }

  class WrappedWorker extends OriginalWorker {
    constructor(...args) {
      log('🏗️ Creating new Worker with args:', args)
      super(...args)
      wrapWorker(this)
    }
  }

  Object.defineProperty(window, 'Worker', {
    configurable: true,
    writable: true,
    value: WrappedWorker
  })
  log('✅ Worker wrapper installed globally')

  // ===== WEBSOCKET WRAPPER =====
  const OriginalWebSocket = window.WebSocket
  log('📦 Original WebSocket constructor saved:', OriginalWebSocket)

  class WrappedWebSocket extends OriginalWebSocket {
    constructor(url, protocols) {
      log('🌐 Creating new WebSocket:', url)
      super(url, protocols)
      this.addEventListener('message', ev => {
        try {
          if (!ev?.data) return
          const obj = typeof ev.data === 'string' ? JSON.parse(ev.data) : null
          if (obj && (obj.type === 'turn' || obj.type === 'start' || obj.type === 'ping')) {
            if (!gameSocket) log('✅ Game socket captured!')
            gameSocket = this
          }
        } catch {}
      })
    }
    send(data) {
      try {
        if (typeof data === 'string') {
          const obj = JSON.parse(data)
          if (obj?.type === 'join' && obj.clientID) {
            currentClientID = obj.clientID
            gameSocket = this
            log('✅ Got clientID from join message:', currentClientID)
          }
          if (obj?.type === 'intent') {
            if (!gameSocket) log('✅ Game socket captured via intent!')
            gameSocket = this
          }
        }
      } catch {}
      return super.send(data)
    }
  }

  Object.defineProperty(window, 'WebSocket', {
    configurable: true,
    writable: true,
    value: WrappedWebSocket
  })
  log('✅ WebSocket wrapper installed globally')

  // ===== CANVAS INTERCEPTION =====
  try {
    const proto = CanvasRenderingContext2D.prototype
    const origSetTrans = proto.setTransform
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
      return origSetTrans.apply(this, arguments)
    }

    const origDrawImg = proto.drawImage
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
      return origDrawImg.apply(this, arguments)
    }
    log('✅ Canvas interception installed')
  } catch (err) {
    error('❌ Canvas interception failed:', err)
  }

  // ===== MOUSE TRACKING =====
  window.addEventListener('mousemove', e => {
    lastMouseClient.x = e.clientX
    lastMouseClient.y = e.clientY
  }, true)

  // ===== AUTO-DONATE FUNCTIONS =====
  function asSendTroops(targetId, amount) {
    if (!gameSocket || gameSocket.readyState !== 1 || !currentClientID) return false
    const intent = { type: 'donate_troops', clientID: currentClientID, recipient: targetId, troops: amount == null ? null : num(amount) }
    try {
      gameSocket.send(JSON.stringify({ type: 'intent', intent }))
      return true
    } catch { return false }
  }

  function asResolveTarget(tgt) {
    if (!tgt) return []
    if (String(tgt).toLowerCase() === 'allplayers') {
      return [...playersById.values()]
        .filter(p => p.id && p.smallID !== mySmallID && asIsAlly(p.id))
        .map(p => p.id)
    }
    if (/^\d+$/.test(tgt)) {
      const p = playersBySmallId.get(num(tgt))
      return p?.id ? [p.id] : []
    }
    if (playersById.has(tgt)) return [tgt]
    const p = playersByName.get(String(tgt).toLowerCase())
    return p?.id ? [p.id] : []
  }

  function asIsAlly(tid) {
    const p = playersById.get(tid)
    if (!p) return false
    if (p.team != null && myTeam != null && p.team === myTeam) return true
    if (myAllies.has(p.smallID)) return true
    return false
  }

  function asTick() {
    if (!S.asRunning) return
    const now = Date.now()
    const ids = asResolveTarget(S.asTarget)
    if (!ids.length) return

    let chosen = null
    for (const id of ids) {
      if (!asIsAlly(id)) continue
      const last = S.asLastSend[id] || 0
      if (now - last >= S.asCooldownMs) { chosen = id; break }
    }
    if (!chosen) return

    const me = readMyPlayer()
    if (!me) return
    const troops = me.troops || 0
    const maxT = estimateMaxTroops(me.tilesOwned, me.smallID)
    if (!maxT || (troops / maxT) * 100 < S.asThreshold) return

    const toSend = Math.max(1, Math.floor(troops * (S.asRatio / 100)))
    if (asSendTroops(chosen, toSend)) {
      S.asLastSend[chosen] = now
      const p = playersById.get(chosen)
      const name = p ? (p.displayName || p.name || chosen) : chosen
      S.asLog.push(`[${fmtTime(nowDate())}] Sent ${toSend} troops to ${name}`)
      if (S.asLog.length > 100) S.asLog.shift()
    }
  }

  let asTimer = null
  function asStart() {
    S.asRunning = true
    if (asTimer) clearInterval(asTimer)
    asTimer = setInterval(asTick, 800)
  }
  function asStop() {
    S.asRunning = false
    if (asTimer) { clearInterval(asTimer); asTimer = null }
  }

  // ===== EMBARGO FUNCTIONS =====
  function sendEmbargo(tid, action = 'start') {
    if (!gameSocket || gameSocket.readyState !== 1 || !currentClientID) return false
    const intent = { type: 'embargo', clientID: currentClientID, targetID: tid, action }
    try {
      gameSocket.send(JSON.stringify({ type: 'intent', intent }))
      return true
    } catch { return false }
  }

  function embargoAll() {
    const me = readMyPlayer()
    if (!me) return
    let ct = 0
    for (const p of playersById.values()) {
      if (p.id && p.id !== me.id) {
        if (sendEmbargo(p.id, 'start')) ct++
      }
    }
    alert(`Embargo sent to ${ct} players`)
  }

  function unembargoAll() {
    const me = readMyPlayer()
    if (!me) return
    let ct = 0
    for (const p of playersById.values()) {
      if (p.id && p.id !== me.id) {
        if (sendEmbargo(p.id, 'stop')) ct++
      }
    }
    alert(`Trading enabled with ${ct} players`)
  }

  // ===== UI =====
  const ui = document.createElement('div')
  ui.id = 'hammer-v4-debug'
  Object.assign(ui.style, {
    position: 'fixed', right: '14px', bottom: '14px',
    width: SIZES[S.sizeIdx].w + 'px', height: SIZES[S.sizeIdx].h + 'px',
    background: '#0b1220', color: '#e7eef5',
    font: '12px/1.35 Consolas,Menlo,monospace',
    border: '2px solid #ff4444', borderRadius: '10px',
    zIndex: '2147483646', boxShadow: '0 10px 28px rgba(255,0,0,.35)',
    overflow: 'hidden', userSelect: 'none', resize: 'both'
  })

  const tabs = ['debug', 'inbound', 'outbound', 'ports', 'feed', 'goldrate', 'alliances', 'autodonate', 'embargo']
  ui.innerHTML = `
    <div id="hm-head" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#331515;border-bottom:1px solid #ff4444;cursor:move;flex-shrink:0">
      <div><b>HAMMER v4</b> <span style="color:#ff8888">DEBUG</span></div>
      <div class="btns" style="display:flex;gap:6px;flex-wrap:wrap">
        <div id="hm-tabs" style="display:flex;gap:4px;flex-wrap:wrap">
          ${tabs.map(v => `<button class="tab" data-v="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
        </div>
        <button id="hm-size">Size▽</button>
        <button id="hm-mini">▽</button>
        <button id="hm-pause">Pause</button>
        <button id="hm-reset">Reset</button>
        <button id="hm-tag">Tag</button>
        <button id="hm-export">Export</button>
        <button id="hm-close">×</button>
      </div>
    </div>
    <div id="hm-body" style="height:${SIZES[S.sizeIdx].bodyH}px;overflow:auto;padding:10px">
      <style>
        #hammer-v4-debug .row{display:flex;justify-content:space-between;gap:10px;margin:2px 0}
        #hammer-v4-debug .muted{color:#9bb0c8}
        #hammer-v4-debug .mono{font-feature-settings:"tnum";font-variant-numeric:tabular-nums}
        #hammer-v4-debug .title{font-weight:700;margin:8px 0 4px;color:#ff8888}
        #hammer-v4-debug .box{padding:8px;border:1px solid #2a3a55;border-radius:8px;background:#101a2a;margin:6px 0}
        #hammer-v4-debug button{background:#0e1a2f;color:#e7eef5;border:1px solid #2a3a55;border-radius:6px;padding:4px 8px;cursor:pointer;font:11px Consolas,Menlo,monospace}
        #hammer-v4-debug button:hover{background:#253454}
        #hammer-v4-debug input,#hammer-v4-debug select{background:#0e1a2f;color:#e7eef5;border:1px solid #2a3a55;border-radius:6px;padding:4px 8px;font:12px Consolas,Menlo,monospace}
        #hammer-v4-debug .debug pre{white-space:pre-wrap;font:11px/1.3 Consolas,Menlo,monospace;color:#d5e1ff;margin:0}
        #hammer-v4-debug .success{color:#7ff2a3}
        #hammer-v4-debug .warning{color:#ffcf5d}
        #hammer-v4-debug .error{color:#ff8b94}
      </style>
      <div id="hm-content"></div>
    </div>
  `
  document.body.appendChild(ui)
  log('✅ UI mounted to DOM')

  // Drag
  const bar = ui.querySelector('#hm-head')
  let d = false, dx = 0, dy = 0
  bar.addEventListener('mousedown', e => {
    d = true; dx = e.clientX - ui.offsetLeft; dy = e.clientY - ui.offsetTop; e.preventDefault()
  })
  addEventListener('mousemove', e => {
    if (!d) return
    ui.style.left = (e.clientX - dx) + 'px'
    ui.style.top = (e.clientY - dy) + 'px'
    ui.style.right = 'auto'; ui.style.bottom = 'auto'
  })
  addEventListener('mouseup', () => d = false)

  const bodyEl = ui.querySelector('#hm-body')
  const headEl = ui.querySelector('#hm-head')

  function applySize(idx) {
    S.sizeIdx = (idx + SIZES.length) % SIZES.length
    const s = SIZES[S.sizeIdx]
    ui.style.width = s.w + 'px'; ui.style.height = s.h + 'px'
    bodyEl.style.height = s.bodyH + 'px'
  }

  try {
    new ResizeObserver(() => {
      const h = Math.max(120, ui.clientHeight - headEl.offsetHeight - 12)
      bodyEl.style.height = h + 'px'
    }).observe(ui)
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

  // Controls
  ui.querySelector('#hm-close').onclick = () => { cleanup(); ui.remove() }
  ui.querySelector('#hm-size').onclick = () => applySize(S.sizeIdx + 1)
  ui.querySelector('#hm-mini').onclick = () => setMin(!S.minimized)
  ui.querySelector('#hm-pause').onclick = () => {
    S.paused = !S.paused
    ui.querySelector('#hm-pause').textContent = S.paused ? 'Resume' : 'Pause'
  }
  ui.querySelector('#hm-reset').onclick = () => {
    if (!confirm('Clear all data?')) return
    S.inbound.clear(); S.outbound.clear(); S.ports.clear()
    S.feedIn.length = 0; S.feedOut.length = 0; S.rawMessages.length = 0
    S.seen.clear(); goldHistory.length = 0
    render()
  }
  ui.querySelector('#hm-tag').onclick = () => {
    if (!S.filterTagMates && !S.myTag) {
      const t = prompt('Enter your tag (without brackets)')
      if (t?.trim()) S.myTag = t.trim()
    }
    S.filterTagMates = !S.filterTagMates
    ui.querySelector('#hm-tag').textContent = S.filterTagMates ? `Tag[${S.myTag}]` : 'Tag'
    render()
  }
  ui.querySelector('#hm-export').onclick = () => {
    const obj = {
      exportedAt: new Date().toISOString(),
      myClientID: currentClientID, mySmallID,
      diagnostics: diagnostics,
      inbound: Object.fromEntries(S.inbound),
      outbound: Object.fromEntries(S.outbound),
      ports: Object.fromEntries([...S.ports.entries()].map(([k, v]) => [k, {
        totalGold: v.totalGold, avgIntSec: v.avgIntSec, lastIntSec: v.lastIntSec,
        gpm: v.gpm, trades: v.times.length
      }])),
      goldRate: { gps30: S.gps30, gpm60: S.gpm60, gpm120: S.gpm120 },
      stream: {
        inbound: S.feedIn.map(x => ({ ts: x.ts.toISOString(), type: x.type, name: x.name, amount: x.amount })),
        outbound: S.feedOut.map(x => ({ ts: x.ts.toISOString(), type: x.type, name: x.name, amount: x.amount }))
      }
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }))
    a.download = `hammer_v4_debug_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 800)
  }
  ui.querySelector('#hm-tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab')
    if (!b) return
    S.view = b.getAttribute('data-v')
    render()
  })

  // Tag helpers
  const tagOf = n => {
    const m = String(n || '').match(/\[\s*([^\]]+?)\s*\]/)
    return m ? m[1].trim() : null
  }
  const isTagMate = id => {
    if (!S.filterTagMates || !S.myTag) return true
    const p = playersById.get(id)
    if (!p) return false
    const t = tagOf(p.displayName || p.name || '')
    return t && t.toLowerCase() === S.myTag.toLowerCase()
  }

  // Render functions
  function rowsFromMap(map) {
    const arr = [...map.entries()]
      .filter(([id]) => isTagMate(id))
      .map(([id, v]) => {
        const p = playersById.get(id)
        const name = p ? (p.displayName || p.name || `#${id}`) : `#${id}`
        return { id, name, total: num(v.gold) + num(v.troops), gold: v.gold, troops: v.troops, count: v.count, last: v.last }
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 40)
    if (!arr.length) return '<span class="muted">No data yet</span>'
    return arr.map(r => `
      <div class="row mono">
        <span>${esc(r.name)}</span>
        <span>${short(r.gold)}💰 ${short(r.troops)}⚔️ <span class="muted">(${r.count}×${r.last ? ', ' + fmtTime(r.last) : ''})</span></span>
      </div>
    `).join('')
  }

  function feedRows() {
    const lines = [
      ...S.feedIn.map(f => ({ dir: 'from', ...f })),
      ...S.feedOut.map(f => ({ dir: 'to', ...f }))
    ]
      .filter(e => {
        if (!S.filterTagMates || !S.myTag) return true
        const t = tagOf(e.name)
        return t && t.toLowerCase() === S.myTag.toLowerCase()
      })
      .sort((a, b) => b.ts - a.ts)
    if (!lines.length) return '<span class="muted">No activity yet</span>'
    return lines.slice(0, 200).map(e => `
      <div class="row">
        <span class="mono"><b>${short(e.amount)}</b> ${e.type === 'gold' ? '💰' : '⚔️'} ${e.dir} ${esc(e.name)}</span>
        <span class="muted">${fmtTime(e.ts)}</span>
      </div>
    `).join('')
  }

  function portsRows() {
    const arr = [...S.ports.entries()]
      .filter(([id]) => isTagMate(id))
      .map(([id, p]) => {
        const player = playersById.get(id)
        const name = player ? (player.displayName || player.name || `#${id}`) : `#${id}`
        return { id, name, totalGold: p.totalGold, trades: p.times.length, avg: p.avgIntSec || 0, last: p.lastIntSec || 0, gpm: p.gpm || 0 }
      })
      .sort((a, b) => b.totalGold - a.totalGold)
      .slice(0, 40)
    if (!arr.length) return '<span class="muted">No port trades yet</span>'
    return arr.map(r => {
      const flag = r.avg > 120 && r.gpm < 2000 ? ' <b style="color:#ff8b94">consider embargo</b>' : ''
      return `<div class="row mono"><span>${esc(r.name)}</span><span>${short(r.totalGold)}💰 • gpm ${short(r.gpm)} • avg ${r.avg}s • last ${r.last}s${flag}</span></div>`
    }).join('')
  }

  function goldRateView() {
    const me = readMyPlayer()
    const gold = me ? short(me.gold) : '-'
    const troops = me ? short(me.troops / 10) : '-'
    const maxT = me ? estimateMaxTroops(me.tilesOwned, me.smallID) : 0
    return `
      <div class="title">Gold Rate & Resources</div>
      <div class="box">
        <div class="row"><span>Current Gold:</span><span class="mono">${gold}💰</span></div>
        <div class="row"><span>Current Troops:</span><span class="mono">${troops}⚔️${maxT ? ` / ${short(maxT / 10)}` : ''}</span></div>
        <div class="row"><span>Gold/sec (30s):</span><span class="mono">${(S.gps30 || 0).toFixed(2)}</span></div>
        <div class="row"><span>Gold/min (60s):</span><span class="mono">${short(S.gpm60 || 0)}</span></div>
        <div class="row"><span>Gold/min (120s):</span><span class="mono">${short(S.gpm120 || 0)}</span></div>
      </div>
      <div class="title">Gold History (last ${goldHistory.length} samples)</div>
      <div class="muted">Tracking ${goldHistory.length} data points over 2 minutes</div>
    `
  }

  function alliancesView() {
    if (!myAlliances.length) return '<div class="muted">No active alliances</div>'
    const approxTick = lastTick + Math.max(0, Math.floor((Date.now() - lastTickMs) / TICK_MS))
    return `
      <div class="title">Active Alliances (${myAlliances.length})</div>
      ${myAlliances.map(a => {
        const other = playersById.get(a.other)
        const name = other ? (other.displayName || other.name || a.other) : a.other
        const remaining = Math.max(0, (a.expiresAt || 0) - approxTick)
        const sec = (remaining * TICK_MS) / 1000
        const gold = other ? short(other.gold) : '-'
        const troops = other ? short(other.troops / 10) : '-'
        return `<div class="row"><span>${esc(name)}</span><span class="mono">${gold}💰 ${troops}⚔️ • ${fmtSec(sec)}</span></div>`
      }).join('')}
    `
  }

  function autoDonateView() {
    const me = readMyPlayer()
    const troops = me ? me.troops : 0
    const maxT = me ? estimateMaxTroops(me.tilesOwned, me.smallID) : 0
    const pct = maxT ? ((troops / maxT) * 100).toFixed(1) : 0
    return `
      <div class="title">Auto-Donate (Scope Feeder)</div>
      <div class="box">
        <div class="row">
          <span>Status:</span>
          <span><b style="color:${S.asRunning ? '#7ff2a3' : '#ff8b94'}">${S.asRunning ? 'RUNNING' : 'STOPPED'}</b></span>
        </div>
        <div class="row"><span>Current Troops:</span><span class="mono">${short(troops / 10)} (${pct}%)</span></div>
        <div class="row"><span>Max Troops:</span><span class="mono">${short(maxT / 10)}</span></div>
      </div>
      <div class="box">
        <div class="row">
          <label>Target:</label>
          <input id="as-target" value="${esc(S.asTarget)}" placeholder="PlayerName or smallID or AllPlayers" style="flex:1">
        </div>
        <div class="row">
          <label>Ratio (%):</label>
          <input id="as-ratio" type="number" min="1" max="100" value="${S.asRatio}" style="width:80px">
        </div>
        <div class="row">
          <label>Threshold (%):</label>
          <input id="as-threshold" type="number" min="1" max="100" value="${S.asThreshold}" style="width:80px">
        </div>
        <div class="row">
          <button id="as-start">Start</button>
          <button id="as-stop">Stop</button>
        </div>
      </div>
      <div class="title">Activity Log</div>
      <div class="box" style="max-height:200px;overflow:auto">
        ${S.asLog.length ? S.asLog.slice(-20).reverse().map(l => `<div class="muted">${esc(l)}</div>`).join('') : '<span class="muted">No activity yet</span>'}
      </div>
    `
  }

  function embargoView() {
    const me = readMyPlayer()
    const embargoes = me?.embargoes ? me.embargoes.size : 0
    const playerList = [...playersById.values()]
      .filter(p => p.id && p.id !== me?.id)
      .map(p => {
        const isEmbargoed = me?.embargoes?.has(p.id)
        return { id: p.id, name: p.displayName || p.name || `#${p.id}`, isEmbargoed }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    return `
      <div class="title">Embargo Manager</div>
      <div class="box">
        <div class="row"><span>Active Embargoes:</span><span><b>${embargoes}</b></span></div>
        <div class="row">
          <button id="embargo-all">Embargo All</button>
          <button id="unembargo-all">Un-Embargo All</button>
        </div>
      </div>
      <div class="title">Players (${playerList.length})</div>
      <div style="max-height:300px;overflow:auto">
        ${playerList.map(p => `
          <div class="row">
            <span>${esc(p.name)}</span>
            <span style="color:${p.isEmbargoed ? '#ff8b94' : '#7ff2a3'}">${p.isEmbargoed ? 'EMBARGOED' : 'TRADING'}</span>
          </div>
        `).join('')}
      </div>
    `
  }

  function debugView() {
    const now = new Date()
    const timeSince = (d) => d ? `${Math.round((now - d) / 1000)}s ago` : 'never'

    const sample = S.rawMessages.slice(-20).map(m => `Type: ${m.messageType}, Player: ${m.playerID}, Msg: "${m.message}"`).join('\n')
      || 'No DisplayMessages captured yet.\n\nWaiting for game updates...'

    const workerStatus = window.Worker === WrappedWorker ? '✅ INSTALLED' : '❌ NOT INSTALLED'
    const wsStatus = window.WebSocket === WrappedWebSocket ? '✅ INSTALLED' : '❌ NOT INSTALLED'
    const socketStatus = gameSocket ? `✅ CONNECTED (state: ${gameSocket.readyState})` : '❌ NOT CONNECTED'

    const status = `Worker Wrapper: ${workerStatus}
WebSocket Wrapper: ${wsStatus}
ClientID: ${currentClientID || 'unknown'}
MySmallID: ${mySmallID ?? 'unknown'}
MyTeam: ${myTeam ?? 'unknown'}
Players tracked: ${playersById.size}
Last players array length: ${lastPlayers.length}
Game socket: ${socketStatus}

=== DIAGNOSTIC COUNTERS ===
Worker messages received: ${diagnostics.workerMessagesReceived}
Game update messages: ${diagnostics.gameUpdateMessagesReceived}
Player updates: ${diagnostics.playerUpdatesReceived}
Unit updates: ${diagnostics.unitUpdatesReceived}
DisplayEvents received: ${diagnostics.displayEventsReceived}
DisplayEvents (donation types): ${diagnostics.displayEventsDonation}
Donations processed: ${diagnostics.donationsProcessed}
Donations filtered (wrong player): ${diagnostics.donationsFiltered}
Donations duplicate: ${diagnostics.donationsDuplicate}

=== TIMING ===
Last Worker message: ${timeSince(diagnostics.lastWorkerMessageTime)}
Last game_update: ${timeSince(diagnostics.lastGameUpdateTime)}
Last Player update: ${timeSince(diagnostics.lastPlayerUpdateTime)}
Last DisplayEvent: ${timeSince(diagnostics.lastDisplayEventTime)}
Last donation processed: ${timeSince(diagnostics.lastDonationTime)}

=== ADDITIONAL INFO ===
SAM units: ${samUnits.size}
Cities tracked: ${cityById.size}
Raw messages stored: ${S.rawMessages.length}
Seen keys: ${S.seen.size}`

    return `
      <div class="title">System Status</div>
      <pre class="debug">${esc(status)}</pre>
      <div class="title">Raw DisplayMessages (last 20)</div>
      <pre class="debug">${esc(sample)}</pre>
      <div class="title">Troubleshooting Tips</div>
      <div class="box">
        <div class="muted">
          <p><b>If Worker messages = 0:</b> Script loaded AFTER game Worker created. Refresh page and paste script BEFORE joining match.</p>
          <p><b>If game_update messages = 0:</b> Worker wrapper not intercepting game Worker. Check console for errors.</p>
          <p><b>If DisplayEvents = 0:</b> No display messages in game yet. Try sending/receiving donations.</p>
          <p><b>If donations filtered:</b> PlayerID mismatch. Your smallID (${mySmallID}) doesn't match message playerID.</p>
        </div>
      </div>
    `
  }

  function render() {
    ui.querySelectorAll('.tab').forEach(b => {
      const on = b.getAttribute('data-v') === S.view
      b.style.background = on ? '#253454' : '#0e1a2f'
      b.style.borderColor = on ? '#4a6894' : '#2a3a55'
    })

    let html = ''
    if (S.view === 'debug') html = debugView()
    else if (S.view === 'inbound') html = `<div class="title">Inbound → Me</div>${rowsFromMap(S.inbound)}`
    else if (S.view === 'outbound') html = `<div class="title">Outbound ← Me</div>${rowsFromMap(S.outbound)}`
    else if (S.view === 'ports') html = `<div class="title">Ports — Gold Yield</div>${portsRows()}<div class="box muted">Tip: High avg sec + low gpm = long routes</div>`
    else if (S.view === 'feed') html = `<div class="title">Activity Feed</div>${feedRows()}`
    else if (S.view === 'goldrate') html = goldRateView()
    else if (S.view === 'alliances') html = alliancesView()
    else if (S.view === 'autodonate') html = autoDonateView()
    else if (S.view === 'embargo') html = embargoView()

    ui.querySelector('#hm-content').innerHTML = html

    // Auto-donate event listeners
    if (S.view === 'autodonate') {
      const tgt = ui.querySelector('#as-target')
      const ratio = ui.querySelector('#as-ratio')
      const thresh = ui.querySelector('#as-threshold')
      const startBtn = ui.querySelector('#as-start')
      const stopBtn = ui.querySelector('#as-stop')

      if (startBtn) startBtn.onclick = () => {
        if (tgt) S.asTarget = tgt.value.trim()
        if (ratio) S.asRatio = Math.max(1, Math.min(100, num(ratio.value)))
        if (thresh) S.asThreshold = Math.max(1, Math.min(100, num(thresh.value)))
        if (!S.asTarget) return alert('Enter a target!')
        asStart()
        render()
      }
      if (stopBtn) stopBtn.onclick = () => { asStop(); render() }
    }

    // Embargo event listeners
    if (S.view === 'embargo') {
      const eAll = ui.querySelector('#embargo-all')
      const uAll = ui.querySelector('#unembargo-all')
      if (eAll) eAll.onclick = embargoAll
      if (uAll) uAll.onclick = unembargoAll
    }

    if (S.view === 'feed') bodyEl.scrollTop = 0
  }

  const tickId = setInterval(render, 500)

  function cleanup() {
    clearInterval(tickId)
    if (asTimer) clearInterval(asTimer)
  }

  render()

  window.__HAMMER__ = {
    state: S, ui: { root: ui }, cleanup, playersById, currentClientID, mySmallID,
    gameSocket, asStart, asStop, embargoAll, unembargoAll, diagnostics
  }

  log('%c[HAMMER]%c v4.0 DEBUG EDITION ready! 🔨', 'color:#ff8888;font-weight:bold', 'color:inherit')
  log('[HAMMER] Worker + WebSocket interception active')
  log('[HAMMER] DEBUG MODE ENABLED - Check console for detailed logs')
  log('[HAMMER] Switch to Debug tab to view diagnostic counters')
})()
