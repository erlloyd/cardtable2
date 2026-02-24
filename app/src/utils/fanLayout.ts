/**
 * Fan layout computation for overlapping card display.
 *
 * Cards are laid out horizontally, centered when they fit. When they exceed
 * the container width, overlap increases smoothly up to a maximum of 70%
 * (minimum 30% of each card remains visible). Beyond that, the container
 * scrolls. Same behavior on all devices.
 */

export const CARD_WIDTH = 72; // Approximate card width at 100px height (poker ratio ~63:88)
const MIN_VISIBLE_RATIO = 0.5;

export interface FanLayout {
  overlap: number;
  startOffset: number;
  cardWidth: number;
  totalContentWidth: number;
}

export function computeFanLayout(
  cardCount: number,
  availableWidth: number,
): FanLayout {
  const totalWidth = cardCount * CARD_WIDTH;

  if (totalWidth <= availableWidth) {
    const startOffset = (availableWidth - totalWidth) / 2;
    return {
      overlap: 0,
      startOffset,
      cardWidth: CARD_WIDTH,
      totalContentWidth: totalWidth,
    };
  }

  // Need overlap
  const maxOverlap = CARD_WIDTH * (1 - MIN_VISIBLE_RATIO);
  const neededOverlap =
    cardCount > 1 ? (totalWidth - availableWidth) / (cardCount - 1) : 0;
  const overlap = Math.min(neededOverlap, maxOverlap);
  const actualWidth =
    cardCount * CARD_WIDTH - (cardCount > 1 ? (cardCount - 1) * overlap : 0);
  const startOffset = Math.max(0, (availableWidth - actualWidth) / 2);

  return {
    overlap,
    startOffset,
    cardWidth: CARD_WIDTH,
    totalContentWidth: actualWidth,
  };
}
