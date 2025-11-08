/**
 * Store - Canonical game state mirror
 *
 * Maintains a read-only snapshot of game state synchronized with server ticks.
 * Only Wiretap/TurnClock may mutate via updateFromGameUpdate.
 * Features consume via getState() or events.
 */

/**
 * GameUpdateType enum values (from OpenFront GameUpdates.ts)
 */
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

export function createStore(eventBus) {
  const state = {
    tick: 0,
    myPlayerId: null,
    myClientId: null,
    players: {}, // Record<smallID, PlayerSnapshot>
    units: {},   // Record<unitId, UnitSnapshot>
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

  /**
   * Get frozen snapshot of current state
   * @returns {Object} Deep-frozen state snapshot
   */
  function getState() {
    // Shallow clone to prevent external mutation
    return {
      ...state,
      players: { ...state.players },
      my: { ...state.my },
    };
  }

  /**
   * Calculate max troops for a player based on OpenFront formula
   * From DefaultConfig.ts: maxTroops calculation
   * @param {number} tiles - Number of tiles owned
   * @param {number} cityBonusTroops - Bonus from cities (cityLevels * 250000)
   * @returns {number} Maximum troop capacity
   */
  function calculateMaxTroops(tiles, cityBonusTroops = 0) {
    const baseTroops = 2 * (Math.pow(tiles, 0.6) * 1000 + 50000);
    return Math.floor(baseTroops + cityBonusTroops);
  }

  /**
   * Calculate max gold (simplified - actual may depend on game config)
   * For now, use a reasonable cap based on observed patterns
   * @param {number} tiles - Number of tiles owned
   * @returns {number} Maximum gold capacity
   */
  function calculateMaxGold(tiles) {
    // Simplified formula - adjust based on actual game observation
    return Math.floor(tiles * 5000 + 100000);
  }

  /**
   * Update state from GameUpdateViewData
   * @param {Object} viewData - GameUpdateViewData from server
   */
  function updateFromGameUpdate(viewData) {
    if (!viewData || !viewData.updates) {
      console.warn('[Store] Invalid viewData received');
      return;
    }

    // Update tick
    state.tick = viewData.tick || state.tick;

    // Process player updates
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

      // Try to identify "my" player
      if (!state.myPlayerId && snapshot.clientID && snapshot.isAlive) {
        // Heuristic: first alive player with clientID
        state.myPlayerId = snapshot.smallID;
        state.myClientId = snapshot.clientID;
      }
    }

    // Process unit updates (for city bonus troops calculation)
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
        // Unit destroyed
        delete state.units[unitUpdate.id];
      }
    }

    // Update "my" summary
    if (state.myPlayerId !== null && state.players[state.myPlayerId]) {
      const me = state.players[state.myPlayerId];

      // Calculate city bonus (UnitType.City = 0, based on OpenFront code)
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

    // Emit state update
    eventBus.emit('state:updated', getState());
  }

  return {
    getState,
    updateFromGameUpdate,
  };
}

export { GameUpdateType };
