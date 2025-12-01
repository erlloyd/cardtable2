import { ObjectKind } from '@cardtable2/shared';

/**
 * Object Defaults System
 *
 * Provides default values for required properties on table objects.
 * These defaults are used for:
 * 1. Creating new objects (via createObject in YjsActions)
 * 2. Migrating old objects to ensure they have all required properties
 *
 * When adding a new required property:
 * 1. Add it to the appropriate kind's defaults here
 * 2. The migration system will automatically backfill it on existing tables
 * 3. Update createObject() to use these defaults
 */

/**
 * Get required properties with default values for each object kind.
 * These properties will be automatically added to existing objects during migration.
 *
 * @param kind - The object kind
 * @returns Object with default property values
 *
 * @example
 * const defaults = getDefaultProperties(ObjectKind.Token);
 * // Returns: { _faceUp: true }
 */
export function getDefaultProperties(
  kind: ObjectKind,
): Record<string, unknown> {
  switch (kind) {
    case ObjectKind.Stack:
      return {
        _faceUp: true, // Stacks default to face-up
        _cards: [], // Empty stack if missing
      };

    case ObjectKind.Token:
      return {
        _faceUp: true, // Tokens default to face-up
      };

    case ObjectKind.Zone:
    case ObjectKind.Mat:
    case ObjectKind.Counter:
      // No additional required properties beyond base TableObject
      return {};
  }
}

/**
 * Check if an object has all required properties for its kind.
 * Useful for validation and determining if migration is needed.
 *
 * @param obj - The object to check (as a plain object or Y.Map)
 * @param kind - The object kind
 * @returns true if all required properties are present
 */
export function hasRequiredProperties(
  obj: Record<string, unknown> | Map<string, unknown>,
  kind: ObjectKind,
): boolean {
  const defaults = getDefaultProperties(kind);
  const keys = Object.keys(defaults);

  if (obj instanceof Map) {
    return keys.every((key) => obj.has(key));
  } else {
    return keys.every((key) => key in obj);
  }
}
