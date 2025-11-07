// =====================================================================
// HAMMER v8.3 "FIXED EDITION"
// Fixed: decimal rounding, SAM overlay positioning, removed teammate overlay, restored ports UI, fixed autogold tab
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

  const DEBUG = false
  const log = (...a) => { if (DEBUG) console.log('[HAMMER]', ...a) }

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
  let lastTick = 0, lastTickMs = Date.now()
  let lastMouseClient = { x: 0, y: 0 }

  // Game socket
  let gameSocket = null

  // Status overlay for hotkey feedback
  let statusOverlay = null

  // Render state tracking
  let shouldRender = true
  let savedScrollPositions = {}

  // ===== UTILS =====
  const num = v => Number(v) || 0
  const nowDate = () => new Date()
  const fmtTime = d => d.toLocaleTimeString()
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]))
  const short = v => {
    v = Math.abs(num(v))
    if (v >= 1e6) return Math.round(v / 1e5) / 10 + 'M'
    if (v >= 1e3) return Math.round(v / 1e3) + 'k'
    return String(Math.round(v))  // FIXED: Round all numbers
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
    goldRateEnabled: true, samOverlayEnabled: false,
    atomOverlayEnabled: false, hydrogenOverlayEnabled: false,

    // Auto-donate troops state
    asTroopsRunning: false,
    asTroopsTargets: [],
    asTroopsRatio: 20,
    asTroopsThreshold: 50,
    asTroopsLastSend: {},
    asTroopsCooldownSec: 10,
    asTroopsLog: [],
    asTroopsAllTeamMode: false,

    // Auto-donate gold state
    asGoldRunning: false,
    asGoldTargets: [],
    asGoldAmount: 10000,
    asGoldThreshold: 100000,
    asGoldLastSend: {},
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

        shouldRender = true
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
            tileOwnerByRef.set(ref, ownerSmall)
          } catch {}
        }
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
          shouldRender = true
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
          shouldRender = true
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
          bumpPorts(from.id, amt, now)
          shouldRender = true
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
          shouldRender = true
        }
      }
    } else if (mt === MessageType.SENT_GOLD_TO_PLAYER) {
      const m = text.match(/Sent\s+([\d,\.]+[KkMm]?)\s+gold to\s+(.+)$/i)
      if (m) {
        const amt = msg.goldAmount ? num(msg.goldAmount) : parseAmt(m[1])
        const name = m[2].trim()
        const to = findPlayer(name)
        if (to && amt > 0) {
          const r = bump(S.outbound, to.id)
          r.gold += amt; r.count++; r.last = nowDate()
          S.feedOut.push({ ts: nowDate(), type: 'gold', name, amount: amt, isPort: false })
          if (S.feedOut.length > 500) S.feedOut.shift()
          shouldRender = true
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
    if (w.__hammerWrapped) return w
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
    return w
  }

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
  console.log('[HAMMER] ✅ Worker wrapper installed')

  // ===== WEBSOCKET WRAPPER =====
  const OriginalWebSocket = window.WebSocket
  class WrappedWebSocket extends OriginalWebSocket {
    constructor(url, protocols) {
      super(url, protocols)
      this.addEventListener('message', ev => {
        try {
          if (!ev?.data) return
          const obj = typeof ev.data === 'string' ? JSON.parse(ev.data) : null
          if (obj && (obj.type === 'turn' || obj.type === 'start' || obj.type === 'ping')) {
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
          }
          if (obj?.type === 'intent') gameSocket = this
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
  } catch {}

  // ===== MOUSE TRACKING =====
  window.addEventListener('mousemove', e => {
    lastMouseClient.x = e.clientX
    lastMouseClient.y = e.clientY
  }, true)

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
      shouldRender = true
    } catch (err) {
      console.error('[HAMMER] ALT+M error:', err)
      showStatus('❌ Failed to capture target')
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyM') {
      e.preventDefault()
      captureMouseTarget()
      return
    }

    if (e.altKey && e.code === 'KeyF') {
      e.preventDefault()
      if (S.asTroopsRunning) {
        asTroopsStop()
        showStatus('⏸️ Auto-Feeder STOPPED')
      } else {
        if (!S.asTroopsTargets.length && !S.asTroopsAllTeamMode) {
          showStatus('❌ Set targets first (ALT+M or AllTeam mode)')
          return
        }
        asTroopsStart()
        showStatus('▶️ Auto-Feeder STARTED')
      }
      shouldRender = true
      return
    }

    if (e.altKey && e.code === 'KeyE') {
      e.preventDefault()
      embargoAll()
      return
    }

    if (e.altKey && e.code === 'KeyA') {
      e.preventDefault()
      S.atomOverlayEnabled = !S.atomOverlayEnabled
      showStatus(S.atomOverlayEnabled ? '💣 Atom Bomb Overlay ON' : '⏹️ Atom Bomb Overlay OFF')
      shouldRender = true
      return
    }

    if (e.altKey && e.code === 'KeyH') {
      e.preventDefault()
      S.hydrogenOverlayEnabled = !S.hydrogenOverlayEnabled
      showStatus(S.hydrogenOverlayEnabled ? '☢️ Hydrogen Bomb Overlay ON' : '⏹️ Hydrogen Bomb Overlay OFF')
      shouldRender = true
      return
    }

    if (e.ctrlKey && e.shiftKey && e.code === 'KeyF') {
      e.preventDefault()
      S.samOverlayEnabled = !S.samOverlayEnabled
      showStatus(S.samOverlayEnabled ? '🎯 SAM Overlay ON' : '⏹️ SAM Overlay OFF')
      shouldRender = true
      return
    }
  })

  // ===== AUTO-DONATE TROOPS FUNCTIONS =====
  function asSendTroops(targetId, amount) {
    if (!gameSocket || gameSocket.readyState !== 1 || !currentClientID) return false
    const intent = { type: 'donate_troops', clientID: currentClientID, recipient: targetId, troops: amount == null ? null : num(amount) }
    try {
      gameSocket.send(JSON.stringify({ type: 'intent', intent }))
      return true
    } catch { return false }
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
      if (now - last >= S.asTroopsCooldownSec * 1000) {
        if (asSendTroops(target.id, toSend)) {
          S.asTroopsLastSend[target.id] = now
          S.asTroopsLog.push(`[${fmtTime(nowDate())}] Sent ${short(toSend)} troops to ${target.name}`)
          if (S.asTroopsLog.length > 100) S.asTroopsLog.shift()
          shouldRender = true
        }
      }
    }
  }

  let asTroopsTimer = null
  function asTroopsStart() {
    S.asTroopsRunning = true
    if (asTroopsTimer) clearInterval(asTroopsTimer)
    asTroopsTimer = setInterval(asTroopsTick, 800)
    shouldRender = true
  }
  function asTroopsStop() {
    S.asTroopsRunning = false
    if (asTroopsTimer) { clearInterval(asTroopsTimer); asTroopsTimer = null }
    shouldRender = true
  }

  // ===== AUTO-DONATE GOLD FUNCTIONS =====
  function asSendGold(targetId, amount) {
    if (!gameSocket || gameSocket.readyState !== 1 || !currentClientID) return false
    const intent = { type: 'donate_gold', clientID: currentClientID, recipient: targetId, gold: num(amount) }
    try {
      gameSocket.send(JSON.stringify({ type: 'intent', intent }))
      return true
    } catch { return false }
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
      if (now - last >= S.asGoldCooldownSec * 1000) {
        if (asSendGold(target.id, toSend)) {
          S.asGoldLastSend[target.id] = now
          S.asGoldLog.push(`[${fmtTime(nowDate())}] Sent ${short(toSend)} gold to ${target.name}`)
          if (S.asGoldLog.length > 100) S.asGoldLog.shift()
          shouldRender = true
        }
      }
    }
  }

  let asGoldTimer = null
  function asGoldStart() {
    S.asGoldRunning = true
    if (asGoldTimer) clearInterval(asGoldTimer)
    asGoldTimer = setInterval(asGoldTick, 800)
    shouldRender = true
  }
  function asGoldStop() {
    S.asGoldRunning = false
    if (asGoldTimer) { clearInterval(asGoldTimer); asGoldTimer = null }
    shouldRender = true
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
  function worldToScreen(worldX, worldY) {
    const scaleX = screenCanvasWidth / worldTilesWidth
    const scaleY = screenCanvasHeight / worldTilesHeight
    const screenX = worldX * scaleX * currentTransform.a + currentTransform.e
    const screenY = worldY * scaleY * currentTransform.d + currentTransform.f
    return { x: screenX, y: screenY }
  }

  function tileCoordsToWorld(tileRef) {
    if (!worldTilesWidth) return null
    const x = tileRef % worldTilesWidth
    const y = Math.floor(tileRef / worldTilesWidth)
    return { x, y }
  }

  function drawOverlays() {
    if (!targetCanvas) return
    const ctx = targetCanvas.getContext('2d')
    if (!ctx) return

    // FIXED: SAM overlay positioning - use center of tile
    if (S.samOverlayEnabled) {
      ctx.save()
      const me = readMyPlayer()
      for (const sam of samUnits.values()) {
        const coords = tileCoordsToWorld(sam.ref)
        if (!coords) continue

        // FIXED: Add 0.5 to center the circle on the tile
        const pos = worldToScreen(coords.x + 0.5, coords.y + 0.5)
        const radiusPixels = SAM_RANGE_TILES * (screenCanvasWidth / worldTilesWidth) * currentTransform.a

        if (me && sam.ownerID === me.smallID) {
          ctx.strokeStyle = 'rgba(100, 150, 255, 0.7)'
        } else if (me && asIsAlly(sam.ownerID)) {
          ctx.strokeStyle = 'rgba(100, 255, 100, 0.7)'
        } else {
          ctx.strokeStyle = 'rgba(255, 100, 100, 0.7)'
        }

        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, radiusPixels, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()
    }

    if (S.atomOverlayEnabled) {
      const mouseWorldX = (lastMouseClient.x - currentTransform.e) / ((screenCanvasWidth / worldTilesWidth) * currentTransform.a)
      const mouseWorldY = (lastMouseClient.y - currentTransform.f) / ((screenCanvasHeight / worldTilesHeight) * currentTransform.d)
      const pos = worldToScreen(mouseWorldX, mouseWorldY)

      ctx.save()
      const innerRadius = ATOM_INNER * (screenCanvasWidth / worldTilesWidth) * currentTransform.a
      const outerRadius = ATOM_OUTER * (screenCanvasWidth / worldTilesWidth) * currentTransform.a

      ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, innerRadius, 0, Math.PI * 2)
      ctx.stroke()

      ctx.strokeStyle = 'rgba(255, 100, 0, 0.5)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, outerRadius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    if (S.hydrogenOverlayEnabled) {
      const mouseWorldX = (lastMouseClient.x - currentTransform.e) / ((screenCanvasWidth / worldTilesWidth) * currentTransform.a)
      const mouseWorldY = (lastMouseClient.y - currentTransform.f) / ((screenCanvasHeight / worldTilesHeight) * currentTransform.d)
      const pos = worldToScreen(mouseWorldX, mouseWorldY)

      ctx.save()
      const innerRadius = HYDROGEN_INNER * (screenCanvasWidth / worldTilesWidth) * currentTransform.a
      const outerRadius = HYDROGEN_OUTER * (screenCanvasWidth / worldTilesWidth) * currentTransform.a

      ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, innerRadius, 0, Math.PI * 2)
      ctx.stroke()

      ctx.strokeStyle = 'rgba(0, 150, 255, 0.5)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, outerRadius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }

  if (window.requestAnimationFrame) {
    const origRAF = window.requestAnimationFrame
    window.requestAnimationFrame = function(callback) {
      return origRAF.call(this, function(time) {
        callback(time)
        try { drawOverlays() } catch {}
      })
    }
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

  const tabs = ['summary', 'stats', 'aiinsights', 'ports', 'feed', 'goldrate', 'alliances', 'autotroops', 'autogold', 'overlays', 'embargo', 'hotkeys']
  ui.innerHTML = `
    <div id="hm-head" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#151f33;border-bottom:1px solid #86531f;cursor:move;flex-shrink:0">
      <div><b>HAMMER v8.3</b> <span style="opacity:.85">Fixed</span></div>
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
    <div id="hm-body" style="height:${SIZES[S.sizeIdx].bodyH}px;overflow:auto;padding:10px">
      <style>
        #hammer-v8 .row{display:flex;justify-content:space-between;gap:10px;margin:2px 0;align-items:center}
        #hammer-v8 .muted{color:#9bb0c8}
        #hammer-v8 .mono{font-feature-settings:"tnum";font-variant-numeric:tabular-nums}
        #hammer-v8 .title{font-weight:700;margin:8px 0 4px;color:#ffcf5d}
        #hammer-v8 .box{padding:8px;border:1px solid #2a3a55;border-radius:8px;background:#101a2a;margin:6px 0}
        #hammer-v8 .help{color:#7bb8ff;font-size:11px;line-height:1.4;margin:4px 0}
        #hammer-v8 .example{background:#0d1520;border-left:3px solid #4a6894;padding:6px 8px;margin:6px 0;font-size:11px;line-height:1.5}
        #hammer-v8 .example-title{color:#7bb8ff;font-weight:700;margin-bottom:4px}
        #hammer-v8 button{background:#0e1a2f;color:#e7eef5;border:1px solid #2a3a55;border-radius:6px;padding:4px 8px;cursor:pointer;font:11px Consolas,Menlo,monospace}
        #hammer-v8 button:hover{background:#253454}
        #hammer-v8 button.active{background:#2a5244;border-color:#4a8864}
        #hammer-v8 button.danger{background:#3a1f1f;border-color:#ff8b94}
        #hammer-v8 button.danger:hover{background:#4a2525}
        #hammer-v8 input,#hammer-v8 select{background:#0e1a2f;color:#e7eef5;border:1px solid #2a3a55;border-radius:6px;padding:4px 8px;font:12px Consolas,Menlo,monospace}
        #hammer-v8 input:focus{outline:2px solid #4a6894;background:#152030}
        #hammer-v8 input[type="range"]{width:100%;margin:8px 0}
        #hammer-v8 .player-list{display:flex;flex-direction:column;gap:4px;max-height:400px;overflow:auto}
        #hammer-v8 .player-btn{justify-content:flex-start;width:100%;text-align:left}
        #hammer-v8 .hotkey{display:inline-block;background:#1a2a3f;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:6px;color:#7bb8ff}
        #hammer-v8 .stat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:8px 0}
        #hammer-v8 .stat-card{background:#0d1520;border:1px solid #2a3a55;border-radius:6px;padding:10px}
        #hammer-v8 .stat-label{color:#9bb0c8;font-size:10px;text-transform:uppercase;margin-bottom:4px}
        #hammer-v8 .stat-value{color:#7ff2a3;font-size:18px;font-weight:700}
        #hammer-v8 .recommendation{background:#1a2a1f;border-left:3px solid #4a8864;padding:8px;margin:6px 0;font-size:11px}
        #hammer-v8 .warning{background:#2a1f1a;border-left:3px solid #ff8b94;padding:8px;margin:6px 0;font-size:11px}
        #hammer-v8 .status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
        #hammer-v8 .status-dot.running{background:#7ff2a3;animation:pulse 2s infinite}
        #hammer-v8 .status-dot.stopped{background:#ff8b94}
        #hammer-v8 .preview-calc{background:#0d1520;border:2px solid #4a8864;border-radius:8px;padding:12px;margin:12px 0;font-size:14px;color:#7ff2a3}
        #hammer-v8 .tag-list{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}
        #hammer-v8 .tag{background:#2a3a55;padding:4px 8px;border-radius:12px;font-size:11px;display:inline-flex;align-items:center;gap:6px}
        #hammer-v8 .tag-remove{cursor:pointer;color:#ff8b94;font-weight:bold}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
      </style>
      <div id="hm-content"></div>
    </div>
  `
  document.body.appendChild(ui)

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
    ui.querySelector('#hm-size').textContent = s.label
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

  ui.querySelector('#hm-close').onclick = () => { cleanup(); ui.remove() }
  ui.querySelector('#hm-size').onclick = () => applySize(S.sizeIdx + 1)
  ui.querySelector('#hm-mini').onclick = () => setMin(!S.minimized)
  ui.querySelector('#hm-pause').onclick = () => {
    S.paused = !S.paused
    ui.querySelector('#hm-pause').textContent = S.paused ? 'Resume' : 'Pause'
    shouldRender = true
  }
  ui.querySelector('#hm-tag').onclick = () => {
    if (!S.filterTagMates && !S.myTag) {
      const t = prompt('Enter your clan tag (without brackets)\nExample: If your name is [ABC]PlayerName, enter: ABC')
      if (t?.trim()) S.myTag = t.trim()
    }
    S.filterTagMates = !S.filterTagMates
    ui.querySelector('#hm-tag').textContent = S.filterTagMates ? `Tag[${S.myTag}]` : 'Tag'
    shouldRender = true
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
    a.download = `hammer_v8.3_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 800)
  }
  ui.querySelector('#hm-tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab')
    if (!b) return
    savedScrollPositions[S.view] = bodyEl.scrollTop
    S.view = b.getAttribute('data-v')
    shouldRender = true
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

      html += '<div style="font-size:11px;max-height:300px;overflow:auto">'
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

      html += '<div style="font-size:11px;max-height:300px;overflow:auto">'
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

  // FIXED: Restored metric-based ports UI
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

    // FIXED: Individual port cards with metrics
    html += '<div class="title">Port Details</div>'
    for (const row of rows) {
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
      .slice(0, 200)

    if (!all.length) {
      return html + '<div class="muted">No donations yet</div>'
    }

    html += '<div style="max-height:500px;overflow:auto;font-size:11px">'
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
      html += '<div class="player-list">'
      for (const p of teammates) {
        const maxT = estimateMaxTroops(p.tilesOwned, p.smallID)
        const troopPct = maxT > 0 ? Math.round((p.troops / maxT) * 100) : 0
        html += `<div class="box" style="margin:0">`
        html += `<div class="row"><div style="font-weight:700">${esc(p.displayName || p.name || 'Unknown')}</div><div class="mono">${troopPct}%</div></div>`
        html += `<div class="row muted" style="font-size:10px"><div>Troops</div><div class="mono">${short(p.troops)} / ${short(maxT)}</div></div>`
        html += '</div>'
      }
      html += '</div>'
    }
    html += '</div>'

    const allies = getAllies()
    html += '<div class="box"><div class="title" style="margin-top:0">🤝 Allies</div>'
    if (!allies.length) {
      html += '<div class="muted">No active alliances</div>'
    } else {
      html += '<div class="player-list">'
      for (const p of allies) {
        const maxT = estimateMaxTroops(p.tilesOwned, p.smallID)
        const troopPct = maxT > 0 ? Math.round((p.troops / maxT) * 100) : 0
        html += `<div class="box" style="margin:0">`
        html += `<div class="row"><div style="font-weight:700">${esc(p.displayName || p.name || 'Unknown')}</div><div class="mono">${troopPct}%</div></div>`
        html += `<div class="row muted" style="font-size:10px"><div>Troops</div><div class="mono">${short(p.troops)} / ${short(maxT)}</div></div>`
        html += '</div>'
      }
      html += '</div>'
    }
    html += '</div>'

    if (S.myTag) {
      const tagmates = getTagMates()
      html += '<div class="box"><div class="title" style="margin-top:0">🏷️ Tag Mates [' + esc(S.myTag) + ']</div>'
      if (!tagmates.length) {
        html += '<div class="muted">No other players with your tag found</div>'
      } else {
        html += '<div class="player-list">'
        for (const p of tagmates) {
          const maxT = estimateMaxTroops(p.tilesOwned, p.smallID)
          const troopPct = maxT > 0 ? Math.round((p.troops / maxT) * 100) : 0
          html += `<div class="box" style="margin:0">`
          html += `<div class="row"><div style="font-weight:700">${esc(p.displayName || p.name || 'Unknown')}</div><div class="mono">${troopPct}%</div></div>`
          html += `<div class="row muted" style="font-size:10px"><div>Troops</div><div class="mono">${short(p.troops)} / ${short(maxT)}</div></div>`
          html += '</div>'
        }
        html += '</div>'
      }
      html += '</div>'
    }

    return html
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

    html += '<div class="box">'
    html += '<div class="title" style="margin-top:0">⚙️ Settings</div>'
    html += `<div class="row"><div>Ratio: <b>${S.asTroopsRatio}%</b></div></div>`
    html += `<input type="range" id="at-ratio-slider" min="1" max="100" value="${S.asTroopsRatio}" style="width:100%">`
    html += `<div class="row"><div>Threshold: <b>${S.asTroopsThreshold}%</b></div></div>`
    html += `<input type="range" id="at-threshold-slider" min="0" max="100" value="${S.asTroopsThreshold}" style="width:100%">`
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
        html += '<div class="player-list" style="max-height:200px">'
        for (const p of allTargets) {
          const name = p.displayName || p.name || 'Unknown'
          const isSelected = S.asTroopsTargets.includes(name)
          html += `<button class="player-btn ${isSelected ? 'active' : ''}" data-toggle-troop-target="${esc(name)}" style="margin:2px 0">`
          html += `<div style="display:flex;justify-content:space-between;width:100%">`
          html += `<div>${esc(name)}</div>`
          html += `<div class="mono">${short(p.troops)}</div>`
          html += '</div></button>'
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

    if (S.asTroopsLog.length > 0) {
      html += '<div class="title">📋 Activity Log</div>'
      html += '<div style="max-height:150px;overflow:auto;font-size:11px;background:#0d1520;padding:8px;border-radius:6px">'
      const logs = [...S.asTroopsLog].reverse()
      for (const entry of logs) {
        html += `<div style="margin:2px 0">${esc(entry)}</div>`
      }
      html += '</div>'
    }

    return html
  }

  // FIXED: Auto-gold tab
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
    html += `<div class="row"><div>Cooldown</div><input id="ag-cooldown" type="number" value="${S.asGoldCooldownSec}" min="10" max="60" step="1" style="width:80px"><div class="muted" style="margin-left:8px">seconds</div></div>`
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
        html += '<div class="muted">No targets selected</div>'
      }

      const teammates = getTeammates()
      const allies = getAllies()
      const tagmates = getTagMates()
      const allTargets = [...teammates, ...allies, ...tagmates].filter((p, i, arr) =>
        arr.findIndex(x => x.id === p.id) === i
      )

      if (allTargets.length > 0) {
        html += '<div class="player-list" style="max-height:200px">'
        for (const p of allTargets) {
          const name = p.displayName || p.name || 'Unknown'
          const isSelected = S.asGoldTargets.includes(name)
          html += `<button class="player-btn ${isSelected ? 'active' : ''}" data-toggle-gold-target="${esc(name)}" style="margin:2px 0">`
          html += `<div style="display:flex;justify-content:space-between;width:100%">`
          html += `<div>${esc(name)}</div>`
          html += `<div class="mono">${short(p.gold || 0)} 💰</div>`
          html += '</div></button>'
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

    if (S.asGoldLog.length > 0) {
      html += '<div class="title">📋 Activity Log</div>'
      html += '<div style="max-height:150px;overflow:auto;font-size:11px;background:#0d1520;padding:8px;border-radius:6px">'
      const logs = [...S.asGoldLog].reverse()
      for (const entry of logs) {
        html += `<div style="margin:2px 0">${esc(entry)}</div>`
      }
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
    html += '<div class="help">Bulk embargo controls</div>'

    html += '<div class="box">'
    html += '<div class="warning">⚠️ WARNING: Affects ALL players!</div>'
    html += '<div class="row" style="margin-top:12px">'
    html += '<button id="emb-all">Embargo All</button>'
    html += '<button id="unemb-all">Un-embargo All</button>'
    html += '<span class="hotkey">ALT+E</span>'
    html += '</div>'
    html += '</div>'

    html += '<div class="help" style="margin-top:12px">'
    html += '<b>What is an embargo?</b><br>'
    html += 'Prevents players from trading with ports on your territory.'
    html += '</div>'

    return html
  }

  function hotkeysView() {
    let html = '<div class="title">⌨️ Keyboard Shortcuts</div>'
    html += '<div class="help">All hotkeys</div>'

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
      summary: summaryView,
      stats: statsView,
      aiinsights: aiInsightsView,
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

    if (savedScrollPositions[S.view] !== undefined) {
      bodyEl.scrollTop = savedScrollPositions[S.view]
    }

    // Auto-troops handlers
    const atRatioSlider = ui.querySelector('#at-ratio-slider')
    const atThresholdSlider = ui.querySelector('#at-threshold-slider')
    const atCooldown = ui.querySelector('#at-cooldown')
    const atAllTeamToggle = ui.querySelector('#at-allteam-toggle')
    const atStart = ui.querySelector('#at-start')
    const atClear = ui.querySelector('#at-clear')

    if (atRatioSlider) {
      atRatioSlider.oninput = () => {
        S.asTroopsRatio = num(atRatioSlider.value)
        shouldRender = true
      }
    }
    if (atThresholdSlider) {
      atThresholdSlider.oninput = () => {
        S.asTroopsThreshold = num(atThresholdSlider.value)
        shouldRender = true
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
        shouldRender = true
      }
    }
    if (atStart) {
      atStart.onclick = () => {
        if (S.asTroopsRunning) asTroopsStop()
        else asTroopsStart()
        shouldRender = true
      }
    }
    if (atClear) {
      atClear.onclick = () => {
        S.asTroopsLog = []
        shouldRender = true
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
        shouldRender = true
      }
    })

    ui.querySelectorAll('[data-remove-troop-target]').forEach(span => {
      span.onclick = (e) => {
        e.stopPropagation()
        const target = span.getAttribute('data-remove-troop-target')
        const idx = S.asTroopsTargets.indexOf(target)
        if (idx >= 0) S.asTroopsTargets.splice(idx, 1)
        shouldRender = true
      }
    })

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
        shouldRender = true
      }
    }
    if (agThreshold) {
      agThreshold.onchange = () => {
        S.asGoldThreshold = num(agThreshold.value)
        shouldRender = true
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
        shouldRender = true
      }
    }
    if (agStart) {
      agStart.onclick = () => {
        if (S.asGoldRunning) asGoldStop()
        else asGoldStart()
        shouldRender = true
      }
    }
    if (agClear) {
      agClear.onclick = () => {
        S.asGoldLog = []
        shouldRender = true
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
        shouldRender = true
      }
    })

    ui.querySelectorAll('[data-remove-gold-target]').forEach(span => {
      span.onclick = (e) => {
        e.stopPropagation()
        const target = span.getAttribute('data-remove-gold-target')
        const idx = S.asGoldTargets.indexOf(target)
        if (idx >= 0) S.asGoldTargets.splice(idx, 1)
        shouldRender = true
      }
    })

    // Overlay toggles
    const ovSam = ui.querySelector('#ov-sam')
    const ovAtom = ui.querySelector('#ov-atom')
    const ovHydrogen = ui.querySelector('#ov-hydrogen')

    if (ovSam) ovSam.onclick = () => { S.samOverlayEnabled = !S.samOverlayEnabled; shouldRender = true }
    if (ovAtom) ovAtom.onclick = () => { S.atomOverlayEnabled = !S.atomOverlayEnabled; shouldRender = true }
    if (ovHydrogen) ovHydrogen.onclick = () => { S.hydrogenOverlayEnabled = !S.hydrogenOverlayEnabled; shouldRender = true }

    // Embargo buttons
    const embAll = ui.querySelector('#emb-all')
    const unembAll = ui.querySelector('#unemb-all')

    if (embAll) embAll.onclick = () => embargoAll()
    if (unembAll) unembAll.onclick = () => unembargoAll()
  }

  const tickId = setInterval(() => {
    if (shouldRender) {
      render()
      shouldRender = false
    }
  }, 500)

  function cleanup() {
    clearInterval(tickId)
    if (asTroopsTimer) clearInterval(asTroopsTimer)
    if (asGoldTimer) clearInterval(asGoldTimer)
    if (statusOverlay) statusOverlay.remove()
  }

  window.__HAMMER__ = { cleanup, ui: { root: ui }, version: '8.3' }

  render()
  console.log('%c[HAMMER]%c v8.3 FIXED ready! 🔨', 'color:#deb887;font-weight:bold', 'color:inherit')
  console.log('[HAMMER] ✅ Fixed: decimals rounded, SAM positioning, teammate overlay removed, ports UI restored!')
})()
