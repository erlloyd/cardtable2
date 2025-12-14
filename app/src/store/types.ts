/**
 * Type definitions for Yjs store structures (M3.6-T1)
 *
 * This file contains type aliases and utilities for working with typed Y.Maps
 * instead of converting to plain objects via .toJSON().
 */

import type { TypedMap } from 'yjs-types';
import type { TableObjectProps, TableObject } from '@cardtable2/shared';

/**
 * Type alias for a typed Y.Map representing a table object.
 *
 * Usage:
 * ```typescript
 * const yMap: TableObjectYMap = store.getObjectYMap(id);
 * const kind = yMap.get('_kind'); // Type-safe property access
 * const pos = yMap.get('_pos');
 * ```
 */
export type TableObjectYMap = TypedMap<TableObjectProps>;

/**
 * Type alias for the objects map in Y.Doc.
 * Maps object ID (string) to typed Y.Map.
 *
 * Usage:
 * ```typescript
 * const objectsMap: ObjectsYMap = ydoc.getMap('objects');
 * objectsMap.forEach((yMap, id) => {
 *   const kind = yMap.get('_kind');
 *   // ... work with Y.Map directly
 * });
 * ```
 */
export type ObjectsYMap = Map<string, TableObjectYMap>;

/**
 * Converts a TableObjectYMap (typed Y.Map) to a plain TableObject.
 *
 * This centralizes the conversion logic and makes it easy to add
 * validation or debug checks in the future.
 *
 * @param yMap - The typed Y.Map to convert
 * @returns The plain TableObject representation
 *
 * @example
 * ```typescript
 * const yMap = store.getObjectYMap(id);
 * const obj = toTableObject(yMap);
 * renderer.sendMessage({ type: 'update', obj });
 * ```
 */
export function toTableObject(yMap: TableObjectYMap): TableObject {
  // TODO: Add debug checks in development mode to validate object structure
  return yMap.toJSON() as TableObject;
}
