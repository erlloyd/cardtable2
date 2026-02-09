/** Standard card dimensions (poker card aspect ratio) */
export const STACK_WIDTH = 63;
export const STACK_HEIGHT = 88;

/** Border radius for card corners */
export const STACK_BORDER_RADIUS = 12;

/** Default card color if not specified */
export const STACK_DEFAULT_COLOR = 0x6c5ce7; // Purple

/** Border colors */
export const STACK_BORDER_COLOR_NORMAL = 0x2d3436; // Dark gray
export const STACK_BORDER_COLOR_SELECTED = 0xef4444; // Red
export const STACK_BORDER_COLOR_TARGET = 0xef4444; // Red (same as selection for consistent visual)

/** 3D effect for multi-card stacks */
export const STACK_3D_OFFSET_X = -3; // Offset left
export const STACK_3D_OFFSET_Y = 3; // Offset down (lower-left)
export const STACK_3D_COLOR = 0x555555; // Grey
export const STACK_3D_ALPHA = 0.6;

/** Badge styling (count and unstack handle) */
export const STACK_BADGE_SIZE = 18; // Width/height of rounded square
export const STACK_BADGE_RADIUS = 4; // Corner radius for rounded square
export const STACK_BADGE_COLOR = 0x1e1e1e; // Dark grey
export const STACK_BADGE_ALPHA = 0.85;
export const STACK_BADGE_TEXT_COLOR = 0xffffff; // White
export const STACK_BADGE_FONT_SIZE = 12;

// ============================================================================
// On-Card Attachment Constants
// ============================================================================

/** Attachment sizes */
export const ATTACHMENT_TOKEN_SIZE = 24; // Token image base size (px)
export const ATTACHMENT_MODIFIER_HEIGHT = 16; // Modifier bar height (px)
export const ATTACHMENT_ICON_SIZE = 16; // Icon image size (px)

/** Attachment spacing */
export const ATTACHMENT_VERTICAL_SPACING = 4; // Gap between attachments of same type (px)
export const ATTACHMENT_TYPE_SPACING = 8; // Gap between different attachment types (px)
export const ATTACHMENT_START_Y = -STACK_HEIGHT / 2 + 8; // Start position from card top (px)
export const ATTACHMENT_BADGE_PADDING = 8; // Horizontal padding inside status/modifier badges (px)

/** Attachment text */
export const ATTACHMENT_COUNT_FONT_SIZE = 12; // Token count overlay font size
export const ATTACHMENT_LABEL_FONT_SIZE = 10; // Status/modifier label font size
export const ATTACHMENT_TEXT_COLOR = 0xffffff; // White text

/** Attachment colors (defaults) */
export const MODIFIER_BAR_ALPHA = 0.85;

/** Modifier stat default colors */
export const MODIFIER_COLOR_POSITIVE = 0x4caf50; // Green
export const MODIFIER_COLOR_NEGATIVE = 0xf44336; // Red
