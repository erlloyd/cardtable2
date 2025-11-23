/**
 * Simple fuzzy search implementation for filtering actions
 * Matches if all characters from query appear in text in order (case-insensitive)
 *
 * @param text Text to search in
 * @param query Search query
 * @returns Score (0-1) if match, 0 if no match. Higher = better match.
 */
export function fuzzyMatch(text: string, query: string): number {
  if (!query) return 1; // Empty query matches everything perfectly

  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  let textIndex = 0;
  let queryIndex = 0;
  let consecutiveMatches = 0;
  let score = 0;

  // Check if all query characters exist in text in order
  while (textIndex < textLower.length && queryIndex < queryLower.length) {
    if (textLower[textIndex] === queryLower[queryIndex]) {
      consecutiveMatches++;
      queryIndex++;

      // Bonus for consecutive matches
      score += 1 + consecutiveMatches * 0.5;

      // Bonus for match at word boundary
      if (textIndex === 0 || textLower[textIndex - 1] === ' ') {
        score += 2;
      }
    } else {
      consecutiveMatches = 0;
    }
    textIndex++;
  }

  // If we didn't match all query characters, no match
  if (queryIndex < queryLower.length) {
    return 0;
  }

  // Normalize score by query length and text length
  // Shorter text with same matches gets higher score
  const normalizedScore = score / (textLower.length + queryLower.length);

  return normalizedScore;
}

/**
 * Search items with fuzzy matching
 * Returns items sorted by match score (best first)
 *
 * @param items Items to search
 * @param query Search query
 * @param getText Function to extract searchable text from item
 * @returns Filtered and sorted items
 */
export function fuzzySearch<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
): T[] {
  if (!query) return items;

  const scored = items
    .map((item) => ({
      item,
      score: fuzzyMatch(getText(item), query),
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((result) => result.item);
}
