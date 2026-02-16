/**
 * Fan layout computation for overlapping card display.
 *
 * Cards are laid out horizontally with overlap when they exceed the container width.
 * Minimum 30% of each card remains visible.
 */

export const CARD_WIDTH = 72; // Approximate card width at 100px height (poker ratio ~63:88)
const MIN_VISIBLE_RATIO = 0.3;

export interface FanLayout {
  overlap: number;
  startOffset: number;
  cardWidth: number;
}

export function computeFanLayout(
  cardCount: number,
  availableWidth: number,
): FanLayout {
  if (cardCount === 0) {
    return { overlap: 0, startOffset: 0, cardWidth: CARD_WIDTH };
  }

  const totalWidth = cardCount * CARD_WIDTH;

  if (totalWidth <= availableWidth) {
    // Cards fit without overlap — center them
    const startOffset = (availableWidth - totalWidth) / 2;
    return { overlap: 0, startOffset, cardWidth: CARD_WIDTH };
  }

  // Need overlap
  const maxOverlap = CARD_WIDTH * (1 - MIN_VISIBLE_RATIO);
  const neededOverlap =
    cardCount > 1 ? (totalWidth - availableWidth) / (cardCount - 1) : 0;
  const overlap = Math.min(neededOverlap, maxOverlap);
  const actualWidth =
    cardCount * CARD_WIDTH - (cardCount > 1 ? (cardCount - 1) * overlap : 0);
  const startOffset = Math.max(0, (availableWidth - actualWidth) / 2);

  return { overlap, startOffset, cardWidth: CARD_WIDTH };
}
