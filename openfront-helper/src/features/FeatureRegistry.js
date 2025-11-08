/**
 * FeatureRegistry - Plugin system for helper features
 *
 * Features are self-contained modules that receive a FeatureAPI
 * and can subscribe to events, read state, and control UI.
 */

/**
 * Create feature registry
 * @param {Object} api - FeatureAPI object
 * @returns {Object} Registry API
 */
export function createFeatureRegistry(api) {
  const features = new Map();

  /**
   * Register a feature
   * @param {string} name - Feature name
   * @param {Function} factory - (api) => { init?, destroy? }
   */
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

  /**
   * Unregister a feature
   * @param {string} name - Feature name
   */
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

  /**
   * Get feature instance
   * @param {string} name - Feature name
   * @returns {Object|undefined} Feature instance
   */
  function getFeature(name) {
    return features.get(name);
  }

  /**
   * List all registered features
   * @returns {Array<string>} Feature names
   */
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
