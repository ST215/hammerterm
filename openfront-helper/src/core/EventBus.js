/**
 * EventBus - Simple synchronous pub/sub system for internal communication
 *
 * All cross-module communication goes through this bus to maintain loose coupling.
 * Events are fired synchronously in the order handlers were registered.
 */

export function createEventBus() {
  const listeners = new Map();

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} handler - Callback function (payload) => void
   */
  function on(event, handler) {
    if (!listeners.has(event)) {
      listeners.set(event, []);
    }
    listeners.get(event).push(handler);
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {Function} handler - Handler to remove
   */
  function off(event, handler) {
    if (!listeners.has(event)) return;

    const handlers = listeners.get(event);
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Emit an event to all subscribers
   * @param {string} event - Event name
   * @param {*} payload - Data to pass to handlers
   */
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
