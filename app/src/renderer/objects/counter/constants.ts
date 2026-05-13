/**
 * Default counter size (radius). Retained for legacy circle render in
 * behaviors.ts; pill geometry (ct-yxh) will own its own dimensions.
 */
export const COUNTER_DEFAULT_SIZE = 40;

/** Default counter color if not specified */
export const COUNTER_DEFAULT_COLOR = 0xf39c12; // Orange

/** Border colors */
export const COUNTER_BORDER_COLOR_NORMAL = 0x2d3436; // Dark gray
export const COUNTER_BORDER_COLOR_SELECTED = 0xef4444; // Red

// ============================================================================
// CounterMeta defaults (template + instance model)
// ============================================================================

/**
 * Built-in counter type identifier used when no plugin-defined type applies.
 * Generic counters carry their own template properties on the instance and
 * are not backed by a registered counter type definition.
 */
export const COUNTER_TYPE_GENERIC = 'generic';

/** Default minimum value for a counter */
export const COUNTER_DEFAULT_MIN = 0;

/** Default maximum value for a counter */
export const COUNTER_DEFAULT_MAX = 99;

/** Default starting value for a counter */
export const COUNTER_DEFAULT_STARTING_VALUE = 0;
