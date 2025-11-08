/**
 * SummaryHUD - First milestone feature
 *
 * Displays real-time summary of player stats synchronized with game ticks.
 * Pure informational display - no game actions.
 */

/**
 * Create SummaryHUD feature
 * @param {Object} api - FeatureAPI
 * @returns {Object} Feature instance
 */
export function createSummaryHUD(api) {
  const { on, UI, selectors, getState } = api;

  const PANEL_ID = 'summary';
  let lastUpdateTick = -1;

  /**
   * Format number with K/M suffix
   * @param {number} num - Number to format
   * @returns {string} Formatted string
   */
  function formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return Math.floor(num).toString();
  }

  /**
   * Update HUD with current stats
   * @param {Object} payload - { tick, state }
   */
  function updateHUD(payload) {
    const { tick, state } = payload;

    // Throttle updates (update every tick is fine, but can adjust if needed)
    if (tick === lastUpdateTick) return;
    lastUpdateTick = tick;

    const my = selectors.getMySummary(state);

    // Skip if player hasn't spawned yet
    if (!my.isAlive || my.tiles === 0) {
      UI.setPanelText(PANEL_ID, 'Waiting for spawn...');
      return;
    }

    // Format: T:<tick> Tiles:<tiles> Troops:<troops> Gold:<gold>/<goldCap> Pop:<troops>/<troopCap>
    const summary = [
      `T:${tick}`,
      `Tiles:${my.tiles}`,
      `Troops:${formatNumber(my.troops)}/${formatNumber(my.troopCap)}`,
      `Gold:${formatNumber(my.gold)}/${formatNumber(my.goldCap)}`,
    ].join(' | ');

    UI.setPanelText(PANEL_ID, summary);
  }

  /**
   * Initialize feature
   */
  function init() {
    // Create panel
    UI.createPanel(PANEL_ID);
    UI.setPanelText(PANEL_ID, 'OpenFront Helper v1.0 - Initializing...');

    // Subscribe to tick events
    on('turn:tick', updateHUD);

    console.log('[SummaryHUD] Initialized');
  }

  /**
   * Cleanup
   */
  function destroy() {
    UI.removePanel(PANEL_ID);
    console.log('[SummaryHUD] Destroyed');
  }

  return { init, destroy };
}
