/**
 * Wiretap - WebSocket and Worker message interceptor
 *
 * Monkeypatches WebSocket and SharedWorker to extract GameUpdateViewData.
 * Detects game update messages and emits "wire:gameUpdate" events.
 *
 * Based on patterns from Mars Chrome Extension and OpenFront Transport.ts
 *
 * DEBUG MODE: Set window.OFHelper_DEBUG = true before loading to enable verbose logging
 */

export function createWiretap(eventBus) {
  let isInitialized = false;
  let messageCount = 0;
  const OriginalWebSocket = window.WebSocket;
  const OriginalSharedWorker = window.SharedWorker;

  // Debug mode flag - check window global
  function isDebugMode() {
    return window.OFHelper_DEBUG === true;
  }

  /**
   * Parse potential game update message
   * @param {*} data - Raw message data
   * @returns {Object|null} Parsed GameUpdateViewData or null
   */
  function parseGameUpdate(data) {
    messageCount++;
    const debug = isDebugMode();

    try {
      let parsed = data;
      const dataType = typeof data;

      if (debug) {
        // Log every message for debugging
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

      // Handle string JSON
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

      // Handle ArrayBuffer / Blob (would need specific decode logic)
      if (data instanceof ArrayBuffer || data instanceof Blob) {
        if (debug) {
          console.log(`[Wiretap:DEBUG #${messageCount}] Binary message - skipped`);
        }
        return null;
      }

      // Pattern 1: Worker message format (Mars extension pattern)
      // { type: "game_update", gameUpdate: { tick, updates, packedTileUpdates, ... } }
      if (parsed && parsed.type === 'game_update' && parsed.gameUpdate) {
        if (debug) {
          console.log(`[Wiretap:DEBUG #${messageCount}] ✓ MATCHED Pattern 1 (game_update)`);
        }
        console.log('[Wiretap] Game update detected!', parsed.gameUpdate.tick);
        return parsed.gameUpdate;
      }

      // Pattern 2: Direct WebSocket message format (Transport.ts pattern)
      // { type: "turn", turn: { turnNumber, ... } }
      // But this doesn't directly contain updates, so we need the client's processed format

      // Pattern 3: Raw GameUpdateViewData shape
      // { tick: number, updates: {...}, packedTileUpdates: BigUint64Array, ... }
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

  /**
   * Patch WebSocket constructor
   */
  function patchWebSocket() {
    window.WebSocket = function (...args) {
      const socket = new OriginalWebSocket(...args);

      // Wrap message event listener
      const originalAddEventListener = socket.addEventListener;
      socket.addEventListener = function (type, listener, ...rest) {
        if (type === 'message') {
          const wrappedListener = function (event) {
            // Try to parse game update
            const gameUpdate = parseGameUpdate(event.data);
            if (gameUpdate) {
              eventBus.emit('wire:gameUpdate', gameUpdate);
            }

            // Call original listener
            if (listener) {
              listener.call(this, event);
            }
          };

          return originalAddEventListener.call(this, type, wrappedListener, ...rest);
        }

        return originalAddEventListener.call(this, type, listener, ...rest);
      };

      // Also handle onmessage property
      let onmessageValue = null;
      Object.defineProperty(socket, 'onmessage', {
        get() {
          return onmessageValue;
        },
        set(handler) {
          onmessageValue = function (event) {
            // Try to parse game update
            const gameUpdate = parseGameUpdate(event.data);
            if (gameUpdate) {
              eventBus.emit('wire:gameUpdate', gameUpdate);
            }

            // Call original handler
            if (handler) {
              handler.call(this, event);
            }
          };
        },
      });

      return socket;
    };

    // Copy static properties
    Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
    Object.getOwnPropertyNames(OriginalWebSocket).forEach((prop) => {
      try {
        window.WebSocket[prop] = OriginalWebSocket[prop];
      } catch (e) {
        // Ignore non-configurable properties
      }
    });
  }

  /**
   * Patch SharedWorker (if game uses workers)
   */
  function patchSharedWorker() {
    if (!OriginalSharedWorker) return;

    window.SharedWorker = function (...args) {
      const worker = new OriginalSharedWorker(...args);

      // Patch port message handling
      if (worker.port) {
        const originalAddEventListener = worker.port.addEventListener;
        worker.port.addEventListener = function (type, listener, ...rest) {
          if (type === 'message') {
            const wrappedListener = function (event) {
              // Try to parse game update
              const gameUpdate = parseGameUpdate(event.data);
              if (gameUpdate) {
                eventBus.emit('wire:gameUpdate', gameUpdate);
              }

              // Call original listener
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

    // Copy prototype
    Object.setPrototypeOf(window.SharedWorker, OriginalSharedWorker);
  }

  /**
   * Initialize wiretap (idempotent)
   */
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
