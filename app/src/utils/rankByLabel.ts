import { fuzzyMatch } from './fuzzySearch';

const TIER_EXACT = 5;
const TIER_PREFIX = 4;
const TIER_SUBSTRING = 3;
const TIER_FUZZY_LABEL = 2;
const TIER_DESCRIPTION = 1;

interface Ranked<T> {
  item: T;
  tier: number;
  score: number;
}

function rank(
  label: string,
  description: string,
  query: string,
): { tier: number; score: number } {
  const l = label.toLowerCase();
  const q = query.toLowerCase();
  if (l === q) return { tier: TIER_EXACT, score: 0 };
  if (l.startsWith(q)) return { tier: TIER_PREFIX, score: 0 };
  if (l.includes(q)) return { tier: TIER_SUBSTRING, score: 0 };
  const labelScore = fuzzyMatch(label, query);
  if (labelScore > 0) {
    return { tier: TIER_FUZZY_LABEL, score: labelScore };
  }
  const descriptionScore = fuzzyMatch(description, query);
  if (descriptionScore > 0) {
    return { tier: TIER_DESCRIPTION, score: descriptionScore };
  }
  return { tier: 0, score: 0 };
}

/**
 * Ranks items for a non-empty query: exact label, label prefix, label
 * substring, fuzzy label, description-only. Non-matches are dropped; ties keep
 * the input order.
 */
export function rankByLabel<T>(
  items: T[],
  query: string,
  getLabel: (item: T) => string,
  getDescription: (item: T) => string,
): T[] {
  const ranked: Ranked<T>[] = [];
  for (const item of items) {
    const { tier, score } = rank(getLabel(item), getDescription(item), query);
    if (tier > 0) ranked.push({ item, tier, score });
  }
  return ranked
    .sort((a, b) => b.tier - a.tier || b.score - a.score)
    .map((r) => r.item);
}
