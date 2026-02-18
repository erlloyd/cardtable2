/**
 * Fan layout computation for overlapping card display.
 *
 * Cards are laid out horizontally with overlap when they exceed the container width.
 * Desktop: minimum 30% of each card remains visible (max 70% overlap).
 * Mobile: minimum 60% of each card remains visible (max 40% overlap) for touch targets.
 */

export const CARD_WIDTH = 72; // Approximate card width at 100px height (poker ratio ~63:88)
const MIN_VISIBLE_RATIO_DESKTOP = 0.3;
const MIN_VISIBLE_RATIO_MOBILE = 0.6;

export interface FanLayout {
  overlap: number;
  startOffset: number;
  cardWidth: number;
  totalContentWidth: number;
}

export function computeFanLayout(
  cardCount: number,
  availableWidth: number,
  isMobile?: boolean,
): FanLayout {
  if (cardCount === 0) {
    return {
      overlap: 0,
      startOffset: 0,
      cardWidth: CARD_WIDTH,
      totalContentWidth: 0,
    };
  }

  const minVisibleRatio = isMobile
    ? MIN_VISIBLE_RATIO_MOBILE
    : MIN_VISIBLE_RATIO_DESKTOP;
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
  const maxOverlap = CARD_WIDTH * (1 - minVisibleRatio);
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
