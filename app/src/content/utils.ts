import type { Card, GameAssets, OrientationRule } from '@cardtable2/shared';

/**
 * Get the display orientation for a card.
 *
 * Resolution order:
 *  1. `card.orientation` — explicit per-card override (highest priority).
 *     A value of `'auto'` is treated as "no opinion" and falls through to (2).
 *  2. `gameAssets.orientationRules` — plugin-declared rules walked in order.
 *     The first rule whose `match` object's keys ALL match this card's fields
 *     wins. A rule resolving to `'auto'` is treated as "no opinion" for that
 *     rule and the walk continues to the next rule.
 *  3. Fallback `'portrait'`.
 *
 * The cardType-keyed orientation lookup that previously sat between (1) and
 * (3) has been removed. Plugin authors migrate any `cardTypes.X.orientation`
 * setting to a rule like `{ match: { type: 'X' }, orientation: '...' }`.
 *
 * Note: `'auto'` is not yet auto-detected from image aspect ratio; it simply
 * means "this layer has no opinion, defer to the next layer".
 */
export function getCardOrientation(
  card: Card,
  gameAssets: GameAssets,
): 'portrait' | 'landscape' {
  // Layer 1 — per-card override
  if (card.orientation && card.orientation !== 'auto') {
    return card.orientation;
  }

  // Layer 2 — plugin-declared orientation rules. Walk in declared order; the
  // first rule whose match object satisfies the card AND resolves to a
  // concrete orientation wins. A rule with `orientation: 'auto'` is treated
  // as "no opinion" — even when the match object fires, the walk continues
  // to the next rule (mirroring the per-card 'auto' fallthrough).
  const resolved = walkOrientationRules(card, gameAssets.orientationRules);
  if (resolved) {
    return resolved;
  }

  // Layer 3 — fallback
  return 'portrait';
}

/**
 * Walk `rules` in declared order; return the orientation of the first rule
 * whose `match` object is satisfied by `card` AND whose `orientation` is a
 * concrete value (`'portrait'` or `'landscape'`). Rules resolving to `'auto'`
 * are treated as "no opinion" — the walk skips them even when they match
 * structurally. Returns `null` when no rule produces a concrete answer.
 */
function walkOrientationRules(
  card: Card,
  rules: OrientationRule[] | undefined,
): 'portrait' | 'landscape' | null {
  if (!rules || rules.length === 0) {
    return null;
  }
  // Treat the card as a plain field-name → value lookup. Card field values
  // we match on are strings (type, typeCode, setCode, etc.); rule values are
  // declared `Record<string, string>`, so a strict equality check is correct.
  const cardFields = card as unknown as Record<string, unknown>;
  for (const rule of rules) {
    let allMatch = true;
    for (const [field, expected] of Object.entries(rule.match)) {
      if (cardFields[field] !== expected) {
        allMatch = false;
        break;
      }
    }
    if (allMatch && rule.orientation !== 'auto') {
      return rule.orientation;
    }
  }
  return null;
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
 * // Returns 'landscape' if a rule matches the rhino card, else 'portrait'
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
