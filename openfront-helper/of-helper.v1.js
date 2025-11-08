/**
 * OpenFront Helper v1.0
 * Tick-synchronized game helper for OpenFront.io
 *
 * Based on OpenFrontIO codebase architecture (github.com/openfrontio/OpenFrontIO)
 * Uses structure knowledge from the open-source game - no AGPL code copied.
 * Paste this script into your browser console on OpenFront.io to activate.
 *
 * Usage:
 *   - Automatically starts on load
 *   - Access API via window.OFHelper
 *   - To stop: window.OFHelper.stop()
 */

(function() {
  'use strict';

  // ============================================================================
  // EventBus - Simple pub/sub system
  // ============================================================================
  function createEventBus() {
    const listeners = new Map();

    function on(event, handler) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event).push(handler);
    }

    function off(event, handler) {
      if (!listeners.has(event)) return;
      const handlers = listeners.get(event);
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }

    function emit(event, payload) {
      if (!listeners.has(event)) return;
      const handlers = listeners.get(event);
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (error) {
          console.error(`[EventBus] Error in handler for "${event}":`, error);
        }
      }
    }

    return { on, off, emit };
  }

  // ============================================================================
  // Store - Game state mirror
  // ============================================================================
  const GameUpdateType = {
    Tile: 0,
    Unit: 1,
    Player: 2,
    DisplayEvent: 3,
    DisplayChatEvent: 4,
    AllianceRequest: 5,
    AllianceAccepted: 6,
    AllianceDeclined: 7,
    AllianceRevoked: 8,
    TargetPlayer: 10,
    Emoji: 11,
    Win: 12,
    Hash: 13,
    UnitIncoming: 14,
    BonusEvent: 15,
    RailroadEvent: 16,
    ConquestEvent: 17,
    EmbargoEvent: 18,
  };

  function createStore(eventBus) {
    const state = {
      tick: 0,
      myPlayerId: null,
      myClientId: null,
      players: {},
      units: {},
      my: {
        tiles: 0,
        troops: 0,
        gold: 0,
        goldCap: 0,
        troopCap: 0,
        allies: [],
        isAlive: false,
      },
    };

    function getState() {
      return {
        ...state,
        players: { ...state.players },
        my: { ...state.my },
      };
    }

    function calculateMaxTroops(tiles, cityBonusTroops = 0) {
      const baseTroops = 2 * (Math.pow(tiles, 0.6) * 1000 + 50000);
      return Math.floor(baseTroops + cityBonusTroops);
    }

    function calculateMaxGold(tiles) {
      return Math.floor(tiles * 5000 + 100000);
    }

    function updateFromGameUpdate(viewData) {
      if (!viewData || !viewData.updates) {
        console.warn('[Store] Invalid viewData received');
        return;
      }

      state.tick = viewData.tick || state.tick;

      const playerUpdates = viewData.updates[GameUpdateType.Player] || [];
      for (const playerUpdate of playerUpdates) {
        const snapshot = {
          id: playerUpdate.id,
          name: playerUpdate.name || playerUpdate.displayName || 'Unknown',
          smallID: playerUpdate.smallID,
          clientID: playerUpdate.clientID,
          tiles: playerUpdate.tilesOwned || 0,
          gold: typeof playerUpdate.gold === 'bigint'
            ? Number(playerUpdate.gold)
            : (playerUpdate.gold || 0),
          troops: playerUpdate.troops || 0,
          isAlive: playerUpdate.isAlive ?? true,
          isDisconnected: playerUpdate.isDisconnected ?? false,
          isTraitor: playerUpdate.isTraitor ?? false,
          hasSpawned: playerUpdate.hasSpawned ?? false,
          allies: playerUpdate.allies || [],
          playerType: playerUpdate.playerType,
        };

        state.players[snapshot.smallID] = snapshot;

        if (!state.myPlayerId && snapshot.clientID && snapshot.isAlive) {
          state.myPlayerId = snapshot.smallID;
          state.myClientId = snapshot.clientID;
        }
      }

      const unitUpdates = viewData.updates[GameUpdateType.Unit] || [];
      for (const unitUpdate of unitUpdates) {
        if (unitUpdate.isActive) {
          state.units[unitUpdate.id] = {
            id: unitUpdate.id,
            unitType: unitUpdate.unitType,
            ownerID: unitUpdate.ownerID,
            troops: unitUpdate.troops || 0,
            level: unitUpdate.level || 1,
            pos: unitUpdate.pos,
          };
        } else {
          delete state.units[unitUpdate.id];
        }
      }

      if (state.myPlayerId !== null && state.players[state.myPlayerId]) {
        const me = state.players[state.myPlayerId];

        const myCities = Object.values(state.units).filter(
          (u) => u.ownerID === state.myPlayerId && u.unitType === 0
        );
        const cityBonusTroops = myCities.reduce((sum, city) => sum + (city.level || 1) * 250000, 0);

        state.my = {
          tiles: me.tiles,
          troops: me.troops,
          gold: me.gold,
          goldCap: calculateMaxGold(me.tiles),
          troopCap: calculateMaxTroops(me.tiles, cityBonusTroops),
          allies: me.allies,
          isAlive: me.isAlive,
        };
      }

      eventBus.emit('state:updated', getState());
    }

    return { getState, updateFromGameUpdate };
  }

  // ============================================================================
  // Wiretap - WebSocket/Worker interceptor
  // DEBUG MODE: Set window.OFHelper_DEBUG = true BEFORE loading script
  // ============================================================================
  function createWiretap(eventBus) {
    let isInitialized = false;
    let messageCount = 0;
    const OriginalWebSocket = window.WebSocket;
    const OriginalSharedWorker = window.SharedWorker;

    function isDebugMode() {
      return window.OFHelper_DEBUG === true;
    }

    function parseGameUpdate(data) {
      messageCount++;
      const debug = isDebugMode();

      try {
        let parsed = data;
        const dataType = typeof data;

        if (debug) {
          let preview = '';
          if (dataType === 'string') {
            preview = data.length > 100 ? data.substring(0, 100) + '...' : data;
          } else if (data instanceof ArrayBuffer) {
            preview = `ArrayBuffer(${data.byteLength} bytes)`;
          } else if (data instanceof Blob) {
            preview = `Blob(${data.size} bytes)`;
          } else if (typeof data === 'object') {
            preview = JSON.stringify(data).substring(0, 100);
          }
          console.log(`[Wiretap:DEBUG #${messageCount}] Received (${dataType}):`, preview);
        }

        if (typeof data === 'string') {
          try {
            parsed = JSON.parse(data);
            if (debug) {
              console.log(`[Wiretap:DEBUG #${messageCount}] Parsed JSON:`, Object.keys(parsed));
            }
          } catch (e) {
            if (debug) {
              console.log(`[Wiretap:DEBUG #${messageCount}] Not JSON`);
            }
            return null;
          }
        }

        if (data instanceof ArrayBuffer || data instanceof Blob) {
          if (debug) {
            console.log(`[Wiretap:DEBUG #${messageCount}] Binary message - skipped`);
          }
          return null;
        }

        if (parsed && parsed.type === 'game_update' && parsed.gameUpdate) {
          if (debug) {
            console.log(`[Wiretap:DEBUG #${messageCount}] ✓ MATCHED Pattern 1 (game_update)`);
          }
          console.log('[Wiretap] Game update detected!', parsed.gameUpdate.tick);
          return parsed.gameUpdate;
        }

        if (
          parsed &&
          typeof parsed.tick === 'number' &&
          parsed.updates &&
          typeof parsed.updates === 'object'
        ) {
          if (debug) {
            console.log(`[Wiretap:DEBUG #${messageCount}] ✓ MATCHED Pattern 3 (raw GameUpdateViewData)`);
          }
          console.log('[Wiretap] Game update detected!', parsed.tick);
          return parsed;
        }

        if (debug) {
          console.log(`[Wiretap:DEBUG #${messageCount}] ✗ No pattern matched. Message structure:`, {
            hasType: !!parsed?.type,
            type: parsed?.type,
            hasGameUpdate: !!parsed?.gameUpdate,
            hasTick: typeof parsed?.tick === 'number',
            hasUpdates: !!parsed?.updates,
            keys: parsed ? Object.keys(parsed) : []
          });
        }

        return null;
      } catch (error) {
        if (debug) {
          console.error(`[Wiretap:DEBUG #${messageCount}] Parse error:`, error);
        }
        return null;
      }
    }

    function patchWebSocket() {
      window.WebSocket = function (...args) {
        const socket = new OriginalWebSocket(...args);

        const originalAddEventListener = socket.addEventListener;
        socket.addEventListener = function (type, listener, ...rest) {
          if (type === 'message') {
            const wrappedListener = function (event) {
              const gameUpdate = parseGameUpdate(event.data);
              if (gameUpdate) {
                eventBus.emit('wire:gameUpdate', gameUpdate);
              }
              if (listener) {
                listener.call(this, event);
              }
            };
            return originalAddEventListener.call(this, type, wrappedListener, ...rest);
          }
          return originalAddEventListener.call(this, type, listener, ...rest);
        };

        let onmessageValue = null;
        Object.defineProperty(socket, 'onmessage', {
          get() {
            return onmessageValue;
          },
          set(handler) {
            onmessageValue = function (event) {
              const gameUpdate = parseGameUpdate(event.data);
              if (gameUpdate) {
                eventBus.emit('wire:gameUpdate', gameUpdate);
              }
              if (handler) {
                handler.call(this, event);
              }
            };
          },
        });

        return socket;
      };

      Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
      Object.getOwnPropertyNames(OriginalWebSocket).forEach((prop) => {
        try {
          window.WebSocket[prop] = OriginalWebSocket[prop];
        } catch (e) {
          // Ignore non-configurable properties
        }
      });
    }

    function patchSharedWorker() {
      if (!OriginalSharedWorker) return;

      window.SharedWorker = function (...args) {
        const worker = new OriginalSharedWorker(...args);

        if (worker.port) {
          const originalAddEventListener = worker.port.addEventListener;
          worker.port.addEventListener = function (type, listener, ...rest) {
            if (type === 'message') {
              const wrappedListener = function (event) {
                const gameUpdate = parseGameUpdate(event.data);
                if (gameUpdate) {
                  eventBus.emit('wire:gameUpdate', gameUpdate);
                }
                if (listener) {
                  listener.call(this, event);
                }
              };
              return originalAddEventListener.call(this, type, wrappedListener, ...rest);
            }
            return originalAddEventListener.call(this, type, listener, ...rest);
          };
        }

        return worker;
      };

      Object.setPrototypeOf(window.SharedWorker, OriginalSharedWorker);
    }

    function init() {
      if (isInitialized) {
        console.warn('[Wiretap] Already initialized');
        return;
      }

      patchWebSocket();
      patchSharedWorker();

      isInitialized = true;

      if (isDebugMode()) {
        console.log('%c[Wiretap] DEBUG MODE ENABLED', 'color: #ff0; font-weight: bold');
        console.log('[Wiretap] All WebSocket/Worker messages will be logged');
      }

      console.log('[Wiretap] Initialized - monitoring WebSocket and SharedWorker traffic');
      console.log('[Wiretap] If no updates appear, enable debug: window.OFHelper_DEBUG = true; then reload');
    }

    return { init };
  }

  // ============================================================================
  // TurnClock - Tick synchronizer
  // ============================================================================
  function createTurnClock(eventBus, store) {
    let lastTick = -1;
    let isRunning = false;

    function handleGameUpdate(gameUpdate) {
      if (!gameUpdate || typeof gameUpdate.tick !== 'number') {
        return;
      }

      const currentTick = gameUpdate.tick;

      if (currentTick > lastTick) {
        store.updateFromGameUpdate(gameUpdate);

        eventBus.emit('turn:tick', {
          tick: currentTick,
          state: store.getState(),
        });

        lastTick = currentTick;
      }
    }

    function init() {
      if (isRunning) {
        console.warn('[TurnClock] Already running');
        return;
      }

      eventBus.on('wire:gameUpdate', handleGameUpdate);

      isRunning = true;
      console.log('[TurnClock] Initialized - listening for game ticks');
    }

    function getCurrentTick() {
      return lastTick;
    }

    return { init, getCurrentTick };
  }

  // ============================================================================
  // Selectors - Helper functions
  // ============================================================================
  const selectors = {
    getMyPlayer(state) {
      if (state.myPlayerId === null) {
        return null;
      }
      return state.players[state.myPlayerId] || null;
    },

    getMySummary(state) {
      return state.my;
    },

    getLeaderboard(state) {
      return Object.values(state.players)
        .filter((p) => p.hasSpawned)
        .sort((a, b) => b.tiles - a.tiles);
    },

    getAllies(state) {
      const me = this.getMyPlayer(state);
      if (!me || !me.allies) {
        return [];
      }
      return me.allies
        .map((allySmallId) => state.players[allySmallId])
        .filter(Boolean);
    },

    getAlivePlayers(state) {
      return Object.values(state.players).filter((p) => p.isAlive && p.hasSpawned);
    },

    getPlayerBySmallID(state, smallID) {
      return state.players[smallID] || null;
    },

    getIncomeRates(state) {
      const me = this.getMyPlayer(state);
      if (!me) {
        return { gold: 0, troops: 0 };
      }

      const goldPerTick = me.playerType === 1 ? 50 : 100;
      const goldPerSecond = goldPerTick * 10;

      const maxTroops = state.my.troopCap;
      const currentTroops = state.my.troops;
      const ratio = maxTroops > 0 ? 1 - currentTroops / maxTroops : 0;
      const troopsPerTick = (10 + Math.pow(currentTroops, 0.73) / 4) * ratio;
      const troopsPerSecond = troopsPerTick * 10;

      return {
        gold: goldPerSecond,
        troops: troopsPerSecond,
      };
    },
  };

  // ============================================================================
  // UI - HUD management
  // ============================================================================
  function createUI() {
    let hudContainer = null;
    const panels = new Map();
    let isInitialized = false;

    function createHUDContainer() {
      const container = document.createElement('div');
      container.id = 'openfront-helper-hud';
      container.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 999999;
        pointer-events: none;
        font-family: monospace;
        font-size: 12px;
        color: #fff;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
      `;
      document.body.appendChild(container);
      return container;
    }

    function createPanel(id, opts = {}) {
      if (panels.has(id)) {
        return panels.get(id);
      }

      const panel = document.createElement('div');
      panel.id = `of-panel-${id}`;
      panel.style.cssText = `
        background: rgba(0, 0, 0, 0.7);
        padding: 8px 12px;
        margin-bottom: 8px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        pointer-events: ${opts.interactive ? 'auto' : 'none'};
        ${opts.style || ''}
      `;

      hudContainer.appendChild(panel);
      panels.set(id, panel);

      return panel;
    }

    function setPanelText(id, text) {
      const panel = panels.get(id);
      if (!panel) {
        console.warn(`[UI] Panel "${id}" not found`);
        return;
      }
      panel.textContent = text;
    }

    function setPanelHTML(id, html) {
      const panel = panels.get(id);
      if (!panel) {
        console.warn(`[UI] Panel "${id}" not found`);
        return;
      }
      panel.innerHTML = html;
    }

    function removePanel(id) {
      const panel = panels.get(id);
      if (panel) {
        panel.remove();
        panels.delete(id);
      }
    }

    function setPanelVisible(id, visible) {
      const panel = panels.get(id);
      if (panel) {
        panel.style.display = visible ? 'block' : 'none';
      }
    }

    function init() {
      if (isInitialized) {
        console.warn('[UI] Already initialized');
        return;
      }

      if (!document.body) {
        console.warn('[UI] Document body not ready, waiting...');
        setTimeout(init, 100);
        return;
      }

      hudContainer = createHUDContainer();
      isInitialized = true;
      console.log('[UI] Initialized - HUD container created');
    }

    function destroy() {
      if (hudContainer) {
        hudContainer.remove();
        hudContainer = null;
      }
      panels.clear();
      isInitialized = false;
    }

    return {
      init,
      destroy,
      createPanel,
      setPanelText,
      setPanelHTML,
      removePanel,
      setPanelVisible,
    };
  }

  // ============================================================================
  // Actions - Game interaction stubs
  // ============================================================================
  function createActions() {
    return {
      sendTroops(opts) {
        console.warn('[Actions] sendTroops not yet implemented', opts);
      },
      sendGold(opts) {
        console.warn('[Actions] sendGold not yet implemented', opts);
      },
      sendAllianceRequest(playerId) {
        console.warn('[Actions] sendAllianceRequest not yet implemented', playerId);
      },
      acceptAllianceRequest(playerId) {
        console.warn('[Actions] acceptAllianceRequest not yet implemented', playerId);
      },
      breakAlliance(playerId) {
        console.warn('[Actions] breakAlliance not yet implemented', playerId);
      },
      sendChat(message) {
        console.warn('[Actions] sendChat not yet implemented', message);
      },
      spawn(tileRef) {
        console.warn('[Actions] spawn not yet implemented', tileRef);
      },
    };
  }

  // ============================================================================
  // FeatureRegistry - Plugin system
  // ============================================================================
  function createFeatureRegistry(api) {
    const features = new Map();

    function registerFeature(name, factory) {
      if (features.has(name)) {
        console.warn(`[FeatureRegistry] Feature "${name}" already registered`);
        return;
      }

      try {
        const instance = factory(api);

        if (instance && typeof instance.init === 'function') {
          instance.init();
        }

        features.set(name, instance);
        console.log(`[FeatureRegistry] Feature "${name}" registered and initialized`);
      } catch (error) {
        console.error(`[FeatureRegistry] Failed to register feature "${name}":`, error);
      }
    }

    function unregisterFeature(name) {
      const instance = features.get(name);
      if (!instance) return;

      if (typeof instance.destroy === 'function') {
        try {
          instance.destroy();
        } catch (error) {
          console.error(`[FeatureRegistry] Error destroying feature "${name}":`, error);
        }
      }

      features.delete(name);
      console.log(`[FeatureRegistry] Feature "${name}" unregistered`);
    }

    function getFeature(name) {
      return features.get(name);
    }

    function listFeatures() {
      return Array.from(features.keys());
    }

    return {
      registerFeature,
      unregisterFeature,
      getFeature,
      listFeatures,
    };
  }

  // ============================================================================
  // SummaryHUD Feature
  // ============================================================================
  function createSummaryHUD(api) {
    const { on, UI, selectors, getState } = api;

    const PANEL_ID = 'summary';
    let lastUpdateTick = -1;

    function formatNumber(num) {
      if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
      }
      if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
      }
      return Math.floor(num).toString();
    }

    function updateHUD(payload) {
      const { tick, state } = payload;

      if (tick === lastUpdateTick) return;
      lastUpdateTick = tick;

      const my = selectors.getMySummary(state);

      if (!my.isAlive || my.tiles === 0) {
        UI.setPanelText(PANEL_ID, 'Waiting for spawn...');
        return;
      }

      const summary = [
        `T:${tick}`,
        `Tiles:${my.tiles}`,
        `Troops:${formatNumber(my.troops)}/${formatNumber(my.troopCap)}`,
        `Gold:${formatNumber(my.gold)}/${formatNumber(my.goldCap)}`,
      ].join(' | ');

      UI.setPanelText(PANEL_ID, summary);
    }

    function init() {
      UI.createPanel(PANEL_ID);
      UI.setPanelText(PANEL_ID, 'OpenFront Helper v1.0 - Initializing...');

      on('turn:tick', updateHUD);

      console.log('[SummaryHUD] Initialized');
    }

    function destroy() {
      UI.removePanel(PANEL_ID);
      console.log('[SummaryHUD] Destroyed');
    }

    return { init, destroy };
  }

  // ============================================================================
  // Main - Bootstrap
  // ============================================================================
  function createOpenFrontHelper() {
    let isStarted = false;

    const eventBus = createEventBus();
    const store = createStore(eventBus);
    const wiretap = createWiretap(eventBus);
    const turnClock = createTurnClock(eventBus, store);
    const ui = createUI();
    const actions = createActions();

    const featureAPI = {
      on: eventBus.on,
      emit: eventBus.emit,
      getState: store.getState,
      UI: ui,
      Actions: actions,
      selectors,
    };

    const featureRegistry = createFeatureRegistry(featureAPI);

    function start() {
      if (isStarted) {
        console.warn('[OFHelper] Already started');
        return;
      }

      console.log('[OFHelper] Starting OpenFront Helper v1.0...');

      ui.init();
      wiretap.init();
      turnClock.init();

      featureRegistry.registerFeature('SummaryHUD', createSummaryHUD);

      isStarted = true;
      console.log('[OFHelper] Started successfully!');
      console.log('[OFHelper] Use window.OFHelper to access the API');
    }

    function stop() {
      console.log('[OFHelper] Stopping...');
      ui.destroy();
      isStarted = false;
    }

    return {
      start,
      stop,
      getState: store.getState,
      on: eventBus.on,
      emit: eventBus.emit,
      featureRegistry,
      version: '1.0.0',
    };
  }

  // ============================================================================
  // Auto-start
  // ============================================================================
  const OFHelper = createOpenFrontHelper();
  window.OFHelper = OFHelper;
  OFHelper.start();

})();
