/**
 * Selectors - Stateless helper functions for derived data
 *
 * Pure functions that read GameSnapshot and compute useful values.
 * Features should use these instead of re-implementing logic.
 */

/**
 * Get the current player's data
 * @param {Object} state - GameSnapshot from Store
 * @returns {Object|null} Current player snapshot or null
 */
export function getMyPlayer(state) {
  if (state.myPlayerId === null) {
    return null;
  }
  return state.players[state.myPlayerId] || null;
}

/**
 * Get current player's summary stats
 * @param {Object} state - GameSnapshot from Store
 * @returns {Object} Summary with tiles, troops, gold, caps
 */
export function getMySummary(state) {
  return state.my;
}

/**
 * Get leaderboard (all players sorted by tiles)
 * @param {Object} state - GameSnapshot from Store
 * @returns {Array} Players sorted by tiles descending
 */
export function getLeaderboard(state) {
  return Object.values(state.players)
    .filter((p) => p.hasSpawned)
    .sort((a, b) => b.tiles - a.tiles);
}

/**
 * Get current player's allies
 * @param {Object} state - GameSnapshot from Store
 * @returns {Array} Array of ally player snapshots
 */
export function getAllies(state) {
  const me = getMyPlayer(state);
  if (!me || !me.allies) {
    return [];
  }

  return me.allies
    .map((allySmallId) => state.players[allySmallId])
    .filter(Boolean);
}

/**
 * Get all players who are alive
 * @param {Object} state - GameSnapshot from Store
 * @returns {Array} Array of alive players
 */
export function getAlivePlayers(state) {
  return Object.values(state.players).filter((p) => p.isAlive && p.hasSpawned);
}

/**
 * Get player by smallID
 * @param {Object} state - GameSnapshot from Store
 * @param {number} smallID - Player's small ID
 * @returns {Object|null} Player snapshot or null
 */
export function getPlayerBySmallID(state, smallID) {
  return state.players[smallID] || null;
}

/**
 * Calculate income rate per second
 * @param {Object} state - GameSnapshot from Store
 * @returns {Object} { gold: number, troops: number } per second rates
 */
export function getIncomeRates(state) {
  const me = getMyPlayer(state);
  if (!me) {
    return { gold: 0, troops: 0 };
  }

  // Gold rate: 100 per tick for humans, 50 for bots
  // 10 ticks per second (100ms per tick)
  const goldPerTick = me.playerType === 1 ? 50 : 100; // 1 = Bot
  const goldPerSecond = goldPerTick * 10;

  // Troop rate formula (from DefaultConfig.ts)
  const maxTroops = state.my.troopCap;
  const currentTroops = state.my.troops;
  const ratio = maxTroops > 0 ? 1 - currentTroops / maxTroops : 0;
  const troopsPerTick = (10 + Math.pow(currentTroops, 0.73) / 4) * ratio;
  const troopsPerSecond = troopsPerTick * 10;

  return {
    gold: goldPerSecond,
    troops: troopsPerSecond,
  };
}
