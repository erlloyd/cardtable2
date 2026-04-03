import type { Scenario, GameAssets, DeckDefinition } from '@cardtable2/shared';
import { type TableObject, formatSortKey } from '@cardtable2/shared';
import { resolveComponentSet, instantiateComponentSet } from './componentSet';

// ============================================================================
// Deck Expansion
// ============================================================================

/**
 * Expand a deck definition into a list of card codes
 * Handles cardSets and individual cards with counts
 */
export function expandDeck(
  deckDef: DeckDefinition,
  content: GameAssets,
): string[] {
  const cards: string[] = [];

  // Add cards from cardSets
  if (deckDef.cardSets) {
    for (const setCode of deckDef.cardSets) {
      const cardSet = content.cardSets[setCode];
      if (!cardSet) {
        throw new Error(`Card set not found: ${setCode}`);
      }
      // CardSets can be arrays of objects {code, count} or legacy arrays of strings
      for (const item of cardSet) {
        if (typeof item === 'string') {
          // Legacy format: plain string
          cards.push(item);
        } else {
          // New format: object with code and optional count
          const count = item.count ?? 1;
          for (let i = 0; i < count; i++) {
            cards.push(item.code);
          }
        }
      }
    }
  }

  // Add individual cards with counts
  if (deckDef.cards) {
    for (const entry of deckDef.cards) {
      const count = entry.count ?? 1;
      for (let i = 0; i < count; i++) {
        cards.push(entry.code);
      }
    }
  }

  // Shuffle if requested
  if (deckDef.shuffle) {
    shuffleArray(cards);
  }

  return cards;
}

/**
 * Fisher-Yates shuffle algorithm
 */
function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// ============================================================================
// Namespacing
// ============================================================================

/**
 * Create a namespaced card code: <packId>/<cardCode>
 * This allows cards from different packs to coexist without collision
 *
 * NOTE: Currently disabled (no-op) - we use plain card codes since gameId
 * in Y.Doc metadata disambiguates which game's assets to use.
 * May be re-enabled later if needed for multi-game scenarios.
 */
export function namespaceCardCode(_packId: string, cardCode: string): string {
  // No-op: Return plain card code
  return cardCode;
}

/**
 * Namespace all cards in a deck based on which pack defined them
 *
 * NOTE: Currently disabled (no-op) - we use plain card codes since gameId
 * in Y.Doc metadata disambiguates which game's assets to use.
 * May be re-enabled later if needed for multi-game scenarios.
 */
export function namespaceDeckCards(
  cards: string[],
  _content: GameAssets,
): string[] {
  // No-op: Return plain card codes
  return cards;
}

// ============================================================================
// Sort Key Generation
// ============================================================================

/**
 * Generate a sort key for z-ordering.
 * Uses zero-padded 6-digit format for correct lexicographic comparison.
 */
export function generateSortKey(index: number): string {
  return formatSortKey((index + 1) * 1000);
}

// ============================================================================
// Scenario Instantiation (delegates to ComponentSet)
// ============================================================================

/**
 * Instantiate all objects from a scenario's componentSet.
 * Returns a map of instance ID to TableObject.
 */
export function instantiateScenario(
  scenario: Scenario,
  content: GameAssets,
): Map<string, TableObject> {
  if (!scenario.componentSet) {
    return new Map();
  }

  const resolved = resolveComponentSet(scenario.componentSet, content);
  return instantiateComponentSet(resolved, content);
}
