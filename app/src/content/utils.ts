import type { Card, GameAssets } from '@cardtable2/shared';

/**
 * Get the display orientation for a card
 *
 * Follows inheritance chain:
 * 1. Check card.orientation (explicit override)
 * 2. Check cardType.orientation (type default)
 * 3. Default to 'portrait'
 *
 * Note: 'auto' is treated as 'portrait' for now.
 * Future enhancement: detect from image aspect ratio.
 *
 * @param card - Card data from GameAssets
 * @param gameAssets - All loaded game assets
 * @returns 'portrait' or 'landscape'
 *
 * @example
 * ```typescript
 * const orientation = getCardOrientation(card, gameAssets);
 * // Returns 'landscape' if card or its type specifies landscape
 * // Otherwise returns 'portrait'
 * ```
 */
export function getCardOrientation(
  card: Card,
  gameAssets: GameAssets,
): 'portrait' | 'landscape' {
  // Check card-level override (explicit)
  if (card.orientation && card.orientation !== 'auto') {
    return card.orientation;
  }

  // Check card type default
  const cardType = gameAssets.cardTypes[card.type];
  if (cardType?.orientation && cardType.orientation !== 'auto') {
    return cardType.orientation;
  }

  // Default to portrait
  return 'portrait';
}

/**
 * Get the display orientation for a card by card code
 *
 * Convenience wrapper that looks up the card in gameAssets
 * and returns its orientation.
 *
 * @param cardCode - Card code (ID) to look up
 * @param gameAssets - All loaded game assets
 * @returns 'portrait' or 'landscape', or null if card not found
 *
 * @example
 * ```typescript
 * const orientation = getCardOrientationByCode('mc01_rhino', gameAssets);
 * // Returns 'landscape' if rhino card or villain type is landscape
 * ```
 */
export function getCardOrientationByCode(
  cardCode: string,
  gameAssets: GameAssets,
): 'portrait' | 'landscape' | null {
  const card = gameAssets.cards[cardCode];
  if (!card) {
    return null;
  }
  return getCardOrientation(card, gameAssets);
}
