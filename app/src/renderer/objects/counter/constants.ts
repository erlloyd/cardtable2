/**
 * Pill geometry (ct-yxh).
 *
 * Touch-first sizing. The pill is a horizontal rounded rectangle with three
 * conceptual zones (minus / value / plus). Increased above the initial 60x36
 * spec to give the +/- hit targets meaningful room at default zoom — the
 * value zone in the center stays generous, and the side zones feel tap-
 * friendly without requiring the user to zoom in. Event wiring for the +/-
 * zones is the next bead (ct-d2p); these dimensions are tuned for that
 * downstream work.
 */
export const COUNTER_PILL_WIDTH = 90;
export const COUNTER_PILL_HEIGHT = 44;
export const COUNTER_PILL_BORDER_RADIUS = COUNTER_PILL_HEIGHT / 2;

/** Default counter color if not specified */
export const COUNTER_DEFAULT_COLOR = 0xf39c12; // Orange

/** Border colors */
export const COUNTER_BORDER_COLOR_NORMAL = 0x2d3436; // Dark gray
export const COUNTER_BORDER_COLOR_SELECTED = 0xef4444; // Red

/**
 * Value text styling. Mirrors the stack count-badge text style (white fill,
 * dark stroke, bold) so the counter value reads as the same kind of
 * affordance as a stack's count.
 */
export const COUNTER_VALUE_FONT_SIZE = 22;
export const COUNTER_VALUE_TEXT_COLOR = 0xffffff;
export const COUNTER_VALUE_STROKE_COLOR = 0x000000;
export const COUNTER_VALUE_STROKE_WIDTH = 3;

/** +/- glyph styling (visual only in this bead; ct-d2p wires events). */
export const COUNTER_ZONE_GLYPH_FONT_SIZE = 24;
export const COUNTER_ZONE_GLYPH_COLOR = 0xffffff;
export const COUNTER_ZONE_GLYPH_ALPHA = 0.55;

/** Label (`text`) styling — small, semi-opaque, top-left of center zone. */
export const COUNTER_LABEL_FONT_SIZE = 10;
export const COUNTER_LABEL_TEXT_COLOR = 0xffffff;
export const COUNTER_LABEL_ALPHA = 0.6;

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
