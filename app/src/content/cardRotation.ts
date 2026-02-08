import type { Card, GameAssets } from '@cardtable2/shared';

/**
 * Determine if a card image needs rotation based on image aspect ratio.
 *
 * Currently rotates all landscape images (width > height) to fit portrait containers.
 * This is a simplified implementation that assumes all containers are portrait-oriented.
 *
 * @param _card - Card data (reserved for future exhausted state support)
 * @param _gameAssets - Game assets (reserved for future exhausted state support)
 * @param imageWidth - Natural width of the loaded image in pixels
 * @param imageHeight - Natural height of the loaded image in pixels
 * @returns true if the image should be rotated 90° clockwise (landscape images only)
 *
 * @example
 * ```ts
 * // Landscape image (wider than tall) -> rotate
 * shouldRotateCard(card, gameAssets, 1030, 710) // true
 *
 * // Portrait image (taller than wide) -> don't rotate
 * shouldRotateCard(card, gameAssets, 300, 400) // false
 *
 * // Square image -> don't rotate
 * shouldRotateCard(card, gameAssets, 500, 500) // false
 * ```
 *
 * @todo Add exhausted state support: rotate portrait images when card is exhausted (landscape container)
 */
export function shouldRotateCard(
  _card: Card,
  _gameAssets: GameAssets,
  imageWidth: number,
  imageHeight: number,
): boolean {
  // Check if image is landscape (wider than tall)
  const imageIsLandscape = imageWidth > imageHeight;

  // Rotate landscape images to fit portrait containers
  return imageIsLandscape;

  // TODO: When exhausted state is implemented:
  // if (isExhausted) {
  //   return !imageIsLandscape; // Rotate portrait images in landscape container
  // }
}
