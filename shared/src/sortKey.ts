/**
 * SortKey utilities for z-ordering objects on the table.
 *
 * SortKeys use a recursive zero-padded segment format joined by `|`.
 * Each segment is a 6-digit zero-padded number.
 *
 * Examples:
 *   Top-level object:              "000042"
 *   Attachment (parentOnTop):      parent="000042|999999", child="000042|000003"
 *   Attachment (children on top):  parent="000042|000001", child="000042|000002"
 */

/** Number of digits in each sortKey segment. */
export const SORT_KEY_PAD = 6;

/** Sub-key used for the parent when parentOnTop is true. */
export const PARENT_ON_TOP_SUB_KEY = '999999';

/** Base key used for dragged objects, guaranteed above all normal objects. */
export const DRAG_SENTINEL_KEY = '999999';

/**
 * Format a number as a zero-padded sortKey segment.
 */
export function formatSortKey(value: number): string {
  return String(value).padStart(SORT_KEY_PAD, '0');
}

/**
 * Extract the base (first) segment from a sortKey, stripping any sub-key suffixes.
 */
export function sortKeyBase(sortKey: string): string {
  return sortKey.split('|')[0];
}

/**
 * Build a sortKey with a sub-key suffix: `baseKey|subKey`.
 */
export function sortKeyWithSub(baseKey: string, subKey: string): string {
  return `${baseKey}|${subKey}`;
}

/**
 * Parse the top-level numeric prefix from a sortKey.
 * Handles both new format ("000042", "000042|000003") and legacy base-36 format ("rs").
 */
export function parseSortKeyPrefix(sortKey: string): number {
  const firstSegment = sortKeyBase(sortKey);
  const base10 = parseInt(firstSegment, 10);
  if (Number.isFinite(base10)) return base10;
  const base36 = parseInt(firstSegment, 36);
  return Number.isFinite(base36) ? base36 : 0;
}
