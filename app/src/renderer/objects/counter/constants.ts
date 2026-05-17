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
 * affordance as a stack's count. Bare (unlabeled) counters use
 * `COUNTER_VALUE_FONT_SIZE`; labeled counters use the smaller
 * `COUNTER_VALUE_FONT_SIZE_LABELED` so the small label line above can fit
 * inside a pill of nearly the same height.
 */
export const COUNTER_VALUE_FONT_SIZE = 22;
export const COUNTER_VALUE_FONT_SIZE_LABELED = 18;
export const COUNTER_VALUE_TEXT_COLOR = 0xffffff;
export const COUNTER_VALUE_STROKE_COLOR = 0x000000;
export const COUNTER_VALUE_STROKE_WIDTH = 3;

/** +/- glyph styling. Event wiring lands in ct-d2p. */
export const COUNTER_ZONE_GLYPH_FONT_SIZE = 24;
export const COUNTER_ZONE_GLYPH_COLOR = 0xffffff;
/** Glyph alpha at rest (no hover, value not at boundary). */
export const COUNTER_ZONE_GLYPH_ALPHA = 0.55;
/** Glyph alpha while the side zone is hovered or actively pressed. */
export const COUNTER_ZONE_GLYPH_ALPHA_ACTIVE = 1.0;
/**
 * Glyph alpha when the corresponding boundary is reached (plus at max,
 * minus at min). The zone stops responding to taps in this state.
 */
export const COUNTER_ZONE_GLYPH_ALPHA_BOUNDARY = 0.25;

/**
 * Tint overlay drawn behind the +/- glyph when its zone is hovered (ct-d2p).
 * A low-alpha white overlay sits on top of the pill body, brightening the
 * relevant third of the pill without changing the body color.
 */
export const COUNTER_ZONE_HOVER_TINT_COLOR = 0xffffff;
export const COUNTER_ZONE_HOVER_TINT_ALPHA = 0.18;

/**
 * Pill-body clamp-flash overlay (ct-d2p). When a +/- tap hits a boundary,
 * the body is briefly washed with this color to signal "blocked", then
 * cleared. The body's underlying color is preserved (no recolor).
 */
export const COUNTER_CLAMP_FLASH_COLOR = 0xffffff;
export const COUNTER_CLAMP_FLASH_ALPHA = 0.45;
export const COUNTER_CLAMP_FLASH_DURATION_MS = 100;

/**
 * Label (`text`) styling — rendered as a small bold line ABOVE the value
 * line, inside the same pill silhouette (ct-bmk). When a counter has a
 * `text` value the pill grows by `COUNTER_LABEL_HEIGHT_BUMP` so two lines
 * of text fit comfortably, with the small label on top and the (slightly
 * smaller) numeric value below. The bare and labeled counters share one
 * pill silhouette — same fill color, same border, same +/- treatment.
 */
export const COUNTER_LABEL_FONT_SIZE = 11;
export const COUNTER_LABEL_TEXT_COLOR = 0xffffff;
export const COUNTER_LABEL_ALPHA = 0.95;
/**
 * Extra height added to the pill when a label is present. Just enough to
 * fit the small label line above the (slightly-shrunk) numeric value
 * without crowding either line. The pill stays a single rounded-rect
 * silhouette; +/- hit-tests cover the full pill, not a sub-region.
 */
export const COUNTER_LABEL_HEIGHT_BUMP = 6;
/**
 * Vertical positions (local-y inside the pill) of the two text lines in
 * the labeled state. The label sits slightly above center; the value sits
 * slightly below. Tuned so both feel comfortably padded inside the taller
 * pill silhouette.
 */
export const COUNTER_LABEL_LINE_Y = -8;
export const COUNTER_VALUE_LINE_Y_LABELED = 6;

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
