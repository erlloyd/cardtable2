import { ObjectKind } from '@cardtable2/shared';
import { createCounterMeta } from '../renderer/objects/counter/utils';

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
      // No additional required properties beyond base TableObject
      return {};

    case ObjectKind.Counter:
      // No additional required top-level properties beyond base TableObject.
      // Counter template + instance fields live inside `_meta`; see
      // `getDefaultMeta` and `createCounterMeta` for per-kind meta defaults.
      return {};
  }
}

/**
 * Get default `_meta` values for a given object kind.
 *
 * Unlike `getDefaultProperties`, these are not top-level required object
 * properties — they live inside the freeform `_meta` record. They are
 * applied at create-time only (no automatic backfill), since `_meta` is
 * kind-agnostic at the data-model layer.
 *
 * @param kind The object kind
 * @returns Default `_meta` content for the kind (empty object by default)
 */
export function getDefaultMeta(kind: ObjectKind): Record<string, unknown> {
  switch (kind) {
    case ObjectKind.Counter:
      return createCounterMeta();
    case ObjectKind.Stack:
    case ObjectKind.Token:
    case ObjectKind.Zone:
    case ObjectKind.Mat:
      return {};
  }
}

/**
 * Check if an object has all required properties for its kind.
 * Useful for validation and determining if migration is needed.
 *
 * @param obj - The object to check (must have _kind property)
 * @returns true if all required properties are present
 */
export function hasAllRequiredProperties(
  obj: Record<string, unknown>,
): boolean {
  const kind = obj._kind as ObjectKind;
  const defaults = getDefaultProperties(kind);
  return Object.keys(defaults).every((key) => key in obj);
}
