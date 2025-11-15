/**
 * Rendering constants for the card table.
 */

/**
 * Standard card size in world coordinates (portrait orientation)
 * Poker card aspect ratio: 2.5" x 3.5" → 63x88px at 25.4 DPI
 */
export const CARD_WIDTH = 63;
export const CARD_HEIGHT = 88;

/**
 * Test scene card colors (will be replaced with real card rendering in future milestones)
 */
export const TEST_CARD_COLORS: Record<string, number> = {
  'card-1': 0x6c5ce7, // Purple
  'card-2': 0x00b894, // Green
  'card-3': 0xfdcb6e, // Yellow
  'card-4': 0xff7675, // Red
  'card-5': 0x74b9ff, // Blue
};
