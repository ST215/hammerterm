/**
 * OpenFront Helper - Main Entry Point
 *
 * Tick-synchronized game helper for OpenFront.io
 * Based on the OpenFrontIO codebase architecture
 */

import { createEventBus } from './core/EventBus.js';
import { createStore } from './core/Store.js';
import { createWiretap } from './core/Wiretap.js';
import { createTurnClock } from './core/TurnClock.js';
import * as selectors from './api/Selectors.js';
import { createUI } from './api/UI.js';
import { createActions } from './api/Actions.js';
import { createFeatureRegistry } from './features/FeatureRegistry.js';
import { createSummaryHUD } from './features/SummaryHUD.js';

/**
 * Main OpenFront Helper instance
 */
function createOpenFrontHelper() {
  let isStarted = false;

  // Core modules
  const eventBus = createEventBus();
  const store = createStore(eventBus);
  const wiretap = createWiretap(eventBus);
  const turnClock = createTurnClock(eventBus, store);
  const ui = createUI();
  const actions = createActions();

  // Feature API
  const featureAPI = {
    on: eventBus.on,
    emit: eventBus.emit,
    getState: store.getState,
    UI: ui,
    Actions: actions,
    selectors,
  };

  // Feature registry
  const featureRegistry = createFeatureRegistry(featureAPI);

  /**
   * Start the helper
   */
  function start() {
    if (isStarted) {
      console.warn('[OFHelper] Already started');
      return;
    }

    console.log('[OFHelper] Starting OpenFront Helper v1.0...');

    // Initialize core systems
    ui.init();
    wiretap.init();
    turnClock.init();

    // Register built-in features
    featureRegistry.registerFeature('SummaryHUD', createSummaryHUD);

    isStarted = true;
    console.log('[OFHelper] Started successfully!');
    console.log('[OFHelper] Use window.OFHelper to access the API');
  }

  /**
   * Stop the helper
   */
  function stop() {
    console.log('[OFHelper] Stopping...');
    ui.destroy();
    isStarted = false;
  }

  // Public API
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

// Auto-start when loaded
const OFHelper = createOpenFrontHelper();

// Expose to window
if (typeof window !== 'undefined') {
  window.OFHelper = OFHelper;
  OFHelper.start();
}

export default OFHelper;
