/**
 * UI - HUD overlay and panel management
 *
 * Provides a fixed overlay container and named panels for features.
 * Minimal styling to avoid interfering with game UI.
 */

export function createUI() {
  let hudContainer = null;
  const panels = new Map();
  let isInitialized = false;

  /**
   * Create the main HUD container
   */
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

  /**
   * Create or get a named panel
   * @param {string} id - Unique panel identifier
   * @param {Object} opts - Optional configuration
   * @returns {HTMLElement} Panel element
   */
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

  /**
   * Set panel text content
   * @param {string} id - Panel identifier
   * @param {string} text - Text to display
   */
  function setPanelText(id, text) {
    const panel = panels.get(id);
    if (!panel) {
      console.warn(`[UI] Panel "${id}" not found`);
      return;
    }
    panel.textContent = text;
  }

  /**
   * Set panel HTML content
   * @param {string} id - Panel identifier
   * @param {string} html - HTML to display
   */
  function setPanelHTML(id, html) {
    const panel = panels.get(id);
    if (!panel) {
      console.warn(`[UI] Panel "${id}" not found`);
      return;
    }
    panel.innerHTML = html;
  }

  /**
   * Remove a panel
   * @param {string} id - Panel identifier
   */
  function removePanel(id) {
    const panel = panels.get(id);
    if (panel) {
      panel.remove();
      panels.delete(id);
    }
  }

  /**
   * Hide/show panel
   * @param {string} id - Panel identifier
   * @param {boolean} visible - Whether to show the panel
   */
  function setPanelVisible(id, visible) {
    const panel = panels.get(id);
    if (panel) {
      panel.style.display = visible ? 'block' : 'none';
    }
  }

  /**
   * Initialize UI (idempotent)
   */
  function init() {
    if (isInitialized) {
      console.warn('[UI] Already initialized');
      return;
    }

    // Wait for body to be available
    if (!document.body) {
      console.warn('[UI] Document body not ready, waiting...');
      setTimeout(init, 100);
      return;
    }

    hudContainer = createHUDContainer();
    isInitialized = true;
    console.log('[UI] Initialized - HUD container created');
  }

  /**
   * Cleanup - remove all UI elements
   */
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
