/**
 * TurnClock - Authoritative tick/turn synchronizer
 *
 * Subscribes to wire:gameUpdate events from Wiretap.
 * Updates Store and emits turn:tick events for all time-based features.
 * All game logic timing flows through this - NO setInterval for game mechanics.
 */

export function createTurnClock(eventBus, store) {
  let lastTick = -1;
  let isRunning = false;

  /**
   * Handle incoming game update from wire
   * @param {Object} gameUpdate - GameUpdateViewData from Wiretap
   */
  function handleGameUpdate(gameUpdate) {
    if (!gameUpdate || typeof gameUpdate.tick !== 'number') {
      return;
    }

    const currentTick = gameUpdate.tick;

    // Only emit if tick has strictly increased
    if (currentTick > lastTick) {
      // Update store first
      store.updateFromGameUpdate(gameUpdate);

      // Emit tick event with new state
      eventBus.emit('turn:tick', {
        tick: currentTick,
        state: store.getState(),
      });

      lastTick = currentTick;
    }
  }

  /**
   * Initialize turn clock (idempotent)
   */
  function init() {
    if (isRunning) {
      console.warn('[TurnClock] Already running');
      return;
    }

    // Subscribe to wiretap events
    eventBus.on('wire:gameUpdate', handleGameUpdate);

    isRunning = true;
    console.log('[TurnClock] Initialized - listening for game ticks');
  }

  /**
   * Get current tick number
   * @returns {number} Last processed tick
   */
  function getCurrentTick() {
    return lastTick;
  }

  return {
    init,
    getCurrentTick,
  };
}
