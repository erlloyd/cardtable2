/**
 * Debug Configuration
 *
 * Centralized debug flags for controlling console logging verbosity.
 * Set these to false in production or when specific logs are too noisy.
 */

export const DEBUG = {
  /**
   * Log all message bus activity (very noisy - includes pointer-move, etc.)
   * Recommended: false for normal development, true for debugging message flow
   */
  MESSAGE_BUS_VERBOSE: false,

  /**
   * Log slow message handlers (> 10ms)
   * Recommended: true (helps identify performance issues)
   */
  PERFORMANCE: true,

  /**
   * Log flip actions (cards/tokens being flipped)
   * Recommended: true (helps debug flip functionality)
   */
  FLIP_ACTIONS: true,

  /**
   * Log migration activity on table load
   * Recommended: true (helps debug schema upgrades)
   */
  MIGRATIONS: true,
};

/**
 * Messages to always skip logging (even when MESSAGE_BUS_VERBOSE is true).
 * These are extremely high-frequency and provide little value.
 */
export const MESSAGE_BUS_SKIP_TYPES = new Set([
  'pointer-move', // Fires on every mouse move
  'cursor-position', // Fires at 30Hz during mouse movement
  'drag-state-update', // Fires at 30Hz during drag
]);
