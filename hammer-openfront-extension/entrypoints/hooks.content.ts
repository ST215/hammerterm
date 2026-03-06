/**
 * hooks.content.ts — MAIN WORLD content script.
 *
 * Runs in the page's JavaScript context so it can intercept:
 *   • window.Worker constructor (capture game_update messages)
 *   • window.WebSocket constructor (capture clientID)
 *   • CanvasRenderingContext2D prototypes (capture transform/mouse)
 *   • GameView.updatesSinceLastTick (capture DisplayEvents)
 *   • EventBus (discover event classes for sending)
 *
 * Communicates with the ISOLATED world content script via window.postMessage.
 */

export default defineContentScript({
  matches: ["*://openfront.io/*", "*://*.openfront.io/*"],
  runAt: "document_start",
  world: "MAIN",

  main() {
    console.log("[Hammer:Main] Main world hooks loading");

    // ---------------------------------------------------------------
    // Constants (inlined to avoid import chain issues in MAIN world)
    // ---------------------------------------------------------------
    const GUT_UNIT = 1;
    const GUT_PLAYER = 2;
    const GUT_DISPLAY = 3;

    // ---------------------------------------------------------------
    // Internal state
    // ---------------------------------------------------------------
    let foundWorker = false;
    let foundWebSocket = false;
    let gameViewHooked = false;
    let currentClientID: string | null = null;
    let gameSocket: WebSocket | null = null;

    // EventBus
    let eventBus: any = null;
    const eventClasses: Record<string, any> = {};

    // Timers
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];
    const intervalIds: ReturnType<typeof setInterval>[] = [];

    // Canvas
    let canvasTransform = { a: 1, d: 1, e: 0, f: 0 };
    let worldTilesW = 0;
    let worldTilesH = 0;
    let screenCanvasW = 0;
    let screenCanvasH = 0;
    let targetCanvas: HTMLCanvasElement | null = null;
    let mouseX = 0;
    let mouseY = 0;

    // Tile ownership (kept in main world for ALT+M mouse targeting)
    const tileOwnerByRef = new Map<number, number>();

    // ---------------------------------------------------------------
    // Bridge: send data to ISOLATED world
    // ---------------------------------------------------------------
    function emit(type: string, payload: any) {
      try {
        window.postMessage({ __hammer: true, type, payload }, "*");
      } catch (err) {
        console.warn("[Hammer:Main] Bridge emit error:", type, err);
      }
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------
    function readProp(obj: any, prop: string): any {
      if (!obj || typeof obj !== "object") return undefined;
      const v = obj[prop];
      return typeof v === "function" ? v.call(obj) : v;
    }

    function normalizePlayer(p: any): any {
      if (!p) return null;
      const id = readProp(p, "id");
      if (id == null) return null;
      const gold = readProp(p, "gold");
      return {
        id: String(id),
        smallID: readProp(p, "smallID") ?? null,
        clientID: readProp(p, "clientID") ?? null,
        name: readProp(p, "name"),
        displayName: readProp(p, "displayName") || readProp(p, "name"),
        isAlive: readProp(p, "isAlive") ?? true,
        team: readProp(p, "team") ?? null,
        troops: Number(readProp(p, "troops") || 0),
        gold: typeof gold === "bigint" ? Number(gold) : Number(gold || 0),
        tilesOwned:
          readProp(p, "numTilesOwned") ?? readProp(p, "tilesOwned") ?? 0,
        allies: readProp(p, "allies") ?? undefined,
      };
    }

    function normalizeList(raw: any): any[] {
      if (raw instanceof Map) return [...raw.values()];
      if (Array.isArray(raw)) return raw;
      if (raw && typeof raw === "object") return Object.values(raw);
      return [];
    }

    // ============================
    // WORKER HOOK
    // ============================

    const OriginalWorker = window.Worker;

    function wrapWorker(w: any) {
      if (!w || w.__hammerWrapped) return w;
      w.__hammerWrapped = true;

      const origPost = w.postMessage;
      w.postMessage = function (data: any, ...rest: any[]) {
        try {
          if (data?.type === "init" && data.clientID) {
            currentClientID = data.clientID;
            emit("init", { clientID: data.clientID });
          }
        } catch {}
        return origPost.call(this, data, ...rest);
      };

      w.addEventListener("message", (e: MessageEvent) => {
        const msg = e.data;
        if (!msg || msg.type !== "game_update" || !msg.gameUpdate) return;
        try {
          const updates = msg.gameUpdate.updates;

          // Player updates
          const players = updates?.[GUT_PLAYER];
          if (players?.length) {
            emit("players", {
              players: players.filter(Boolean),
              tick: msg.gameUpdate.tick,
            });
          }

          // Packed tile updates (keep locally + forward)
          const packed = msg.gameUpdate.packedTileUpdates;
          if (packed?.length) {
            const serialized: string[] = [];
            for (const tu of packed) {
              try {
                const big =
                  typeof tu === "bigint" ? tu : BigInt(String(tu));
                const ref = Number(big >> 16n);
                const state = Number(big & 0xffffn);
                const ownerSmall = state & 0x0fff;
                tileOwnerByRef.set(ref, ownerSmall);
                serialized.push(big.toString());
              } catch {}
            }
            if (serialized.length > 0) {
              emit("tiles", { packed: serialized });
            }
          }
        } catch (err) {
          console.warn("[Hammer:Main] Worker message error:", err);
        }
      });

      console.log("[Hammer:Main] Wrapped Worker instance");
      foundWorker = true;
      emit("status", { hook: "worker", found: true });
      return w;
    }

    class WrappedWorker extends OriginalWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        wrapWorker(this);
      }
    }
    Object.defineProperty(window, "Worker", {
      configurable: true,
      writable: true,
      value: WrappedWorker,
    });

    // Deep find existing Worker
    function deepFindWorker(): boolean {
      if (foundWorker) return true;

      // game-view path (multiplayer)
      try {
        const gv = document.querySelector("game-view") as any;
        const ww = gv?.clientGameRunner?.worker?.worker;
        if (ww && !ww.__hammerWrapped && ww instanceof OriginalWorker) {
          console.log(
            "[Hammer:Main] Found Worker in game-view.clientGameRunner.worker.worker",
          );
          wrapWorker(ww);
          return true;
        }
      } catch {}

      // events-display path (singleplayer)
      try {
        const ed = document.querySelector("events-display") as any;
        if (ed?.game?.worker) {
          const wc = ed.game.worker;
          const actual = wc.worker || wc;
          if (
            actual &&
            !actual.__hammerWrapped &&
            actual instanceof OriginalWorker
          ) {
            console.log(
              "[Hammer:Main] Found Worker in events-display.game.worker",
            );
            wrapWorker(actual);
            return true;
          }
        }
      } catch {}

      return false;
    }

    deepFindWorker();
    if (!foundWorker) {
      console.log(
        "[Hammer:Main] No existing Worker found - will intercept when created",
      );
      for (const delay of [200, 500, 1000, 2000, 4000]) {
        timeoutIds.push(
          setTimeout(() => {
            if (!foundWorker) deepFindWorker();
          }, delay),
        );
      }
    }

    // ============================
    // WEBSOCKET HOOK
    // ============================

    const OriginalWebSocket = window.WebSocket;

    function wrapWebSocket(ws: any) {
      if (!ws || ws.__hammerWrapped) return ws;
      ws.__hammerWrapped = true;

      const origSend = ws.send;
      ws.send = function (data: any) {
        try {
          if (typeof data === "string") {
            const obj = JSON.parse(data);
            if (obj?.type === "join" && obj.clientID) {
              currentClientID = obj.clientID;
              emit("init", { clientID: obj.clientID });
              gameSocket = this;
            }
            if (obj?.type === "intent") {
              gameSocket = this;
            }
          }
        } catch {}
        return origSend.call(this, data);
      };

      ws.addEventListener("message", (ev: MessageEvent) => {
        try {
          if (!ev?.data) return;
          const obj =
            typeof ev.data === "string" ? JSON.parse(ev.data) : null;
          if (
            obj &&
            (obj.type === "turn" ||
              obj.type === "start" ||
              obj.type === "ping")
          ) {
            gameSocket = ws;
          }
        } catch {}
      });

      gameSocket = ws;
      console.log("[Hammer:Main] Wrapped WebSocket instance");
      foundWebSocket = true;
      emit("status", { hook: "websocket", found: true });
      return ws;
    }

    class WrappedWebSocket extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        wrapWebSocket(this);
      }
    }
    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      writable: true,
      value: WrappedWebSocket,
    });

    // ============================
    // CANVAS HOOK
    // ============================

    const origSetTransform =
      CanvasRenderingContext2D.prototype.setTransform;
    const origDrawImage = CanvasRenderingContext2D.prototype.drawImage;

    CanvasRenderingContext2D.prototype.setTransform = function (
      this: CanvasRenderingContext2D,
      a?: any,
      b?: any,
      c?: any,
      d?: any,
      e?: any,
      f?: any,
    ) {
      try {
        const canvas = this.canvas;
        if (canvas?.width && canvas.height) {
          targetCanvas = canvas;
          if (typeof a === "object" && a !== null) {
            canvasTransform = {
              a: a.a || 1,
              d: a.d || 1,
              e: a.e || 0,
              f: a.f || 0,
            };
          } else {
            canvasTransform = {
              a: Number(a) || 1,
              d: Number(d) || 1,
              e: Number(e) || 0,
              f: Number(f) || 0,
            };
          }
          screenCanvasW = canvas.width | 0;
          screenCanvasH = canvas.height | 0;
        }
      } catch {}
      return origSetTransform.apply(this, arguments as any);
    } as typeof CanvasRenderingContext2D.prototype.setTransform;

    CanvasRenderingContext2D.prototype.drawImage = function (
      this: CanvasRenderingContext2D,
      img: any,
    ) {
      try {
        if (img instanceof HTMLCanvasElement && arguments.length === 5) {
          const w = Math.round(Number(arguments[3]));
          const h = Math.round(Number(arguments[4]));
          if (w * h > worldTilesW * worldTilesH) {
            worldTilesW = w;
            worldTilesH = h;
          }
        }
      } catch {}
      return origDrawImage.apply(this, arguments as any);
    } as typeof CanvasRenderingContext2D.prototype.drawImage;

    const onMouse = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener("mousemove", onMouse, true);

    // ============================
    // GAMEVIEW HOOK
    // ============================

    let gvAttempts = 0;
    const MAX_GV = 200;

    function hookGameView(): boolean {
      const ed = document.querySelector("events-display") as any;
      if (!ed?.game?.updatesSinceLastTick) return false;

      const gv = ed.game;
      if (gv.__hammerHooked && gameViewHooked) return true;
      if (gv.__hammerHooked) delete gv.__hammerHooked;

      const orig = gv.updatesSinceLastTick.bind(gv);
      gv.updatesSinceLastTick = function () {
        const updates = orig();
        if (updates) {
          const devts = updates[GUT_DISPLAY];
          if (devts?.length) {
            for (const evt of devts) {
              try {
                // Serialize for cross-world transfer
                const s = JSON.parse(JSON.stringify(evt));
                emit("display", { event: s });
              } catch {
                // Fallback: manual extraction
                try {
                  const goldAmount = evt.goldAmount;
                  emit("display", {
                    event: {
                      messageType: evt.messageType,
                      playerID: evt.playerID,
                      message: evt.message,
                      params: evt.params
                        ? JSON.parse(JSON.stringify(evt.params))
                        : {},
                      goldAmount:
                        goldAmount != null ? Number(goldAmount) : undefined,
                    },
                  });
                } catch {}
              }
            }
          }
        }
        return updates;
      };

      gv.__hammerHooked = true;
      gameViewHooked = true;
      console.log(
        "[Hammer:Main] Hooked GameView.updatesSinceLastTick after",
        gvAttempts,
        "attempts",
      );
      emit("status", { hook: "gameview", found: true });
      return true;
    }

    const gvInterval = setInterval(() => {
      if (gameViewHooked) {
        clearInterval(gvInterval);
        return;
      }
      if (++gvAttempts >= MAX_GV) {
        clearInterval(gvInterval);
        console.warn(
          "[Hammer:Main] Failed to hook GameView after",
          MAX_GV,
          "attempts",
        );
        return;
      }
      hookGameView();
    }, 100);
    intervalIds.push(gvInterval);

    // Try immediately + early delays
    hookGameView();
    for (const delay of [50, 100, 250, 500]) {
      timeoutIds.push(setTimeout(() => hookGameView(), delay));
    }

    // ============================
    // EVENTBUS DISCOVERY
    // ============================

    let ebAttempts = 0;
    const MAX_EB = 50;

    function probeClass(EventClass: any): any {
      const result: any = {
        cls: EventClass,
        hasRecipient: false,
        hasTroops: false,
        hasGold: false,
        hasEmoji: false,
        hasQuickChatKey: false,
        type: null,
      };

      try {
        const keys = Object.getOwnPropertyNames(
          EventClass.prototype,
        ).filter((k: string) => k !== "constructor");
        result.hasRecipient =
          result.hasRecipient || keys.includes("recipient");
        result.hasTroops = result.hasTroops || keys.includes("troops");
        result.hasGold = result.hasGold || keys.includes("gold");
        result.hasEmoji = result.hasEmoji || keys.includes("emoji");
        result.hasQuickChatKey =
          result.hasQuickChatKey || keys.includes("quickChatKey");
      } catch {}

      for (const args of [[], [null, 0]] as any[][]) {
        try {
          const inst = new EventClass(...args);
          result.hasRecipient =
            result.hasRecipient || "recipient" in inst;
          result.hasTroops = result.hasTroops || "troops" in inst;
          result.hasGold = result.hasGold || "gold" in inst;
          result.hasEmoji = result.hasEmoji || "emoji" in inst;
          result.hasQuickChatKey =
            result.hasQuickChatKey || "quickChatKey" in inst;
        } catch {}
      }

      if (result.hasRecipient && result.hasTroops) result.type = "troops";
      else if (result.hasRecipient && result.hasGold)
        result.type = "gold";
      else if (result.hasRecipient && result.hasEmoji)
        result.type = "emoji";
      else if (result.hasRecipient && result.hasQuickChatKey)
        result.type = "quickchat";
      else if (result.hasRecipient) result.type = "alliance";

      return result;
    }

    function discoverEventClasses() {
      if (!eventBus?.listeners) return;

      for (const [cls] of eventBus.listeners.entries()) {
        const probe = probeClass(cls);
        if (probe.type && !eventClasses[probe.type]) {
          eventClasses[probe.type] = cls;
        }
      }

      const types = Object.keys(eventClasses);
      console.log(
        "[Hammer:Main] Discovered event classes:",
        types.join(", ") || "none",
      );
      emit("status", { hook: "eventbus", found: true, classes: types });
    }

    function findEventBus(): boolean {
      if (eventBus) return true;
      ebAttempts++;

      for (const [selector, prop] of [
        ["events-display", "eventBus"],
        ["game-view", "eventBus"],
      ] as [string, string][]) {
        try {
          const el = document.querySelector(selector) as any;
          if (el?.[prop]) {
            eventBus = el[prop];
            console.log(
              "[Hammer:Main] Found EventBus via",
              selector,
            );
            setTimeout(discoverEventClasses, 100);
            return true;
          }
        } catch {}
      }

      // Try window properties
      for (const prop of [
        "eventBus",
        "_eventBus",
        "bus",
        "events",
      ]) {
        try {
          const val = (window as any)[prop];
          if (val && typeof val.emit === "function") {
            eventBus = val;
            console.log(
              `[Hammer:Main] Found EventBus at window.${prop}`,
            );
            setTimeout(discoverEventClasses, 100);
            return true;
          }
        } catch {}
      }

      return false;
    }

    const ebInterval = setInterval(() => {
      if (findEventBus() || ebAttempts >= MAX_EB) {
        clearInterval(ebInterval);
        if (!eventBus && ebAttempts >= MAX_EB) {
          console.warn(
            "[Hammer:Main] EventBus not found after",
            MAX_EB,
            "attempts",
          );
        }
      }
    }, 200);
    intervalIds.push(ebInterval);

    // ============================
    // BOOTSTRAP
    // ============================

    let bootstrapDone = false;

    function bootstrap(): boolean {
      if (bootstrapDone) return true;

      // game-view (multiplayer)
      try {
        const gv = document.querySelector("game-view") as any;
        if (gv?.clientGameRunner) {
          const runner = gv.clientGameRunner;
          if (runner.lobby?.clientID && !currentClientID) {
            currentClientID = runner.lobby.clientID;
            emit("init", { clientID: runner.lobby.clientID });
          }
          const gameView = runner.gameView;
          if (gameView?.players) {
            const raw =
              typeof gameView.players === "function"
                ? gameView.players()
                : gameView.players;
            const list = normalizeList(raw);
            if (list.length > 0) {
              const players = list
                .map(normalizePlayer)
                .filter(Boolean);
              emit("bootstrap", {
                players,
                source: "game-view",
                clientID: currentClientID,
              });
              bootstrapDone = true;
              return true;
            }
          }
        }
      } catch (e) {
        console.warn("[Hammer:Main] Bootstrap (game-view) error:", e);
      }

      // events-display (singleplayer)
      try {
        const ed = document.querySelector("events-display") as any;
        if (ed?.game) {
          const game = ed.game;
          if (game._myClientID && !currentClientID) {
            currentClientID = game._myClientID;
            emit("init", { clientID: game._myClientID });
          }
          if (game._players) {
            const list = normalizeList(game._players);
            if (list.length > 0) {
              const players = list
                .map(normalizePlayer)
                .filter(Boolean);
              emit("bootstrap", {
                players,
                source: "events-display",
                clientID: currentClientID,
              });
              bootstrapDone = true;
              return true;
            }
          }
          if (game._myPlayer && currentClientID) {
            const p = normalizePlayer(game._myPlayer);
            if (p?.smallID != null) {
              emit("bootstrap", {
                players: [p],
                source: "events-display",
                clientID: currentClientID,
              });
              bootstrapDone = true;
              return true;
            }
          }
        }
      } catch (e) {
        console.warn(
          "[Hammer:Main] Bootstrap (events-display) error:",
          e,
        );
      }

      return false;
    }

    function scheduleBootstrap() {
      if (bootstrap()) return;
      for (const delay of [200, 500, 1000, 2000, 4000]) {
        timeoutIds.push(
          setTimeout(() => {
            if (!bootstrapDone) bootstrap();
          }, delay),
        );
      }
    }

    // ============================
    // PERIODIC REFRESH
    // ============================

    function refreshPlayers() {
      try {
        const ed = document.querySelector("events-display") as any;
        if (ed?.game?._players) {
          const list = normalizeList(ed.game._players);
          if (list.length > 0) {
            const players = list
              .map(normalizePlayer)
              .filter(Boolean);
            emit("refresh", { players });
            return;
          }
        }
      } catch {}

      try {
        const gv = document.querySelector("game-view") as any;
        if (gv?.clientGameRunner?.gameView?.players) {
          const raw =
            typeof gv.clientGameRunner.gameView.players === "function"
              ? gv.clientGameRunner.gameView.players()
              : gv.clientGameRunner.gameView.players;
          const list = normalizeList(raw);
          if (list.length > 0) {
            const players = list
              .map(normalizePlayer)
              .filter(Boolean);
            emit("refresh", { players });
            return;
          }
        }
      } catch {}
    }

    // ============================
    // SEND COMMANDS (from isolated world)
    // ============================

    function getPlayerView(playerId: string): any {
      // multiplayer
      try {
        const gv = document.querySelector("game-view") as any;
        if (gv?.clientGameRunner?.gameView?.players) {
          const players = gv.clientGameRunner.gameView.players;
          if (players.get) {
            const pv = players.get(playerId);
            if (pv) return pv;
          }
          if (Array.isArray(players)) {
            return (
              players.find(
                (p: any) => p && p.id && p.id() === playerId,
              ) ?? null
            );
          }
          for (const p of players) {
            if (p && p.id && p.id() === playerId) return p;
          }
        }
      } catch {}

      // singleplayer
      try {
        const ed = document.querySelector("events-display") as any;
        if (ed?.game?.players) {
          const players = ed.game.players();
          if (Array.isArray(players)) {
            return (
              players.find(
                (p: any) => p && p.id && p.id() === playerId,
              ) ?? null
            );
          }
        }
      } catch {}

      return null;
    }

    function handleSendCommand(data: any) {
      const { action, targetId, amount, recipientId, emojiIndex, key, targetPlayerId } =
        data;

      if (action === "troops") {
        if (eventBus && eventClasses.troops) {
          const pv = getPlayerView(targetId);
          if (pv) {
            try {
              const evt = new eventClasses.troops(
                pv,
                amount == null ? null : Number(amount),
              );
              eventBus.emit(evt);
              emit("send-result", { action, success: true, method: "eventbus" });
              return;
            } catch {}
          }
        }
        if (
          gameSocket &&
          gameSocket.readyState === 1 &&
          currentClientID
        ) {
          gameSocket.send(
            JSON.stringify({
              type: "intent",
              intent: {
                type: "donate_troops",
                clientID: currentClientID,
                recipient: targetId,
                troops: amount,
              },
            }),
          );
          emit("send-result", { action, success: true, method: "websocket" });
          return;
        }
        emit("send-result", { action, success: false });
      } else if (action === "gold") {
        if (eventBus && eventClasses.gold) {
          const pv = getPlayerView(targetId);
          if (pv) {
            try {
              const evt = new eventClasses.gold(
                pv,
                BigInt(Number(amount)),
              );
              eventBus.emit(evt);
              emit("send-result", { action, success: true, method: "eventbus" });
              return;
            } catch {}
          }
        }
        if (
          gameSocket &&
          gameSocket.readyState === 1 &&
          currentClientID
        ) {
          gameSocket.send(
            JSON.stringify({
              type: "intent",
              intent: {
                type: "donate_gold",
                clientID: currentClientID,
                recipient: targetId,
                gold: Number(amount),
              },
            }),
          );
          emit("send-result", { action, success: true, method: "websocket" });
          return;
        }
        emit("send-result", { action, success: false });
      } else if (action === "emoji") {
        if (
          eventBus &&
          eventClasses.emoji &&
          recipientId !== "AllPlayers"
        ) {
          const pv = getPlayerView(recipientId);
          if (pv) {
            try {
              const evt = new eventClasses.emoji(pv, emojiIndex);
              eventBus.emit(evt);
              return;
            } catch {}
          }
        }
        if (
          gameSocket &&
          gameSocket.readyState === 1 &&
          currentClientID
        ) {
          gameSocket.send(
            JSON.stringify({
              type: "intent",
              intent: {
                type: "emoji",
                clientID: currentClientID,
                recipient: recipientId,
                emoji: emojiIndex,
              },
            }),
          );
        }
      } else if (action === "quickchat") {
        if (
          eventBus &&
          eventClasses.quickchat &&
          recipientId !== "AllPlayers"
        ) {
          const pv = getPlayerView(recipientId);
          if (pv) {
            try {
              const args = targetPlayerId
                ? [pv, key, targetPlayerId]
                : [pv, key];
              const evt = new eventClasses.quickchat(...args);
              eventBus.emit(evt);
              return;
            } catch {}
          }
        }
        if (
          gameSocket &&
          gameSocket.readyState === 1 &&
          currentClientID
        ) {
          const intent: any = {
            type: "quick_chat",
            clientID: currentClientID,
            recipient: recipientId,
            quickChatKey: key,
          };
          if (targetPlayerId) intent.target = targetPlayerId;
          gameSocket.send(
            JSON.stringify({ type: "intent", intent }),
          );
        }
      } else if (action === "alliance") {
        if (
          eventBus &&
          eventClasses.alliance &&
          recipientId !== "AllPlayers"
        ) {
          const pv = getPlayerView(recipientId);
          if (pv) {
            try {
              const evt = new eventClasses.alliance(pv);
              eventBus.emit(evt);
              return;
            } catch {}
          }
        }
        if (
          gameSocket &&
          gameSocket.readyState === 1 &&
          currentClientID
        ) {
          gameSocket.send(
            JSON.stringify({
              type: "intent",
              intent: {
                type: "send_alliance_request",
                clientID: currentClientID,
                recipient: recipientId,
              },
            }),
          );
        }
      } else if (action === "capture-mouse") {
        // ALT+M: resolve tile under mouse cursor, return owner info
        if (!targetCanvas || !worldTilesW || !worldTilesH) {
          emit("mouse-target", { found: false, reason: "no-canvas" });
          return;
        }
        const rect = targetCanvas.getBoundingClientRect();
        const pixelX =
          (mouseX - rect.left) * (screenCanvasW / rect.width);
        const pixelY =
          (mouseY - rect.top) * (screenCanvasH / rect.height);
        const txX = (pixelX - canvasTransform.e) / canvasTransform.a;
        const txY = (pixelY - canvasTransform.f) / canvasTransform.d;
        const mwX = Math.floor(txX + worldTilesW / 2);
        const mwY = Math.floor(txY + worldTilesH / 2);
        const tileRef = mwY * worldTilesW + mwX;
        const ownerSmallID = tileOwnerByRef.get(tileRef);

        if (ownerSmallID != null && ownerSmallID !== 0) {
          emit("mouse-target", {
            found: true,
            ownerSmallID,
          });
        } else {
          emit("mouse-target", { found: false, reason: "no-owner" });
        }
      }
    }

    // Listen for commands from isolated world
    window.addEventListener("message", (e: MessageEvent) => {
      if (e.data?.__hammer && e.data.type === "send") {
        handleSendCommand(e.data.payload);
      }
    });

    // ============================
    // INITIALIZATION
    // ============================

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", scheduleBootstrap, {
        once: true,
      });
    } else {
      scheduleBootstrap();
    }

    const refreshInterval = setInterval(refreshPlayers, 3000);
    intervalIds.push(refreshInterval);

    // Status log after 1 second
    timeoutIds.push(
      setTimeout(() => {
        console.log("[Hammer:Main] Status:", {
          worker: foundWorker,
          websocket: foundWebSocket,
          gameview: gameViewHooked,
          eventbus: !!eventBus,
          bootstrap: bootstrapDone,
        });
      }, 1000),
    );

    // ============================
    // CLEANUP
    // ============================

    (window as any).__HAMMER_MAIN__ = {
      cleanup() {
        Object.defineProperty(window, "Worker", {
          configurable: true,
          writable: true,
          value: OriginalWorker,
        });
        Object.defineProperty(window, "WebSocket", {
          configurable: true,
          writable: true,
          value: OriginalWebSocket,
        });
        CanvasRenderingContext2D.prototype.setTransform =
          origSetTransform;
        CanvasRenderingContext2D.prototype.drawImage = origDrawImage;
        window.removeEventListener("mousemove", onMouse, true);
        for (const tid of timeoutIds) clearTimeout(tid);
        for (const iid of intervalIds) clearInterval(iid);
        timeoutIds.length = 0;
        intervalIds.length = 0;
      },
      version: "11.0.0-ext",
    };

    console.log("[Hammer:Main] Hooks installed at document_start");
  },
});
