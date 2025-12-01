import * as Y from 'yjs';
import { ObjectKind } from '@cardtable2/shared';
import { getDefaultProperties } from './ObjectDefaults';

/**
 * Table Schema Migrations
 *
 * Automatically upgrades table data when loading to ensure all objects
 * have required properties with sensible defaults.
 *
 * Migration Strategy:
 * - Runs automatically after Yjs document syncs
 * - Idempotent (safe to run multiple times)
 * - Uses transactions for atomicity
 * - Handles multiplayer race conditions gracefully (CRDT merges identical updates)
 * - Early exit optimization if no migration needed
 *
 * Adding New Required Properties:
 * 1. Add default to getDefaultProperties() in ObjectDefaults.ts
 * 2. Migrations will automatically backfill on next load
 */

/**
 * Run migrations on the Yjs document to ensure all objects have required properties.
 * This runs automatically after the document syncs.
 *
 * @param doc - The Yjs document
 */
export function runMigrations(doc: Y.Doc): void {
  const objectsMap = doc.getMap('objects');

  console.log(
    `[Migrations] Checking ${objectsMap.size} objects for required properties...`,
  );

  // Quick check: do we need to run migrations?
  if (!needsMigration(objectsMap)) {
    console.log('[Migrations] ✓ All objects up-to-date, skipping migration');
    return;
  }

  console.log('[Migrations] Migration needed, starting...');

  // Run migration in a single transaction for atomicity
  doc.transact(() => {
    ensureObjectDefaults(objectsMap);
  }, 'migration'); // Origin = 'migration' for debugging

  console.log('[Migrations] ✓ Migration complete');
}

/**
 * Check if any objects need migration (optimization to avoid unnecessary work).
 *
 * @param objectsMap - The objects map from Yjs doc
 * @returns true if any object is missing required properties
 */
function needsMigration(objectsMap: Y.Map<Y.Map<unknown>>): boolean {
  let needsUpdate = false;

  objectsMap.forEach((objMap) => {
    const kind = objMap.get('_kind') as ObjectKind;
    const defaults = getDefaultProperties(kind);

    // Check if any required property is missing
    for (const key of Object.keys(defaults)) {
      if (!objMap.has(key)) {
        needsUpdate = true;
        return; // Early exit from forEach
      }
    }
  });

  return needsUpdate;
}

/**
 * Ensure all objects have their required properties with defaults.
 * This is the core migration logic - idempotent and safe to run multiple times.
 *
 * @param objectsMap - The objects map from Yjs doc
 */
function ensureObjectDefaults(objectsMap: Y.Map<Y.Map<unknown>>): void {
  let migratedCount = 0;
  const migratedObjects: Array<{
    id: string;
    kind: string;
    properties: string[];
  }> = [];

  objectsMap.forEach((objMap, id) => {
    const kind = objMap.get('_kind') as ObjectKind;
    const defaults = getDefaultProperties(kind);

    const addedProperties: string[] = [];

    // Add any missing required properties
    for (const key of Object.keys(defaults)) {
      if (!objMap.has(key)) {
        const value = defaults[key];
        console.log(
          `[Migrations]   Adding ${key}=${JSON.stringify(value)} to ${kind} ${id}`,
        );
        objMap.set(key, value);
        addedProperties.push(key);
      }
    }

    if (addedProperties.length > 0) {
      migratedCount++;
      migratedObjects.push({ id, kind, properties: addedProperties });
    }
  });

  if (migratedCount > 0) {
    console.log(`[Migrations] ✓ Migrated ${migratedCount} object(s):`);
    migratedObjects.forEach(({ id, kind, properties }) => {
      console.log(
        `[Migrations]   - ${kind} ${id.substring(0, 8)}: added ${properties.join(', ')}`,
      );
    });
  } else {
    console.log('[Migrations] No objects needed migration');
  }
}

/**
 * Future: Schema version tracking
 *
 * For complex migrations that require versioned transformations
 * (not just adding missing properties), we can add:
 *
 * export const CURRENT_SCHEMA_VERSION = 2;
 *
 * const VERSIONED_MIGRATIONS = [
 *   migrateV1toV2, // Add _faceUp (handled by generic ensureDefaults)
 *   migrateV2toV3, // Future complex migration
 * ];
 *
 * This would allow running sequential migrations from old version to current.
 * For now, the generic "ensure defaults" approach handles our needs.
 */
