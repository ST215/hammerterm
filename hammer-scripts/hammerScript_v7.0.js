// =====================================================================
// HAMMER v7.0 "HOTKEY EDITION"
// Keyboard shortcuts + Ally/Teammate lists + ALT+M hover capture
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

  // Status overlay for hotkey feedback
  let statusOverlay = null

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
    { w: 480, h: 380, bodyH: 332 },
    { w: 700, h: 520, bodyH: 472 },
    { w: 900, h: 660, bodyH: 612 }
  ]

  const S = {
    view: 'inbound',
    paused: false, minimized: false, sizeIdx: 1,
    myTag: null, filterTagMates: false,
    seen: new Set(),

    // Donation tracking
    inbound: new Map(), outbound: new Map(), ports: new Map(),
    feedIn: [], feedOut: [], rawMessages: [],

    // Feature toggles
    goldRateEnabled: true, samOverlayEnabled: false,
    atomOverlayEnabled: false, hydrogenOverlayEnabled: false,
    alliancesOverlayEnabled: false,

    // Auto-donate troops state
    asTroopsRunning: false, asTroopsTarget: '', asTroopsRatio: 20, asTroopsThreshold: 50,
    asTroopsLastSend: {}, asTroopsCooldownMs: 10000, asTroopsLog: [],

    // Auto-donate gold state
    asGoldRunning: false, asGoldTarget: '', asGoldAmount: 10000, asGoldThreshold: 100000,
    asGoldLastSend: {}, asGoldCooldownMs: 10000, asGoldLog: []
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
          myAlliances = Array.isArray(my.alliances) ? my.alliances.slice() : []
          if (S.goldRateEnabled) updateGoldRate(my)
        }
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
          S.feedIn.push({ ts: nowDate(), type: 'troops', name, amount: amt })
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
          S.feedOut.push({ ts: nowDate(), type: 'troops', name, amount: amt })
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
          S.feedIn.push({ ts: nowDate(), type: 'gold', name, amount: amt })
          if (S.feedIn.length > 500) S.feedIn.shift()
          bumpPorts(from.id, amt, now)
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
          S.feedIn.push({ ts: nowDate(), type: 'gold', name, amount: amt })
          if (S.feedIn.length > 500) S.feedIn.shift()
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
          S.feedOut.push({ ts: nowDate(), type: 'gold', name, amount: amt })
          if (S.feedOut.length > 500) S.feedOut.shift()
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

      // Convert mouse screen coordinates to world tile coordinates
      const mouseWorldX = Math.floor((lastMouseClient.x - currentTransform.e) / ((screenCanvasWidth / worldTilesWidth) * currentTransform.a))
      const mouseWorldY = Math.floor((lastMouseClient.y - currentTransform.f) / ((screenCanvasHeight / worldTilesHeight) * currentTransform.d))
      const tileRef = mouseWorldY * worldTilesWidth + mouseWorldX

      // Look up tile owner
      const ownerSmallID = tileOwnerByRef.get(tileRef)
      if (ownerSmallID == null || ownerSmallID === 0) {
        showStatus('❌ No player owns this tile')
        return
      }

      // Find player by smallID
      const player = playersBySmallId.get(ownerSmallID)
      if (!player) {
        showStatus(`❌ Player not found (ID: ${ownerSmallID})`)
        return
      }

      const playerName = player.displayName || player.name || `Player ${ownerSmallID}`

      // Set as target for both troops and gold auto-donate
      S.asTroopsTarget = playerName
      S.asGoldTarget = playerName

      showStatus(`✅ Target: ${playerName}`, 3000)
      render()
    } catch (err) {
      console.error('[HAMMER] ALT+M error:', err)
      showStatus('❌ Failed to capture target')
    }
  }

  window.addEventListener('keydown', (e) => {
    // ALT+M: Capture mouse target
    if (e.altKey && e.code === 'KeyM') {
      e.preventDefault()
      captureMouseTarget()
      return
    }

    // ALT+F: Toggle auto-feeder (troops)
    if (e.altKey && e.code === 'KeyF') {
      e.preventDefault()
      if (S.asTroopsRunning) {
        asTroopsStop()
        showStatus('⏸️ Auto-Feeder STOPPED')
      } else {
        if (!S.asTroopsTarget) {
          showStatus('❌ Set target first (ALT+M)')
          return
        }
        asTroopsStart()
        showStatus('▶️ Auto-Feeder STARTED')
      }
      render()
      return
    }

    // ALT+T: Toggle alliances overlay
    if (e.altKey && e.code === 'KeyT') {
      e.preventDefault()
      S.alliancesOverlayEnabled = !S.alliancesOverlayEnabled
      showStatus(S.alliancesOverlayEnabled ? '✅ Alliances Overlay ON' : '⏹️ Alliances Overlay OFF')
      render()
      return
    }

    // ALT+E: Embargo all
    if (e.altKey && e.code === 'KeyE') {
      e.preventDefault()
      embargoAll()
      return
    }

    // ALT+A: Toggle atom bomb overlay
    if (e.altKey && e.code === 'KeyA') {
      e.preventDefault()
      S.atomOverlayEnabled = !S.atomOverlayEnabled
      showStatus(S.atomOverlayEnabled ? '💣 Atom Bomb Overlay ON' : '⏹️ Atom Bomb Overlay OFF')
      render()
      return
    }

    // ALT+H: Toggle hydrogen bomb overlay
    if (e.altKey && e.code === 'KeyH') {
      e.preventDefault()
      S.hydrogenOverlayEnabled = !S.hydrogenOverlayEnabled
      showStatus(S.hydrogenOverlayEnabled ? '☢️ Hydrogen Bomb Overlay ON' : '⏹️ Hydrogen Bomb Overlay OFF')
      render()
      return
    }

    // CTRL+SHIFT+F: Toggle SAM overlay
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyF') {
      e.preventDefault()
      S.samOverlayEnabled = !S.samOverlayEnabled
      showStatus(S.samOverlayEnabled ? '🎯 SAM Overlay ON' : '⏹️ SAM Overlay OFF')
      render()
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

  function asTroopsTick() {
    if (!S.asTroopsRunning) return
    const now = Date.now()
    const ids = asResolveTarget(S.asTroopsTarget)
    if (!ids.length) return

    let chosen = null
    for (const id of ids) {
      if (!asIsAlly(id)) continue
      const last = S.asTroopsLastSend[id] || 0
      if (now - last >= S.asTroopsCooldownMs) { chosen = id; break }
    }
    if (!chosen) return

    const me = readMyPlayer()
    if (!me) return
    const troops = me.troops || 0
    const maxT = estimateMaxTroops(me.tilesOwned, me.smallID)
    if (!maxT || (troops / maxT) * 100 < S.asTroopsThreshold) return

    const toSend = Math.max(1, Math.floor(troops * (S.asTroopsRatio / 100)))
    if (asSendTroops(chosen, toSend)) {
      S.asTroopsLastSend[chosen] = now
      const p = playersById.get(chosen)
      const name = p ? (p.displayName || p.name || chosen) : chosen
      S.asTroopsLog.push(`[${fmtTime(nowDate())}] Sent ${short(toSend)} troops to ${name}`)
      if (S.asTroopsLog.length > 100) S.asTroopsLog.shift()
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
    if (!gameSocket || gameSocket.readyState !== 1 || !currentClientID) return false
    const intent = { type: 'donate_gold', clientID: currentClientID, recipient: targetId, gold: num(amount) }
    try {
      gameSocket.send(JSON.stringify({ type: 'intent', intent }))
      return true
    } catch { return false }
  }

  function asGoldTick() {
    if (!S.asGoldRunning) return
    const now = Date.now()
    const ids = asResolveTarget(S.asGoldTarget)
    if (!ids.length) return

    let chosen = null
    for (const id of ids) {
      if (!asIsAlly(id)) continue
      const last = S.asGoldLastSend[id] || 0
      if (now - last >= S.asGoldCooldownMs) { chosen = id; break }
    }
    if (!chosen) return

    const me = readMyPlayer()
    if (!me) return
    const gold = me.gold || 0
    if (gold < S.asGoldThreshold) return

    const toSend = num(S.asGoldAmount)
    if (toSend <= 0) return

    if (asSendGold(chosen, toSend)) {
      S.asGoldLastSend[chosen] = now
      const p = playersById.get(chosen)
      const name = p ? (p.displayName || p.name || chosen) : chosen
      S.asGoldLog.push(`[${fmtTime(nowDate())}] Sent ${short(toSend)} gold to ${name}`)
      if (S.asGoldLog.length > 100) S.asGoldLog.shift()
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
    showStatus(`🚫 Embargoed ${ct} players`)
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

  function drawOverlays() {
    if (!targetCanvas) return
    const ctx = targetCanvas.getContext('2d')
    if (!ctx) return

    // SAM Overlay
    if (S.samOverlayEnabled) {
      ctx.save()
      const me = readMyPlayer()
      for (const sam of samUnits.values()) {
        const pos = worldToScreen(sam.ref % worldTilesWidth, Math.floor(sam.ref / worldTilesWidth))
        const radiusPixels = SAM_RANGE_TILES * (screenCanvasWidth / worldTilesWidth) * currentTransform.a

        // Color code: blue=mine, green=ally, red=enemy
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

    // Atom Bomb Overlay
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

    // Hydrogen Bomb Overlay
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

  // Hook into animation frame
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
  ui.id = 'hammer-v7'
  Object.assign(ui.style, {
    position: 'fixed', right: '14px', bottom: '14px',
    width: SIZES[S.sizeIdx].w + 'px', height: SIZES[S.sizeIdx].h + 'px',
    background: '#0b1220', color: '#e7eef5',
    font: '12px/1.35 Consolas,Menlo,monospace',
    border: '2px solid #86531f', borderRadius: '10px',
    zIndex: '2147483645', boxShadow: '0 10px 28px rgba(0,0,0,.55)',
    overflow: 'hidden', userSelect: 'none', resize: 'both'
  })

  const tabs = ['inbound', 'outbound', 'ports', 'feed', 'goldrate', 'alliances', 'autotroops', 'autogold', 'overlays', 'embargo', 'hotkeys']
  ui.innerHTML = `
    <div id="hm-head" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#151f33;border-bottom:1px solid #86531f;cursor:move;flex-shrink:0">
      <div><b>HAMMER v7.0</b> <span style="opacity:.85">Hotkey Edition</span></div>
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
        #hammer-v7 .row{display:flex;justify-content:space-between;gap:10px;margin:2px 0;align-items:center}
        #hammer-v7 .muted{color:#9bb0c8}
        #hammer-v7 .mono{font-feature-settings:"tnum";font-variant-numeric:tabular-nums}
        #hammer-v7 .title{font-weight:700;margin:8px 0 4px;color:#ffcf5d}
        #hammer-v7 .box{padding:8px;border:1px solid #2a3a55;border-radius:8px;background:#101a2a;margin:6px 0}
        #hammer-v7 .help{color:#7bb8ff;font-size:11px;line-height:1.4;margin:4px 0}
        #hammer-v7 button{background:#0e1a2f;color:#e7eef5;border:1px solid #2a3a55;border-radius:6px;padding:4px 8px;cursor:pointer;font:11px Consolas,Menlo,monospace}
        #hammer-v7 button:hover{background:#253454}
        #hammer-v7 button.active{background:#2a5244;border-color:#4a8864}
        #hammer-v7 input,#hammer-v7 select{background:#0e1a2f;color:#e7eef5;border:1px solid #2a3a55;border-radius:6px;padding:4px 8px;font:12px Consolas,Menlo,monospace}
        #hammer-v7 input:focus{outline:2px solid #4a6894;background:#152030}
        #hammer-v7 .player-list{display:flex;flex-direction:column;gap:4px;max-height:200px;overflow:auto}
        #hammer-v7 .player-btn{justify-content:flex-start;width:100%;text-align:left}
        #hammer-v7 .hotkey{display:inline-block;background:#1a2a3f;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:6px;color:#7bb8ff}
      </style>
      <div id="hm-content"></div>
    </div>
  `
  document.body.appendChild(ui)

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
    a.download = `hammer_v7.0_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
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

  function autoDonateTroopsView() {
    const me = readMyPlayer()
    const troops = me ? me.troops : 0
    const maxT = me ? estimateMaxTroops(me.tilesOwned, me.smallID) : 0
    const pct = maxT ? ((troops / maxT) * 100).toFixed(1) : 0

    const teammates = getTeammates()
    const allies = getAllies()

    return `
      <div class="title">Auto-Donate Troops <span class="hotkey">ALT+F to toggle</span></div>
      <div class="help">
        Hover over a territory and press <b>ALT+M</b> to capture target, or click a player below.
      </div>
      <div class="box">
        <div class="row">
          <span>Status:</span>
          <span><b style="color:${S.asTroopsRunning ? '#7ff2a3' : '#ff8b94'}">${S.asTroopsRunning ? 'RUNNING' : 'STOPPED'}</b></span>
        </div>
        <div class="row"><span>Current Troops:</span><span class="mono">${short(troops / 10)} (${pct}%)</span></div>
        <div class="row"><span>Max Troops:</span><span class="mono">${short(maxT / 10)}</span></div>
        <div class="row">
          <span>Target:</span>
          <span class="mono">${S.asTroopsTarget || '(none)'}</span>
        </div>
      </div>
      <div class="box">
        <div class="row">
          <label>Ratio (%):</label>
          <input id="as-troops-ratio" type="number" min="1" max="100" value="${S.asTroopsRatio}" style="width:80px">
        </div>
        <div class="row">
          <label>Threshold (%):</label>
          <input id="as-troops-threshold" type="number" min="1" max="100" value="${S.asTroopsThreshold}" style="width:80px">
        </div>
        <div class="row">
          <button id="as-troops-start">Start</button>
          <button id="as-troops-stop">Stop</button>
          <button id="as-troops-allplayers">Set All Allies</button>
        </div>
      </div>
      ${teammates.length > 0 ? `
        <div class="title">Teammates (${teammates.length})</div>
        <div class="player-list">
          ${teammates.map(p => `<button class="player-btn" data-name="${esc(p.displayName || p.name)}">${esc(p.displayName || p.name)} <span class="muted">(ID: ${p.smallID})</span></button>`).join('')}
        </div>
      ` : ''}
      ${allies.length > 0 ? `
        <div class="title">Allies (${allies.length})</div>
        <div class="player-list">
          ${allies.map(p => `<button class="player-btn" data-name="${esc(p.displayName || p.name)}">${esc(p.displayName || p.name)} <span class="muted">(ID: ${p.smallID})</span></button>`).join('')}
        </div>
      ` : ''}
      <div class="title">Activity Log</div>
      <div class="box" style="max-height:120px;overflow:auto">
        ${S.asTroopsLog.length ? S.asTroopsLog.slice(-20).reverse().map(l => `<div class="muted">${esc(l)}</div>`).join('') : '<span class="muted">No activity yet</span>'}
      </div>
    `
  }

  function autoDonateGoldView() {
    const me = readMyPlayer()
    const gold = me ? me.gold : 0

    const teammates = getTeammates()
    const allies = getAllies()

    return `
      <div class="title">Auto-Donate Gold</div>
      <div class="help">
        Hover over a territory and press <b>ALT+M</b> to capture target, or click a player below.
      </div>
      <div class="box">
        <div class="row">
          <span>Status:</span>
          <span><b style="color:${S.asGoldRunning ? '#7ff2a3' : '#ff8b94'}">${S.asGoldRunning ? 'RUNNING' : 'STOPPED'}</b></span>
        </div>
        <div class="row"><span>Current Gold:</span><span class="mono">${short(gold)}💰</span></div>
        <div class="row">
          <span>Target:</span>
          <span class="mono">${S.asGoldTarget || '(none)'}</span>
        </div>
      </div>
      <div class="box">
        <div class="row">
          <label>Amount:</label>
          <input id="as-gold-amount" type="number" min="1000" step="1000" value="${S.asGoldAmount}" style="width:120px">
        </div>
        <div class="row">
          <label>Threshold:</label>
          <input id="as-gold-threshold" type="number" min="1000" step="1000" value="${S.asGoldThreshold}" style="width:120px">
        </div>
        <div class="row">
          <button id="as-gold-start">Start</button>
          <button id="as-gold-stop">Stop</button>
          <button id="as-gold-allplayers">Set All Allies</button>
        </div>
      </div>
      ${teammates.length > 0 ? `
        <div class="title">Teammates (${teammates.length})</div>
        <div class="player-list">
          ${teammates.map(p => `<button class="player-btn-gold" data-name="${esc(p.displayName || p.name)}">${esc(p.displayName || p.name)} <span class="muted">(ID: ${p.smallID})</span></button>`).join('')}
        </div>
      ` : ''}
      ${allies.length > 0 ? `
        <div class="title">Allies (${allies.length})</div>
        <div class="player-list">
          ${allies.map(p => `<button class="player-btn-gold" data-name="${esc(p.displayName || p.name)}">${esc(p.displayName || p.name)} <span class="muted">(ID: ${p.smallID})</span></button>`).join('')}
        </div>
      ` : ''}
      <div class="title">Activity Log</div>
      <div class="box" style="max-height:120px;overflow:auto">
        ${S.asGoldLog.length ? S.asGoldLog.slice(-20).reverse().map(l => `<div class="muted">${esc(l)}</div>`).join('') : '<span class="muted">No activity yet</span>'}
      </div>
    `
  }

  function overlaysView() {
    return `
      <div class="title">Visual Overlays</div>
      <div class="help">Use keyboard shortcuts for quick toggle</div>
      <div class="box">
        <div class="row">
          <div>
            <div>SAM Launcher Range (70 tiles)</div>
            <div class="muted">Blue=yours, Green=allies, Red=enemies</div>
          </div>
          <button id="toggle-sam" class="${S.samOverlayEnabled ? 'active' : ''}">${S.samOverlayEnabled ? 'ON' : 'OFF'} <span class="hotkey">CTRL+SHIFT+F</span></button>
        </div>
      </div>
      <div class="box">
        <div class="row">
          <div>
            <div>Atom Bomb Radius</div>
            <div class="muted">Inner: 12 tiles (kill), Outer: 30 tiles (damage)</div>
          </div>
          <button id="toggle-atom" class="${S.atomOverlayEnabled ? 'active' : ''}">${S.atomOverlayEnabled ? 'ON' : 'OFF'} <span class="hotkey">ALT+A</span></button>
        </div>
      </div>
      <div class="box">
        <div class="row">
          <div>
            <div>Hydrogen Bomb Radius</div>
            <div class="muted">Inner: 80 tiles (kill), Outer: 100 tiles (damage)</div>
          </div>
          <button id="toggle-hydrogen" class="${S.hydrogenOverlayEnabled ? 'active' : ''}">${S.hydrogenOverlayEnabled ? 'ON' : 'OFF'} <span class="hotkey">ALT+H</span></button>
        </div>
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
      <div class="title">Embargo Manager <span class="hotkey">ALT+E to embargo all</span></div>
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

  function hotkeysView() {
    return `
      <div class="title">Keyboard Shortcuts</div>
      <div class="box">
        <div class="row">
          <span><span class="hotkey">ALT + M</span> Capture Target</span>
          <span class="muted">Hover over territory, press ALT+M to set as target</span>
        </div>
        <div class="row">
          <span><span class="hotkey">ALT + F</span> Toggle Auto-Feeder</span>
          <span class="muted">Start/stop auto-donate troops</span>
        </div>
        <div class="row">
          <span><span class="hotkey">ALT + T</span> Toggle Alliances Overlay</span>
          <span class="muted">Show/hide alliance information</span>
        </div>
        <div class="row">
          <span><span class="hotkey">ALT + E</span> Embargo All</span>
          <span class="muted">Instantly embargo all players</span>
        </div>
        <div class="row">
          <span><span class="hotkey">ALT + A</span> Toggle Atom Bomb Overlay</span>
          <span class="muted">Show atom bomb radius on cursor</span>
        </div>
        <div class="row">
          <span><span class="hotkey">ALT + H</span> Toggle Hydrogen Bomb Overlay</span>
          <span class="muted">Show hydrogen bomb radius on cursor</span>
        </div>
        <div class="row">
          <span><span class="hotkey">CTRL + SHIFT + F</span> Toggle SAM Overlay</span>
          <span class="muted">Show all SAM launcher ranges (color-coded)</span>
        </div>
      </div>
      <div class="title">Tips</div>
      <div class="help">
        • Press <b>ALT+M</b> while hovering over any enemy/ally territory to quickly set them as your auto-donate target<br>
        • Use <b>ALT+F</b> to quickly toggle auto-feeder on/off during gameplay<br>
        • All overlays work in real-time and follow your cursor or update automatically<br>
        • Keyboard shortcuts work even when the HAMMER UI is minimized
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
    if (S.view === 'inbound') html = `<div class="title">Inbound → Me</div>${rowsFromMap(S.inbound)}`
    else if (S.view === 'outbound') html = `<div class="title">Outbound ← Me</div>${rowsFromMap(S.outbound)}`
    else if (S.view === 'ports') html = `<div class="title">Ports — Gold Yield</div>${portsRows()}<div class="box muted">Tip: High avg sec + low gpm = long routes</div>`
    else if (S.view === 'feed') html = `<div class="title">Activity Feed</div>${feedRows()}`
    else if (S.view === 'goldrate') html = goldRateView()
    else if (S.view === 'alliances') html = alliancesView()
    else if (S.view === 'autotroops') html = autoDonateTroopsView()
    else if (S.view === 'autogold') html = autoDonateGoldView()
    else if (S.view === 'overlays') html = overlaysView()
    else if (S.view === 'embargo') html = embargoView()
    else if (S.view === 'hotkeys') html = hotkeysView()

    ui.querySelector('#hm-content').innerHTML = html

    // Auto-donate troops event listeners
    if (S.view === 'autotroops') {
      const ratio = ui.querySelector('#as-troops-ratio')
      const thresh = ui.querySelector('#as-troops-threshold')
      const startBtn = ui.querySelector('#as-troops-start')
      const stopBtn = ui.querySelector('#as-troops-stop')
      const allBtn = ui.querySelector('#as-troops-allplayers')

      if (startBtn) startBtn.onclick = () => {
        if (ratio) S.asTroopsRatio = Math.max(1, Math.min(100, num(ratio.value)))
        if (thresh) S.asTroopsThreshold = Math.max(1, Math.min(100, num(thresh.value)))
        if (!S.asTroopsTarget) return alert('Set target first! Press ALT+M over a territory or click a player.')
        asTroopsStart()
        showStatus('▶️ Auto-Feeder STARTED')
        render()
      }
      if (stopBtn) stopBtn.onclick = () => { asTroopsStop(); showStatus('⏸️ Auto-Feeder STOPPED'); render() }
      if (allBtn) allBtn.onclick = () => { S.asTroopsTarget = 'AllPlayers'; showStatus('✅ Target: All Allies'); render() }

      // Player selection buttons
      ui.querySelectorAll('.player-btn').forEach(btn => {
        btn.onclick = () => {
          const name = btn.getAttribute('data-name')
          S.asTroopsTarget = name
          showStatus(`✅ Troops Target: ${name}`)
          render()
        }
      })
    }

    // Auto-donate gold event listeners
    if (S.view === 'autogold') {
      const amt = ui.querySelector('#as-gold-amount')
      const thresh = ui.querySelector('#as-gold-threshold')
      const startBtn = ui.querySelector('#as-gold-start')
      const stopBtn = ui.querySelector('#as-gold-stop')
      const allBtn = ui.querySelector('#as-gold-allplayers')

      if (startBtn) startBtn.onclick = () => {
        if (amt) S.asGoldAmount = Math.max(1000, num(amt.value))
        if (thresh) S.asGoldThreshold = Math.max(1000, num(thresh.value))
        if (!S.asGoldTarget) return alert('Set target first! Press ALT+M over a territory or click a player.')
        asGoldStart()
        showStatus('▶️ Auto-Gold STARTED')
        render()
      }
      if (stopBtn) stopBtn.onclick = () => { asGoldStop(); showStatus('⏸️ Auto-Gold STOPPED'); render() }
      if (allBtn) allBtn.onclick = () => { S.asGoldTarget = 'AllPlayers'; showStatus('✅ Target: All Allies'); render() }

      // Player selection buttons
      ui.querySelectorAll('.player-btn-gold').forEach(btn => {
        btn.onclick = () => {
          const name = btn.getAttribute('data-name')
          S.asGoldTarget = name
          showStatus(`✅ Gold Target: ${name}`)
          render()
        }
      })
    }

    // Overlays event listeners
    if (S.view === 'overlays') {
      const samBtn = ui.querySelector('#toggle-sam')
      const atomBtn = ui.querySelector('#toggle-atom')
      const hydrogenBtn = ui.querySelector('#toggle-hydrogen')

      if (samBtn) samBtn.onclick = () => { S.samOverlayEnabled = !S.samOverlayEnabled; render() }
      if (atomBtn) atomBtn.onclick = () => { S.atomOverlayEnabled = !S.atomOverlayEnabled; render() }
      if (hydrogenBtn) hydrogenBtn.onclick = () => { S.hydrogenOverlayEnabled = !S.hydrogenOverlayEnabled; render() }
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
    if (asTroopsTimer) clearInterval(asTroopsTimer)
    if (asGoldTimer) clearInterval(asGoldTimer)
  }

  render()

  window.__HAMMER__ = {
    state: S, ui: { root: ui }, cleanup, playersById, currentClientID, mySmallID,
    gameSocket, asTroopsStart, asTroopsStop, asGoldStart, asGoldStop, embargoAll, unembargoAll
  }

  console.log('%c[HAMMER]%c v7.0 Hotkey Edition ready! 🔨', 'color:#deb887;font-weight:bold', 'color:inherit')
  console.log('[HAMMER] Press ALT+M to capture targets, ALT+F to toggle auto-feeder')
  console.log('[HAMMER] Check the "Hotkeys" tab for all keyboard shortcuts!')
})()
