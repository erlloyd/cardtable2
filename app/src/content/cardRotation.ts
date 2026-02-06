import type { Card, GameAssets } from '@cardtable2/shared';

/**
 * Determine if a card image needs rotation to match container orientation.
 *
 * Rule: Rotate when image orientation doesn't match container orientation.
 *
 * - Non-exhausted (portrait container): Rotate landscape images
 * - Exhausted (landscape container): Rotate portrait images
 *
 * Currently only handles non-exhausted cards (portrait container).
 *
 * @param _card - Card data with metadata (unused currently, kept for future exhausted support)
 * @param _gameAssets - Game assets (unused currently, kept for future exhausted support)
 * @param imageWidth - Natural width of the loaded image
 * @param imageHeight - Natural height of the loaded image
 * @returns true if the card should be rotated 90°
 *
 * @example
 * ```ts
 * // Portrait container + landscape image -> rotate
 * shouldRotateCard(card, gameAssets, 1030, 710) // true
 *
 * // Portrait container + portrait image -> don't rotate
 * shouldRotateCard(card, gameAssets, 300, 400) // false
 * ```
 */
export function shouldRotateCard(
  _card: Card,
  _gameAssets: GameAssets,
  imageWidth: number,
  imageHeight: number,
): boolean {
  // Check image natural orientation
  const imageIsLandscape = imageWidth > imageHeight;

  // For non-exhausted cards (portrait container):
  // Rotate if image is landscape
  return imageIsLandscape;

  // TODO: When exhausted state is implemented:
  // if (isExhausted) {
  //   return !imageIsLandscape; // Rotate portrait images in landscape container
  // }
}
