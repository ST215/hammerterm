/**
 * Actions - Game interaction wrapper (optional)
 *
 * Centralized API for scripted interactions with the game.
 * Currently stubs - implement based on client APIs when needed.
 *
 * Features that automate actions should call these methods
 * instead of directly manipulating DOM or sending raw messages.
 */

export function createActions() {
  /**
   * Send troops from one tile to another
   * @param {Object} opts - { fromTile: number, toTile: number, percent: number }
   */
  function sendTroops(opts) {
    console.warn('[Actions] sendTroops not yet implemented', opts);
    // TODO: Implement by finding client's send troops function or DOM interaction
    // May need to inspect game client code to find proper API
  }

  /**
   * Send gold to a player
   * @param {Object} opts - { toPlayerId: number, amount: number }
   */
  function sendGold(opts) {
    console.warn('[Actions] sendGold not yet implemented', opts);
    // TODO: Implement gold transfer logic
  }

  /**
   * Send alliance request
   * @param {number} playerId - Target player ID
   */
  function sendAllianceRequest(playerId) {
    console.warn('[Actions] sendAllianceRequest not yet implemented', playerId);
    // TODO: Implement alliance request
  }

  /**
   * Accept alliance request
   * @param {number} playerId - Player who sent the request
   */
  function acceptAllianceRequest(playerId) {
    console.warn('[Actions] acceptAllianceRequest not yet implemented', playerId);
    // TODO: Implement alliance accept
  }

  /**
   * Break alliance
   * @param {number} playerId - Ally to break with
   */
  function breakAlliance(playerId) {
    console.warn('[Actions] breakAlliance not yet implemented', playerId);
    // TODO: Implement alliance break
  }

  /**
   * Send chat message
   * @param {string} message - Message to send
   */
  function sendChat(message) {
    console.warn('[Actions] sendChat not yet implemented', message);
    // TODO: Implement chat
  }

  /**
   * Spawn on a tile
   * @param {number} tileRef - Tile reference to spawn on
   */
  function spawn(tileRef) {
    console.warn('[Actions] spawn not yet implemented', tileRef);
    // TODO: Implement spawn
  }

  return {
    sendTroops,
    sendGold,
    sendAllianceRequest,
    acceptAllianceRequest,
    breakAlliance,
    sendChat,
    spawn,
  };
}
